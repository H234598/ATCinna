#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLET_DIR="$SCRIPT_DIR/../atcinna@H234598"
APPLET_UUID="atcinna@H234598"
HELPER="$APPLET_DIR/scripts/atcinna-catalog"
SEARCH_DIALOG="$APPLET_DIR/scripts/atcinna-search-dialog"
APPLET_JS="$APPLET_DIR/applet.js"
SETTINGS_SCHEMA="$APPLET_DIR/settings-schema.json"
METADATA_JSON="$APPLET_DIR/metadata.json"
VERSION_FILE="$SCRIPT_DIR/../VERSION"
TMP_DIR="$(mktemp -d)"
STATUS=0
SKIP_SELF_INSTALL=0
export PYTHONPYCACHEPREFIX="$TMP_DIR/pycache"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-self-install)
            SKIP_SELF_INSTALL=1
            shift
            ;;
        *)
            echo "Usage: $(basename "$0") [--skip-self-install]"
            exit 1
            ;;
    esac
done

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
require_command node || exit 1
require_command rsync || exit 1
require_command tar || exit 1

if [ ! -x "$HELPER" ]; then
    echo "ERROR: helper is not executable: $HELPER"
    exit 1
fi
if [ ! -x "$SEARCH_DIALOG" ]; then
    echo "ERROR: search dialog is not executable: $SEARCH_DIALOG"
    exit 1
fi

if [ ! -f "$APPLET_JS" ] || [ ! -f "$SETTINGS_SCHEMA" ] || [ ! -f "$METADATA_JSON" ]; then
    echo "ERROR: expected applet files missing"
    exit 1
fi
if [ ! -f "$VERSION_FILE" ]; then
    echo "ERROR: VERSION file missing"
    exit 1
fi

jq empty "$SETTINGS_SCHEMA" >/dev/null
jq empty "$METADATA_JSON" >/dev/null

if ! shellcheck "$SCRIPT_DIR/check.sh"; then
    echo "ERROR: shellcheck failed"
    STATUS=1
fi

for script_file in \
    "$SCRIPT_DIR/install-local.sh" \
    "$SCRIPT_DIR/package.sh" \
    "$SCRIPT_DIR/runtime-smoke.sh" \
    "$SCRIPT_DIR/validate-installed.sh"; do
    if [ -f "$script_file" ]; then
        if ! shellcheck "$script_file"; then
            echo "ERROR: shellcheck failed for ${script_file}"
            STATUS=1
        fi
    fi
done

for forbidden_pattern in \
    'ExtensionUtils' \
    'PanelMenu' \
    'imports\\.misc\\.extensionUtils' \
    'imports\\.ui\\.panelMenu' \
    'imports\\.shell' \
    'imports\\.gi\\.Shell' \
    'importPackage.*java' \
    'from java\\.'; do
    if rg -q -e "$forbidden_pattern" "$APPLET_JS"; then
        echo "ERROR: forbidden import in applet.js: $forbidden_pattern"
        STATUS=1
    fi
done

node --check "$APPLET_JS" >/dev/null

if ! python3 -m py_compile "$HELPER"; then
    echo "ERROR: py_compile failed for helper"
    exit 1
fi
if ! python3 -m py_compile "$SEARCH_DIALOG"; then
    echo "ERROR: py_compile failed for search dialog"
    exit 1
fi

export XDG_DATA_HOME="$TMP_DIR/data"

cat > "$TMP_DIR/audios.jsonl" <<'JSONL'
"Audios":["WDR","Genre","Thema","Kurzmeldung","2026-06-04","","","","Kurzbeschreibung","https://example.com/stream","https://example.com"]
"Audios":["","","","Zweite Kurzmeldung","2026-06-04","","","","Noch eine Kurzbeschreibung","https://example.com/second","https://example.com/second-page"]
"Audios":["","", "","Gefährlich","2026-06-04","","","","Unsichere URL","file://evil/audio.mp3","https://example.com/file"]
"Audios":["","", "","Ungültige Website","2026-06-04","","","","Website ist kaputt","https://example.com/valid-audio","javascript://alert('x')"]
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

