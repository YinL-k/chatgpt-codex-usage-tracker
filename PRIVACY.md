# SakuraMeter 3.6.0.62 - Privacy and behavior

Side Chat is optional and separate from the existing local usage tracker. There is no added developer backend, telemetry or model proxy.

## Page and highlight capture

Only while a panel is open, enabled and the active site is authorized, first-party content scripts read selected visible text and a compact main-page excerpt. The extractor excludes common navigation/sidebars, hidden nodes, form controls and editable fields. It does not inspect cookie stores, input .value properties, passwords, JavaScript variables, or hidden documents. Sensitive information that is displayed as ordinary readable page text can still be included; review the chip preview or pause capture for sensitive sites.

Page excerpts are capped at 12,000 characters; the background excerpt is capped at 6,000 when accompanied by a highlight. Explicit highlights may be up to 16,000 characters and expire after 15 minutes. Excerpts include sanitized source title/URL (query, fragment and URL credentials removed), tab/window metadata and capture metadata. Content fingerprints are local dedupe identifiers, not authentication or encryption.

Context stays in extension RAM/chrome.storage.session and is not added to usage history, local persistent usage storage, activity exports or telemetry. Closing a panel clears that window's captured context. Browser/session shutdown clears session storage. Pausing or revoking permission stops capture. There is no automatic model call just because a page was captured.

## Sending and local display

The user's native Enter or send click may include the prepared excerpt and highlight in the ChatGPT draft. The extension does not call a private chat-generation API or automatically resend messages. Existing ChatGPT session cookies are used by the embedded website. Submitted references are ordinary ChatGPT message text, not OpenAI-native browser attachments; account/service settings apply to that submitted data.

Pending receipts and submitted text are kept briefly in the frame for local confirmation/presentation and are not persisted as extension chat history. Receipts expire without blocking later sends. Exact selection-version checks prevent a late acknowledgment from removing a newer highlight. An observed UI message is local evidence, not a server delivery guarantee.

A first-party presentation layer folds only locally generated reference messages into a question plus a disclosure. The ORIGINAL full included reference remains in the DOM and in the message sent to ChatGPT. Expanding reveals it. This is not deletion or redaction; other devices, shared chats, or native copy/export controls may expose the original reference. Pausing or clearing local context cannot remove data already submitted to ChatGPT.

## Embedding and permissions

The required permissions are: storage, tabs, sidePanel, scripting, declarativeNetRequestWithHostAccess, alarms, notifications, and the ChatGPT host. Other HTTP(S) site access is optional (current site or all sites). `alarms` schedules background reset-forecast checks. `notifications` displays browser/OS alerts only when the configured reset-notification logic decides to notify; disabling reset notifications prevents those alerts but does not remove the manifest permission.

While at least one Side Chat panel is open, an existing session rule removes frame-blocking response headers from chatgpt.com sub-frame responses. It is scoped by destination and resource type, NOT by a single iframe initiator: other matching ChatGPT embeds can be affected while the panel is open. It does not alter top-level pages or unrelated domains. The rule is removed when the last panel closes. This scope remains unchanged.

## Usage

The existing usage core and export schema are unchanged. Usage events contain only a SHA-256-derived event identifier, timestamp and observed model/tier/effort metadata; no source text or reference is placed in the event. SakuraMeter now treats the actual outgoing ChatGPT user-message request ID as the primary counting signal. DOM/rendered-message receipts remain a fallback and use the same deterministic event ID, so the two paths deduplicate instead of double-counting. Missing request IDs do not prevent sending; the DOM fallback may still count the send when a stable rendered identity is available. The original read-only account-usage refresh and public reset forecast behavior remain unchanged.

## Test boundary

Automated verification for 3.6.0.62 includes 71/71 Node unit/background-integration tests and dedicated browser regressions using local pages, fixtures, and simulated Chrome APIs. No real account was used by those tests and no real user/model message was sent. Real logged-in ChatGPT session behavior and actual browser/operating-system notification display still require human acceptance and have not been claimed as verified.

## Context serialization

The extension keeps XML-style model-facing boundaries and uses context ordering/selection emphasis: an explicit highlight is sent first as the primary focus, while page text is reduced to supporting background around that highlight. Internal storage remains unchanged. The visible context ID is random per send and is used locally to correlate the rendered user message; it contains no account identifier.


## Popup trend metadata
The popup now keeps a small local 7-day Codex remaining-percentage trend (timestamp, remaining percentage, reset timestamp) under `__gptLiveUsageTrendV1` so the mini sparkline reflects observed data rather than decoration. It contains no chat text or account identifier. Pro mini trend is derived from the existing local daily message counts.

## Pro model detection

For local Pro usage classification, SakuraMeter observes only model-related metadata from the outgoing ChatGPT send request (for example model/model_slug, model tier, and reasoning-effort fields). The observer runs locally in the page's main JavaScript world, does not block or alter the request, and does not send or persist request bodies or message text. The resolved model label/tier and a short source label may be stored with the local usage event. If request metadata is unavailable or ambiguous, SakuraMeter falls back to the visible composer model selector.

## Automatic Pro allowance learning

SakuraMeter now observes same-origin ChatGPT JSON responses for Pro allowance metadata when ChatGPT itself exposes it. The observer skips conversation/message endpoints and never forwards response bodies. Only normalized fields needed for usage display are sent to the extension service worker: allowance label/id, remaining/limit values, percentages, reset time, window length, source path, and timestamp.

If no such metadata is observed, SakuraMeter continues to store only confirmed local Pro send events and does not invent a remaining balance or reset time. Learned reset-cycle metadata is stored locally only after an explicit server window or a real refill/reset transition is observed. Manual corrections remain available only under Advanced settings.


## Tracker reliability

SakuraMeter may read the client-generated user message identifier attached to a ChatGPT send request so it can count that actual send without depending on the current button/composer DOM. The request observer does not export or persist message text, prompt content, attachments, or conversation bodies. The raw message identifier is kept only transiently in page memory; persistent usage storage contains SakuraMeter's SHA-256-derived event ID for deduplication.