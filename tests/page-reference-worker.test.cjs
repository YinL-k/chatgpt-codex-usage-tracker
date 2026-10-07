'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),K=require('../sidechat/core');
const wait=()=>new Promise(r=>setTimeout(r,10));
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await wait();}throw Error('worker response timeout');}
async function harness(){
 let connect,capture,onUpdated,panelMessage,snapshot;
 const messages=[],data={},prefs={enabled:true,unrelated:'preserved'},tab={id:1,windowId:1,url:'https://example.com/page?a=1',active:true};
 const event=()=>({addListener(){}});
 const request=m=>new Promise(resolve=>capture(m,{id:'test',url:tab.url,tab:{...tab},frameId:0,documentId:'doc'},resolve));
 const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onConnect:{addListener:f=>connect=f},onMessage:{addListener:f=>capture=f},onStartup:event()},
  storage:{session:{get:async()=>data,set:async v=>Object.assign(data,v),setAccessLevel:async()=>{},remove:async()=>{}},local:{get:async()=>({__sakuraSidePrefsV1:{...prefs}}),set:async v=>Object.assign(prefs,v.__sakuraSidePrefsV1)}},
  tabs:{get:async()=>({...tab}),query:async()=>[{...tab}],sendMessage:async(id,m)=>m.type==='SC_PAGE_SNAPSHOT'?snapshot():{ok:true},onActivated:event(),onUpdated:{addListener:f=>onUpdated=f},onRemoved:event()},windows:{get:async()=>({id:1}),onRemoved:event()},
  permissions:{contains:async()=>true,onAdded:event(),onRemoved:event()},scripting:{executeScript:async()=>{}},declarativeNetRequest:{updateSessionRules:async()=>{}},commands:{onCommand:event()}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../sidechat/worker'),'utf8'),{SakuraSideCore:K,chrome,console,Map,Set});
 connect({name:'SC_PANEL_LIFETIME',sender:{id:'test',url:'chrome-extension://test/sidechat/panel.html'},onMessage:{addListener:f=>panelMessage=f},onDisconnect:event(),postMessage:m=>messages.push(m)});
 panelMessage({type:'SC_HELLO',windowId:1});await until(()=>messages.some(m=>m.type==='SC_STATE'));
 const state=()=>messages.filter(m=>m.type==='SC_STATE').at(-1).state;
 return {request,state,tab,prefs,messages,panel:m=>panelMessage(m),snapshot:f=>snapshot=f,navigate:url=>{tab.url=url;onUpdated(tab.id,{url},tab);}};
}
test('default dedupe is ON and preferences merge without disabling Side Chat',async()=>{
 const h=await harness();assert.equal(h.state().deduplicatePage,true);
 h.panel({type:'SC_PAGE_PREFS',deduplicatePage:false});await until(()=>h.state().deduplicatePage===false);
 assert.equal(h.prefs.enabled,true);assert.equal(h.prefs.unrelated,'preserved');assert.equal(h.prefs.deduplicatePage,false);
});
test('Page OFF without a page preserves Selection and blocks both captures and snapshot checks',async()=>{
 const h=await harness();await h.request({type:'SC_SELECTION',text:'explicit target'});
 h.panel({type:'SC_DISMISS_PAGE',pageIdentity:h.tab.url});await until(()=>h.state().pageDismissed);
 assert.equal(h.state().context.selection.text,'explicit target');
 assert.equal((await h.request({type:'SC_PAGE_CONTEXT',text:'late Page'})).ok,false);
 h.panel({type:'SC_ENSURE_PAGE',requestId:'off',pageIdentity:h.tab.url});await until(()=>h.messages.some(m=>m.requestId==='off'));
 assert.equal(h.messages.find(m=>m.requestId==='off').ok,false);
});
test('fresh snapshot returns current context and ignores older capture revisions',async()=>{
 const h=await harness(),payload={type:'SC_PAGE_CONTEXT',pageIdentity:h.tab.url,captureToken:'source-doc'};
 await h.request({...payload,revision:2,text:'latest content',title:'new title'});
 assert.equal((await h.request({...payload,revision:1,text:'old content'})).stale,true);assert.equal(h.state().context.page.text,'latest content');
 h.snapshot(async()=>{await h.request({...payload,revision:3,text:'changed immediately before send',title:'new title'});return {ok:true,pageIdentity:h.tab.url};});
 h.panel({type:'SC_ENSURE_PAGE',requestId:'fresh',pageIdentity:h.tab.url});await until(()=>h.messages.some(m=>m.requestId==='fresh'));
 const result=h.messages.find(m=>m.requestId==='fresh');assert.equal(result.ok,true);assert.equal(result.context.page.text,'changed immediately before send');
});
test('navigation or Page OFF during capture invalidates its pending response',async()=>{
 for(const operation of ['navigate','dismiss']){
  const h=await harness();await h.request({type:'SC_PAGE_CONTEXT',text:'body'});let resolve;h.snapshot(()=>new Promise(r=>resolve=r));
  h.panel({type:'SC_ENSURE_PAGE',requestId:operation,pageIdentity:h.tab.url});await until(()=>!!resolve);
  if(operation==='navigate')h.navigate('https://example.com/new');else h.panel({type:'SC_DISMISS_PAGE',pageIdentity:h.tab.url});
  await wait();resolve({ok:true,pageIdentity:'https://example.com/page?a=1'});
  await until(()=>h.messages.some(m=>m.requestId===operation));assert.equal(h.messages.find(m=>m.requestId===operation).ok,false);
 }
});
