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

for key in "title-filter" "theme-title-filter" "somewhere-filter" "max-days-filter" "min-duration-filter" "max-duration-filter" "only-new-filter" "only-bookmarks-filter" "hide-history-filter" "podcast-filter" "show-filter-section" "show-info-section" "download-file-name-template" "download-info-file" "download-show-notification" "download-dialog-error-show"; do
    if ! jq -e --arg key "$key" 'has($key)' "$SETTINGS_SCHEMA" >/dev/null; then
        echo "ERROR: settings-schema key missing: $key"
        exit 1
    fi
done
if ! rg -q -F 'this.settings.bind("download-dialog-error-show", "downloadDialogErrorShow", null);' "$APPLET_JS"; then
    echo "ERROR: installed applet does not bind download-dialog-error-show"
    exit 1
fi
if ! rg -q -F 'this.settings.bind("download-file-name-template", "downloadFileNameTemplate", null);' "$APPLET_JS"; then
    echo "ERROR: installed applet does not bind download-file-name-template"
    exit 1
fi
if ! rg -q -F '"download-file-name-template": "%t-%T-%Z.mp4"' "$APPLET_JS"; then
    echo "ERROR: installed applet reset defaults do not restore download-file-name-template"
    exit 1
fi
if ! rg -q -F 'this.settings.setValue("download-file-name-template", defaults["download-file-name-template"]);' "$APPLET_JS"; then
    echo "ERROR: installed applet reset does not persist download-file-name-template"
    exit 1
fi
if ! rg -q -F '"download-dialog-error-show": true' "$APPLET_JS"; then
    echo "ERROR: installed applet reset defaults do not enable download-dialog-error-show"
    exit 1
fi
if ! rg -q -F 'this.settings.setValue("download-dialog-error-show", defaults["download-dialog-error-show"]);' "$APPLET_JS"; then
    echo "ERROR: installed applet reset does not persist download-dialog-error-show"
    exit 1
fi
if ! rg -q -F '_runDownloadErrorList(false)' "$APPLET_JS"; then
    echo "ERROR: installed automatic download error display should not overwrite the active download status"
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
    "on_applet_clicked handles left click": re.compile(
        r"on_applet_clicked\s*\(\s*event\s*\)\s*\{[\s\S]*?\btypeof\s+event\.get_button\s*===\s*['\"]function['\"][\s\S]*?\bevent\.get_button\s*\(\s*\)\s*!==\s*1[\s\S]*?\bthis\.menu\.open\s*\(\s*true\s*\)\s*;",
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
    "Hilfe submenu has web entry": re.compile(
        r"this\._helpWebItem\s*=\s*new\s+PopupMenu\.PopupMenuItem\s*\(\s*['\"]Anleitung im Web['\"]\s*\)",
        re.S,
    ),
    "web help handler is wired": re.compile(
        r"this\._helpWebItem\.connect\s*\(\s*['\"]activate['\"]\s*,\s*\(\s*\)\s*=>\s*\{\s*this\._openWebHelp\s*\(\s*\)\s*;\s*\}\)",
        re.S,
    ),
}

missing = [description for description, pattern in checks.items() if not pattern.search(source)]
if missing:
    for description in missing:
        print(f"ERROR: installed applet contract violation in {source_path}: {description}")
    raise SystemExit(1)
PY

if ! rg -q -F 'label: "URL"' "$APPLET_JS"; then
    echo "ERROR: installed applet info metadata is missing URL clickable row"
    exit 1
fi
if ! rg -q -F 'label: "Website"' "$APPLET_JS"; then
    echo "ERROR: installed applet info metadata is missing Website clickable row"
    exit 1
fi
if ! rg -q -F 'clickable: true' "$APPLET_JS"; then
    echo "ERROR: installed applet info metadata is missing clickable marker"
    exit 1
fi
if ! rg -q -F 'action: (value) => this._xdgOpen(value)' "$APPLET_JS"; then
    echo "ERROR: installed applet info metadata action is not wired to _xdgOpen"
    exit 1
fi
if ! rg -q -F 'const isTuple = Array.isArray(field);' "$APPLET_JS"; then
    echo "ERROR: installed applet info renderer does not support field metadata"
    exit 1
fi

if ! rg -q -F "Audio-URL kopieren" "$APPLET_JS"; then
    echo "ERROR: installed applet label is missing: Audio-URL kopieren"
    exit 1
fi
if ! rg -q -F "Bookmarks anzeigen" "$APPLET_JS"; then
    echo "ERROR: installed applet label is missing: Bookmarks anzeigen"
    exit 1
fi
for applet_label in "Bookmarks löschen" "Alle angelegten Bookmarks löschen"; do
    if ! rg -q -F "${applet_label}" "$APPLET_JS"; then
        echo "ERROR: installed applet label is missing: ${applet_label}"
        exit 1
    fi
