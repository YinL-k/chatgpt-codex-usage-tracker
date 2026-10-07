/* Shared, dependency-free validation and calculations. No network or storage. */
(function(root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else Object.defineProperty(root, 'GPTUsageCore', { value: core, configurable: true });
})(globalThis, function() {
  'use strict';
  const KEY = '__gptUsageV4';
  const STATE_SCHEMA = 3;
  const APP_VERSION = '3.6.0.62';
  const LOCAL_SCOPE = 's_' + '0'.repeat(40);
  const DAY = 86400000;
  const VERIFIED = '2026-09-22';
  const SOURCE = 'https://help.openai.com/en/articles/20001354';
  const plans = {
    free: {label:'Free',rules:[]}, go:{label:'Go',rules:[]}, plus:{label:'Plus',rules:[]},
    pro100:{label:'Pro $100 / 5x',rules:[{id:'shared_week',cap:50,period:'week',kind:'all_pro'}]},
    pro200:{label:'Pro $200 / 20x',rules:[{id:'astra_week',cap:200,period:'week',kind:'gpt6_pro'},{id:'sol_day',cap:170,period:'day',kind:'sol_pro'},{id:'combined_day',cap:200,period:'day',kind:'all_pro'}]},
    business_standard:{label:'Business Standard',rules:[{id:'shared_month',cap:15,period:'month',kind:'all_pro'}]},
    business_premium:{label:'Business Premium',rules:[{id:'shared_week',cap:50,period:'week',kind:'all_pro'}]},
    pro_unknown:{label:'Pro',rules:null}, business_unknown:{label:'Business',rules:null}, enterprise:{label:'Enterprise',rules:null}, edu:{label:'Edu',rules:null}
  };
  const obj = x => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  const text = (x,n=100) => typeof x === 'string' ? x.replace(/[\u0000-\u001f]/g,'').trim().slice(0,n) : '';
  const number = x => (typeof x === 'number' || typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x)) && Number.isFinite(Number(x)) ? Number(x) : null;
  const nonnegative = x => {const n=number(x); return n!==null && n>=0 ? n : null;};
  const percent = x => {const n=number(x); return n!==null && n>=0 && n<=100 ? n : null;};
  const safeId = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(x) ? x : '';
  const scopeOK = x => typeof x==='string' && /^(s_[a-f0-9]{40}|unassigned)$/.test(x);
  function localDate(time) {const d=new Date(time); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function dateFromKey(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const [y,m,d]=key.split('-').map(Number), out=new Date(y,m-1,d);
    return y>=2000 && y<=2100 && localDate(out)===key ? out : null;
  }
  function entry(raw) {
    const ts=(Array.isArray(raw)?raw:obj(raw).timestamps)||[];
    const timestamps=Array.isArray(ts)?ts.filter(t=>typeof t==='number' && t>946684800000 && t<4133980800000):[];
    const n=nonnegative(typeof raw==='number'?raw:obj(raw).count);
    return {count:Math.max(n===null?0:Math.floor(n),timestamps.length),timestamps};
  }
  function stats(items, now=Date.now()) {
    const d=new Date(now), today=localDate(d), monday=new Date(d); monday.setDate(d.getDate()-(d.getDay()+6)%7); monday.setHours(0,0,0,0);
    let out={today:0,week:0,month:0,total:0};
    Object.entries(obj(items)).forEach(([key,raw])=>{const date=dateFromKey(key);if(!date||key>today)return;const n=entry(raw).count;
      out.total+=n;if(key===today)out.today+=n;if(date>=monday && date<=d)out.week+=n;
      if(date.getFullYear()===d.getFullYear() && date.getMonth()===d.getMonth())out.month+=n;});
    return out;
  }
  function detectPlan(codes=[],features=[],seat='') {
    const list=(Array.isArray(codes)?codes:[]).map(c=>text(c).toLowerCase());
    features=(Array.isArray(features)?features:[]).map(c=>text(c).toLowerCase());seat=text(seat).toLowerCase();
    // Exact Premium test must precede the personal prolite test.
    if(list.includes('self_serve_business_prolite') || list.includes('business_premium') || features.some(f=>f==='self_serve_business_prolite' || f==='premium_seat'))return 'business_premium';
    if(list.some(c=>['business','team','chatgptteamplan','chatgptbusiness','self_serve_business','self_serve_business_usage_based'].includes(c))) {
      if(seat==='premium')return 'business_premium';
      if(seat==='standard' || list.includes('self_serve_business_usage_based'))return 'business_standard';
      return 'business_unknown';
    }
    const map={free:'free',chatgptfreeplan:'free',go:'go',chatgptgo:'go',plus:'plus',chatgptplusplan:'plus',prolite:'pro100',pro:'pro_unknown',chatgptpro:'pro_unknown',pro100:'pro100',pro200:'pro200',pro_100:'pro100',pro_200:'pro200',enterprise:'enterprise',chatgptenterprise:'enterprise',edu:'edu',chatgptedu:'edu',business_standard:'business_standard'};
    for(const code of list)if(map[code])return map[code];
    return '';
  }
  function resolveAccount(payload, observedId) {
    payload=obj(payload);
    const accounts=obj(payload.accounts);
    const candidates=Object.entries(accounts).filter(([,v])=>v && typeof v==='object').map(([key,value])=>({key,...obj(value)}));
    const candidateId=a=>safeId(obj(a.account).account_id||obj(a.account).id||a.account_id||a.key);
    const byId=id=>{id=safeId(id);return id?candidates.find(a=>candidateId(a)===id)||null:null;};
    let found=null,confidence='unassigned';

    // Best signal: the active ChatGPT page explicitly sent an account header.
    if(observedId){found=byId(observedId);if(found)confidence='observed_header';}

    // ChatGPT account payloads can expose a preferred/current/default account id. Use it
    // before falling back to ordering so normal users connect without a manual selector.
    if(!found&&!observedId){
      const preferred=[
        payload.active_account_id,payload.current_account_id,payload.default_account_id,
        obj(payload.account).account_id,obj(payload.account).id
      ].map(safeId).find(Boolean);
      if(preferred){found=byId(preferred);if(found)confidence='server_preferred';}
    }

    // Product-first fallback: account_ordering represents ChatGPT's own account order.
    // This avoids blocking the 99% path when the page does not expose a request header.
    if(!found&&!observedId){
      const ordering=Array.isArray(payload.account_ordering)?payload.account_ordering:[];
      for(const raw of ordering){const id=safeId(typeof raw==='string'?raw:obj(raw).account_id||obj(raw).id);found=byId(id);if(found){confidence='server_ordering';break;}}
    }

    // Last safe/simple fallback.
    if(!found&&!observedId&&candidates.length===1){found=candidates[0];confidence='single_account';}
    if(!found)return null;
    const a=obj(found.account),e=obj(found.entitlement);
    const features=Array.isArray(found.features)?found.features.filter(x=>typeof x==='string'):[];
    const seat=text(found.seat_type||a.seat_type||e.seat_type).toLowerCase();
    const codes=[a.plan_type,found.plan_type,e.subscription_plan].filter(x=>typeof x==='string');
    const name=text(found.name||found.display_name||found.workspace_name||found.organization_name||a.name||a.display_name||a.workspace_name||a.organization_name,80);
    return {id:safeId(a.account_id||a.id||found.key),name,plan:detectPlan(codes,features,seat),code:text(codes[0]||codes[1]),personal:a.structure==='personal',confidence};
  }
  function modelInfo(body) {
    body=obj(body);const cfg=obj(body.model_configuration||body.model_config), meta=obj(body.metadata);
    const messages=Array.isArray(body.messages)?body.messages:[];
    const msg=messages.slice().reverse().find(m=>obj(obj(m).author).role==='user'||obj(m).role==='user');
    if(!msg || body.action && body.action!=='next')return null;
    const mm=obj(msg.metadata);
    const model=text(body.model||body.model_slug||cfg.model||cfg.model_slug||cfg.slug||meta.model_slug,90);
    const effort=text(body.reasoning_effort||body.thinking_effort||cfg.reasoning_effort||cfg.thinking_effort||meta.reasoning_effort||mm.reasoning_effort||mm.thinking_effort,32);
    const tier=text(body.model_tier||body.product_tier||body.tier||cfg.model_tier||cfg.tier||meta.model_tier||meta.tier,24);
    return {id:safeId(msg.id),model,effort,tier,kind:classify(model,effort,tier)};
  }
  function classify(model,effort,tier='') {
    const m=text(model).toLowerCase(), t=text(tier,24).toLowerCase();
    // Pro is a model choice in the ChatGPT composer. Thinking/reasoning effort
    // (Medium/High/Extra High/etc.) is a separate dimension and must never
    // promote a non-Pro model into Pro usage.
    const isProModel=t==='pro'||/(^|[-_\s])pro($|[-_\s])/.test(t)||/(^|[-_\s])pro($|[-_\s])/.test(m);
    if(isProModel) {
      if(/(?:^|[-_\s])(?:gpt[-_\s]?)?6[-_\s]+pro(?:$|[-_\s])/.test(m)||/gpt[-_]?6/.test(m))return 'gpt6_pro';
      if(/5[._-]6|sol/.test(m))return 'sol_pro';
      return 'other_pro';
    }
    if(!m||m==='auto')return 'unknown';
    return 'chat';
  }
  function resetAt(record,now) {
    record=obj(record);
    for(const key of ['reset_at','resets_at']) {
      const v=record[key], n=number(v);
      if(n!==null&&n>=0) {const ts=n>=1e12?n:n*1000;if(Number.isFinite(ts)&&ts<=8640000000000000)return ts;}
      if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)){const ts=Date.parse(v);if(Number.isFinite(ts))return ts;}
    }
    for(const key of ['reset_after_seconds','reset_after','resets_after']) {
      const n=nonnegative(record[key]);if(n!==null&&Number.isFinite(now+n*1000)&&now+n*1000<=8640000000000000)return now+n*1000;
    }
    return null;
  }
  function windowLabel(seconds,lang='en') {
    if(!Number.isFinite(seconds)||seconds<=0)return lang.startsWith('zh')?'窗口时长未知':'Window unavailable';
    const units=lang.startsWith('zh')?['天','小时','分钟','秒']:['d','h','m','s'];
    const scale=seconds%86400===0?0:seconds%3600===0?1:seconds%60===0?2:3;
    return `${seconds/[86400,3600,60,1][scale]}${units[scale]}`;
  }
  function liveStatus(live,error,now=Date.now()) {
    const f=freshness(live?.updatedAt,now);
    return error&&error.ts>=(live?.updatedAt||0)?{...f,kind:'error',cachedKind:f.kind}:f;
  }

  function meter(record,id,label,now) {
    record=obj(record);
    const usedPercent=percent(record.used_percent), remPercent=percent(record.remaining_percent);
    const remaining=nonnegative(record.remaining),limit=nonnegative(record.limit??record.total);
    const reset=resetAt(record,now), seconds=nonnegative(record.limit_window_seconds);
    if([usedPercent,remPercent,remaining,limit,reset,seconds].every(n=>n===null))return null;
    return {id:text(id,140),label:text(label,80),usedPercent,remainingPercent:remPercent!==null?remPercent:usedPercent!==null?100-usedPercent:null,remaining,limit,resetAt:reset,windowSeconds:seconds};
  }
  function normalizeWham(raw,now=Date.now()) {
    raw=obj(raw);const meters=[];
    const groups=[['main',obj(raw.rate_limit)],['review',obj(raw.code_review_rate_limit)]];
    for(const [i,v] of (Array.isArray(raw.additional_rate_limits)?raw.additional_rate_limits:[]).slice(0,12).entries())groups.push([`extra:${i}:${text(obj(v).limit_name||obj(v).metered_feature,50)}`,obj(obj(v).rate_limit)]);
    for(const [id,group]of groups)for(const name of ['primary_window','secondary_window']){
      const m=meter(group[name],`${id}:${name}`,id==='review'?'Code review':id.startsWith('extra:')?id.split(':').slice(2).join(':'):'Codex',now);if(m)meters.push(m);
    }
    const cr=obj(raw.credits),balance=nonnegative(cr.balance);
    const credits=balance!==null||typeof cr.unlimited==='boolean'?{balance,unlimited:cr.unlimited===true}:null;
    return {plan:detectPlan([text(raw.plan_type)]),planCode:text(raw.plan_type),meters,credits,updatedAt:now};
  }
  function normalizeInit(raw,now=Date.now()) {
    raw=obj(raw);const meters=[];
    for(const key of ['limits_progress','model_limits','message_limits']) {
      for(let [i,r]of (Array.isArray(raw[key])?raw[key]:[]).slice(0,30).entries()){
        r=obj(r);const label=text(r.feature_name||r.model_slug||r.model||r.name,80);if(!label)continue;
        const m=meter(r,`${key}:${label}:${i}`,label,now);if(m)meters.push(m);
      }
    }
    return {meters,blocked:(Array.isArray(raw.blocked_features)?raw.blocked_features:[]).filter(v=>typeof v==='string').map(v=>text(v,60)).slice(0,20),updatedAt:now};
  }
  function freshState(now=Date.now()) {return {schema:STATE_SCHEMA,startedAt:now,coverageStart:now,events:[],settings:{},snapshots:{},meta:{createdAt:now,migratedAt:null,migratedFrom:null}};}
  function migrateState(raw,now=Date.now()) {
    raw=obj(raw);
    if(!Object.keys(raw).length)return {state:freshState(now),changed:true,migratedFrom:null};
    if(!raw.schema)raw={...raw,schema:1};
    if(![1,2,STATE_SCHEMA].includes(raw.schema))throw Error('unsupported_state_schema');
    const migratedFrom=raw.schema===STATE_SCHEMA?null:raw.schema;
    const meta=obj(raw.meta), oldSettings=obj(raw.settings);
    const preferredSetting=oldSettings[LOCAL_SCOPE] || Object.values(oldSettings).find(v=>obj(v).plan && obj(v).plan!=='auto') || Object.values(oldSettings)[0] || {};
    const settings={...oldSettings,[LOCAL_SCOPE]:obj(preferredSetting)};
    const eventIds=new Set();
    const events=(Array.isArray(raw.events)?raw.events:[]).map(v=>event({...obj(v),scope:LOCAL_SCOPE})).filter(Boolean).filter(v=>{if(eventIds.has(v.id))return false;eventIds.add(v.id);return true;}).sort((a,b)=>a.ts-b.ts).slice(-10000);
    const out={
      ...raw,
      schema:STATE_SCHEMA,
      startedAt:nonnegative(raw.startedAt)||now,
      coverageStart:nonnegative(raw.coverageStart)||nonnegative(raw.startedAt)||now,
      events,
      settings,
      snapshots:obj(raw.snapshots),
      meta:{...meta,createdAt:nonnegative(meta.createdAt)||nonnegative(raw.startedAt)||now,migratedAt:migratedFrom?now:nonnegative(meta.migratedAt),migratedFrom:migratedFrom||meta.migratedFrom||null}
    };
    return {state:out,changed:Boolean(migratedFrom),migratedFrom};
  }
  function state(raw) {return migrateState(raw).state;}
  function freshness(updatedAt,now=Date.now(),liveMs=120000,staleMs=1800000) {
    const ts=nonnegative(updatedAt);if(ts===null||ts>now+60000)return {kind:'unavailable',ageMs:null};
    const age=Math.max(0,now-ts);if(age<=liveMs)return {kind:'live',ageMs:age};if(age<=staleMs)return {kind:'cached',ageMs:age};return {kind:'stale',ageMs:age};
  }
  function event(raw) {
    raw=obj(raw);if(!/^[a-f0-9]{64}$/.test(raw.id)||!scopeOK(raw.scope)||!Number.isFinite(raw.ts)||raw.ts<946684800000||raw.ts>Date.now()+60000)return null;
    const tier=text(raw.tier,24),modelSource=text(raw.modelSource,40);
    return {id:raw.id,scope:raw.scope,ts:raw.ts,model:text(raw.model,90),effort:text(raw.effort,32),tier,modelSource,kind:classify(raw.model,raw.effort,tier)};
  }
  function matches(e,rule) {return rule.kind==='all_pro'?e.kind.endsWith('_pro'):e.kind===rule.kind;}
  function allowance(s,scope,planKey,now=Date.now()) {
    const rules=plans[planKey]?.rules;if(!rules)return [];
    const events=s.events.filter(e=>e.scope===scope), baselines=obj(obj(s.settings[scope]).baselines);
    return rules.map(rule=>{
      const duration=(rule.period==='day'?1:rule.period==='week'?7:31)*DAY;
      const observed=events.filter(e=>e.ts<=now&&e.ts>=now-duration&&matches(e,rule)).length;
      const b=obj(baselines[rule.id]);
      const valid=b.plan===planKey&&b.cap===rule.cap&&Number.isFinite(b.at)&&b.at<=now&&Number.isFinite(b.resetAt)&&b.resetAt>now&&Number.isInteger(b.used)&&b.used>=0&&b.used<=rule.cap;
      const localNew=valid?events.filter(e=>e.ts<=now&&e.ts>b.at&&matches(e,rule)).length:0;
      const used=valid?b.used+localNew:null;
      return {...rule,observed,used,remaining:used===null?null:Math.max(0,rule.cap-used),resetAt:valid?b.resetAt:null,expired:b.plan===planKey&&b.resetAt<=now,unknown:events.filter(e=>e.ts>=(valid?b.at:now-duration)&&e.kind==='unknown').length};
    });
  }
  function proKind(label) {
    const v=text(label,140).toLowerCase();
    if(!v)return 'all_pro';
    if(/(?:5[._ -]?6|sol)/.test(v)&&/(^|[-_\s])pro($|[-_\s])/.test(v))return 'sol_pro';
    if(/(?:gpt[-_\s]?)?6/.test(v)&&/(^|[-_\s])pro($|[-_\s])/.test(v))return 'gpt6_pro';
    return 'all_pro';
  }
  function proLive(raw,now=Date.now()) {
    raw=obj(raw);const updatedAt=nonnegative(raw.updatedAt);
    if(!updatedAt||updatedAt>now+60000)return null;
    const meters=(Array.isArray(raw.meters)?raw.meters:[]).map((r,i)=>{
      r=obj(r);const label=text(r.label||r.model||r.name,100),id=text(r.id||label||('pro:'+i),140);
      const remaining=nonnegative(r.remaining),limit=nonnegative(r.limit),usedPercent=percent(r.usedPercent),remainingPercent=percent(r.remainingPercent);
      const reset=nonnegative(r.resetAt),windowSeconds=nonnegative(r.windowSeconds);
      if([remaining,limit,usedPercent,remainingPercent,reset,windowSeconds].every(v=>v===null))return null;
      return {id,label:label||'Pro',kind:text(r.kind,24)||proKind(label),remaining,limit,usedPercent,remainingPercent:remainingPercent!==null?remainingPercent:usedPercent!==null?100-usedPercent:null,resetAt:reset,windowSeconds};
    }).filter(Boolean).slice(0,24);
    return meters.length?{meters,updatedAt,source:text(raw.source,160)}:null;
  }
  function proCycles(raw) {
    raw=obj(raw);const out={};
    for(const [id,v0] of Object.entries(obj(raw.cycles||raw))){const v=obj(v0),windowMs=nonnegative(v.windowMs),lastResetAt=nonnegative(v.lastResetAt),nextResetAt=nonnegative(v.nextResetAt),seen=nonnegative(v.detectedResets)||0,kind=text(v.kind,24)||'all_pro',label=text(v.label,100);if(!windowMs&&!lastResetAt&&!nextResetAt)continue;out[text(id,140)||id]={id:text(id,140)||id,label,kind,windowMs,lastResetAt,nextResetAt,detectedResets:Math.floor(seen),confidence:text(v.confidence,24)||'learning'};}
    return out;
  }
  function ruleCycle(cycles,rule) {
    const all=Object.values(proCycles(cycles));if(!all.length)return null;
    const targetMs=(rule.period==='day'?1:rule.period==='week'?7:31)*DAY;
    const score=c=>{
      let n=0;if(c.kind===rule.kind)n+=8;else if(rule.kind==='all_pro'||c.kind==='all_pro')n+=4;
      if(c.windowMs){const ratio=Math.max(c.windowMs,targetMs)/Math.max(1,Math.min(c.windowMs,targetMs));if(ratio<1.15)n+=6;else if(ratio<1.6)n+=2;}
      if(c.nextResetAt)n+=2;if(c.detectedResets>=1)n+=2;return n;
    };
    return all.sort((a,b)=>score(b)-score(a))[0]||null;
  }
  function currentLearnedWindow(cycle,rule,now) {
    if(!cycle)return null;let windowMs=nonnegative(cycle.windowMs),next=nonnegative(cycle.nextResetAt),last=nonnegative(cycle.lastResetAt);
    // Do not manufacture a cycle from a lone future reset timestamp. We need
    // either an observed/reset-derived start or an explicit server window length.
    if(!last&&!windowMs)return null;
    if(last&&next&&last<=now&&next>now)return {startAt:last,nextResetAt:next,windowMs:next-last};
    if(!windowMs&&last&&next&&next>last)windowMs=next-last;
    if(!windowMs)return null;
    if(next&&next<=now){const steps=Math.floor((now-next)/windowMs)+1;next+=steps*windowMs;}
    if(!next&&last){next=last+windowMs;while(next<=now)next+=windowMs;}
    if(!next)return null;const start=last&&last<=now&&now-last<windowMs*1.05?last:next-windowMs;if(start>now||now-start>windowMs*1.05)return null;
    return {startAt:start,nextResetAt:next,windowMs};
  }
  function proAllowances(s,scope,planKey,serverRaw,cycleRaw,now=Date.now()) {
    const preset=plans[planKey],rules=preset?.rules;
    const server=proLive(serverRaw,now),serverFresh=server?freshness(server.updatedAt,now,5*60*1000,60*60*1000):{kind:'unavailable'};
    if(server&&serverFresh.kind!=='stale'&&server.meters.length){
      return server.meters.map(m=>{
        const cap=m.limit!==null?m.limit:null;
        const remaining=m.remaining!==null?m.remaining:cap!==null&&m.remainingPercent!==null?Math.round(cap*m.remainingPercent/100):null;
        const observedWindow=m.windowSeconds?m.windowSeconds*1000:7*DAY;
        const observed=s.events.filter(e=>e.scope===scope&&e.ts<=now&&e.ts>=now-observedWindow&&e.kind.endsWith('_pro')).length;
        return {...m,cap,remaining,observed,mode:'official',trust:serverFresh.kind,source:'chatgpt'};
      });
    }
    if(!rules)return [];
    const manual=allowance(s,scope,planKey,now).map(r=>({...r,mode:r.remaining!==null?'manual':'observed',trust:r.remaining!==null?'estimated':'tracking'}));
    if(manual.some(r=>r.remaining!==null))return manual;
    const cycles=proCycles(cycleRaw),events=s.events.filter(e=>e.scope===scope&&e.ts<=now);
    let learnedAny=false;
    const learned=rules.map(rule=>{
      const cycle=ruleCycle(cycles,rule),win=currentLearnedWindow(cycle,rule,now);
      if(!win)return null;learnedAny=true;
      const observed=events.filter(e=>e.ts>=win.startAt&&matches(e,rule)).length;
      return {...rule,observed,used:observed,remaining:Math.max(0,rule.cap-observed),remainingPercent:100*Math.max(0,rule.cap-observed)/rule.cap,resetAt:win.nextResetAt,windowSeconds:win.windowMs/1000,mode:'learned',trust:'estimated',cycleConfidence:cycle.confidence};
    });
    if(learnedAny)return learned.map((r,i)=>r||{...manual[i],mode:'observed',trust:'tracking'});
    return manual;
  }
  function proPrimary(items) {
    items=Array.isArray(items)?items:[];
    const rank={official:4,manual:3,learned:2,observed:1};
    return items.slice().sort((a,b)=>(rank[b.mode]||0)-(rank[a.mode]||0)||(Number.isFinite(b.remaining)-Number.isFinite(a.remaining))||(Number.isFinite(b.remainingPercent)-Number.isFinite(a.remainingPercent)))[0]||null;
  }
  function mergeEntry(a,b) {
    a=entry(a);b=entry(b);const counts=new Map();
    for(const ts of [a.timestamps,b.timestamps]) {const own=new Map();for(const v of ts)own.set(v,(own.get(v)||0)+1);for(const [v,c]of own)counts.set(v,Math.max(counts.get(v)||0,c));}
    const timestamps=[...counts].flatMap(([v,c])=>Array(c).fill(v)).sort((x,y)=>x-y);
    return {count:Math.max(a.count,b.count,timestamps.length),timestamps};
  }
  return {APP_VERSION,windowLabel,liveStatus,KEY,STATE_SCHEMA,LOCAL_SCOPE,DAY,VERIFIED,SOURCE,plans,obj,text,number,nonnegative,percent,safeId,scopeOK,localDate,dateFromKey,entry,stats,detectPlan,resolveAccount,modelInfo,classify,resetAt,meter,normalizeWham,normalizeInit,freshState,migrateState,state,freshness,event,matches,allowance,proKind,proLive,proCycles,proAllowances,proPrimary,mergeEntry};
});
