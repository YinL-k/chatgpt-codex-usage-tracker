/* Our iframe only. Trusted native sends + non-blocking, per-message receipts.
   No model API calls, synthetic second click, or previous-send lock. */
(() => {
  'use strict';
  const origin=chrome.runtime.getURL('').replace(/\/$/,'');
  if(window.top===window||location.origin!=='https://chatgpt.com'||location.ancestorOrigins?.[0]!==origin)return;
  if(globalThis.__sakuraChatAdapterV1)return;globalThis.__sakuraChatAdapterV1=true;
  const K=SakuraSideCore,R=SakuraModelResolver,bridgeID=crypto.randomUUID(),SELECTOR='[data-message-author-role="user"]',MODEL_SOURCE='SAKURA_MODEL_OBSERVER_V2';
  let dismissedSource='',captureSource='',pageDismissed=false;
  let port=null,context=null,labels={},theme='dark',captureStatus='',prepared={},statusLast='',lastAnnounce=0;
  let queued=0,writing=false,editorLast=null,rawRoute=location.pathname,route=chatID()||'draft:'+crypto.randomUUID();
  let lastPrepared='',disposed=false,observer=null,recentRequest=null;
  const receipts=[],knownNodes=new WeakSet(),knownIDs=new Set();
  const provisionalTTL=8000,receiptTTL=60000;
  const NATIVE_STYLE_ID='sakura-sidechat-native-style',NATIVE_BAR_ID='sakura-sidechat-native-bar',NATIVE_BRAND_ID='sakura-native-brand-svg';
  function hideNativeModeSwitch(){
    const controls=[...document.querySelectorAll('button,[role="button"],[role="tab"]')]
      .filter(el=>el instanceof HTMLElement&&el.offsetParent!==null);
    const byLabel=label=>controls.find(el=>norm(el.textContent).toLowerCase()===label);
    const chat=byLabel('chat'),work=byLabel('work');
    if(!chat||!work)return;
    let common=chat.parentElement;
    while(common&&common!==document.body&&!common.contains(work))common=common.parentElement;
    if(common&&common!==document.body){
      const r=common.getBoundingClientRect();
      if(r.top<180&&r.height<100&&r.width<520){common.dataset.sakuraHideModeSwitch='true';return;}
    }
    chat.dataset.sakuraHideModeSwitch='true';work.dataset.sakuraHideModeSwitch='true';
  }
  function visibleRect(el){
    if(!(el instanceof HTMLElement)||!el.getClientRects().length)return null;
    const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return null;
    const r=el.getBoundingClientRect();
    return r.width>0&&r.height>0?r:null;
  }
  function nativeSidebar(){
    const candidates=[...document.querySelectorAll('nav,aside,[data-testid*="sidebar" i],[aria-label*="sidebar" i],[class*="sidebar" i]')];
    for(const el of candidates){
      const r=visibleRect(el);if(!r)continue;
      if(r.left<=8&&r.top<120&&r.width>=190&&r.width<=Math.min(430,innerWidth*.78)&&r.height>=innerHeight*.62)return el;
    }
    return null;
  }
  function installNativeBrandSvg(){
    const existing=document.getElementById(NATIVE_BRAND_ID);
    if(existing?.isConnected)return true;
    const sidebar=nativeSidebar(),scope=sidebar||document;
    const candidates=[...scope.querySelectorAll('svg')].filter(svg=>{
      if(svg.id===NATIVE_BRAND_ID||svg.closest(`#${NATIVE_BAR_ID}`)||svg.closest('[data-sakura-sidechat]'))return false;
      const r=visibleRect(svg);if(!r)return false;
      const aspect=r.width/Math.max(1,r.height);
      // ChatGPT's native wordmark is a wide, shallow SVG in the top-left header.
      // Icon buttons (search/sidebar/etc.) are square and therefore rejected.
      return r.top<=92&&r.left<=210&&r.width>=54&&r.width<=170&&r.height>=10&&r.height<=38&&aspect>=3.0;
    });
    const source=candidates.sort((a,b)=>{
      const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
      return ar.top-br.top||ar.left-br.left;
    })[0];
    if(!source)return false;

    const ns='http://www.w3.org/2000/svg';
    const brand=document.createElementNS(ns,'svg');
    brand.id=NATIVE_BRAND_ID;brand.setAttribute('viewBox','0 0 126 24');brand.setAttribute('width','126');brand.setAttribute('height','24');
    brand.setAttribute('role','img');brand.setAttribute('aria-label','SakuraMeter');brand.dataset.sakuraNativeBrand='true';
    const image=document.createElementNS(ns,'image');
    image.setAttribute('href',chrome.runtime.getURL('assets/sakurameter-32.png'));image.setAttribute('x','0');image.setAttribute('y','1');image.setAttribute('width','22');image.setAttribute('height','22');
    const text=document.createElementNS(ns,'text');
    text.setAttribute('x','30');text.setAttribute('y','17');text.setAttribute('class','sm-native-wordmark-text');text.textContent='SakuraMeter';
    brand.append(image,text);
    source.replaceWith(brand);

    let holder=brand.parentElement;
    for(let i=0;holder&&i<4;i++,holder=holder.parentElement){
      holder.dataset.sakuraNativeBrand='true';
      if(norm(holder.getAttribute('aria-label'))==='ChatGPT')holder.setAttribute('aria-label','SakuraMeter');
      if(norm(holder.getAttribute('title'))==='ChatGPT')holder.setAttribute('title','SakuraMeter');
    }
    return true;
  }
  function syncNativeChrome(){
    hideNativeModeSwitch();installNativeBrandSvg();
    const bar=document.getElementById(NATIVE_BAR_ID),sidebar=nativeSidebar();
    if(!bar)return;
    // Keep the SakuraMeter bar below ChatGPT's sidebar at all times. The previous
    // implementation waited for the sidebar to reach a width threshold and then
    // changed z-index, which caused a visible 1-2 frame jump during opening.
    bar.dataset.sidebarOpen=sidebar?'true':'false';
  }
  function ensureNativeStyle(){
    let style=document.getElementById(NATIVE_STYLE_ID);
    if(style)return style;
    style=document.createElement('style');style.id=NATIVE_STYLE_ID;
    style.textContent=`
      [data-sakura-hide-mode-switch="true"]{display:none!important}
      html[data-sakura-sidechat-theme="dark"]{
        --main-surface-primary:#08080b!important;--main-surface-secondary:#0d0c10!important;
        --sidebar-surface-primary:#09090c!important;--sidebar-surface-secondary:#0e0d11!important;
      }
      html[data-sakura-sidechat-theme="light"]{
        --main-surface-primary:#fbf7f9!important;--main-surface-secondary:#f7eff3!important;
        --sidebar-surface-primary:#faf4f7!important;--sidebar-surface-secondary:#f3e9ef!important;
      }
      html[data-sakura-sidechat-theme] body{
        background:
          radial-gradient(70% 42% at 50% -8%,rgba(239,150,190,.055),transparent 72%),
          radial-gradient(55% 45% at 105% 55%,rgba(206,104,155,.035),transparent 76%),
          var(--main-surface-primary)!important;
      }
      html[data-sakura-sidechat-theme="light"] body{
        background:
          radial-gradient(70% 42% at 50% -8%,rgba(202,99,148,.055),transparent 72%),
          radial-gradient(55% 45% at 105% 55%,rgba(225,143,177,.045),transparent 76%),
          var(--main-surface-primary)!important;
      }
      [data-sakura-native-brand="true"]{
        font-family:Georgia,"Times New Roman",serif!important;letter-spacing:-.2px!important;
      }
      #${NATIVE_BRAND_ID}{width:126px!important;height:24px!important;display:block!important;overflow:visible!important;color:rgba(247,240,244,.96);flex:none}
      #${NATIVE_BRAND_ID} .sm-native-wordmark-text{fill:currentColor;font:600 15.6px Georgia,"Times New Roman",serif;letter-spacing:-.25px;dominant-baseline:auto}
      html[data-sakura-sidechat-theme="light"] #${NATIVE_BRAND_ID}{color:rgba(67,42,54,.95)}
      #${NATIVE_BAR_ID}{
        --sm-fg:rgba(247,240,244,.95);--sm-muted:rgba(220,199,210,.72);--sm-panel:rgba(14,12,16,.58);
        --sm-hover:rgba(239,171,200,.10);--sm-glow:rgba(239,157,193,.19);--sm-green:#9fd2ad;
        position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:20;
        width:max-content;max-width:calc(100vw - 72px);height:42px;
        display:flex;align-items:center;gap:9px;padding:5px 8px 5px 5px;border:0;border-radius:13px;
        background:linear-gradient(112deg,rgba(28,22,27,.68),rgba(12,12,15,.48));
        -webkit-backdrop-filter:blur(18px) saturate(1.12);backdrop-filter:blur(18px) saturate(1.12);
        color:var(--sm-fg);
        box-shadow:inset 0 1px 0 rgba(255,231,241,.055),0 8px 28px rgba(0,0,0,.12),0 0 28px var(--sm-glow);
        font:500 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:auto;
        transition:transform .26s cubic-bezier(.22,1,.36,1),box-shadow .22s ease,background .22s ease,opacity .22s ease;animation:sm-native-bar-in .48s cubic-bezier(.22,1,.36,1) both;
      }
      #${NATIVE_BAR_ID}:hover{transform:translateX(-50%) translateY(-1px);}
      #${NATIVE_BAR_ID}[data-sidebar-open="true"]{box-shadow:0 5px 18px rgba(0,0,0,.08),0 0 18px color-mix(in srgb,var(--sm-glow) 62%,transparent)}
      html[data-sakura-sidechat-theme="light"] #${NATIVE_BAR_ID}{
        --sm-fg:rgba(67,42,54,.94);--sm-muted:rgba(112,79,94,.72);--sm-panel:rgba(255,248,251,.72);
        --sm-hover:rgba(190,83,131,.075);--sm-glow:rgba(204,104,148,.11);--sm-green:#4b835d;
        background:linear-gradient(112deg,rgba(255,249,251,.82),rgba(255,255,255,.58));
        box-shadow:inset 0 1px 0 rgba(255,255,255,.80),0 7px 24px rgba(111,60,84,.055),0 0 22px var(--sm-glow);
      }
      #${NATIVE_BAR_ID} .sm-mark{width:28px;height:28px;border-radius:9px;object-fit:cover;flex:none;filter:drop-shadow(0 2px 7px var(--sm-glow))}
      #${NATIVE_BAR_ID} .sm-brand{display:flex;align-items:baseline;gap:7px;min-width:0;white-space:nowrap}
      #${NATIVE_BAR_ID} .sm-name{font-family:Georgia,"Times New Roman",serif;font-size:15px;font-weight:600;letter-spacing:-.2px;color:var(--sm-fg)}
      #${NATIVE_BAR_ID} .sm-slash{color:var(--sm-muted);opacity:.48}
      #${NATIVE_BAR_ID} .sm-context{color:var(--sm-muted);font-size:11px;font-weight:560;letter-spacing:.04px}
      #${NATIVE_BAR_ID} .sm-actions{display:flex;align-items:center;gap:1px;margin-left:1px}
      #${NATIVE_BAR_ID} button{width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:9px;background:transparent;color:var(--sm-muted);padding:0;cursor:pointer;transition:transform .18s cubic-bezier(.22,1,.36,1),background .18s ease,color .18s ease}
      #${NATIVE_BAR_ID} button:hover{background:var(--sm-hover);color:var(--sm-fg);transform:translateY(-1px) scale(1.05)}
      #${NATIVE_BAR_ID} button:active{transform:scale(.94)}
      #${NATIVE_BAR_ID} button:focus-visible{outline:2px solid rgba(235,161,192,.55);outline-offset:2px}
      #${NATIVE_BAR_ID} .sm-status-dot{width:7px;height:7px;border-radius:50%;background:var(--sm-green);box-shadow:0 0 10px color-mix(in srgb,var(--sm-green) 48%,transparent);animation:sm-native-status 5.6s ease-in-out infinite}
      #${NATIVE_BAR_ID}[data-status="loading"] .sm-status-dot{background:#c8aa79}
      #${NATIVE_BAR_ID}[data-status="paused"] .sm-status-dot{background:#d1aa72}
      #${NATIVE_BAR_ID}[data-status="error"] .sm-status-dot{background:#dc8798}
      #${NATIVE_BAR_ID} svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      @keyframes sm-native-bar-in{from{opacity:0;transform:translateX(-50%) translateY(-8px) scale(.97)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
      @keyframes sm-native-brand-in{from{opacity:0;transform:translateX(-5px) scale(.97)}to{opacity:1;transform:none}}
      @keyframes sm-native-status{0%,4%,100%{transform:scale(1);opacity:.82}7%{transform:scale(1.28);opacity:1}10%{transform:scale(1);opacity:.9}}
      #${NATIVE_BRAND_ID}{animation:sm-native-brand-in .42s cubic-bezier(.22,1,.36,1) both;transform-origin:left center}
      @media(max-width:420px){#${NATIVE_BAR_ID}{max-width:calc(100vw - 42px)}#${NATIVE_BAR_ID} .sm-context,#${NATIVE_BAR_ID} .sm-slash{display:none}}
      @media(prefers-reduced-motion:reduce){#${NATIVE_BAR_ID},#${NATIVE_BRAND_ID},#${NATIVE_BAR_ID} .sm-status-dot{animation:none!important;transition:none!important}}
    `;
    (document.head||document.documentElement).appendChild(style);return style;
  }
  function nativeAction(action){
    try{window.parent.postMessage({source:'SAKURA_SIDECHAT_FRAME',type:'SC_UI_ACTION',action},origin);}catch{}
  }
  function ensureNativeBar(){
    ensureNativeStyle();
    document.documentElement.dataset.sakuraSidechatTheme=theme;
    syncNativeChrome();
    let bar=document.getElementById(NATIVE_BAR_ID);
    if(!bar&&document.body){
      bar=document.createElement('div');bar.id=NATIVE_BAR_ID;bar.dataset.sakuraSidechat='native-bar';
      const icon=chrome.runtime.getURL('assets/sakurameter-32.png');
      bar.innerHTML=`<img class="sm-mark" src="${icon}" alt=""><span class="sm-brand"><span class="sm-name">SakuraMeter</span><span class="sm-slash">/</span><span class="sm-context">Side Chat</span></span><span class="sm-actions"><button type="button" data-sm-action="status" aria-label="Side Chat status"><span class="sm-status-dot"></span></button><button type="button" data-sm-action="more" aria-label="SakuraMeter menu"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></button></span>`;
      bar.addEventListener('click',e=>{const b=e.target instanceof Element?e.target.closest('button[data-sm-action]'):null;if(b)nativeAction(b.dataset.smAction);});
      document.body.appendChild(bar);
    }
    if(bar){
      bar.dataset.status=captureStatus==='paused'?'paused':captureStatus==='restricted'||captureStatus==='access-needed'?'error':port?'ready':'loading';
      syncNativeChrome();
    }
  }
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
  const t=k=>labels[k]||({shortPage:'Page',shortSelection:'Selection',viewContext:'Show reference',hideContext:'Hide reference',preview:'Preview reference',remove:'Remove highlight',quoteNote:'References are added when needed.',localFoldNote:'Local display only. The reference remains in the sent message.'})[k]||k;
  const post=m=>{try{port?.postMessage(m);}catch{}};
  function composer(){return document.querySelector('#prompt-textarea[contenteditable="true"],textarea#prompt-textarea')||document.querySelector('form textarea,form [contenteditable="true"],[data-testid*="composer"] [contenteditable="true"]');}
  function read(el){return el?(typeof el.value==='string'?el.value:el.innerText||el.textContent||''):'';}
  function sendButton(el=composer()){
    const q='[data-testid="send-button"],button[data-testid*="send-button"],button[aria-label="Send prompt"],button[aria-label="Send message"],button[aria-label="Send"],button[aria-label="\u53d1\u9001\u6d88\u606f"],button[aria-label="\u53d1\u9001\u63d0\u793a"]';
    return el?.closest('form')?.querySelector(q)||document.querySelector(q);
  }
  function modelLabel(){
    const clean=raw=>K.clean(raw,90).replace(/[\s\u00a0]+/g,' ').replace(/[›⌄▾\s]+$/g,'').trim();
    const exact=/^(?:gpt[- ]?)?6\s+pro$/i;
    const fromAria=raw=>{const a=clean(raw),m=a.match(/(?:current\s+model(?:\s+is)?|model)[:\s-]*((?:gpt[- ]?)?6\s+pro)\b/i);return m?clean(m[1]):'';};
    const direct=['[data-testid="model-switcher-dropdown-button"]','button[aria-label*="model" i]','button[data-testid*="model" i]'];
    for(const sel of direct){
      const el=document.querySelector(sel);if(!el)continue;
      const txt=clean(el.textContent);if(txt)return txt;
      const aria=fromAria([el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' '));if(aria)return aria;
    }
    // Newer ChatGPT builds can render "6 Pro" as a plain model button with
    // no stable model-specific test id. Match only an exact clickable model
    // label; never infer the model from conversation text.
    for(const el of document.querySelectorAll('button,[role="button"]')){
      const txt=clean(el.textContent);if(exact.test(txt))return txt;
      const aria=fromAria([el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' '));if(aria)return aria;
    }
    return '';
  }
  function effortLabel(){
    const root=composer()?.closest('form')||document;
    const canonical=raw=>{
      const txt=K.clean(raw,90),m=txt.match(/(?:^|[\s:·|()\-])(extra\s*high|high|medium|instant|low)(?:$|[\s:·|()\-])/i)||txt.match(/^(extra\s*high|high|medium|instant|low)$/i);
      return m?m[1].replace(/\s+/g,' ').toLowerCase():'';
    };
    for(const sel of ['[data-testid*="reasoning" i]','[data-testid*="effort" i]','button[aria-label*="reasoning" i]','button[aria-label*="thinking" i]','button[aria-label*="effort" i]']){
      for(const el of root.querySelectorAll?.(sel)||[]){const v=canonical([el.textContent,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' '));if(v)return v;}
    }
    for(const el of root.querySelectorAll?.('button,[role="button"]')||[]){const v=canonical(K.clean(el.textContent,50));if(v)return v;}
    return '';
  }
  function observeRequestMessage(e){
    if(e.source!==window||e.origin!==location.origin)return;
    const d=e.data;if(!d||d.source!==MODEL_SOURCE||d.type!=='MODEL_OBSERVED'||!Number.isFinite(d.at))return;
    const snap=R.snapshot({...d.snapshot,at:d.at});recentRequest=snap;
    for(let i=receipts.length-1;i>=0;i--){const r=receipts[i];if(!r.counted&&d.at>=r.at-250&&d.at-r.at<7000){r.request=snap;break;}}
  }
  window.addEventListener('message',observeRequestMessage,false);
  const disabled=b=>!b||b.disabled||b.getAttribute('aria-disabled')==='true';
  const messageID=n=>{
    if(!(n instanceof Element))return '';
    const direct=n.getAttribute('data-message-id')||n.getAttribute('data-message-uuid');if(direct)return direct;
    const root=n.closest('[data-message-id],[data-message-uuid],[data-turn-id],[data-testid^="conversation-turn-"]');
    const mid=root?.getAttribute('data-message-id')||root?.getAttribute('data-message-uuid');if(mid)return mid;
    const tid=root?.getAttribute('data-turn-id');if(tid)return `turn:${tid}`;
    const test=root?.getAttribute('data-testid')||'';return /^conversation-turn-/.test(test)?`turn-index:${route}:${test}`:'';
  };
  function chatID(){return location.pathname.match(/\/c\/([^/]+)/)?.[1]||'';}
  function syncRoute(){
    if(rawRoute===location.pathname)return;
    const previous=route,nextID=chatID();
    if(previous.startsWith('draft:')&&nextID&&receipts.some(r=>r.route===previous&&Date.now()-r.at<30000)){
      route=nextID;
      for(const r of receipts)if(r.route===previous)r.route=route;
    }else route=nextID||'draft:'+crypto.randomUUID();
    rawRoute=location.pathname;lastPrepared='';
  }
  function setText(el,text){
    el.focus();
    if(el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement){
      const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(el,text);
      el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
    }else{
      const selectAll=()=>{const range=document.createRange();range.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(range);};
      selectAll();
      let inserted=false;
      // insertText creates one editing block per line in Chromium and can become
      // quadratic for long references. A safely encoded plaintext fragment keeps
      // the native edit/undo/input event, without thousands of transient nodes.
      if(text.length>1000 || text.split('\n').length>20){
        const span=document.createElement('span');span.style.whiteSpace='pre-wrap';span.textContent=text;
        inserted=document.execCommand('insertHTML',false,span.outerHTML) && read(el).trimEnd()===text.trimEnd();
      }
      // Rich editors that normalize the fragment can use the original native path.
      if(!inserted){selectAll();if(!document.execCommand('insertText',false,text))throw Error('editor_rejected');}
    }
    if(el!==composer()||norm(read(el))!==norm(text))throw Error('editor_unconfirmed');
  }
  function rebuild(){
    const key=[context?.id,K.pageKey(context),K.selectionKey(context)].join('|');
    if(key===lastPrepared)return;lastPrepared=key;
    prepared={full:K.prepare(context),page:K.prepare(context,{includeSelection:false}),focus:K.prepare(context,{includePage:false})};
  }
  const view=SakuraSideView.create({composer,translate:t,onDismiss:item=>{dismissedSource=captureSource;pageDismissed=true;context={...item,page:null};post({type:'SC_DISMISS_PAGE',id:item.id});rebuild();render();},onRestore:()=>{dismissedSource='';pageDismissed=false;post({type:'SC_RESTORE_PAGE'});},onClear:item=>{
    post({type:'SC_CLEAR',id:item.id,selectionKey:K.selectionKey(item)});
    if(context?.id===item.id)context={...context,selection:null};rebuild();render();
  }});
  function render(){
    ensureNativeBar();
    if(!port)return;
    view.update(context,theme,pageDismissed);
    const el=composer();
    const status=JSON.stringify({type:'SC_STATUS',ready:!!el,hasDraft:!!read(el).trim(),url:location.origin+location.pathname});
    if(status!==statusLast){statusLast=status;post(JSON.parse(status));}
  }
  function handleSend(event){
    if(writing||!port)return;
    const el=composer(),question=read(el);
    if(!el||!question.trim()||disabled(sendButton(el)))return; // Never override ChatGPT's generation/IME controls.
    syncRoute();rebuild();
    // Capture -> native submit is one event chain. A user retry of the same
    // rewritten draft also proceeds unchanged, with no duplicate wrapper.
    if(receipts.some(r=>r.route===route&&!r.observed&&!r.consumed&&r.editor===el&&r.expectedNorm===norm(question)))return;
    const now=Date.now(),valid=K.validContext(context);
    const selected=valid?K.selectionKey(context):'';
    const selectionInFlight=selected&&receipts.some(r=>r.route===route&&!r.failed&&r.selectionKey===selected&&(r.observed||now-r.at<provisionalTTL));
    const usePage=valid&&!pageDismissed&&K.validPage(context.page);
    const useSelection=valid&&K.validSelection(context.selection)&&!selectionInFlight;
    let variant=usePage?(useSelection?prepared.full:prepared.page):(useSelection?prepared.focus:null);
    const id=crypto.randomUUID(),marker=variant?.body?'SAKURA_CONTEXT_'+id.replaceAll('-',''):'';
    const expected=K.wrap(question,variant,id);
    const nodes=document.querySelectorAll(SELECTOR),tail=nodes[nodes.length-1]||null;
    const r={id,at:now,route,editor:el,question,expected,expectedNorm:norm(expected),marker,tail,observed:false,counted:false,consumed:false,
      pageKey:variant?.pageKey||'',selectionKey:variant?.selectionKey||'',contextId:context?.id||'',
      domModel:modelLabel(),domEffort:effortLabel(),request:(recentRequest&&recentRequest.at>=now-250&&recentRequest.at-now<7000?recentRequest:null)};
    try{
      if(expected!==question){writing=true;setText(el,expected);writing=false;}
      receipts.push(r);
      if(receipts.length>30)receipts.shift();
      schedule();
      // NO preventDefault / synthetic send on the normal path.
    }catch{
      writing=false;
      // Only an actual editor-write failure cancels this one event. No timed lock.
      event.preventDefault();event.stopImmediatePropagation();
      try{if(el===composer())setText(el,question);}catch{}
      post({type:'SC_ERROR',key:'sendError'});schedule();
    }
  }
  window.addEventListener('keydown',e=>{
    if(e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey||e.isComposing||e.keyCode===229||e.repeat)return;
    const el=composer();if(el&&(el===e.target||el.contains(e.target)))handleSend(e);
  },true);
  window.addEventListener('click',e=>{const b=e.target instanceof Element?e.target.closest('button'):null;if(b&&b===sendButton())handleSend(e);},true);
  window.addEventListener('submit',e=>{const el=composer();if(el&&e.target instanceof HTMLFormElement&&e.target.contains(el))handleSend(e);},true);

  function failed(node){
    const turn=node.closest('article,[data-testid^="conversation-turn"]')||node;
    return node.getAttribute('data-message-status')==='failed'||!!turn.querySelector('[data-message-status="failed"],[data-testid*="error"]');
  }
  function accept(r,node){
    r.observed=true;r.node=node;r.observedAt=Date.now();
    if(r.selectionKey){
      if(context?.id===r.contextId&&K.selectionKey(context)===r.selectionKey){context={...context,selection:null};rebuild();}
      post({type:'SC_CONTEXT_USED',contextId:r.contextId,selectionKey:r.selectionKey});
    }
    view.fold(node,r);
  }
  async function count(r){
    const id=messageID(r.node);if(r.counted||!id||failed(r.node)||Date.now()-r.observedAt<350)return;
    if(knownIDs.has(id)){r.counted=true;return;}
    r.counted=true;knownIDs.add(id);
    try{
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('gpt-tracker:user:'+id));
      const eventId=[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
      const resolved=R.resolve({request:r.request,domModel:r.domModel,domEffort:r.domEffort});
      post({type:'SC_SENT',eventId,contextId:r.contextId,at:r.at,model:resolved.model,effort:resolved.effort,tier:resolved.tier,modelSource:resolved.source});
    }catch{} // Usage reporting never controls delivery.
  }
  function tick(){
    if(disposed)return;syncRoute();
    if(context&&!K.validContext(context)){context=null;rebuild();}
    const now=Date.now(),draft=read(composer());
    for(const r of receipts)if(r.editor===composer()&&norm(draft)!==r.expectedNorm)r.consumed=true;
    const candidates=receipts.length?[...document.querySelectorAll(SELECTOR)].slice(-16):[];
    for(const r of receipts){
      if(r.route!==route)continue;
      if(!r.observed&&now-r.at<receiptTTL){
        for(let i=candidates.length-1;i>=0;i--){
          const n=candidates[i],id=messageID(n);
          if(knownNodes.has(n)||id&&knownIDs.has(id)||r.tail===n)continue;
          if(r.tail?.isConnected&&!(r.tail.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
          // Rendered Markdown/links may differ from the submitted text. A random
          // per-send marker is stable; full-message equality and IDs are NOT required.
          const text=n.textContent||'';
          if(r.marker?!text.includes(r.marker):norm(text)!==norm(r.question))continue;
          if(failed(n)){r.failed=true;continue;}
          if(!r.consumed&&norm(draft)===r.expectedNorm)continue;
          knownNodes.add(n);accept(r,n);break;
        }
      }
      if(r.observed){
        // React can replace a message node. Reattach only with our own known marker.
        if(!r.node?.isConnected&&r.marker){r.node=candidates.find(n=>(n.textContent||'').includes(r.marker))||r.node;view.fold(r.node,r);}
        if(r.node?.isConnected){void count(r);if(failed(r.node)){r.failed=true;view.reveal(r.node);}}
      }
    }
    for(let i=receipts.length-1;i>=0;i--)if(now-receipts[i].at>receiptTTL){receipts.splice(i,1);}
    render();
  }
  function schedule(){if(queued||disposed)return;queued=setTimeout(()=>{queued=0;tick();},60);}
  function announce(){if(port||Date.now()-lastAnnounce<1500)return;lastAnnounce=Date.now();window.parent.postMessage({source:'SAKURA_SIDECHAT_FRAME',type:'SC_READY',bridgeID},origin);}
  window.addEventListener('message',e=>{
    if(e.origin!==origin||e.source!==window.parent||e.data?.source!=='SAKURA_SIDECHAT_PANEL'||e.data?.type!=='SC_CONNECT'||e.data?.bridgeID!==bridgeID||!e.ports?.[0])return;
    port?.close();port=e.ports[0];
    port.onmessage=event=>{
      const m=event.data;
      if(m?.type!=='SC_UPDATE')return;
      captureSource=m.source?.pageIdentity||m.source?.url||'';
      if(dismissedSource && captureSource!==dismissedSource)dismissedSource='';
      pageDismissed=!!m.pageDismissed||!!dismissedSource;
      context=K.validContext(m.context)?m.context:null;if(context&&pageDismissed)context={...context,page:null};labels=m.labels||{};theme=m.theme==='light'?'light':'dark';captureStatus=m.captureStatus||'';
      // Ignore worker echoes of an already-consumed old highlight, but retain newer selections.
      if(context?.selection&&receipts.some(r=>r.observed&&r.contextId===context.id&&r.selectionKey===K.selectionKey(context)))context={...context,selection:null};
      rebuild();render();view.refreshFolds();
    };
    port.start();statusLast='';render();
  });
  function observe(){
    document.querySelectorAll(SELECTOR).forEach(n=>{knownNodes.add(n);const id=messageID(n);if(id)knownIDs.add(id);});
    observer=new MutationObserver(records=>{
      if(records.some(r=>!(r.target instanceof Element?r.target:r.target.parentElement)?.closest('[data-sakura-sidechat]')))schedule();
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-message-id','data-message-status']});
    document.addEventListener('input',e=>{
      if(!writing){const el=composer();if(el&&(el===e.target||el.contains(e.target)))for(const r of receipts)if(r.editor===el)r.consumed=true;}
      schedule();
    },true);
  }
  if(document.documentElement)observe();else document.addEventListener('DOMContentLoaded',observe,{once:true});
  if(document.body)ensureNativeBar();else document.addEventListener('DOMContentLoaded',ensureNativeBar,{once:true});
  const timer=setInterval(()=>{announce();if(receipts.length||editorLast!==composer()||rawRoute!==location.pathname){editorLast=composer();schedule();}},500);
  window.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);clearTimeout(queued);observer?.disconnect();context=null;receipts.length=0;port?.close();});
  announce();
})();