done
for applet_label in "Filme als gesehen markieren" "Filme als ungesehen markieren"; do
    if ! rg -q -F "${applet_label}" "$APPLET_JS"; then
        echo "ERROR: installed applet label is missing: ${applet_label}"
        exit 1
    fi
done
if rg -q '_addFilterActions' "$APPLET_JS"; then
    for installed_filter_label in "Filter" "nach Sender filtern" "nach Genre filtern" "nach Thema filtern" "nach Titel filtern" "nach Thema oder Titel filtern" "nach Irgendwo filtern" "nach Sender und Thema filtern" "nach Sender, und Titel filtern"; do
        if ! rg -q -F "${installed_filter_label}" "$APPLET_JS"; then
            echo "ERROR: installed applet filter label is missing: ${installed_filter_label}"
            exit 1
        fi
    done
    if ! rg -q -F '_applyFilterSettings("theme-title-filter", topic || title' "$APPLET_JS"; then
        echo "ERROR: installed applet filter wiring is missing theme-title OR title action"
        exit 1
    fi
    if ! rg -q -F 'status: "Thema oder Titel"' "$APPLET_JS"; then
        echo "ERROR: installed applet theme-title filter status metadata is missing"
        exit 1
    fi
    if ! rg -q -F '_applyFilterSettings("somewhere-filter", title || topic || genre || date || description' "$APPLET_JS"; then
        echo "ERROR: installed applet filter wiring is missing somewhere-filter title || topic || genre || date || description"
        exit 1
    fi
    if ! rg -q -F 'status: "Irgendwo"' "$APPLET_JS"; then
        echo "ERROR: installed applet somewhere filter status metadata is missing"
        exit 1
    fi
fi
for applet_history_entry_action in 'const markShown = new PopupMenu.PopupMenuItem("Filme als gesehen markieren");' 'const markUnshown = new PopupMenu.PopupMenuItem("Filme als ungesehen markieren");'; do
    if ! rg -q -F "${applet_history_entry_action}" "$APPLET_JS"; then
        echo "ERROR: installed applet history entry action label is missing: ${applet_history_entry_action}"
        exit 1
    fi
done
for applet_label in "Alles auswählen" "Auswahl umkehren" "Tabelle zurücksetzen" "Alle markierten Audios abspielen" "Markierte Audios speichern" "Film abspielen" "Film speichern" "Filminformation anzeigen" "Thema in die Zwischenablage kopieren" "Titel in die Zwischenablage kopieren" "Blacklist-Eintrag für den Film erstellen" "Thema direkt in die Blacklist einfügen" "Filme als gesehen markieren" "Filme als ungesehen markieren" "Neue Bookmarks anlegen" "Bookmarks löschen"; do
    if ! rg -q -F "${applet_label}" "$APPLET_JS"; then
        echo "ERROR: installed applet label is missing: ${applet_label}"
        exit 1
    fi
done
for applet_result_action in 'const playMovie = new PopupMenu.PopupMenuItem("Film abspielen");' 'const saveMovie = new PopupMenu.PopupMenuItem("Film speichern");' 'const showInfoMovie = new PopupMenu.PopupMenuItem("Filminformation anzeigen");' 'const copyTopic = new PopupMenu.PopupMenuItem("Thema in die Zwischenablage kopieren");' 'const copyTitle = new PopupMenu.PopupMenuItem("Titel in die Zwischenablage kopieren");' 'const blacklistMovie = new PopupMenu.PopupMenuItem("Blacklist-Eintrag für den Film erstellen");' 'const blacklistTopic = new PopupMenu.PopupMenuItem("Thema direkt in die Blacklist einfügen");'; do
    if ! rg -q -F "${applet_result_action}" "$APPLET_JS"; then
        echo "ERROR: installed applet result top-level action is missing: ${applet_result_action}"
        exit 1
    fi
done
for applet_label in "Download starten" "Downloads aktualisieren" "Downloads starten" "Audio (URL) abspielen" "Download ändern" "Download (URL) kopieren" "Downloads vorziehen" "Downloads zurückstellen" "Downloads stoppen" "Downloads aus Liste entfernen" "Liste der Downloads aufräumen"; do
    if ! rg -q -F "${applet_label}" "$APPLET_JS"; then
        echo "ERROR: installed applet label is missing: ${applet_label}"
        exit 1
    fi
done
for applet_label in "Downloadfehler anzeigen" "Downloadfehler löschen" "Downloadfehler nicht mehr automatisch anzeigen"; do
    if ! rg -q -F "${applet_label}" "$APPLET_JS" "$SETTINGS_SCHEMA"; then
        echo "ERROR: installed download error label is missing: ${applet_label}"
        exit 1
    fi
