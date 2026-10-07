#!/usr/bin/env bash
set +x
set -euo pipefail
exec node "$(dirname "$0")/store-publish.mjs" edge
