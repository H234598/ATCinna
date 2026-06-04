#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLET_ID="atcinna@H234598"
ATCINNA_DBUS_SERVICE="org.Cinnamon.Applets.ATCinna"
ATCINNA_DBUS_PATH="/org/Cinnamon/Applets/ATCinna"
ATCINNA_DBUS_INTERFACE="org.Cinnamon.Applets.ATCinna"
EXPECTED_VERSION="$(tr -d '[:space:]' < "$SCRIPT_DIR/../VERSION")"
GSETTINGS_SCHEMA="org.cinnamon"
ENABLED_APPLETS_KEY="enabled-applets"
NEXT_APPLET_ID_KEY="next-applet-id"
VALIDATE_SCRIPT="$SCRIPT_DIR/validate-installed.sh"
CINNAMON_TIMEOUT_SECONDS=15
ACTIVATE_TEMP=0
RESTORE_DONE=0

usage() {
    cat <<'EOF'
Usage:
  ./scripts/runtime-smoke.sh [--activate-temporarily] [--timeout SECONDS]

Options:
  --activate-temporarily   Temporarily add the applet to the panel for runtime checks and restore state afterwards
  --timeout SECONDS        Timeout for runtime mutation flow (default: 15)
  -h, --help              Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --activate-temporarily)
            ACTIVATE_TEMP=1
            shift
            ;;
        --timeout)
            if [[ $# -lt 2 ]]; then
                echo "ERROR: --timeout requires a number argument"
                usage
                exit 1
            fi
            CINNAMON_TIMEOUT_SECONDS="$2"
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

if ! [[ "$CINNAMON_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || [[ "$CINNAMON_TIMEOUT_SECONDS" -lt 1 ]]; then
    echo "ERROR: --timeout must be a positive integer"
    exit 1
fi

require_command() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "ERROR: required command missing: $cmd"
        exit 1
    fi
}

require_command gsettings
require_command gdbus
require_command jq

if [[ ! -x "$VALIDATE_SCRIPT" ]]; then
    echo "ERROR: validate script is not executable: $VALIDATE_SCRIPT"
    exit 1
fi

cinnamon_method_call() {
    local method="$1"
    local output=""
    shift
    if [[ "$#" -gt 0 ]]; then
        output="$(gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon --method "org.Cinnamon.${method}" "$@")"
    else
        output="$(gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon --method "org.Cinnamon.${method}")"
    fi
    printf '%s\n' "$output"
}

looking_glass_reload_extension() {
    if ! gdbus call \
        --session \
        --dest org.Cinnamon \
        --object-path /org/Cinnamon/LookingGlass \
        --method org.Cinnamon.LookingGlass.ReloadExtension \
        "$APPLET_ID" \
        APPLET >/dev/null; then
        echo "ERROR: LookingGlass ReloadExtension failed for ${APPLET_ID}"
        return 1
    fi
}

dbus_available() {
    if ! gdbus introspect --session --dest org.Cinnamon --object-path /org/Cinnamon >/dev/null 2>&1; then
        return 1
    fi
}

gsettings_get_json_array() {
    local key="$1"
    local raw json
    raw="$(gsettings get "$GSETTINGS_SCHEMA" "$key" || true)"
    if [[ -z "$raw" ]]; then
        echo "ERROR: gsettings key missing: $key"
        return 1
    fi
    json="$(printf '%s' "$raw" | tr "'" '"')"
    if ! jq -e . <<<"$json" >/dev/null 2>&1; then
        echo "ERROR: cannot parse gsettings key as json array: $key"
        return 1
    fi
    jq -c . <<<"$json"
}

gsettings_set_array() {
    local key="$1"
    local json="$2"
    if ! gsettings set "$GSETTINGS_SCHEMA" "$key" "$json"; then
        echo "ERROR: failed to set gsettings key: $key"
        return 1
    fi
}

parse_eval_result() {
    local output="$1"
    local success result_quoted value

    if [[ ! "$output" =~ ^\((true|false),[[:space:]](.*)\)$ ]]; then
        echo "ERROR: unexpected Eval response: $output"
        return 1
    fi
    success="${BASH_REMATCH[1]}"
    result_quoted="${BASH_REMATCH[2]}"

    if [[ "$success" != "true" ]]; then
        echo "ERROR: Eval reported failure: $result_quoted"
        return 1
    fi

    if [[ "$result_quoted" == \'*\' ]]; then
        result_quoted="${result_quoted:1:${#result_quoted}-2}"
    fi

    if [[ "$result_quoted" != \"* ]]; then
        printf '%s\n' "$result_quoted"
        return 0
    fi

    value="$(printf '%s\n' "$result_quoted" | jq -r . 2>/dev/null || true)"
    if [[ -z "$value" ]]; then
        echo "ERROR: Eval response value is empty"
        return 1
    fi

    printf '%s\n' "$value"
}

parse_gdbus_string_output() {
    local output="$1"
    python3 - "$output" <<'PY'
import ast
import sys

raw = sys.argv[1].strip()
if not raw:
    print("ERROR: empty dbus response", file=sys.stderr)
    raise SystemExit(1)

try:
    value = ast.literal_eval(raw)
except Exception as error:
    print(f"ERROR: cannot parse dbus response: {error}", file=sys.stderr)
    raise SystemExit(1)

if isinstance(value, tuple):
    if len(value) != 1:
        print(f"ERROR: unexpected dbus tuple response: {value!r}", file=sys.stderr)
        raise SystemExit(1)
    value = value[0]
elif isinstance(value, str):
    pass
else:
    print(f"ERROR: unexpected dbus payload type: {type(value)}", file=sys.stderr)
    raise SystemExit(1)

print(value)
PY
}

check_atcinna_dbus() {
    local ping_output status_output ping_response status_json profile_json apply_output apply_json

    if ! ping_output="$(gdbus call --session --dest "$ATCINNA_DBUS_SERVICE" --object-path "$ATCINNA_DBUS_PATH" --method "${ATCINNA_DBUS_INTERFACE}.Ping")"; then
        echo "ERROR: DBus Ping call failed"
        return 1
    fi

    if ! ping_response="$(parse_gdbus_string_output "$ping_output")"; then
        echo "ERROR: failed to parse DBus Ping response: $ping_output"
        return 1
    fi
    if [[ "$ping_response" != "pong" ]]; then
        echo "ERROR: DBus Ping response unexpected: $ping_response"
        return 1
    fi

    if ! status_output="$(gdbus call --session --dest "$ATCINNA_DBUS_SERVICE" --object-path "$ATCINNA_DBUS_PATH" --method "${ATCINNA_DBUS_INTERFACE}.GetStatus")"; then
        echo "ERROR: DBus GetStatus call failed"
        return 1
    fi

    if ! status_json="$(parse_gdbus_string_output "$status_output")"; then
        echo "ERROR: failed to parse DBus GetStatus response: $status_output"
        return 1
    fi

    if ! jq -e '.status == "ok"' <<<"$status_json" >/dev/null 2>&1; then
        echo "ERROR: GetStatus status field is not ok"
        return 1
    fi
    if ! jq -e '.status | type == "string"' <<<"$status_json" >/dev/null 2>&1; then
        echo "ERROR: GetStatus status field is not a string"
        return 1
    fi
    if ! jq -e '.uuid == "atcinna@H234598"' <<<"$status_json" >/dev/null 2>&1; then
        echo "ERROR: GetStatus uuid field invalid"
        return 1
    fi
    if ! jq -e '.uuid | type == "string"' <<<"$status_json" >/dev/null 2>&1; then
        echo "ERROR: GetStatus uuid field is not a string"
        return 1
    fi
    if ! jq -e 'has("instanceId") and (.instanceId | type == "string")' <<<"$status_json" >/dev/null 2>&1; then
        echo "ERROR: GetStatus instanceId field missing"
        return 1
    fi
    if ! jq -e --arg version "$EXPECTED_VERSION" '.version == $version' <<<"$status_json" >/dev/null 2>&1; then
        echo "ERROR: GetStatus version field invalid"
        return 1
    fi
    if ! jq -e --arg path "$ATCINNA_DBUS_PATH" '.dbusPath == $path' <<<"$status_json" >/dev/null 2>&1; then
        echo "ERROR: GetStatus dbusPath field invalid"
        return 1
    fi
    if ! jq -e '.hasHelper == true' <<<"$status_json" >/dev/null 2>&1; then
        echo "ERROR: GetStatus hasHelper field is not true"
        return 1
    fi
    if ! profile_json="$(jq -c '{
        name: "runtime-smoke-current",
        search_query: (.activeSearchQuery // ""),
        sender: (.senderFilter // ""),
        genre: (.genreFilter // ""),
        topic: (.topicFilter // ""),
        title: (.titleFilter // ""),
        theme_title: (.themeTitleFilter // ""),
        somewhere: (.somewhereFilter // ""),
        max_days: (.maxDaysFilter // 0),
        min_duration: (.minDurationFilter // 0),
        max_duration: (.maxDurationFilter // 150),
        only_new: (.onlyNewFilter // false),
        only_bookmarks: (.onlyBookmarksFilter // false),
        hide_history: (.hideHistoryFilter // false),
        podcast_mode: (.podcastFilter // "all"),
        blacklist_mode: (.blacklistMode // "hide"),
        max_hits: (.maxHits // 20)
    }' <<<"$status_json")"; then
        echo "ERROR: failed to build ApplyFilterProfile smoke profile"
        return 1
    fi
    if ! apply_output="$(gdbus call --session --dest "$ATCINNA_DBUS_SERVICE" --object-path "$ATCINNA_DBUS_PATH" --method "${ATCINNA_DBUS_INTERFACE}.ApplyFilterProfile" "$profile_json")"; then
        echo "ERROR: DBus ApplyFilterProfile call failed"
        return 1
    fi
    if ! apply_json="$(parse_gdbus_string_output "$apply_output")"; then
        echo "ERROR: failed to parse DBus ApplyFilterProfile response: $apply_output"
        return 1
    fi
    if ! jq -e '.status == "ok"' <<<"$apply_json" >/dev/null 2>&1; then
        echo "ERROR: ApplyFilterProfile status field is not ok"
        return 1
    fi
    return 0
}

check_atcinna_dbus_unavailable() {
    if gdbus call --session --dest "$ATCINNA_DBUS_SERVICE" --object-path "$ATCINNA_DBUS_PATH" --method "${ATCINNA_DBUS_INTERFACE}.Ping" >/dev/null 2>&1; then
        echo "ERROR: ATCinna DBus service still responds after restore"
        return 1
    fi
}

get_running_xlet_uuids() {
    local output json_array
    output="$(cinnamon_method_call GetRunningXletUUIDs applet)"
    if [[ ! "$output" =~ ^\((.*),\)$ ]]; then
        echo "ERROR: unexpected GetRunningXletUUIDs response: $output"
        return 1
    fi
    json_array="${BASH_REMATCH[1]}"
    json_array="$(printf '%s' "$json_array" | tr "'" '"')"
    if ! jq -e . <<<"$json_array" >/dev/null 2>&1; then
        echo "ERROR: invalid GetRunningXletUUIDs payload: $json_array"
        return 1
    fi
    printf '%s\n' "$json_array"
}

get_applet_instances_via_eval() {
    local script output parsed ids
    script='(function(){ let defs = imports.ui.appletManager.filterDefinitionsByUUID("'"$APPLET_ID"'").filter(function(entry){ return entry.applet != null; }); return "ids:" + defs.map(function(entry){ return String(entry.applet_id); }).join(","); })()'
    output="$(cinnamon_method_call Eval "$script")"
    parsed="$(parse_eval_result "$output")"
    if [[ "$parsed" != ids:* ]]; then
        echo "ERROR: Eval result is not an instance id payload: $parsed"
        return 1
    fi
    ids="${parsed#ids:}"
    jq -cn --arg ids "$ids" --arg uuid "$APPLET_ID" '$ids | split(",") | map(select(length > 0) | {uuid: $uuid, applet_id: .})'
}

wait_for_restored_runtime_state() {
    local start_time restored_running restored_instances
    start_time="$(date +%s)"

    while true; do
        restored_running="$(get_running_xlet_uuids || printf '[]')"
        restored_instances="$(get_applet_instances_via_eval || printf '[]')"

        if [[ "$atcinna_active_count" -gt 0 ]]; then
            if jq -e --arg id "$APPLET_ID" '[.[] | select(.uuid == $id and .applet_id != null)] | length > 0' <<<"$restored_instances" >/dev/null 2>&1; then
                return 0
            fi
        else
            if jq --arg id "$APPLET_ID" -e 'map(select(. == $id)) | length == 0' <<<"$restored_running" >/dev/null 2>&1 \
                && jq -e --arg id "$APPLET_ID" '[.[] | select(.uuid == $id)] | length == 0' <<<"$restored_instances" >/dev/null 2>&1; then
                return 0
            fi
        fi

        if [[ "$(($(date +%s)-start_time))" -ge "$CINNAMON_TIMEOUT_SECONDS" ]]; then
            echo "ERROR: timeout waiting for restored ATCinna runtime state (${CINNAMON_TIMEOUT_SECONDS}s)"
            echo "INFO: restored running UUIDs: $restored_running"
            echo "INFO: restored appletManager instances: $restored_instances"
            return 1
        fi
        sleep 0.25
    done
}

wait_for_definition_presence() {
    local start_time current_running
    start_time="$(date +%s)"

    while true; do
        current_running="$(get_running_xlet_uuids)"
        if jq --arg id "$APPLET_ID" -e 'map(select(. == $id)) | length > 0' <<<"$current_running" >/dev/null 2>&1; then
            return 0
        fi
        if [[ "$(($(date +%s)-start_time))" -ge "$CINNAMON_TIMEOUT_SECONDS" ]]; then
            echo "ERROR: timeout waiting for ATCinna definition after enabled-applets update (${CINNAMON_TIMEOUT_SECONDS}s)"
            echo "INFO: current running UUID definitions: $current_running"
            return 1
        fi
        sleep 0.25
    done
}

require_applet_version() {
    if ! "$VALIDATE_SCRIPT"; then
        return 1
    fi
}

if ! dbus_available; then
    echo "ERROR: Cinnamon DBus service org.Cinnamon not reachable"
    exit 1
fi
echo "INFO: Cinnamon DBus reachable on org.Cinnamon"

if ! require_applet_version; then
    echo "ERROR: validate-installed.sh reported issues"
    exit 1
fi
echo "INFO: validate-installed.sh check passed"

original_enabled_json="$(gsettings_get_json_array "$ENABLED_APPLETS_KEY")"
original_next_id="$(gsettings get "$GSETTINGS_SCHEMA" "$NEXT_APPLET_ID_KEY" || true)"
if [[ -z "$original_next_id" ]]; then
    echo "ERROR: unable to read gsettings key: $NEXT_APPLET_ID_KEY"
    exit 1
fi

restore_state() {
    local restore_rc=0
    if [[ "$RESTORE_DONE" -eq 1 ]]; then
        return 0
    fi
    if [[ "$ACTIVATE_TEMP" -eq 1 ]]; then
        if ! gsettings set "$GSETTINGS_SCHEMA" "$NEXT_APPLET_ID_KEY" "$original_next_id"; then
            echo "WARN: failed to restore gsettings key: $NEXT_APPLET_ID_KEY"
            restore_rc=1
        fi
        if ! gsettings_set_array "$ENABLED_APPLETS_KEY" "$original_enabled_json"; then
            echo "WARN: failed to restore gsettings key: $ENABLED_APPLETS_KEY"
            restore_rc=1
        fi
        if [[ "$restore_rc" -ne 0 ]]; then
            echo "WARN: restore did not complete cleanly"
        fi
    fi
    RESTORE_DONE=1
}
trap restore_state EXIT
trap 'restore_state; exit 130' INT
trap 'restore_state; exit 143' TERM

running_uuid_list="$(get_running_xlet_uuids)"
if ! atcinna_active_count="$(jq --arg id "$APPLET_ID" '[.[] | select(. == $id)] | length' <<<"$running_uuid_list")"; then
    echo "ERROR: failed to inspect running UUID list"
    exit 1
fi
if [[ "$atcinna_active_count" -gt 0 ]]; then
    echo "INFO: ATCinna currently running (GetRunningXletUUIDs): $atcinna_active_count"
else
    echo "INFO: ATCinna currently not running"
fi

if [[ "$ACTIVATE_TEMP" -eq 1 ]]; then
    already_running="$([[ "$atcinna_active_count" -gt 0 ]] && echo true || echo false)"
    echo "INFO: temporary runtime mode enabled"

    if ! output_instances="$(get_applet_instances_via_eval)"; then
        echo "ERROR: failed to query appletManager instances"
        exit 1
    fi
    echo "INFO: appletManager pre-check: $output_instances"

    if [[ "$already_running" == "true" ]]; then
        looking_glass_reload_extension
    else
        next_id="$(gsettings get "$GSETTINGS_SCHEMA" "$NEXT_APPLET_ID_KEY" || true)"
        if [[ -z "$next_id" ]] || ! [[ "$next_id" =~ ^[0-9]+$ ]]; then
            echo "ERROR: invalid next applet id: $next_id"
            exit 1
        fi
        new_definition="panel1:right:99:${APPLET_ID}:${next_id}"
        new_enabled="$(jq -c --arg new "$new_definition" '. + [$new]' <<<"$original_enabled_json")"
        gsettings_set_array "$ENABLED_APPLETS_KEY" "$new_enabled"
        if ! gsettings set "$GSETTINGS_SCHEMA" "$NEXT_APPLET_ID_KEY" "$((next_id + 1))"; then
            echo "ERROR: failed to bump next-applet-id"
            exit 1
        fi
        wait_for_definition_presence
        looking_glass_reload_extension
    fi

    start_time="$(date +%s)"
    while true; do
        running_uuid_list="$(get_running_xlet_uuids)"
        output_instances="$(get_applet_instances_via_eval || true)"
        if jq -e --arg id "$APPLET_ID" '[.[] | select(.uuid == $id and .applet_id != null)] | length > 0' <<<"$output_instances" >/dev/null 2>&1; then
            break
        fi
        if [[ "$(($(date +%s)-start_time))" -ge "$CINNAMON_TIMEOUT_SECONDS" ]]; then
            echo "ERROR: timeout waiting for ATCinna instance after temporary activation (${CINNAMON_TIMEOUT_SECONDS}s)"
            echo "INFO: current running UUID definitions: $running_uuid_list"
            echo "INFO: current appletManager instances: $output_instances"
            exit 1
        fi
        sleep 0.25
    done

    final_running="$(get_running_xlet_uuids)"
    final_instances="$(get_applet_instances_via_eval)"
    echo "INFO: GetRunningXletUUIDs after temporary path: $final_running"
    echo "INFO: appletManager after temporary path: $final_instances"
else
    if ! output_instances="$(get_applet_instances_via_eval)"; then
        echo "ERROR: failed to query appletManager instances"
        exit 1
    fi
    echo "INFO: appletManager baseline: $output_instances"
fi

if [[ "$atcinna_active_count" -gt 0 ]] || [[ "$ACTIVATE_TEMP" -eq 1 ]]; then
    if ! instances="$(get_applet_instances_via_eval)"; then
        echo "ERROR: unable to validate applet instances"
        exit 1
    fi
    if ! jq -e --arg id "$APPLET_ID" '.[] | select(.uuid == $id) | .applet_id' <<<"$instances" >/dev/null 2>&1; then
        echo "ERROR: no appletManager instance found for uuid ${APPLET_ID}"
        exit 1
    fi

    if ! check_atcinna_dbus; then
        echo "ERROR: DBus status checks failed"
        exit 1
    fi
fi

if [[ "$atcinna_active_count" -gt 0 ]]; then
    if [[ "$ACTIVATE_TEMP" -ne 1 ]]; then
        running_after_check="$(get_running_xlet_uuids)"
        echo "INFO: baseline applet instances from running UUID list: $running_after_check"
    fi
fi

if [[ "$ACTIVATE_TEMP" -eq 1 ]]; then
    restore_state
    wait_for_restored_runtime_state
    if [[ "$atcinna_active_count" -eq 0 ]]; then
        check_atcinna_dbus_unavailable
    fi
    restored_enabled="$(gsettings_get_json_array "$ENABLED_APPLETS_KEY")"
    restored_next="$(gsettings get "$GSETTINGS_SCHEMA" "$NEXT_APPLET_ID_KEY" || true)"
    if [[ "$restored_enabled" != "$original_enabled_json" ]]; then
        echo "ERROR: enabled-applets did not restore as expected"
        exit 1
    fi
    if [[ "$restored_next" != "$original_next_id" ]]; then
        echo "ERROR: next-applet-id did not restore as expected"
        exit 1
    fi
    echo "INFO: restore verification passed"
fi

echo "runtime-smoke ok"
