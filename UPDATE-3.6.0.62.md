# SakuraMeter 3.6.0.62 实施与验收

基于 main a1d3eca5bf6667200af29e7faf2348bf64822ff5。仅本地源码与安装包，不包含商店发布或远程推送。

## 已实施规则

- 预测通知：Watch 24h ≥45% 或 6h ≥20%，只展示；Standard 24h ≥60% 或 6h ≥30%；Low sensitivity 24h ≥75% 或 6h ≥45%。配置集中在 reset-notifications-core.js。
- 同一个窗口连续三个来源生成时间递增的达标快照，跨度至少十分钟；24h 与 6h 交替达标不能凑数。重复缓存不累计；过期、无效、失败或条件中断清空待触发序列。每五分钟检查。
- 周期默认一次；首次后仅新生成的原始 100% 极强信号，由同一窗口持续满足三个快照、十分钟，才可追加一次。另一个窗口无需满足普通阈值，没有额外三十分钟冷却。首次为极强信号直接消耗最高等级资格。同周期最多两次，模式切换、重启、概率回落均不恢复资格。
- confirmed 仅切周期，按稳定事件字段 group=reset、announcement_state=announced 和 announced_at 识别最新事件，不依赖顶层 updated_at，独立于 LunarWerx 请求；历史回填不恢复额度，新周期拒绝旧周期预测。银行额度、个人倒计时和官方预告不另开通知通道。
- 显示退出线：Watch 40%/15%，Standard 50%/20%，低敏 65%/35%；连续两个低于任一退出线的有效快照降级。推送门槛不受滞回影响。
- 后台串行、持久化去重、固定通知 ID；发送前预留额度，优先防止重启重复提醒。若操作系统拒绝通知，记录 deliveryError，本周期不自动补发。
- Usage → Advanced 中可关闭通知、选择 Standard 或 Low sensitivity；保留已有用量、缓存和设置。通知阈值是初始产品参数，没有宣称命中率。
- Page × 立即移除标签、预览和待发送上下文；暂停当前 URL 的自动引用；手动恢复或导航到新页面恢复。已发送历史不变。
- Page 与 Selection 独立；取消选区按标识清除；切入输入框和网页失焦保留划词。迟到回复不能恢复已关闭 Page 或删除新 Selection。
- 删除 Router、相关性裁剪和 knownPage 去重。PageReference 开启时每次发送都附带完整当前页面摘录；是否使用由模型依据原始请求判断。划词为最明确参考目标。Prompt 固定顺序为 Instruction → UserRequest → Selection → PageContext → PageMetadata；用户原话完整保留，参考数据 XML 转义，元数据最后。
- 引用柔光细波纹、卡片内登录提示、Cached 悬浮/聚焦提示、预测渐隐数字、中英与深浅主题、Overview 默认入口和分钟倒计时。倒计时归零仅显示“等待更新”。
- Popup 在原有构图上放大约 4%，减少底部空白，在 600px 高度内保留全部底部入口；小屏按可用高度缩小。

## 验证结果

- 71/71 Node 单元及后台集成测试通过，覆盖阈值、重复快照、持续时间、极强追加、100% 原始值、模式切换、重启去重、confirmed 独立切周期、Page 关闭/迟到消息/导航恢复、同窗口 OR 持续性、去掉冷却、旧 pending 数组迁移、提示词顺序与原话保留。
- 独立无头 Chrome：12 组 Popup（中英文 × 深浅色 × 数据/空/错误），2 组 Dashboard 主题与设置，低高度 Popup、Overview 入口、Cached 提示、Page 关闭恢复、结构化控件提取、真实 DOM 选区取消/输入保留通过。
- 实际 iframe 发送适配器专项回归通过：重复/独立/划词消息持续带 Page，内容更新、Page × 立即清除、迟到防护、手动恢复、同会话 Page、原话及固定 Prompt 顺序。
- 倒计时跨天格式、归零与 visibilitychange 恢复刷新通过；未实际让电脑睡眠。
- 所有运行时 JS 语法解析通过。新版本资源及权限由测试检查。
- 以上浏览器测试使用本地页面与 chrome.* / 数据源夹具，不是用户已安装扩展的真实线上会话；没有声称已验证真实 ChatGPT 回答或操作系统通知展示。

## 原有问题与未通过的旧测试

- 原始 main 的 heatmap.js 在第 1000 行截断，Dashboard 无法解析。已从仓库 1bda4a1 恢复缺失尾部；原有前缀与该版本一致。
- 旧完整 browser.cjs 的首个消息计数断言在原始基线也失败；本次没有把它标为通过。
- 旧 UI_ONLY 矩阵完成 36 组页面检查和 84 张截图后，在隐藏的校准控件操作处超时。新的专项浏览器回归全部通过，但不能替代该旧流程的完整通过记录。

## 安装和剩余真人验收

1. 解压安装包到固定目录；在 Chrome/Edge 扩展页启用开发者模式，加载解压后的目录。已有开发版可更新原目录后点重新加载；商店版不要直接覆盖其内部文件。
2. 确认新增 notifications / alarms 与预测数据源访问权限，重新打开 Popup，刷新 ChatGPT 和被引用网页。
3. 打开完整 Dashboard 默认进入 Overview；Usage → Advanced → Reset notifications 选择敏感度。
4. 用登录态真实验证：划词翻译、解释、改写，网页题目追问，独立聊天；检查实际发送内容和模型回答。关闭 Page 后重复刷新和切换页面，确认引用生命周期。
5. 在真实扩展后台等待或注入受控测试快照，检查浏览器/系统通知权限、勿扰模式与实际弹窗；测试数据不要混入正式周期状态。

通知依赖浏览器后台运行及外部数据源更新。实现采用“至多一次预留”策略，异常中断可能漏发一次，以避免重复推送。

## 复现命令

```text
node --test tests/core.test.cjs tests/reset.test.cjs tests/refresh.test.cjs tests/prediction.test.cjs tests/prediction-worker.test.cjs tests/page-worker.test.cjs
node tests/update-browser.cjs
node tests/reference-send-browser.cjs
```

浏览器专项测试需要 Playwright 与本机 Chrome；依赖不会打入扩展安装包。

本次仅四个运行时代码文件发生变化：reset-notifications-core.js、sidechat/core.js、sidechat/adapter.js、sidechat/extractor.js。Popup、Dashboard、敏感度 UI、开关、通知调度器、Page 和 Selection 状态管理文件与上一版逐字节一致。旧版合并待触发序列无法证明所属窗口，迁移时仅清空 pending 证据，保留周期 ID、已通知等级、次数和时间。

提示词依据：[OpenAI Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)、[Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices)。confirmed 事件依据：[codex-reset API 官方文档](https://codex-reset.com/developers)。
