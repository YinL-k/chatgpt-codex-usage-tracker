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
- Experimental third-party global reset forecasts from codex-reset.com, distinct from personal reset times and official promises.
- Reset forecast notifications run scheduled background checks; `alarms` schedules those checks and `notifications` displays browser/OS alerts when the selected threshold is met. Notifications can be disabled or set to Standard / Low sensitivity under Usage → Advanced.
- **Side Chat** is an optional side-panel chat experience that uses your existing ChatGPT session. While the panel is open and a site is authorized, SakuraMeter can read visible page text and include text you explicitly highlight as higher-priority context in the next message. Page context can be paused and site access can be revoked at any time. It adds no developer backend, telemetry, or model proxy.

## Install and update

Download and extract the repository. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the directory containing `manifest.json`. Reload your ChatGPT page normally once to activate activity tracking.

Export activity and back up the existing extension directory before updating. Replace files in the existing loaded path and reload the extension to retain its ID and local data. Do not uninstall first. Loading another path may create a new ID. Activity exports do not include manual plans or calibrations.

## Privacy and permissions

Activity remains local. Chat text is briefly compared in memory to confirm a send, never persisted or exported. Authentication tokens remain in request-local memory. Required permissions are `storage`, `tabs`, `sidePanel`, `scripting`, `declarativeNetRequestWithHostAccess`, `alarms`, and `notifications`, plus the `https://chatgpt.com/*` host permission. Access to other HTTP(S) sites is **optional** and is requested only for Side Chat page context when you authorize the current site or all sites. `sidePanel` provides the Side Chat surface, `scripting` runs the local context helper on authorized pages, and `declarativeNetRequestWithHostAccess` is used only while Side Chat is open to manage the response-header rule required for the ChatGPT sub-frame. `alarms` schedules background reset-forecast checks, and `notifications` displays browser/OS alerts when a configured notification condition is met. Page context can be paused and site access can be revoked at any time.

Personal usage uses GET requests to ChatGPT session and usage endpoints. Public forecasts use credential-free GET requests; the forecast provider receives normal connection metadata such as IP address. No developer backend, telemetry, conversation creation, or model calls. See [Privacy](PRIVACY.md).

Unknown quotas remain unavailable. Calibrated Pro balances are local estimates. Private APIs and markup can change; local fixture tests do not establish real-account compatibility.

## Tests

Historical automated verification is preserved in the [3.5.0 verification report](verification/3.5.0/report.json). SakuraMeter 3.6.0.62 passes 71/71 Node unit and background-integration tests plus dedicated browser regressions for Page/Selection behavior, Popup/Dashboard flows, and the iframe send adapter, along with version, JavaScript/JSON syntax, resource-reference, and package-structure checks. Those browser tests use local pages, fixtures, and simulated `chrome.*` APIs; they do not replace human acceptance. Real logged-in ChatGPT sessions and actual browser/OS notification display have not yet been human-verified. See [TESTING.md](TESTING.md) for historical development and verification records.


## Brand and icon

SakuraMeter uses the selected Hanbao (blossom bud) icon across the extension, toolbar, popup, and dashboard, with matching light and dark variants. The localized extension names include ChatGPT and Codex usage keywords. This is an independent community extension. See [brand assets](BRANDING.md).
