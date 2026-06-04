#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR_DEFAULT="${HOME}/.local/share/cinnamon/applets"
APPLET_ID="atcinna@H234598"
VERSION_FILE="$REPO_ROOT/VERSION"
TARGET_DIR="$TARGET_DIR_DEFAULT"
VERSION=""

usage() {
    cat <<'EOF'
Usage:
  ./scripts/validate-installed.sh [--target-dir DIR] [--version VERSION]
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target-dir)
            if [[ $# -lt 2 ]]; then
                echo "ERROR: --target-dir requires a directory argument"
                usage
                exit 1
            fi
            TARGET_DIR="$2"
            shift 2
            ;;
        --version)
            if [[ $# -lt 2 ]]; then
                echo "ERROR: --version requires a version argument"
                usage
                exit 1
            fi
            VERSION="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "ERROR: unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

if [[ ! -d "$TARGET_DIR" ]]; then
    echo "ERROR: target-dir does not exist: $TARGET_DIR"
    exit 1
fi

if [[ -z "$VERSION" ]]; then
    if [[ -f "$VERSION_FILE" ]]; then
        VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
    fi
fi
if [[ -z "$VERSION" ]]; then
    echo "ERROR: version not provided and VERSION file is missing or empty"
    exit 1
fi

APPLET_DIR="$TARGET_DIR/$APPLET_ID"
HELPER="$APPLET_DIR/scripts/atcinna-catalog"
SEARCH_DIALOG="$APPLET_DIR/scripts/atcinna-search-dialog"
QUEUE_EDIT_DIALOG="$APPLET_DIR/scripts/atcinna-queue-edit-dialog"
BLACKLIST_DIALOG="$APPLET_DIR/scripts/atcinna-blacklist-dialog"
FILTER_PROFILES_DIALOG="$APPLET_DIR/scripts/atcinna-filter-profiles-dialog"
APPLET_JS="$APPLET_DIR/applet.js"
SETTINGS_SCHEMA="$APPLET_DIR/settings-schema.json"
METADATA_JSON="$APPLET_DIR/metadata.json"
TMP_DIR="$(mktemp -d)"
export PYTHONPYCACHEPREFIX="$TMP_DIR/pycache"

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

require_command() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "ERROR: required command missing: $cmd"
        return 1
    fi
}

require_command jq
require_command node
require_command xz
require_command python3

if [[ ! -d "$APPLET_DIR" ]]; then
    echo "ERROR: installed applet directory missing: $APPLET_DIR"
    exit 1
fi

for required_file in \
    "$APPLET_JS" \
    "$SETTINGS_SCHEMA" \
    "$APPLET_DIR/stylesheet.css" \
    "$METADATA_JSON" \
    "$HELPER" \
    "$SEARCH_DIALOG" \
    "$BLACKLIST_DIALOG" \
    "$FILTER_PROFILES_DIALOG"; do
    if [[ ! -f "$required_file" ]]; then
        echo "ERROR: expected installed file missing: $required_file"
        exit 1
    fi
done

if [[ ! -x "$HELPER" ]]; then
    echo "ERROR: helper not executable: $HELPER"
    exit 1
fi
if [[ ! -x "$SEARCH_DIALOG" ]]; then
    echo "ERROR: search dialog not executable: $SEARCH_DIALOG"
    exit 1
fi
if [[ ! -x "$QUEUE_EDIT_DIALOG" ]]; then
    echo "ERROR: queue edit dialog not executable: $QUEUE_EDIT_DIALOG"
    exit 1
fi
if [[ ! -x "$BLACKLIST_DIALOG" ]]; then
    echo "ERROR: blacklist dialog not executable: $BLACKLIST_DIALOG"
    exit 1
fi
if [[ ! -x "$FILTER_PROFILES_DIALOG" ]]; then
    echo "ERROR: filter profiles dialog not executable: $FILTER_PROFILES_DIALOG"
    exit 1
fi

jq -e . "$METADATA_JSON" >/dev/null
jq -e . "$SETTINGS_SCHEMA" >/dev/null

if ! uuid="$(jq -r '.uuid // empty' "$METADATA_JSON")"; then
    echo "ERROR: metadata uuid is not readable"
    exit 1
fi
if [[ "$uuid" != "$APPLET_ID" ]]; then
    echo "ERROR: metadata uuid mismatch: expected '$APPLET_ID', got '${uuid}'"
    exit 1
fi

meta_version="$(jq -r '.version // empty' "$METADATA_JSON")"
if [[ -z "$meta_version" ]]; then
    echo "ERROR: metadata version missing"
    exit 1
fi
if [[ "$meta_version" != "$VERSION" ]]; then
    echo "ERROR: metadata version mismatch: expected '$VERSION', got '$meta_version'"
    exit 1
fi

node --check "$APPLET_JS" >/dev/null
python3 - "$APPLET_JS" <<'PY'
import re
import sys
from pathlib import Path

source_path = Path(sys.argv[1])
source = source_path.read_text(encoding="utf-8")

checks = {
    "on_applet_clicked toggles menu": re.compile(
        r"on_applet_clicked\s*\([^)]*\)\s*\{[^{}]*\bthis\.menu\.toggle\s*\(\s*\)\s*;",
        re.S,
    ),
    "Einstellungen menu item is created": re.compile(
        r"this\._openSettingsItem\s*=\s*new\s+PopupMenu\.PopupMenuItem\s*\(\s*['\"]Einstellungen['\"]\s*\)",
        re.S,
    ),
    "Einstellungen item calls settings handler": re.compile(
        r"this\._openSettingsItem\.connect\s*\(\s*['\"]activate['\"]\s*,\s*\(\s*\)\s*=>\s*\{[^{}]*\bthis\._openAppletSettings\s*\(\s*\)\s*;",
        re.S,
    ),
    "Einstellungen item is added to menu": re.compile(
        r"this\.menu\.addMenuItem\s*\(\s*this\._openSettingsItem\s*\)",
        re.S,
    ),
    "settings handler calls configureApplet": re.compile(
        r"_openAppletSettings\s*\(\s*\)\s*\{[\s\S]*?\bthis\.configureApplet\s*\(\s*\)\s*;",
        re.S,
    ),
}

missing = [description for description, pattern in checks.items() if not pattern.search(source)]
if missing:
    for description in missing:
        print(f"ERROR: installed applet contract violation in {source_path}: {description}")
    raise SystemExit(1)
PY

if ! python3 "$HELPER" --help >"$TMP_DIR/help.out" 2>&1; then
    echo "ERROR: helper --help failed"
    cat "$TMP_DIR/help.out"
    exit 1
fi
if ! python3 -m py_compile "$SEARCH_DIALOG"; then
    echo "ERROR: py_compile failed for search dialog"
    exit 1
fi
if ! python3 -m py_compile "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: py_compile failed for queue edit dialog"
    exit 1
fi
if ! python3 -m py_compile "$BLACKLIST_DIALOG"; then
    echo "ERROR: py_compile failed for blacklist dialog"
    exit 1
fi
if ! python3 -m py_compile "$FILTER_PROFILES_DIALOG"; then
    echo "ERROR: py_compile failed for filter profiles dialog"
    exit 1
fi

QUEUE_EDIT_DIALOG_SELF_TEST="$(python3 "$QUEUE_EDIT_DIALOG" --self-test)"
if ! echo "$QUEUE_EDIT_DIALOG_SELF_TEST" | jq -e '.status == "ok" and (.gtk3 | type == "boolean") and .helper != ""' >/dev/null; then
    echo "ERROR: installed queue edit dialog self-test failed"
    echo "$QUEUE_EDIT_DIALOG_SELF_TEST"
    exit 1
fi

BLACKLIST_DIALOG_SELF_TEST="$(python3 "$BLACKLIST_DIALOG" --self-test)"
if ! echo "$BLACKLIST_DIALOG_SELF_TEST" | jq -e '.status == "ok" and (.gtk3 | type == "boolean") and .helper != ""' >/dev/null; then
    echo "ERROR: installed blacklist dialog self-test failed"
    echo "$BLACKLIST_DIALOG_SELF_TEST"
    exit 1
fi

FILTER_PROFILES_DIALOG_SELF_TEST="$(python3 "$FILTER_PROFILES_DIALOG" --self-test)"
if ! echo "$FILTER_PROFILES_DIALOG_SELF_TEST" | jq -e '.status == "ok" and (.gtk3 | type == "boolean") and .helper != ""' >/dev/null; then
    echo "ERROR: installed filter profiles dialog self-test failed"
    echo "$FILTER_PROFILES_DIALOG_SELF_TEST"
    exit 1
fi

export XDG_CACHE_HOME="$TMP_DIR/cache"
export XDG_DATA_HOME="$TMP_DIR/data"
mkdir -p "$XDG_CACHE_HOME"
CACHE_FILE="$XDG_CACHE_HOME/atcinna@H234598/audios.xz"
mkdir -p "$(dirname "$CACHE_FILE")"

cat > "$TMP_DIR/audios.jsonl" <<'JSONL'
"Audios":["WDR","Genre","Thema","Kurzmeldung","2026-06-04","","","","Kurzbeschreibung","https://example.com/stream","https://example.com"]
"Audios":["","","","Zweite Kurzmeldung","2026-06-04","","","","Noch eine Kurzbeschreibung","https://example.com/second","https://example.com/second-page"]
JSONL

xz -z -c "$TMP_DIR/audios.jsonl" > "$CACHE_FILE"

SEARCH_JSON="$(python3 "$HELPER" search --query "Kurz" --max 1)"
if ! echo "$SEARCH_JSON" | jq -e '.status == "ok" and .count >= 1 and .results[0].title == "Kurzmeldung" and .results[0].url == "https://example.com/stream"' >/dev/null; then
    echo "ERROR: installed helper search validation failed for fixture"
    echo "$SEARCH_JSON"
    exit 1
fi

SEARCH_JSON_TWO="$(python3 "$HELPER" search --query "Zweite" --max 1)"
if ! echo "$SEARCH_JSON_TWO" | jq -e '.status == "ok" and .count == 1 and .results[0].title == "Zweite Kurzmeldung" and .results[0].sender == "WDR" and .results[0].url == "https://example.com/second"' >/dev/null; then
    echo "ERROR: installed helper search for second fixture entry failed"
    echo "$SEARCH_JSON_TWO"
    exit 1
fi

FILTER_PROFILE_SAVE="$(python3 "$HELPER" filter-profile-save --name "Installtest" --search-query "Kurz" --sender "WDR" --blacklist-mode hide --max-hits 5)"
if ! echo "$FILTER_PROFILE_SAVE" | jq -e '.status == "ok" and .profile.name == "Installtest" and .profile.max_hits == 5' >/dev/null; then
    echo "ERROR: installed helper filter-profile-save validation failed"
    echo "$FILTER_PROFILE_SAVE"
    exit 1
fi

SEARCH_DIALOG_SELF_TEST="$(python3 "$SEARCH_DIALOG" --self-test)"
if ! echo "$SEARCH_DIALOG_SELF_TEST" | jq -e '.status == "ok" and (.gtk3 | type == "boolean")' >/dev/null; then
    echo "ERROR: installed search dialog self-test failed"
    echo "$SEARCH_DIALOG_SELF_TEST"
    exit 1
fi

echo "validate-installed ok"