SEARCH_DIALOG_SELF_TEST="$(python3 "$SEARCH_DIALOG" --self-test)"
if ! echo "$SEARCH_DIALOG_SELF_TEST" | jq -e '.status == "ok" and (.gtk3 | type == "boolean")' >/dev/null; then
    echo "ERROR: search dialog self-test failed"
    echo "$SEARCH_DIALOG_SELF_TEST"
    exit 1
fi

if ! echo "$SEARCH_JSON" | jq -e '.results[0].title == "Kurzmeldung" and .results[0].sender == "WDR" and .results[0].url == "https://example.com/stream"' >/dev/null; then
    echo "ERROR: search result fields are not mapped correctly"
    echo "$SEARCH_JSON"
    exit 1
fi

SEARCH_BROAD_JSON="$(python3 "$HELPER" search --query "")"
if ! echo "$SEARCH_BROAD_JSON" | jq -e '.status == "ok" and .count == 3 and .results[0].title == "Kurzmeldung" and .results[1].title == "Zweite Kurzmeldung" and .results[2].title == "Ungültige Website"' >/dev/null; then
    echo "ERROR: search without filters is not returning expected baseline results"
    echo "$SEARCH_BROAD_JSON"
    exit 1
fi

if ! echo "$SEARCH_BROAD_JSON" | jq -e '.results | map(select(.title=="Gefährlich" or (.url | startswith("file://")))) | length == 0' >/dev/null; then
    echo "ERROR: search should skip non-http(s) audio URLs"
    echo "$SEARCH_BROAD_JSON"
    exit 1
fi

SEARCH_WEB_SANITIZED="$(python3 "$HELPER" search --query "Ungültige" --max 1)"
if ! echo "$SEARCH_WEB_SANITIZED" | jq -e '.status == "ok" and .count == 1 and .results[0].title == "Ungültige Website" and .results[0].website == ""' >/dev/null; then
    echo "ERROR: invalid website in search results should be sanitized to empty string"
    echo "$SEARCH_WEB_SANITIZED"
    exit 1
fi

INHERITED_JSON="$(python3 "$HELPER" search --query "Zweite" --max 1)"
if ! echo "$INHERITED_JSON" | jq -e '.status == "ok" and .count == 1 and .results[0].sender == "WDR" and .results[0].genre == "Genre" and .results[0].topic == "Thema" and .results[0].url == "https://example.com/second"' >/dev/null; then
    echo "ERROR: inherited catalog fields are not preserved"
    echo "$INHERITED_JSON"
    exit 1
fi

SEARCH_FILTER_SENDER="$(python3 "$HELPER" search --query "Zweite" --sender "wdr")"
if ! echo "$SEARCH_FILTER_SENDER" | jq -e '.status == "ok" and .count == 1 and .results[0].url == "https://example.com/second"' >/dev/null; then
    echo "ERROR: sender filter does not match inherited sender case-insensitively"
    echo "$SEARCH_FILTER_SENDER"
    exit 1
fi

SEARCH_FILTER_GENRE="$(python3 "$HELPER" search --query "Zweite" --genre "enr")"
if ! echo "$SEARCH_FILTER_GENRE" | jq -e '.status == "ok" and .count == 1 and .results[0].url == "https://example.com/second"' >/dev/null; then
    echo "ERROR: genre filter does not match inherited genre case-insensitively by substring"
    echo "$SEARCH_FILTER_GENRE"
    exit 1
fi

SEARCH_FILTER_TOPIC="$(python3 "$HELPER" search --query "Zweite" --topic "HEM")"
if ! echo "$SEARCH_FILTER_TOPIC" | jq -e '.status == "ok" and .count == 1 and .results[0].url == "https://example.com/second"' >/dev/null; then
    echo "ERROR: topic filter does not match inherited topic case-insensitively by substring"
    echo "$SEARCH_FILTER_TOPIC"
    exit 1
