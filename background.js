'use strict';
importScripts('usage-core.js');
const C=GPTUsageCore, LOCAL_SCOPE=C.LOCAL_SCOPE;
const LIVE_KEY='__gptLiveUsageV1', LIVE_ERROR_KEY='__gptLiveUsageErrorV1', LIVE_TREND_KEY='__gptLiveUsageTrendV1', PRO_LIVE_KEY='__gptProUsageV1', PRO_CYCLE_KEY='__gptProCycleV1';
let tail=Promise.resolve(), refreshFlight=null, repairFlight=null, lastAttempt=0;
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(()=>{});

/* Dev/update self-heal. Before injecting, ping the currently loaded tracker.
   A stale content script from an unpacked-extension reload cannot answer through
   the new runtime, so the ping fails and we safely re-inject. Normal service-worker
   wakeups leave a healthy tracker untouched. */
const TRACKER_VERSION='3.6.0.63';
async function trackerAlive(tabId){
  try{const r=await chrome.tabs.sendMessage(tabId,{type:'UG_TRACKER_PING'});return r?.ok===true&&r.version===TRACKER_VERSION;}catch{return false;}
}
function repairExistingChatTabs(){
  if(repairFlight)return repairFlight;
  repairFlight=(async()=>{
    let tabs=[];try{tabs=await chrome.tabs.query({url:['https://chatgpt.com/*']});}catch{return;}
    for(const tab of tabs){
      if(!Number.isInteger(tab.id))continue;
      if(await trackerAlive(tab.id))continue;
      try{
        await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},world:'MAIN',files:['model-observer-main.js','pro-usage-observer-main.js']});
        await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},world:'ISOLATED',files:['pro-usage-bridge.js']});
        await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},world:'ISOLATED',files:['usage-network-bridge.js']});
        await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',files:['usage-core.js','model-resolver.js','content.js']});
        await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},world:'ISOLATED',files:['sidechat/core.js','sidechat/view.js','model-resolver.js','sidechat/adapter.js']});
        // The ping is diagnostic only. A failed verification is retried on the next
        // worker wake/install/startup instead of reloading the user's ChatGPT tab.
        await trackerAlive(tab.id);
      }catch{}
    }
  })();
  return repairFlight.finally(()=>{repairFlight=null;});
}
void repairExistingChatTabs();

