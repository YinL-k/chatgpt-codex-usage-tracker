/* Multi-receipt local confirmation. Submitted text stays in RAM only and is never sent or stored. */
(()=>{
  'use strict';
  const TRACKER_VERSION='3.6.0.63';
  // Always replace an older/same-version tracker instance. This matters for
  // unpacked-extension reloads where the old isolated world can outlive its
  // chrome.runtime context.
  try{globalThis.__gptTrackerCleanup?.();}catch{}
  Object.defineProperty(globalThis,'__gptTrackerLive',{value:TRACKER_VERSION,configurable:true,writable:true});
  const C=GPTUsageCore,R=SakuraModelResolver,TTL=60000,SETTLE=350,MODEL_SOURCE='SAKURA_MODEL_OBSERVER_V2';
  function send(m){
    try{
      const runtime=globalThis.chrome?.runtime;
      if(!runtime||typeof runtime.sendMessage!=='function')return Promise.resolve({ok:false,error:'extension_reloaded'});
      return Promise.resolve(runtime.sendMessage(m)).catch(()=>({ok:false,error:'extension_reloaded'}));
    }catch{return Promise.resolve({ok:false,error:'extension_reloaded'});}
  }
  const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const normalize=s=>(s||'').replace(/\s+/g,' ').trim();
  const messageSelector='[data-message-author-role="user"]';
  const knownIDs=new Set(),knownNodes=new WeakSet(),receipts=[];
  let route=location.pathname,checking=false,inFlight=null,recentRequest=null,disposed=false;
  let observer=null,timer=0;
  function modelLabel(){
    const clean=raw=>C.text(raw,90).replace(/[\s\u00a0]+/g,' ').replace(/[›⌄▾\s]+$/g,'').trim();
    const exact=/^(?:gpt[- ]?)?6\s+pro$/i;
    const fromAria=raw=>{const a=clean(raw),m=a.match(/(?:current\s+model(?:\s+is)?|model)[:\s-]*((?:gpt[- ]?)?6\s+pro)\b/i);return m?clean(m[1]):'';};
    const direct=['[data-testid="model-switcher-dropdown-button"]','button[aria-label*="model" i]','button[data-testid*="model" i]'];
    for(const sel of direct){
      const el=document.querySelector(sel);if(!el)continue;
      const txt=clean(el.textContent);if(txt)return txt;
      const aria=fromAria([el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' '));if(aria)return aria;
    }
    for(const el of document.querySelectorAll('button,[role="button"]')){
      const txt=clean(el.textContent);if(exact.test(txt))return txt;
      const aria=fromAria([el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' '));if(aria)return aria;
    }
    return '';
  }
  function effortLabel(){
    const root=composer()?.closest('form')||document;
    const canonical=raw=>{
      const txt=C.text(raw,90),m=txt.match(/(?:^|[\s:·|()\-])(extra\s*high|high|medium|instant|low)(?:$|[\s:·|()\-])/i)||txt.match(/^(extra\s*high|high|medium|instant|low)$/i);
      return m?m[1].replace(/\s+/g,' ').toLowerCase():'';
    };
    for(const sel of ['[data-testid*="reasoning" i]','[data-testid*="effort" i]','button[aria-label*="reasoning" i]','button[aria-label*="thinking" i]','button[aria-label*="effort" i]']){
      for(const el of root.querySelectorAll?.(sel)||[]){const v=canonical([el.textContent,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' '));if(v)return v;}
    }
    for(const el of root.querySelectorAll?.('button,[role="button"]')||[]){const v=canonical(C.text(el.textContent,50));if(v)return v;}
    return '';
  }
  function cleanRequest(raw,at){
    const snap=R.snapshot({...raw,at});
    return {...snap,messageId:C.text(raw?.messageId,160)};
  }
  function observeRequestMessage(e){
    if(e.source!==window||e.origin!==location.origin)return;
    const d=e.data;if(!d||d.source!==MODEL_SOURCE||d.type!=='MODEL_OBSERVED'||!Number.isFinite(d.at))return;
    const snap=cleanRequest(d.snapshot,d.at);recentRequest=snap;
    const candidates=receipts.filter(r=>!r.counted&&!r.failed&&!r.request&&d.at>=r.ts-300&&d.at-r.ts<7000);
    const target=candidates.at(-1);
    if(target){target.request=snap;if(snap.messageId)target.requestMessageId=snap.messageId;}
    void check();
  }
  function requestFor(r){return r.request||(recentRequest&&recentRequest.at>=r.ts-250&&recentRequest.at-r.ts<7000?recentRequest:null);}
  function identity(n){
    if(!(n instanceof Element))return '';
    const direct=n.getAttribute('data-message-id')||n.getAttribute('data-message-uuid');
    if(direct)return direct;
    const root=n.closest('[data-message-id],[data-message-uuid],[data-turn-id],[data-testid^="conversation-turn-"]');
    const messageId=root?.getAttribute('data-message-id')||root?.getAttribute('data-message-uuid');
    if(messageId)return messageId;
    const turnId=root?.getAttribute('data-turn-id');if(turnId)return `turn:${turnId}`;
    const testId=root?.getAttribute('data-testid')||'';
    return /^conversation-turn-/.test(testId)?`turn-index:${location.pathname}:${testId}`:'';
  }
  function remember(n){if(!(n instanceof Element))return;knownNodes.add(n);const id=identity(n);if(id)knownIDs.add(id);}
  function scan(root=document){if(root instanceof Element&&root.matches(messageSelector))remember(root);for(const n of root.querySelectorAll?.(messageSelector)||[])remember(n);}
  function composer(){return document.querySelector('#prompt-textarea')||document.querySelector('form textarea,form [contenteditable="true"],[data-testid*="composer"] [contenteditable="true"]');}
  function value(n){return normalize(n?.value??n?.innerText??n?.textContent);}
  function sendButton(n){
    const q='[data-testid="send-button"],[role="button"][data-testid*="send-button"],button[data-testid*="send-button"],button[aria-label="Send prompt"],button[aria-label="Send message"],button[aria-label="Send"],[role="button"][aria-label="Send prompt"],[role="button"][aria-label="Send message"],[role="button"][aria-label="Send"],button[aria-label="发送消息"],button[aria-label="发送提示"],[role="button"][aria-label="发送消息"],[role="button"][aria-label="发送提示"]';
    return n?.closest('form')?.querySelector(q)||document.querySelector(q);
  }
  function disabled(b){return b&&(b.disabled||b.getAttribute('aria-disabled')==='true');}
  function tailNode(){const xs=document.querySelectorAll(messageSelector);return xs[xs.length-1]||null;}
  function sameRoute(r){return r.route===route||(r.route==='/'&&/^\/c\/[^/]+$/.test(route));}
  function syncRoute(){
    const next=location.pathname;if(next===route)return;
    const previous=route;let retained=false;
    if(previous==='/'&&/^\/c\/[^/]+$/.test(next)){
      for(const r of receipts)if(r.route===previous&&!r.counted&&!r.failed&&Date.now()-r.ts<TTL){r.route=next;retained=true;}
    }else{
      for(const r of receipts)if(!r.counted&&!r.failed&&r.route!==next)r.failed=true;
    }
    route=next;
    // On the first / -> /c/:id transition, the newly-rendered user turn may
    // already be in the DOM. Do not baseline-scan it away before matching.
    if(!retained)scan();
  }
  function armText(editor,text,button,allowDisabled=false){
    syncRoute();if(!editor||!text||(!allowDisabled&&disabled(button||sendButton(editor))))return;
    const now=Date.now(),last=receipts.at(-1);
    if(last&&!last.failed&&!last.counted&&last.editor===editor&&last.route===route&&last.text===text&&now-last.ts<1600)return;
    scan();
    receipts.push({id:crypto.randomUUID(),text,ts:now,route,editor,tail:tailNode(),domModel:modelLabel(),domEffort:effortLabel(),request:null,requestMessageId:'',observed:false,node:null,observedAt:0,counted:false,counting:false,failed:false,consumed:value(editor)!==text,errors:new Map([...document.querySelectorAll('[role="alert"],[data-testid*="error"]')].map(n=>[n,normalize(n.textContent)]))});
    if(receipts.length>40)receipts.shift();
    setTimeout(()=>void check(),SETTLE);
  }
  function arm(_e,button){const editor=composer();if(!editor)return;armText(editor,value(editor),button);}
  function failed(r,n){
    const turn=n?.closest('article,[data-testid^="conversation-turn"]')||n;
    if(n?.getAttribute('data-message-status')==='failed')return true;
    if(turn?.querySelector('[data-testid*="error"],[data-message-status="failed"]'))return true;
    return [...document.querySelectorAll('[role="alert"],[data-testid*="error"]')].some(x=>r.errors.get(x)!==normalize(x.textContent)&&normalize(x.textContent));
  }
  function afterTail(r,n){
    if(!r.tail||!r.tail.isConnected)return true;
    if(r.tail===n)return false;
    return !!(r.tail.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING);
  }
  function candidateFor(r,candidates){
    if(r.requestMessageId){const exact=candidates.find(n=>identity(n)===r.requestMessageId);if(exact)return exact;}
    const textMatch=candidates.find(n=>afterTail(r,n)&&value(n)===r.text);if(textMatch)return textMatch;
    // DOM user-message identity is the final confirmation. If Markdown, links,
    // attachments or context wrappers changed the rendered text, preserve send
    // order instead of requiring impossible full-text equality.
    if(r.request||r.consumed||value(composer())!==r.text)return candidates.find(n=>afterTail(r,n))||null;
    return null;
  }
  async function count(r){
    const id=identity(r.node);if(r.counted||r.counting||!id||failed(r,r.node)||Date.now()-r.observedAt<SETTLE)return;
    r.counting=true;
    try{
      const eventId=await digest(`gpt-tracker:user:${id}`);
      const resolved=R.resolve({request:requestFor(r),domModel:r.domModel,domEffort:r.domEffort});
      const response=await send({type:'UG_EVENT',event:{id:eventId,scope:C.LOCAL_SCOPE,ts:r.ts,model:resolved.model,effort:resolved.effort,tier:resolved.tier,modelSource:resolved.source}});
      if(response?.ok){r.counted=true;knownIDs.add(id);knownNodes.add(r.node);}
    }catch{}finally{r.counting=false;}
  }
  async function check(){
    if(checking||disposed)return;checking=true;
    try{
      syncRoute();const now=Date.now();
      for(const r of receipts)if(!r.counted&&!r.failed&&now-r.ts>TTL)r.failed=true;
      const candidates=[...document.querySelectorAll(messageSelector)].filter(n=>{const id=identity(n);return id&&!knownIDs.has(id)&&!knownNodes.has(n);});
      for(const r of receipts){
        if(r.counted||r.failed||!sameRoute(r))continue;
        if(!r.observed){
          const n=candidateFor(r,candidates);if(!n)continue;
          const idx=candidates.indexOf(n);if(idx>=0)candidates.splice(idx,1);
          if(failed(r,n)){r.failed=true;remember(n);continue;}
          r.observed=true;r.node=n;r.observedAt=Date.now();knownNodes.add(n);
        }
        if(r.node?.isConnected){if(failed(r,r.node)){r.failed=true;const id=identity(r.node);if(id)knownIDs.add(id);}else await count(r);}
      }
      while(receipts.length&&(receipts[0].counted||receipts[0].failed)&&now-receipts[0].ts>5000)receipts.shift();
    }finally{checking=false;}
  }
  function onClick(e){
    const b=e.target instanceof Element?e.target.closest('button,[role="button"]'):null;if(!b)return;
    const id=b.getAttribute('data-testid')||'',label=(b.getAttribute('aria-label')||'').trim();
    if(id.includes('send-button')||/^send(?:\s+(?:prompt|message))?$/i.test(label)||/^(?:发送消息|发送提示)$/.test(label))arm(e,b);
  }
  function onSubmit(e){const n=composer();if(n&&e.target instanceof HTMLFormElement&&e.target.contains(n))arm(e);}
  function onKeydown(e){if(e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey||e.isComposing||e.repeat)return;const n=composer();if(n&&(n===e.target||n.contains(e.target)))arm(e);}
  let draftEditor=null,lastDraft='';
  function onInput(e){
    const editor=composer();if(!editor||!(editor===e.target||editor.contains(e.target)))return;
    const draft=value(editor),previous=draftEditor===editor?lastDraft:'';
    // UI-independent send fallback: modern ChatGPT may clear the composer after
    // a successful send without surfacing a stable click/submit event to the
    // isolated world. Arm the cleared draft, then still require a rendered user
    // turn before the DOM fallback can count it.
    if(previous&&!draft)armText(editor,previous,null,true);
    draftEditor=editor;lastDraft=draft;
    for(const r of receipts)if(!r.counted&&!r.failed&&r.editor===editor&&draft!==r.text)r.consumed=true;
    void check();
  }
  function onPopstate(){syncRoute();void check();}
  window.addEventListener('message',observeRequestMessage,false);
  document.addEventListener('click',onClick,true);
  document.addEventListener('submit',onSubmit,true);
  document.addEventListener('keydown',onKeydown,true);
  document.addEventListener('input',onInput,true);
  window.addEventListener('popstate',onPopstate);
  scan();
  draftEditor=composer();lastDraft=value(draftEditor);
  observer=new MutationObserver(records=>{
    syncRoute();
    if(receipts.some(r=>!r.counted&&!r.failed))void check();
    else for(const record of records){if(record.type==='attributes')scan(record.target);else for(const n of record.addedNodes)if(n instanceof Element)scan(n);}
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-message-id','data-message-status']});
  timer=setInterval(()=>{if(receipts.some(r=>!r.counted&&!r.failed))void check();else syncRoute();},500);
  globalThis.__gptTrackerCleanup=()=>{
    disposed=true;clearInterval(timer);observer?.disconnect();
    window.removeEventListener('message',observeRequestMessage,false);
    document.removeEventListener('click',onClick,true);document.removeEventListener('submit',onSubmit,true);document.removeEventListener('keydown',onKeydown,true);document.removeEventListener('input',onInput,true);window.removeEventListener('popstate',onPopstate);
  };

  async function readJSON(path,headers={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{const res=await fetch(path,{method:'GET',credentials:'include',headers:{accept:'application/json',...headers},signal:controller.signal,redirect:'error',cache:'no-store'});if(!res.ok)throw Object.assign(Error('http'),{status:res.status});return await res.json();}
    finally{clearTimeout(timer);}
  }
  function bootstrapToken(){try{const d=JSON.parse(document.getElementById('client-bootstrap')?.textContent||'{}');return C.text(d?.session?.accessToken||d?.session?.access_token,8000);}catch{return '';}}
  async function capture(manual=false){
    if(document.hidden&&!manual)return {ok:false,status:'hidden'};
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      try{
        let token=manual?'':bootstrapToken();
        if(!token){const data=await readJSON('/api/auth/session');token=C.text(data?.accessToken||data?.access_token||data?.session?.accessToken,8000);}
        if(document.hidden&&!manual)return {ok:false,status:'hidden'};
        const headers={'oai-language':navigator.language||'en-US'};if(token)headers.authorization=`Bearer ${token}`;
        const snapshot=C.normalizeWham(await readJSON('/backend-api/wham/usage',headers));token='';
        if(!snapshot.plan&&!snapshot.meters.length&&!snapshot.credits)throw Object.assign(Error('invalid'),{status:'invalid-response'});
        const stored=await send({type:'UG_SERVER_USAGE',snapshot});return {ok:!!stored.ok,status:stored.ok?'ok':'store-failed'};
      }catch(e){const status=e.name==='AbortError'?'timeout':e.status||'network-error';await send({type:'UG_SERVER_ERROR',error:{status,ts:Date.now()}});return {ok:false,status,sessionRenewed:manual};}
      finally{inFlight=null;}
    })();return inFlight;
  }
  const poll=()=>{if(!document.hidden)void send({type:'UG_POLL_LIVE'});};
  const pollDelay=setTimeout(poll,1200),pollTimer=setInterval(poll,5*60*1000);
  document.addEventListener('visibilitychange',poll);
  const onRuntimeMessage=(msg,_sender,reply)=>{
    if(msg?.type==='UG_TRACKER_PING'){reply({ok:true,version:TRACKER_VERSION});return false;}
    if(msg?.type!=='UG_CAPTURE_SERVER')return false;
    capture(msg.manual===true).then(reply);return true;
  };
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  const trackerCleanup=globalThis.__gptTrackerCleanup;
  globalThis.__gptTrackerCleanup=()=>{
    try{trackerCleanup?.();}catch{}
    clearTimeout(pollDelay);clearInterval(pollTimer);document.removeEventListener('visibilitychange',poll);
    try{chrome.runtime.onMessage.removeListener(onRuntimeMessage);}catch{}
  };
})();
