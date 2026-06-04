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
APPLET_JS="$APPLET_DIR/applet.js"
SETTINGS_SCHEMA="$APPLET_DIR/settings-schema.json"
METADATA_JSON="$APPLET_DIR/metadata.json"
TMP_DIR="$(mktemp -d)"

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
    "$HELPER"; do
    if [[ ! -f "$required_file" ]]; then
        echo "ERROR: expected installed file missing: $required_file"
        exit 1
    fi
done

if [[ ! -x "$HELPER" ]]; then
    echo "ERROR: helper not executable: $HELPER"
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

if ! python3 "$HELPER" --help >"$TMP_DIR/help.out" 2>&1; then
    echo "ERROR: helper --help failed"
    cat "$TMP_DIR/help.out"
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

echo "validate-installed ok"