fi

SEARCH_FILTER_NO_MATCH="$(python3 "$HELPER" search --query "Kurz" --sender "NDR")"
if ! echo "$SEARCH_FILTER_NO_MATCH" | jq -e '.status == "ok" and .count == 0' >/dev/null; then
    echo "ERROR: non-matching sender filter should produce zero results"
    echo "$SEARCH_FILTER_NO_MATCH"
    exit 1
fi

SEARCH_COMBINED="$(python3 "$HELPER" search --query "Zweite" --sender "WD" --genre "enr" --topic "hem" --max 10)"
if ! echo "$SEARCH_COMBINED" | jq -e '.status == "ok" and .count == 1 and .results[0].url == "https://example.com/second"' >/dev/null; then
    echo "ERROR: query+filter combination is not working"
    echo "$SEARCH_COMBINED"
    exit 1
fi

HISTORY_ADD_1="$(python3 "$HELPER" history-add --title "Alpha" --sender "S1" --genre "G1" --topic "T1" --url "https://example.com/item/1" --website "https://www.example.com")"
if ! echo "$HISTORY_ADD_1" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: history-add failed"
    echo "$HISTORY_ADD_1"
    exit 1
fi
HISTORY_ADD_2="$(python3 "$HELPER" history-add --title "Alpha updated" --sender "S1" --genre "G1" --topic "T1" --url "https://example.com/item/1" --website "https://www.example.com")"
if ! echo "$HISTORY_ADD_2" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: history-add dedupe update failed"
    echo "$HISTORY_ADD_2"
    exit 1
fi
HISTORY_LIST="$(python3 "$HELPER" history-list)"
if ! echo "$HISTORY_LIST" | jq -e '.status == "ok" and .count == 1 and .results[0].title == "Alpha updated"' >/dev/null; then
    echo "ERROR: history-list unexpected result/dedupe"
    echo "$HISTORY_LIST"
    exit 1
fi

python3 - <<'PY'
import json
import os
from pathlib import Path

data_dir = Path(os.environ["XDG_DATA_HOME"]) / "atcinna@H234598"
data_dir.mkdir(parents=True, exist_ok=True)
items = [
    {
        "title": f"Item {i}",
        "sender": "",
        "genre": "",
        "topic": "",
        "url": f"https://example.com/history/{i}",
        "website": "",
        "timestamp": i,
    }
    for i in range(1, 101)
]
(data_dir / "history.json").write_text(json.dumps(items), encoding="utf-8")
PY
python3 "$HELPER" history-add --title "Newest" --url "https://example.com/history/newest" >/dev/null
HISTORY_LIST="$(python3 "$HELPER" history-list)"
if ! echo "$HISTORY_LIST" | jq -e '.count == 100' >/dev/null; then
    echo "ERROR: history limit not enforced at 100"
    echo "$HISTORY_LIST"
    exit 1
fi
if ! echo "$HISTORY_LIST" | jq -e '.results[0].url == "https://example.com/history/newest"' >/dev/null; then
    echo "ERROR: history newest-first ordering not enforced"
    echo "$HISTORY_LIST"
    exit 1
fi
if ! echo "$HISTORY_LIST" | jq -e '[.results[] | select(.url=="https://example.com/history/100")] | length == 0' >/dev/null; then
    echo "ERROR: history limit did not drop the oldest entry"
    echo "$HISTORY_LIST"
    exit 1
fi

BOOKMARK_ADD_1="$(python3 "$HELPER" bookmark-add --title "B1" --url "https://example.com/bookmark/1" --website "https://www.example.com")"
if ! echo "$BOOKMARK_ADD_1" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: bookmark-add failed"
    echo "$BOOKMARK_ADD_1"
    exit 1
fi
BOOKMARK_ADD_2="$(python3 "$HELPER" bookmark-add --title "B2" --url "https://example.com/bookmark/2")"
if ! echo "$BOOKMARK_ADD_2" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: bookmark-add failed"
    echo "$BOOKMARK_ADD_2"
    exit 1
