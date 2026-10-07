'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),K=require('../sidechat/core');
const pause=()=>new Promise(r=>setTimeout(r,15));
test('dismissal removes page immediately at worker, blocks late captures, preserves selection and restores',async()=>{
 let connect,capture,panelMessage;const messages=[],data={},tab={id:1,windowId:1,url:'https://example.com/page?a=1',active:true};
 const event=()=>({addListener(){}}),chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onConnect:{addListener:f=>connect=f},onMessage:{addListener:f=>capture=f},onStartup:event()},
 storage:{session:{get:async()=>data,set:async v=>Object.assign(data,v),setAccessLevel:async()=>{},remove:async()=>{}},local:{get:async()=>({__sakuraSidePrefsV1:{enabled:true}})}},
 tabs:{get:async()=>({...tab}),query:async()=>[{...tab}],sendMessage:async()=>({ok:true}),onActivated:event(),onUpdated:event(),onRemoved:event()},windows:{get:async()=>({id:1}),onRemoved:event()},
 permissions:{contains:async()=>true,onAdded:event(),onRemoved:event()},scripting:{executeScript:async()=>{}},declarativeNetRequest:{updateSessionRules:async()=>{}},commands:{onCommand:event()}};
 const ctx={SakuraSideCore:K,chrome,console,Map,Set};vm.runInNewContext(fs.readFileSync(require.resolve('../sidechat/worker'),'utf8'),ctx);
 connect({name:'SC_PANEL_LIFETIME',sender:{id:'test',url:'chrome-extension://test/sidechat/panel.html'},onMessage:{addListener:f=>panelMessage=f},onDisconnect:event(),postMessage:m=>messages.push(m)});
 panelMessage({type:'SC_HELLO',windowId:1});await pause();
 const request=m=>new Promise(resolve=>capture(m,{id:'test',url:tab.url,tab:{...tab},frameId:0,documentId:'doc'},resolve));
 const last=()=>messages.filter(m=>m.type==='SC_STATE').at(-1).state;
 await request({type:'SC_PAGE_CONTEXT',text:'Page body',title:'Page'});assert.ok(last().context.page);
 const quote=await request({type:'SC_SELECTION',text:'word',title:'Page'});
 panelMessage({type:'SC_DISMISS_PAGE',id:quote.id});await pause();assert.equal(last().context.page,null);assert.equal(last().context.selection.text,'word');assert.equal(last().pageDismissed,true);
 assert.equal((await request({type:'SC_PAGE_CONTEXT',text:'Late page'})).ok,false);assert.equal(last().context.page,null);
 await request({type:'SC_SELECTION',text:'new word'});assert.equal(last().context.selection.text,'new word');
 await request({type:'SC_SELECTION_CLEAR',id:quote.id,selectionKey:quote.selectionKey});assert.equal(last().context.selection.text,'new word');
 panelMessage({type:'SC_RESTORE_PAGE'});await pause();await request({type:'SC_PAGE_CONTEXT',text:'Restored page'});assert.equal(last().context.page.text,'Restored page');assert.equal(last().context.selection.text,'new word');
 panelMessage({type:'SC_DISMISS_PAGE',id:last().context.id});await pause();tab.url='https://example.com/page?a=2';panelMessage({type:'SC_REFRESH'});await pause();assert.equal(last().pageDismissed,false);
});
