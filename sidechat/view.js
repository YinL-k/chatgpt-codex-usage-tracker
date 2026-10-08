/* Local presentation only. Never edits stored ChatGPT messages or their source text. */
(() => {
  'use strict';
  const svg = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5H3v6h4V5Zm10 0h-4v6h4V5ZM7 11c0 3-2 4-4 4m14-4c0 3-2 4-4 4"/></svg>';
  function create({composer,translate,onClear,onDismiss,onRestore}) {
    let host=null,shadow=null,previewOpen=false, current=null, lastKey='',currentTheme='dark',dismissed=false;
    const folds=new WeakMap(),foldList=[];
    function mount() {
      if(!host) {
        host=document.createElement('div');host.dataset.sakuraSidechat='quote';
        host.style.cssText='margin:12px 14px 7px;max-width:100%;position:relative;z-index:2;';
        shadow=host.attachShadow({mode:'closed'});
        shadow.innerHTML=`<style>
        :host{--ink:#efbdd0;--bg:#292129;--line:rgba(228,158,190,.27);--muted:#bca6b6;font:11px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
        :host([data-theme=light]){--ink:#914c6b;--bg:#fbe8f0;--line:rgba(156,89,121,.27);--muted:#80576f}
        *{box-sizing:border-box}button{font:inherit;color:inherit;cursor:pointer;border:0;background:none}button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
        .row{display:inline-flex;align-items:center;max-width:100%;border:1px solid var(--line);border-radius:9px;background:var(--bg)}
        .chip{display:flex;align-items:center;gap:6px;padding:4px 8px;max-width:100%;min-height:26px;border-radius:8px;text-align:left}
        svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.7;flex:none}.label{white-space:nowrap;font-weight:500}
        .remove{width:25px;height:26px;padding:5px;border-left:1px solid var(--line);font-size:15px;line-height:1}
        button:hover{background:rgba(215,139,175,.09)}
        .preview{margin-top:5px;padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--bg);max-height:240px;overflow:auto;scrollbar-width:thin}
        .source{font-size:10px;color:var(--muted);word-break:break-all;margin-bottom:8px}.preview pre{margin:0;white-space:pre-wrap;word-break:break-word;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}
        .note{font-size:10px;color:var(--muted);margin:8px 0 0;padding-top:7px;border-top:1px solid var(--line)}[hidden]{display:none!important}

        /* Frosted reference surface; the text stays sharp above a quiet blur. */
        :host{--glass:rgba(35,28,34,.76);--edge:rgba(242,191,211,.26);--sheen:rgba(244,180,207,.11)}
        :host([data-theme=light]){--glass:rgba(255,245,249,.8);--edge:rgba(157,84,119,.22);--sheen:rgba(185,103,138,.07)}
        .row,.preview{position:relative;isolation:isolate;background:var(--glass);border-color:var(--edge);backdrop-filter:blur(22px) saturate(1.15);-webkit-backdrop-filter:blur(22px) saturate(1.15);box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 3px 12px rgba(0,0,0,.09)}
        .row::before,.preview::before{content:"";position:absolute;inset:0;border-radius:inherit;z-index:-1;pointer-events:none;background:linear-gradient(135deg,var(--sheen),transparent 65%)}
        .row{border-radius:999px;overflow:hidden}.chip{border-radius:999px 0 0 999px;padding:5px 10px}.remove{border-radius:0 999px 999px 0}.preview{border-radius:20px}
        .remove-page{opacity:0;width:25px;height:26px}.row:hover .remove-page,.row:focus-within .remove-page{opacity:1}
        @media(forced-colors:active){.row,.preview{background:Canvas;backdrop-filter:none}.row::before,.preview::before{display:none}}
        .restore{padding:4px 8px;color:var(--muted)}
</style><button class="restore" hidden></button><div class="row"><button class="chip" type="button">${svg}<span class="label"></span></button><button class="remove-page" type="button">×</button><button class="remove" type="button">\u00d7</button></div><div class="preview" hidden><div class="source"></div><pre></pre><p class="note"></p></div>`;
        shadow.querySelector('.remove-page').addEventListener('click',()=>{previewOpen=false;onDismiss(current);composer()?.focus();});
        shadow.querySelector('.restore').addEventListener('click',()=>onRestore());
        shadow.querySelector('.chip').addEventListener('click',()=>{previewOpen=!previewOpen;lastKey='';update(current,currentTheme,dismissed);});
        shadow.querySelector('.remove').addEventListener('click',()=>{if(current?.selection)onClear(current);previewOpen=false;composer()?.focus();});
      }
      const el=composer(),parent=el?.closest('[data-composer-body],form')||el?.parentElement?.parentElement;
      if(parent&&!parent.contains(host))parent.insertBefore(host,parent.firstChild);
      return !!el;
    }
    function update(item,theme='dark',paused=false) {
      dismissed=paused;current=item;currentTheme=theme;const hasEditor=mount();
      const key=JSON.stringify([item?.id,item?.page?.fingerprint,item?.selection?.id,item?.selection?.capturedAt,theme,paused,previewOpen,translate('shortPage'),hasEditor]);
      if(lastKey===key)return;lastKey=key;
      const page=SakuraSideCore.validPage(item?.page),selection=SakuraSideCore.validSelection(item?.selection);
      host.hidden=(!page&&!selection&&!paused)||!hasEditor;host.dataset.theme=theme;
      shadow.querySelector('.row').hidden=!page&&!selection;
      const restore=shadow.querySelector('.restore');restore.hidden=!paused;restore.textContent=translate('restorePage');
      const closePage=shadow.querySelector('.remove-page');closePage.hidden=!page;closePage.title=translate('removePage');closePage.setAttribute('aria-label',translate('removePage'));
      if(!page&&!selection){shadow.querySelector('.preview').hidden=true;shadow.querySelector('pre').textContent='';return;}
      shadow.querySelector('.label').textContent=(page?translate('shortPage'):'')+(page&&selection?' \u00b7 ':'')+(selection?translate('shortSelection'):'');
      const chip=shadow.querySelector('.chip');chip.title=translate('preview');chip.setAttribute('aria-expanded',String(previewOpen));
      const remove=shadow.querySelector('.remove');remove.hidden=!selection;remove.title=translate('remove');remove.setAttribute('aria-label',translate('remove'));
      shadow.querySelector('.preview').hidden=!previewOpen;
      // Keep pending page text out of the document until the user opens this preview.
      shadow.querySelector('pre').textContent=previewOpen ? (selection? '[Highlight]\n'+item.selection.text+'\n\n':'')+(page?item.page.text:'') : '';
      shadow.querySelector('.source').textContent=previewOpen ? item.source.title+'\n'+item.source.url : '';
      shadow.querySelector('.note').textContent=previewOpen ? translate('quoteNote')+(item.page?.truncated?' '+translate('compactNote'):'') : '';
    }
    function fold(node,receipt) {
      if(!receipt.marker || !node?.parentElement || !node.textContent.includes(receipt.marker))return;
      if(folds.has(node))return;
      const summary=document.createElement('div');summary.dataset.sakuraSidechat='sent-summary';summary.style.cssText='display:block;min-width:0;max-width:100%;';
      const root=summary.attachShadow({mode:'closed'});
      root.innerHTML='<style>:host{display:block;font:inherit;color:inherit}.question{white-space:pre-wrap;overflow-wrap:anywhere;line-height:inherit}.toggle{display:flex;align-items:center;gap:6px;font:11px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:9px 0 0;padding:4px 0;border:0;background:none;color:inherit;opacity:.72;cursor:pointer}.toggle:hover{opacity:1}.toggle:focus-visible{outline:2px solid currentColor;outline-offset:3px}svg{height:12px;width:12px;fill:none;stroke:currentColor;stroke-width:1.7}[hidden]{display:none!important}</style><div class="question"></div><button class="toggle" type="button">'+svg+'<span></span></button>';
      root.querySelector('.question').textContent=receipt.question;
      const button=root.querySelector('button'),text=button.querySelector('span');
      let expanded=false;const previousDisplay=node.style.display;
      function paint(){node.style.display=expanded?previousDisplay:'none';root.querySelector('.question').hidden=expanded;text.textContent=translate(expanded?'hideContext':'viewContext');button.title=translate('localFoldNote');button.setAttribute('aria-expanded',String(expanded));}
      button.addEventListener('click',()=>{expanded=!expanded;paint();});
      node.parentElement.insertBefore(summary,node);paint();const reveal=()=>{expanded=true;paint();};folds.set(node,{summary,paint,reveal});foldList.push({node,summary,paint});
    }
    function refreshFolds(){for(let i=foldList.length-1;i>=0;i--){const f=foldList[i];if(!f.node.isConnected){f.summary.remove();foldList.splice(i,1);}else f.paint();}}
    return {update,fold,refreshFolds,reveal:node=>folds.get(node)?.reveal()};
  }
  globalThis.SakuraSideView={create};
})();