fi
python3 - <<'PY'
import json
import os
from pathlib import Path

data_dir = Path(os.environ["XDG_DATA_HOME"]) / "atcinna@H234598"
data_dir.mkdir(parents=True, exist_ok=True)
items = [
    {
        "title": f"B {i}",
        "sender": "",
        "genre": "",
        "topic": "",
        "url": f"https://example.com/bookmark/{i}",
        "website": "",
        "timestamp": i,
    }
    for i in range(1, 501)
]
(data_dir / "bookmarks.json").write_text(json.dumps(items), encoding="utf-8")
PY
python3 "$HELPER" bookmark-add --title "Newest Bookmark" --url "https://example.com/bookmark/newest" >/dev/null
BOOKMARK_LIST="$(python3 "$HELPER" bookmark-list)"
if ! echo "$BOOKMARK_LIST" | jq -e '.count == 500' >/dev/null; then
    echo "ERROR: bookmark limit not enforced at 500"
    echo "$BOOKMARK_LIST"
    exit 1
fi
if ! echo "$BOOKMARK_LIST" | jq -e '.results[0].url == "https://example.com/bookmark/newest"' >/dev/null; then
    echo "ERROR: bookmark newest-first ordering not enforced"
    echo "$BOOKMARK_LIST"
    exit 1
fi
if ! echo "$BOOKMARK_LIST" | jq -e '[.results[] | select(.url=="https://example.com/bookmark/500")] | length == 0' >/dev/null; then
    echo "ERROR: bookmark limit did not drop the oldest entry"
    echo "$BOOKMARK_LIST"
    exit 1
fi

BOOKMARK_DEDUPE="$(python3 "$HELPER" bookmark-add --title "B2 fresh" --url "https://example.com/bookmark/2")"
if ! echo "$BOOKMARK_DEDUPE" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: bookmark add dedupe update failed"
    echo "$BOOKMARK_DEDUPE"
    exit 1
fi
BOOKMARK_LIST="$(python3 "$HELPER" bookmark-list)"
if ! echo "$BOOKMARK_LIST" | jq -e '.results | map(select(.url=="https://example.com/bookmark/2")) | length == 1 and .[0].title == "B2 fresh"' >/dev/null; then
    echo "ERROR: bookmark remove/dedupe behavior not as expected"
    echo "$BOOKMARK_LIST"
    exit 1
fi

BOOKMARK_REMOVE_TRUE="$(python3 "$HELPER" bookmark-remove --url "https://example.com/bookmark/2")"
if ! echo "$BOOKMARK_REMOVE_TRUE" | jq -e '.status == "ok" and .removed == true' >/dev/null; then
    echo "ERROR: bookmark-remove should remove existing entry"
    echo "$BOOKMARK_REMOVE_TRUE"
    exit 1
fi
if ! jq -e '.results | map(select(.url=="https://example.com/bookmark/2")) | length == 0' <<<"$(python3 "$HELPER" bookmark-list)" >/dev/null; then
    echo "ERROR: bookmark still present after remove"
    exit 1
fi

BOOKMARK_REMOVE_FALSE="$(python3 "$HELPER" bookmark-remove --url "https://example.com/bookmark/missing")"
if ! echo "$BOOKMARK_REMOVE_FALSE" | jq -e '.status == "ok" and .removed == false' >/dev/null; then
    echo "ERROR: bookmark-remove should not report removed for missing URL"
    echo "$BOOKMARK_REMOVE_FALSE"
    exit 1
fi

if ! python3 "$HELPER" bookmark-add --title "Bad" --url "notaurl" >"$TMP_DIR/atcinna_invalid_helper.out" 2>&1; then
    if ! jq -e '.status=="error" and .message=="invalid URL scheme"' "$TMP_DIR/atcinna_invalid_helper.out" >/dev/null 2>&1; then
        echo "ERROR: invalid URL in bookmark-add did not fail as expected"
        cat "$TMP_DIR/atcinna_invalid_helper.out"
        exit 1
    fi
