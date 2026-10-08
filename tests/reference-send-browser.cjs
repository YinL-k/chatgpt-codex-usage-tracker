'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const {server,root,report}=require('./browser.cjs');
async function run(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const ctx=await browser.newContext();
  await ctx.route('**/*',r=>{
   const url=r.request().url();
   if(url.startsWith(base))return r.continue();
   if(url==='https://chatgpt.com/c/reference-test')return r.fulfill({contentType:'text/html',body:'<html><body><section id="messages"></section><form onsubmit="return false"><textarea id="prompt-textarea"></textarea><button type="submit" data-testid="send-button">Send</button></form></body></html>'});
   return r.abort();
  });
  const p=await ctx.newPage();await p.goto(base+'/fixture');
  const frameReady=p.waitForEvent('framenavigated',{predicate:f=>f.url().includes('/c/reference-test')});
  await p.evaluate(()=>{
   window.received=[];window.bridge=null;window.latestState=null;window.snapshotDelay=0;window.snapshotFails=false;window.snapshotDrop=false;
   window.addEventListener('message',e=>{
    if(e.origin!=='https://chatgpt.com'||e.data?.type!=='SC_READY')return;
    const channel=new MessageChannel();window.bridge=channel.port1;
    bridge.onmessage=e=>{received.push(e.data);if(e.data.type==='SC_ENSURE_PAGE'&&!snapshotDrop){const req=e.data;setTimeout(()=>bridge.postMessage({type:'SC_PAGE_SNAPSHOT_RESULT',requestId:req.requestId,ok:!snapshotFails,pageIdentity:req.pageIdentity,context:latestState?.context}),snapshotDelay);}};bridge.start();
    e.source.postMessage({source:'SAKURA_SIDECHAT_PANEL',type:'SC_CONNECT',bridgeID:e.data.bridgeID},e.origin,[channel.port2]);
   });
   const iframe=document.createElement('iframe');iframe.src='https://chatgpt.com/c/reference-test';iframe.width=800;iframe.height=600;document.body.append(iframe);
  });
  await p.waitForFunction(()=>document.querySelector('iframe')?.contentWindow);
  const f=await frameReady;
  const frame=f||p.frames().find(f=>f.url().includes('/c/reference-test'));assert.ok(frame);
  await frame.evaluate(base=>{
   window.chrome={runtime:{getURL:path=>base+'/'+path}};
   window.submits=[];window.modelDraft='';document.querySelector('textarea').addEventListener('input',e=>{const value=e.target.value;queueMicrotask(()=>modelDraft=value);});document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submits.push(modelDraft);});
   const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return original.call(this,{...o,mode:'open'});};
  },base);
  for(const file of ['sidechat/core.js','model-resolver.js','sidechat/view.js','sidechat/adapter.js'])await frame.addScriptTag({path:path.join(root,file)});
  await p.waitForFunction(()=>window.bridge&&received.some(m=>m.type==='SC_STATUS'));
  const update=async(pageText='PAGE_REFERENCE_BODY',selectionText=null,paused=false)=>{
   const state=await frame.evaluate(({pageText,selectionText,base})=>{
    const store=new SakuraSideCore.ContextStore(),source={tabId:1,windowId:1,url:base+'/source',title:'Source'};
    const item=store.setPage(pageText,{},source);if(selectionText)item.selection={id:'quote-'+selectionText,text:selectionText,capturedAt:Date.now()};if(!pageText)item.page=null;
    return {type:'SC_UPDATE',context:item,source:{url:source.url},labels:{shortPage:'Page',shortSelection:'Selection'},captureStatus:'ready',deduplicatePage:true,pageDismissed:false};
   },{pageText:pageText||'dummy',selectionText,base});
   if(!pageText)state.context.page=null;state.pageDismissed=paused;
   await p.evaluate(state=>{latestState=state;bridge.postMessage(state);},state);await frame.waitForTimeout(80);
  };
  let turn=0;
  const send=async question=>{
   const counted=await p.evaluate(()=>received.filter(m=>m.type==='SC_SENT').length);const before=await frame.evaluate(()=>submits.length);
   await frame.locator('textarea').fill(question);await frame.locator('[data-testid="send-button"]').click();
   await frame.waitForFunction(n=>submits.length===n+1,before);
   const text=await frame.evaluate(()=>submits.at(-1));assert.equal(text,await frame.locator('textarea').inputValue(),'native send must receive the wrapped reference, not the stale application draft');
   await frame.evaluate(({text,id})=>{const n=document.createElement('div');n.dataset.messageAuthorRole='user';n.dataset.messageId=id;n.textContent=text;document.querySelector('#messages').append(n);document.querySelector('textarea').value='';document.querySelector('textarea').dispatchEvent(new Event('input',{bubbles:true}));},{text,id:'turn-'+(++turn)});
   await p.waitForFunction(n=>received.filter(m=>m.type==='SC_SENT').length>n,counted);return text;
  };
  await update();const first=await send('这题为什么错？');assert.ok(first.includes('<PageContext>\nPAGE_REFERENCE_BODY'));
  const second=await send('  Python tuple 和 list 有什么区别？\n保持原话  ');assert.ok(!second.includes('<PageContext>'));assert.ok(second.includes('PageReference: active; unchanged'));assert.equal(await frame.locator('.remove-page').isVisible(),true);assert.ok(second.includes('<UserRequest>\n  Python tuple 和 list 有什么区别？\n保持原话  \n</UserRequest>'));
  await p.evaluate(()=>{latestState.context.page.text='JUST_CHANGED_BEFORE_SEND';latestState.context.page.originalLength=100;latestState.context.page.fingerprint=null;});
  assert.ok((await send('立即发送')).includes('JUST_CHANGED_BEFORE_SEND'));
  await update('UPDATED_BODY','const result = await fetch(url)');const selected=await send('解释');assert.ok(selected.includes('<Selection>\nconst result = await fetch(url)'));assert.ok(selected.includes('UPDATED_BODY'));
  await update('UPDATED_BODY','keep selection');const selectionReuse=await send('翻译');assert.ok(selectionReuse.includes('<Selection>'));assert.ok(!selectionReuse.includes('<PageContext>'));
  await update('UPDATED_BODY','another selection');await frame.locator('.chip').click();assert.equal(await frame.locator('.preview').isVisible(),true);
  await frame.locator('.remove-page').click();assert.equal(await frame.locator('.remove-page').isVisible(),false);assert.equal(await frame.locator('.preview').isVisible(),false);assert.match(await frame.locator('.label').textContent(),/Selection/);
  assert.ok(await p.evaluate(()=>received.some(m=>m.type==='SC_DISMISS_PAGE')));
  // Same-page late capture cannot undo local dismissal, but preserves a new quote.
  await update('LATE_BODY','new selection');const dismissed=await send('翻译');assert.ok(dismissed.includes('<Selection>\nnew selection'));assert.ok(!dismissed.includes('<PageContext>'));assert.ok(!dismissed.includes('LATE_BODY'));
  await frame.locator('.restore').click();assert.ok(await p.evaluate(()=>received.some(m=>m.type==='SC_RESTORE_PAGE')));
  await update('RESTORED_BODY');assert.ok((await send('unrelated question')).includes('RESTORED_BODY'));
  await p.evaluate(()=>{latestState.deduplicatePage=false;bridge.postMessage(latestState);});await frame.waitForTimeout(80);
  assert.ok((await send('重复一')).includes('RESTORED_BODY'));assert.ok((await send('重复二')).includes('RESTORED_BODY'));
  await p.evaluate(()=>{latestState.deduplicatePage=true;bridge.postMessage(latestState);});await frame.waitForTimeout(80);assert.ok((await send('开启去重')).includes('RESTORED_BODY'));assert.ok(!(await send('去重第二轮')).includes('<PageContext>'));
  await frame.evaluate(()=>{const full=[...document.querySelectorAll('[data-message-author-role=user]')].filter(n=>n.textContent.includes('<PageContext>')&&n.textContent.includes('RESTORED_BODY')).at(-1);full.dataset.messageStatus='failed';});await frame.waitForTimeout(100);assert.ok((await send('failed Page retry')).includes('RESTORED_BODY'));
  await frame.addScriptTag({path:path.join(root,'sidechat/extractor.js')});
  const stripped=await frame.evaluate(text=>SakuraPageExtract.stripPriorContext(text),first);assert.ok(!stripped.includes('PAGE_REFERENCE_BODY'));
  // The same conversation URL is also an active user-controlled PageReference.
  const same=await frame.evaluate(()=>new SakuraSideCore.ContextStore().setPage('SAME_CHAT_PAGE',{}, {tabId:1,windowId:1,url:location.href,title:'Same chat'}));
  await p.evaluate(context=>{latestState={type:'SC_UPDATE',captureStatus:'ready',context,source:{url:'https://chatgpt.com/c/reference-test'}};bridge.postMessage(latestState);},same);await frame.waitForTimeout(80);
  assert.ok((await send('another ordinary question')).includes('SAME_CHAT_PAGE'));
  await frame.evaluate(()=>history.pushState({},'', '/c/new-conversation'));assert.ok((await send('new conversation keeps Page')).includes('SAME_CHAT_PAGE'));
  const beforeFail=await frame.evaluate(()=>submits.length);await p.evaluate(()=>snapshotFails=true);await frame.locator('textarea').fill('keep draft');await frame.locator('[data-testid=send-button]').click();await frame.waitForTimeout(100);assert.equal(await frame.evaluate(()=>submits.length),beforeFail);assert.equal(await frame.locator('textarea').inputValue(),'keep draft');assert.ok(await p.evaluate(()=>received.some(m=>m.key==='freshnessError')));await p.evaluate(()=>snapshotFails=false);
  await p.evaluate(()=>snapshotDrop=true);await frame.locator('[data-testid=send-button]').click();await frame.waitForTimeout(2100);assert.equal(await frame.evaluate(()=>submits.length),beforeFail);assert.equal(await frame.locator('textarea').inputValue(),'keep draft');await p.evaluate(()=>snapshotDrop=false);
  await p.evaluate(()=>snapshotDelay=300);await frame.locator('[data-testid=send-button]').click();await frame.locator('[data-testid=send-button]').click();await frame.waitForFunction(n=>submits.length===n+1,beforeFail);assert.equal(await frame.evaluate(()=>submits.length),beforeFail+1);
  await frame.locator('textarea').fill('pending draft');const beforeCancel=await frame.evaluate(()=>submits.length);await frame.locator('[data-testid=send-button]').click();await frame.locator('textarea').fill('edited draft');await frame.waitForTimeout(400);assert.equal(await frame.evaluate(()=>submits.length),beforeCancel);assert.equal(await frame.locator('textarea').inputValue(),'edited draft');
  await frame.locator('[data-testid=send-button]').click();await frame.locator('.remove-page').click();await frame.waitForTimeout(400);assert.equal(await frame.evaluate(()=>submits.length),beforeCancel);
  // Current ChatGPT uses a form-less ProseMirror composer, not #prompt-textarea.
  await p.evaluate(()=>snapshotDelay=0);
  await frame.evaluate(()=>{
    document.querySelector('form').remove();const shell=document.createElement('section');shell.setAttribute('data-composer-body','');
    shell.innerHTML='<div role="textbox" contenteditable="true" data-composer-markdown aria-label="Ask ChatGPT" class="ProseMirror"></div><button type="submit" aria-label="Send">Send</button><button type="button" aria-label="Stop streaming" hidden>Stop</button>';
    document.body.append(shell);window.modelDraft='';const editor=shell.querySelector('[contenteditable]');
    editor.addEventListener('input',()=>{const value=editor.innerText;queueMicrotask(()=>modelDraft=value);});
    shell.querySelector('[aria-label=Send]').addEventListener('click',()=>submits.push(modelDraft));
    editor.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();shell.querySelector('[aria-label=Send]').click();}});
  });
  const modernSend=async(question,enter=false)=>{
    const n=await frame.evaluate(()=>submits.length),counted=await p.evaluate(()=>received.filter(m=>m.type==='SC_SENT').length);
    const editor=frame.locator('[data-composer-markdown]');await editor.fill(question);
    if(enter)await editor.press('Enter');else await frame.locator('[aria-label=Send]').click();
    await frame.waitForFunction(n=>submits.length===n+1,n);const text=await frame.evaluate(()=>submits.at(-1));
    await frame.evaluate(({text,id})=>{const n=document.createElement('div');n.dataset.messageAuthorRole='user';n.dataset.messageId=id;n.textContent=text;document.querySelector('#messages').append(n);const e=document.querySelector('[data-composer-markdown]');e.textContent='';e.dispatchEvent(new InputEvent('input',{bubbles:true}));},{text,id:'modern-'+(++turn)});
    await p.waitForFunction(n=>received.filter(m=>m.type==='SC_SENT').length>n,counted);return text;
  };
  await frame.locator('.restore').click();await update('MODERN_PAGE','This guy is my favorite presenter. So enthusiastic!');
  const modern=await modernSend('这啥意思');assert.ok(modern.includes('<Selection>\nThis guy is my favorite presenter. So enthusiastic!'));assert.ok(modern.includes('<PageContext>\nMODERN_PAGE'));
  await update('MODERN_PAGE','Never going to use the CLI but loved the vid nonetheless.');
  const entered=await modernSend('还有这个',true);assert.ok(entered.includes('<Selection>\nNever going'));assert.ok(entered.includes('PageReference: active; unchanged'));
  await update('MODERN_PAGE','Selection alone');await frame.locator('.remove-page').click();const alone=await modernSend('这个');assert.ok(alone.includes('<Selection>\nSelection alone'));assert.ok(!alone.includes('<PageContext>'));
  await frame.locator('[data-composer-markdown]').fill('do not submit while generating');await frame.locator('[aria-label=Send]').evaluate(b=>{b.hidden=true;b.disabled=true;});
  const stopped=await frame.evaluate(()=>submits.length);await frame.locator('[data-composer-markdown]').press('Enter');assert.equal(await frame.evaluate(()=>submits.length),stopped);
  // Current ChatGPT scroll surface spans behind a bottom-fixed composer.
  await frame.evaluate(()=>{
   const scroll=document.createElement('div');scroll.className='thread-scroll-container';scroll.setAttribute('data-app-action-timeline-scroll','');scroll.style.cssText='position:fixed;inset:0;overflow:auto;background:#101010;color:white';scroll.innerHTML='<div style="height:1600px">Scroll fixture</div>';document.body.prepend(scroll);
   const box=document.querySelector('[data-composer-body]');box.setAttribute('data-composer-surface-variant','default');box.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;height:120px;border-radius:28px;background:#222;z-index:2';
  });
  await frame.waitForFunction(()=>parseFloat(document.querySelector('.thread-scroll-container').style.getPropertyValue('--sm-scrollbar-bottom'))>=144);
  const beforeInset=await frame.locator('.thread-scroll-container').evaluate(e=>parseFloat(getComputedStyle(e,'::-webkit-scrollbar-track').marginBottom));
  assert.ok(beforeInset>=144,'scrollbar track ends above the composer');
  await frame.locator('[data-composer-body]').evaluate(e=>e.style.height='180px');
  await frame.waitForFunction(()=>parseFloat(document.querySelector('.thread-scroll-container').style.getPropertyValue('--sm-scrollbar-bottom'))>=204);
  assert.equal(await frame.locator('.thread-scroll-container').evaluate(e=>getComputedStyle(e).scrollbarWidth),'auto');
  await frame.locator('.thread-scroll-container').evaluate(e=>e.scrollTop=e.scrollHeight);
  await p.screenshot({path:path.join(root,'tests/artifacts/sidebar-scrollbar-boundary.png')});
  console.log('PASS: native model payload + current form-less ProseMirror click/Enter + Selection-only sends; Page ON semantics, default dedupe, latest snapshot before send, explicit Selection target with dedupe, Page OFF/restore, dedupe OFF/ON, read failures, repeated clicks and pending draft/close cancellation.');
  await ctx.close();assert.deepEqual(report.errors,[]);
 }finally{await browser.close();server.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;server.close();});
