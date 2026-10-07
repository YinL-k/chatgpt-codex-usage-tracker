# SakuraMeter 3.6.0.62

- Added reset-forecast notification behavior with scheduled background checks and configurable Standard / Low sensitivity modes.
- Added required `alarms` permission for background scheduling and `notifications` permission for browser/OS alerts.
- Updated Page/Selection lifecycle behavior so closing Page immediately removes pending page context, keeps Selection independent, and prevents late replies from restoring cleared state.
- Kept reset forecasts explicitly experimental: notification thresholds are product parameters, not claimed prediction accuracy.
- Automated verification passes 71/71 Node unit/background-integration tests plus dedicated browser regressions for Popup/Dashboard, Page/Selection, and the iframe send adapter.
- Human acceptance is still pending for real logged-in ChatGPT sessions and actual browser/operating-system notification display.