done
for applet_selected_action in 'const runSelected = new PopupMenu.PopupMenuItem("Downloads starten");' 'const preferSelected = new PopupMenu.PopupMenuItem("Downloads vorziehen");' 'const putBackSelected = new PopupMenu.PopupMenuItem("Downloads zurückstellen");' 'const cancelSelected = new PopupMenu.PopupMenuItem("Downloads stoppen");' 'const removeSelected = new PopupMenu.PopupMenuItem("Downloads aus Liste entfernen");'; do
    if ! rg -q -F "${applet_selected_action}" "$APPLET_JS"; then
        echo "ERROR: installed applet queue selected action label is missing: ${applet_selected_action}"
        exit 1
    fi
done
if ! rg -q -F 'payload.start_now === true' "$APPLET_JS"; then
    echo "ERROR: installed applet does not honor queue edit start_now payload"
    exit 1
fi
if ! rg -q -F "_runQueueRunItem(item);" "$APPLET_JS"; then
    echo "ERROR: installed applet does not start edited queue entry through existing helper"
    exit 1
fi
if ! rg -q -F -- '--start-now=false' "$APPLET_JS"; then
    echo "ERROR: installed applet does not pass explicit start-now argument"
    exit 1
fi
for applet_queue_entry_action in 'const remove = new PopupMenu.PopupMenuItem("Downloads aus Liste entfernen");' 'const prefer = new PopupMenu.PopupMenuItem("Downloads vorziehen");' 'const putBack = new PopupMenu.PopupMenuItem("Downloads zurückstellen");'; do
    if ! rg -q -F "${applet_queue_entry_action}" "$APPLET_JS"; then
        echo "ERROR: installed applet queue entry action label is missing: ${applet_queue_entry_action}"
        exit 1
    fi
done
for applet_queue_entry_action in 'const queueEntryResetSelection = new PopupMenu.PopupMenuItem("Tabelle zurücksetzen");' 'queueEntryResetSelection.connect("activate", () => this._runQueueResetSelection());'; do
    if ! rg -q -F "${applet_queue_entry_action}" "$APPLET_JS"; then
        echo "ERROR: installed applet queue entry action wiring is missing: ${applet_queue_entry_action}"
        exit 1
    fi
done
for applet_label in "Hilfedialog" "Anleitung im Web" "Blacklist verwalten" "Alle Programmeinstellungen zurücksetzen" "Gibt's ein Update?" "Über dieses Programm"; do
    if ! rg -q -F "new PopupMenu.PopupMenuItem(\"${applet_label}\")" "$APPLET_JS"; then
        echo "ERROR: installed help menu label is missing: ${applet_label}"
        exit 1
    fi
done
for applet_top_action in 'const playSelected = new PopupMenu.PopupMenuItem("Audio (URL) abspielen");' 'const playStoredSelected = new PopupMenu.PopupMenuItem("Gespeichertes Audio (Datei) abspielen");' 'const editSelected = new PopupMenu.PopupMenuItem("Download ändern");' 'const copySelected = new PopupMenu.PopupMenuItem("Download (URL) kopieren");'; do
    if ! rg -q -F "${applet_top_action}" "$APPLET_JS"; then
        echo "ERROR: installed applet queue top-level selected media action is missing: ${applet_top_action}"
        exit 1
    fi
done
for applet_result_entry_action in 'const resultEntryResetSelection = new PopupMenu.PopupMenuItem("Tabelle zurücksetzen");' 'resultEntryResetSelection.connect("activate", () => this._runResultResetSelection());'; do
    if ! rg -q -F "${applet_result_entry_action}" "$APPLET_JS"; then
        echo "ERROR: installed applet result entry action wiring is missing: ${applet_result_entry_action}"
        exit 1
    fi
done
for applet_symbol in "_runQueuePlaySelected" "_runQueueOpenStoredSelected" "_runQueueEditSelected" "_runQueueCopySelected" "_runQueueRunSelected" "_runQueuePreferSelected" "_runQueuePutBackSelected" "_queueActionRunSelected" "_queueActionPlaySelected" "_queueActionPlayStoredSelected" "_queueActionEditSelected" "_queueActionCopySelected" "_queueActionPreferSelected" "_queueActionPutBackSelected"; do
    if ! rg -q -F "${applet_symbol}" "$APPLET_JS"; then
        echo "ERROR: installed applet queue selected-run wiring is missing: ${applet_symbol}"
        exit 1
    fi
done
for applet_label in "Abspielen" "Speichern" "Filminformation anzeigen"; do
    if ! rg -q -F "${applet_label}" "$APPLET_JS"; then
        echo "ERROR: installed applet label is missing: ${applet_label}"
        exit 1
    fi
done
for applet_label in "Filter ein-/ausblenden" "Infos ein-/ausblenden"; do
    if ! rg -q -F "${applet_label}" "$APPLET_JS"; then
        echo "ERROR: installed applet label is missing: ${applet_label}"
        exit 1
    fi
done

if ! python3 "$HELPER" --help >"$TMP_DIR/help.out" 2>&1; then
    echo "ERROR: helper --help failed"
    cat "$TMP_DIR/help.out"
    exit 1
