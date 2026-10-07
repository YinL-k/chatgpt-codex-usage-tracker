/* Network-authoritative local activity bridge.
   Counts a ChatGPT user send from the actual conversation request metadata.
   Only message id + model/tier/effort metadata leave the page; prompt content is never read or stored here. */
(()=>{
  'use strict';
  const BRIDGE_VERSION='3.6.0.63';
  // Never trust an old sentinel after an unpacked-extension reload. A prior
  // isolated-world listener can survive while its chrome.runtime is invalid.
  try{globalThis.__sakuraUsageNetworkBridgeCleanupV31?.();}catch{}
  Object.defineProperty(globalThis,'__sakuraUsageNetworkBridgeLive',{value:BRIDGE_VERSION,configurable:true,writable:true});

  const SOURCE='SAKURA_MODEL_OBSERVER_V2';
  const seen=new Set();
  let disposed=false;

  const clean=(v,n)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,'').replace(/\s+/g,' ').trim().slice(0,n):'';
  const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const digest=async s=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  async function runtimeSend(message){
    try{
      const runtime=globalThis.chrome?.runtime;
      if(!runtime||typeof runtime.sendMessage!=='function')return {ok:false,error:'extension_reloaded'};
      return await runtime.sendMessage(message);
    }catch{return {ok:false,error:'extension_reloaded'};}
  }

  async function store(snapshot,at){
    const messageId=clean(snapshot?.messageId,160);
    if(!messageId||seen.has(messageId)||disposed)return;
    seen.add(messageId);
    // Keep bounded memory for very long-lived ChatGPT tabs.
    if(seen.size>400){const first=seen.values().next().value;seen.delete(first);}
    try{
      const id=await digest(`gpt-tracker:user:${messageId}`);
      const response=await runtimeSend({
        type:'UG_EVENT',
        event:{
          id,
          ts:Number.isFinite(at)?at:Date.now(),
          model:clean(snapshot?.model,90),
          effort:clean(snapshot?.effort,32),
          tier:clean(snapshot?.tier,24),
          modelSource:'request'
        }
      });
      // If storage/runtime was temporarily unavailable, allow a later duplicate
      // observation of the same network send to retry instead of losing it forever.
      if(!response?.ok)seen.delete(messageId);
    }catch{
      seen.delete(messageId);
    }
  }

  function onMessage(e){
    if(disposed||e.source!==window||e.origin!==location.origin)return;
    const d=e.data;
    if(!d||d.source!==SOURCE||d.type!=='MODEL_OBSERVED'||!Number.isFinite(d.at))return;
    // Direct counting requires a real user-message id observed in the outgoing
    // request. Model-only observations remain metadata-only and are ignored here.
    if(!clean(d.snapshot?.messageId,160))return;
    void store(d.snapshot,d.at);
  }

  function cleanup(){
    if(disposed)return;
    disposed=true;
    window.removeEventListener('message',onMessage,false);
    seen.clear();
  }
  window.addEventListener('message',onMessage,false);
  addEventListener('pagehide',cleanup,{once:true});
  globalThis.__sakuraUsageNetworkBridgeCleanupV31=cleanup;
})();
