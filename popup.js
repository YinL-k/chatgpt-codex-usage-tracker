(()=>{
'use strict';
const C=GPTUsageCore,SCOPE=C.LOCAL_SCOPE;
const t=(key,fallback)=>window.GPTTrackerI18n?.t(key,fallback)||fallback||key;
const send=message=>chrome.runtime.sendMessage(message).catch(()=>({ok:false,error:'extension_reloaded'}));
const $=id=>document.getElementById(id);
const TRUST_KINDS=['live','cached','stale','unavailable','estimated','tracking','calibrated','error'];
let state=C.freshState(),stats={today:0,week:0,month:0,total:0},activity={todayHours:Array(24).fill(0),avg7:null,last7:Array(7).fill(0)},codexTrend=[],live=null,liveError=null,proUsage=null,proCycles=null,refreshing=false;
const RESET_FORECAST_KEY='gptTrackerResetForecastV1';
let resetForecast=null,resetForecastFetched=0,resetForecastState='unavailable',resetForecastBusy=false;

function fmt(n){return Number.isFinite(n)?new Intl.NumberFormat(document.documentElement.lang).format(n):'—';}
function formatShortDate(ts){if(!Number.isFinite(ts))return '';return new Date(ts).toLocaleString(document.documentElement.lang,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function formatSince(ts){if(!Number.isFinite(ts))return '';return new Date(ts).toLocaleDateString(document.documentElement.lang,{month:'short',day:'numeric'});}
function setText(id,value=''){const el=$(id);if(el)el.textContent=value;}
function setTrust(el,kind,label){if(!el)return;el.classList.remove(...TRUST_KINDS);el.classList.add(kind);const labelEl=el.querySelector('.trust-label');if(labelEl)labelEl.textContent=label;else el.textContent=label;}
function manualPlan(){const p=C.obj(state.settings[SCOPE]).plan||'auto';return p==='auto'?'':p;}
function selectedPlan(){return manualPlan()||live?.plan||'';}
function planHasNoPro(planKey){const plan=C.plans[planKey];return !!plan&&Array.isArray(plan.rules)&&plan.rules.length===0;}
function freshLabel(kind){if(kind==='error')return t('trust_error');return kind==='live'?t('trust_live','Live'):kind==='cached'?t('trust_cached','Cached'):kind==='stale'?t('trust_stale','Stale'):t('trust_unavailable','Unavailable');}
function meter(id){return live?.meters?.find(m=>m.id===id)||null;}
function readResetForecastCache(){
  const api=window.GPTResetForecast;if(!api)return;
  try{
    const c=JSON.parse(localStorage.getItem(RESET_FORECAST_KEY)||'null'),d=c&&typeof c==='object'?c.data:null;
    if(c?.version!==1||!d||!Number.isFinite(c.fetched))return;
    resetForecast=api.normalize({updated_at:new Date(d.updated).toISOString(),last_reset_at:Number.isFinite(d.last)?new Date(d.last).toISOString():null,probabilities:{rounded_24h:d.h24,rounded_48h:d.h48},confidence:d.confidence});
    resetForecast.signal=['none','hint','watch','expired'].includes(d.signal)?d.signal:'none';
    resetForecastFetched=c.fetched;
    resetForecastState=Date.now()-resetForecast.updated>api.STALE?'stale':Date.now()-resetForecastFetched<60000?'live':'cached';
  }catch{/* Invalid shared dashboard cache is ignored. */}
}
function saveResetForecastCache(data){
  try{localStorage.setItem(RESET_FORECAST_KEY,JSON.stringify({version:1,data,fetched:Date.now(),next:Date.now()+(window.GPTResetForecast?.INTERVAL||900000),failures:0,error:false}));}catch{/* Popup can still render the live result. */}
}
function renderResetForecast(){
  const box=$('codexResetOutlook'),h24=resetForecast?.h24,h48=resetForecast?.h48;
  if(box){
    box.dataset.state=resetForecastState;
    setText('legacyCodexReset24',Number.isFinite(h24)?`${fmt(h24)}%`:'—');
    setText('legacyCodexReset48',Number.isFinite(h48)?`${fmt(h48)}%`:'—');
    const b24=$('legacyCodexResetBar24'),b48=$('legacyCodexResetBar48');if(b24)b24.style.width=`${Number.isFinite(h24)?Math.max(0,Math.min(100,h24)):0}%`;if(b48)b48.style.width=`${Number.isFinite(h48)?Math.max(0,Math.min(100,h48)):0}%`;
  }
  const third=t('rf_badge','Third-party forecast');
  const status=resetForecastBusy?`${third} · ${t('rf_loading','Loading')}`:resetForecastState==='stale'?`${third} · ${t('rf_stale','Stale')}`:resetForecastState==='cached'?`${third} · ${t('rf_cached','Cached')}`:resetForecastState==='error'?`${third} · ${t('rf_error','Unavailable')}`:third;
  setText('legacyCodexResetForecastStatus',status);
  setText('proReset24Large',Number.isFinite(h24)?fmt(h24):'—');
  setText('proReset48Large',Number.isFinite(h48)?fmt(h48):'—');
  const pb24=$('proResetBar24Large'),pb48=$('proResetBar48Large');if(pb24)pb24.style.width=`${Number.isFinite(h24)?Math.max(0,Math.min(100,h24)):0}%`;if(pb48)pb48.style.width=`${Number.isFinite(h48)?Math.max(0,Math.min(100,h48)):0}%`;
  setText('proResetForecastMeta',status);
  const proCard=document.querySelector('.pro');
  if(proCard?.classList.contains('is-reset-forecast')){
    const trust=$('proTrust');
    setTrust(trust,resetForecastState==='live'?'live':resetForecastState==='error'?'unavailable':'estimated',t('popup_forecast','Forecast'));
  }
}
async function refreshResetForecast(){
  const api=window.GPTResetForecast;if(!api||resetForecastBusy)return;
  readResetForecastCache();renderResetForecast();
  if(resetForecastFetched&&Date.now()-resetForecastFetched<api.INTERVAL)return;
  resetForecastBusy=true;renderResetForecast();
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const res=await fetch(api.ENDPOINT,{method:'GET',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
      if(!res.ok)throw new Error(`http_${res.status}`);
      const data=api.normalize(await res.json());resetForecast=data;resetForecastFetched=Date.now();resetForecastState='live';
      saveResetForecastCache(data);
    }finally{clearTimeout(timer);}
  }catch{resetForecastState=resetForecast?'cached':'error';}
  finally{resetForecastBusy=false;renderResetForecast();}
}
function sparkPath(values){
  const nums=(Array.isArray(values)?values:[]).map(Number).filter(Number.isFinite);
  if(nums.length<2)return '';
  const min=Math.min(...nums),max=Math.max(...nums),range=max-min||1,w=68,h=20,x0=2,y0=4;
  return nums.map((v,i)=>`${i?'L':'M'}${(x0+i*(w/(nums.length-1))).toFixed(1)} ${(y0+h-(v-min)/range*h).toFixed(1)}`).join(' ');
}
function renderTrend(buttonId,pathId,values,label){
  const button=$(buttonId),path=$(pathId);if(!button||!path)return;
  const nums=(Array.isArray(values)?values:[]).map(Number).filter(Number.isFinite),d=sparkPath(nums);
  path.setAttribute('d',d);button.dataset.empty=String(!d);button.title=label;
}
function renderMiniTrends(){
  const proValues=Array.isArray(activity?.last7)?activity.last7:[];
  renderTrend('openProDetails','proTrendPath',proValues,t('compact_7d_activity_trend','7-day activity trend'));
}

function mainTrendPath(values){
  const nums=(Array.isArray(values)?values:[]).map(Number).filter(Number.isFinite);
  if(nums.length<2)return {line:'',area:'',points:[]};
  const w=700,h=118,pad=8,min=Math.min(...nums),max=Math.max(...nums),range=max-min||1;
  const points=nums.map((v,i)=>({x:pad+i*((w-pad*2)/(nums.length-1)),y:pad+(h-pad*2)-(v-min)/range*(h-pad*2),v}));
  const line=points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area=`${line} L${points.at(-1).x.toFixed(1)} ${h} L${points[0].x.toFixed(1)} ${h} Z`;
  return {line,area,points};
}
function renderMainTrend(){
  const values=Array.isArray(activity?.last7)?activity.last7:[];
  const shape=mainTrendPath(values),line=$('usageTrendPath'),area=$('usageTrendArea'),dots=$('usageTrendDots');
  if(line)line.setAttribute('d',shape.line);
  if(area)area.setAttribute('d',shape.area);
  if(dots){dots.textContent='';shape.points.forEach((p,i)=>{if(i!==shape.points.length-1&&i!==Math.max(0,shape.points.length-2))return;const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('class','trend-main-dot');c.setAttribute('cx',p.x.toFixed(1));c.setAttribute('cy',p.y.toFixed(1));c.setAttribute('r',i===shape.points.length-1?'4':'3');dots.append(c);});}
  setText('usageTrendToday',fmt(Number(stats.today)||0));
  const avg=Number(activity?.avg7),today=Number(stats.today)||0,delta=$('usageTrendDelta');
  if(delta){
    if(Number.isFinite(avg)&&avg>0){const pct=Math.round(((today-avg)/avg)*100);delta.textContent=`${pct>0?'+':''}${pct}% ${t('compact_vs_7d_avg','vs 7-day avg')}`;}
    else delta.textContent=t('compact_7d_activity_trend','7-day activity trend');
  }
}

function setProgress(id,pct,labelId){
  const track=$(id),fill=track?.querySelector('.progress-fill');if(!track||!fill)return;
  const label=$(labelId);
  if(!Number.isFinite(pct)){fill.style.width='0%';track.setAttribute('aria-disabled','true');track.removeAttribute('aria-valuenow');if(label)label.textContent='';return;}
  const clean=Math.max(0,Math.min(100,pct));fill.style.width=`${clean}%`;track.removeAttribute('aria-disabled');track.setAttribute('aria-valuenow',String(clean));if(label)label.textContent=`${fmt(clean)}%`;
}
function renderPlanStatus(freshness){
  const b=$('planTrust');if(!b)return;
  if(refreshing){b.disabled=true;b.classList.add('is-refreshing');setTrust(b,'cached',t('refresh_refreshing','Refreshing…'));return;}
  b.classList.remove('is-refreshing');
  if(freshness.kind==='live'){b.disabled=true;setTrust(b,'live',t('trust_live','Live'));b.title=t('compact_server_reported','Reported by ChatGPT');return;}
  b.disabled=false;
  if(freshness.kind==='error'){setTrust(b,'error',t('trust_error'));b.title=t('error_cached');return;}
  if(freshness.kind==='cached'){setTrust(b,'cached',`${t('trust_cached','Cached')} ↻`);b.title=t('refresh_action','Refresh');return;}
  if(freshness.kind==='stale'){setTrust(b,'stale',`${t('trust_stale','Stale')} ↻`);b.title=t('refresh_action','Refresh');return;}
  setTrust(b,'unavailable',`${t('refresh_retry','Retry')} ↻`);b.title=t('refresh_retry','Retry');
}
function renderLocal(){
  const today=Number(stats.today)||0,week=Number(stats.week)||0,avg=Number(activity?.avg7);
  setText('compactToday',fmt(today));setText('compactWeek',fmt(week));
  setText('todayCaption',today?`${fmt(today)} ${t('popup_messages_tracked','messages tracked')}`:t('popup_no_usage','No usage yet'));
  setText('weekCaption',week?`${fmt(week)} ${t('popup_messages_tracked','messages tracked')}`:t('popup_still_quiet','Still quiet'));
  if(today===0){setText('compactActivityContext',t('popup_keeping_light','Keeping it light'));setText('activityContextCaption',t('popup_essentials','Just the essentials.'));return;}
  if(Number.isFinite(avg)&&avg>0){const pct=Math.round(((today-avg)/avg)*100),sign=pct>0?'+':'';setText('compactActivityContext',`${sign}${pct}% ${t('compact_vs_7d_avg','vs 7-day avg')}`);setText('activityContextCaption',`${fmt(week)} ${t('compact_this_week','this week')}`);return;}
  setText('compactActivityContext',`${fmt(today)} ${t('compact_messages','messages')}`);setText('activityContextCaption',`${fmt(week)} ${t('compact_this_week','this week')}`);
}
function setProForecastMode(enabled){
  const card=document.querySelector('.pro'),forecast=$('proResetForecast'),title=$('pro-title'),trust=$('proTrust');
  if(!card||!forecast||!title)return;
  card.classList.toggle('is-reset-forecast',enabled);
  forecast.setAttribute('aria-hidden',String(!enabled));
  // In no-Pro mode this card is a neutral reset forecast, not a second Codex-branded card.
  title.textContent=enabled?t('popup_forecast','Forecast'):'Pro';
  const action=$('openProDetails');
  if(action){
    action.hidden=enabled;
    action.setAttribute('aria-label',enabled?t('popup_forecast','Forecast'):t('open_pro','Open Pro usage details'));
  }
  if(enabled){
    setTrust(trust,resetForecastState==='live'?'live':resetForecastState==='error'?'unavailable':'estimated',t('popup_forecast','Forecast'));
  }
}
function render(){
  const freshness=C.liveStatus(live,liveError),planKey=selectedPlan(),plan=C.plans[planKey],noPro=planHasNoPro(planKey);
  setProForecastMode(noPro);
  if(freshness.kind==='live')GPTFeedback.clearRefreshNotice(live.updatedAt);
  setText('compactPlan',plan?.label||t('u_unknown','Not identified yet'));
  if(manualPlan()){
    setText('compactStatus',t('first_manual_plan','Using a manual plan override from Dashboard settings.'));
    const b=$('planTrust');b.disabled=true;setTrust(b,'tracking',t('compact_local','Local'));
  }else if(live?.plan){
    setText('compactStatus',t('popup_detected_source'));renderPlanStatus(freshness);
  }else{
    setText('compactStatus',t('first_no_tab','Open ChatGPT to connect automatically.'));renderPlanStatus(liveError?{kind:'error'}:{kind:'unavailable'});
  }
  renderLocal();renderMiniTrends();renderMainTrend();renderResetForecast();
  let saved=$('popupCacheNote');
  if(!saved){saved=document.createElement('p');saved.id='popupCacheNote';saved.className='popup-cache-note';saved.setAttribute('role','status');document.querySelector('.codex .card-bottom').append(saved);}
  saved.textContent=GPTFeedback.savedUsage(live,freshness.kind);saved.hidden=true;const badge=$('codexTrust');badge.dataset.cacheTip=saved.textContent;badge.tabIndex=0;
  document.querySelector('.codex').classList.remove('has-saved-data');

  const resetPro=()=>{setText('proPrimary','—');setText('proSuffix','');setText('proTrackingText','');setText('proResetText','');setProgress('proProgress',null,'proPercentLabel');};
  if(noPro){
    resetPro();
    renderResetForecast();
  }else{
    const proRules=C.proAllowances(state,SCOPE,planKey,proUsage,proCycles),rule=C.proPrimary(proRules);
    if(rule){
      const hasRemaining=Number.isFinite(rule.remaining),hasPct=Number.isFinite(rule.remainingPercent),hasCap=Number.isFinite(rule.cap)&&rule.cap>0;
      if(hasRemaining){setText('proPrimary',`${rule.mode==='official'?'':'≈ '}${fmt(rule.remaining)}`);setText('proSuffix',hasCap?`/ ${fmt(rule.cap)} ${t('popup_left','left')}`:t('popup_left','left'));setProgress('proProgress',hasPct?rule.remainingPercent:hasCap?100*Math.max(0,rule.remaining)/rule.cap:null,'proPercentLabel');}
      else if(hasPct){setText('proPrimary',`${fmt(rule.remainingPercent)}%`);setText('proSuffix',t('popup_left','left'));setProgress('proProgress',rule.remainingPercent,'proPercentLabel');}
      else{
        const observed=Math.max(0,Number(rule.observed)||0);
        setText('proPrimary',fmt(observed));setText('proSuffix',t('compact_used','used'));
        const localRemainingPct=hasCap?100*Math.max(0,rule.cap-observed)/rule.cap:null;
        setProgress('proProgress',localRemainingPct,'proPercentLabel');
      }
      if(rule.mode==='official'){setText('proTrackingText',t('pro_reported','Reported by ChatGPT'));setText('proResetText',Number.isFinite(rule.resetAt)?`${t('compact_resets','Resets')} ${formatShortDate(rule.resetAt)}`:t('reset_unknown','Reset not reported'));const pf=C.freshness(proUsage?.updatedAt,Date.now(),5*60*1000,60*60*1000);setTrust($('proTrust'),pf.kind,pf.kind==='live'?t('trust_live','Live'):pf.kind==='cached'?t('trust_cached','Cached'):t('compact_server_reported','Reported'));}
      else if(rule.mode==='learned'){setText('proTrackingText',t('pro_learned_short','Learned cycle + local sends'));setText('proResetText',Number.isFinite(rule.resetAt)?`${t('compact_resets','Resets')} ${formatShortDate(rule.resetAt)}`:t('pro_learning_cycle','Learning reset cycle'));setTrust($('proTrust'),'estimated',t('trust_estimated','Estimated'));}
      else if(rule.mode==='manual'){setText('proTrackingText',t('pro_corrected_short','Corrected in Advanced'));setText('proResetText',Number.isFinite(rule.resetAt)?`${t('compact_resets','Resets')} ${formatShortDate(rule.resetAt)}`:'');setTrust($('proTrust'),'estimated',t('trust_estimated','Estimated'));}
      else{setText('proTrackingText',`${t('compact_tracking_since','Tracking since')} ${formatSince(state.coverageStart)}`);setText('proResetText',rule.allowancePending?t('pro_allowance_pending'):t('pro_learning_cycle','Learning reset cycle'));setTrust($('proTrust'),'tracking',t('trust_tracking','Tracking'));}
    }else if(!plan){resetPro();setText('proTrackingText',t('compact_plan_unknown','Plan not identified'));setTrust($('proTrust'),'unavailable',t('trust_unavailable','Unavailable'));}
    else if(plan.rules===null){resetPro();setText('proTrackingText',t('pro_waiting_metadata','Tracking Pro sends · waiting for reset metadata'));setTrust($('proTrust'),'tracking',t('trust_tracking','Tracking'));}
    else{resetPro();setText('proTrackingText',t('compact_no_data','No data yet'));setTrust($('proTrust'),'tracking',t('trust_tracking','Tracking'));}
  }

  const primary=meter('main:primary_window');
  const codexTitle=$('codex-title');codexTitle.textContent='Codex';
  const duration=document.createElement('span');duration.className='window-duration';duration.dataset.known=String(Number.isFinite(primary?.windowSeconds)&&primary.windowSeconds>0);duration.textContent=` · ${C.windowLabel(primary?.windowSeconds,document.documentElement.lang)}`;codexTitle.append(duration);codexTitle.title=codexTitle.textContent;
  if(primary&&Number.isFinite(primary.remainingPercent)){
    setText('codexPrimary',fmt(primary.remainingPercent));setText('codexUnit','%');setText('codexSuffix',t('u_remaining','remaining'));setProgress('codexProgress',primary.remainingPercent,'codexPercentLabel');
    setText('codexResetText',primary.resetAt?`${t('compact_resets','Resets')} ${formatShortDate(primary.resetAt)}`:t('compact_server_reported','Reported by ChatGPT'));
    setTrust($('codexTrust'),freshness.kind,freshLabel(freshness.kind));
  }else{
    setText('codexPrimary','—');setText('codexUnit','');setText('codexSuffix','');setText('codexResetText',t('compact_no_server','No live server meter'));setProgress('codexProgress',null,'codexPercentLabel');setTrust($('codexTrust'),liveError?'error':'unavailable',freshLabel(liveError?'error':'unavailable'));
  }
}
async function load({refresh=false}={}){const r=await send({type:'UG_STATE'});if(r.ok){state=C.state(r.state);stats=r.stats||stats;activity=r.activity||activity;codexTrend=Array.isArray(r.codexTrend)?r.codexTrend:codexTrend;live=r.liveUsage||null;liveError=r.liveError||null;proUsage=r.proUsage||null;proCycles=r.proCycles||null;}else GPTFeedback.status(t('state_error'),true);render();if(refresh&&(!live||C.freshness(live.updatedAt).kind!=='live'))void refreshLive();}
async function refreshLive(){
  if(refreshing)return;
  const b=$('planTrust');if(!b)return;
  refreshing=true;GPTFeedback.busy(true);renderPlanStatus(C.liveStatus(live,liveError));
  try{
    const r=await send({type:'UG_REFRESH_LIVE'});
    if(!r.refreshed)GPTFeedback.refreshStatus(r);else GPTFeedback.clearRefreshNotice();
    await load();
  }finally{refreshing=false;GPTFeedback.busy(false);render();}
}
function openDashboard(hash='overview'){chrome.tabs.create({url:chrome.runtime.getURL(`heatmap.html#${hash}`)});}
function syncLanguageButtons(lang){document.querySelectorAll('[data-language]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.language===lang)));}
function applyPopupTheme(theme){theme=theme==='light'?'light':'dark';const artboard=$('artboard'),toggle=$('popupThemeToggle');if(artboard)artboard.dataset.theme=theme;document.body.dataset.popupTheme=theme;document.dispatchEvent(new CustomEvent('gpt-popup-theme-changed'));if(toggle){toggle.setAttribute('aria-checked',String(theme==='dark'));toggle.setAttribute('aria-label',theme==='dark'?t('tooltip_switch_to_light'):t('tooltip_switch_to_dark'));}localStorage.setItem('gptTrackerTheme',theme);}
function fitReference(heightLimit=630){const viewport=$('viewport'),artboard=$('artboard');if(!viewport||!artboard)return;const scale=Math.min(374/941,Math.min(heightLimit,Math.max(240,screen.availHeight-80))/1610);artboard.style.setProperty('--scale',String(scale));viewport.style.width=`${941*scale}px`;viewport.style.height=`${1610*scale}px`;document.documentElement.style.width=document.body.style.width=viewport.style.width;document.documentElement.style.height=document.body.style.height=viewport.style.height;}

document.addEventListener('DOMContentLoaded',async()=>{
  fitReference();
  // Native popup hosts may clamp the requested height; keep the footer reachable.
  window.addEventListener('resize',()=>{if(innerHeight>0&&innerHeight+1<parseFloat($('viewport').style.height))fitReference(innerHeight);});
  const prefersDark=window.matchMedia?.('(prefers-color-scheme: dark)').matches!==false;applyPopupTheme(localStorage.getItem('gptTrackerTheme')||(prefersDark?'dark':'light'));
  $('popupThemeToggle')?.addEventListener('click',()=>applyPopupTheme($('artboard').dataset.theme==='dark'?'light':'dark'));
  const langPref=await chrome.storage.sync.get('gptTrackerLang'),lang=langPref.gptTrackerLang||((navigator.language||'').toLowerCase().startsWith('zh')?'zh':'en');
  await window.GPTTrackerI18n.initI18n(lang);syncLanguageButtons(lang);
  document.querySelectorAll('[data-language]').forEach(btn=>btn.addEventListener('click',async()=>{const next=btn.dataset.language;await chrome.storage.sync.set({gptTrackerLang:next});await window.GPTTrackerI18n.initI18n(next);syncLanguageButtons(next);render();}));
  $('openDashboard')?.addEventListener('click',()=>openDashboard('overview'));
  $('openProDetails')?.addEventListener('click',()=>openDashboard(planHasNoPro(selectedPlan())?'overview':'usage'));
  $('openCodexDetails')?.addEventListener('click',()=>openDashboard('usage'));
  $('openCodexReset')?.addEventListener('click',()=>openDashboard('overview'));
  $('openActivityDetails')?.addEventListener('click',()=>openDashboard('activity'));
  $('planTrust')?.addEventListener('click',()=>void refreshLive());
  document.addEventListener('gpt-notice-retry',()=>void refreshLive());
  document.addEventListener('gpt-language-changed',()=>{render();applyPopupTheme($('artboard').dataset.theme);});
  window.addEventListener('storage',e=>{if(e.key==='gptTrackerTheme')applyPopupTheme(e.newValue);});
  setInterval(()=>{if(!document.hidden)render();},30000);
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='sync'&&changes.gptTrackerLang){void GPTTrackerI18n.initI18n(changes.gptTrackerLang.newValue).then(()=>syncLanguageButtons(GPTTrackerI18n.currentLang));}if(area==='local'&&(changes[C.KEY]||changes.__gptLiveUsageV1||changes.__gptLiveUsageErrorV1||changes.__gptProUsageV1||changes.__gptProCycleV1||Object.keys(changes).some(C.dateFromKey)))void load();});
  readResetForecastCache();renderResetForecast();void refreshResetForecast();
  await load({refresh:true});
});
})();