fi
if ! rg -q -F '"download-run"' "$HELPER"; then
    echo "ERROR: installed helper action is missing: download-run"
    exit 1
fi
for helper_action in "download-error-list" "download-error-clear" "download-folder-history-list" "download-folder-history-clear"; do
    if ! rg -q -F "${helper_action}" "$HELPER"; then
        echo "ERROR: installed helper action is missing: ${helper_action}"
        exit 1
    fi
done
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
if ! rg -q -F -- "--theme-title" "$HELPER"; then
    echo "ERROR: installed helper does not define --theme-title in help output"
    exit 1
fi
if ! rg -q -F -- "--info-file" "$HELPER"; then
    echo "ERROR: installed helper does not define --info-file in help output"
    exit 1
fi
if ! rg -q -F -- "--download-file-name-template" "$HELPER"; then
    echo "ERROR: installed helper does not define --download-file-name-template"
    exit 1
fi
for blacklist_dialog_label in "Alles auswählen" "Auswahl umkehren" "Tabelle zurücksetzen" "Gelöschte wieder anlegen"; do
    if ! rg -q -F "${blacklist_dialog_label}" "$BLACKLIST_DIALOG"; then
        echo "ERROR: installed blacklist dialog label is missing: ${blacklist_dialog_label}"
        exit 1
    fi
done
for blacklist_dialog_handler in "_set_all_rule_checks" "select_all_rules" "invert_rule_selection" "reset_table_selection" "load_rule_into_form" '"row-activated"'; do
    if ! rg -q -F "${blacklist_dialog_handler}" "$BLACKLIST_DIALOG"; then
        echo "ERROR: installed blacklist dialog selection handler is missing: ${blacklist_dialog_handler}"
        exit 1
    fi
done
if ! rg -q -F "Pfad auswählen" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog label is missing: Pfad auswählen"
    exit 1
fi
if ! rg -q -F "Pfad vorschlagen" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog label is missing: Pfad vorschlagen"
    exit 1
fi
if ! rg -q -F "URL öffnen" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog label is missing: URL öffnen"
    exit 1
fi
if ! rg -q -F "_run_open_url" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog URL action handler is missing: _run_open_url"
    exit 1
fi
if ! rg -q -F "_xdg_open" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog URL action is missing: _xdg_open"
    exit 1
fi
if ! rg -q -F "subprocess.Popen" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog URL action must launch xdg-open without blocking"
    exit 1
fi
if ! rg -q -F 'Infodatei anlegen: "Name.txt"' "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog label is missing: Infodatei anlegen: \"Name.txt\""
    exit 1
fi
if ! rg -q -F "Dateinamensvorlage" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog label is missing: Dateinamensvorlage"
    exit 1
fi
if ! rg -q -F "noch nicht starten" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog label is missing: noch nicht starten"
    exit 1
fi
if ! rg -q -F "sofort starten" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog label is missing: sofort starten"
    exit 1
fi
if ! rg -q -F "Startzeitpunkt:" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog label is missing: Startzeitpunkt:"
    exit 1
fi
if ! rg -q -F "Liste der Pfade löschen" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog label is missing: Liste der Pfade löschen"
    exit 1
fi
if ! rg -q -F -- "--info-file" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog argument is missing: --info-file"
    exit 1
fi
if ! rg -q -F -- "--download-file-name-template" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog argument is missing: --download-file-name-template"
    exit 1
fi
if ! rg -q -F -- "--start-now" "$QUEUE_EDIT_DIALOG"; then
    echo "ERROR: installed queue edit dialog argument is missing: --start-now"
    exit 1
fi
if ! rg -q -F 'download_update.add_argument("--download-file-name-template"' "$HELPER"; then
    echo "ERROR: installed helper download-update parser is missing --download-file-name-template"
    exit 1
fi
for queue_edit_dialog_handler in "_select_download_folder" "_propose_download_folder" "_proposed_download_folder" "_sanitize_topic_folder_name" "_load_xdg_download_dir" "_default_download_folder" "_load_folder_history" "_folder_history_choices" "_clear_folder_history" "_run_open_url" "_xdg_open" "subprocess.Popen" "set_selectable" "set_max_width_chars" "Gtk.FileChooserDialog" 'Gtk.FileChooserAction.SELECT_FOLDER' "get_filename()" 'ResponseType.OK' "set_current_folder" "is_dir()" "Gtk.ComboBoxText.new_with_entry" "remove_all()" "download-folder-history-list" "download-folder-history-clear" "xdg-open"; do
    if ! rg -q -F "${queue_edit_dialog_handler}" "$QUEUE_EDIT_DIALOG"; then
        echo "ERROR: installed queue edit dialog GTK contract is missing: ${queue_edit_dialog_handler}"
        exit 1
    fi
