English | [中文](README.md)

# SakuraMeter — ChatGPT & Codex Usage Tracker

![SakuraMeter](assets/sakurameter-128.png)

**3.6.0.62**

A Chrome extension for local ChatGPT activity tracking, heatmaps, trends, and read-only Codex allowance information. Sakura dark and pale-pink themes share the same layout and interactions.

## Preview

<img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/large-promotional.jpg?v=3a031125" alt="SakuraMeter promotional banner" />

Six English store screenshots are shown below.

<table>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/01-popup-dark.jpg?v=3a031125" alt="Popup dark" /></td><td width="50%"><img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/02-popup-light.jpg?v=3a031125" alt="Popup light" /></td></tr>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/03-overview-dark.jpg?v=3a031125" alt="Overview dark" /></td><td width="50%"><img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/04-overview-light.jpg?v=3a031125" alt="Overview light" /></td></tr>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/05-activity-dark.jpg?v=3a031125" alt="Activity dark" /></td><td width="50%"><img src="https://raw.githubusercontent.com/YinL-k/chatgpt-codex-usage-tracker/main/store-assets/en/preview/06-activity-light.jpg?v=3a031125" alt="Activity light" /></td></tr>
</table>

## Features

- Confirm sends only after a matching new user message appears; ignore empty, failed, duplicate, and replayed events.
- Overview, Activity, and Usage pages with monthly/weekly columns, daily trends, heatmaps, time-of-day distribution, and manual Pro calibration.
- Consistent membership rows, compact Live badges, themed dropdowns and date/time picker, keyboard navigation, and reduced-motion support.
- Read-only refresh using the existing ChatGPT session, dynamic Codex windows, timeout/backoff, and cached/error states. No chat submission, generation, or automatic page reload.
- LunarWerx supplies public forecasts; codex-reset.com supplies confirmed global events. Standard: 24h ≥60% or 6h ≥30%; Low sensitivity: 24h ≥75% or 6h ≥45%. Three increasing snapshots from the same window must span at least ten minutes. Watch is display-only. One notification per cycle, plus at most one additional sustained raw 100% signal. Confirmed events only switch cycles and do not trigger notifications. Disable notifications or change sensitivity under Usage → Advanced. Thresholds are initial product parameters, not measured accuracy claims.
- **Side Chat** is an optional side-panel chat experience that uses your existing ChatGPT session. While the panel is open and a site is authorized, SakuraMeter can read visible page text and include text you explicitly highlight as higher-priority context in the next message. Every send with Page enabled includes the current extracted excerpt. Closing Page immediately clears pending page references and pauses the current URL; manual restoration or navigation to a new page resumes it. Page and Selection are independent; late replies cannot restore a closed Page or remove a newer Selection. Page context can be paused and site access can be revoked at any time. It adds no developer backend, telemetry, or model proxy.

## Install and update

Download and extract the repository. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the directory containing `manifest.json`. Reload your ChatGPT page normally once to activate activity tracking.

Export activity and back up the existing extension directory before updating. Replace files in the existing loaded path and reload the extension to retain its ID and local data. Do not uninstall first. Loading another path may create a new ID. Activity exports do not include manual plans or calibrations.

## Privacy and permissions

Activity remains local. Chat text is briefly compared in memory to confirm a send, never persisted or exported. Authentication tokens remain in request-local memory. Required permissions are `storage`, `tabs`, `sidePanel`, `scripting`, `declarativeNetRequestWithHostAccess`, `alarms`, and `notifications`. `alarms` schedules five-minute background forecast checks; `notifications` displays predictive system notifications and opens Overview on click. Predictions do not establish restored personal allowance. Required hosts are `https://chatgpt.com/*`, `https://codex.lunarwerx.com/*`, and `https://codex-reset.com/*`. Public requests omit account credentials; providers receive normal connection metadata such as IP address. Access to other HTTP(S) sites is **optional** and is requested only for Side Chat page context when you authorize the current site or all sites. `sidePanel` provides the Side Chat surface, `scripting` runs the local context helper on authorized pages, and `declarativeNetRequestWithHostAccess` is used only while Side Chat is open to manage the response-header rule required for the ChatGPT sub-frame. Page context can be paused and site access can be revoked at any time.

Personal usage uses GET requests to ChatGPT session and usage endpoints. Public forecasts use credential-free GET requests; the forecast provider receives normal connection metadata such as IP address. No developer backend, telemetry, conversation creation, or model calls. See [Privacy](PRIVACY.md).

Unknown quotas remain unavailable. Calibrated Pro balances are local estimates. Private APIs and markup can change; [UPDATE-3.6.0.62.md](UPDATE-3.6.0.62.md) records 71/71 Node tests and targeted fixture browser regressions passing; legacy full browser flows did not all pass. Real system notifications, permission/Do Not Disturb behavior and signed-in ChatGPT sessions still require human acceptance. Delivery depends on browser background activity and source updates. Reserving counts before delivery prevents duplicates but can miss a notification after interruption; rejected deliveries are not automatically retried.

## Tests

Historical automated verification is preserved in the [3.5.0 verification report](verification/3.5.0/report.json). Current implementation and acceptance details are in [UPDATE-3.6.0.62.md](UPDATE-3.6.0.62.md). See [TESTING.md](TESTING.md) for historical development and verification records.


## Brand and icon

SakuraMeter uses the selected Hanbao (blossom bud) icon across the extension, toolbar, popup, and dashboard, with matching light and dark variants. The localized extension names include ChatGPT and Codex usage keywords. This is an independent community extension. See [brand assets](BRANDING.md).
