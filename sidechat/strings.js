(() => {
  'use strict';
  const en = {removePage:'Remove page reference',restorePage:'Reference this page again',
    sidechat: 'Side Chat', subtitle: 'Your page. Your ChatGPT.', usage: 'Open usage dashboard', newChat: 'New chat', reload: 'Reload ChatGPT', login: 'Open ChatGPT in a tab',
    theme: 'Switch theme', language: 'Switch language', settings: 'Settings', close: 'Close',
    welcomeTitle: 'ChatGPT, beside your page.', welcomeBody: 'The current page is included automatically. Highlight a passage when you want extra focus.',
    welcomeFoot: 'Your existing ChatGPT account. No API key. No new chat service.',
    enable: 'Enable Side Chat', grantTitle: 'Where should page context work?', allSites: 'All websites', allSitesNote: 'Authorize once so current-page context follows you as you browse.',
    thisSite: 'Only this website', thisSiteNote: 'Other sites will ask for permission before page context is read.',
    consent: 'Current-page text and highlights stay in session memory while Side Chat is open. Sending includes the extracted page context and source in your ChatGPT message. While a Side Chat panel is open, embedding adjusts frame-blocking headers for chatgpt.com sub-frame responses.',
    waiting: 'Connecting to ChatGPT', ready: 'Ready', sourceWaiting: 'Open a webpage to start', restricted: 'Page context is unavailable on this page', access: 'Enable page context on this site',
    selectHint: 'Reading current page…', paused: 'Page context paused', pause: 'Pause page context', resume: 'Resume page context',
    quote: '1 selection', page: '1 page', pageSelection: '1 page · 1 selection', preview: 'Preview page context', remove: 'Remove selection', quoteNote: 'Current page context is included when you send; a highlight is prioritized when present.',
    selectFirst: 'The current page is automatic. Highlight text only when you want to focus on a passage.', loadingHelp: 'Still loading? Sign in in a regular ChatGPT tab, then reload here.',
    denied: 'Permission was not granted. You can enable it again here.', unavailable: 'Chrome could not read this page. Refresh the webpage and try again.',
    tooLong: 'This selection is too long. Select fewer than 16,000 characters.', expired: 'The page context expired. Refresh the webpage or select the passage again.',
    reconnect: 'Reconnecting to the extension', permissionLost: 'Sidebar permission is missing. Enable it again below.',
    sendError: 'Could not safely attach page context. Nothing was sent. Your draft and context are kept.', sending: 'Adding page context to your message',
    settingsTitle: 'Side Chat preferences', captureLabel: 'Automatic page context', captureNote: 'Active only while this side panel is open. It reads rendered page text; password and form input values are not read. Highlights are added as extra focus.',
    permissionsLabel: 'Website access', permissionsNote: 'Access can also be revoked in Chrome\'s extension settings.', grantAll: 'Allow all websites', managePermissions: 'Open extension settings',
    privacyTitle: 'A separate, local context layer', privacyBody: 'Page context and highlights are not saved to usage history or exports. Closing the panel clears them. This is an independent extension implementation, not OpenAI-native browser context.',
    draftConfirm: 'This will leave the current ChatGPT page. Keep going? Unsent text may be lost.',
    selectionSafe: 'Page + highlight ready', countNote: 'Sidebar sends are counted after a new user message is confirmed.', keyboard: 'Shortcut: Alt + Shift + C',
    pageError: 'The ChatGPT frame is not ready. Sign in or reload.', connectionError: 'Side Chat could not connect. Close and reopen the panel.',
    pageReady: 'Current page ready', source: 'Source', unknown: 'Current page', local: 'SIDE CHAT', retry: 'Try again', done: 'Done'
  };
  const zh = {removePage:'移除网页引用',restorePage:'重新引用当前页面',
    sidechat:'\u4fa7\u8fb9\u804a\u5929', subtitle:'\u7f51\u9875\u5728\u5de6\uff0cChatGPT \u5728\u53f3', usage:'\u6253\u5f00\u7528\u91cf\u9762\u677f', newChat:'\u65b0\u5bf9\u8bdd', reload:'\u91cd\u65b0\u52a0\u8f7d ChatGPT', login:'\u5728\u65b0\u6807\u7b7e\u9875\u6253\u5f00 ChatGPT',
    theme:'\u5207\u6362\u4e3b\u9898', language:'\u5207\u6362\u8bed\u8a00', settings:'\u8bbe\u7f6e', close:'\u5173\u95ed',
    welcomeTitle:'ChatGPT\uff0c\u5c31\u5728\u7f51\u9875\u65c1\u8fb9\u3002', welcomeBody:'\u5f53\u524d\u7f51\u9875\u4f1a\u81ea\u52a8\u4f5c\u4e3a\u4e0a\u4e0b\u6587\uff1b\u9700\u8981\u7cbe\u786e\u805a\u7126\u65f6\u518d\u5212\u9009\u4e00\u6bb5\u3002',
    welcomeFoot:'\u4f7f\u7528\u73b0\u6709 ChatGPT \u8d26\u53f7\uff0c\u65e0\u9700 API Key\u3002', enable:'\u542f\u7528\u4fa7\u8fb9\u804a\u5929', grantTitle:'\u5728\u54ea\u4e9b\u7f51\u7ad9\u81ea\u52a8\u8bfb\u53d6\u5f53\u524d\u9875\u9762\uff1f',
    allSites:'\u6240\u6709\u7f51\u7ad9', allSitesNote:'\u6388\u6743\u4e00\u6b21\uff0c\u5207\u6362\u7f51\u7ad9\u65f6\u5f53\u524d\u9875\u4e0a\u4e0b\u6587\u4f1a\u81ea\u52a8\u8ddf\u968f\u3002', thisSite:'\u4ec5\u5f53\u524d\u7f51\u7ad9', thisSiteNote:'\u5176\u4ed6\u7f51\u7ad9\u5728\u8bfb\u53d6\u9875\u9762\u4e0a\u4e0b\u6587\u524d\u4f1a\u518d\u8bf7\u6c42\u6388\u6743\u3002',
    consent:'\u5f53\u524d\u7f51\u9875\u6587\u5b57\u548c\u9009\u533a\u4ec5\u6682\u5b58\u4e8e\u4f1a\u8bdd\u5185\u5b58\u3002\u53d1\u9001\u65f6\uff0c\u9875\u9762\u4e0a\u4e0b\u6587\u3001\u6765\u6e90\u548c\u53ef\u9009\u7684\u9009\u533a\u4f1a\u5305\u542b\u5728 ChatGPT \u6d88\u606f\u4e2d\u3002\u5185\u5d4c\u663e\u793a\u4ec5\u8c03\u6574\u672c\u6269\u5c55 ChatGPT \u6846\u67b6\u7684\u5b89\u5168\u54cd\u5e94\u5934\u3002',
    waiting:'\u6b63\u5728\u8fde\u63a5 ChatGPT', ready:'\u5df2\u5c31\u7eea', sourceWaiting:'\u6253\u5f00\u7f51\u9875\u5373\u53ef\u5f00\u59cb', restricted:'\u6b64\u9875\u9762\u4e0d\u652f\u6301\u9875\u9762\u4e0a\u4e0b\u6587', access:'\u5141\u8bb8\u6b64\u7f51\u7ad9\u7684\u9875\u9762\u4e0a\u4e0b\u6587',
    selectHint:'\u6b63\u5728\u8bfb\u53d6\u5f53\u524d\u7f51\u9875\u2026', paused:'\u9875\u9762\u4e0a\u4e0b\u6587\u5df2\u6682\u505c', pause:'\u6682\u505c\u9875\u9762\u4e0a\u4e0b\u6587', resume:'\u6062\u590d\u9875\u9762\u4e0a\u4e0b\u6587',
    quote:'1 \u5904\u9009\u533a', page:'1 \u4e2a\u7f51\u9875', pageSelection:'1 \u4e2a\u7f51\u9875 \u00b7 1 \u5904\u9009\u533a', preview:'\u67e5\u770b\u9875\u9762\u4e0a\u4e0b\u6587', remove:'\u79fb\u9664\u9009\u533a', quoteNote:'\u53d1\u9001\u65f6\u4f1a\u9644\u5e26\u5f53\u524d\u9875\u9762\uff1b\u5982\u6709\u9009\u533a\uff0c\u4f1a\u4f18\u5148\u805a\u7126\u8be5\u6bb5\u3002',
    selectFirst:'\u5f53\u524d\u7f51\u9875\u4f1a\u81ea\u52a8\u9644\u5e26\uff1b\u53ea\u6709\u9700\u8981\u5f3a\u8c03\u67d0\u6bb5\u5185\u5bb9\u65f6\u624d\u9700\u8981\u5212\u9009\u3002', loadingHelp:'\u8fd8\u672a\u52a0\u8f7d\uff1f\u5148\u5728\u666e\u901a\u6807\u7b7e\u9875\u767b\u5f55 ChatGPT\uff0c\u518d\u91cd\u65b0\u52a0\u8f7d\u3002',
    denied:'\u672a\u83b7\u5f97\u6388\u6743\uff0c\u53ef\u4ee5\u518d\u6b21\u70b9\u51fb\u542f\u7528\u3002', unavailable:'\u6682\u65f6\u65e0\u6cd5\u8bfb\u53d6\u6b64\u9875\u9762\uff0c\u8bf7\u5237\u65b0\u7f51\u9875\u540e\u91cd\u8bd5\u3002',
    tooLong:'\u9009\u533a\u8fc7\u957f\uff0c\u8bf7\u63a7\u5236\u5728 16,000 \u5b57\u7b26\u4ee5\u5185\u3002', expired:'\u9875\u9762\u4e0a\u4e0b\u6587\u5df2\u8fc7\u671f\uff0c\u8bf7\u5237\u65b0\u7f51\u9875\u6216\u91cd\u65b0\u5212\u9009\u3002',
    reconnect:'\u6b63\u5728\u91cd\u65b0\u8fde\u63a5\u6269\u5c55', permissionLost:'\u4fa7\u8fb9\u680f\u6743\u9650\u4e0d\u8db3\uff0c\u8bf7\u91cd\u65b0\u542f\u7528\u3002',
    sendError:'\u65e0\u6cd5\u5b89\u5168\u9644\u5e26\u9875\u9762\u4e0a\u4e0b\u6587\uff0c\u672a\u53d1\u9001\u3002\u8349\u7a3f\u548c\u4e0a\u4e0b\u6587\u5df2\u4fdd\u7559\u3002', sending:'\u6b63\u5728\u9644\u5e26\u9875\u9762\u4e0a\u4e0b\u6587',
    settingsTitle:'\u4fa7\u8fb9\u804a\u5929\u8bbe\u7f6e', captureLabel:'\u81ea\u52a8\u9875\u9762\u4e0a\u4e0b\u6587', captureNote:'\u4ec5\u5728\u4fa7\u8fb9\u680f\u6253\u5f00\u65f6\u542f\u7528\u3002\u8bfb\u53d6\u9875\u9762\u5df2\u6e32\u67d3\u6587\u5b57\uff0c\u4e0d\u8bfb\u53d6\u5bc6\u7801\u6216\u8868\u5355\u8f93\u5165\u503c\u3002\u5212\u9009\u4ec5\u4f5c\u4e3a\u989d\u5916\u805a\u7126\u3002',
    permissionsLabel:'\u7f51\u7ad9\u8bbf\u95ee\u6743\u9650', permissionsNote:'\u4e5f\u53ef\u5728 Chrome \u6269\u5c55\u8bbe\u7f6e\u4e2d\u64a4\u9500\u6743\u9650\u3002', grantAll:'\u5141\u8bb8\u6240\u6709\u7f51\u7ad9', managePermissions:'\u6253\u5f00\u6269\u5c55\u8bbe\u7f6e',
    privacyTitle:'\u72ec\u7acb\u7684\u672c\u5730\u4e0a\u4e0b\u6587', privacyBody:'\u9875\u9762\u4e0a\u4e0b\u6587\u548c\u9009\u533a\u90fd\u4e0d\u5199\u5165\u7528\u91cf\u5386\u53f2\u6216\u5bfc\u51fa\u5907\u4efd\u3002\u5173\u95ed\u4fa7\u8fb9\u680f\u5373\u6e05\u9664\u3002\u672c\u529f\u80fd\u4e3a\u72ec\u7acb\u6269\u5c55\u5b9e\u73b0\uff0c\u5e76\u975e OpenAI \u539f\u751f\u6d4f\u89c8\u5668\u4e0a\u4e0b\u6587\u3002',
    draftConfirm:'\u5c06\u79bb\u5f00\u5f53\u524d ChatGPT \u9875\u9762\uff0c\u672a\u53d1\u9001\u6587\u5b57\u53ef\u80fd\u4e22\u5931\u3002\u7ee7\u7eed\uff1f', selectionSafe:'\u7f51\u9875 + \u9009\u533a\u5df2\u5c31\u7eea', countNote:'\u786e\u8ba4\u65b0\u7528\u6237\u6d88\u606f\u540e\uff0c\u624d\u8ba1\u5165\u7528\u91cf\u3002', keyboard:'\u5feb\u6377\u952e\uff1aAlt + Shift + C',
    pageError:'ChatGPT \u6846\u67b6\u672a\u5c31\u7eea\uff0c\u8bf7\u767b\u5f55\u6216\u91cd\u8f7d\u3002', connectionError:'\u8fde\u63a5\u5931\u8d25\uff0c\u8bf7\u5173\u95ed\u5e76\u91cd\u65b0\u6253\u5f00\u4fa7\u8fb9\u680f\u3002', pageReady:'\u5f53\u524d\u7f51\u9875\u5df2\u5c31\u7eea', source:'\u6765\u6e90', unknown:'\u5f53\u524d\u7f51\u9875', local:'\u4fa7\u8fb9\u804a\u5929', retry:'\u91cd\u8bd5', done:'\u5b8c\u6210'
  };
  Object.assign(en, {
    more: 'More options', refreshContext: 'Refresh page context', refreshed: 'Page refresh requested',
    shortPage: 'Page', shortSelection: 'Selection', viewContext: 'Show reference', hideContext: 'Hide reference',
    attached: 'Page reference included', compactNote: 'Compact page excerpt; open the source for omitted sections.',
    quoteNote: 'This reference is added to your message when needed. Preview before sharing sensitive pages.',
    sendError: 'The editor could not accept the reference. Check your draft, or pause page context to send without it.',
    paused: 'Page context paused. ChatGPT remains available.',
    localFoldNote: 'Only the local display is collapsed. The full reference remains in the sent message.',
    contextNotReady: 'Page context is not ready yet. This message uses the existing conversation.',
    sameConversation: 'This conversation is already the current source.'
  });
  Object.assign(zh, {
    consent: '\u7f51\u9875\u4e0e\u9009\u533a\u4ec5\u5728\u4f1a\u8bdd\u5185\u5b58\u4e2d\u6682\u5b58\uff1b\u53d1\u9001\u540e\u4f1a\u6210\u4e3a ChatGPT \u6d88\u606f\u6587\u672c\u3002\u4fa7\u680f\u6253\u5f00\u671f\u95f4\uff0c\u4f1a\u8c03\u6574 chatgpt.com \u5b50\u6846\u67b6\u54cd\u5e94\u5934\uff0c\u4e0d\u4fee\u6539\u666e\u901a\u9876\u5c42\u9875\u9762\u3002',
    more: '\u66f4\u591a\u9009\u9879', refreshContext: '\u5237\u65b0\u7f51\u9875\u4e0a\u4e0b\u6587', refreshed: '\u5df2\u8bf7\u6c42\u5237\u65b0\u7f51\u9875',
    shortPage: '\u7f51\u9875', shortSelection: '\u9009\u533a', viewContext: '\u5c55\u5f00\u5f15\u7528', hideContext: '\u6536\u8d77\u5f15\u7528',
    attached: '\u5df2\u9644\u5e26\u7f51\u9875\u5f15\u7528', compactNote: '\u5df2\u7cbe\u7b80\u4e3a\u7f51\u9875\u6458\u5f55\uff0c\u7701\u7565\u90e8\u5206\u8bf7\u67e5\u770b\u539f\u9875\u9762\u3002',
    quoteNote: '\u9700\u8981\u65f6\u4f1a\u5c06\u5f15\u7528\u52a0\u5165\u6d88\u606f\u3002\u6d89\u53ca\u654f\u611f\u9875\u9762\u65f6\u8bf7\u5148\u9884\u89c8\u3002',
    localFoldNote: '\u4ec5\u6298\u53e0\u672c\u5730\u663e\u793a\uff0c\u5b8c\u6574\u5f15\u7528\u4ecd\u5728\u5df2\u53d1\u9001\u6d88\u606f\u4e2d\u3002',
    contextNotReady: '\u7f51\u9875\u4e0a\u4e0b\u6587\u5c1a\u672a\u5c31\u7eea\uff0c\u672c\u6761\u6d88\u606f\u6cbf\u7528\u5df2\u6709\u5bf9\u8bdd\u3002'
  });
  Object.assign(en,{captureNote:'Active only while this panel is open. Reads rendered page text, not passwords or form input values. Selection is the explicit target.',pageReferenceLabel:'Page reference',deduplicatePageLabel:'Deduplicate page',pageReferenceNote:'Keep referencing this page until you turn it off. Selection stays independent.',deduplicatePageNote:'Reuse unchanged page context. Changes refresh the reference for your next message.',freshnessError:'The latest page snapshot could not be read. Your draft is kept; try sending again.',quoteNote:'Page stays referenced until you close it. Unchanged content may reuse the previous reference. Selection is the explicit target.'});
  Object.assign(zh,{captureNote:'仅在侧边栏打开时读取已渲染网页内容，不读取密码或表单输入值。Selection 始终是明确目标。',pageReferenceLabel:'Page reference',deduplicatePageLabel:'Deduplicate page',pageReferenceNote:'开启时持续引用当前网页；关闭不影响 Selection。',deduplicatePageNote:'省略重复页面内容；页面变化会更新引用，在下一条消息中附带。',freshnessError:'未能读取最新网页快照，草稿已保留，请重试发送。',quoteNote:'网页会持续引用，直到你关闭它。未变化的内容可沿用已发送引用；Selection 始终是明确目标。'});
  globalThis.SakuraSideStrings = { en, zh };
})();
