/* Injected only into an allowed source tab while Side Chat is open. */
(() => {
  'use strict';
  if (globalThis.__sakuraSelectionV1) { globalThis.__sakuraSelectionV1.check(); return; }
  let receipt=null, sequence=0;
  let controller = null, timer = 0, lastText = '', active = false;
  function send(m) {
    try {
      const runtime = globalThis.chrome?.runtime;
      if (!runtime || typeof runtime.sendMessage !== 'function') { stop(); return Promise.resolve({ ok:false }); }
      return Promise.resolve(runtime.sendMessage(m)).catch(() => { stop(); return { ok:false }; });
    } catch { stop(); return Promise.resolve({ ok:false }); }
  }
  function stop() { active = false; clearTimeout(timer); controller?.abort(); controller = null; lastText = ''; }
  function isEditable(node) {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return !!el?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[data-sakura-sidechat]');
  }
  function capture(event) {
    if (!active || document.hidden || !event.isTrusted) return;
    if (event.type === 'keyup' && !['Escape','Shift','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','A'].includes(event.key)) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!active || document.hidden) return;
      const selection = window.getSelection();
      // Never inspect passwords, form fields or the ChatGPT composer.
      if ((!selection || selection.isCollapsed) && lastText && document.hasFocus() && !isEditable(event.target)) { const old=receipt;lastText='';receipt=null;sequence++;if(old)await send({type:'SC_SELECTION_CLEAR',...old});return; }
      if (!selection || selection.isCollapsed || isEditable(selection.anchorNode) || isEditable(selection.focusNode) || isEditable(document.activeElement)) return;
      const text = selection.toString().trim();
      // Losing DOM focus must not erase a quote while the user starts typing.
      if (!text || text === lastText) return;
      if (text.length > 16000) { await send({ type: 'SC_CAPTURE_ERROR', error: 'selection_too_long' }); return; }
      const seq=++sequence;lastText=text;
      const r = await send({ type: 'SC_SELECTION', text, title: document.title });
      if (r.ok && seq===sequence){lastText=text;receipt={id:r.id,selectionKey:r.selectionKey};}
      else if(r.ok)await send({type:'SC_SELECTION_CLEAR',id:r.id,selectionKey:r.selectionKey});
    }, 65);
  }
  function start() {
    if (active) return;
    active = true; controller = new AbortController();
    const options = { capture: true, signal: controller.signal };
    document.addEventListener('pointerup', capture, options);
    document.addEventListener('keyup', capture, options);
  }
  async function check() { const r = await send({ type: 'SC_CAPTURE_HELLO' }); if (r.ok && r.enabled) start(); else stop(); }
  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (m?.type === 'SC_CAPTURE_START') { lastText = ''; start(); reply({ ok: true }); }
    else if (m?.type === 'SC_CAPTURE_STOP') { stop(); reply({ ok: true }); }
    else if (m?.type === 'SC_CAPTURE_RESET') { lastText = ''; receipt=null;sequence++; reply({ ok: true }); }
  });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', () => void check());
  globalThis.__sakuraSelectionV1 = { check };
  void check();
})();
