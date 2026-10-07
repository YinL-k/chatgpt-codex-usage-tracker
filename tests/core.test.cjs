'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../usage-core');const now=Date.now(),scope=C.LOCAL_SCOPE;
function evt(id,ts,model='GPT-6 Pro'){return {id:id.repeat(64),scope,ts,model,effort:'',kind:C.classify(model,'')};}
test('plan precedence, generic Pro and Business are conservative',()=>{
 assert.equal(C.detectPlan(['self_serve_business_prolite']),'business_premium');assert.equal(C.detectPlan(['prolite']),'pro100');
 assert.equal(C.detectPlan(['pro']),'pro_unknown');assert.equal(C.plans.pro_unknown.rules,null);assert.equal(C.detectPlan(['business']),'business_unknown');
 assert.equal(C.detectPlan(['business'],[],'PREMIUM'),'business_premium');assert.equal(C.detectPlan(['business_standard']),'business_standard');assert.equal(C.detectPlan(['pro200']),'pro200');assert.equal(C.detectPlan([null,'new-plan'],null),'');
});
test('percent 1 means one percent; malformed fields stay null',()=>{
 assert.equal(C.percent(1),1);assert.equal(C.percent('1'),1);for(const n of [null,'',true,-1,101,Infinity,{},'N/A'])assert.equal(C.percent(n),null);
 const m=C.meter({used_percent:1},'x','x',now);assert.equal(m.remainingPercent,99);assert.equal(m.limit,null);assert.equal(C.meter({},'x','x',now),null);
});
test('window labels derive from seconds, including missing/nonstandard windows',()=>{
 for(const [n,label] of [[18000,'5h'],[10800,'3h'],[604800,'7d'],[90,'90s'],[5400,'90m'],[null,'Window unavailable'],[0,'Window unavailable']])assert.equal(C.windowLabel(n),label);
 assert.equal(C.windowLabel(7200,'zh-CN'),'2小时');
});
test('reset absolute seconds, ms, ISO and relative aliases',()=>{
 assert.equal(C.resetAt({reset_at:1800000000},now),1800000000000);assert.equal(C.resetAt({reset_at:1800000000000},now),1800000000000);
 assert.equal(C.resetAt({resets_at:'2026-09-23T01:00:00Z'},now),Date.parse('2026-09-23T01:00:00Z'));
 for(const k of ['reset_after_seconds','reset_after','resets_after'])assert.equal(C.resetAt({[k]:60},now),now+60000);
 assert.equal(C.resetAt({reset_after_seconds:0},now),now);assert.equal(C.resetAt({reset_after_seconds:-1,reset_at:'tomorrow'},now),null);
});
test('partial/malformed server payloads do not fabricate balances or throw',()=>{
 for(const raw of [null,[],{},'bad',{additional_rate_limits:[null,{},1]}])assert.deepEqual(C.normalizeWham(raw,now).meters,[]);
 const s=C.normalizeWham({plan_type:'pro',rate_limit:{primary_window:{used_percent:1,limit_window_seconds:10800}},additional_rate_limits:[null,{limit_name:'extra',rate_limit:{primary_window:{remaining_percent:25}}}]},now);
 assert.equal(s.plan,'pro_unknown');assert.equal(s.meters[0].remainingPercent,99);assert.equal(s.meters[0].windowSeconds,10800);assert.equal(s.meters.length,2);
 assert.equal(C.normalizeInit({model_limits:[null,{}]},now).meters.length,0);
});
test('baseline increments only matching new events, then expires',()=>{
 const s=C.freshState(now);s.settings[scope]={plan:'pro200',baselines:{astra_week:{plan:'pro200',cap:200,used:12,at:now-2000,resetAt:now+5000}}};
 s.events=[evt('a',now-3000),evt('b',now-1000),evt('c',now-500,'GPT-5.6 Sol Pro'),evt('d',now+1000)];
 let r=C.allowance(s,scope,'pro200',now)[0];assert.equal(r.used,13);assert.equal(r.remaining,187);assert.equal(r.observed,2);
 r=C.allowance(s,scope,'pro200',now+6000)[0];assert.equal(r.used,null);assert.equal(r.resetAt,null);assert.equal(r.expired,true);
});
test('migration preserves settings, calibration, snapshots, extra fields; unknown schema refuses overwrite',()=>{
 const raw={...C.freshState(now),schema:2,custom:{x:1},snapshots:{legacy:1},settings:{[scope]:{plan:'pro200',baselines:{x:{used:1}}}},events:[evt('a',now-1),evt('a',now-1)]};
 const m=C.migrateState(raw,now);assert.equal(m.changed,true);assert.equal(m.state.events.length,1);assert.deepEqual(m.state.settings,raw.settings);assert.deepEqual(m.state.snapshots,raw.snapshots);assert.deepEqual(m.state.custom,raw.custom);
 assert.equal(C.migrateState(m.state,now).changed,false);assert.throws(()=>C.migrateState({...raw,schema:99}));assert.equal(raw.schema,2);
});
test('local dates exclude impossible dates and future statistics',()=>{
 assert.equal(C.dateFromKey('2026-02-30'),null);assert.ok(C.dateFromKey('2024-02-29'));
 const today=C.localDate(now),tom=new Date(now);tom.setDate(tom.getDate()+1);const stats=C.stats({[today]:3,[C.localDate(tom)]:40,'2026-02-30':90},now);assert.equal(stats.total,3);assert.equal(stats.month,3);assert.equal(stats.today,3);
});
test('merge is idempotent and preserves timestamp multiplicity and count-only records',()=>{
 const a={count:3,timestamps:[now,now]},b={count:3,timestamps:[now,now-1]},m=C.mergeEntry(a,b);assert.equal(m.timestamps.length,3);assert.equal(m.count,3);assert.deepEqual(C.mergeEntry(m,b),m);assert.equal(C.mergeEntry(50,m).count,50);
});
test('freshness and errors keep last good snapshot distinguishable',()=>{
 assert.equal(C.freshness(now,now).kind,'live');assert.equal(C.freshness(now-300000,now).kind,'cached');assert.equal(C.freshness(now-3600000,now).kind,'stale');assert.equal(C.freshness(null,now).kind,'unavailable');
 assert.equal(C.liveStatus({updatedAt:now-300000},{ts:now,status:500},now).kind,'error');assert.equal(C.liveStatus({updatedAt:now},{ts:now-1},now).kind,'live');
});
function background(seed={}){
 const data=structuredClone(seed);let listener,network=0;
 const chrome={runtime:{id:'test',getURL:x=>'chrome-extension://test/'+x,onMessage:{addListener:f=>listener=f},onInstalled:{addListener(){}},onStartup:{addListener(){}}},storage:{local:{setAccessLevel:async()=>{},get:async k=>k===null?structuredClone(data):Object.fromEntries((Array.isArray(k)?k:[k]).map(x=>[x,structuredClone(data[x])])),set:async v=>Object.assign(data,structuredClone(v))}},tabs:{query:async()=>[{id:1,active:true},{id:2}],sendMessage:async(id,m)=>{if(m.type==='UG_TRACKER_PING')return {ok:true,version:C.APP_VERSION};network++;await new Promise(r=>setTimeout(r,20));return {ok:true,status:'ok'};}}};
 const ctx={chrome,GPTUsageCore:C,importScripts(){},URL,console,setTimeout,clearTimeout,AbortController};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),ctx);
 const request=(m,page=false)=>new Promise(resolve=>listener(m,{id:'test',url:page?'https://chatgpt.com/c/test':'chrome-extension://test/popup.html',...(page?{tab:{id:1}}:{})},resolve));
 return {data,request,get network(){return network;}};
}
test('background events are serialized and durable dedup survives restart',async()=>{
 const bg=background(),e=evt('a',now-1000);const results=await Promise.all([bg.request({type:'UG_EVENT',event:e},true),bg.request({type:'UG_EVENT',event:e},true)]);
 assert.equal(results.filter(x=>x.duplicate).length,1);assert.equal(bg.data[C.localDate(e.ts)].count,1);
 const restarted=background(bg.data);assert.equal((await restarted.request({type:'UG_EVENT',event:e},true)).duplicate,true);
 assert.equal((await bg.request({type:'UG_EVENT',event:evt('b',now-1)})).error,'unauthorized');
});
test('background backup metadata, legacy import and unsupported import are atomic',async()=>{
 const bg=background({[C.KEY]:C.freshState(now)}),key=C.localDate(now),payload={meta:{version:5,kind:'activity-backup'},data:{[key]:{count:2,timestamps:[now-1,now-2]}}};
 assert.equal((await bg.request({type:'UG_IMPORT',payload})).ok,true);await bg.request({type:'UG_IMPORT',payload});assert.equal(bg.data[key].count,2);
 assert.equal((await bg.request({type:'UG_IMPORT',payload:{meta:{version:99},data:{[key]:900}}})).ok,false);assert.equal(bg.data[key].count,2);
 const exp=await bg.request({type:'UG_EXPORT'});assert.equal(exp.payload.meta.appVersion,C.APP_VERSION);assert.equal(exp.payload.meta.storageSchema,3);assert.deepEqual(exp.payload.data[key],bg.data[key]);
});
test('all refresh entry points share one flight and cooldown across tabs',async()=>{
 const bg=background();await Promise.all([bg.request({type:'UG_REFRESH_LIVE'}),bg.request({type:'UG_POLL_LIVE'},true),bg.request({type:'UG_REFRESH_LIVE'})]);assert.equal(bg.network,1);
 const r=await bg.request({type:'UG_REFRESH_LIVE'});assert.equal(r.status,'backoff');assert.equal(bg.network,1);
});
test('server failure persists backoff and preserves cached usage',async()=>{
 const live={plan:'plus',updatedAt:now-100000,meters:[]},bg=background({__gptLiveUsageV1:live});
 await bg.request({type:'UG_SERVER_ERROR',error:{status:429,ts:now}},true);const r=await bg.request({type:'UG_REFRESH_LIVE'});assert.equal(r.status,'backoff');assert.equal(bg.network,0);assert.deepEqual(bg.data.__gptLiveUsageV1,live);
});
test('packaging preserves permissions, versions and bilingual key coverage',()=>{
 const root=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
 assert.equal(manifest.version,C.APP_VERSION);assert.equal(manifest.version_name,C.APP_VERSION);assert.deepEqual(manifest.permissions,['storage','tabs','sidePanel','scripting','declarativeNetRequestWithHostAccess','alarms','notifications']);assert.deepEqual(manifest.host_permissions,['https://chatgpt.com/*','https://codex.lunarwerx.com/*','https://codex-reset.com/*']);
 const en=JSON.parse(fs.readFileSync(path.join(root,'locales/en.json'))),zh=JSON.parse(fs.readFileSync(path.join(root,'locales/zh.json')));assert.deepEqual(Object.keys(en).sort(),Object.keys(zh).sort());
 for(const file of ['heatmap.html','popup.html','usage-ui.js'])for(const [,key]of fs.readFileSync(path.join(root,file),'utf8').matchAll(/data-i18n(?:-aria)?="([^"]+)"/g))assert.ok(en[key]&&zh[key],key);
 const content=fs.readFileSync(path.join(root,'content.js'),'utf8');assert.equal((content.match(/fetch\(/g)||[]).length,1);assert.match(content,/method:'GET'/);assert.doesNotMatch(content,/method:\s*['"]POST|\/conversation|\/responses|\/completions/);
});
test('import rejects malformed records before writing any days',async()=>{
 const bg=background(),a=C.localDate(now),b=C.localDate(now-86400000);
 const r=await bg.request({type:'UG_IMPORT',payload:{data:{[a]:3,[b]:{count:-1}}}});assert.equal(r.ok,false);assert.equal(bg.data[a],undefined);
 const r2=await bg.request({type:'UG_IMPORT',payload:{data:{[a]:{timestamps:['bad']}}}});assert.equal(r2.ok,false);
});
test('seven day averages recognize legacy day keys without moving model coverage',async()=>{
 const state=C.freshState(now),yesterday=C.localDate(now-86400000),bg=background({[C.KEY]:state,[yesterday]:6});
 const r=await bg.request({type:'UG_STATE'});assert.equal(r.activity.avg7,6);assert.equal(r.state.coverageStart,state.coverageStart);
});
test('all literal dynamic translation keys exist in both languages',()=>{
 const root=path.join(__dirname,'..'),en=JSON.parse(fs.readFileSync(path.join(root,'locales/en.json'))),zh=JSON.parse(fs.readFileSync(path.join(root,'locales/zh.json')));
 for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.js')))for(const [,key]of fs.readFileSync(path.join(root,file),'utf8').matchAll(/\b(?:t|tFn)\(\s*['"]([a-z_0-9]+)['"]/g)){if(key==='u_')continue;assert.ok(en[key]&&zh[key],`${file}: ${key}`);}
});
test('a stale failed locale request cannot erase the newer successful dictionary',async()=>{
 const requests=[],ctx={window:{},chrome:{runtime:{getURL:p=>p}},fetch:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),document:{querySelectorAll:()=>[],documentElement:{},dispatchEvent(){}},CustomEvent:function(){},console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../i18n.js'),'utf8'),ctx);const first=ctx.window.GPTTrackerI18n.initI18n('en'),second=ctx.window.GPTTrackerI18n.initI18n('zh');requests[1].resolve({ok:true,json:async()=>({label_appearance:'appearance-fixture'})});await second;requests[0].reject(Error('stale'));await first;assert.equal(ctx.window.GPTTrackerI18n.t('label_appearance'),'appearance-fixture');assert.equal(ctx.document.documentElement.lang,'zh-CN');
});
