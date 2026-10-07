/* Local-only browser regression. No extension installation and no external requests. */
'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.TEST_OUTPUT||path.join(root,'tests','artifacts');fs.mkdirSync(out,{recursive:true});
const report={dom:[],smoke:[],screenshots:[],externalRequests:[],errors:[]};
const server=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);return res.end();}const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}if(url.pathname==='/fixture'){res.setHeader('content-type','text/html');return res.end('<!doctype html><html><body><button data-testid="model-switcher-dropdown-button">GPT-6 Pro</button><section id="messages"></section><form onsubmit="return false"><textarea id="prompt-textarea"></textarea><button type="submit" data-testid="send-button">Send</button></form><script>document.querySelector("form").addEventListener("submit",e=>e.preventDefault())</script></body></html>');}try{res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
async function setup(page,opts={}){
 await page.route('https://codex-reset.com/api/forecast',r=>r.fulfill({json:{updated_at:new Date().toISOString(),probabilities:{rounded_24h:20,rounded_48h:35},last_reset_at:new Date(Date.now()-10*86400000).toISOString(),confidence:'low',context:{state:'TEASE',primary_post:{at:new Date(Date.now()-86400000).toISOString(),url:'https://x.com/example/status/1'}}}}));
 await page.addInitScript(({opts})=>{
  window.fixture={opts,events:[],messages:[],fetches:[],listeners:[],data:{},sync:{gptTrackerLang:opts.lang||'en'},refreshes:0};
  localStorage.setItem('gptTrackerTheme',opts.theme||'dark');
  const f=window.fixture;function storage(area){return {get(k,cb){let r=k===null?{...f[area]}:typeof k==='string'?{[k]:f[area][k]}:Object.fromEntries(k.map(x=>[x,f[area][x]]));if(cb)queueMicrotask(()=>cb(r));return Promise.resolve(r);},set(v,cb){const changes=Object.fromEntries(Object.entries(v).map(([k,value])=>[k,{newValue:value,oldValue:f[area][k]}]));Object.assign(f[area],v);f.listeners.forEach(fn=>fn(changes,area==='data'?'local':'sync'));cb?.();return Promise.resolve();}};}
  f.emit=()=>f.listeners.forEach(fn=>fn({__gptLiveUsageV1:{newValue:f.live}},'local'));
  f.init=()=>{if(f.state)return;const C=GPTUsageCore,now=Date.now();f.state=C.freshState(now-14*C.DAY);f.live=null;
   if(opts.state!=='empty'){
    f.state.events=Array.from({length:5},(_,i)=>({id:String(i).repeat(64),scope:C.LOCAL_SCOPE,ts:now-i*86400000,model:'GPT-6 Pro',effort:'',kind:'gpt6_pro'}));
    for(let i=0;i<14;i++){const d=new Date(now);d.setDate(d.getDate()-i);f.data[C.localDate(d)]={count:(i%5+1)*3,timestamps:[d.getTime()-1000,d.getTime()-2000]};}
    f.live=C.normalizeWham({plan_type:'business_premium',rate_limit:{primary_window:{used_percent:1,limit_window_seconds:10800,reset_after_seconds:7200},secondary_window:{used_percent:35,limit_window_seconds:604800,reset_after_seconds:172800}},credits:{balance:3}},opts.state==='error'?now-400000:now);
    if(opts.state==='error')f.error={ts:now,status:429};
   }
  };
  window.chrome={windows:{getCurrent:async()=>({id:1})},sidePanel:{open:async()=>{}},runtime:{getURL:p=>location.origin+'/'+p,onMessage:{addListener(fn){f.capture=fn;}},async sendMessage(m){f.messages.push(m);if(m.type==='UG_EVENT'){f.events.push(m.event);return {ok:true};}if(m.type==='UG_POLL_LIVE')return {ok:true};f.init();const C=GPTUsageCore;
   if(m.type==='UG_STATE')return {ok:true,state:f.state,liveUsage:f.live,liveError:f.error,stats:C.stats(f.data),activity:{avg7:5,todayHours:Array(24).fill(0)}};
   if(m.type==='UG_REFRESH_LIVE'){f.refreshes++;return {ok:true,refreshed:opts.state==='data',status:opts.state==='error'?'backoff':opts.state==='empty'?'no-responsive-tab':'ok'};}
   if(m.type==='UG_PREFS'){f.state.settings[C.LOCAL_SCOPE]={...f.state.settings[C.LOCAL_SCOPE],plan:m.plan};return {ok:true};}
   if(m.type==='UG_BASELINE'){const prefs=f.state.settings[C.LOCAL_SCOPE]||{},baselines=prefs.baselines||{};if(m.clear)delete baselines[m.rule];else baselines[m.rule]={plan:m.plan,cap:C.plans[m.plan].rules.find(r=>r.id===m.rule).cap,used:m.used,at:Date.now(),resetAt:m.resetAt};f.state.settings[C.LOCAL_SCOPE]={...prefs,baselines};return {ok:true};}
   if(m.type==='UG_EXPORT')return {ok:true,payload:{meta:{version:5,appVersion:C.APP_VERSION,kind:'activity-backup'},data:f.data}};
   if(m.type==='UG_IMPORT'){for(const [k,v]of Object.entries(m.payload.data||{}))f.data[k]=C.mergeEntry(f.data[k],v);return {ok:true};}
   return {ok:true};}},storage:{local:storage('data'),sync:storage('sync'),onChanged:{addListener:fn=>f.listeners.push(fn)}},tabs:{create:async v=>{f.opened=v.url;}}};
 },{opts});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push('console: '+m.text());});
}
async function run(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
 const ctx=await browser.newContext();await ctx.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base)||u.startsWith('blob:')||u.startsWith('data:'))return route.continue();report.externalRequests.push({url:u,method:route.request().method()});return route.abort();});
 async function domCase(name,action){const page=await ctx.newPage();await setup(page,{state:'empty'});await page.goto(base+'/fixture');await page.addScriptTag({path:path.join(root,'usage-core.js')});await page.addScriptTag({path:path.join(root,'content.js')});await action(page);await page.close();report.dom.push(name);console.log('DOM OK',name);}
 const fill=(p,text='local fixture')=>p.locator('#prompt-textarea').fill(text);
 const message=async(p,id,text='local fixture',clear=true)=>p.evaluate(({id,text,clear})=>{const n=document.createElement('div');n.dataset.messageAuthorRole='user';n.dataset.messageId=id;n.textContent=text;document.querySelector('#messages').append(n);if(clear)document.querySelector('textarea').value='';},{id,text,clear});
 const count=async(p,n)=>{await p.waitForTimeout(1150);assert.equal(await p.evaluate(()=>fixture.events.length),n);};
 if(!process.env.UI_ONLY){
 await domCase('click + submit coalesce and confirm once',async p=>{await fill(p);await p.locator('[data-testid="send-button"]').click();await count(p,0);await message(p,'new1');await count(p,1);assert.deepEqual(Object.keys(await p.evaluate(()=>fixture.events[0])).sort(),['effort','id','model','scope','ts']);await p.evaluate(()=>{const n=document.querySelector('[data-message-id]');n.remove();document.querySelector('#messages').append(n.cloneNode(true));});await count(p,1);});
 await domCase('Enter confirmation and repeated events',async p=>{await fill(p);await p.locator('textarea').press('Enter');await p.evaluate(()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true})));await message(p,'new2');await count(p,1);});
 await domCase('submit-only confirmation',async p=>{await fill(p);await p.evaluate(()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true})));await message(p,'new3');await count(p,1);});
 await domCase('empty and disabled sends never count',async p=>{await fill(p,'   ');await p.locator('textarea').press('Enter');await message(p,'empty','');await count(p,0);await fill(p);await p.locator('button[type=submit]').evaluate(n=>n.disabled=true);await p.locator('textarea').press('Enter');await message(p,'disabled');await count(p,0);});
 await domCase('failed send and optimistic error never count',async p=>{await fill(p);await p.locator('textarea').press('Enter');await count(p,0);await message(p,'failed');await p.evaluate(()=>{const e=document.createElement('div');e.setAttribute('role','alert');e.textContent='Failed to send';document.body.append(e);});await count(p,0);});
 await domCase('composer unchanged is not confirmation',async p=>{await fill(p);await p.locator('textarea').press('Enter');await message(p,'not-cleared','local fixture',false);await count(p,0);});
 await domCase('old messages remount and unrelated new messages ignored',async p=>{await message(p,'old');await p.waitForTimeout(60);await fill(p);await p.locator('textarea').press('Enter');await p.evaluate(()=>document.querySelector('#messages').innerHTML='');await message(p,'old');await message(p,'unrelated','other fixture');await count(p,0);});
 await domCase('SPA navigation cancels stale intent',async p=>{await fill(p);await p.locator('textarea').press('Enter');await p.evaluate(()=>history.pushState({},'', '/c/history'));await message(p,'replay');await count(p,0);});
 await domCase('new conversation route may confirm first send',async p=>{await p.evaluate(()=>history.pushState({},'','/'));await p.waitForTimeout(1100);await fill(p);await p.locator('textarea').press('Enter');await p.evaluate(()=>history.pushState({},'','/c/new-conversation'));await message(p,'first');await count(p,1);});
 await domCase('Shift Enter and IME do not arm',async p=>{await fill(p);await p.locator('textarea').press('Shift+Enter');await p.evaluate(()=>document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));await message(p,'ime');await count(p,0);});
 await domCase('GET-only capture has one flight; errors retain diagnostics without token',async p=>{
  await p.evaluate(()=>{window.fetch=async(url,opts)=>{fixture.fetches.push({url,method:opts.method});await new Promise(r=>setTimeout(r,40));return {ok:true,json:async()=>url.includes('session')?{accessToken:'fixture-token-transient'}:{plan_type:'plus',rate_limit:{primary_window:{used_percent:1,limit_window_seconds:10800}}}};};});
  await p.evaluate(()=>Promise.all([1,2,3].map(()=>new Promise(resolve=>fixture.capture({type:'UG_CAPTURE_SERVER'},{},resolve)))));
  const f=await p.evaluate(()=>({fetches:fixture.fetches,messages:fixture.messages}));assert.equal(f.fetches.length,2);assert.ok(f.fetches.every(x=>x.method==='GET'));assert.ok(!JSON.stringify(f.messages).includes('fixture-token'));
  await p.evaluate(()=>{window.fetch=async()=>({ok:false,status:429});});await p.evaluate(()=>new Promise(resolve=>fixture.capture({type:'UG_CAPTURE_SERVER'},{},resolve)));assert.ok(await p.evaluate(()=>fixture.messages.some(m=>m.type==='UG_SERVER_ERROR'&&m.error.status===429)));
 });
 await domCase('intent expires without a matching message',async p=>{await p.clock.install();await fill(p);await p.locator('textarea').press('Enter');await p.clock.fastForward(21000);await message(p,'expired');await p.clock.fastForward(2000);assert.equal(await p.evaluate(()=>fixture.events.length),0);});
 await domCase('manual background-tab read renews session without touching draft or generation',async p=>{
  await fill(p,'unsent local draft');await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});const b=document.createElement('button');b.dataset.testid='stop-button';b.textContent='Stop';document.body.append(b);const boot=document.createElement('script');boot.id='client-bootstrap';boot.type='application/json';boot.textContent=JSON.stringify({session:{accessToken:'expired-fixture'}});document.body.append(boot);fixture.fetches=[];window.fetch=async(url,o)=>{fixture.fetches.push({url,method:o.method,token:o.headers.authorization});return {ok:true,json:async()=>url.includes('session')?{accessToken:'fresh-fixture'}:{plan_type:'plus',rate_limit:{primary_window:{used_percent:1,limit_window_seconds:10800}}}};};});
  const r=await p.evaluate(()=>new Promise(resolve=>fixture.capture({type:'UG_CAPTURE_SERVER',manual:true},{},resolve)));assert.equal(r.ok,true);assert.equal(await p.locator('textarea').inputValue(),'unsent local draft');assert.equal(await p.locator('[data-testid="stop-button"]').count(),1);const f=await p.evaluate(()=>({fetches:fixture.fetches,messages:fixture.messages,events:fixture.events}));assert.equal(f.fetches.length,2);assert.ok(f.fetches[0].url.endsWith('/api/auth/session'));assert.equal(f.fetches[1].token,'Bearer fresh-fixture');assert.ok(f.fetches.every(x=>x.method==='GET'));assert.equal(f.events.length,0);assert.ok(!JSON.stringify(f.messages).includes('fresh-fixture'));
 });
 await domCase('hidden pages pause capture and GET timeout is reported',async p=>{
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});fixture.fetches=[];window.fetch=async()=>{fixture.fetches.push(1);throw Error();};});
  assert.equal((await p.evaluate(()=>new Promise(resolve=>fixture.capture({type:'UG_CAPTURE_SERVER'},{},resolve)))).status,'hidden');assert.equal(await p.evaluate(()=>fixture.fetches.length),0);
  await p.clock.install();await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});window.fetch=(_url,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError'))));window.resultPromise=new Promise(resolve=>fixture.capture({type:'UG_CAPTURE_SERVER'},{},resolve));});
  await p.clock.fastForward(11000);assert.equal((await p.evaluate(()=>window.resultPromise)).status,'timeout');
 });
 }
 if(process.env.DOM_ONLY){assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);await browser.close();console.log('DOM-only regression: '+report.dom.length+' passed');return;}
 // Matrix validates both locales/themes, empty/data/error and desktop/narrow surfaces.
 for(const lang of ['en','zh'])for(const theme of ['light','dark'])for(const state of ['empty','data','error']){
  for(const kind of ['popup','desktop','narrow']){
   const page=await ctx.newPage();await page.setViewportSize(kind==='popup'?{width:355,height:632}:kind==='narrow'?{width:390,height:844}:{width:1280,height:900});await page.emulateMedia({reducedMotion:state==='error'?'reduce':'no-preference'});await setup(page,{lang,theme,state});await page.goto(base+(kind==='popup'?'/popup.html':'/heatmap.html'));await page.waitForFunction(()=>window.GPTTrackerI18n?.currentLang===fixture.opts.lang&&document.documentElement.lang===(fixture.opts.lang==='zh'?'zh-CN':'en'));await page.waitForTimeout(180);
   if(kind==='popup'){
    assert.equal(await page.locator('#popupThemeToggle').isVisible(),true);assert.equal(await page.locator('[data-language=zh]').isVisible(),true);
    assert.equal(await page.locator('#compactPlan').textContent(),state==='empty'?(lang==='zh'?'尚未识别':'Not identified yet'):'Business Premium');
    if(state!=='empty')assert.equal(await page.locator('#codexPrimary').textContent(),'99');
    const file=`${kind}-${lang}-${theme}-${state}.png`;await page.screenshot({path:path.join(out,file)});report.screenshots.push(file);
   }else{
    for(const tab of ['overview','activity','usage']){await page.locator('#tab-'+tab).click();await page.waitForTimeout(130);if(state==='error')assert.equal(await page.locator('#'+tab+'View').evaluate(n=>getComputedStyle(n).animationName),'none');assert.equal(await page.locator('#'+tab+'View').isVisible(),true);const file=`${kind}-${tab}-${lang}-${theme}-${state}.png`;await page.screenshot({path:path.join(out,file),fullPage:true});report.screenshots.push(file);}
    const badge=await page.locator('#proTrust').boundingBox(),panel=await page.locator('#usagePanel').boundingBox();assert.ok(badge.x>=panel.x&&badge.x+badge.width<=panel.x+panel.width,`badge clipped: ${kind}-${lang}-${theme}-${state}`);
    if(state==='data')assert.match(await page.locator('#codexMeters').textContent(),lang==='en'?/3h/:/3小时/);
   }
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert.equal(overflow,false,`overflow ${kind}-${lang}-${theme}-${state}`);
   report.smoke.push(`${kind}-${lang}-${theme}-${state}`);await page.close();
  }
 }
 const page=await ctx.newPage();await setup(page,{lang:'en',theme:'dark',state:'data'});await page.goto(base+'/heatmap.html');await page.waitForSelector('#overviewPlan:has-text("Business")');
 await page.locator('#tab-overview').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#tab-activity').getAttribute('aria-selected'),'true');await page.keyboard.press('End');assert.equal(await page.locator('#tab-usage').getAttribute('aria-selected'),'true');
 await page.locator('#themeToggle').focus();await page.keyboard.press('Space');assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('dark')),false);
 await page.locator('#languageToggle').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');assert.equal(await page.locator('#tab-overview').textContent(),'概览');
 await page.locator('#calibrateDetails').evaluate(n=>n.open=true);await page.locator('#calRemaining').fill('40');await page.locator('#calReset').fill('2027-01-01T12:00');await page.locator('#calSave').click();await page.waitForFunction(()=>fixture.state.settings[GPTUsageCore.LOCAL_SCOPE]?.baselines?.shared_week?.used===10);assert.match(await page.locator('#proMeters').textContent(),/40/);
 await page.locator('#calClear').click();await page.waitForFunction(()=>!fixture.state.settings[GPTUsageCore.LOCAL_SCOPE].baselines.shared_week);
 await page.locator('#refreshLive').click();await page.waitForFunction(()=>fixture.refreshes>0);
 const download=page.waitForEvent('download');await page.locator('#exportData').click();const downloaded=await download;const exported=JSON.parse(fs.readFileSync(await downloaded.path(),'utf8'));assert.equal(exported.meta.appVersion,'3.5.0');
 await page.locator('#importFileInput').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({meta:{version:5},data:{'2026-01-02':{count:5,timestamps:[]}}}))});await page.waitForFunction(()=>fixture.data['2026-01-02']?.count===5);
 await page.locator('#tab-activity').click();const originalPie=await page.evaluate(()=>timeDistributionState.total);await page.evaluate(()=>{allData['2099-01-01']={count:100,timestamps:[Date.now()+86400000]};updateTimeDistribution();});assert.equal(await page.evaluate(()=>timeDistributionState.total),originalPie);await page.locator('.day-cell[data-date]').first().focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[role=dialog]').isVisible(),true);await page.keyboard.press('Tab');assert.equal(await page.locator('#modalCloseBtn').evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await page.locator('[role=dialog]').isVisible(),false);
 const popup=await ctx.newPage();await setup(popup,{lang:'en',theme:'dark',state:'data'});await popup.setViewportSize({width:355,height:632});await popup.goto(base+'/popup.html');await popup.locator('#popupThemeToggle').click();assert.equal(await popup.locator('#artboard').getAttribute('data-theme'),'light');await popup.locator('[data-language=zh]').click();await popup.waitForFunction(()=>document.documentElement.lang==='zh-CN');await popup.locator('#openDashboard').click();assert.match(await popup.evaluate(()=>fixture.opened),/heatmap.html#overview$/);await popup.close();
 report.smoke.push('keyboard/theme/language/calibrate/clear/refresh/export/import/modal');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);await browser.close();
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({dom:report.dom.length,smoke:report.smoke.length,screenshots:report.screenshots.length,externalRequests:report.externalRequests.length,errors:report.errors.length}));
}
module.exports={setup,server,report,root,out};
if(require.main===module)run().catch(e=>{report.failure=e.stack;fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.error(e);process.exitCode=1;setTimeout(()=>process.exit(1),500);}).finally(()=>server.close());
