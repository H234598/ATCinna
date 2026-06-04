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

if ! rg -q -F 'on_applet_clicked()' "$APPLET_JS"; then
    echo "ERROR: on_applet_clicked handler is missing"
    STATUS=1
fi
if ! rg -q -F 'this.menu.toggle();' "$APPLET_JS"; then
    echo "ERROR: applet click handler does not toggle menu"
    STATUS=1
fi
if ! rg -q -F 'new PopupMenu.PopupMenuItem("Einstellungen")' "$APPLET_JS"; then
    echo "ERROR: applet menu does not contain Einstellungen item"
    STATUS=1
fi
if ! rg -q -F '_openAppletSettings()' "$APPLET_JS"; then
    echo "ERROR: Einstellungen action is not wired to handler"
    STATUS=1
fi
if ! rg -q -F 'configureApplet()' "$APPLET_JS"; then
    echo "ERROR: Einstellungen action does not call configureApplet()"
    STATUS=1
fi
if ! rg -q -F 'new PopupMenu.PopupMenuItem("In Warteschlange legen")' "$APPLET_JS"; then
    echo "ERROR: applet menu does not contain queue enqueue item"
    STATUS=1
fi
if ! rg -q -F 'new PopupMenu.PopupMenuItem("Nächsten Download starten")' "$APPLET_JS"; then
    echo "ERROR: applet menu does not contain queue run-next item"
    STATUS=1
fi
if ! rg -q -F 'new PopupMenu.PopupMenuItem("Alle Downloads starten")' "$APPLET_JS"; then
    echo "ERROR: applet menu does not contain queue run-all item"
    STATUS=1
fi
for helper_action in download-enqueue download-list download-run-next download-cancel download-clear; do
    if ! rg -q -F "\"${helper_action}\"" "$HELPER"; then
        echo "ERROR: helper action is missing: ${helper_action}"
        STATUS=1
    fi
done
for helper_action in download-remove download-undo download-prefer download-put-back download-trash-file; do
    if ! rg -q -F "\"${helper_action}\"" "$HELPER"; then
        echo "ERROR: helper action is missing: ${helper_action}"
        STATUS=1
    fi
done
for queue_label in "Download stoppen" "Audio (URL) abspielen" "Download (URL) kopieren" "Gespeichertes Audio (Datei) abspielen" "Gespeichertes Audio (Datei) löschen" "Zielordner öffnen" "Aus Liste entfernen" "Vorziehen" "Zurückstellen" "Gelöschte wieder anlegen"; do
    if ! rg -q -F "${queue_label}" "$APPLET_JS"; then
        echo "ERROR: applet queue menu label is missing: ${queue_label}"
        STATUS=1
    fi
done
for info_label in "Audioinformation anzeigen" "Titel in die Zwischenablage kopieren" "Genre in die Zwischenablage kopieren" "Thema in die Zwischenablage kopieren"; do
    if ! rg -q -F "${info_label}" "$APPLET_JS"; then
        echo "ERROR: applet metadata action label is missing: ${info_label}"
        STATUS=1
    fi
done
if ! rg -q -F "_addInfoAction" "$APPLET_JS"; then
    echo "ERROR: applet metadata action builder is missing"
    STATUS=1
fi
if ! rg -q -F "_setInfoSection(item)" "$APPLET_JS"; then
    echo "ERROR: applet metadata info section handler is missing"
    STATUS=1
fi
if ! rg -q -F "_renderInfoSection(fields = [])" "$APPLET_JS"; then
    echo "ERROR: applet metadata info section renderer is missing"
    STATUS=1
fi
if ! rg -q -F "_copyToClipboard" "$APPLET_JS"; then
    echo "ERROR: applet clipboard helper is missing"
    STATUS=1
fi
if ! rg -q -F 'new PopupMenu.PopupMenuItem("Alle Downloads stoppen")' "$APPLET_JS"; then
    echo "ERROR: applet menu does not contain queue stop-all item"
    STATUS=1
fi
if ! rg -q -F 'new PopupMenu.PopupMenuItem("Alle wartenden Downloads stoppen")' "$APPLET_JS"; then
    echo "ERROR: applet menu does not contain queue pending-stop item"
    STATUS=1
fi
if ! rg -q -F '_queueFolderCandidate(item)' "$APPLET_JS"; then
    echo "ERROR: queue folder opener does not use a path/folder candidate helper"
    STATUS=1
