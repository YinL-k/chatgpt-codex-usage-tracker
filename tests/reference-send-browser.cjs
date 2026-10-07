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
   window.received=[];window.bridge=null;
   window.addEventListener('message',e=>{
    if(e.origin!=='https://chatgpt.com'||e.data?.type!=='SC_READY')return;
    const channel=new MessageChannel();window.bridge=channel.port1;
    bridge.onmessage=e=>received.push(e.data);bridge.start();
    e.source.postMessage({source:'SAKURA_SIDECHAT_PANEL',type:'SC_CONNECT',bridgeID:e.data.bridgeID},e.origin,[channel.port2]);
   });
   const iframe=document.createElement('iframe');iframe.src='https://chatgpt.com/c/reference-test';iframe.width=800;iframe.height=600;document.body.append(iframe);
  });
  await p.waitForFunction(()=>document.querySelector('iframe')?.contentWindow);
  const f=await frameReady;
  const frame=f||p.frames().find(f=>f.url().includes('/c/reference-test'));assert.ok(frame);
  await frame.evaluate(base=>{
   window.chrome={runtime:{getURL:path=>base+'/'+path}};
   const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return original.call(this,{...o,mode:'open'});};
  },base);
  for(const file of ['sidechat/core.js','model-resolver.js','sidechat/view.js','sidechat/adapter.js'])await frame.addScriptTag({path:path.join(root,file)});
  await p.waitForFunction(()=>window.bridge&&received.some(m=>m.type==='SC_STATUS'));
  const update=async(pageText='PAGE_REFERENCE_BODY',selectionText=null,paused=false)=>{
   const state=await frame.evaluate(({pageText,selectionText,base})=>{
    const store=new SakuraSideCore.ContextStore(),source={tabId:1,windowId:1,url:base+'/source',title:'Source'};
    const item=store.setPage(pageText,{},source);if(selectionText)item.selection={id:'quote-'+selectionText,text:selectionText,capturedAt:Date.now()};if(!pageText)item.page=null;
    return {type:'SC_UPDATE',context:item,source:{url:source.url},labels:{shortPage:'Page',shortSelection:'Selection'},pageDismissed:false};
   },{pageText:pageText||'dummy',selectionText,base});
   if(!pageText)state.context.page=null;state.pageDismissed=paused;
   await p.evaluate(state=>bridge.postMessage(state),state);await frame.waitForTimeout(80);
  };
  let turn=0;
  const send=async question=>{
   await frame.locator('textarea').fill(question);await frame.locator('[data-testid="send-button"]').click();
   const text=await frame.locator('textarea').inputValue();
   await frame.evaluate(({text,id})=>{const n=document.createElement('div');n.dataset.messageAuthorRole='user';n.dataset.messageId=id;n.textContent=text;document.querySelector('#messages').append(n);document.querySelector('textarea').value='';document.querySelector('textarea').dispatchEvent(new Event('input',{bubbles:true}));},{text,id:'turn-'+(++turn)});
   await frame.waitForTimeout(120);return text;
  };
  await update();const first=await send('这题为什么错？');assert.ok(first.includes('<PageContext>\nPAGE_REFERENCE_BODY'));
  const second=await send('  Python tuple 和 list 有什么区别？\n保持原话  ');assert.ok(second.includes('<PageContext>\nPAGE_REFERENCE_BODY'));assert.ok(second.includes('<UserRequest>\n  Python tuple 和 list 有什么区别？\n保持原话  \n</UserRequest>'));
  await update('UPDATED_BODY','const result = await fetch(url)');const selected=await send('解释');assert.ok(selected.includes('<Selection>\nconst result = await fetch(url)'));assert.ok(selected.includes('UPDATED_BODY'));
  await update('UPDATED_BODY','keep selection');await frame.locator('.chip').click();assert.equal(await frame.locator('.preview').isVisible(),true);
  await frame.locator('.remove-page').click();assert.equal(await frame.locator('.remove-page').isVisible(),false);assert.equal(await frame.locator('.preview').isVisible(),false);assert.match(await frame.locator('.label').textContent(),/Selection/);
  assert.ok(await p.evaluate(()=>received.some(m=>m.type==='SC_DISMISS_PAGE')));
  // Same-page late capture cannot undo local dismissal, but preserves a new quote.
  await update('LATE_BODY','new selection');const dismissed=await send('翻译');assert.ok(dismissed.includes('<Selection>\nnew selection'));assert.ok(!dismissed.includes('<PageContext>'));assert.ok(!dismissed.includes('LATE_BODY'));
  await frame.locator('.restore').click();assert.ok(await p.evaluate(()=>received.some(m=>m.type==='SC_RESTORE_PAGE')));
  await update('RESTORED_BODY');assert.ok((await send('unrelated question')).includes('RESTORED_BODY'));
  await frame.addScriptTag({path:path.join(root,'sidechat/extractor.js')});
  const stripped=await frame.evaluate(text=>SakuraPageExtract.stripPriorContext(text),first);assert.ok(!stripped.includes('PAGE_REFERENCE_BODY'));
  // The same conversation URL is also an active user-controlled PageReference.
  const same=await frame.evaluate(()=>new SakuraSideCore.ContextStore().setPage('SAME_CHAT_PAGE',{}, {tabId:1,windowId:1,url:location.href,title:'Same chat'}));
  await p.evaluate(context=>bridge.postMessage({type:'SC_UPDATE',context,source:{url:'https://chatgpt.com/c/reference-test'}}),same);await frame.waitForTimeout(80);
  assert.ok((await send('another ordinary question')).includes('SAME_CHAT_PAGE'));
  console.log('PASS: actual send adapter retains Page on repeated/unrelated/selection sends, updates content, removes Page immediately, blocks late captures, restores Page, preserves request text and prompt order.');
  await ctx.close();assert.deepEqual(report.errors,[]);
 }finally{await browser.close();server.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;server.close();});
