/* Pre-capture only. Send handlers never read the source document. */
(() => {
  'use strict';
  if (window.top !== window) return;
  if (globalThis.__sakuraPageContextV1) { globalThis.__sakuraPageContextV1.check(); return; }
  let active=false, timer=0, idle=0, interval=0, observer=null, lastText='', lastURL='', lastAttempt=0, epoch=0, scheduledAt=0;
  function send(m) {
    try {
      const runtime = globalThis.chrome?.runtime;
      if (!runtime || typeof runtime.sendMessage !== 'function') return Promise.resolve({ ok:false });
      return Promise.resolve(runtime.sendMessage(m)).catch(() => ({ ok:false }));
    } catch { return Promise.resolve({ ok:false }); }
  }
  function schedule(delay=650,force=false) {
    if(!active || document.hidden) return;
    if(force) { lastText=''; clearTimeout(timer); timer=0; }
    // Do not starve snapshots on a continuously changing/streaming page.
    if(timer && Date.now()-scheduledAt > 1600) return;
    clearTimeout(timer); scheduledAt ||= Date.now();
    timer=setTimeout(() => {
      timer=0; scheduledAt=0;
      const run=() => { idle=0; void capture(); };
      if(idle) { if(window.cancelIdleCallback) cancelIdleCallback(idle); idle=0; }
      idle=window.requestIdleCallback ? requestIdleCallback(run,{timeout:600}) : 0;
      if(!window.requestIdleCallback) run();
    },Math.max(delay,1200-(Date.now()-lastAttempt)));
  }
  async function capture() {
    if(!active || document.hidden) return;
    lastAttempt=Date.now(); const gen=epoch, url=location.href;
    const result=SakuraPageExtract.extract(document,12000);
    if(!active || gen!==epoch || url!==location.href || (result.text===lastText && url===lastURL)) return;
    const reply=await send({type:'SC_PAGE_CONTEXT',text:result.text,title:document.title,originalLength:result.originalLength,truncated:result.truncated});
    if(reply?.ok && gen===epoch && url===location.href) {lastText=result.text;lastURL=url;}
  }
  function visibility(){if(!document.hidden) schedule(60);}
  function start() {
    if(active) {schedule(60);return;}
    active=true; epoch++; lastText=''; lastURL='';
    observer=new MutationObserver(records => {
      if(records.some(r => !r.target.parentElement?.closest('[data-sakura-sidechat],nav,aside,button,textarea,[contenteditable="true"]'))) schedule(700);
    });
    if(document.documentElement) observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','checked','aria-checked','disabled','aria-disabled']});
    document.addEventListener('visibilitychange',visibility);document.addEventListener('change',visibility);
    interval=setInterval(() => schedule(location.href===lastURL ? 300 : 40),5000);
    schedule(40);
  }
  function stop() {
    active=false;epoch++;clearTimeout(timer);clearInterval(interval);timer=interval=scheduledAt=0;
    if(idle && window.cancelIdleCallback) cancelIdleCallback(idle);idle=0;
    observer?.disconnect();observer=null;document.removeEventListener('visibilitychange',visibility);document.removeEventListener('change',visibility);lastText='';
  }
  async function check(){const r=await send({type:'SC_PAGE_HELLO'});if(r?.ok&&r.enabled)start();else stop();}
  chrome.runtime.onMessage.addListener((m,s,reply) => {
    if(s.id!==chrome.runtime.id)return;
    if(m?.type==='SC_PAGE_START'){start();reply({ok:true});}
    if(m?.type==='SC_PAGE_STOP'){stop();reply({ok:true});}
    if(m?.type==='SC_PAGE_REFRESH'){schedule(30,true);reply({ok:true});}
  });
  addEventListener('pagehide',stop);addEventListener('pageshow',() => void check());
  globalThis.__sakuraPageContextV1={check};void check();
})();