fi
if ! rg -q -F '_runQueueRunAll()' "$APPLET_JS"; then
    echo "ERROR: applet queue run-all action handler is missing"
    STATUS=1
fi
if ! rg -q -F '_runQueueCancelItem(item)' "$APPLET_JS"; then
    echo "ERROR: applet queue cancel-item action handler is missing"
    STATUS=1
fi
if ! rg -q -F '_runQueueCancelQueued()' "$APPLET_JS"; then
    echo "ERROR: applet queue cancel-queued action handler is missing"
    STATUS=1
fi
if ! rg -q -F '_openQueueFile(item)' "$APPLET_JS"; then
    echo "ERROR: applet queue file open action handler is missing"
    STATUS=1
fi
if ! rg -q -F '_runQueueTrashFile(item)' "$APPLET_JS"; then
    echo "ERROR: applet queue trash-file action handler is missing"
    STATUS=1
fi
if ! rg -q -F '_defaultDownloadFolder()' "$APPLET_JS"; then
    echo "ERROR: queue folder opener does not expose the helper download-folder fallback"
    STATUS=1
fi
if ! rg -q -F '"--queued-only"' "$HELPER"; then
    echo "ERROR: helper queued-only cancel option is missing"
    STATUS=1
fi
for helper_arg in "--date" "--time" "--duration" "--description"; do
    if ! rg -q -e "${helper_arg}" "$HELPER"; then
        echo "ERROR: helper metadata parser flag is missing: ${helper_arg}"
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
HISTORY_METADATA_ADD="$(python3 "$HELPER" history-add --title "Meta" --sender "S" --genre "G" --topic "T" --date "2026-06-04" --time "12:34" --duration "01:00" --description "Testbeschreibung" --url "https://example.com/history/meta")"
if ! echo "$HISTORY_METADATA_ADD" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: history-add with metadata failed"
    echo "$HISTORY_METADATA_ADD"
    exit 1
fi
HISTORY_LIST="$(python3 "$HELPER" history-list)"
if ! echo "$HISTORY_LIST" | jq -e '.results[0].date == "2026-06-04" and .results[0].time == "12:34" and .results[0].duration == "01:00" and .results[0].description == "Testbeschreibung"' >/dev/null; then
    echo "ERROR: history metadata fields not persisted"
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
BOOKMARK_METADATA_ADD="$(python3 "$HELPER" bookmark-add --title "Meta" --sender "S" --genre "G" --topic "T" --date "2026-06-04" --time "10:00" --duration "00:15" --description "Kurz" --url "https://example.com/bookmark/meta" --website "https://example.com")"
if ! echo "$BOOKMARK_METADATA_ADD" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: bookmark-add with metadata failed"
    echo "$BOOKMARK_METADATA_ADD"
    exit 1
fi
BOOKMARK_LIST="$(python3 "$HELPER" bookmark-list)"
if ! echo "$BOOKMARK_LIST" | jq -e '.results[0].date == "2026-06-04" and .results[0].time == "10:00" and .results[0].duration == "00:15" and .results[0].description == "Kurz" and .results[0].title == "Meta"' >/dev/null; then
    echo "ERROR: bookmark metadata fields not persisted"
    echo "$BOOKMARK_LIST"
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

QUEUE_DOWNLOAD_DIR="$TMP_DIR/queue-downloads"
QUEUE_HTTP_DIR="$TMP_DIR/queue-http"
mkdir -p "$QUEUE_DOWNLOAD_DIR" "$QUEUE_HTTP_DIR"
printf 'queued audio fixture\n' > "$QUEUE_HTTP_DIR/audio-one.mp3"
printf 'queued audio fixture two\n' > "$QUEUE_HTTP_DIR/audio-two.mp3"
python3 - "$QUEUE_HTTP_DIR" "$TMP_DIR/http-server.port" >"$TMP_DIR/http-server.log" 2>&1 <<'PY' &
import functools
import http.server
import socketserver
import sys

directory = sys.argv[1]
port_file = sys.argv[2]
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)

with socketserver.TCPServer(("127.0.0.1", 0), handler) as httpd:
    with open(port_file, "w", encoding="utf-8") as handle:
        handle.write(str(httpd.server_address[1]))
    httpd.serve_forever()