done

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
CATALOG_DB="$XDG_CACHE_HOME/atcinna@H234598/catalog.sqlite"
mkdir -p "$(dirname "$CACHE_FILE")"
rm -f "$CATALOG_DB"

TODAY="$(date +%F)"
OLD_DATE="$(date -d '100 days ago' +%F)"
cat > "$TMP_DIR/audios.jsonl" <<JSONL
"Audios":["WDR","Genre","Thema","Kurzmeldung","${TODAY}","12:00","5","","Kurzbeschreibung","https://example.com/stream","https://example.com","true","false"]
"Audios":["","","","Zweite Kurzmeldung","${TODAY}","12:00","12","","Noch eine Kurzbeschreibung","https://example.com/second","https://example.com/second-page","false","true"]
"Audios":["","","","Archivmeldung","${OLD_DATE}","12:00","15","","Alte Beschreibung","https://example.com/old","https://example.com/old-page","false","false"]
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
if [ ! -f "$CATALOG_DB" ]; then
    echo "ERROR: installed catalog.sqlite was not built from fixture"
    exit 1
fi

mv "$CACHE_FILE" "$CACHE_FILE.bak"
SEARCH_SQLITE_JSON="$(python3 "$HELPER" search --query "Zweite" --max 1)"
if ! echo "$SEARCH_SQLITE_JSON" | jq -e '.status == "ok" and .count == 1 and .results[0].title == "Zweite Kurzmeldung"' >/dev/null; then
    echo "ERROR: installed helper should read search results from catalog.sqlite when audios.xz is missing"
    echo "$SEARCH_SQLITE_JSON"
    exit 1
fi
mv "$CACHE_FILE.bak" "$CACHE_FILE"

cp "$CATALOG_DB" "$CATALOG_DB.bak"
printf "not-a-database" > "$CATALOG_DB"
SEARCH_CORRUPT_DB="$(python3 "$HELPER" search --query "Kurz" --max 1)"
if ! echo "$SEARCH_CORRUPT_DB" | jq -e '.status == "ok" and .count >= 1' >/dev/null; then
    echo "ERROR: installed helper should fall back to audios.xz when catalog.sqlite is corrupt"
    echo "$SEARCH_CORRUPT_DB"
    exit 1
fi
mv "$CATALOG_DB.bak" "$CATALOG_DB"

mkdir -p "$XDG_DATA_HOME/atcinna@H234598"
cat > "$XDG_DATA_HOME/atcinna@H234598/bookmarks.json" <<'JSON'
[{"url":"https://example.com/stream"}]
JSON
cat > "$XDG_DATA_HOME/atcinna@H234598/history.json" <<'JSON'
[{"url":"https://example.com/second"}]
JSON

SEARCH_FILTER_TITLE="$(python3 "$HELPER" search --query "Kurz" --title "Zweite Kurzmeldung" --theme-title "Thema" --somewhere "Noch eine Kurzbeschreibung" --max-days 50 --min-duration 1 --max-duration 60 --max 2)"
if ! echo "$SEARCH_FILTER_TITLE" | jq -e '.status == "ok" and .count == 1 and .results[0].title == "Zweite Kurzmeldung" and .results[0].url == "https://example.com/second"' >/dev/null; then
    echo "ERROR: installed helper search filter validation failed for new filter args"
    echo "$SEARCH_FILTER_TITLE"
    exit 1
fi

SEARCH_MAX_DAYS="$(python3 "$HELPER" search --query "Archiv" --max-days 50 --max 2)"
if ! echo "$SEARCH_MAX_DAYS" | jq -e '.status == "ok" and .count == 0 and (.results | length) == 0' >/dev/null; then
    echo "ERROR: installed helper search max-days validation failed"
    echo "$SEARCH_MAX_DAYS"
    exit 1
fi

SEARCH_ONLY_BOOKMARKS="$(python3 "$HELPER" search --query "Kurz" --only-bookmarks --max 2)"
if ! echo "$SEARCH_ONLY_BOOKMARKS" | jq -e '.status == "ok" and .count == 1 and .results[0].url == "https://example.com/stream"' >/dev/null; then
    echo "ERROR: installed helper search only-bookmarks validation failed"
    echo "$SEARCH_ONLY_BOOKMARKS"
    exit 1
fi

BOOKMARK_CLEAR_INSTALL="$(python3 "$HELPER" bookmark-clear)"
if ! echo "$BOOKMARK_CLEAR_INSTALL" | jq -e '.status == "ok" and .removed == 1' >/dev/null; then
    echo "ERROR: installed helper bookmark-clear validation failed"
    echo "$BOOKMARK_CLEAR_INSTALL"
    exit 1
fi
if ! python3 "$HELPER" bookmark-list | jq -e '.status == "ok" and .count == 0' >/dev/null; then
    echo "ERROR: installed helper bookmark list should be empty after bookmark-clear"
    exit 1
