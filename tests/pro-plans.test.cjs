'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../usage-core');
const now=Date.now(),scope=C.LOCAL_SCOPE;
test('personal Pro tiers have no universal cap or multiplier',()=>{
  for(const amount of [100,200,500]){
    const key='pro'+amount;
    assert.equal(C.detectPlan([key]),key);assert.equal(C.detectPlan(['pro_'+amount]),key);
    assert.equal(C.plans[key].label,'Pro $'+amount);assert.equal(C.plans[key].rules,null);
  }
  assert.equal(C.detectPlan(['pro']),'pro_unknown');
});
test('retired personal caps cannot be restored by saved baselines or learned cycles',()=>{
  const s=C.freshState(now-30*C.DAY);
  s.events=[{scope,ts:now-20*C.DAY,kind:'gpt6_pro'},{scope,ts:now-1,kind:'sol_pro'},{scope,ts:now-1,kind:'other'},{scope:'other',ts:now-1,kind:'gpt6_pro'},{scope,ts:now+1,kind:'gpt6_pro'}];
  for(const key of ['pro100','pro200','pro500','pro_unknown']){
    s.settings[scope]={plan:key,baselines:{astra_week:{plan:key,cap:200,used:12,at:now-2000,resetAt:now+C.DAY}}};
    const before=JSON.stringify(s);
    const [r]=C.proAllowances(s,scope,key,null,{x:{kind:'all_pro',windowMs:7*C.DAY,lastResetAt:now-C.DAY,nextResetAt:now+6*C.DAY,detectedResets:5}},now);
    assert.equal(r.observed,2);assert.equal(r.allowancePending,true);
    for(const field of ['cap','remaining','remainingPercent','resetAt'])assert.equal(r[field],null);
    assert.deepEqual(C.allowance(s,scope,key,now),[]);assert.equal(JSON.stringify(s),before);
  }
  assert.deepEqual(C.proAllowances(s,scope,'plus',null,null,now),[]);
});
test('actual account limits take precedence; stale limits return to pending without inventing caps',()=>{
  const s=C.freshState(now),server={updatedAt:now,meters:[{label:'Pro',limit:83,remaining:71,windowSeconds:604800}]};
  const [r]=C.proAllowances(s,scope,'pro200',server,null,now);
  assert.equal(r.mode,'official');assert.equal(r.cap,83);assert.equal(r.remaining,71);
  const [stale]=C.proAllowances(s,scope,'pro200',{...server,updatedAt:now-2*60*60*1000},null,now);
  assert.equal(stale.allowancePending,true);assert.equal(stale.remaining,null);
  const [percent]=C.proAllowances(s,scope,'pro500',{updatedAt:now,meters:[{remainingPercent:42}]},null,now);
  assert.equal(percent.remainingPercent,42);assert.equal(percent.remaining,null);assert.equal(percent.cap,null);
});
