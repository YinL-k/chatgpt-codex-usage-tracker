/* Capture changes in the source page; verify a current snapshot before send. */
(() => {
  'use strict';
  if (window.top !== window) return;
  if (globalThis.__sakuraPageContextV1) { globalThis.__sakuraPageContextV1.check(); return; }
  const captureToken=crypto.randomUUID();
  let active=false,timer=0,interval=0,observer=null,lastText='',lastURL='',lastTitle='',epoch=0,scheduledAt=0,revision=0;
  function send(m){try{return Promise.resolve(chrome.runtime.sendMessage(m)).catch(()=>({ok:false}));}catch{return Promise.resolve({ok:false});}}
  function schedule(delay=200,force=false){
    if(!active||document.hidden)return;
    if(force){lastText='';clearTimeout(timer);timer=0;scheduledAt=0;}
    const now=Date.now();scheduledAt ||= now;clearTimeout(timer);
    timer=setTimeout(()=>{timer=scheduledAt=0;void capture();},Math.min(delay,Math.max(0,1000-(now-scheduledAt))));
  }
  async function capture(force=false){
    if(!active||document.hidden)return {ok:false};
    const gen=epoch,url=location.href,title=document.title,seq=++revision;
    try{
      const result=SakuraPageExtract.extract(document,12000);
      if(!active||gen!==epoch||url!==location.href)return {ok:false};
      if(!force&&result.text===lastText&&url===lastURL&&title===lastTitle)return {ok:true};
      const reply=await send({type:'SC_PAGE_CONTEXT',text:result.text,title,originalLength:result.originalLength,truncated:result.truncated,pageIdentity:url,captureToken,revision:seq});
      if(!active||gen!==epoch||url!==location.href)return {ok:false};
      if(reply?.ok&&seq===revision){lastText=result.text;lastURL=url;lastTitle=title;}
      return {ok:reply?.ok===true,pageIdentity:url,captureToken,revision:seq};
    }catch{return {ok:false};}
  }
  function visibility(){if(!document.hidden)schedule(0);}
  function start(){
    if(active){schedule(0);return;}
    active=true;epoch++;lastText=lastURL=lastTitle='';
    observer=new MutationObserver(records=>{if(records.some(r=>!(r.target instanceof Element?r.target:r.target.parentElement)?.closest('[data-sakura-sidechat],nav,aside,textarea,[contenteditable="true"]')))schedule();});
    if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','checked','aria-checked','disabled','aria-disabled','selected','aria-selected','aria-label','class','style']});
    document.addEventListener('visibilitychange',visibility);document.addEventListener('change',visibility);
    addEventListener('popstate',visibility);addEventListener('hashchange',visibility);
    interval=setInterval(()=>schedule(0),5000);schedule(0);
  }
  function stop(){
    active=false;epoch++;clearTimeout(timer);clearInterval(interval);timer=interval=scheduledAt=0;
    observer?.disconnect();observer=null;document.removeEventListener('visibilitychange',visibility);document.removeEventListener('change',visibility);
    removeEventListener('popstate',visibility);removeEventListener('hashchange',visibility);lastText='';
  }
  async function check(){const r=await send({type:'SC_PAGE_HELLO'});if(r?.ok&&r.enabled)start();else stop();}
  chrome.runtime.onMessage.addListener((m,s,reply)=>{
    if(s.id!==chrome.runtime.id)return;
    if(m?.type==='SC_PAGE_START'){start();reply({ok:true});}
    if(m?.type==='SC_PAGE_STOP'){stop();reply({ok:true});}
    if(m?.type==='SC_PAGE_REFRESH'){schedule(0,true);reply({ok:true});}
    if(m?.type==='SC_PAGE_SNAPSHOT'){void capture(true).then(reply,()=>reply({ok:false}));return true;}
  });
  addEventListener('pagehide',stop);addEventListener('pageshow',()=>void check());
  globalThis.__sakuraPageContextV1={check};void check();
})();