fi
cat > "$XDG_DATA_HOME/atcinna@H234598/bookmarks.json" <<'JSON'
[{"url":"https://example.com/stream"}]
JSON

SEARCH_HIDE_HISTORY="$(python3 "$HELPER" search --query "Kurz" --hide-history --max 2)"
if ! echo "$SEARCH_HIDE_HISTORY" | jq -e '.status == "ok" and .count == 1 and .results[0].url == "https://example.com/stream"' >/dev/null; then
    echo "ERROR: installed helper search hide-history validation failed"
    echo "$SEARCH_HIDE_HISTORY"
    exit 1
fi

HISTORY_REMOVE_INSTALL="$(python3 "$HELPER" history-remove --url "https://example.com/second")"
if ! echo "$HISTORY_REMOVE_INSTALL" | jq -e '.status == "ok" and .removed == true' >/dev/null; then
    echo "ERROR: installed helper history-remove validation failed"
    echo "$HISTORY_REMOVE_INSTALL"
    exit 1
fi
if ! python3 "$HELPER" history-list | jq -e '.status == "ok" and ([.results[] | select(.url=="https://example.com/second")] | length == 0)' >/dev/null; then
    echo "ERROR: installed helper history list should not include removed entry"
    exit 1
fi

SEARCH_DURATION_FILTER="$(python3 "$HELPER" search --query "Kurz" --min-duration 10 --max-duration 20 --max 2)"
if ! echo "$SEARCH_DURATION_FILTER" | jq -e '.status == "ok" and .count == 1 and .results[0].title == "Zweite Kurzmeldung" and .results[0].url == "https://example.com/second"' >/dev/null; then
    echo "ERROR: installed helper search duration filter validation failed"
    echo "$SEARCH_DURATION_FILTER"
    exit 1
fi

SEARCH_ONLY_NEW="$(python3 "$HELPER" search --query "Kurz" --only-new --max 2)"
if ! echo "$SEARCH_ONLY_NEW" | jq -e '.status == "ok" and .count == 1 and .results[0].url == "https://example.com/stream" and .results[0].is_new == true' >/dev/null; then
    echo "ERROR: installed helper search only-new validation failed"
    echo "$SEARCH_ONLY_NEW"
    exit 1
fi

SEARCH_PODCAST_ONLY="$(python3 "$HELPER" search --query "Zweite" --podcast-mode only --max 2)"
if ! echo "$SEARCH_PODCAST_ONLY" | jq -e '.status == "ok" and .count == 1 and .results[0].url == "https://example.com/second" and .results[0].podcast == true' >/dev/null; then
    echo "ERROR: installed helper search podcast-mode only validation failed"
    echo "$SEARCH_PODCAST_ONLY"
    exit 1
fi

SEARCH_PODCAST_NONE="$(python3 "$HELPER" search --query "Zweite" --podcast-mode none --max 2)"
if ! echo "$SEARCH_PODCAST_NONE" | jq -e '.status == "ok" and .count == 0' >/dev/null; then
    echo "ERROR: installed helper search podcast-mode none validation failed"
    echo "$SEARCH_PODCAST_NONE"
    exit 1
fi

FILTER_PROFILE_SAVE="$(python3 "$HELPER" filter-profile-save --name "Installtest" --search-query "Kurz" --sender "WDR" --title "Titel" --theme-title "ThemaTitel" --somewhere "Kurz" --blacklist-mode hide --max-hits 5 --max-days 3 --min-duration 5 --max-duration 55 --only-new --only-bookmarks --hide-history --podcast-mode only)"
if ! echo "$FILTER_PROFILE_SAVE" | jq -e '.status == "ok" and .profile.name == "Installtest" and .profile.max_hits == 5 and .profile.title == "Titel" and .profile.theme_title == "ThemaTitel" and .profile.somewhere == "Kurz" and .profile.max_days == 3 and .profile.min_duration == 5 and .profile.max_duration == 55 and .profile.only_new == true and .profile.only_bookmarks == true and .profile.hide_history == true and .profile.podcast_mode == "only"' >/dev/null; then
    echo "ERROR: installed helper filter-profile-save validation failed"
    echo "$FILTER_PROFILE_SAVE"
    exit 1
fi

BLACKLIST_THEME_TITLE_INSTALL_ADD="$(python3 "$HELPER" blacklist-add --theme-title "ZWEITE KURZ")"
if ! echo "$BLACKLIST_THEME_TITLE_INSTALL_ADD" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: installed helper blacklist-add --theme-title failed"
    echo "$BLACKLIST_THEME_TITLE_INSTALL_ADD"
    exit 1
fi
SEARCH_BLACKLIST_THEME_TITLE_INSTALL="$(python3 "$HELPER" search --query "" --blacklist-mode only)"
if ! echo "$SEARCH_BLACKLIST_THEME_TITLE_INSTALL" | jq -e '.status == "ok" and ([.results[] | select(.title=="Zweite Kurzmeldung")] | length) == 1' >/dev/null; then
    echo "ERROR: installed helper theme-title blacklist matching failed"
    echo "$SEARCH_BLACKLIST_THEME_TITLE_INSTALL"
    exit 1
