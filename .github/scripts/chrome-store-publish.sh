#!/usr/bin/env bash
set -euo pipefail

: "${ZIP_PATH:?ZIP_PATH is required}"
: "${CHROME_PUBLISHER_ID:?CHROME_PUBLISHER_ID is required}"
: "${CHROME_EXTENSION_ID:?CHROME_EXTENSION_ID is required}"
: "${CHROME_SERVICE_ACCOUNT_JSON:?CHROME_SERVICE_ACCOUNT_JSON is required}"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "::error::Chrome publish package not found: $ZIP_PATH"
  exit 1
fi

umask 077
TMP_DIR="${RUNNER_TEMP:-/tmp}/sakurameter-chrome-$$"
mkdir -p "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT
KEY_FILE="$TMP_DIR/service-account-key.pem"

export KEY_FILE
CLIENT_EMAIL="$(python3 <<'PY'
import json, os
creds = json.loads(os.environ["CHROME_SERVICE_ACCOUNT_JSON"])
email = creds.get("client_email")
private_key = creds.get("private_key")
if not email or not private_key:
    raise SystemExit("service account JSON must contain client_email and private_key")
with open(os.environ["KEY_FILE"], "w", encoding="utf-8") as fh:
    fh.write(private_key)
print(email)
PY
)"

base64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

NOW="$(date +%s)"
EXP="$((NOW + 3600))"
HEADER="$(printf '%s' '{"alg":"RS256","typ":"JWT"}' | base64url)"
PAYLOAD="$(CLIENT_EMAIL="$CLIENT_EMAIL" NOW="$NOW" EXP="$EXP" python3 <<'PY' | base64url
import json, os
payload = {
    "iss": os.environ["CLIENT_EMAIL"],
    "scope": "https://www.googleapis.com/auth/chromewebstore",
    "aud": "https://oauth2.googleapis.com/token",
    "iat": int(os.environ["NOW"]),
    "exp": int(os.environ["EXP"]),
}
print(json.dumps(payload, separators=(",", ":")), end="")
PY
)"
UNSIGNED_JWT="$HEADER.$PAYLOAD"
SIGNATURE="$(printf '%s' "$UNSIGNED_JWT" | openssl dgst -sha256 -sign "$KEY_FILE" | base64url)"
JWT="$UNSIGNED_JWT.$SIGNATURE"

TOKEN_RESPONSE="$TMP_DIR/token.json"
TOKEN_HTTP="$(curl --silent --show-error --output "$TOKEN_RESPONSE" --write-out '%{http_code}' \
  -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer' \
  --data-urlencode "assertion=$JWT" \
  'https://oauth2.googleapis.com/token')"
if [[ "$TOKEN_HTTP" != 2* ]]; then
  echo "::error::Chrome service-account token exchange failed with HTTP $TOKEN_HTTP"
  exit 1
fi
ACCESS_TOKEN="$(python3 - "$TOKEN_RESPONSE" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)
token = data.get("access_token")
if not token:
    raise SystemExit("token response did not contain access_token")
print(token)
PY
)"
echo "::add-mask::$ACCESS_TOKEN"

API_ROOT="https://chromewebstore.googleapis.com"
ITEM_PATH="publishers/${CHROME_PUBLISHER_ID}/items/${CHROME_EXTENSION_ID}"

safe_json_field() {
  local file="$1"
  local field="$2"
  python3 - "$file" "$field" <<'PY'
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        data = json.load(fh)
except Exception:
    print("")
    raise SystemExit(0)
value = data.get(sys.argv[2], "")
if isinstance(value, (dict, list)):
    print(json.dumps(value, separators=(",", ":")))
else:
    print(value)
PY
}

UPLOAD_RESPONSE="$TMP_DIR/upload.json"
UPLOAD_HTTP="$(curl --silent --show-error --output "$UPLOAD_RESPONSE" --write-out '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/zip' \
  --data-binary "@$ZIP_PATH" \
  "$API_ROOT/upload/v2/$ITEM_PATH:upload")"
if [[ "$UPLOAD_HTTP" != 2* ]]; then
  echo "::error::Chrome Web Store upload failed with HTTP $UPLOAD_HTTP"
  exit 1
fi
UPLOAD_STATE="$(safe_json_field "$UPLOAD_RESPONSE" uploadState)"
echo "Chrome Web Store upload accepted: HTTP $UPLOAD_HTTP, state=${UPLOAD_STATE:-unknown}"

if [[ "$UPLOAD_STATE" == "IN_PROGRESS" ]]; then
  STATUS_RESPONSE="$TMP_DIR/status.json"
  for attempt in $(seq 1 30); do
    sleep 10
    STATUS_HTTP="$(curl --silent --show-error --output "$STATUS_RESPONSE" --write-out '%{http_code}' \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      "$API_ROOT/v2/$ITEM_PATH:fetchStatus")"
    if [[ "$STATUS_HTTP" != 2* ]]; then
      echo "::error::Chrome Web Store fetchStatus failed with HTTP $STATUS_HTTP"
      exit 1
    fi
    UPLOAD_STATE="$(safe_json_field "$STATUS_RESPONSE" lastAsyncUploadState)"
    echo "Chrome upload status attempt $attempt: ${UPLOAD_STATE:-unknown}"
    case "$UPLOAD_STATE" in
      SUCCEEDED) break ;;
      FAILED|NOT_FOUND|UPLOAD_STATE_UNSPECIFIED)
        echo "::error::Chrome Web Store upload did not succeed: $UPLOAD_STATE"
        exit 1
        ;;
      IN_PROGRESS) ;;
      *)
        echo "::error::Unexpected Chrome Web Store upload state: ${UPLOAD_STATE:-empty}"
        exit 1
        ;;
    esac
    if [[ "$attempt" -eq 30 ]]; then
      echo "::error::Chrome Web Store upload did not finish within 5 minutes"
      exit 1
    fi
  done
elif [[ "$UPLOAD_STATE" != "SUCCEEDED" ]]; then
  echo "::error::Unexpected Chrome Web Store upload state: ${UPLOAD_STATE:-empty}"
  exit 1
fi

PUBLISH_RESPONSE="$TMP_DIR/publish.json"
PUBLISH_HTTP="$(curl --silent --show-error --output "$PUBLISH_RESPONSE" --write-out '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"publishType":"DEFAULT_PUBLISH","skipReview":false,"blockOnWarnings":false}' \
  "$API_ROOT/v2/$ITEM_PATH:publish")"
if [[ "$PUBLISH_HTTP" != 2* ]]; then
  echo "::error::Chrome Web Store publish failed with HTTP $PUBLISH_HTTP"
  exit 1
fi
PUBLISH_STATE="$(safe_json_field "$PUBLISH_RESPONSE" state)"
ITEM_ID="$(safe_json_field "$PUBLISH_RESPONSE" itemId)"
echo "Chrome Web Store submission accepted: item=${ITEM_ID:-$CHROME_EXTENSION_ID}, state=${PUBLISH_STATE:-unknown}"
case "$PUBLISH_STATE" in
  PENDING_REVIEW|STAGED|PUBLISHED|PUBLISHED_TO_TESTERS) ;;
  REJECTED|CANCELLED|ITEM_STATE_UNSPECIFIED|"")
    echo "::error::Chrome Web Store returned non-success submission state: ${PUBLISH_STATE:-empty}"
    exit 1
    ;;
  *)
    echo "::error::Unexpected Chrome Web Store submission state: $PUBLISH_STATE"
    exit 1
    ;;
esac
