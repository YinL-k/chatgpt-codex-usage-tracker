# SakuraMeter 3.6.0.62 - Privacy and behavior

Side Chat is optional and separate from the existing local usage tracker. There is no added developer backend, telemetry or model proxy.

## Page and highlight capture

Only while a panel is open, enabled and the active site is authorized, first-party content scripts read selected visible text and a compact main-page excerpt. The extractor excludes common navigation/sidebars, hidden nodes and editable text fields. It may include visible button labels, selected option text, checkbox/radio selection and disabled states. It does not inspect cookie stores, input .value properties, passwords, JavaScript variables, or hidden documents. Sensitive information that is displayed as ordinary readable page text can still be included; review the chip preview or pause capture for sensitive sites.

Page excerpts are capped at 12,000 characters, including when accompanied by a highlight. Explicit highlights may be up to 16,000 characters and expire after 15 minutes. Excerpts include sanitized source title/URL (query, fragment and URL credentials removed), tab/window metadata and capture metadata. Content fingerprints are local context identifiers, not authentication or encryption; they do not suppress page references in later sends.

Context stays in extension RAM/chrome.storage.session and is not added to usage history, local persistent usage storage, activity exports or telemetry. Closing a panel clears that window's captured context. Browser/session shutdown clears session storage. Every send with Page enabled includes the current extracted excerpt. Closing Page immediately clears pending page references and pauses the current URL; manual restoration or navigation to a new page resumes it. Page and Selection are independent; late replies cannot restore a closed Page or remove a newer Selection. Pausing or revoking permission stops capture. There is no automatic model call just because a page was captured.

## Sending and local display

The user's native Enter or send click may include the prepared excerpt and highlight in the ChatGPT draft. The extension does not call a private chat-generation API or automatically resend messages. Existing ChatGPT session cookies are used by the embedded website. Submitted references are ordinary ChatGPT message text, not OpenAI-native browser attachments; account/service settings apply to that submitted data.

Pending receipts and submitted text are kept briefly in the frame for local confirmation/presentation and are not persisted as extension chat history. Receipts expire without blocking later sends. Exact selection-version checks prevent a late acknowledgment from removing a newer highlight. An observed UI message is local evidence, not a server delivery guarantee.

A first-party presentation layer folds only locally generated reference messages into a question plus a disclosure. The ORIGINAL full included reference remains in the DOM and in the message sent to ChatGPT. Expanding reveals it. This is not deletion or redaction; other devices, shared chats, or native copy/export controls may expose the original reference. Pausing or clearing local context cannot remove data already submitted to ChatGPT.

## Embedding and permissions

The required permissions are `storage`, `tabs`, `sidePanel`, `scripting`, `declarativeNetRequestWithHostAccess`, `alarms`, and `notifications`. `alarms` schedules five-minute background forecast checks; `notifications` displays predictive system notifications and opens Overview on click. Predictions do not establish restored personal allowance. Required hosts are `https://chatgpt.com/*`, `https://codex.lunarwerx.com/*`, and `https://codex-reset.com/*`. Public requests omit account credentials; providers receive normal connection metadata such as IP address. Other HTTP(S) site access is optional (current site or all sites).

While at least one Side Chat panel is open, an existing session rule removes frame-blocking response headers from chatgpt.com sub-frame responses. It is scoped by destination and resource type, NOT by a single iframe initiator: other matching ChatGPT embeds can be affected while the panel is open. It does not alter top-level pages or unrelated domains. The rule is removed when the last panel closes. This scope remains unchanged.

## Usage

The existing usage core and export schema are unchanged. Usage events contain only a SHA-256-derived event identifier, timestamp and observed model/tier/effort metadata; no source text or reference is placed in the event. SakuraMeter now treats the actual outgoing ChatGPT user-message request ID as the primary counting signal. DOM/rendered-message receipts remain a fallback and use the same deterministic event ID, so the two paths deduplicate instead of double-counting. Missing request IDs do not prevent sending; the DOM fallback may still count the send when a stable rendered identity is available. Read-only account-usage refresh remains unchanged. Predictive notification behavior is described below.

## Test boundary

[UPDATE-3.6.0.62.md](UPDATE-3.6.0.62.md) records 71/71 Node tests and targeted fixture browser regressions passing; legacy full browser flows did not all pass. Real system notifications, permission/Do Not Disturb behavior and signed-in ChatGPT sessions still require human acceptance. Delivery depends on browser background activity and source updates. Reserving counts before delivery prevents duplicates but can miss a notification after interruption; rejected deliveries are not automatically retried. No real account or user/model message was used by the fixture tests.

## Context serialization

The extension uses XML-style reference boundaries in this order: Instruction → UserRequest → Selection → PageContext → PageMetadata. The original user request is preserved; Selection is the clearest reference target. Page uses the full current extracted excerpt within the capture limit, without relevance routing or cross-send page suppression. Reference data is XML-escaped. Internal storage remains unchanged. The visible context ID is random per send and is used locally to correlate the rendered user message; it contains no account identifier.


## Popup trend metadata
The popup now keeps a small local 7-day Codex remaining-percentage trend (timestamp, remaining percentage, reset timestamp) under `__gptLiveUsageTrendV1` so the mini sparkline reflects observed data rather than decoration. It contains no chat text or account identifier. Pro mini trend is derived from the existing local daily message counts.

## Pro model detection

For local Pro usage classification, SakuraMeter observes only model-related metadata from the outgoing ChatGPT send request (for example model/model_slug, model tier, and reasoning-effort fields). The observer runs locally in the page's main JavaScript world, does not block or alter the request, and does not send or persist request bodies or message text. The resolved model label/tier and a short source label may be stored with the local usage event. If request metadata is unavailable or ambiguous, SakuraMeter falls back to the visible composer model selector.

## Automatic Pro allowance learning

SakuraMeter now observes same-origin ChatGPT JSON responses for Pro allowance metadata when ChatGPT itself exposes it. The observer skips conversation/message endpoints and never forwards response bodies. Only normalized fields needed for usage display are sent to the extension service worker: allowance label/id, remaining/limit values, percentages, reset time, window length, source path, and timestamp.

If no such metadata is observed, SakuraMeter continues to store only confirmed local Pro send events and does not invent a remaining balance or reset time. Learned reset-cycle metadata is stored locally only after an explicit server window or a real refill/reset transition is observed. Manual corrections remain available only under Advanced settings.


## Tracker reliability

SakuraMeter may read the client-generated user message identifier attached to a ChatGPT send request so it can count that actual send without depending on the current button/composer DOM. The request observer does not export or persist message text, prompt content, attachments, or conversation bodies. The raw message identifier is kept only transiently in page memory; persistent usage storage contains SakuraMeter's SHA-256-derived event ID for deduplication.

## Predictive reset notifications

LunarWerx supplies public forecasts; codex-reset.com supplies confirmed global events. Standard: 24h ≥60% or 6h ≥30%; Low sensitivity: 24h ≥75% or 6h ≥45%. Three increasing snapshots from the same window must span at least ten minutes. Watch is display-only. One notification per cycle, plus at most one additional sustained raw 100% signal. Confirmed events only switch cycles and do not trigger notifications. Disable notifications or change sensitivity under Usage → Advanced. Thresholds are initial product parameters, not measured accuracy claims.

The background worker fetches public forecasts and confirmed events with credentials omitted and no referrer. No ChatGPT account tokens, usage history or page context are sent to these providers. Notification preferences, cycle identity, pending snapshot evidence, counts/levels/times, retry timestamps and delivery errors are stored locally for persistence and deduplication. Notifications contain 6h/24h probabilities and source, not chat text or account information.
