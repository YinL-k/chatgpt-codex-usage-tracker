(() => {
  'use strict';
  const $ = id => document.getElementById(id), frame = $('chat-frame');
  let lang = 'en', theme = 'dark', state = null, lifecycle = null, bridge = null, bridgeID = '', frameLoaded = false, hasDraft = false;
  let frameReady = false, connected = false;
  let windowId = null, disposed = false, reconnectTimer = 0, heartbeat = 0, helpTimer = 0, toastTimer = 0, transitionTimer = 0, previewFadeTimer = 0, revealFallbackTimer = 0, lastChatURL = 'https://chatgpt.com/';
  let chatVisible = false, pendingChatReveal = false, ambientHandoffAnimations = [];
  const t = key => SakuraSideStrings[lang]?.[key] || SakuraSideStrings.en[key] || key;
  function post(m) { try { lifecycle?.postMessage(m); } catch { connect(); } }
  function tellFrame() {
    try { bridge?.postMessage({ type: 'SC_UPDATE', context: state?.context || null, pageDismissed:state?.pageDismissed, source:state?.source, deduplicatePage:state?.deduplicatePage!==false, theme, lang, captureStatus: state?.status || '', labels: SakuraSideStrings[lang] }); } catch {}
  }
  function applyLanguage() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    document.querySelectorAll('[data-tip]').forEach(el => { el.title = t(el.dataset.tip); el.setAttribute('aria-label', t(el.dataset.tip)); });
    $('language-label').textContent = lang === 'zh' ? 'CN' : 'EN';
    render(); tellFrame();
  }
  function applyTheme(next) {
    theme = next === 'light' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme;
    localStorage.setItem('gptTrackerTheme', theme); tellFrame();
  }
  function toast(key) {
    clearTimeout(toastTimer); $('toast').textContent = t(key); $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 9000);
  }
  function connect() {
    if (disposed || windowId === null) return;
    clearTimeout(reconnectTimer); clearInterval(heartbeat);
    try {
      lifecycle = chrome.runtime.connect({ name: 'SC_PANEL_LIFETIME' });
      lifecycle.onMessage.addListener(m => {
        if (m.type === 'SC_PAGE_SNAPSHOT_RESULT') { try { bridge?.postMessage(m); } catch {} }
        if (m.type === 'SC_STATE') { state = m.state; connected = true; render(); tellFrame(); }
        if (m.type === 'SC_ERROR') toast(({ selection_too_long:'tooLong', page_unavailable:'unavailable' })[m.error] || 'connectionError');
      });
      lifecycle.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        if (!disposed) { connected = false; updateStatus(); reconnectTimer = setTimeout(connect, 600); }
      });
      lifecycle.postMessage({ type: 'SC_HELLO', windowId });
      heartbeat = setInterval(() => post({ type: 'SC_PING' }), 20000);
    } catch { reconnectTimer = setTimeout(connect, 1500); }
  }
  function render() {
    if (!state) return;
    $('page-reference-toggle').checked=!state.pageDismissed;
    $('deduplicate-page-toggle').checked=state.deduplicatePage!==false;
    const source = state.source;
    let host = ''; try { host = new URL(source?.url).hostname; } catch {}
    $('source-title').textContent = host || source?.title || t('sourceWaiting');
    $('source-title').title = source?.title || '';
    $('source-status').textContent = state.status === 'restricted' ? t('restricted') : state.status === 'paused' ? t('paused') : state.status === 'access-needed' ? t('access') : state.context?.selection ? t('selectionSafe') : state.context?.page ? t('pageReady') : t('selectHint');
    $('source-status').title = state.context?.source?.title || '';
    $('pause').querySelector('span').textContent = t(state.paused ? 'resume' : 'pause');
    $('pause').title = t(state.paused ? 'resume' : 'pause'); $('pause').setAttribute('aria-label', $('pause').title);
    $('pause').querySelector('use').setAttribute('href', state.paused ? '#i-play' : '#i-pause');
    $('settings-pause').textContent = t(state.paused ? 'resume' : 'pause');
    $('source-size').textContent = state.context?.page ? state.context.page.text.length.toLocaleString() + ' chars' + (state.context.page.truncated ? ' / ' + t('compactNote') : '') : '';
    updateStatus();
    $('accessbar').hidden = state.status !== 'access-needed' || !state.enabled;

    // As soon as the panel handshake installs the narrow ChatGPT
    // sub-frame rule, warm the iframe behind the onboarding screen. This keeps
    // login/session/bootstrap work off the user's Enable -> chat transition.
    if (state.embedAllowed && !frameLoaded) primeChat('https://chatgpt.com/');

    const available = state.enabled && state.embedAllowed;
    if (available) {
      pendingChatReveal = !chatVisible;
      if (frameReady) revealChat();
      else if (pendingChatReveal && !revealFallbackTimer) {
        // Adapter-ready is the preferred gate. Keep a conservative fallback so
        // a future ChatGPT DOM change cannot strand the user on onboarding.
        revealFallbackTimer = setTimeout(() => {
          revealFallbackTimer = 0;
          if (pendingChatReveal && state?.enabled && state?.embedAllowed) revealChat();
        }, 8000);
      }
    } else {
      pendingChatReveal = false;
      clearTimeout(revealFallbackTimer); revealFallbackTimer = 0;
      showPreview();
    }
  }
  function primeChat(url='https://chatgpt.com/') {
    if (frameLoaded) return;
    disposeBridge(); frameLoaded = true; frameReady = false;
    lastChatURL = url; syncChatSurface(url); frame.src = url;
    // The iframe stays hidden behind onboarding, but it is fully allowed to
    // bootstrap and connect its adapter. No visible loading flash is needed.
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => { if (chatVisible) $('load-help').hidden = false; }, 15000);
  }
  function cancelAmbientHandoff({ resumePreview = false } = {}) {
    for (const animation of ambientHandoffAnimations.splice(0)) {
      try { animation.cancel(); } catch {}
    }
    const flow = [...document.querySelectorAll('.sm-ambient-flow .sm-ambient-blob')];
    const flowLayer = document.querySelector('.sm-ambient-flow');
    const restLayer = document.querySelector('.sm-ambient-rest');
    for (const el of flow) {
      el.style.removeProperty('transform');
      el.style.removeProperty('opacity');
      el.style.removeProperty('animation');
      el.style.removeProperty('will-change');
    }
    for (const el of [flowLayer, restLayer]) {
      if (!el) continue;
      el.style.removeProperty('opacity');
      el.style.removeProperty('transform');
      el.style.removeProperty('will-change');
    }
    if (resumePreview) for (const el of flow) el.style.removeProperty('animation');
  }
  function startAmbientHandoff() {
    cancelAmbientHandoff();
    const flow = [...document.querySelectorAll('.sm-ambient-flow .sm-ambient-blob')];
    const restLayer = document.querySelector('.sm-ambient-rest');
    if (!restLayer || !flow.length) return;

    // Freeze the moving preview field at the exact frame the user clicked.
    // From there the live lights physically retreat out of the viewport while
    // the single static approved edge surface fades in underneath them.
    const frozen = flow.map(el => {
      const cs = getComputedStyle(el);
      return {
        el,
        transform: cs.transform === 'none' ? 'translate3d(0,0,0)' : cs.transform,
        opacity: Number.parseFloat(cs.opacity) || 1
      };
    });
    for (const item of frozen) {
      item.el.style.setProperty('animation', 'none', 'important');
      item.el.style.transform = item.transform;
      item.el.style.opacity = String(item.opacity);
      item.el.style.willChange = 'transform, opacity';
    }
    restLayer.style.willChange = 'opacity, transform';

    const exits = [
      'translate3d(-175px,-42px,0) rotate(-2deg) scale(.66)',
      'translate3d(165px,35px,0) rotate(2deg) scale(.64)',
      'translate3d(-135px,92px,0) rotate(-1.5deg) scale(.69)'
    ];
    const flowOptions = { duration: 1280, easing: 'cubic-bezier(.22,.72,.18,1)', fill: 'forwards' };
    frozen.forEach((item, i) => {
      ambientHandoffAnimations.push(item.el.animate([
        { transform: item.transform, opacity: item.opacity },
        { offset: .58, transform: item.transform, opacity: item.opacity * .82 },
        { transform: exits[i] || exits.at(-1), opacity: 0 }
      ], flowOptions));
    });
    ambientHandoffAnimations.push(restLayer.animate([
      { opacity: 0, transform: 'translateZ(0) scale(.992)' },
      { offset: .30, opacity: 0, transform: 'translateZ(0) scale(.992)' },
      { opacity: 1, transform: 'translateZ(0) scale(1)' }
    ], { duration: 1280, easing: 'cubic-bezier(.22,.72,.18,1)', fill: 'forwards' }));
  }
  function showPreview() {
    clearTimeout(transitionTimer); transitionTimer = 0;
    clearTimeout(previewFadeTimer); previewFadeTimer = 0;
    cancelAmbientHandoff({ resumePreview: true });
    document.body.classList.remove('sm-enter-chat','sm-content-reveal');
    document.body.dataset.sideStage = 'preview';
    chatVisible = false;
    $('welcome').hidden = false;
    $('chat-area').hidden = true;
  }
  function revealChat() {
    if (chatVisible || !state?.enabled || !state?.embedAllowed) return;
    pendingChatReveal = false;
    clearTimeout(revealFallbackTimer); revealFallbackTimer = 0;
    clearTimeout(transitionTimer); transitionTimer = 0;
    clearTimeout(previewFadeTimer); previewFadeTimer = 0;
    chatVisible = true;
    $('chat-area').hidden = false;
    if (frameReady) { clearTimeout(helpTimer); $('load-help').hidden = true; }

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      $('welcome').hidden = true;
      document.body.dataset.sideStage = 'chat';
      return;
    }

    // The preloaded ChatGPT surface is already ready underneath onboarding.
    // Clear onboarding quickly (no ghost page), while ambient light continues
    // its slower physical retreat to the final static edge field.
    $('welcome').hidden = false;
    document.body.dataset.sideStage = 'transition';
    document.body.classList.remove('sm-content-reveal');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (disposed || !chatVisible) return;
      document.body.classList.add('sm-content-reveal');
      startAmbientHandoff();
      previewFadeTimer = setTimeout(() => {
        previewFadeTimer = 0;
        if (chatVisible) $('welcome').hidden = true;
      }, 230);
      transitionTimer = setTimeout(() => {
        transitionTimer = 0;
        if (!chatVisible) return;
        document.body.classList.remove('sm-content-reveal');
        document.body.dataset.sideStage = 'chat';
        $('welcome').hidden = true;
        // Stage=chat establishes the exact static approved footprint before the
        // temporary WAAPI layers are discarded.
        cancelAmbientHandoff();
      }, 1320);
    }));
  }
  function syncChatSurface(url=lastChatURL){
    let mode='home';
    try{
      const u=new URL(url,'https://chatgpt.com/');
      mode=/^\/c\/[^/]+/.test(u.pathname)||/^\/(?:g|share)\//.test(u.pathname)?'chat':'home';
    }catch{}
    document.body.dataset.chatSurface=mode;
  }
  function disposeBridge() { bridge?.close(); bridge = null; bridgeID = ''; hasDraft = false; clearTimeout(helpTimer); }
  function loadChat(url) {
    if (hasDraft && !confirm(t('draftConfirm'))) return;
    disposeBridge(); frameLoaded = true;
    frameReady = false; updateStatus(); $('load-help').hidden = true;
    lastChatURL = url; syncChatSurface(url); frame.src = url;
    helpTimer = setTimeout(() => { if (chatVisible) $('load-help').hidden = false; }, 15000);
  }
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== 'https://chatgpt.com' || event.data?.source !== 'SAKURA_SIDECHAT_FRAME') return;
    if (event.data?.type === 'SC_UI_ACTION') {
      const action = event.data.action;
      if (action === 'refresh') { post({ type: 'SC_REFRESH', force: true }); try { bridge?.postMessage({type:'SC_FORGET_PAGE'}); } catch {} }
      else if (action === 'more') { const show = $('more-menu').hidden; closePopovers(); $('more-menu').hidden = !show; $('more').setAttribute('aria-expanded',String(show)); }
      else if (action === 'status') { const show = $('status-popover').hidden; closePopovers(); $('status-popover').hidden = !show; $('status').setAttribute('aria-expanded',String(show)); }
      return;
    }
    if (event.data?.type !== 'SC_READY') return;
    const id = event.data.bridgeID;
    if (typeof id !== 'string' || id === bridgeID) return;
    bridge?.close(); bridgeID = id;
    const channel = new MessageChannel(); bridge = channel.port1;
    bridge.onmessage = e => {
      const m = e.data || {};
      if (m.type === 'SC_STATUS') {
        hasDraft = m.hasDraft === true;
        frameReady = m.ready === true; updateStatus();
        if (m.ready) {
          clearTimeout(helpTimer); $('load-help').hidden = true;
          if (pendingChatReveal && state?.enabled && state?.embedAllowed) revealChat();
        }
        try { const u = new URL(m.url); if (u.origin === 'https://chatgpt.com') { lastChatURL = u.origin + u.pathname; syncChatSurface(lastChatURL); } } catch {}
      } else if (m.type === 'SC_CLEAR') post({ type: 'SC_CLEAR', id: m.id, selectionKey: m.selectionKey });
      else if (m.type === 'SC_DISMISS_PAGE' || m.type === 'SC_RESTORE_PAGE') { if(state && m.type==='SC_DISMISS_PAGE'){state.pageDismissed=true;if(state.context)state.context={...state.context,page:null};}post(m); }
      else if (m.type === 'SC_ENSURE_PAGE') post(m);
      else if (m.type === 'SC_CONTEXT_USED') post(m);
      else if (m.type === 'SC_SENT') post(m);
      else if (m.type === 'SC_ERROR') toast(m.key || 'sendError');
    };
    bridge.start(); frame.contentWindow.postMessage({ source: 'SAKURA_SIDECHAT_PANEL', type: 'SC_CONNECT', bridgeID: id }, 'https://chatgpt.com', [channel.port2]); tellFrame();
  });
  function updateStatus() {
    let key = !connected ? 'reconnect' : !frameReady ? 'waiting' : state?.status === 'paused' ? 'paused' : state?.status === 'access-needed' ? 'access' : state?.status === 'restricted' ? 'restricted' : state?.context?.page ? 'ready' : 'selectHint';
    const value = !connected || !frameReady ? 'loading' : state?.status === 'paused' ? 'paused' : ['restricted','access-needed'].includes(state?.status) ? 'limited' : 'ready';
    $('connection-dot').dataset.status = value;
    $('connection-state').textContent = t(key);
    $('status').title = t(key); $('status').setAttribute('aria-label', t(key));
  }
  function closePopovers() {
    $('more-menu').hidden = true; $('status-popover').hidden = true;
    $('more').setAttribute('aria-expanded','false'); $('status').setAttribute('aria-expanded','false');
  }
  $('more').addEventListener('click', () => {
    const show = $('more-menu').hidden; closePopovers(); $('more-menu').hidden = !show;
    $('more').setAttribute('aria-expanded',String(show));
    if (show) $('more-menu').querySelector('button').focus();
  });
  $('status').addEventListener('click', () => {
    const show = $('status-popover').hidden; closePopovers(); $('status-popover').hidden = !show;
    $('status').setAttribute('aria-expanded',String(show));
  });
  $('more-menu').addEventListener('keydown', e => {
    const items = [...$('more-menu').querySelectorAll('button')]; const i = items.indexOf(document.activeElement);
    if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
      e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length-1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    }
  });
  $('more-menu').addEventListener('click', e => { if (e.target.closest('button')) closePopovers(); });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.popover,#more,#status')) closePopovers(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape'){ const was = !$('more-menu').hidden; closePopovers(); if(was) $('more').focus(); } });
  window.addEventListener('blur', closePopovers);
  $('toast').addEventListener('click', () => { $('toast').hidden = true; clearTimeout(toastTimer); });
  async function grant(kind, first = false) {
    const origins = kind === 'all' ? ['http://*/*','https://*/*'] : state?.source?.pattern ? [state.source.pattern] : [];
    try {
      // Keep the permission request directly in this user-gesture handler.
      const allowed = await chrome.permissions.request({ origins });
      if (!allowed) return toast('denied');
      if (first) { const d=await chrome.storage.local.get('__sakuraSidePrefsV1');await chrome.storage.local.set({__sakuraSidePrefsV1:{...d.__sakuraSidePrefsV1,enabled:true}}); }
      post({ type: 'SC_REFRESH' });
    } catch { toast('denied'); }
  }
  $('enable').addEventListener('click', () => void grant(document.querySelector('input[name="scope"]:checked').value, true));
  $('grant-site').addEventListener('click', () => void grant('site'));
  $('grant-all').addEventListener('click', () => void grant('all'));
  $('usage').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('heatmap.html') }));
  $('new-chat').addEventListener('click', () => loadChat('https://chatgpt.com/'));
  $('refresh-context').addEventListener('click', () => { post({ type: 'SC_REFRESH', force: true }); try { bridge?.postMessage({type:'SC_FORGET_PAGE'}); } catch {} });
  $('reload').addEventListener('click', () => loadChat(lastChatURL));
  for (const id of ['external','login']) $(id).addEventListener('click', () => chrome.tabs.create({ url: lastChatURL }));
  for (const id of ['pause','settings-pause']) $(id).addEventListener('click', () => post({ type: 'SC_PAUSE', value: !state?.paused }));
  $('theme').addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'));
  $('language').addEventListener('click', () => { lang = lang === 'en' ? 'zh' : 'en'; applyLanguage(); void chrome.storage.sync.set({ gptTrackerLang: lang }); });
  $('settings').addEventListener('click', () => { closePopovers(); $('preferences').showModal(); });
  $('page-reference-toggle').addEventListener('change',e=>{
    const value=e.target.checked;
    if(state){state.pageDismissed=!value;if(!value&&state.context)state.context={...state.context,page:null};}
    if(bridge)bridge.postMessage({type:'SC_PAGE_REFERENCE',value});else post({type:value?'SC_RESTORE_PAGE':'SC_DISMISS_PAGE',id:state?.context?.id,pageIdentity:state?.source?.pageIdentity});
    render();
  });
  $('deduplicate-page-toggle').addEventListener('change',e=>{
    if(state)state.deduplicatePage=e.target.checked;tellFrame();post({type:'SC_PAGE_PREFS',deduplicatePage:e.target.checked});
  });
  $('close-settings').addEventListener('click', () => $('preferences').close());
  $('manage').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id }));
  window.addEventListener('storage', e => { if (e.key === 'gptTrackerTheme') applyTheme(e.newValue); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.gptTrackerLang) { lang = changes.gptTrackerLang.newValue === 'zh' ? 'zh' : 'en'; applyLanguage(); }
  });
  window.addEventListener('pagehide', () => { disposed = true; clearTimeout(reconnectTimer); clearTimeout(transitionTimer); clearTimeout(previewFadeTimer); clearTimeout(revealFallbackTimer); clearInterval(heartbeat); disposeBridge(); lifecycle?.disconnect(); });
  syncChatSurface();
  void (async () => {
    const prefs = await chrome.storage.sync.get('gptTrackerLang');
    lang = prefs.gptTrackerLang || (navigator.language.startsWith('zh') ? 'zh' : 'en');
    applyTheme(localStorage.getItem('gptTrackerTheme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); applyLanguage();
    const w = await chrome.windows.getCurrent(); windowId = w.id; connect();
  })().catch(() => toast('connectionError'));
})();
