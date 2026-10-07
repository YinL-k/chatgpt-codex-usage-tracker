'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {setup,server,report,root,out}=require('./browser.cjs');
async function run(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const ctx=await browser.newContext({screen:{width:1920,height:1080},reducedMotion:'reduce'});await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 for(const lang of ['en','zh'])for(const theme of ['dark','light'])for(const mode of ['data','empty','error']){
  const p=await ctx.newPage();await setup(p,{lang,theme,state:mode});await p.setViewportSize({width:355,height:632});
  await p.addInitScript(()=>{Object.defineProperty(screen,'availHeight',{value:1080});const now=Date.now();fixture.data.sakuraResetNotificationsV1={snapshot:{at:now,h6:.33,h24:.64},level:'alert'};});
  await p.goto(base+'/popup.html');await p.waitForTimeout(400);
  await p.waitForFunction(()=>document.documentElement.lang===(fixture.opts.lang==='zh'?'zh-CN':'en'));
  assert.equal(await p.locator('#codexReset6').textContent(),'33%');assert.equal(await p.locator('#codexReset24').textContent(),'64%');
  const before=await p.locator('.usage-trend-main').boundingBox();
  await p.evaluate(()=>GPTFeedback.refreshStatus({status:401}));
  const after=await p.locator('.usage-trend-main').boundingBox();assert.ok(Math.abs(before.y-after.y)<1);assert.equal(await p.locator('.membership #actionStatus').count(),1);
  assert.equal(await p.locator('#popupCacheNote').isVisible(),false);
  if(mode==='error'){await p.locator('#codexTrust').hover();assert.equal(await p.locator('.cache-tooltip').isVisible(),true);await p.mouse.move(0,0);assert.equal(await p.locator('.cache-tooltip').count(),0);}
  const footer=await p.locator('.footer').boundingBox();assert.ok(footer.x>=0&&footer.x+footer.width<=355&&footer.y+footer.height<=600,'footer must fit native popup');
  await p.waitForTimeout(700);await p.screenshot({path:path.join(out,`updated-popup-${lang}-${theme}-${mode}.png`)});
  await p.locator('#openDashboard').click();assert.match(await p.evaluate(()=>fixture.opened),/#overview$/);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await p.close();
 }
 const small=await ctx.newPage();await setup(small,{lang:'zh',theme:'light',state:'empty'});await small.setViewportSize({width:320,height:440});await small.addInitScript(()=>Object.defineProperty(screen,'availHeight',{value:520}));await small.goto(base+'/popup.html');await small.waitForTimeout(300);const smallFooter=await small.locator('.footer').boundingBox();assert.ok(smallFooter.y+smallFooter.height<=440);await small.close();
 for(const theme of ['dark','light']){
  const p=await ctx.newPage();await setup(p,{lang:'en',theme,state:'data'});await p.setViewportSize({width:1280,height:900});await p.goto(base+'/heatmap.html');await p.waitForSelector('.reset-countdown');await p.waitForTimeout(500);
  assert.match(await p.locator('.reset-countdown').first().textContent(),/\d+d \d+h \d+m/);
  await p.evaluate(()=>{document.querySelector('.reset-countdown').dataset.resetAt=String(Date.now()-1000);document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await p.locator('.reset-countdown').first().textContent(),'Waiting for update');
  await p.screenshot({path:path.join(out,`updated-overview-${theme}.png`),fullPage:true});
  await p.locator('#tab-usage').click();await p.locator('.advanced-panel > summary').click();await p.locator('[data-mode=low]').click();
  assert.ok(await p.evaluate(()=>fixture.messages.some(m=>m.type==='RN_PREFS'&&m.mode==='low')));
  await p.screenshot({path:path.join(out,`updated-settings-${theme}.png`),fullPage:true});await p.close();
 }
 // Test the actual view and extractor in Chromium (open shadow only in fixture).
 const p=await ctx.newPage();await p.goto(base+'/fixture');await p.evaluate(()=>{const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return original.call(this,{...o,mode:'open'});};});
 await p.addScriptTag({path:path.join(root,'sidechat/core.js')});await p.addScriptTag({path:path.join(root,'sidechat/view.js')});
 await p.evaluate(()=>{const K=SakuraSideCore,s=new K.ContextStore();window.item=s.setPage('Reference body',{}, {tabId:1,windowId:1,url:'https://example.com/',title:'Reference'});item.selection={id:'s',text:'ambiguous',capturedAt:Date.now()};window.view=SakuraSideView.create({composer:()=>document.querySelector('textarea'),translate:k=>k,onClear:()=>{item.selection=null;view.update(item,'dark',true);},onDismiss:()=>{item.page=null;view.update(item,'dark',true);},onRestore:()=>{item=s.setPage('Reference restored',{},item.source);view.update(item,'dark',false);}});view.update(item);});
 await p.locator('.chip').click();assert.equal(await p.locator('.preview').isVisible(),true);await p.locator('.remove-page').click();assert.equal(await p.locator('.remove-page').isVisible(),false);assert.equal(await p.locator('.label').textContent(),'shortSelection');assert.ok(!(await p.locator('pre').textContent()).includes('Reference body'));assert.equal(await p.locator('.restore').isVisible(),true);
 await p.locator('.remove').click();assert.equal(await p.locator('.row').isVisible(),false);await p.locator('.restore').click();assert.equal(await p.locator('.label').textContent(),'shortPage');
 await p.setContent('<main><h1>Exercise</h1><p><label><input type="radio" checked>B answer</label></p><button>Run</button><input type="password" value="secret"><pre>SELECT 1;</pre></main>');await p.addScriptTag({path:path.join(root,'sidechat/extractor.js')});
 const extracted=await p.evaluate(()=>SakuraPageExtract.extract().text);assert.match(extracted,/B answer.*selected/);assert.match(extracted,/Run/);assert.match(extracted,/SELECT 1/);assert.ok(!extracted.includes('secret'));
 await p.close();
 const selection=await ctx.newPage();await selection.goto(base+'/fixture');
 await selection.evaluate(()=>{document.querySelector('#messages').textContent='ambiguous';window.messages=[];window.chrome={runtime:{id:'test',onMessage:{addListener(){}},sendMessage:async m=>{messages.push(m);return {ok:true,enabled:true,id:'context',selectionKey:'selection-1'};}}};});
 await selection.addScriptTag({path:path.join(root,'sidechat/selection.js')});
 await selection.evaluate(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('#messages'));getSelection().removeAllRanges();getSelection().addRange(r);});
 await selection.keyboard.press('Shift');await selection.waitForTimeout(150);assert.ok(await selection.evaluate(()=>messages.some(m=>m.type==='SC_SELECTION')));
 await selection.locator('textarea').click();await selection.locator('textarea').fill('translate');await selection.waitForTimeout(150);assert.equal(await selection.evaluate(()=>messages.filter(m=>m.type==='SC_SELECTION_CLEAR').length),0);
 await selection.mouse.click(5,200);await selection.waitForTimeout(150);assert.equal(await selection.evaluate(()=>messages.filter(m=>m.type==='SC_SELECTION_CLEAR').length),1);
 await selection.close();assert.deepEqual(report.errors,[]);console.log('PASS: 12 popup states, 2 dashboard themes/settings, Page removal/restore, structured controls, trusted selection cancellation.');
 }finally{await browser.close();server.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;server.close();});
