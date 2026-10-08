'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {setup,server}=require('./browser.cjs');
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    for(const lang of ['en','zh'])for(const theme of ['light','dark'])for(const official of [false,true]){
      const p=await browser.newPage();await setup(p,{lang,theme,state:'data'});
      await p.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
      const errors=[];p.on('pageerror',e=>errors.push(e.message));
      await p.addInitScript(({official})=>{
        const init=fixture.init;fixture.init=()=>{init();fixture.live.plan='pro200';};
        const send=chrome.runtime.sendMessage;chrome.runtime.sendMessage=async m=>{
          const r=await send(m);
          if(m.type==='UG_STATE'&&official)r.proUsage={updatedAt:Date.now(),meters:[{label:'Pro',limit:83,remaining:71,windowSeconds:604800}]};
          return r;
        };
      },{official});
      await p.goto(base+'/popup.html');await p.waitForFunction(v=>document.querySelector('#proPrimary')?.textContent===v,official?'71':'5');
      if(!official)assert.match(await p.locator('#proResetText').textContent(),lang==='zh'?/额度待确认/:/Allowance pending confirmation/);
      await p.goto(base+'/heatmap.html#overview');await p.waitForFunction(v=>document.querySelector('#overviewPro')?.textContent===v,official?'71':'5');
      if(!official)assert.match(await p.locator('#overviewProSub').textContent(),lang==='zh'?/额度待确认/:/Allowance pending confirmation/);
      await p.locator('#tab-usage').click();await p.waitForFunction(()=>document.querySelector('#planTable')?.textContent.includes('Pro $500'));
      assert.equal(await p.locator('#planTable').getByText('Pro $500',{exact:true}).count(),1);
      assert.doesNotMatch(await p.locator('#planTable').textContent(),/20x|5x|200 \/|170 \/|null/);
      assert.deepEqual(errors,[]);await p.close();
    }
    console.log('8 Pro plan browser cases passed: EN/ZH, light/dark, pending/official, popup/dashboard.');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