PY
HTTP_SERVER_PID=$!
cleanup_http_server() {
    if kill -0 "$HTTP_SERVER_PID" >/dev/null 2>&1; then
        kill "$HTTP_SERVER_PID" >/dev/null 2>&1 || true
        wait "$HTTP_SERVER_PID" >/dev/null 2>&1 || true
    fi
}
trap 'cleanup_http_server; cleanup' EXIT
QUEUE_HTTP_PORT=""
for _ in $(seq 1 50); do
    if [[ -f "$TMP_DIR/http-server.port" ]]; then
        QUEUE_HTTP_PORT="$(cat "$TMP_DIR/http-server.port")"
    fi
    if [[ -n "$QUEUE_HTTP_PORT" ]]; then
        break
    fi
    sleep 0.1
done
if [[ -z "$QUEUE_HTTP_PORT" ]]; then
    echo "ERROR: local queue HTTP server did not start"
    cat "$TMP_DIR/http-server.log"
    exit 1
fi
QUEUE_URL_ONE="http://127.0.0.1:${QUEUE_HTTP_PORT}/audio-one.mp3"
QUEUE_URL_TWO="http://127.0.0.1:${QUEUE_HTTP_PORT}/audio-two.mp3"

QUEUE_ADD_ONE="$(python3 "$HELPER" download-enqueue --title "Queue One" --url "$QUEUE_URL_ONE" --folder "$QUEUE_DOWNLOAD_DIR")"
if ! echo "$QUEUE_ADD_ONE" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: download-enqueue failed"
    echo "$QUEUE_ADD_ONE"
    exit 1
fi
QUEUE_ADD_TWO="$(python3 "$HELPER" download-enqueue --title "Queue Two" --url "$QUEUE_URL_TWO" --folder "$QUEUE_DOWNLOAD_DIR")"
if ! echo "$QUEUE_ADD_TWO" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: second download-enqueue failed"
    echo "$QUEUE_ADD_TWO"
    exit 1
fi
QUEUE_ADD_ONE_AGAIN="$(python3 "$HELPER" download-enqueue --title "Queue One Updated" --url "$QUEUE_URL_ONE" --folder "$QUEUE_DOWNLOAD_DIR")"
if ! echo "$QUEUE_ADD_ONE_AGAIN" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: download-enqueue dedupe update failed"
    echo "$QUEUE_ADD_ONE_AGAIN"
    exit 1
fi
QUEUE_ADD_META="$(python3 "$HELPER" download-enqueue --title "Queue Meta" --sender "S" --genre "G" --topic "T" --date "2026-06-04" --time "08:00" --duration "00:30" --description "Queue beschreibung" --url "$QUEUE_URL_TWO" --folder "$QUEUE_DOWNLOAD_DIR")"
if ! echo "$QUEUE_ADD_META" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: download-enqueue with metadata failed"
    echo "$QUEUE_ADD_META"
    exit 1
fi
QUEUE_LIST="$(python3 "$HELPER" download-list)"
if ! echo "$QUEUE_LIST" | jq -e --arg one "$QUEUE_URL_ONE" --arg two "$QUEUE_URL_TWO" '.status == "ok" and .count == 2 and (.results | map(.url) | index($one) != null) and (.results | map(.url) | index($two) != null) and ([.results[] | select(.url == $one and .title == "Queue One Updated")] | length) == 1' >/dev/null; then
    echo "ERROR: download-list/dedupe/FIFO order unexpected"
    echo "$QUEUE_LIST"
    exit 1
fi
if ! echo "$QUEUE_LIST" | jq -e --arg q "$QUEUE_URL_TWO" '.results | map(select(.url==$q and .date=="2026-06-04" and .time=="08:00" and .duration=="00:30" and .description=="Queue beschreibung")) | length > 0' >/dev/null; then
    echo "ERROR: queue metadata fields not persisted"
    echo "$QUEUE_LIST"
    exit 1
fi
QUEUE_PREFER="$(python3 "$HELPER" download-prefer --url "$QUEUE_URL_TWO")"
if ! echo "$QUEUE_PREFER" | jq -e '.status == "ok" and .moved == true' >/dev/null; then
    echo "ERROR: download-prefer failed"
    echo "$QUEUE_PREFER"
    exit 1
