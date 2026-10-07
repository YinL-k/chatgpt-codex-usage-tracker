/* Side Chat is deliberately isolated from UG_* routing and persistent usage data. */
(() => {
  'use strict';
  const K = SakuraSideCore, SESSION = '__sakuraSideContextsV1', RULE = 73001;
  const panels = new Map(), activeTabs = new Map(), paused = new Set(), generations = new Map();
  const dismissed = new Map(), sourceClocks=new Map(), tabEpochs=new Map();
  let prefsQueue=Promise.resolve();
  let store = new K.ContextStore(), rulesQueue = Promise.resolve(), persistQueue = Promise.resolve();
  const initialized = chrome.storage.session.get([SESSION, SESSION+'Dismissed']).then(d => { store = new K.ContextStore(d[SESSION] || []); for(const [id,url] of d[SESSION+'Dismissed']||[]) dismissed.set(id,url); }).catch(() => {});
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
  const ownedUI = s => s.id === chrome.runtime.id && s.url === chrome.runtime.getURL('sidechat/panel.html');
  const ownedPage = s => s.id === chrome.runtime.id && !!s.tab && K.captureAllowed(s.url);
  const messageTab = (id, m) => chrome.tabs.sendMessage(id, m).catch(() => null);
  const persist = () => { persistQueue = persistQueue.then(() => chrome.storage.session.set({ [SESSION]: store.list(), [SESSION+'Dismissed']: [...dismissed] })).catch(() => {}); return persistQueue; };
  function post(port, message) { try { port.postMessage(message); } catch {} }
  async function hasEmbed() { return true; }
  function setRules() {
    rulesQueue = rulesQueue.catch(() => {}).then(async () => {
      if (!await hasEmbed()) return false;
      const addRules = panels.size ? [{ id: RULE, priority: 1,
        action: { type: 'modifyHeaders', responseHeaders: [
          { header: 'x-frame-options', operation: 'remove' }, { header: 'frame-options', operation: 'remove' }, { header: 'content-security-policy', operation: 'remove' }
        ] },
        condition: { urlFilter: '||chatgpt.com/', requestDomains: ['chatgpt.com'], resourceTypes: ['sub_frame'] }
      }] : [];
      // Scope is intentionally narrow: only chatgpt.com sub-frame responses, and only while a Side Chat panel is open.
      // We do not use initiatorDomains here because Chrome Side Panel extension documents can report an opaque initiator on some builds.
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE], addRules });
      return !!addRules.length;
    });
    return rulesQueue;
  }
  async function authorizedCapture(sender) {
    if (sender.documentLifecycle && sender.documentLifecycle !== 'active') return false;
    const prefs = (await chrome.storage.local.get('__sakuraSidePrefsV1')).__sakuraSidePrefsV1 || {};
    if (prefs.enabled !== true) return false;
    if (!ownedPage(sender) || !panels.has(sender.tab.windowId) || paused.has(sender.tab.windowId) || activeTabs.get(sender.tab.windowId) !== sender.tab.id) return false;
    const current = await chrome.tabs.get(sender.tab.id).catch(() => null);
    return !!current?.active && K.captureAllowed(current.url) && await chrome.permissions.contains({ origins: [K.originPattern(sender.url)] });
  }
  async function update(windowId, inject = true) {
    await initialized;
    const port = panels.get(windowId); if (!port) return;
    const epoch = (generations.get(windowId) || 0) + 1; generations.set(windowId, epoch);
    const [tab] = await chrome.tabs.query({ active: true, windowId }).catch(() => []);
    if (generations.get(windowId) !== epoch || panels.get(windowId) !== port) return;
    const previous = activeTabs.get(windowId);
    if (previous != null && previous !== tab?.id) {
      await messageTab(previous, { type: 'SC_CAPTURE_STOP' });
      await messageTab(previous, { type: 'SC_PAGE_STOP' });
    }
    activeTabs.set(windowId, tab?.id);
    const supported = !!tab && K.captureAllowed(tab.url), pattern = K.originPattern(tab?.url);
    const permitted = supported && await chrome.permissions.contains({ origins: [pattern] });
    const embedAllowed = await hasEmbed();
    const prefs = (await chrome.storage.local.get('__sakuraSidePrefsV1')).__sakuraSidePrefsV1 || {};
    const enabled = !paused.has(windowId) && prefs.enabled === true;
    const status = !supported ? 'restricted' : !enabled ? 'paused' : !permitted ? 'access-needed' : 'ready';
    if(tab && dismissed.has(tab.id) && dismissed.get(tab.id)!==tab.url){dismissed.delete(tab.id);void persist();}
    let context = tab ? store.get(tab.id) : null;
    if(context && dismissed.has(tab.id)) context={...context,page:null};
    if (context && context.source.tabUrl !== K.pageURL(tab.url)) { store.clear(tab.id); context = null; void persist(); }
    if (generations.get(windowId) !== epoch || panels.get(windowId) !== port) return;
    post(port, { type: 'SC_STATE', state: { windowId, status, embedAllowed, enabled: prefs.enabled === true,
      deduplicatePage:prefs.deduplicatePage!==false, pageDismissed: !!tab && dismissed.has(tab.id), paused: paused.has(windowId), source: tab ? { tabId: tab.id, pageIdentity:tab.url, title: K.clean(tab.title), url: K.pageURL(tab.url), pattern } : null,
      context: enabled && permitted ? context : null } });
    if (status !== 'ready') {
      if (tab) {
        await messageTab(tab.id, { type: 'SC_CAPTURE_STOP' });
        await messageTab(tab.id, { type: 'SC_PAGE_STOP' });
      }
      return;
    }
    if (!inject) return;
    try {
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['sidechat/selection.js'] }); }
      catch { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['sidechat/selection.js'] }); }
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['sidechat/extractor.js', 'sidechat/page-context.js'] });
      if (panels.get(windowId) === port && activeTabs.get(windowId) === tab.id && !paused.has(windowId)) {
        await messageTab(tab.id, { type: 'SC_CAPTURE_START' });
        await messageTab(tab.id, { type: dismissed.has(tab.id)?'SC_PAGE_STOP':'SC_PAGE_START' });
      } else {
        await messageTab(tab.id, { type: 'SC_CAPTURE_STOP' });
        await messageTab(tab.id, { type: 'SC_PAGE_STOP' });
      }
    } catch { post(port, { type: 'SC_ERROR', error: 'page_unavailable' }); }
  }
  async function ensurePage(windowId,m,port){
    const answer={type:'SC_PAGE_SNAPSHOT_RESULT',requestId:m.requestId,ok:false};
    try{
      const tabId=activeTabs.get(windowId),tab=await chrome.tabs.get(tabId),epoch=tabEpochs.get(tabId)||0;
      if(!tab.active||tab.url!==m.pageIdentity||paused.has(windowId)||dismissed.has(tabId)||!K.captureAllowed(tab.url))return;
      const prefs=(await chrome.storage.local.get('__sakuraSidePrefsV1')).__sakuraSidePrefsV1||{};
      if(prefs.enabled!==true||!await chrome.permissions.contains({origins:[K.originPattern(tab.url)]}))return;
      const reply=await messageTab(tabId,{type:'SC_PAGE_SNAPSHOT'}),latest=await chrome.tabs.get(tabId);
      if(!reply?.ok||reply.pageIdentity!==tab.url||latest.url!==tab.url||!latest.active||activeTabs.get(windowId)!==tabId||paused.has(windowId)||dismissed.has(tabId)||(tabEpochs.get(tabId)||0)!==epoch||panels.get(windowId)!==port)return;
      answer.ok=true;answer.pageIdentity=tab.url;answer.context=store.get(tabId);
    }catch{}finally{post(port,answer);}
  }
  async function close(windowId, port) {
    if (panels.get(windowId) !== port) return;
    panels.delete(windowId); paused.delete(windowId); generations.delete(windowId);
    const tabId = activeTabs.get(windowId); activeTabs.delete(windowId);
    if (tabId != null) {
      await messageTab(tabId, { type: 'SC_CAPTURE_STOP' });
      await messageTab(tabId, { type: 'SC_PAGE_STOP' });
    }
    await initialized; store.clearWindow(windowId); await persist();
    await setRules().catch(() => {});
  }
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'SC_PANEL_LIFETIME' || !ownedUI(port.sender)) return;
    let windowId = null;
    port.onMessage.addListener(m => {
      void (async () => {
        if (m?.type === 'SC_HELLO' && Number.isInteger(m.windowId)) {
          const w = await chrome.windows.get(m.windowId).catch(() => null); if (!w || windowId !== null) return;
          windowId = m.windowId; const old = panels.get(windowId); panels.set(windowId, port);
          if (old && old !== port) { try { old.disconnect(); } catch {} }
          await initialized; await setRules().catch(() => {}); await update(windowId);
        } else if (windowId !== null && m?.type === 'SC_PING') post(port, { type: 'SC_PONG' });
        else if(windowId!==null&&m?.type==='SC_ENSURE_PAGE') { if(typeof m.requestId==='string'&&m.requestId.length<=80)await ensurePage(windowId,m,port); }
        else if(windowId!==null&&m?.type==='SC_PAGE_PREFS'){
          if(typeof m.deduplicatePage!=='boolean')return;
          prefsQueue=prefsQueue.catch(()=>{}).then(async()=>{const d=await chrome.storage.local.get('__sakuraSidePrefsV1');await chrome.storage.local.set({__sakuraSidePrefsV1:{...d.__sakuraSidePrefsV1,deduplicatePage:m.deduplicatePage}});});
          await prefsQueue;await update(windowId,false);
        }
        else if (windowId !== null && m?.type === 'SC_REFRESH') { await setRules().catch(() => {}); await update(windowId); if(m.force) {const id=activeTabs.get(windowId); if(id!=null) await messageTab(id,{type:'SC_PAGE_REFRESH'});} }
        else if (windowId !== null && m?.type === 'SC_PAUSE') {
          if (m.value) { paused.add(windowId); store.clearWindow(windowId); await persist(); } else paused.delete(windowId);
          await update(windowId);
        } else if(windowId!==null && ['SC_DISMISS_PAGE','SC_RESTORE_PAGE'].includes(m?.type)) {
          const tabId=activeTabs.get(windowId),tab=await chrome.tabs.get(tabId);
          if(m.pageIdentity&&m.pageIdentity!==tab.url)return;
          if(m.type==='SC_DISMISS_PAGE'){
            const item=store.get(tabId);if(m.id&&item&&item.id!==m.id)return;
            dismissed.set(tabId,tab.url);if(item)item.page=null;
            if(!item?.selection)store.clear(tabId);
            await messageTab(tabId,{type:'SC_PAGE_STOP'});
          }else dismissed.delete(tabId);
          await persist();await update(windowId,m.type==='SC_RESTORE_PAGE');
        } else if (windowId !== null && m?.type === 'SC_CLEAR') {
          const tabId = activeTabs.get(windowId); store.clearSelection(tabId, m.id, m.selectionKey); await persist();
          if (tabId != null) await messageTab(tabId, { type: 'SC_CAPTURE_RESET' });
          await update(windowId, false);
        } else if (windowId !== null && m?.type === 'SC_CONTEXT_USED') {
          const item = store.list().find(i => i.id === m.contextId && i.source.windowId === windowId);
          // An old receipt must never clear a newer highlight from the same tab.
          if (item && m.selectionKey && store.clearSelection(item.source.tabId, item.id, m.selectionKey)) {
            await persist(); await messageTab(item.source.tabId, {type:'SC_CAPTURE_RESET'});
            await update(windowId, false);
          }
        } else if (windowId !== null && m?.type === 'SC_SENT') {
          // Use the existing serialized usage writer; no second usage database.
          if (/^[a-f0-9]{64}$/.test(m.eventId || '') && Number.isFinite(m.at) && Math.abs(Date.now() - m.at) < 120000) {
            const job = tail.then(() => handle({ type: 'UG_EVENT', event: { id: m.eventId, ts: m.at, model: K.clean(m.model, 90), effort: K.clean(m.effort, 32), tier: K.clean(m.tier, 24), modelSource: K.clean(m.modelSource, 40) } }));
            tail = job.catch(() => {}); await job.catch(() => {});
          }
          await update(windowId, false);
        }
      })().catch(() => post(port, { type: 'SC_ERROR', error: 'connection_error' }));
    });
    port.onDisconnect.addListener(() => { if (windowId !== null) void close(windowId, port); });
  });
  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (!['SC_CAPTURE_HELLO','SC_PAGE_HELLO','SC_SELECTION','SC_SELECTION_CLEAR','SC_PAGE_CONTEXT','SC_CAPTURE_ERROR'].includes(m?.type)) return false;
    void (async () => {
      await initialized;
      const incomingEpoch=tabEpochs.get(sender.tab?.id)||0;
      if (!await authorizedCapture(sender)||(tabEpochs.get(sender.tab?.id)||0)!==incomingEpoch) return { ok: false, enabled: false };
      if (m.type === 'SC_CAPTURE_HELLO' || m.type === 'SC_PAGE_HELLO') return { ok: true, enabled: m.type==='SC_CAPTURE_HELLO'||!dismissed.has(sender.tab.id) };
      if(m.type==='SC_SELECTION_CLEAR'){
        const item=store.get(sender.tab.id);
        if(item?.selection?.frameId===sender.frameId && m.selectionKey)store.clearSelection(sender.tab.id,m.id,m.selectionKey);
        await persist();await update(sender.tab.windowId,false);return {ok:true};
      }
      if (m.type === 'SC_CAPTURE_ERROR') {
        if (m.error === 'selection_too_long') {
          store.clear(sender.tab.id); await persist(); await update(sender.tab.windowId, false);
          post(panels.get(sender.tab.windowId), { type: 'SC_ERROR', error: m.error });
        }
        return { ok: true };
      }
      const source = { title: m.title, url: sender.url, tabUrl: sender.tab.url, tabId: sender.tab.id,
        windowId: sender.tab.windowId, frameId: sender.frameId, documentId: sender.documentId };
      let item;
      if (m.type === 'SC_PAGE_CONTEXT') {
        if (dismissed.has(sender.tab.id)) return {ok:false,enabled:false};
        if (sender.frameId !== 0) return { ok: false, enabled: false };
        const current=await chrome.tabs.get(sender.tab.id).catch(()=>null);
        if(!current||dismissed.has(sender.tab.id)||(tabEpochs.get(sender.tab.id)||0)!==incomingEpoch||m.pageIdentity&&m.pageIdentity!==current.url)return {ok:false,enabled:false};
        if(typeof m.captureToken==='string'&&Number.isInteger(m.revision)){
          const previous=sourceClocks.get(sender.tab.id);
          if(previous&&previous.documentId===sender.documentId&&previous.url===current.url){
            if(previous.token!==m.captureToken)return {ok:false};
            if(previous.revision>=m.revision)return {ok:true,stale:true};
          }
          sourceClocks.set(sender.tab.id,{token:m.captureToken,revision:m.revision,documentId:sender.documentId,url:current.url});
        }

        if (!String(m.text || '').trim()) {
          const previous = store.get(sender.tab.id);
          if(previous) {previous.page=null;if(!previous.selection)store.clear(sender.tab.id);}
          await persist();await update(sender.tab.windowId,false);return {ok:true};
        }
        item = store.setPage(m.text, { originalLength: m.originalLength, truncated: m.truncated }, source);
      } else {
        item = store.setSelection(m.text, source);
      }
      const receipt={ok:true,id:item.id,selectionKey:K.selectionKey(item)};
      await persist(); await update(sender.tab.windowId, false); return receipt;
    })().then(reply, e => reply({ ok: false, error: K.clean(e.message, 80) }));
    return true;
  });
  chrome.tabs.onActivated.addListener(({ windowId }) => { void update(windowId).catch(() => {}); });
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (!panels.has(tab.windowId)) return;
    if (change.url || change.status === 'loading') { tabEpochs.set(tabId,(tabEpochs.get(tabId)||0)+1);sourceClocks.delete(tabId);store.clear(tabId); void persist(); }
    if (tab.active && (change.url || change.status === 'complete' || change.status === 'loading')) void update(tab.windowId, change.status !== 'loading').catch(() => {});
  });
  chrome.tabs.onRemoved.addListener(tabId => { sourceClocks.delete(tabId);tabEpochs.delete(tabId);store.clear(tabId); void persist(); });
  chrome.windows.onRemoved.addListener(windowId => { const p = panels.get(windowId); if (p) void close(windowId, p); });
  chrome.permissions.onAdded.addListener(() => { for (const w of panels.keys()) void setRules().then(() => update(w)).catch(() => {}); });
  chrome.permissions.onRemoved.addListener(() => { for (const w of panels.keys()) { store.clearWindow(w); void update(w).catch(() => {}); } void persist(); });
  chrome.commands.onCommand.addListener(command => { if (command === 'open-side-chat') chrome.windows.getLastFocused().then(w => chrome.sidePanel.open({ windowId: w.id })).catch(() => {}); });
  chrome.runtime.onStartup.addListener(() => { store = new K.ContextStore(); void chrome.storage.session.remove(SESSION); void setRules().catch(() => {}); });
})();