else
    echo "ERROR: bookmark-add invalid URL unexpectedly succeeded"
    exit 1
fi

if [ -f "$XDG_DATA_HOME/atcinna@H234598/history.json" ]; then
    printf '{bad json' > "$XDG_DATA_HOME/atcinna@H234598/history.json"
fi
CORRUPT_HISTORY="$(python3 "$HELPER" history-list)"
if ! echo "$CORRUPT_HISTORY" | jq -e '.status == "ok" and .count == 0' >/dev/null; then
    echo "ERROR: corrupted history.json should fail-closed to empty list"
    echo "$CORRUPT_HISTORY"
    exit 1
fi

for i in $(seq 1 20); do
    python3 "$HELPER" history-add --title "Parallel $i" --url "https://example.com/parallel/$i" >/dev/null &
done
wait
PARALLEL_HISTORY="$(python3 "$HELPER" history-list)"
if ! echo "$PARALLEL_HISTORY" | jq -e '[.results[] | select(.url | startswith("https://example.com/parallel/"))] | length == 20' >/dev/null; then
    echo "ERROR: parallel history writes lost entries"
    echo "$PARALLEL_HISTORY"
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

if [ "$STATUS" -eq 0 ] && [ "$SKIP_SELF_INSTALL" -eq 0 ]; then
    PACKAGE_VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
    if [[ -z "$PACKAGE_VERSION" ]]; then
        echo "ERROR: VERSION is empty"
        exit 1
    fi
    if ! "$SCRIPT_DIR/install-local.sh" --target-dir "$TMP_DIR"; then
        echo "ERROR: install-local --target-dir \"$TMP_DIR\" failed during self-test"
        exit 1
    fi
    if ! "$SCRIPT_DIR/validate-installed.sh" --target-dir "$TMP_DIR" --version "$PACKAGE_VERSION"; then
        echo "ERROR: validate-installed.sh failed for temporary installation"
        exit 1
    fi
    if [ ! -x "$TMP_DIR/$APPLET_UUID/scripts/atcinna-catalog" ]; then
        echo "ERROR: install-local did not place executable helper"
        exit 1
    fi
    if [ ! -x "$TMP_DIR/$APPLET_UUID/scripts/atcinna-search-dialog" ]; then
        echo "ERROR: install-local did not place executable search dialog"
        exit 1
    fi
    PACKAGE_DIST="$TMP_DIR/dist"
    if ! "$SCRIPT_DIR/package.sh" --skip-check --dist-dir "$PACKAGE_DIST"; then
        echo "ERROR: package.sh failed during self-test"
        exit 1
    fi
    PACKAGE_FILE="$PACKAGE_DIST/$APPLET_UUID-$PACKAGE_VERSION.tar.gz"
    if [ ! -f "$PACKAGE_FILE" ]; then
        echo "ERROR: package artifact missing: $PACKAGE_FILE"
        exit 1
    fi
    PACKAGE_LIST="$(tar -tzf "$PACKAGE_FILE")"
    if ! grep -qx "$APPLET_UUID/metadata.json" <<<"$PACKAGE_LIST"; then
        echo "ERROR: package artifact missing metadata.json"
        exit 1
    fi
    if ! grep -qx "$APPLET_UUID/scripts/atcinna-search-dialog" <<<"$PACKAGE_LIST"; then
        echo "ERROR: package artifact missing search dialog"
        exit 1
    fi
    if grep -Eq '(^|/)(\\.git|dist|__pycache__)(/|$)|\\.pyc$|~$' <<<"$PACKAGE_LIST"; then
        echo "ERROR: package artifact contains excluded paths"
        echo "$PACKAGE_LIST"
        exit 1
    fi
fi

if [ "$STATUS" -ne 0 ]; then
    exit "$STATUS"
fi

echo "check ok"