fi
QUEUE_LIST_AFTER_PREFER="$(python3 "$HELPER" download-list)"
if ! echo "$QUEUE_LIST_AFTER_PREFER" | jq -e --arg two "$QUEUE_URL_TWO" --arg one "$QUEUE_URL_ONE" '.results[0].url == $two and .results[1].url == $one' >/dev/null; then
    echo "ERROR: download-prefer did not move entry before queued peers"
    echo "$QUEUE_LIST_AFTER_PREFER"
    exit 1
fi
QUEUE_PUT_BACK="$(python3 "$HELPER" download-put-back --url "$QUEUE_URL_TWO")"
if ! echo "$QUEUE_PUT_BACK" | jq -e '.status == "ok" and .moved == true' >/dev/null; then
    echo "ERROR: download-put-back failed"
    echo "$QUEUE_PUT_BACK"
    exit 1
fi
QUEUE_LIST_AFTER_PUT_BACK="$(python3 "$HELPER" download-list)"
if ! echo "$QUEUE_LIST_AFTER_PUT_BACK" | jq -e --arg two "$QUEUE_URL_TWO" '.results[1].url == $two' >/dev/null; then
    echo "ERROR: download-put-back did not move entry behind queued peers"
    echo "$QUEUE_LIST_AFTER_PUT_BACK"
    exit 1
fi
QUEUE_RUN_NEXT="$(python3 "$HELPER" download-run-next)"
if ! echo "$QUEUE_RUN_NEXT" | jq -e '.status == "ok" and .result.status == "finished" and (.result.path | endswith(".mp3"))' >/dev/null; then
    echo "ERROR: download-run-next did not finish local queued item"
    echo "$QUEUE_RUN_NEXT"
    exit 1
fi
QUEUE_PATH="$(echo "$QUEUE_RUN_NEXT" | jq -r '.result.path')"
if [[ ! -f "$QUEUE_PATH" ]]; then
    echo "ERROR: queued download output missing: $QUEUE_PATH"
    exit 1
fi
QUEUE_LIST_AFTER_RUN="$(python3 "$HELPER" download-list)"
if ! echo "$QUEUE_LIST_AFTER_RUN" | jq -e '.results[0].status == "finished" and .results[1].status == "queued"' >/dev/null; then
    echo "ERROR: queue state after run-next unexpected"
    echo "$QUEUE_LIST_AFTER_RUN"
    exit 1
fi
QUEUE_CANCEL_ONE="$(python3 "$HELPER" download-cancel --url "$QUEUE_URL_TWO")"
if ! echo "$QUEUE_CANCEL_ONE" | jq -e '.status == "ok" and .changed == 1' >/dev/null; then
    echo "ERROR: download-cancel did not cancel queued entry"
    echo "$QUEUE_CANCEL_ONE"
    exit 1
fi
if python3 "$HELPER" download-cancel >"$TMP_DIR/queue-cancel-missing-url.out" 2>&1; then
    echo "ERROR: download-cancel without --url/--all unexpectedly succeeded"
    exit 1
fi
if ! jq -e '.status == "error" and .message == "url is required unless --all or --queued-only is used"' "$TMP_DIR/queue-cancel-missing-url.out" >/dev/null 2>&1; then
    echo "ERROR: download-cancel missing URL did not return expected error JSON"
    cat "$TMP_DIR/queue-cancel-missing-url.out"
    exit 1
fi
QUEUE_CLEAR="$(python3 "$HELPER" download-clear)"
if ! echo "$QUEUE_CLEAR" | jq -e '.status == "ok" and .removed == 2' >/dev/null; then
    echo "ERROR: download-clear did not remove finished/cancelled entries"
    echo "$QUEUE_CLEAR"
    exit 1
fi
QUEUE_LIST_EMPTY="$(python3 "$HELPER" download-list)"
if ! echo "$QUEUE_LIST_EMPTY" | jq -e '.status == "ok" and .count == 0' >/dev/null; then
    echo "ERROR: download queue should be empty after clear"
    echo "$QUEUE_LIST_EMPTY"
    exit 1
fi

if python3 "$HELPER" download-enqueue --title "Bad Queue" --url "file:///tmp/bad.mp3" --folder "$QUEUE_DOWNLOAD_DIR" >"$TMP_DIR/queue-invalid.out" 2>&1; then
    echo "ERROR: download-enqueue invalid URL unexpectedly succeeded"
    exit 1
