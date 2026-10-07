'use strict';

document.addEventListener('DOMContentLoaded',()=>{
  const C=GPTUsageCore;
  const t=(k,f)=>GPTTrackerI18n.t(k,f);
  const tr=(k,vars)=>Object.entries(vars).reduce((s,[key,v])=>s.replace('{'+key+'}',v),t(k));
  const send=m=>chrome.runtime.sendMessage(m).catch(()=>({ok:false,error:'extension_reloaded'}));
  const usage=GPTUsageUI.mount(document.getElementById('usagePanel'));
  const names=['overview','activity','usage'];
  let current='overview', storageTimer=null, overviewResizeTimer=null;

  function redrawActivity(){
    if(typeof renderCalendar==='function'&&Number.isFinite(currentYear)){
      renderCalendar(currentYear);
      updateDailyChartForToday();
      updateTimeDistribution();
    }
  }

  function fmt(n){return Number.isFinite(n)?new Intl.NumberFormat().format(n):'—';}
  function fmtShortDate(ts){
    if(!Number.isFinite(ts))return '—';
    return new Date(ts).toLocaleString(document.documentElement.lang||undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function relative(ts){
    if(!Number.isFinite(ts))return t('no_live');
    const ms=Math.max(0,Date.now()-ts),m=Math.round(ms/60000);
    if(m<1)return t('updated_now');
    if(m<60)return tr('updated_ago',{n:m,unit:t('unit_m')});
    const h=Math.round(m/60);if(h<24)return tr('updated_ago',{n:h,unit:t('unit_h')});
    return tr('updated_ago',{n:Math.round(h/24),unit:t('unit_d')});
  }
  function localKey(d){return C.localDate(d);}
  function weekRange(offset=0){
    const now=new Date();now.setHours(0,0,0,0);
    const start=new Date(now);start.setDate(now.getDate()-(now.getDay()+6)%7+offset*7);
    const end=new Date(start);end.setDate(start.getDate()+6);end.setHours(23,59,59,999);
    return [start,end];
  }
  function sumRange(all,start,end){
    let total=0;
    for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1))total+=C.entry(all[localKey(d)]).count;
    return total;
  }
  function trustLabel(kind){if(kind==='error')return t('trust_error');return kind==='live'?t('trust_live'):kind==='cached'?t('trust_cached'):kind==='stale'?t('trust_stale'):t('trust_unavailable');}

  const overview={
    canvas:document.getElementById('overviewTrendCanvas'),
    points:[],
    active:false,
    async activate(){this.active=true;await this.load();},
    deactivate(){this.active=false;},
    async load(){
      const [r,all]=await Promise.all([send({type:'UG_STATE'}),chrome.storage.local.get(null)]);
      if(!r.ok){GPTFeedback.status(t('state_error'),true);return;}
      this.render(r,all);
    },
    render(r,all){
      const state=C.state(r.state), live=r.liveUsage||null, prefs=C.obj(state.settings[C.LOCAL_SCOPE]);
      const manual=prefs.plan&&prefs.plan!=='auto'?prefs.plan:'';
      const planKey=manual||live?.plan||'';
      const preset=C.plans[planKey];
      const fresh=C.liveStatus(live,r.liveError);
      document.getElementById('overviewCodexTitle').textContent=`Codex · ${C.windowLabel(live?.meters?.find(m=>m.id==='main:primary_window')?.windowSeconds,document.documentElement.lang)}`;
      document.getElementById('overviewPlan').textContent=preset?.label||t('u_unknown');
      document.getElementById('overviewPlanMeta').textContent=manual?t('manual_override'):live?.plan?t('detected_reported'):t('detect_membership');
      const freshEl=document.getElementById('overviewFreshness');
      freshEl.className=`overview-freshness ${fresh.kind}`;
      freshEl.textContent=manual?t('compact_local'):trustLabel(fresh.kind);
      document.getElementById('overviewUpdated').textContent=manual?t('override_active'):relative(live?.updatedAt);

      const [thisStart,thisEnd]=weekRange(0),[prevStart,prevEnd]=weekRange(-1);
      const thisWeek=sumRange(all,thisStart,Math.min(thisEnd,new Date()));
      const prevWeek=sumRange(all,prevStart,prevEnd);
      document.getElementById('overviewWeek').textContent=fmt(thisWeek);
      const deltaEl=document.getElementById('overviewWeekDelta');
      if(prevWeek>0){const pct=Math.round((thisWeek-prevWeek)/prevWeek*100);deltaEl.textContent=tr('vs_last_week',{pct:`${pct>=0?'+':''}${pct}`});}
      else deltaEl.textContent=thisWeek?t('no_baseline'):t('week_empty');
      document.getElementById('overviewMonth').textContent=fmt(r.stats?.month||0);

      const rules=C.proAllowances(state,C.LOCAL_SCOPE,planKey,r.proUsage,r.proCycles);
      const proRule=C.proPrimary(rules);
      const proEl=document.getElementById('overviewPro'),proSub=document.getElementById('overviewProSub');
      let proTitle='pro_usage_title';
      if(proRule?.mode==='official')proTitle='pro_reported_title';
      else if(proRule?.mode==='learned'||proRule?.mode==='manual')proTitle='pro_estimated_title';
      else if(proRule)proTitle='pro_recorded_title';
      document.getElementById('overviewProTitle').textContent=t(proTitle);
      let note=document.getElementById('overviewCacheNote');
      if(!note){note=document.createElement('p');note.id='overviewCacheNote';note.className='usage-cache-note';note.setAttribute('role','status');document.querySelector('.overview-context').after(note);}
      note.textContent=GPTFeedback.savedUsage(live,fresh.kind);note.hidden=!note.textContent;
      if(proRule){
        if(Number.isFinite(proRule.remaining)){proEl.textContent=`${proRule.mode==='official'?'':'≈ '}${fmt(proRule.remaining)}`;proSub.textContent=Number.isFinite(proRule.resetAt)?`${proRule.mode==='official'?t('pro_reported','Reported by ChatGPT'):t('trust_estimated')} · ${t('compact_resets')} ${fmtShortDate(proRule.resetAt)}`:(proRule.mode==='official'?t('pro_reported','Reported by ChatGPT'):t('pro_learning_cycle','Learning reset cycle'));}
        else if(Number.isFinite(proRule.remainingPercent)){proEl.textContent=`${fmt(proRule.remainingPercent)}%`;proSub.textContent=Number.isFinite(proRule.resetAt)?`${t('pro_reported','Reported by ChatGPT')} · ${t('compact_resets')} ${fmtShortDate(proRule.resetAt)}`:t('pro_reported','Reported by ChatGPT');}
        else{proEl.textContent=fmt(proRule.observed||0);proSub.textContent=t('pro_observed_learning','Confirmed local Pro sends only · learning reset cycle automatically.');}
      }else{proEl.textContent='—';proSub.textContent=preset?t('pro_waiting_metadata','Tracking Pro sends · waiting for reset metadata'):t('plan_unknown');}

      const primary=(live?.meters||[]).find(m=>m.id==='main:primary_window')||(live?.meters||[]).find(m=>m.id.endsWith('primary_window'));
      const codexEl=document.getElementById('overviewCodex'),codexSub=document.getElementById('overviewCodexSub');
      if(primary&&Number.isFinite(primary.remainingPercent)){codexEl.textContent=`${fmt(primary.remainingPercent)}%`;codexSub.textContent=primary.resetAt?`${t('compact_resets')} ${fmtShortDate(primary.resetAt)}`:t('compact_server_reported');}
      else{codexEl.textContent='—';codexSub.textContent=t('no_meter');}

      document.getElementById('overviewToday').textContent=tr('messages_count',{n:fmt(r.stats?.today||0)});
      document.getElementById('overviewAvg7').textContent=Number.isFinite(r.activity?.avg7)?tr('messages_day',{n:r.activity.avg7.toFixed(r.activity.avg7>=10?0:1)}):t('history_short');
      document.getElementById('overviewTrackingSince').textContent=Number.isFinite(state.coverageStart)?new Date(state.coverageStart).toLocaleDateString(document.documentElement.lang||undefined,{month:'short',day:'numeric',year:'numeric'}):'—';

      this.renderResets(rules,live);
      this.renderTrend(all);
    },
    renderResets(rules,live){
      const host=document.getElementById('overviewResets');host.replaceChildren();
      const items=[];
      for(const r of rules||[]){
        if(!Number.isFinite(r.resetAt))continue;
        const name=r.label||(r.id==='shared_week'?t('pro_allowance'):r.id==='astra_week'?'GPT-6 Pro':r.id==='sol_day'?'GPT-5.6 Sol Pro':t('pro_allowance'));
        const note=r.mode==='official'?t('compact_server_reported'):r.mode==='learned'?t('trust_estimated'):t('u_local');
        items.push({name,note,ts:r.resetAt,green:false});
      }
      for(const m of live?.meters||[]){
        if(!Number.isFinite(m.resetAt)||!(m.id==='main:primary_window'||m.id==='main:secondary_window'))continue;
        items.push({name:`Codex · ${C.windowLabel(m.windowSeconds,document.documentElement.lang)}`,note:t('compact_server_reported'),ts:m.resetAt,green:true});
      }
      items.sort((a,b)=>a.ts-b.ts);
      if(!items.length){const e=document.createElement('div');e.className='reset-empty';e.textContent=t('no_resets');host.append(e);return;}
      for(const x of items.slice(0,4)){
        const row=document.createElement('div');row.className='reset-item';
        row.innerHTML=`<span class="reset-dot${x.green?' green':''}"></span><div><span class="reset-name">${x.name}</span><span class="reset-note">${x.note}</span></div><span class="reset-time">${fmtShortDate(x.ts)}</span>`;
        const block=document.createElement('div');block.className='reset-countdown-block';const countdown=document.createElement('div');countdown.className='reset-countdown';countdown.dataset.resetAt=x.ts;block.append(row,countdown);host.append(block);
      }
    },
    renderTrend(all){
      const canvas=this.canvas,wrap=canvas.parentElement,empty=document.getElementById('overviewTrendEmpty');
      this.lastTrendData=all;
      const days=[];for(let i=13;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);days.push({d,count:C.entry(all[localKey(d)]).count});}
      const has=days.some(x=>x.count>0);empty.hidden=has;
      const rect=wrap.getBoundingClientRect(),w=Math.max(1,Math.floor(rect.width)),h=Math.max(160,Math.floor(rect.height)),dpr=Math.min(2,window.devicePixelRatio||1);
      canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;
      const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const pad={l:12,r:10,t:12,b:26},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b,max=Math.max(1,...days.map(x=>x.count));
      const light=!document.body.classList.contains('dark');
      ctx.strokeStyle=light?'rgba(64,86,110,.085)':'rgba(255,255,255,.055)';ctx.lineWidth=1;
      for(let i=0;i<4;i++){const y=pad.t+ch*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();}
      const pts=days.map((x,i)=>({x:pad.l+cw*i/(days.length-1),y:pad.t+ch-(x.count/max)*ch,v:x.count,d:x.d}));
      if(has){
        const grad=ctx.createLinearGradient(0,pad.t,0,pad.t+ch);grad.addColorStop(0,light?'rgba(166,79,106,.13)':'rgba(245,181,194,.28)');grad.addColorStop(1,light?'rgba(166,79,106,0)':'rgba(245,181,194,0)');
        ctx.beginPath();ctx.moveTo(pts[0].x,pad.t+ch);for(const p of pts)ctx.lineTo(p.x,p.y);ctx.lineTo(pts.at(-1).x,pad.t+ch);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
        ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=light?'#d73c7d':'#f3a9bc';ctx.lineWidth=2;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
        for(const p of pts){ctx.beginPath();ctx.arc(p.x,p.y,2.3,0,Math.PI*2);ctx.fillStyle=light?'#ec6ca3':'#f6c0cb';ctx.fill();}
      }else{ctx.beginPath();ctx.moveTo(pad.l,pad.t+ch);ctx.lineTo(w-pad.r,pad.t+ch);ctx.strokeStyle=light?'rgba(166,79,106,.16)':'rgba(245,181,194,.12)';ctx.stroke();}
      ctx.font='11px system-ui';ctx.fillStyle=light?'rgba(75,93,113,.90)':'rgba(170,164,168,.7)';ctx.textAlign='center';
      (w<400?[0,6,13]:[0,3,6,9,13]).forEach(i=>{ctx.textAlign=i===0?'left':i===13?'right':'center';ctx.fillText(days[i].d.toLocaleDateString(document.documentElement.lang,{month:'short',day:'numeric'}),pts[i].x,h-7);});
      this.points=pts;
    }
  };

  function switchTab(name,{focus=false}={}){
    if(!names.includes(name))name='overview';
    if(current==='overview'&&name!=='overview')overview.deactivate();
    if(name!=='usage')usage.deactivate();
    current=name;
    document.querySelector('.view-tabs').dataset.active=name;
    for(const n of names){
      const btn=document.getElementById('tab-'+n),panel=document.getElementById(n+'View');
      btn.setAttribute('aria-selected',String(n===name));btn.tabIndex=n===name?0:-1;panel.hidden=n!==name;
    }
    if(name==='usage'){
      void usage.activate();
      if(timeDistributionState.animationFrameId){cancelAnimationFrame(timeDistributionState.animationFrameId);timeDistributionState.animationFrameId=null;}
    }else if(name==='activity')requestAnimationFrame(redrawActivity);
    else void overview.activate();
    history.replaceState(null,'',`#${name}`);
    if(focus)document.getElementById('tab-'+name).focus();
  }

  for(const n of names)document.getElementById('tab-'+n).addEventListener('click',()=>switchTab(n));
  document.querySelector('.view-tabs').addEventListener('keydown',e=>{
    if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
    e.preventDefault();let next;
    if(e.key==='Home')next=names[0];else if(e.key==='End')next=names.at(-1);else{const i=names.indexOf(current),step=e.key==='ArrowRight'?1:-1;next=names[(i+step+names.length)%names.length];}
    switchTab(next,{focus:true});
  });
  document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.jump)));

  const th=document.getElementById('themeToggle');th.setAttribute('aria-label',t('label_appearance'));th.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();th.click();}});
  const lang=document.getElementById('languageToggle');lang.tabIndex=0;lang.setAttribute('role','button');lang.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();lang.click();}});

  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='sync'&&changes.gptTrackerLang&&GPTTrackerI18n.currentLang!==changes.gptTrackerLang.newValue){void GPTTrackerI18n.initI18n(changes.gptTrackerLang.newValue).then(refreshI18nAndCharts);}
    if(area!=='local')return;
    clearTimeout(storageTimer);storageTimer=setTimeout(async()=>{
      if(Object.keys(changes).some(k=>C.dateFromKey(k))){allData=await getStorageData();if(current==='activity')redrawActivity();}
      if(current==='overview')await overview.load();
    },160);
  });
  window.addEventListener('storage',e=>{if(e.key==='gptTrackerTheme')applyTheme(e.newValue);});
  document.addEventListener('gpt-theme-changed',()=>{if(current==='overview'&&overview.lastTrendData)overview.renderTrend(overview.lastTrendData);});
  document.addEventListener('gpt-language-changed',()=>{th.setAttribute('aria-label',t('label_appearance'));if(current==='overview')void overview.load();});
  setInterval(()=>{if(!document.hidden&&current==='overview')void overview.load();},30000);
  window.addEventListener('resize',()=>{
    clearTimeout(overviewResizeTimer);overviewResizeTimer=setTimeout(()=>{if(current==='activity')redrawActivity();else if(current==='overview')void overview.load();},160);
  });
  document.addEventListener('gpt-heatmap-ready',()=>{
    const requested=location.hash.replace('#','');switchTab(names.includes(requested)?requested:'overview');
  });
});