fi
if ! python3 "$HELPER" blacklist-remove --theme-title "ZWEITE KURZ" >/dev/null; then
    echo "ERROR: installed helper blacklist-remove --theme-title failed"
    exit 1
fi

BLACKLIST_EXCLUDE_GENRE_INSTALL="$(python3 "$HELPER" blacklist-add --genre "!:Genre")"
if ! echo "$BLACKLIST_EXCLUDE_GENRE_INSTALL" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: installed helper blacklist-add with negated genre failed"
    echo "$BLACKLIST_EXCLUDE_GENRE_INSTALL"
    exit 1
fi
SEARCH_BLACKLIST_EXCLUDE_GENRE_INSTALL="$(python3 "$HELPER" search --query "" --blacklist-mode hide)"
if ! echo "$SEARCH_BLACKLIST_EXCLUDE_GENRE_INSTALL" | jq -e '.status == "ok" and .count == 3' >/dev/null; then
    echo "ERROR: installed helper negated genre blacklist matching failed"
    echo "$SEARCH_BLACKLIST_EXCLUDE_GENRE_INSTALL"
    exit 1
fi
if ! python3 "$HELPER" blacklist-clear >/dev/null; then
    echo "ERROR: installed helper blacklist-clear failed after negated genre validation"
    exit 1
fi

BLACKLIST_REJECT_REGEX_INSTALL="$(python3 "$HELPER" blacklist-add --sender "#:wdr" 2>&1 || true)"
if ! echo "$BLACKLIST_REJECT_REGEX_INSTALL" | jq -e '.status == "error" and (.message | test("not supported"))' >/dev/null; then
    echo "ERROR: installed helper blacklist-add should reject regex prefix '#:'"
    echo "$BLACKLIST_REJECT_REGEX_INSTALL"
    exit 1
fi

BLACKLIST_REJECT_COMBINED_REGEX_INSTALL="$(python3 "$HELPER" blacklist-add --genre "!:#wdr" 2>&1 || true)"
if ! echo "$BLACKLIST_REJECT_COMBINED_REGEX_INSTALL" | jq -e '.status == "error" and (.message | test("not supported"))' >/dev/null; then
    echo "ERROR: installed helper blacklist-add should reject regex prefix '!:#'"
    echo "$BLACKLIST_REJECT_COMBINED_REGEX_INSTALL"
    exit 1
fi

BLACKLIST_EMPTY_NEGATED_INSTALL="$(python3 "$HELPER" blacklist-add --genre "!:" 2>&1 || true)"
if ! echo "$BLACKLIST_EMPTY_NEGATED_INSTALL" | jq -e '.status == "error" and .message == "at least one blacklist field is required"' >/dev/null; then
    echo "ERROR: installed helper blacklist-add should reject empty negated value"
    echo "$BLACKLIST_EMPTY_NEGATED_INSTALL"
    exit 1
fi

BLACKLIST_MODE_HIDE_ONLY_INSTALL="$(python3 "$HELPER" blacklist-add --title "!:Zweite Kurz")"
if ! echo "$BLACKLIST_MODE_HIDE_ONLY_INSTALL" | jq -e '.status == "ok"' >/dev/null; then
    echo "ERROR: installed helper blacklist negation setup for hide/only failed"
    echo "$BLACKLIST_MODE_HIDE_ONLY_INSTALL"
    exit 1
fi
SEARCH_BLACKLIST_ONLY_INSTALL="$(python3 "$HELPER" search --query "" --blacklist-mode only)"
if ! echo "$SEARCH_BLACKLIST_ONLY_INSTALL" | jq -e '.status == "ok" and .count == 2 and all(.results[]; .title != "Zweite Kurzmeldung")' >/dev/null; then
    echo "ERROR: installed helper blacklist mode only failed for negated title rule"
    echo "$SEARCH_BLACKLIST_ONLY_INSTALL"
    exit 1
fi
SEARCH_BLACKLIST_HIDE_INSTALL="$(python3 "$HELPER" search --query "" --blacklist-mode hide)"
if ! echo "$SEARCH_BLACKLIST_HIDE_INSTALL" | jq -e '.status == "ok" and .count == 1 and any(.results[]; .title == "Zweite Kurzmeldung")' >/dev/null; then
    echo "ERROR: installed helper blacklist mode hide failed for negated title rule"
    echo "$SEARCH_BLACKLIST_HIDE_INSTALL"
    exit 1
fi
if ! python3 "$HELPER" blacklist-clear >/dev/null; then
    echo "ERROR: installed helper blacklist-clear failed after hide/only validation"
    exit 1
fi