fi
if ! jq -e '.status == "error" and .message == "invalid URL scheme"' "$TMP_DIR/queue-invalid.out" >/dev/null 2>&1; then
    echo "ERROR: download-enqueue invalid URL did not return expected error JSON"
    cat "$TMP_DIR/queue-invalid.out"
    exit 1
fi

cat > "$XDG_DATA_HOME/atcinna@H234598/download-queue.json" <<'JSON'
[
  {
    "title": "Running item",
    "sender": "",
    "genre": "",
    "topic": "",
    "url": "https://example.com/running",
    "website": "",
    "folder": "",
    "timestamp": 10,
    "status": "running",
    "path": "",
    "error": ""
  },
  {
    "title": "Queued item",
    "sender": "",
    "genre": "",
    "topic": "",
    "url": "https://example.com/queued",
    "website": "",
    "folder": "",
    "timestamp": 11,
    "status": "queued",
    "path": "",
    "error": ""
  },
  {
    "title": "Finished item",
    "sender": "",
    "genre": "",
    "topic": "",
    "url": "https://example.com/finished",
    "website": "",
    "folder": "",
    "timestamp": 12,
    "status": "finished",
    "path": "/tmp",
    "error": ""
  }
]
JSON

QUEUE_REMOVE_RUNNING="$(python3 "$HELPER" download-remove --url "https://example.com/running")"
if ! echo "$QUEUE_REMOVE_RUNNING" | jq -e '.status == "ok" and .removed == 0 and .running_blocks == 1' >/dev/null; then
    echo "ERROR: download-remove must not remove running entries"
    echo "$QUEUE_REMOVE_RUNNING"
    exit 1
fi

QUEUE_REMOVE_QUEUED="$(python3 "$HELPER" download-remove --url "https://example.com/queued")"
if ! echo "$QUEUE_REMOVE_QUEUED" | jq -e '.status == "ok" and .removed == 1' >/dev/null; then
    echo "ERROR: download-remove should remove queued entry"
    echo "$QUEUE_REMOVE_QUEUED"
    exit 1
fi
QUEUE_REMOVE_RUNNING_AFTER_REMOVE="$(python3 "$HELPER" download-remove --url "https://example.com/running")"
if ! echo "$QUEUE_REMOVE_RUNNING_AFTER_REMOVE" | jq -e '.status == "ok" and .removed == 0 and .running_blocks == 1' >/dev/null; then
    echo "ERROR: download-remove running no-op changed unexpectedly after queued removal"
    echo "$QUEUE_REMOVE_RUNNING_AFTER_REMOVE"
    exit 1
fi
QUEUE_LIST_AFTER_RUNNING_TEST="$(python3 "$HELPER" download-list)"
if ! echo "$QUEUE_LIST_AFTER_RUNNING_TEST" | jq -e '.results | map(select(.url=="https://example.com/queued")) | length == 0' >/dev/null; then
    echo "ERROR: queued entry was not removed by download-remove"
    echo "$QUEUE_LIST_AFTER_RUNNING_TEST"
    exit 1
fi
if ! echo "$QUEUE_LIST_AFTER_RUNNING_TEST" | jq -e '.results | map(select(.url=="https://example.com/running")) | length == 1' >/dev/null; then
    echo "ERROR: running entry was removed by download-remove"
    echo "$QUEUE_LIST_AFTER_RUNNING_TEST"
    exit 1
fi

QUEUE_UNDO="$(python3 "$HELPER" download-undo)"
if ! echo "$QUEUE_UNDO" | jq -e '.status == "ok" and .restored == 1' >/dev/null; then
    echo "ERROR: download-undo did not restore removed entries"
    echo "$QUEUE_UNDO"
    exit 1
fi
QUEUE_LIST_AFTER_UNDO="$(python3 "$HELPER" download-list)"
if ! echo "$QUEUE_LIST_AFTER_UNDO" | jq -e '.results | map(select(.url=="https://example.com/queued")) | length == 1' >/dev/null; then
    echo "ERROR: download-undo did not restore queued entry"
    echo "$QUEUE_LIST_AFTER_UNDO"
    exit 1
