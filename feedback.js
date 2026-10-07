/* Shared accessible feedback without interrupting keyboard interaction. */
(()=>{
  const t=k=>window.GPTTrackerI18n?.t(k)||k;
  let timer,notice=null;
  function layoutNotice(){
    const n=document.getElementById('actionStatus'),art=document.getElementById('artboard');
    if(!art||!n?.classList.contains('popup-notice'))return;
    art.querySelector('.membership')?.classList.toggle('has-inline-notice',!n.hidden);
  }
  function clear(){
    const n=document.getElementById('actionStatus');if(!n)return;
    const focused=n.contains(document.activeElement);n.hidden=true;notice=null;clearTimeout(timer);layoutNotice();
    if(focused)document.getElementById('planTrust')?.focus();
  }
  function clearRefreshNotice(updatedAt){const n=document.getElementById('actionStatus');if((notice?.refresh||n?.dataset.refresh==='true')&&(updatedAt===undefined||updatedAt>=(notice?.at||Number(n?.dataset.noticeAt))))clear();}
  async function openChatGPT(){
    try{
      const tabs=await chrome.tabs.query({url:['https://chatgpt.com/*']});
      tabs.sort((a,b)=>Number(b.active)-Number(a.active)||(b.lastAccessed||0)-(a.lastAccessed||0));
      if(tabs[0]){await chrome.tabs.update(tabs[0].id,{active:true});if(chrome.windows?.update)await chrome.windows.update(tabs[0].windowId,{focused:true});}
      else await chrome.tabs.create({url:'https://chatgpt.com/'});
    }catch{await chrome.tabs.create({url:'https://chatgpt.com/'});}
  }
  function busy(value){const b=document.getElementById('noticeRetry');if(b){b.disabled=value;b.setAttribute('aria-busy',String(value));b.textContent=t(value?'notice_retrying':notice?.action==='open'?'refresh_open_chatgpt':'notice_retry');}}
  function renderNotice(){
    if(!notice)return;
    const n=document.getElementById('actionStatus');
    n.querySelector('.notice-title').textContent=t(notice.error?'notice_error_title':'notice_title');
    n.querySelector('.notice-message').textContent=notice.key?t(notice.key):notice.text;
    n.querySelector('.notice-close').setAttribute('aria-label',t('notice_close'));
    const retry=n.querySelector('#noticeRetry');retry.hidden=!notice.refresh;if(!retry.disabled)retry.textContent=t(notice.action==='open'?'refresh_open_chatgpt':'notice_retry');
    n.dataset.error=String(notice.error);layoutNotice();
  }
  document.addEventListener('gpt-language-changed',renderNotice);
  function status(text,error=false,options={}){
    const art=document.getElementById('artboard');
    if(art){
      let n=document.getElementById('actionStatus');
      if(!n){
        n=document.createElement('section');n.id='actionStatus';n.className='action-status popup-notice';n.setAttribute('role','status');n.setAttribute('aria-live','polite');
        n.innerHTML='<div class="notice-heading"><span class="notice-symbol" aria-hidden="true">i</span><strong class="notice-title"></strong><button type="button" class="notice-close">Ã—</button></div><p class="notice-message"></p><div class="notice-actions"><button type="button" id="noticeRetry"></button></div>';
        art.querySelector('.membership').append(n);
        n.querySelector('.notice-close').addEventListener('click',clear);
        n.querySelector('#noticeRetry').addEventListener('click',()=>notice?.action==='open'?void openChatGPT():document.dispatchEvent(new CustomEvent('gpt-notice-retry')));
      }
      notice={text,error,...options};n.hidden=false;clearTimeout(timer);renderNotice();
      if(!options.refresh)timer=setTimeout(clear,error?12000:5000);
      return;
    }
    let n=document.getElementById('actionStatus');if(!n){n=document.createElement('div');n.id='actionStatus';n.className='action-status';n.setAttribute('role','status');n.setAttribute('aria-live','polite');document.body.append(n);}
    n.textContent=text;n.dataset.error=String(error);n.dataset.refresh=String(!!options.refresh);n.dataset.noticeAt=String(options.at||Date.now());n.hidden=false;clearTimeout(timer);
    if(options.action==='open'){const b=document.createElement('button');b.type='button';b.className='notice-open';b.textContent=t('refresh_open_chatgpt');b.addEventListener('click',()=>void openChatGPT());n.append(b);}else timer=setTimeout(()=>n.hidden=true,error?12000:5000);
  }
  async function run(button,action,errorKey='action_failed'){
    if(button.disabled)return;button.disabled=true;button.setAttribute('aria-busy','true');
    try{await action();button.dataset.result='success';}catch{status(t(errorKey),true);button.dataset.result='error';}
    finally{button.disabled=false;button.removeAttribute('aria-busy');setTimeout(()=>delete button.dataset.result,1800);}
  }
  function refreshStatus(r){
    if(r.current){clearRefreshNotice();status(t('refresh_current'));return;}
    const keys={401:'refresh_login',403:'refresh_verify',429:'refresh_limited',timeout:'refresh_timeout','network-error':'refresh_network','invalid-response':'refresh_invalid',backoff:'refresh_backoff',hidden:'refresh_hidden','no-responsive-tab':'u_no_tab','page-not-ready':'u_reload'};
    const reason=r.status==='backoff'&&[401,403].includes(r.cause)?r.cause:r.status;
    const key=keys[reason]||'refresh_failed',action=[401,403].includes(reason)?'open':null;
    status(t(key),!['backoff','hidden'].includes(r.status),{key,refresh:true,action,at:Date.now()});
  }
  function savedUsage(live,kind){
    if(!live||!['error','cached','stale'].includes(kind))return '';
    const label=t(kind==='error'?'saved_usage_error':kind==='stale'?'saved_usage_stale':'saved_usage_cached');
    const date=Number.isFinite(live.updatedAt)?new Date(live.updatedAt).toLocaleString(document.documentElement.lang||undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
    return label+(date?'\n'+t('saved_usage_updated').replace('{date}',date):'');
  }
  window.GPTFeedback={status,run,refreshStatus,savedUsage,clearRefreshNotice,busy};
})();