function authorized(sender){if(sender.id!==chrome.runtime.id)return false;try{return new URL(sender.url).origin==='https://chatgpt.com';}catch{return false;}}
function uiSender(sender){return sender.id===chrome.runtime.id&&typeof sender.url==='string'&&sender.url.startsWith(chrome.runtime.getURL(''));}
function cleanMeter(raw){raw=C.obj(raw);const used=C.percent(raw.usedPercent),remaining=C.percent(raw.remainingPercent),amount=C.nonnegative(raw.remaining),limit=C.nonnegative(raw.limit),reset=C.nonnegative(raw.resetAt),windowSeconds=C.nonnegative(raw.windowSeconds);if([used,remaining,amount,limit,reset,windowSeconds].every(v=>v===null))return null;return{id:C.text(raw.id,140),label:C.text(raw.label,80),usedPercent:used,remainingPercent:remaining,remaining:amount,limit,resetAt:reset,windowSeconds};}
function cleanLive(raw){raw=C.obj(raw);const plan=C.plans[raw.plan]?raw.plan:'',meters=(Array.isArray(raw.meters)?raw.meters:[]).map(cleanMeter).filter(Boolean).slice(0,24),cr=C.obj(raw.credits),balance=C.nonnegative(cr.balance),credits=(balance!==null||typeof cr.unlimited==='boolean')?{balance,unlimited:cr.unlimited===true}:null,updatedAt=C.nonnegative(raw.updatedAt);if(!updatedAt||updatedAt>Date.now()+60000)return null;if(!plan&&!meters.length&&!credits)return null;return{plan,planCode:C.text(raw.planCode,60),meters,credits,updatedAt};}
function cleanProLive(raw){return C.proLive(raw);}
function meterMatch(a,b){
  if(!a||!b)return false;if(a.id&&b.id&&a.id===b.id)return true;
  if(a.kind&&b.kind&&a.kind===b.kind){if(a.windowSeconds&&b.windowSeconds)return Math.abs(a.windowSeconds-b.windowSeconds)<60;return true;}
  return false;
}
function refillDetected(prev,next){
  if(!prev||!next)return false;
  if(Number.isFinite(prev.remaining)&&Number.isFinite(next.remaining)){
    const limit=next.limit||prev.limit||0,threshold=Math.max(2,limit?limit*.08:2);
    if(next.remaining-prev.remaining>=threshold)return true;
  }
  if(Number.isFinite(prev.remainingPercent)&&Number.isFinite(next.remainingPercent)&&next.remainingPercent-prev.remainingPercent>=8&&prev.remainingPercent<92)return true;
  return false;
}
async function recordProSnapshot(raw){
  const live=cleanProLive(raw);if(!live)return false;
  const stored=await chrome.storage.local.get([PRO_LIVE_KEY,PRO_CYCLE_KEY]),prior=cleanProLive(stored[PRO_LIVE_KEY]);
  const previousCycles=C.proCycles(stored[PRO_CYCLE_KEY]),cycles={...previousCycles},now=live.updatedAt||Date.now();
  for(const m of live.meters){
    const prev=prior?.meters?.find(x=>meterMatch(x,m))||null;
    const id=C.text(m.id||m.label||('pro:'+m.kind),140)||('pro:'+m.kind);
    const old=C.obj(cycles[id]);
    let c={...old,id,label:m.label||old.label||'Pro',kind:m.kind||old.kind||C.proKind(m.label),detectedResets:Number.isFinite(old.detectedResets)?old.detectedResets:0};
    const officialWindow=Number.isFinite(m.windowSeconds)&&m.windowSeconds>0?m.windowSeconds*1000:null;
    if(officialWindow){c.windowMs=officialWindow;c.confidence='official_window';}
    if(Number.isFinite(m.resetAt)&&m.resetAt>now){c.nextResetAt=m.resetAt;if(officialWindow){const start=m.resetAt-officialWindow;if(start<=now&&now-start<=officialWindow*1.05&&!Number.isFinite(c.lastResetAt))c.lastResetAt=start;}}
    const resetShift=!!(prev&&Number.isFinite(prev.resetAt)&&Number.isFinite(m.resetAt)&&m.resetAt>prev.resetAt+60000);
    const refill=refillDetected(prev,m);
    if(resetShift||refill){
      const priorReset=Number.isFinite(c.lastResetAt)?c.lastResetAt:null,diff=priorReset?now-priorReset:null;
      if(!officialWindow&&diff&&diff>=60*60*1000&&diff<=45*C.DAY)c.windowMs=diff;
      c.lastResetAt=now;c.detectedResets=(c.detectedResets||0)+1;c.confidence=officialWindow?'official_window':'learned';
      if(Number.isFinite(m.resetAt)&&m.resetAt>now)c.nextResetAt=m.resetAt;else if(Number.isFinite(c.windowMs))c.nextResetAt=now+c.windowMs;
    }
    cycles[id]=c;
  }
  await chrome.storage.local.set({[PRO_LIVE_KEY]:live,[PRO_CYCLE_KEY]:{cycles,updatedAt:now}});return true;
}
function cleanError(raw){raw=C.obj(raw);const ts=C.nonnegative(raw.ts);return{status:typeof raw.status==='number'?raw.status:C.text(raw.status,40)||'unknown',ts:ts&&ts<=Date.now()+60000?ts:Date.now()};}
function cleanTrend(raw){
  const now=Date.now(),cutoff=now-C.DAY*7;
  return (Array.isArray(raw)?raw:[]).map(v=>({ts:C.nonnegative(v?.ts),remainingPercent:C.percent(v?.remainingPercent),resetAt:C.nonnegative(v?.resetAt)}))
    .filter(v=>v.ts&&v.ts>=cutoff&&v.ts<=now+60000&&v.remainingPercent!==null).sort((a,b)=>a.ts-b.ts).slice(-160);
}
async function recordLiveTrend(snapshot){
  const primary=(snapshot?.meters||[]).find(m=>m.id==='main:primary_window')||(snapshot?.meters||[]).find(m=>String(m.id||'').endsWith('primary_window'));
  if(!primary||!Number.isFinite(primary.remainingPercent))return;
  const stored=await chrome.storage.local.get(LIVE_TREND_KEY),items=cleanTrend(stored[LIVE_TREND_KEY]);
  const next={ts:snapshot.updatedAt||Date.now(),remainingPercent:primary.remainingPercent,resetAt:primary.resetAt||null},last=items.at(-1);
  const resetChanged=last&&Number.isFinite(last.resetAt)&&Number.isFinite(next.resetAt)&&last.resetAt!==next.resetAt;
  if(last&&!resetChanged&&next.ts-last.ts<15*60*1000&&Math.abs(next.remainingPercent-last.remainingPercent)<0.1)return;
  items.push(next);await chrome.storage.local.set({[LIVE_TREND_KEY]:cleanTrend(items)});
}

chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(!msg||typeof msg.type!=='string'||!msg.type.startsWith('UG_'))return false;
  const fromUI=uiSender(sender), fromPage=authorized(sender);
  const uiTypes=new Set(['UG_STATE','UG_PREFS','UG_BASELINE','UG_IMPORT','UG_EXPORT','UG_REFRESH_LIVE']);
  const pageTypes=new Set(['UG_EVENT','UG_SERVER_USAGE','UG_PRO_SERVER_USAGE','UG_SERVER_ERROR','UG_POLL_LIVE']);
  if((uiTypes.has(msg.type)&&!fromUI)||(pageTypes.has(msg.type)&&!fromPage)){reply({ok:false,error:'unauthorized'});return false;}
  // Refresh must not join the storage queue: the selected content script sends
  // UG_SERVER_USAGE back here before it can answer UG_CAPTURE_SERVER. Queuing
  // the refresh itself would deadlock that round trip.
  if(msg.type==='UG_REFRESH_LIVE'||msg.type==='UG_POLL_LIVE'){refreshFromTabs(msg.type==='UG_REFRESH_LIVE').then(v=>reply({ok:true,...v}),()=>reply({ok:false,error:'refresh_failed'}));return true;}
  const job=tail.then(()=>handle(msg));tail=job.catch(()=>{});job.then(v=>reply({ok:true,...v}),()=>reply({ok:false,error:'storage_or_validation_error'}));return true;
});

async function load(){const stored=await chrome.storage.local.get(C.KEY),migration=C.migrateState(stored[C.KEY]);if(migration.changed)await chrome.storage.local.set({[C.KEY]:migration.state});return migration.state;}
async function save(s,extra={}){await chrome.storage.local.set({...extra,[C.KEY]:s});}
// A missing content-script bridge must not require reloading a user's chat.
// Uses existing host permission; tokens stay in this request's memory only.
async function captureInBackground(){
  async function get(path,headers={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetch('https://chatgpt.com'+path,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{accept:'application/json',...headers},signal:controller.signal});
      if(!r.ok)throw Object.assign(Error('http'),{status:r.status});
      try{return await r.json();}catch{throw Object.assign(Error('invalid'),{status:'invalid-response'});}
    }finally{clearTimeout(timer);}
  }
  let token='';
  try{
    const session=await get('/api/auth/session');
    token=C.text(session?.accessToken||session?.access_token||session?.session?.accessToken,8000);
    if(!token)throw Object.assign(Error('auth'),{status:401});
    const snapshot=cleanLive(C.normalizeWham(await get('/backend-api/wham/usage',{authorization:`Bearer ${token}`})));
    if(!snapshot)throw Object.assign(Error('invalid'),{status:'invalid-response'});
    await chrome.storage.local.set({[LIVE_KEY]:snapshot,[LIVE_ERROR_KEY]:null});
    await recordLiveTrend(snapshot);
    return {refreshed:true,status:'ok',source:'session'};
  }catch(e){
    const status=e.name==='AbortError'?'timeout':e.status||'network-error';
    const prior=await chrome.storage.local.get(LIVE_ERROR_KEY);
    await chrome.storage.local.set({[LIVE_ERROR_KEY]:{status,ts:Date.now(),failures:Math.min(7,(prior[LIVE_ERROR_KEY]?.failures||0)+1)}});
    return {refreshed:false,status};
  }finally{token='';}
}
function captureTab(id,manual){
  let timer;
  // Do not start a second network path after an unresponsive in-flight capture.
  return Promise.race([chrome.tabs.sendMessage(id,{type:'UG_CAPTURE_SERVER',manual}),new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,status:'timeout'}),22000);})]).finally(()=>clearTimeout(timer));
}
async function refreshFromTabs(manual=false){
  if(refreshFlight)return refreshFlight;
  refreshFlight=(async()=>{
    const data=await chrome.storage.local.get([LIVE_KEY,LIVE_ERROR_KEY]);
    const error=data[LIVE_ERROR_KEY],live=data[LIVE_KEY],now=Date.now();
    const failed=error&&error.ts>=(live?.updatedAt||0);
    const wait=failed?Math.min(1800000,30000*2**Math.min(6,(error.failures||1)-1)):(manual?10000:300000);
    const last=Math.max(lastAttempt,failed?error.ts:live?.updatedAt||0);
    if(last&&now-last<wait)return {refreshed:false,status:'backoff',retryAt:last+wait,current:!failed&&!!live&&now-live.updatedAt<10000,cause:failed?error.status:undefined};
    const tabs=await chrome.tabs.query({url:['https://chatgpt.com/*']});
    tabs.sort((a,b)=>(Number(b.active)-Number(a.active))||((b.lastAccessed||0)-(a.lastAccessed||0)));
    let lastStatus=tabs.length?'page-not-ready':'no-responsive-tab';
    for(const tab of tabs){
      if(!Number.isInteger(tab.id))continue;
      try{const r=await captureTab(tab.id,manual);
        if(r?.status==='hidden'){lastStatus='hidden';continue;}
        if(!r||r.status==='page-not-ready'){lastStatus='page-not-ready';continue;}
        // Old bridges may retain a stale bootstrap token. Renew the session once.
        if(manual&&!r.sessionRenewed&&(r.status===401||r.status===403)){lastAttempt=Date.now();return await captureInBackground();}
        lastAttempt=Date.now();return {refreshed:!!r?.ok,status:r?.status||'page-not-ready'};
      }catch{lastStatus='page-not-ready';}
    }
    if(manual){lastAttempt=Date.now();return await captureInBackground();}
    return {refreshed:false,status:lastStatus};
  })();
  try{return await refreshFlight;}finally{refreshFlight=null;}
}
chrome.runtime.onInstalled.addListener(()=>{void load().catch(()=>{});void repairExistingChatTabs();});
chrome.runtime.onStartup.addListener(()=>{void load().catch(()=>{});void repairExistingChatTabs();});


