/* Usage detail dashboard: current cycles, local history, live Codex windows and controls. */
(()=>{
  'use strict';
  const C=GPTUsageCore,SCOPE=C.LOCAL_SCOPE;
  const t=(k,f)=>window.GPTTrackerI18n?.t(k,f)||f||k;
  const send=m=>chrome.runtime.sendMessage(m).catch(()=>({ok:false,error:'extension_reloaded'}));
  const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
  const fmt=n=>Number.isFinite(n)?new Intl.NumberFormat().format(n):'—';
  const date=n=>Number.isFinite(n)?new Date(n).toLocaleString(document.documentElement.lang,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
  function ruleName(r){if(r.allowancePending)return 'Pro';if(r.mode==='official'&&r.label)return r.label;return r.id==='astra_week'?'GPT-6 Pro':r.id==='sol_day'?'GPT-5.6 Sol Pro':r.id==='combined_day'?t('u_combined','Combined daily'):t('u_shared','Shared allowance');}
  function ruleRef(r){if(r.allowancePending)return t('pro_allowance_pending');if(r.mode==='official'){if(Number.isFinite(r.cap)&&Number.isFinite(r.windowSeconds))return `${fmt(r.cap)} / ${C.windowLabel(r.windowSeconds,document.documentElement.lang)}`;if(Number.isFinite(r.windowSeconds))return C.windowLabel(r.windowSeconds,document.documentElement.lang);if(Number.isFinite(r.cap))return `${fmt(r.cap)} ${t('u_reference','reference')}`;return t('compact_server_reported','Reported by ChatGPT');}return `${r.cap} / ${t('u_'+r.period,r.period)}`;}
  function localDateTime(ts){const d=new Date(ts);return `${C.localDate(ts)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}

  function mount(root){
    root.classList.add('usage-panel');
    root.innerHTML=`
      <div class="usage-shell usage-detail-shell">
        <div class="usage-context-strip">
          <div class="usage-context-left"><span class="usage-context-mark" aria-hidden="true"></span><div><div class="usage-context-plan" id="selectedPlan"></div><div class="usage-context-meta" id="planMeta"></div></div></div>
          <div class="usage-context-actions"><span id="planTrust" class="trust-badge unavailable"></span><button id="refreshLive" class="refresh-button" type="button"><svg class="refresh-svg" viewBox="0 0 20 20" aria-hidden="true"><path d="M15.8 7.1A6.3 6.3 0 1 0 16 12"/><path d="M12.6 3.8h3.7v3.7"/></svg><span data-i18n="refresh_action">Refresh</span></button></div>
        </div>

        <section class="usage-detail-section pro-detail">
          <div class="usage-detail-heading"><div><h2 data-i18n="pro_usage">Pro usage</h2><p data-i18n="pro_note">Current allowance cycles plus the Pro sends this browser has actually observed.</p></div><span id="proTrust" class="trust-badge tracking"></span></div>
          <div class="usage-detail-grid">
            <div id="proMeters" class="cycle-list"></div>
            <aside class="usage-history-card"><div class="usage-history-title" data-i18n="recent_pro">Recent Pro activity</div><div class="usage-history-sub" data-i18n="recent_pro_note">Observed locally during the last 7 days.</div><div id="proHistoryBars" class="mini-bars"></div><div class="history-total"><span data-i18n="observed_total">7-day observed total</span><strong id="proHistoryTotal">0</strong></div></aside>
          </div>
        </section>

        <section class="usage-detail-section codex-detail">
          <div class="usage-detail-heading"><div><h2 data-i18n="codex_windows">Codex windows</h2><p data-i18n="codex_note">Server-reported usage windows, with their independent reset times.</p></div><span id="codexTrust" class="trust-badge unavailable"></span></div>
          <div id="codexMeters" class="codex-window-grid"></div>
          <div id="creditsRow" class="credits-row" hidden><span data-i18n="u_credit">Reported credits</span><strong id="creditsValue">—</strong></div>
        </section>

        <details class="advanced-panel"><summary><span data-i18n="u_advanced">Advanced</span><span class="advanced-chevron" aria-hidden="true"></span></summary><div class="advanced-body">
          <details id="calibrateDetails" class="usage-details release-calibration"><summary data-i18n="u_correct_pro">Correct detected data</summary><div>
            <span class="sync-copy" data-i18n="u_correct_pro_note">Only use this if the automatic reading is wrong.</span><p id="calDisabled"></p>
            <form id="calibrationForm"><div class="calibration-grid"><label class="full-row"><span data-i18n="u_sync_rule"></span><select id="calRule" required></select></label><label><span data-i18n="u_sync_remaining"></span><input id="calRemaining" type="number" min="0" step="1" required inputmode="numeric"></label><label><span data-i18n="u_sync_reset"></span><input id="calReset" type="datetime-local" required></label></div>
            <div class="form-actions"><button id="calSave" type="submit" class="usage-button primary small" data-i18n="u_sync_save"></button><button id="calClear" type="button" class="usage-button small" data-i18n="u_sync_clear"></button></div><p id="calStatus" role="status" class="usage-status"></p></form>
          </div></details>
          <details class="usage-details"><summary data-i18n="u_plan_override">Plan override</summary><div><p class="usage-footnote" data-i18n="u_plan_override_note">Normally this is detected automatically. Only override it if the detected plan is wrong.</p><label><span data-i18n="release_choose_plan_label">Your plan</span><select id="membership"></select></label></div></details>
          <details class="usage-details"><summary data-i18n="u_recent">Recent local models</summary><div><div id="recentModels"></div><p id="coverage" class="usage-footnote"></p><p class="usage-footnote" data-i18n="release_no_text">Only timestamps and model labels are stored; chat text is not stored.</p></div></details>
          <details class="usage-details"><summary data-i18n="u_compare">Plan reference</summary><div><table class="usage-table"><thead><tr><th data-i18n="u_plan"></th><th data-i18n="u_allowance"></th></tr></thead><tbody id="planTable"></tbody></table><p class="usage-footnote"><span data-i18n="u_verified"></span>: ${C.VERIFIED} · <a href="${C.SOURCE}" target="_blank" rel="noopener noreferrer" data-i18n="u_source"></a></p></div></details>
        </div></details>
        <div class="usage-privacy" data-i18n="u_privacy">No chat text, passwords or tokens stored. No developer server.</div>
      </div>`;

    const $=id=>root.querySelector('#'+id);
    let s=C.freshState(),live=null,liveError=null,proUsage=null,proCycles=null,active=false,formKey='',refreshTimer=null;
    function manualPlan(){const p=C.obj(s.settings[SCOPE]).plan||'auto';return p==='auto'?'':p;}
    function selectedPlan(){return manualPlan()||live?.plan||'';}
    function setTrust(el,kind,label){el.className=`trust-badge ${kind}`;el.textContent=label;}
    function freshLabel(kind){if(kind==='error')return t('trust_error');return kind==='live'?t('trust_live','Live'):kind==='cached'?t('trust_cached','Cached'):kind==='stale'?t('trust_stale','Stale'):t('trust_unavailable','Unavailable');}
    function empty(parent,text){const e=node('div','usage-empty',text);e.style.minHeight='108px';e.style.display='grid';e.style.placeItems='center';parent.append(e);}
    function fillCalibration(){const key=selectedPlan(),rule=C.plans[key]?.rules?.find(r=>r.id===$('calRule').value),b=C.obj(C.obj(C.obj(s.settings[SCOPE]).baselines)[rule?.id]);$('calRemaining').max=String(rule?.cap||0);$('calRemaining').value=b.plan===key&&Number.isFinite(b.used)?rule.cap-b.used:'';$('calReset').value=Number.isFinite(b.resetAt)?localDateTime(b.resetAt):'';$('calStatus').textContent='';window.GPTControls?.sync();}

    function proCard(r){
      const c=node('article','cycle-card');
      const head=node('div','cycle-card-head');head.append(node('span','cycle-card-title',ruleName(r)),node('span','cycle-card-ref',ruleRef(r)));c.append(head);
      const value=node('div','cycle-value');
      const hasRemaining=Number.isFinite(r.remaining),hasPct=Number.isFinite(r.remainingPercent),hasCap=Number.isFinite(r.cap)&&r.cap>0;
      if(hasRemaining){const prefix=r.mode==='official'?'':'≈ ';value.append(node('strong','',`${prefix}${fmt(r.remaining)}`),node('span','',hasCap?`/ ${fmt(r.cap)} ${t('popup_left','left')}`:t('popup_left','left')));}
      else if(hasPct){value.append(node('strong','',`${fmt(r.remainingPercent)}%`),node('span','',t('u_remaining','remaining')));}
      else{value.append(node('strong','',fmt(r.observed||0)),node('span','',t('u_seen','used locally')));}
      c.append(value);
      const pct=hasPct?r.remainingPercent:hasRemaining&&hasCap?100*r.remaining/r.cap:null;
      if(Number.isFinite(pct)){const p=node('div','cycle-progress'),f=node('span');f.style.width=`${Math.max(0,Math.min(100,pct))}%`;p.setAttribute('role','progressbar');p.setAttribute('aria-label',t('u_remaining'));p.setAttribute('aria-valuemin','0');p.setAttribute('aria-valuemax','100');p.setAttribute('aria-valuenow',String(parseFloat(f.style.width)));p.append(f);c.append(p);}
      const meta=node('div','cycle-meta');let left='';
      if(r.mode==='official')left=t('pro_reported','Reported by ChatGPT');
      else if(r.mode==='learned')left=t('pro_learned','Estimated from learned reset cycle + local sends.');
      else if(r.mode==='manual')left=t('pro_corrected','Corrected manually in Advanced.');
      else if(r.allowancePending)left=t('pro_observed_pending');
      else left=t('pro_observed_learning','Confirmed local Pro sends only · learning reset cycle automatically.');
      let right='';
      if(Number.isFinite(r.resetAt))right=`${t('compact_resets','Resets')} ${date(r.resetAt)}`;
      else if(r.mode==='official')right=t('reset_unknown','Reset not reported');
      else if(r.allowancePending)right=t('pro_allowance_pending');
      else if(r.mode==='observed')right=t('pro_learning_cycle','Learning reset cycle');
      else right=ruleRef(r);
      meta.append(node('span','',left),node('span','',right));c.append(meta);return c;
    }

    function codexCard(m){
      const c=node('article','window-card');
      const label=m.id.startsWith('review:')?t('code_review','Code review'):m.label;
      const title=`${label} · ${C.windowLabel(m.windowSeconds,document.documentElement.lang)}`;
      const h=node('div','window-card-head');h.append(node('span','window-card-title',title),node('span','window-card-ref',Number.isFinite(m.windowSeconds)?`${C.windowLabel(m.windowSeconds,document.documentElement.lang)} ${t('window')}`:t('compact_server_reported','Reported by ChatGPT')));c.append(h);
      const pct=Number.isFinite(m.remainingPercent)?m.remainingPercent:null;
      const v=node('div','window-value');v.append(node('strong','',pct!==null?`${fmt(pct)}%`:m.remaining!==null?fmt(m.remaining):'—'),node('span','',pct!==null?t('u_remaining'):''));c.append(v);
      if(pct!==null){const p=node('div','window-progress'),f=node('span');f.style.width=`${Math.max(0,Math.min(100,pct))}%`;p.setAttribute('role','progressbar');p.setAttribute('aria-label',t('u_remaining'));p.setAttribute('aria-valuemin','0');p.setAttribute('aria-valuemax','100');p.setAttribute('aria-valuenow',String(parseFloat(f.style.width)));p.append(f);c.append(p);}
      const meta=node('div','window-meta');meta.append(node('span','',t('compact_server_reported','Reported by ChatGPT')),node('span','',m.resetAt?`${t('compact_resets')} ${date(m.resetAt)}`:t('reset_unknown')));c.append(meta);
      return c;
    }

    function renderHistory(){
      const host=$('proHistoryBars');host.replaceChildren();const days=[];let total=0,max=1;
      for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);const key=C.localDate(d);const count=s.events.filter(e=>e.scope===SCOPE&&C.localDate(e.ts)===key&&e.kind.endsWith('_pro')).length;days.push({d,count});total+=count;max=Math.max(max,count);}
      for(const x of days){const col=node('div','mini-bar-col'),val=node('span','mini-bar-value',String(x.count)),bar=node('span','mini-bar'),lab=node('span','mini-bar-label',x.d.toLocaleDateString(document.documentElement.lang||undefined,{weekday:'short'}).slice(0,2));bar.style.height=`${Math.max(2,Math.round(72*x.count/max))}px`;bar.style.opacity=x.count?'.88':'.18';col.append(val,bar,lab);host.append(col);}
      $('proHistoryTotal').textContent=fmt(total);
    }

    function render(){
      GPTTrackerI18n.applyI18n(root);
      const key=selectedPlan(),preset=C.plans[key],fresh=C.liveStatus(live,liveError);
      const noPro=!!preset&&Array.isArray(preset.rules)&&preset.rules.length===0;
      root.classList.toggle('no-pro-plan',noPro);
      const proDetail=root.querySelector('.pro-detail');
      if(proDetail)proDetail.hidden=noPro;
      const calibrateDetails=$('calibrateDetails');
      if(calibrateDetails)calibrateDetails.hidden=noPro;
      if(fresh.kind==='live')GPTFeedback.clearRefreshNotice(live?.updatedAt);
      $('selectedPlan').textContent=preset?.label||t('u_unknown','Not identified yet');
      if(manualPlan()){$('planMeta').textContent=t('u_manual','Manual preset · does not change your subscription');setTrust($('planTrust'),'tracking',t('compact_local','Local'));}
      else if(live?.plan){$('planMeta').textContent=`${t('u_detected','Detected automatically')} · ${t('u_session_source','ChatGPT session')} · ${live.updatedAt?date(live.updatedAt):''}`;setTrust($('planTrust'),fresh.kind,freshLabel(fresh.kind));}
      else{$('planMeta').textContent=t('u_scope_missing','Membership not identified yet. Open a signed-in ChatGPT tab and refresh.');setTrust($('planTrust'),'unavailable',t('trust_unavailable','Unavailable'));}
      let note=$('usageCacheNote');
      if(!note){note=node('p','usage-cache-note');note.id='usageCacheNote';note.setAttribute('role','status');root.querySelector('.usage-context-strip').after(note);}
      note.textContent=GPTFeedback.savedUsage(live,fresh.kind);note.hidden=!note.textContent;
      $('refreshLive').hidden=false;
      $('refreshLive').title=liveError?t('error_cached'):t('refresh_action');

      $('proMeters').replaceChildren();
      if(!noPro){
        const proRules=C.proAllowances(s,SCOPE,key,proUsage,proCycles);
        if(proRules.length){for(const r of proRules)$('proMeters').append(proCard(r));const primary=C.proPrimary(proRules);if(primary?.mode==='official'){const pf=C.freshness(proUsage?.updatedAt,Date.now(),5*60*1000,60*60*1000);setTrust($('proTrust'),pf.kind,pf.kind==='live'?t('trust_live','Live'):pf.kind==='cached'?t('trust_cached','Cached'):t('compact_server_reported','Reported'));}else if(primary?.mode==='learned'||primary?.mode==='manual')setTrust($('proTrust'),'estimated',t('trust_estimated','Estimated'));else setTrust($('proTrust'),'tracking',t('trust_tracking','Tracking'));}
        else if(!preset){empty($('proMeters'),t('u_pick_plan','Open ChatGPT for automatic plan detection.'));setTrust($('proTrust'),'unavailable',t('trust_unavailable','Unavailable'));}
        else if(preset.rules===null){empty($('proMeters'),t('release_managed','No Pro allowance metadata observed yet. Local Pro sends will still be recorded automatically.'));setTrust($('proTrust'),'tracking',t('trust_tracking','Tracking'));}
        renderHistory();
      }else{
        $('proHistoryBars').replaceChildren();
        $('proHistoryTotal').textContent='0';
      }

      $('codexMeters').replaceChildren();$('creditsRow').hidden=true;
      const meters=(live?.meters||[]).slice(0,24);
      if(!meters.length){empty($('codexMeters'),t('u_no_wham','No server usage available yet. Refresh from a signed-in ChatGPT tab.'));setTrust($('codexTrust'),liveError?'error':'unavailable',freshLabel(liveError?'error':'unavailable'));}
      else{for(const m of meters)$('codexMeters').append(codexCard(m));if(live.credits){$('creditsRow').hidden=false;$('creditsValue').textContent=live.credits.unlimited?t('unlimited','Unlimited'):fmt(live.credits.balance);}setTrust($('codexTrust'),fresh.kind,freshLabel(fresh.kind));}

      $('membership').replaceChildren(new Option(t('u_use_detected','Use detected plan'),'auto'));for(const [id,p] of Object.entries(C.plans)){if(id==='business_unknown')continue;$('membership').append(new Option(p.label,id));}$('membership').value=manualPlan()||'auto';
      const sig=`${key}:${window.GPTTrackerI18n?.currentLang}`;if(sig!==formKey){formKey=sig;$('calRule').replaceChildren();for(const r of preset?.rules||[])$('calRule').append(new Option(`${ruleName(r)} · ${ruleRef(r)}`,r.id));fillCalibration();}
      const disabled=!preset?.rules?.length;for(const el of $('calibrationForm').elements)el.disabled=disabled;$('calDisabled').textContent=disabled?(preset?.allowancePending?t('pro_allowance_pending'):t('u_cal_disabled','Choose a plan with a Pro allowance first.')):'';
      $('recentModels').replaceChildren();const groups=new Map();for(const e of s.events.filter(e=>e.scope===SCOPE)){const k=e.model||t('u_unknown','Unknown');groups.set(k,(groups.get(k)||0)+1);}if(!groups.size)empty($('recentModels'),t('u_model_empty','No local model records yet.'));else{const table=node('table','usage-table');for(const [m,n]of [...groups].sort((a,b)=>b[1]-a[1]).slice(0,12)){const row=node('tr');row.append(node('td','',m),node('td','',fmt(n)));table.append(row);}$('recentModels').append(table);}$('coverage').textContent=`${t('u_coverage','Tracking since')}: ${date(s.coverageStart)}`;
      $('planTable').replaceChildren();for(const [id,p]of Object.entries(C.plans)){if(id==='business_unknown')continue;const r=node('tr');r.append(node('td','',p.label),node('td','',p.allowancePending?t('pro_account_limits'):p.rules===null?t('u_managed','Managed'):p.rules.length?p.rules.map(v=>`${ruleName(v)} ${ruleRef(v)}`).join('; '):t('u_none','No Pro preset')));$('planTable').append(r);}
    }

    async function load(){const r=await send({type:'UG_STATE'});if(r.ok){s=C.state(r.state);live=r.liveUsage||null;liveError=r.liveError||null;proUsage=r.proUsage||null;proCycles=r.proCycles||null;}else GPTFeedback.status(t('state_error'),true);render();GPTTrackerI18n.applyI18n(root);}
    async function refresh(){const b=$('refreshLive');if(b.disabled)return;b.hidden=false;b.disabled=true;b.classList.add('is-refreshing');b.querySelector('span').textContent=t('refresh_refreshing','Refreshing…');const r=await send({type:'UG_REFRESH_LIVE'});if(!r.refreshed)GPTFeedback.refreshStatus(r);else GPTFeedback.clearRefreshNotice();await load();b.disabled=false;b.classList.remove('is-refreshing');if(r.ok&&(r.refreshed||r.current)){b.classList.add('is-updated');b.querySelector('span').textContent=t('refresh_updated','Updated');}else{b.classList.add('is-retry');b.querySelector('span').textContent=t('refresh_retry','Retry');}clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{b.classList.remove('is-updated','is-retry');b.querySelector('span').textContent=t('refresh_action','Refresh');const f=C.freshness(live?.updatedAt);b.hidden=false;},1400);}

    $('refreshLive').addEventListener('click',()=>void refresh());
    $('membership').addEventListener('change',()=>GPTFeedback.run($('membership'),async()=>{const r=await send({type:'UG_PREFS',plan:$('membership').value});formKey='';await load();if(!r.ok)throw Error();GPTFeedback.status(t('saved'));}));
    $('calRule').addEventListener('change',fillCalibration);
    $('calibrationForm').addEventListener('submit',async ev=>{ev.preventDefault();const key=selectedPlan(),r=C.plans[key]?.rules?.find(v=>v.id===$('calRule').value),remaining=Number($('calRemaining').value),resetAt=new Date($('calReset').value).getTime();if(!r||$('calRemaining').value===''||!Number.isInteger(remaining)||remaining<0||remaining>r.cap||!Number.isFinite(resetAt)||resetAt<=Date.now()){$('calStatus').textContent=t('u_invalid','Check the values and reset time.');return;}$('calSave').disabled=true;$('calSave').setAttribute('aria-busy','true');const result=await send({type:'UG_BASELINE',plan:key,rule:r.id,used:r.cap-remaining,resetAt});await load();$('calSave').disabled=false;$('calSave').removeAttribute('aria-busy');$('calStatus').textContent=t(result.ok?'u_saved':'u_invalid',result.ok?'Saved':'Invalid');});
    $('calClear').addEventListener('click',()=>GPTFeedback.run($('calClear'),async()=>{const key=selectedPlan(),r=await send({type:'UG_BASELINE',plan:key,rule:$('calRule').value,clear:true});formKey='';await load();if(!r.ok)throw Error();$('calStatus').textContent=t('cleared');}));
    document.addEventListener('gpt-language-changed',()=>{if(active)render();});
    let timer;chrome.storage.onChanged.addListener((changes,area)=>{if(active&&area==='local'&&(changes[C.KEY]||changes.__gptLiveUsageV1||changes.__gptLiveUsageErrorV1||changes.__gptProUsageV1||changes.__gptProCycleV1)){clearTimeout(timer);timer=setTimeout(()=>void load(),100);}});
    setInterval(()=>{if(active&&!document.hidden)render();},30000);
    return {deactivate:()=>{active=false;},activate:async()=>{active=true;await load();if(!live||C.freshness(live.updatedAt).kind!=='live')void refresh();},reload:load,refresh};
  }
  window.GPTUsageUI={mount};
})();