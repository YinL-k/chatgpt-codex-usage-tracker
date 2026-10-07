/* Shared settings, predictive readout and minute-precision countdowns. */
(()=>{
  'use strict';
  const C=SakuraResetPolicy.CONFIG,$=id=>document.getElementById(id),t=k=>GPTTrackerI18n.t(k);
  let prefs={mode:'standard',enabled:true},state=null,settings=null,prediction=null;
  async function load(){const d=await chrome.storage.local.get([C.key,C.prefsKey]);prefs={mode:'standard',enabled:true,...d[C.prefsKey]};state=d[C.key];render();}
  function render(){
    const p=state?.snapshot,valid=p&&!state.error&&Date.now()-p.at<=C.staleMs;
    for(const h of [6,24]){const n=$('codexReset'+h),bar=$('codexResetBar'+h);if(n)n.textContent=valid?Math.round(p['h'+h]*100)+'%':'—';if(bar)bar.style.width=(valid?p['h'+h]*100:0)+'%';}
    const status=$('codexResetForecastStatus');if(status){status.replaceChildren();const a=document.createElement('a');a.href='https://codex.lunarwerx.com/';a.target='_blank';a.rel='noopener';a.textContent='LunarWerx';a.addEventListener('click',e=>e.stopPropagation());status.append(a,document.createTextNode(' · '+t(valid?'rn_'+(state.level||'normal'):'rn_unavailable')));}
    if(prediction){prediction.querySelector('h3').textContent=t('rn_title');prediction.querySelector('.rn-prediction-values').textContent=valid?`6h ${Math.round(p.h6*100)}% · 24h ${Math.round(p.h24*100)}%`:'—';prediction.querySelector('.rn-prediction-state').textContent=t(valid?'rn_'+(state.level||'normal'):'rn_unavailable')+' · '+t(prefs.mode==='low'?'rn_low':'rn_standard');prediction.querySelector('.rn-prediction-note').textContent=t('rn_note');}
    if(settings){
      settings.querySelector('h3').textContent=t('rn_title');settings.querySelector('.rn-note').textContent=t('rn_note');
      settings.querySelector('[data-enabled-label]').textContent=t('rn_enable');settings.querySelector('input').checked=prefs.enabled!==false;
      for(const b of settings.querySelectorAll('[data-mode]')){const mode=b.dataset.mode,th=C.modes[mode];b.textContent=t(mode==='low'?'rn_low':'rn_standard')+` · 24h ≥${th.h24*100}% / 6h ≥${th.h6*100}%`;b.setAttribute('aria-pressed',String(mode===prefs.mode));}
    }
    for(const el of document.querySelectorAll('.reset-countdown')){
      const ts=Number(el.dataset.resetAt),minutes=Math.max(0,Math.ceil((ts-Date.now())/60000));
      el.textContent=!Number.isFinite(ts)?'—':minutes===0?t('rn_waiting'):`${Math.floor(minutes/1440)}${t('rn_days')} ${Math.floor(minutes%1440/60)}${t('rn_hours')} ${minutes%60}${t('rn_minutes')}`;
    }
  }
  async function save(){const result=await chrome.runtime.sendMessage({type:'RN_PREFS',...prefs}).catch(()=>null);if(!result?.ok){await load();if(settings)settings.querySelector('.rn-save-status').textContent=t('action_failed');}}
  function mount(){
    if($('resetForecast')&&!prediction){prediction=document.createElement('section');prediction.className='rn-settings rn-prediction';prediction.innerHTML='<h3></h3><div class="rn-prediction-values"></div><p class="rn-prediction-state"></p><p class="rn-prediction-note rn-note"></p><a href="https://codex.lunarwerx.com/" target="_blank" rel="noopener">LunarWerx ↗</a>';$('resetForecast').before(prediction);}
    const host=document.querySelector('.advanced-body');if(host&&!settings){
      settings=document.createElement('section');settings.className='rn-settings';
      settings.innerHTML='<h3></h3><label><input type="checkbox"><span data-enabled-label></span></label><div class="rn-modes"><button type="button" data-mode="standard"></button><button type="button" data-mode="low"></button></div><p class="rn-note"></p><p class="rn-save-status" role="status"></p>';
      host.prepend(settings);
      settings.querySelector('input').addEventListener('change',e=>{prefs.enabled=e.target.checked;void save();});
      settings.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{prefs.mode=b.dataset.mode;render();void save();}));
    }
    render();
  }
  let tooltip=null;
  function hide(){tooltip?.remove();tooltip=null;}
  function show(el,x,y){hide();if(!el.dataset.cacheTip)return;tooltip=document.createElement('div');tooltip.className='cache-tooltip';tooltip.id='cache-tooltip';tooltip.setAttribute('role','tooltip');tooltip.textContent=el.dataset.cacheTip;document.body.append(tooltip);tooltip.style.left=Math.max(8,Math.min(x+12,innerWidth-tooltip.offsetWidth-8))+'px';tooltip.style.top=Math.max(8,Math.min(y+14,innerHeight-tooltip.offsetHeight-8))+'px';}
  document.addEventListener('pointerover',e=>{const el=e.target.closest('[data-cache-tip]');if(el)show(el,e.clientX,e.clientY);});
  document.addEventListener('pointerout',e=>{if(e.target.closest('[data-cache-tip]'))hide();});
  document.addEventListener('focusin',e=>{const el=e.target.closest('[data-cache-tip]');if(el){const r=el.getBoundingClientRect();show(el,r.left,r.bottom);}});
  document.addEventListener('focusout',hide);document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
  document.addEventListener('gpt-language-changed',mount);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes[C.key]||changes[C.prefsKey]))void load();});
  const observer=new MutationObserver(()=>{mount();});
  const root=$('usagePanel');if(root)observer.observe(root,{childList:true});
  const resets=$('overviewResets');if(resets)new MutationObserver(render).observe(resets,{childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  void load();setInterval(render,60000);
})();
