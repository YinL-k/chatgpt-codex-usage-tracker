# Page reference 与可选去重

基于 3.6.0.62（2ddb4e9f9aa5aba4accabc7f5eb86c02b9fbdace）最小修改。本说明覆盖旧验收文档中“不做 Page 去重”的描述；其他 Reset、Popup、Dashboard 规则不变。

- Page reference：当前页面开关，与 Page × 同步；关闭立即移除标签、预览和待发送正文，保留 Selection。手动恢复或导航按原有逻辑建立引用。
- Deduplicate page：默认开启，保存在本地设置；只节省同一对话中已成功发送且未变化的 Page 正文，仍明确标记当前 Page reference 有效。关闭后每次发送附带最新完整快照。
- 未变化的判断包括页面来源、标题与已提取正文；变化会更新本地引用，下一条用户消息附带新正文，不自行发送消息。新对话、失败发送、关闭后恢复不会误用旧去重记录。
- 每次 Page 开启时发送前重新获取当前页面快照，最多等待两秒；失败保留原始草稿。重复点击合并，读取期间编辑草稿或关闭 Page 会取消待发送操作。
- 页面正文、代码、表格、标题和控件变化沿用现有结构化提取范围。变化合并等待 200ms，连续变化最多等待一秒；发送前的快照检查兜底。不扩展权限，也不将提取范围外的数据声称为已捕获。
- 无 Router 或 relevance classification。Selection 始终作为明确参考目标。固定提示词顺序仍为 Instruction → 原始 UserRequest → Selection → PageContext → PageMetadata；去重命中时省略重复 PageContext 正文，在 Metadata 中声明当前引用延续。

## 验证

- Node 回归测试 76/76 通过，涵盖原有 Reset 和新增设置、来源快照、导航、晚到消息及引用状态测试。
- Playwright 发送链路通过：默认去重、正文变化、新对话、去重关闭、Page ×、恢复、Selection 独立、失败重试、快照超时和待发送取消。
- Playwright 页面提取与设置测试通过：代码、表格、控件、标题、持续变化、强制快照、关闭停止采集；中英文和深浅主题开关。
- JavaScript 语法检查及 diff 空白检查通过。Reset、Popup、Dashboard 源码未变。

浏览器验证使用真实浏览器运行项目脚本，ChatGPT 页面及扩展接口为测试夹具；未在已登录的真实 ChatGPT 会话中验证模型回答。不包含商店发布。
