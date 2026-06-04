#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLET_DIR="$SCRIPT_DIR/../atcinna@H234598"
HELPER="$APPLET_DIR/scripts/atcinna-catalog"
APPLET_JS="$APPLET_DIR/applet.js"
SETTINGS_SCHEMA="$APPLET_DIR/settings-schema.json"
METADATA_JSON="$APPLET_DIR/metadata.json"
TMP_DIR="$(mktemp -d)"
STATUS=0
export PYTHONPYCACHEPREFIX="$TMP_DIR/pycache"

require_command() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "ERROR: required command missing: $cmd"
        return 1
    fi
}

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

require_command jq || exit 1
require_command python3 || exit 1
require_command shellcheck || exit 1
require_command xz || exit 1
require_command rg || exit 1

if [ ! -x "$HELPER" ]; then
    echo "ERROR: helper is not executable: $HELPER"
    exit 1
fi

if [ ! -f "$APPLET_JS" ] || [ ! -f "$SETTINGS_SCHEMA" ] || [ ! -f "$METADATA_JSON" ]; then
    echo "ERROR: expected applet files missing"
    exit 1
fi

jq empty "$SETTINGS_SCHEMA" >/dev/null
jq empty "$METADATA_JSON" >/dev/null

if ! shellcheck "$SCRIPT_DIR/check.sh"; then
    echo "ERROR: shellcheck failed"
    STATUS=1
fi

for forbidden_pattern in \
    'imports\\.shell' \
    'imports\\.gi\\.Shell' \
    'imports\\.ui\\.main' \
    'importPackage.*java' \
    'from java\\.'; do
    if rg -q -e "$forbidden_pattern" "$APPLET_JS"; then
        echo "ERROR: forbidden import in applet.js: $forbidden_pattern"
        STATUS=1
    fi
done

if ! python3 -m py_compile "$HELPER"; then
    echo "ERROR: py_compile failed for helper"
    exit 1
fi

cat > "$TMP_DIR/audios.jsonl" <<'JSONL'
"Audios":["WDR","Genre","Thema","Kurzmeldung","2026-06-04","","","","Kurzbeschreibung","https://example.com/stream","https://example.com"]
"Audios":["","","","Zweite Kurzmeldung","2026-06-04","","","","Noch eine Kurzbeschreibung","https://example.com/second","https://example.com/second-page"]
JSONL

export XDG_CACHE_HOME="$TMP_DIR"
LZMA_FILE="$XDG_CACHE_HOME/atcinna@H234598/audios.xz"
mkdir -p "$(dirname "$LZMA_FILE")"
xz -z -c "$TMP_DIR/audios.jsonl" > "$LZMA_FILE"

SEARCH_JSON="$(python3 "$HELPER" search --query "Kurz" --max 1)"
if ! echo "$SEARCH_JSON" | jq -e '.status == "ok" and .count >= 1' >/dev/null; then
    echo "ERROR: search validation failed for fixture"
    echo "$SEARCH_JSON"
    exit 1
fi

if ! echo "$SEARCH_JSON" | jq -e '.results[0].title == "Kurzmeldung" and .results[0].sender == "WDR" and .results[0].url == "https://example.com/stream"' >/dev/null; then
    echo "ERROR: search result fields are not mapped correctly"
    echo "$SEARCH_JSON"
    exit 1
fi

INHERITED_JSON="$(python3 "$HELPER" search --query "Zweite" --max 1)"
if ! echo "$INHERITED_JSON" | jq -e '.status == "ok" and .count == 1 and .results[0].sender == "WDR" and .results[0].genre == "Genre" and .results[0].topic == "Thema" and .results[0].url == "https://example.com/second"' >/dev/null; then
    echo "ERROR: inherited catalog fields are not preserved"
    echo "$INHERITED_JSON"
    exit 1
fi

if python3 "$HELPER" download --url "not-a-url" --folder "$TMP_DIR" >"$TMP_DIR/download-invalid.out" 2>&1; then
    echo "ERROR: invalid URL download unexpectedly succeeded"
    exit 1
fi

if ! jq -e '.status == "error" and .message == "invalid URL scheme"' "$TMP_DIR/download-invalid.out" >/dev/null 2>&1; then
    echo "ERROR: invalid URL download did not return expected error JSON"
    cat "$TMP_DIR/download-invalid.out"
    exit 1
fi

if [ "$STATUS" -ne 0 ]; then
    exit "$STATUS"
fi

echo "check ok"
