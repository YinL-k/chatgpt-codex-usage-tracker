/* Background-only scheduler. Confirmation never produces a notification. */
(()=>{
  'use strict';
  const P=SakuraResetPolicy,C=P.CONFIG,alarm='sakura-predictive-reset';let queue=Promise.resolve();
  const serial=fn=>{const job=queue.then(fn);queue=job.catch(()=>{});return job;};
  async function json(url){
    const key='sakuraResetRetry:'+url,stored=await chrome.storage.local.get(key);if(stored[key]>Date.now())throw Error('backoff');
    const r=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000)});
    if(!r.ok){const retry=r.headers.get('Retry-After');if(retry){const at=/^\d+$/.test(retry)?Date.now()+Number(retry)*1000:Date.parse(retry);if(Number.isFinite(at))await chrome.storage.local.set({[key]:at});}throw Error('http_'+r.status);}return r.json();
  }
  async function poll(){
    const stored=await chrome.storage.local.get([C.key,C.prefsKey]);const prefs=stored[C.prefsKey]||{};
    if(prefs.enabled===false)return;
    const now=Date.now();let s=stored[C.key]?.version===1?stored[C.key]:P.fresh(now);
    // Persist confirmation independently, even when the forecast request fails.
    try{s=P.endCycle(s,P.confirmed(await json(C.confirmedURL),Date.now()),Date.now());}catch{/* Last confirmed cycle remains authoritative. */}
    await chrome.storage.local.set({[C.key]:s});
    let p;try{p=P.normalize(await json(C.forecastURL),Date.now());}catch{await chrome.storage.local.set({[C.key]:{...P.interrupt(s),error:true}});return;}
    const result=P.step(s,p,prefs.mode,Date.now());s={...result.state,error:false};
    // Reserve the fixed ID before delivery: a worker restart cannot duplicate it.
    await chrome.storage.local.set({[C.key]:s});
    if(!result.notification)return;
    const pref=await chrome.storage.sync.get('gptTrackerLang'),zh=(pref.gptTrackerLang||navigator.language||'').startsWith('zh');
    const title=result.notification==='strong'?(zh?'极强 Reset 信号':'Very strong Reset signal'):(zh?'Reset 可能接近':'Reset may be approaching');
    try{await chrome.notifications.create('sakura-reset-prediction',{type:'basic',iconUrl:'assets/sakurameter-128.png',title,
      message:`6h: ${Math.round(p.h6*100)}% · 24h: ${Math.round(p.h24*100)}%\n${zh?'预测存在不确定性。来源：LunarWerx':'Predictions are uncertain. Source: LunarWerx'}`});}
    catch{await chrome.storage.local.set({[C.key]:{...s,deliveryError:true}});}
  }
  chrome.alarms.onAlarm.addListener(a=>{if(a.name===alarm)return serial(poll);});
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{
    if(m?.type!=='RN_PREFS')return;
    if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('')))return;
    void serial(async()=>{const old=await chrome.storage.local.get([C.key,C.prefsKey]);const prefs={enabled:m.enabled!==false,mode:m.mode==='low'?'low':'standard'};
      const state=P.interrupt(old[C.key]||P.fresh(Date.now()));state.mode=prefs.mode;state.startedAt=Date.now();state.level='normal';state.below=0;
      await chrome.storage.local.set({[C.prefsKey]:prefs,[C.key]:state});return {ok:true};}).then(reply,()=>reply({ok:false}));return true;
  });
  chrome.notifications.onClicked.addListener(id=>{if(id.startsWith('sakura-reset-'))void chrome.tabs.create({url:chrome.runtime.getURL('heatmap.html#overview')});});
  async function ensureAlarm(){if(!await chrome.alarms.get(alarm))await chrome.alarms.create(alarm,{periodInMinutes:C.pollMs/60000,delayInMinutes:1});}
  void ensureAlarm();chrome.runtime.onStartup.addListener(()=>void ensureAlarm());
})();
