# SakuraMeter 3.6.0.62

- LunarWerx supplies public forecasts; codex-reset.com supplies confirmed global events. Standard: 24h ≥60% or 6h ≥30%; Low sensitivity: 24h ≥75% or 6h ≥45%. Three increasing snapshots from the same window must span at least ten minutes. Watch is display-only. One notification per cycle, plus at most one additional sustained raw 100% signal. Confirmed events only switch cycles and do not trigger notifications. Disable notifications or change sensitivity under Usage → Advanced. Thresholds are initial product parameters, not measured accuracy claims.
- `alarms` schedules five-minute background forecast checks; `notifications` displays predictive system notifications and opens Overview on click. Predictions do not establish restored personal allowance. Required hosts are `https://chatgpt.com/*`, `https://codex.lunarwerx.com/*`, and `https://codex-reset.com/*`. Public requests omit account credentials; providers receive normal connection metadata such as IP address.
- Every send with Page enabled includes the current extracted excerpt. Closing Page immediately clears pending page references and pauses the current URL; manual restoration or navigation to a new page resumes it. Page and Selection are independent; late replies cannot restore a closed Page or remove a newer Selection.
- Prompt order: Instruction → UserRequest → Selection → PageContext → PageMetadata; original user requests are preserved and reference data is XML-escaped.

[UPDATE-3.6.0.62.md](UPDATE-3.6.0.62.md) records 71/71 Node tests and targeted fixture browser regressions passing; legacy full browser flows did not all pass. Real system notifications, permission/Do Not Disturb behavior and signed-in ChatGPT sessions still require human acceptance. Delivery depends on browser background activity and source updates. Reserving counts before delivery prevents duplicates but can miss a notification after interruption; rejected deliveries are not automatically retried.

## Package and publication

The existing `.github/workflows/release.yml` builds `SakuraMeter-3.6.0.62.zip` from the manifest on a `v*` tag and publishes it as a GitHub Release. The ZIP has `manifest.json` at its root and includes runtime scripts, styles, HTML, assets, locales, frontend, sidechat and `privacy-policy.md`. This is a GitHub release, not a Chrome/Edge store submission or installation acceptance.
