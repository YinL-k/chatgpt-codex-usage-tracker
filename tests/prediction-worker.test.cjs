'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),P=require('../reset-notifications-core');
const start=1800000000000,C=P.CONFIG;
function harness(seed={}){
 const data=structuredClone(seed),notifications=[],requests=[],alarms=[];let time=start,onAlarm,onMessage,fail=false,confirmed=null;
 class Clock extends Date{static now(){return time;}}
 const chrome={runtime:{id:'test',getURL:x=>'chrome-extension://test/'+x,onStartup:{addListener(){}},onMessage:{addListener:f=>onMessage=f}},
  storage:{local:{get:async k=>Object.fromEntries((Array.isArray(k)?k:[k]).map(x=>[x,structuredClone(data[x])])),set:async v=>Object.assign(data,structuredClone(v))},sync:{get:async()=>({gptTrackerLang:'zh'})}},
  alarms:{get:async()=>({name:'existing'}),create:async(...v)=>alarms.push(v),onAlarm:{addListener:f=>onAlarm=f}},
  notifications:{create:async(id,value)=>{assert.ok(data[C.key].count>0,'reservation precedes delivery');notifications.push({id,...value});},onClicked:{addListener(){}}},tabs:{create:async()=>{}}};
 const ctx={SakuraResetPolicy:P,chrome,Date:Clock,AbortSignal,URL,navigator:{language:'en'},fetch:async url=>{requests.push(url);if(url===C.confirmedURL)return {ok:true,json:async()=>({events:confirmed?[confirmed]:[]})};if(fail)throw Error('offline');return {ok:true,json:async()=>({generatedAt:new Date(time).toISOString(),lastResetAt:new Date(start-3600000).toISOString(),nearTerm:{hours:6,probability:.35},next24Hours:{probability:.65}})};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../reset-notifications-worker'),'utf8'),ctx);
 return {data,notifications,requests,alarms,poll:()=>onAlarm({name:'sakura-predictive-reset'}),at:minutes=>time=start+minutes*60000,failForecast:()=>fail=true,confirm:at=>confirmed={id:'new-cycle',announced_at:new Date(at).toISOString(),group:'reset',announcement_state:'announced'},prefs:m=>new Promise(resolve=>onMessage({type:'RN_PREFS',...m},{id:'test',url:'chrome-extension://test/heatmap.html'},resolve))};
}
test('real worker wiring predicts without confirmed and does not recreate existing alarm',async()=>{const h=harness();for(const i of [0,5,10]){h.at(i);await h.poll();}assert.equal(h.notifications.length,1);assert.equal(h.notifications[0].title,'Reset 可能接近');assert.ok(!/已 Reset|额度已恢复/.test(h.notifications[0].message));assert.equal(h.alarms.length,0);});
test('worker restart preserves delivered quota',async()=>{const h=harness();for(const i of [0,5,10]){h.at(i);await h.poll();}const h2=harness(h.data);for(const i of [15,20,25]){h2.at(i);await h2.poll();}assert.equal(h2.notifications.length,0);});
test('confirmation is durable even when LunarWerx is offline, and emits nothing',async()=>{const h=harness();for(const i of [0,5,10]){h.at(i);await h.poll();}h.at(15);h.confirm(start+15*60000);h.failForecast();await h.poll();assert.equal(h.data[C.key].cycleId,'new-cycle');assert.equal(h.data[C.key].count,0);assert.equal(h.notifications.length,1);});
test('settings preserve quota and persist low sensitivity',async()=>{const h=harness();for(const i of [0,5,10]){h.at(i);await h.poll();}assert.equal((await h.prefs({mode:'low',enabled:true})).ok,true);assert.equal(h.data[C.prefsKey].mode,'low');assert.equal(h.data[C.key].count,1);assert.deepEqual(h.data[C.key].run,{h24:[],h6:[]});});