function activitySummary(all,state){
  const now=new Date(),todayKey=C.localDate(now),today=C.entry(all[todayKey]);
  const bins=Array(24).fill(0);
  for(const ts of today.timestamps){const d=new Date(ts);if(C.localDate(d)===todayKey)bins[d.getHours()]++;}
  const firstDay=Object.keys(all).filter(k=>C.dateFromKey(k)&&k<=todayKey).sort()[0];
  const start=new Date(Math.min(state.coverageStart||Date.now(),firstDay?C.dateFromKey(firstDay).getTime():Date.now()));start.setHours(0,0,0,0);
  let total=0,days=0;
  for(let i=1;i<=7;i++){const d=new Date(now);d.setHours(0,0,0,0);d.setDate(d.getDate()-i);if(d<start)continue;total+=C.entry(all[C.localDate(d)]).count;days++;}
  const last7=[];for(let i=6;i>=0;i--){const d=new Date(now);d.setHours(0,0,0,0);d.setDate(d.getDate()-i);last7.push(C.entry(all[C.localDate(d)]).count);}return{todayHours:bins,avg7:days?total/days:null,last7};
}

async function handle(m){
  const s=await load();
  if(m.type==='UG_EVENT'){const e=C.event({...C.obj(m.event),scope:LOCAL_SCOPE});if(!e)throw Error();const priorIndex=s.events.findIndex(v=>v.id===e.id);if(priorIndex>=0){const prior=s.events[priorIndex],better={...prior};if(!prior.model&&e.model)better.model=e.model;if(!prior.effort&&e.effort)better.effort=e.effort;if(!prior.tier&&e.tier)better.tier=e.tier;if((!prior.modelSource||prior.modelSource==='unknown')&&e.modelSource)better.modelSource=e.modelSource;better.kind=C.classify(better.model,better.effort,better.tier);if(JSON.stringify(better)!==JSON.stringify(prior)){s.events[priorIndex]=better;await save(s);}return{duplicate:true,enriched:true};}s.events.push(e);if(s.events.length>10000){const removed=s.events.splice(0,s.events.length-10000);s.coverageStart=Math.max(s.coverageStart,removed.at(-1).ts);}const key=C.localDate(e.ts),v=await chrome.storage.local.get(key),raw=C.entry(v[key]),day={...C.obj(v[key]),count:raw.count+1,timestamps:[...raw.timestamps,e.ts]};await save(s,{[key]:day});return{};}
  if(m.type==='UG_SERVER_USAGE'){const live=cleanLive(m.snapshot);if(!live)throw Error();await chrome.storage.local.set({[LIVE_KEY]:live,[LIVE_ERROR_KEY]:null});await recordLiveTrend(live);return{};}
  if(m.type==='UG_PRO_SERVER_USAGE'){if(!await recordProSnapshot(m.snapshot))throw Error();return{};}
  if(m.type==='UG_SERVER_ERROR'){const prior=await chrome.storage.local.get(LIVE_ERROR_KEY);await chrome.storage.local.set({[LIVE_ERROR_KEY]:{...cleanError(m.error),failures:Math.min(7,(prior[LIVE_ERROR_KEY]?.failures||0)+1)}});return{};}
  if(m.type==='UG_STATE'){const all=await chrome.storage.local.get(null),extra={ [LIVE_KEY]:all[LIVE_KEY], [LIVE_ERROR_KEY]:all[LIVE_ERROR_KEY], [PRO_LIVE_KEY]:all[PRO_LIVE_KEY], [PRO_CYCLE_KEY]:all[PRO_CYCLE_KEY] };return{state:s,scope:LOCAL_SCOPE,stats:C.stats(all),activity:activitySummary(all,s),codexTrend:cleanTrend(all[LIVE_TREND_KEY]),storageSchema:C.STATE_SCHEMA,liveUsage:cleanLive(extra[LIVE_KEY]),liveError:extra[LIVE_ERROR_KEY]||null,proUsage:cleanProLive(extra[PRO_LIVE_KEY]),proCycles:{cycles:C.proCycles(extra[PRO_CYCLE_KEY]),updatedAt:C.nonnegative(C.obj(extra[PRO_CYCLE_KEY]).updatedAt)}};}
  if(m.type==='UG_PREFS'){if(m.plan!=='auto'&&!C.plans[m.plan])throw Error();s.settings[LOCAL_SCOPE]={...C.obj(s.settings[LOCAL_SCOPE]),plan:m.plan};await save(s);return{};}
  if(m.type==='UG_BASELINE'){const rule=C.plans[m.plan]?.rules?.find(r=>r.id===m.rule);if(!rule)throw Error();const prefs=C.obj(s.settings[LOCAL_SCOPE]),baselines={...C.obj(prefs.baselines)};if(m.clear)delete baselines[rule.id];else{if(!Number.isInteger(m.used)||m.used<0||m.used>rule.cap||!Number.isFinite(m.resetAt)||m.resetAt<=Date.now()||m.resetAt>Date.now()+C.DAY*400)throw Error();baselines[rule.id]={plan:m.plan,cap:rule.cap,used:m.used,at:Date.now(),resetAt:m.resetAt};}s.settings[LOCAL_SCOPE]={...prefs,baselines};await save(s);return{};}
  if(m.type==='UG_IMPORT'){const meta=C.obj(C.obj(m.payload).meta);if(meta.version!==undefined&&(!Number.isInteger(meta.version)||meta.version<1||meta.version>5))throw Error('unsupported_export_version');if(meta.kind&&meta.kind!=='activity-backup')throw Error('unsupported_backup_kind');const input=C.obj(C.obj(m.payload).data||m.payload),current=await chrome.storage.local.get(null),updates={};let count=0;for(const [key,value]of Object.entries(input)){if(!C.dateFromKey(key))continue;const v=C.obj(value);if(!(typeof value==='number'&&Number.isInteger(value)&&value>=0)&&!Array.isArray(value)&&!(Object.hasOwn(v,'count')||Array.isArray(v.timestamps)))throw Error('invalid_day');if(Object.hasOwn(v,'count')&&(!Number.isInteger(v.count)||v.count<0))throw Error('invalid_count');const times=Array.isArray(value)?value:v.timestamps;if(times!==undefined&&(!Array.isArray(times)||times.some(ts=>typeof ts!=='number'||!Number.isFinite(ts)||ts<=946684800000||ts>=4133980800000)))throw Error('invalid_timestamps');const e=C.entry(value);if(e.count>10000000||e.timestamps.length>100000)throw Error();updates[key]={...C.obj(current[key]),...C.mergeEntry(current[key],e)};count++;}if(!count)throw Error();await chrome.storage.local.set(updates);return{days:count};}
  if(m.type==='UG_EXPORT'){const all=await chrome.storage.local.get(null),data={};for(const [k,v]of Object.entries(all))if(C.dateFromKey(k))data[k]=C.entry(v);return{payload:{meta:{version:5,appVersion:C.APP_VERSION,storageSchema:C.STATE_SCHEMA,exportedAt:new Date().toISOString(),kind:'activity-backup'},data}};}
  throw Error('unknown_message');
}

// Optional Side Chat module. Usage remains available if its initialization fails.
try { importScripts('sidechat/core.js', 'sidechat/worker.js'); } catch (error) { console.warn('[SakuraMeter Side Chat] initialization failed', error); }
importScripts('reset-notifications-core.js','reset-notifications-worker.js');