cat > "$TMP_DIR/installed_atplayer_history.txt" <<'TEXT'
2026-06-05 |#| Theme Installed |#| Titel Installed  |###|  https://example.com/installed/imported
ftp://example.com/installed/skip
https://example.com/installed/existing
TEXT
cat > "$XDG_DATA_HOME/atcinna@H234598/history.json" <<'JSON'
[{"title":"Existing", "sender":"", "genre":"", "topic":"", "date":"2026-01-01", "time":"", "duration":"", "description":"", "url":"https://example.com/installed/existing", "website":"", "timestamp":1}]
JSON
INST_HISTORY_IMPORT="$(python3 "$HELPER" atplayer-history-import --source "$TMP_DIR/installed_atplayer_history.txt" --target history)"
if ! echo "$INST_HISTORY_IMPORT" | jq -e '.status == "ok" and .target == "history" and .imported == 2 and .skipped == 1 and .count == 2' >/dev/null; then
    echo "ERROR: installed history import should dedupe and skip non-http URLs"
    echo "$INST_HISTORY_IMPORT"
    exit 1
fi
INST_HISTORY_LIST="$(python3 "$HELPER" history-list)"
if ! echo "$INST_HISTORY_LIST" | jq -e '.status == "ok" and .results[0].url == "https://example.com/installed/existing" and .results[1].url == "https://example.com/installed/imported"' >/dev/null; then
    echo "ERROR: installed history import should move duplicated URL to front"
    echo "$INST_HISTORY_LIST"
    exit 1
fi
INST_HISTORY_EXPORT="$(python3 "$HELPER" atplayer-history-export --output "$TMP_DIR/installed_history_export.txt" --target history)"
if ! echo "$INST_HISTORY_EXPORT" | jq -e '.status == "ok" and .target == "history" and .exported == 2' >/dev/null; then
    echo "ERROR: installed history export should write HTTP-only entries"
    echo "$INST_HISTORY_EXPORT"
    exit 1
fi
INST_ROUNDTRIP_EXPORT="$(python3 "$HELPER" atplayer-history-export --output "$TMP_DIR/installed_roundtrip.txt" --target history)"
if ! echo "$INST_ROUNDTRIP_EXPORT" | jq -e '.status == "ok" and .exported == 2 and .skipped == 0' >/dev/null; then
    echo "ERROR: installed history export roundtrip base should include exported entries"
    echo "$INST_ROUNDTRIP_EXPORT"
    exit 1
fi
cat > "$XDG_DATA_HOME/atcinna@H234598/history.json" <<'JSON'
[]
JSON
INST_ROUNDTRIP_IMPORT="$(python3 "$HELPER" atplayer-history-import --source "$TMP_DIR/installed_roundtrip.txt" --target history)"
if ! echo "$INST_ROUNDTRIP_IMPORT" | jq -e '.status == "ok" and .target == "history" and .imported == 2 and .skipped == 0' >/dev/null; then
    echo "ERROR: installed history import roundtrip should restore entries"
    echo "$INST_ROUNDTRIP_IMPORT"
    exit 1
fi

cat > "$TMP_DIR/installed_atplayer_bookmark.txt" <<'TEXT'
https://example.com/installed/bookmark/1
ftp://example.com/installed/bookmark/skip
https://example.com/installed/bookmark/2
TEXT
cat > "$XDG_DATA_HOME/atcinna@H234598/bookmarks.json" <<'JSON'
[]
JSON
INST_BOOKMARK_IMPORT="$(python3 "$HELPER" atplayer-history-import --source "$TMP_DIR/installed_atplayer_bookmark.txt" --target bookmarks)"
if ! echo "$INST_BOOKMARK_IMPORT" | jq -e '.status == "ok" and .target == "bookmarks" and .imported == 2 and .skipped == 1' >/dev/null; then
    echo "ERROR: installed bookmark import should skip non-http URLs"
    echo "$INST_BOOKMARK_IMPORT"
    exit 1
fi
INST_BOOKMARK_EXPORT="$(python3 "$HELPER" atplayer-history-export --output "$TMP_DIR/installed_bookmark_export.txt" --target bookmarks)"
if ! echo "$INST_BOOKMARK_EXPORT" | jq -e '.status == "ok" and .target == "bookmarks" and .exported == 2' >/dev/null; then
    echo "ERROR: installed bookmark export should include imported entries"
    echo "$INST_BOOKMARK_EXPORT"
    exit 1
fi

SEARCH_DIALOG_SELF_TEST="$(python3 "$SEARCH_DIALOG" --self-test)"
if ! echo "$SEARCH_DIALOG_SELF_TEST" | jq -e '.status == "ok" and (.gtk3 | type == "boolean")' >/dev/null; then
    echo "ERROR: installed search dialog self-test failed"
    echo "$SEARCH_DIALOG_SELF_TEST"
    exit 1
fi

echo "validate-installed ok"
