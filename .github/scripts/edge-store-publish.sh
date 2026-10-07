#!/usr/bin/env bash
set -euo pipefail

: "${ZIP_PATH:?ZIP_PATH is required}"
: "${EDGE_PRODUCT_ID:?EDGE_PRODUCT_ID is required}"
: "${EDGE_CLIENT_ID:?EDGE_CLIENT_ID is required}"
: "${EDGE_API_KEY:?EDGE_API_KEY is required}"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "::error::Edge publish package not found: $ZIP_PATH"
  exit 1
fi

TMP_DIR="${RUNNER_TEMP:-/tmp}/sakurameter-edge-$$"
mkdir -p "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

API_ROOT="https://api.addons.microsoftedge.microsoft.com/v1/products/${EDGE_PRODUCT_ID}/submissions"
AUTH_HEADERS=(-H "Authorization: ApiKey $EDGE_API_KEY" -H "X-ClientID: $EDGE_CLIENT_ID")

json_field() {
  local file="$1"
  local field="$2"
  python3 - "$file" "$field" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)
value = data.get(sys.argv[2], "")
if isinstance(value, (dict, list)):
    print(json.dumps(value, separators=(",", ":")))
else:
    print(value)
PY
}

poll_operation() {
  local url="$1"
  local label="$2"
  local response="$TMP_DIR/${label// /-}-status.json"
  for attempt in $(seq 1 30); do
    HTTP="$(curl --silent --show-error --output "$response" --write-out '%{http_code}' \
      "${AUTH_HEADERS[@]}" \
      "$url")"
    if [[ "$HTTP" != 2* ]]; then
      echo "::error::Edge $label status check failed with HTTP $HTTP"
      exit 1
    fi
    STATUS="$(json_field "$response" status)"
    ERROR_CODE="$(json_field "$response" errorCode)"
    echo "Edge $label status attempt $attempt: ${STATUS:-unknown}${ERROR_CODE:+ ($ERROR_CODE)}"
    case "$STATUS" in
      Succeeded) return 0 ;;
      Failed)
        echo "::error::Edge $label failed${ERROR_CODE:+: $ERROR_CODE}"
        exit 1
        ;;
      InProgress) ;;
      *)
        echo "::error::Unexpected Edge $label status: ${STATUS:-empty}"
        exit 1
        ;;
    esac
    if [[ "$attempt" -eq 30 ]]; then
      echo "::error::Edge $label did not finish within 5 minutes"
      exit 1
    fi
    sleep 10
  done
}

UPLOAD_HEADERS="$TMP_DIR/upload-headers.txt"
UPLOAD_BODY="$TMP_DIR/upload-body.txt"
UPLOAD_HTTP="$(curl --silent --show-error --dump-header "$UPLOAD_HEADERS" --output "$UPLOAD_BODY" --write-out '%{http_code}' \
  "${AUTH_HEADERS[@]}" \
  -H 'Content-Type: application/zip' \
  -X POST \
  --data-binary "@$ZIP_PATH" \
  "$API_ROOT/draft/package")"
if [[ "$UPLOAD_HTTP" != "202" ]]; then
  echo "::error::Edge Add-ons upload failed with HTTP $UPLOAD_HTTP"
  exit 1
fi
UPLOAD_OPERATION_ID="$(awk 'BEGIN{IGNORECASE=1} /^Location:/ {gsub("\r", "", $2); print $2; exit}' "$UPLOAD_HEADERS")"
if [[ -z "$UPLOAD_OPERATION_ID" ]]; then
  echo "::error::Edge Add-ons upload response did not include a Location operation ID"
  exit 1
fi
echo "Edge Add-ons upload accepted: operation=$UPLOAD_OPERATION_ID"
poll_operation "$API_ROOT/draft/package/operations/$UPLOAD_OPERATION_ID" "package upload"

PUBLISH_HEADERS="$TMP_DIR/publish-headers.txt"
PUBLISH_BODY="$TMP_DIR/publish-body.txt"
PUBLISH_NOTES="Automated SakuraMeter release from GitHub tag ${GITHUB_REF_NAME:-unknown}."
PUBLISH_JSON="$(PUBLISH_NOTES="$PUBLISH_NOTES" python3 <<'PY'
import json, os
print(json.dumps({"notes": os.environ["PUBLISH_NOTES"]}, separators=(",", ":")))
PY
)"
PUBLISH_HTTP="$(curl --silent --show-error --dump-header "$PUBLISH_HEADERS" --output "$PUBLISH_BODY" --write-out '%{http_code}' \
  "${AUTH_HEADERS[@]}" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d "$PUBLISH_JSON" \
  "$API_ROOT")"
if [[ "$PUBLISH_HTTP" != "202" ]]; then
  echo "::error::Edge Add-ons publish failed with HTTP $PUBLISH_HTTP"
  exit 1
fi
PUBLISH_OPERATION_ID="$(awk 'BEGIN{IGNORECASE=1} /^Location:/ {gsub("\r", "", $2); print $2; exit}' "$PUBLISH_HEADERS")"
if [[ -z "$PUBLISH_OPERATION_ID" ]]; then
  echo "::error::Edge Add-ons publish response did not include a Location operation ID"
  exit 1
fi
echo "Edge Add-ons submission accepted: operation=$PUBLISH_OPERATION_ID"
poll_operation "$API_ROOT/operations/$PUBLISH_OPERATION_ID" "publish"