fi
if ! echo "$QUEUE_LIST_AFTER_UNDO" | jq -e '.results | map(select(.url=="https://example.com/queued" or .url=="https://example.com/running")) | length == 2' >/dev/null; then
    echo "ERROR: download-undo changed unexpected queue state"
    echo "$QUEUE_LIST_AFTER_UNDO"
    exit 1
fi
QUEUE_CANCEL_QUEUED_ONLY="$(python3 "$HELPER" download-cancel --queued-only)"
if ! echo "$QUEUE_CANCEL_QUEUED_ONLY" | jq -e '.status == "ok" and .changed == 1' >/dev/null; then
    echo "ERROR: download-cancel --queued-only should cancel queued entries only"
    echo "$QUEUE_CANCEL_QUEUED_ONLY"
    exit 1
fi
QUEUE_LIST_AFTER_QUEUED_ONLY="$(python3 "$HELPER" download-list)"
if ! echo "$QUEUE_LIST_AFTER_QUEUED_ONLY" | jq -e '.results | map(select(.url=="https://example.com/running" and .status=="running")) | length == 1' >/dev/null; then
    echo "ERROR: download-cancel --queued-only changed running entry"
    echo "$QUEUE_LIST_AFTER_QUEUED_ONLY"
    exit 1
fi
if ! echo "$QUEUE_LIST_AFTER_QUEUED_ONLY" | jq -e '.results | map(select(.url=="https://example.com/queued" and .status=="cancelled")) | length == 1' >/dev/null; then
    echo "ERROR: download-cancel --queued-only did not cancel queued entry"
    echo "$QUEUE_LIST_AFTER_QUEUED_ONLY"
    exit 1
fi

if ! command -v gio >/dev/null 2>&1; then
    echo "WARN: gio not installed; skipping download-trash-file functional tests"
else
    QUEUE_TRASH_BASE="$HOME/.cache/atcinna-check-trash-$RANDOM-$$"
    QUEUE_TRASH_XDG_DATA_HOME="$QUEUE_TRASH_BASE/data"
    QUEUE_TRASH_AUDIO_DIR="$QUEUE_TRASH_BASE/audio"
    QUEUE_TRASH_OUTSIDE_DIR="$QUEUE_TRASH_BASE/outside"
    rm -rf "$QUEUE_TRASH_BASE"
    mkdir -p "$QUEUE_TRASH_AUDIO_DIR" "$QUEUE_TRASH_OUTSIDE_DIR" "$QUEUE_TRASH_XDG_DATA_HOME/atcinna@H234598"

    printf 'trashable fixture\n' > "$QUEUE_TRASH_AUDIO_DIR/audio-trash.mp3"
    printf 'outside fixture\n' > "$QUEUE_TRASH_OUTSIDE_DIR/audio-outside.mp3"
    cat > "$QUEUE_TRASH_XDG_DATA_HOME/atcinna@H234598/download-queue.json" <<JSON
