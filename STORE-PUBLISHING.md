# SakuraMeter store publishing

Release from `main`: update `manifest.json.version`, commit/push, then create the matching `v<version>` tag. `version_name` is display text; updating it is optional and it is not the release gate. A mismatched tag fails before building or contacting any store.

The tag workflow builds **one production ZIP**, uploads it once as an Actions artifact, verifies its SHA-256 and root manifest before creating the GitHub Release, then submits that same artifact to Chrome and Edge. Both store jobs wait for the GitHub Release and run independently (`fail-fast: false`). No staging workflow, automatic version changes, or tag creation is included.

## Repository settings

Paste values into [Actions Secrets](https://github.com/YinL-k/chatgpt-codex-usage-tracker/settings/secrets/actions) and [Actions Variables](https://github.com/YinL-k/chatgpt-codex-usage-tracker/settings/variables/actions). These are **repository** settings, not environment settings.

| Type | Name | Value / source |
| --- | --- | --- |
| Secret | `CHROME_SERVICE_ACCOUNT_JSON` | Complete service-account JSON key, including private key; multiline JSON is supported |
| Secret | `EDGE_API_KEY` | API key from Partner Center Publish API |
| Variable | `CHROME_PUBLISHER_ID` | Publisher > Settings in Chrome dashboard |
| Variable | `CHROME_EXTENSION_ID` | Existing Chrome item ID (32 letters) |
| Variable | `CHROME_STORE_PUBLISH_ENABLED` | `true` after Chrome setup; unset or `false` to disable |
| Variable | `EDGE_PRODUCT_ID` | Partner Center extension Product ID GUID, **not** the public Edge store extension ID |
| Variable | `EDGE_CLIENT_ID` | Client ID from Partner Center Publish API |
| Variable | `EDGE_STORE_PUBLISH_ENABLED` | `true` after Edge setup; unset or `false` to disable |

No personal GitHub token, OAuth client secret/refresh token, Edge tenant ID, or Edge access-token URL is needed. GitHub supplies its job-scoped `GITHUB_TOKEN` automatically; only the GitHub Release job has `contents: write`. ZIP path/version/hash are internal job values, not repository settings.

A disabled store skips without credentials or network calls. Enable values other than exactly `true`, `false`, or unset fail to catch typos. Once enabled, missing/invalid configuration, authentication errors, HTTP errors, malformed responses, unexpected states, checksum mismatches and polling timeouts **fail the job**. They are never converted to success or skip.

## One-time Chrome configuration

1. Select your project in [Chrome Web Store API](https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com) and enable it.
2. Open [Google Cloud service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts). Create a service account; no project role is needed solely for this setup. Open its **Keys > Add key > Create new key > JSON**. Copy the complete downloaded JSON directly into `CHROME_SERVICE_ACCOUNT_JSON`; never place it in this repository, an issue, or Actions logs.
3. Open [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Choose the publisher owning SakuraMeter; add the service-account email under **Account**. Copy **Publisher > Settings > Publisher ID** and the existing item's Extension ID into their variables.
4. Complete the item's listing/privacy/account requirements, including two-step verification. Existing visibility is retained. If visibility was changed in the dashboard, manually publish that visibility once before relying on the API.
5. Set `CHROME_STORE_PUBLISH_ENABLED=true` last.

Chrome uses an in-memory RS256 service-account JWT, the `chromewebstore` OAuth scope and `https://oauth2.googleapis.com/token`. Credentials, signed assertions, tokens and raw response bodies are never logged or written to disk.

## One-time Edge configuration

1. Open [Partner Center Edge overview](https://partner.microsoft.com/dashboard/microsoftedge/overview). Select the existing SakuraMeter product and copy **Extension identity > Product ID**.
2. Open **Microsoft Edge > Publish API** in Partner Center. If prompted, enable the new experience; choose **Create API credentials**. Copy its Client ID into `EDGE_CLIENT_ID` and API key into `EDGE_API_KEY`. Track and renew its expiry.
3. The API updates an already published product. Complete the first publication and any missing listing/privacy information manually in Partner Center before enabling automation.
4. Set `EDGE_STORE_PUBLISH_ENABLED=true` last.

Current v1.1 authentication uses `Authorization: ApiKey ...` plus `X-ClientID`. Endpoint paths still begin with **`/v1/products/`**, not `/v1.1/`. The upload sends ZIP bytes, requires HTTP 202 and a Location operation ID, then polls until `Succeeded`. Submission follows the same 202/operation-poll sequence. `Failed`, absent/unknown states and nonempty operation errors fail.

## API contracts and documentation discrepancies

Verified against official documentation and Chrome's live Discovery schema on **2026-10-07**:

- Chrome [upload](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload): `POST /upload/v2/publishers/{publisher}/items/{item}:upload`, ZIP body. Synchronous success must report the expected item and `crxVersion`.
- [UploadState enum](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/UploadState) and [Discovery schema](https://chromewebstore.googleapis.com/$discovery/rest?version=v2) define `IN_PROGRESS`, `SUCCEEDED`, `FAILED`, `NOT_FOUND`, `UPLOAD_STATE_UNSPECIFIED`. The upload guide's prose says `UPLOAD_IN_PROGRESS`, which is **not** an enum value. Tests use the enum/schema, not that prose.
- Asynchronous uploads poll [fetchStatus](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus)'s `lastAsyncUploadState`. That response does not expose a draft version; it cannot independently prove the uploaded draft's version. The local artifact hash/manifest checks remain mandatory.
- Chrome [publish](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish) uses `DEFAULT_PUBLISH`, `skipReview: false`, `blockOnWarnings: true`. Accepted states are `PENDING_REVIEW`, `PUBLISHED`, `PUBLISHED_TO_TESTERS`; `STAGED` fails because this workflow requests automatic publication after approval. Warnings block submission for dashboard resolution.
- Chrome [service account setup](https://developer.chrome.com/docs/webstore/service-accounts) and [JWT authentication](https://developers.google.com/identity/protocols/oauth2/service-account) describe the configured authentication flow.
- Edge [REST reference](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference) specifies **plain-text certification notes**. Its [overview](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api) instead describes JSON and even shows an invalid JSON example. This implementation follows the endpoint REST reference with `Content-Type: text/plain`; it does not invent a JSON schema. Real-account acceptance of this request remains part of the first authorized live release validation.

## Routine release and recovery

1. Change `manifest.json.version` and push the release-ready code to `main`.
2. Create/push the exactly matching tag, e.g. `v3.6.0.63`. This is an example only; this change does not create any tag or republish `v3.6.0.62`.
3. Observe [Actions](https://github.com/YinL-k/chatgpt-codex-usage-tracker/actions). Version components must satisfy Chrome's numeric format (one to four components, 0..65535, no leading zeros, not all zero).
4. The GitHub Release appears first; enabled stores then submit updates. Submission acceptance is **not** review approval or public availability.

The workflow has repository-wide release concurrency, with cancellation disabled for the running release, because each store has one mutable draft. Wait for the active release to finish before pushing another release tag; do not queue a batch of tags. Do not manually change the store draft while a release is running.

Requests have a 120-second deadline including body reading, redirects are rejected, and each asynchronous operation has at most 30 polls with 10-second delays. The store job has a 20-minute hard timeout. Mutating POSTs are never automatically retried: a timeout may happen after the server accepted the request.

If a submission fails, the GitHub Release and the other store may already have succeeded. Inspect the failed store's dashboard first. Fix credentials or draft/listing validation there, then rerun **only the failed job** while the original artifact is retained (30 days). Do not rerun a successful store or the whole release blindly. An existing same-version upload may require manual recovery; the workflow deliberately fails rather than pretending that a duplicate is a new successful submission. Never move an existing release tag to repaired source; release workflow changes apply to a new version and tag. If the original artifact has expired, recover manually from the verified GitHub Release ZIP rather than rebuilding a supposedly identical package.

## Credential-free checks

```sh
node --test tests/store-publish.test.mjs
python3 -B -m unittest discover -s tests -p 'test_release*.py'
bash -n .github/scripts/chrome-store-publish.sh .github/scripts/edge-store-publish.sh
```

`release-checks.yml` runs these checks on relevant main pushes and pull requests, with read-only permissions and no secrets. Tests cover JWT signature/claims, exact request contracts and uploaded bytes, synchronous/asynchronous success, failure states, missing settings, invalid responses, HTTP failures, polling limits, secret-safe errors, tag mismatch, ZIP contents and corruption. Packaging tests use temporary files and never publish.

For offline package verification, run `python3 .github/scripts/release-package.py build --tag v<manifest-version> --output <temporary-directory>`. This only writes a local ZIP; it does not create a Git tag or GitHub Release. The release workflow itself builds its production ZIP once; consumers only download and verify it.

Live OAuth exchange, publisher access, Edge API-key validity and actual review submission cannot be validated without the real store accounts/credentials. Configure the two secrets and six variables above, then validate those steps on the next intentional version/tag release.
