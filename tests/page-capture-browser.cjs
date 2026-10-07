'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const {server,root,out}=require('./browser.cjs');
async function run(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage();await p.goto(base+'/fixture');
  await p.setContent('<html><head><title>Original title</title></head><body><main><h1>Exercise</h1><p id="body">Original body</p><pre id="code">const result = 1;</pre><table><tr><td id="cell">Old cell</td></tr></table><label><input type="radio">Answer B</label></main></body></html>');
  await p.evaluate(()=>{
   window.captures=[];window.chrome={runtime:{id:'test',sendMessage:async m=>{if(m.type==='SC_PAGE_CONTEXT')captures.push({...m,at:Date.now()});return {ok:true,enabled:true};},onMessage:{addListener:f=>window.receive=f}}};
   window.command=m=>new Promise(resolve=>receive(m,{id:'test'},resolve));
  });
  for(const file of ['sidechat/extractor.js','sidechat/page-context.js'])await p.addScriptTag({path:path.join(root,file)});
  await p.waitForFunction(()=>captures.length>0);
  const prior=await p.evaluate(()=>captures.length);
  await p.evaluate(()=>{document.querySelector('#body').textContent='New body';document.querySelector('#code').textContent='await fetch(url)';document.querySelector('#cell').textContent='New cell';document.title='New title';});
  await p.waitForFunction(n=>captures.length>n,prior);
  const changed=await p.evaluate(()=>captures.at(-1));assert.ok(changed.text.includes('New body'));assert.ok(changed.text.includes('await fetch(url)'));assert.ok(changed.text.includes('New cell'));assert.equal(changed.title,'New title');
  await p.locator('input').check();await p.waitForFunction(()=>captures.at(-1).text.includes('[selected]'));
  const streamStart=await p.evaluate(()=>{window.streamCount=captures.length;window.started=Date.now();window.streaming=setInterval(()=>document.querySelector('#body').textContent+='x',40);return started;});
  await p.waitForFunction(()=>captures.length>streamCount,{},{timeout:1800});
  const streamCapture=await p.evaluate(()=>{clearInterval(streaming);return captures.at(-1).at;});assert.ok(streamCapture-streamStart<=1500,'streaming must not starve snapshots');
  const immediate=await p.evaluate(async()=>{document.querySelector('#body').textContent='Changed immediately before sending';const reply=await command({type:'SC_PAGE_SNAPSHOT'});return {reply,last:captures.at(-1)};});
  assert.equal(immediate.reply.ok,true);assert.ok(immediate.last.text.includes('Changed immediately before sending'));
  await p.evaluate(()=>command({type:'SC_PAGE_STOP'}));const stopped=await p.evaluate(()=>captures.length);
  await p.evaluate(()=>document.querySelector('#body').textContent='Closed Page must stay closed');await p.waitForTimeout(400);assert.equal(await p.evaluate(()=>captures.length),stopped);
  assert.equal((await p.evaluate(()=>command({type:'SC_PAGE_SNAPSHOT'}))).ok,false);
  await p.close();
  // Actual settings DOM and handlers, with only the extension port mocked.
  for(const lang of ['en','zh'])for(const theme of ['dark','light']){
   const ui=await browser.newPage();await ui.addInitScript(({lang,theme})=>{
    window.settingMessages=[];window.settingPrefs={enabled:true};
    window.settingState={windowId:1,enabled:true,embedAllowed:false,status:'ready',pageDismissed:false,deduplicatePage:true,source:{tabId:1,pageIdentity:'https://example.com/',url:'https://example.com/',title:'Source'},context:{id:'ctx',page:{text:'Body'},selection:{text:'word'},source:{title:'Source'}}};
    let listener;const emit=()=>queueMicrotask(()=>listener({type:'SC_STATE',state:structuredClone(settingState)}));
    localStorage.setItem('gptTrackerTheme',theme);
    window.chrome={runtime:{id:'test',getURL:p=>location.origin+'/'+p,connect:()=>({onMessage:{addListener:f=>listener=f},onDisconnect:{addListener(){}},postMessage:m=>{settingMessages.push(m);if(m.type==='SC_DISMISS_PAGE'){settingState.pageDismissed=true;settingState.context.page=null;}if(m.type==='SC_RESTORE_PAGE')settingState.pageDismissed=false;if(m.type==='SC_PAGE_PREFS'){settingPrefs.deduplicatePage=m.deduplicatePage;settingState.deduplicatePage=m.deduplicatePage;}emit();}})},windows:{getCurrent:async()=>({id:1})},storage:{sync:{get:async()=>({gptTrackerLang:lang}),set:async()=>{}},local:{get:async()=>({__sakuraSidePrefsV1:settingPrefs}),set:async()=>{}},onChanged:{addListener(){}}},tabs:{create:async()=>{}}};
   },{lang,theme});
   const errors=[];ui.on('pageerror',e=>errors.push(e.message));await ui.goto(base+'/sidechat/panel.html');
   await ui.locator('#settings').evaluate(el=>el.click());
   assert.equal(await ui.locator('#page-reference-toggle').isChecked(),true);assert.equal(await ui.locator('#deduplicate-page-toggle').isChecked(),true);
   await ui.locator('#page-reference-toggle').uncheck();await ui.waitForFunction(()=>settingState.pageDismissed);assert.equal(await ui.evaluate(()=>settingState.context.selection.text),'word');
   await ui.locator('#deduplicate-page-toggle').uncheck();await ui.waitForFunction(()=>settingPrefs.deduplicatePage===false);
   await ui.locator('#page-reference-toggle').check();await ui.waitForFunction(()=>!settingState.pageDismissed);
   assert.ok(await ui.evaluate(()=>settingMessages.some(m=>m.type==='SC_RESTORE_PAGE')));assert.deepEqual(errors,[]);
   await ui.locator('#deduplicate-page-toggle').check();await ui.waitForFunction(()=>settingPrefs.deduplicatePage===true);
   await ui.screenshot({path:path.join(out,`page-settings-${lang}-${theme}.png`)});await ui.close();
  }
  console.log('PASS: source mutation/code/table/control/title capture, bounded streaming, immediate snapshot, Page OFF capture stop, settings switches in EN/ZH and dark/light.');
 }finally{await browser.close();server.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;server.close();});
