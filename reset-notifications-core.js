/* Pure predictive notification policy. All probabilities are raw fractions. */
(function(root){
  'use strict';
  const CONFIG=Object.freeze({pollMs:300000,staleMs:600000,sustainMs:600000,samples:3,
    watch:{h24:.45,h6:.20,exit24:.40,exit6:.15},
    modes:{standard:{h24:.60,h6:.30,exit24:.50,exit6:.20},low:{h24:.75,h6:.45,exit24:.65,exit6:.35}},
    forecastURL:'https://codex.lunarwerx.com/api/v1/forecast',confirmedURL:'https://codex-reset.com/api/timeline',
    key:'sakuraResetNotificationsV1',prefsKey:'sakuraResetNotificationPrefsV1',displayKey:'sakuraResetForecastDisplayV1',refreshMinMs:300000});
  const date=v=>typeof v==='string'?Date.parse(v):NaN;
  function normalize(raw,now){
    const at=date(raw?.generatedAt),lastResetAt=date(raw?.lastResetAt),h6=raw?.nearTerm?.probability,h24=raw?.next24Hours?.probability;
    if(!Number.isFinite(at)||at>now||now-at>CONFIG.staleMs||raw?.nearTerm?.hours!==6||![h6,h24].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)||raw.recording==='unsaved')throw Error('invalid_forecast');
    return {at,lastResetAt:Number.isFinite(lastResetAt)?lastResetAt:null,h6,h24};
  }
  function confirmed(raw,now){
    return (Array.isArray(raw?.events)?raw.events:[]).filter(e=>e?.group==='reset'&&e.announcement_state==='announced'&&Number.isFinite(date(e.announced_at))&&date(e.announced_at)<=now&&typeof e.id==='string')
      .map(e=>({id:e.id,at:date(e.announced_at)})).sort((a,b)=>b.at-a.at)[0]||null;
  }
  // Legacy combined arrays cannot prove which window qualified. Discard only
  // pending evidence on migration; retain cycle identity and delivered quota.
  const runs=value=>({h24:Array.isArray(value?.h24)?[...value.h24]:[],h6:Array.isArray(value?.h6)?[...value.h6]:[]});
  function fresh(now){return {version:1,startedAt:now,cycleAt:0,cycleId:'initial',mode:'standard',count:0,strongSent:false,lastPushAt:0,lastAt:0,run:runs(),strongRun:runs(),level:'normal',below:0};}
  function endCycle(s,event,now){
    if(!event||event.id===s.cycleId||event.at<=s.cycleAt)return s;
    // A source returning after an outage can backfill the pre-existing cycle.
    // Adopt its identity without granting another notification allowance.
    if(event.at<=s.startedAt)return {...s,cycleAt:event.at,cycleId:event.id};
    return {...fresh(now),cycleAt:event.at,cycleId:event.id,mode:s.mode};
  }
  function interrupt(s){return {...s,run:runs(),strongRun:runs()};}
  function append(run,at){return [...run,at].slice(-20);}
  function ready(run){return run.length>=CONFIG.samples&&run.at(-1)-run[0]>=CONFIG.sustainMs;}
  function step(input,snapshot,mode,now){
    let s={...input,run:runs(input.run),strongRun:runs(input.strongRun)};
    mode=CONFIG.modes[mode]?mode:'standard';
    if(mode!==s.mode){s={...interrupt(s),mode,level:'normal',below:0};}
    if(!snapshot||now-snapshot.at>CONFIG.staleMs||snapshot.at>now)return {state:interrupt(s),notification:null};
    const p=snapshot,threshold=CONFIG.modes[mode];
    // Require a forecast generated after initialization/cycle rollover. A provider's
    // observation can precede the announcement; ten minutes allows this known lag.
    if(p.at<s.startedAt||s.cycleAt&&(!p.lastResetAt||p.lastResetAt<s.cycleAt-CONFIG.staleMs))return {state:interrupt(s),notification:null};
    if(p.at<=s.lastAt)return {state:s,notification:null};
    if(s.lastAt&&p.at-s.lastAt>CONFIG.staleMs)s=interrupt(s);
    s.lastAt=p.at;s.snapshot=p;
    const meets=t=>p.h24>=t.h24||p.h6>=t.h6;
    const high=meets(threshold),watch=meets(CONFIG.watch),strong=p.h24===1||p.h6===1;
    const desired=high?'alert':watch?'watch':'normal';
    const rank={normal:0,watch:1,alert:2};
    if(rank[desired]>=rank[s.level]){s.level=desired;s.below=0;}
    else {const exit=s.level==='alert'?threshold:CONFIG.watch;if(p.h24<exit.exit24&&p.h6<exit.exit6){if(++s.below>=2){s.level=desired;s.below=0;}}else s.below=0;}
    for(const window of ['h24','h6']){
      s.run[window]=p[window]>=threshold[window]?append(s.run[window],p.at):[];
      // Escalation evidence must be generated after the first delivery.
      s.strongRun[window]=s.count===1&&!s.strongSent&&p.at>s.lastPushAt&&p[window]===1?append(s.strongRun[window],p.at):[];
    }
    let notification=null;
    if(s.count===0&&(ready(s.run.h24)||ready(s.run.h6)))notification=strong?'strong':'possible';
    else if(s.count===1&&!s.strongSent&&(ready(s.strongRun.h24)||ready(s.strongRun.h6)))notification='strong';
    if(notification){s.count++;s.strongSent ||= notification==='strong';s.lastPushAt=now;s=interrupt(s);}
    return {state:s,notification};
  }
  const api={CONFIG,normalize,confirmed,fresh,endCycle,interrupt,step};
  root.SakuraResetPolicy=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