[
  {
    "title": "Trash candidate",
    "sender": "",
    "genre": "",
    "topic": "",
    "url": "https://example.com/trash/candidate",
    "website": "",
    "folder": "$QUEUE_TRASH_AUDIO_DIR",
    "timestamp": 100,
    "status": "finished",
    "path": "$QUEUE_TRASH_AUDIO_DIR/audio-trash.mp3",
    "error": ""
  },
  {
    "title": "Outside candidate",
    "sender": "",
    "genre": "",
    "topic": "",
    "url": "https://example.com/trash/outside",
    "website": "",
    "folder": "$QUEUE_TRASH_AUDIO_DIR",
    "timestamp": 101,
    "status": "finished",
    "path": "$QUEUE_TRASH_OUTSIDE_DIR/audio-outside.mp3",
    "error": ""
  },
  {
    "title": "Missing path candidate",
    "sender": "",
    "genre": "",
    "topic": "",
    "url": "https://example.com/trash/missing-path",
    "website": "",
    "folder": "$QUEUE_TRASH_AUDIO_DIR",
    "timestamp": 102,
    "status": "finished",
    "path": "",
    "error": ""
  }
]
JSON

    QUEUE_TRASH_REJECT="$(XDG_DATA_HOME="$QUEUE_TRASH_XDG_DATA_HOME" python3 "$HELPER" download-trash-file --url "https://example.com/trash/outside" 2>&1 || true)"
    if [ -f "$QUEUE_TRASH_OUTSIDE_DIR/audio-outside.mp3" ]; then :; else
        echo "ERROR: outside fixture file missing before validation"
        exit 1
    fi
    if ! echo "$QUEUE_TRASH_REJECT" | jq -e '.status == "error" and (.message | startswith("file path is outside queue folder"))' >/dev/null; then
        echo "ERROR: download-trash-file should reject path outside queue folder"
        echo "$QUEUE_TRASH_REJECT"
        exit 1
    fi
    if [ ! -f "$QUEUE_TRASH_OUTSIDE_DIR/audio-outside.mp3" ]; then
        echo "ERROR: outside file must remain after rejected trash attempt"
        exit 1
    fi
    QUEUE_LIST_AFTER_TRASH_REJECT="$(XDG_DATA_HOME="$QUEUE_TRASH_XDG_DATA_HOME" python3 "$HELPER" download-list)"
    if ! echo "$QUEUE_LIST_AFTER_TRASH_REJECT" | jq -e '.results | map(select(.url=="https://example.com/trash/outside")) | length == 1' >/dev/null; then
        echo "ERROR: outside queue entry should remain in list after rejected trash attempt"
        echo "$QUEUE_LIST_AFTER_TRASH_REJECT"
        exit 1
    fi

    QUEUE_TRASH_RESULT="$(XDG_DATA_HOME="$QUEUE_TRASH_XDG_DATA_HOME" python3 "$HELPER" download-trash-file --url "https://example.com/trash/candidate" 2>&1 || true)"
    if ! echo "$QUEUE_TRASH_RESULT" | jq -e '.status == "ok" and .trashed == true' >/dev/null; then
        if echo "$QUEUE_TRASH_RESULT" | jq -e '.status == "error" and (.message | test("not supported|across filesystem boundaries|not supported by"))' >/dev/null 2>&1; then
            echo "WARN: gio trash backend unsupported in this environment; skipping valid trash validation"
            rm -rf "$QUEUE_TRASH_BASE"
        else
            echo "ERROR: download-trash-file should trash file for valid queue entry"
            echo "$QUEUE_TRASH_RESULT"
            rm -rf "$QUEUE_TRASH_BASE"
            exit 1
        fi
    else
        if [ -f "$QUEUE_TRASH_AUDIO_DIR/audio-trash.mp3" ]; then
            echo "ERROR: queued file still exists after successful download-trash-file"
            rm -rf "$QUEUE_TRASH_BASE"
            exit 1
        fi
        QUEUE_LIST_AFTER_TRASH="$(XDG_DATA_HOME="$QUEUE_TRASH_XDG_DATA_HOME" python3 "$HELPER" download-list)"
        if ! echo "$QUEUE_LIST_AFTER_TRASH" | jq -e '.results | map(select(.url=="https://example.com/trash/candidate" and .path == "" and .status=="cancelled")) | length == 1' >/dev/null; then
            echo "ERROR: queue entry was not marked cancelled/cleared after trash"
            echo "$QUEUE_LIST_AFTER_TRASH"
            rm -rf "$QUEUE_TRASH_BASE"
            exit 1
        fi
    fi

    QUEUE_TRASH_MISSING_URL="$(XDG_DATA_HOME="$QUEUE_TRASH_XDG_DATA_HOME" python3 "$HELPER" download-trash-file 2>&1 || true)"
    if ! jq -e '.status == "error" and .message == "url is required"' <<<"$QUEUE_TRASH_MISSING_URL" >/dev/null 2>&1; then
        echo "ERROR: download-trash-file without URL should return JSON error"
        echo "$QUEUE_TRASH_MISSING_URL"
        rm -rf "$QUEUE_TRASH_BASE"
        exit 1
    fi

    QUEUE_TRASH_MISSING_PATH="$(XDG_DATA_HOME="$QUEUE_TRASH_XDG_DATA_HOME" python3 "$HELPER" download-trash-file --url "https://example.com/trash/missing-path" 2>&1 || true)"
    if ! echo "$QUEUE_TRASH_MISSING_PATH" | jq -e '.status == "error" and .message == "path is required"' >/dev/null; then
        echo "ERROR: download-trash-file should reject entry with missing path"
        echo "$QUEUE_TRASH_MISSING_PATH"
        rm -rf "$QUEUE_TRASH_BASE"
        exit 1
    fi

    rm -rf "$QUEUE_TRASH_BASE"
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
