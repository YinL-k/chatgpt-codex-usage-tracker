[English](README_en.md) | 中文

# SakuraMeter — ChatGPT & Codex Usage Tracker

![SakuraMeter](assets/sakurameter-128.png)

**3.6.0.62**

在浏览器本地记录 ChatGPT 活动，查看热力图、使用趋势和 Codex 额度。保留 Sakura 玻璃风格，提供樱花粉浅色和深色主题、中英文界面。

## 产品预览

<img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/large-promotional.jpg?v=3a031125" alt="SakuraMeter promotional banner" />

下面展示 6 张英文版商店截图。

<table>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/01-popup-dark.jpg?v=3a031125" alt="Popup dark" /></td><td width="50%"><img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/02-popup-light.jpg?v=3a031125" alt="Popup light" /></td></tr>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/03-overview-dark.jpg?v=3a031125" alt="Overview dark" /></td><td width="50%"><img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/04-overview-light.jpg?v=3a031125" alt="Overview light" /></td></tr>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/05-activity-dark.jpg?v=3a031125" alt="Activity dark" /></td><td width="50%"><img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/06-activity-light.jpg?v=3a031125" alt="Activity light" /></td></tr>
</table>

## 本版功能

- **发送确认**：点击、Enter 或表单提交只记录发送意图，匹配到新用户消息后才计数；排除空输入、失败发送、重复事件和历史回放。
- **Overview / Activity / Usage**：活动趋势、全年热力图、月周柱状图、时段分布、个人用量和校准。三张统计卡片等高，周记录较多时仅图表内部横向滚动。
- **一致的主题与控件**：主题切换保持尺寸、滚动、输入和展开状态；统一会员栏、Live 标签、下拉菜单、整框可点击的日期时间选择和操作按钮，支持键盘与 reduced-motion。
- **只读额度刷新**：读取已有 ChatGPT 登录会话与 usage，动态显示 Codex 窗口时长；失败保留缓存，不自动重载聊天页，不提交聊天或调用模型。
- **Codex Reset**：LunarWerx 提供公开预测，codex-reset.com 提供已确认全局事件。Standard：24h ≥60% 或 6h ≥30%；Low sensitivity：24h ≥75% 或 6h ≥45%；同一窗口需三个递增快照且跨度至少十分钟。Watch 仅展示。每周期默认一次，持续原始 100% 极强信号可追加一次；confirmed 只切周期，不触发通知。Usage → Advanced 可关闭通知或调整敏感度。阈值是初始产品参数，没有已验证命中率。属于实验性第三方预测，不是个人额度重置或官方保证。
- **Side Chat**：可选的侧边聊天体验，直接使用现有 ChatGPT 登录会话。面板打开且网站已授权时，可读取当前页面的可见正文，并可将你主动高亮的文本作为重点上下文加入下一条消息。Page 开启时每次发送均附当前页面摘录；关闭 Page 立即清除待发送页面引用并暂停当前 URL，手动恢复或导航到新页面恢复。Page 与 Selection 独立，迟到回复不会恢复已关闭 Page 或删除新 Selection。可随时暂停页面上下文或撤销站点权限；不新增开发者后端、遥测或模型代理。

## 安装与升级

下载此仓库 ZIP 并解压，打开 `chrome://extensions`，开启开发者模式，点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的仓库目录。安装后正常刷新一次 ChatGPT 页面，使消息统计脚本生效。

升级前先导出活动备份并备份原源码目录。要保留同一扩展 ID 下的历史、手动计划和校准，请更新原加载路径的文件，再在扩展管理页重新加载；不要先卸载旧扩展。活动导出仅含日期统计，不包含计划或校准。另选路径可能生成不同扩展 ID。

## 数据、权限与网络

统计在本地保存，不保存聊天正文、密码或认证令牌；发送确认短暂在内存比较文本，过期即丢弃。保留历史日期键、`__gptUsageV4`、schema 3、手动计划与校准；活动导出格式 version 5，appVersion 3.6.0.62。

当前必需权限为 `storage`、`tabs`、`sidePanel`、`scripting`、`declarativeNetRequestWithHostAccess`、`alarms`、`notifications`。`alarms` 每五分钟唤醒后台检查预测；`notifications` 显示预测系统通知，点击打开 Overview。预测不表示个人额度已恢复。必需主机权限为 `https://chatgpt.com/*`、`https://codex.lunarwerx.com/*`、`https://codex-reset.com/*`。公开预测请求不携带账号认证信息，第三方仍会收到 IP 等连接元数据。Side Chat 对其他网站的访问属于**可选权限**：只有在你授权当前网站或全部网站后，才会读取该页面的可见正文用于本地上下文；可以随时暂停或撤销权限。`sidePanel` 用于 Side Chat 面板，`scripting` 用于在已授权页面运行本地上下文脚本，`declarativeNetRequestWithHostAccess` 仅在 Side Chat 面板打开期间处理 ChatGPT 子框架所需的响应头规则。个人额度使用 GET `/api/auth/session` 和 `/backend-api/wham/usage`，令牌仅用于请求内存。公开预测使用不携带账户信息的 GET；第三方会收到 IP 等普通连接元数据。无开发者后台、遥测、自动模型调用或模型代理。详见 [隐私说明](PRIVACY.md)。

未知额度不补造数值；Pro 余额在手动校准后为本地估算。私有 API 和页面结构可能变化。[UPDATE-3.6.0.62.md](UPDATE-3.6.0.62.md) 记录了 71/71 Node 测试及专项夹具浏览器回归通过，旧完整浏览器流程未全部通过。真实系统通知展示、系统权限/勿扰行为及真实登录账号会话仍需真人验收。通知依赖浏览器后台与数据源更新；发送前预留次数防止重复，异常中断可能漏发，系统拒绝时不自动补发。

## 验证

在 `tests` 目录执行 `npm install`，再执行 `npm test`。浏览器测试需要安装 Google Chrome（脚本使用 Playwright 的 chrome channel）：`npm run browser`、`npm run themes`、`npm run readability`、`npm run controls`。测试使用本地夹具，不消耗模型额度。

历史自动化验证基线见 [3.5.0 验证报告](verification/3.5.0/report.json)。本版实施与验收记录见 [UPDATE-3.6.0.62.md](UPDATE-3.6.0.62.md)；[TESTING.md](TESTING.md) 保留历史开发与验证记录。


## 品牌与图标

采用确认的 01「含苞」图标，应用于扩展、工具栏、Popup 与 Dashboard，支持深浅主题。中英文扩展名称包含 ChatGPT / Codex 用量关键词。详见 [品牌资源](BRANDING.md)。本项目为独立社区扩展。
