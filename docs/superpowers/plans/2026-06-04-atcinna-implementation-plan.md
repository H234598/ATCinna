# ATCinna Implementation Plan

> **For agentic Arbeitsbienen:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ATCinna as a Java-free Cinnamon applet that searches, plays, opens, and downloads entries from the ATPlayer-compatible audio catalog.

**Architecture:** Keep the applet UI in Cinnamon JavaScript and keep catalog work in a small Python helper. The helper owns network, cache parsing, search, and download operations; the applet owns panel state, settings, menu rendering, and non-blocking subprocess calls. The legacy ATPlayer Java application is only a format and behavior reference.

**Tech Stack:** Cinnamon 6.6 applet API, GJS/CJS-style Cinnamon JavaScript, Python 3 standard library, `curl`, `jq`, `shellcheck`.

---

## Current Baseline

- `VERSION` is `0.3.47`.
- `atcinna@H234598/applet.js` provides the Cinnamon applet shell, popup search input, filter summary, refresh action, result rendering, history/bookmark sections, and play/open/download handoff.
- `atcinna@H234598/scripts/atcinna-catalog` provides `refresh`, filtered `search`, Blacklist search modes, direct `download`, `download-*` queue actions including targeted `download-run --url`, `download-update`, `history-*`, and `bookmark-*`.
- `atcinna@H234598/scripts/atcinna-search-dialog`, `atcinna@H234598/scripts/atcinna-queue-edit-dialog`, `atcinna@H234598/scripts/atcinna-blacklist-dialog`, and `atcinna@H234598/scripts/atcinna-filter-profiles-dialog` provide optional external GTK dialogs used by popup actions; the primary in-popup search remains active when GTK is unavailable.
- `scripts/check.sh` is the local quality gate and includes a non-mutating installed-tree validation selftest.

### Quick Follow-up

- [x] **Task 8: Add settings launcher in applet menu**
  - Add a menu item **Einstellungen** in `atcinna@H234598/applet.js`.
  - Keep `on_applet_clicked(event)` as the left-click applet menu opener.
  - Add static `scripts/check.sh` checks for click/menu invariants (`on_applet_clicked(event)`, `this.menu.open(true)`, Einstellungen item, `configureApplet()` wiring).

### Task 21: ATPlayer-near Filters + Profile parity markers (0.3.21)

- [x] **ATPlayer-nahe zusätzliche Suchfilter in 0.3.21 dokumentieren und stabilisieren**
  - Additional filter fields are now part of the filter stack: `title`, `theme_title`, `somewhere`, `max_days`, `min_duration`, `max_duration`, `only_bookmarks`, `hide_history`.
  - `filter-profile-*` store/load paths must carry these fields for persistence and restore behavior.
  - Update task text and docs to avoid claiming ATPlayer parity is complete while these 0.3.21 filter updates are in use.

- [x] **0.3.21 status in user-visible docs**
  - Keep `on_applet_clicked(event)` as the left-click menu opener and explicit, direct settings launch via `configureApplet()`.
  - Mark ATPlayer parity as explicitly incomplete in changelog/plan/README even with these filter improvements in place.

### Task 22: ATPlayer New/Podcast Filter Parity (0.3.22)

- [x] **Nur-neue-Filter**
  - Read `JSON_AUDIO_NEW` from the ATPlayer-compatible audio list and expose it as `is_new`.
  - Add helper `--only-new`, applet setting `only-new-filter`, profile persistence, dialogs, D-Bus status and checks.
- [x] **Podcast-Filter**
  - Read `JSON_AUDIO_PODCAST` from the audio list and expose it as `podcast`.
  - Add ATPlayer-style three-state filtering with `podcast_mode`: `all`, `only`, `none`.
  - Keep missing podcast metadata non-podcast by default; do not infer podcasts from text.
- [x] **Verification**
  - Extend `scripts/check.sh`, `scripts/validate-installed.sh`, and runtime D-Bus profile smoke coverage for the new fields.

### Task 23: Add Blacklist `theme_title` Rule Parity (0.3.23)

- [x] **Blacklist-Regelfeld `theme_title`**
  - Add and normalize `theme_title` for blacklist rules in helper and dialog workflows.
  - Add matching behavior: `theme_title` acts as ATPlayer-style substring match against `topic` OR `title`.
  - Keep existing rule matching in conjunction with other set fields (`sender`, `genre`, `topic`, `title`, `topic_exact`, `active`) using AND logic.
- [x] **Blacklisting UX**
  - Expose `theme_title` in `atcinna-blacklist-dialog` add/list/remove flow.
  - Add a context action for “Thema oder Titel direkt in die Blacklist einfügen”.
- [x] **Verification**
  - Extend `scripts/check.sh` and `scripts/validate-installed.sh` for `blacklist-add/remove/clean/undo` with `--theme-title` and matching assertions.

### Task 24: Add Blacklist Negation (`!:`) and Security Guardrails (0.3.24)

- [x] **Negierte Feldwerte**
  - Enable `!:` as per-field negation in blacklist matching for `sender`, `genre`, `topic`, `title`, and `theme_title`.
  - Keep conjunction semantics across all set fields.
- [x] **`topic_exact` + Negation**
  - Keep exact/Substring matching for `topic`, and invert the match result for negated expressions.
- [x] **Regex-Sicherheit**
  - Reject `#:...` and `!:#...` directly at `blacklist-add` with JSON-`status: error`.
  - Keep existing runtime behavior otherwise; no regex execution path for blacklist.
- [x] **UX/Docs/Validation**
  - Update blacklist dialog hint for `!:` and unsupported regex prefix.
  - Update applet/schema wording from `only` to Whitelist/Invers.
  - Extend `scripts/check.sh` and `scripts/validate-installed.sh` for negation-path tests and regex rejection.

### Task 25: Add Queue Selection/Reset Menu Workflows (0.3.25)

- [x] **Visible queue selection state**
  - Keep a URL-based selection set for the currently rendered queue list.
  - Show `[x]`/`[ ]` markers in queue submenu titles and add per-row **Auswahl umschalten**.
- [x] **ATPlayer-style selection actions**
  - Add top-level queue actions **Alles auswählen**, **Auswahl umkehren**, and **Tabelle zurücksetzen**.
  - Scope these actions to the currently visible queue entries in the applet popup.
- [x] **Batch actions**
  - Add **Ausgewählte Downloads stoppen** and **Ausgewählte aus Liste entfernen**.
  - Reuse the existing URL-based `download-cancel` and `download-remove` helper paths; do not add a new backend queue mutation path.
- [x] **Checks/docs/version**
  - Extend `scripts/check.sh` for labels, handlers, and selection markers.
  - Bump version to `0.3.25` and document that full ATPlayer parity is still open.

### Task 26: Add Blacklist Dialog Table Interaction Parity (0.3.26)

- [x] **ATPlayer-style selection controls**
  - Add **Alles auswählen**, **Auswahl umkehren**, and **Tabelle zurücksetzen** to `atcinna-blacklist-dialog`.
  - Scope reset to the GTK ListBox check-selection state because ATCinna does not have ATPlayer's persistent table-column model.
- [x] **Restore wording**
  - Rename the visible undo action to **Gelöschte wieder anlegen** while keeping the existing `blacklist-undo` backend path.
- [x] **Row activation**
  - Add `row-activated` handling so an existing rule is copied into the form for review and re-saving without a Java/In-place table editor.
- [x] **Checks/docs/version**
  - Extend source and installed validation for the new labels/handlers.
  - Bump version to `0.3.26` and document that full ATPlayer parity is still open.

### Task 27: Add Audio URL Copy Context Action (0.3.27)

- [x] **Audio context URL copy**
  - Add **Audio-URL kopieren** to the shared metadata copy actions for Treffer, Verlauf, Favoriten, and Queue submenus.
  - Reuse the existing Clipboard path; do not shell out or open the URL.
- [x] **Checks/docs/version**
  - Extend source and installed validation for the new label.
  - Bump version to `0.3.27` and document that full ATPlayer parity is still open.

### Task 28: Add ATPlayer-Style Bookmark Delete/Clear Actions (0.3.28)

- [x] **Bookmark deletion from entry contexts**
  - Add **Bookmarks löschen** to result/history/favorites item contexts so a selected entry can be removed from the bookmark store outside the favorites-only list.
- [x] **Clear all bookmarks**
  - Add helper action `bookmark-clear` using the existing locked/atomic bookmark store path.
  - Add **Alle angelegten Bookmarks löschen** to the favorites section.
- [x] **Checks/docs/version**
  - Extend source and installed validation for labels, handler wiring, and functional `bookmark-clear`.
  - Bump version to `0.3.28` and document that full ATPlayer parity is still open.

### Task 29: Add ATPlayer-Style Seen/Unseen History Actions (0.3.29)

- [x] **Seen/unseen actions**
  - Add **Als gesehen markieren** and **Als ungesehen markieren** to Treffer, Verlauf, Favoriten, and Queue item contexts.
  - Reuse `history-add` for seen marking and add a locked helper action `history-remove --url URL` for unseen marking.
- [x] **Click/settings contract remains explicit**
  - Keep `on_applet_clicked(event)` as the applet popup opener.
  - Keep **Einstellungen** in the popup menu, wired through `_openAppletSettings()` to `configureApplet()`.
- [x] **Checks/docs/version**
  - Extend source and installed validation for labels, handlers, and functional `history-remove`.
  - Bump version to `0.3.29` and document that full ATPlayer parity is still open.

### Task 30: Add ATPlayer-Style Bookmarks Filter Toggle (0.3.30)

- [x] **Direct bookmarks filter**
  - Add **Bookmarks anzeigen** to the applet filter section as a direct ATPlayer-style action.
  - Use the existing `only-bookmarks` helper search path instead of adding Java or a new backend.
- [x] **Second-click restore**
  - Store the previous filter/search snapshot before entering bookmark-only view.
  - Restore the snapshot when the user clicks the bookmark-only view again.
- [x] **Checks/docs/version**
  - Extend source and installed validation for the label and handlers.
  - Bump version to `0.3.30` and document that full ATPlayer parity is still open.

### Task 31: Add Visible Result Selection and Batch Audio Actions (0.3.31)

- [x] **Visible result selection**
  - Add URL-keyed selection for currently visible Treffer.
  - Add **Alle Treffer auswählen**, **Treffer-Auswahl umkehren**, **Treffer-Auswahl zurücksetzen**, and per-entry **Auswahl umschalten**.
- [x] **ATPlayer-style batch actions**
  - Add **Alle markierten Audios abspielen** for selected Treffer.
  - Add **Markierte Audios speichern** using the existing `download-enqueue` queue path instead of direct Java or a new backend.
- [x] **Checks/docs/version**
  - Extend source and installed validation for labels and handlers.
  - Bump version to `0.3.31` and document that full ATPlayer parity is still open.

### Task 32: Add Targeted Queue Start and Refresh/Cleanup Labels (0.3.32)

- [x] **Per-entry queue start**
  - Add **Download starten** to each visible queue entry and only enable it for `queued` entries.
  - Add helper action `download-run --url URL` that claims a matching queued entry and reuses the existing download execution path.
- [x] **ATPlayer-near queue refresh/cleanup wording**
  - Add top-level **Downloads aktualisieren** as a direct queue-list refresh.
  - Add top-level **Liste der Downloads aufräumen** as an alias for the existing done-entry cleanup path.
- [x] **Checks/docs/version**
  - Extend source and installed validation for labels and helper action presence.
  - Extend the queue HTTP fixture to verify targeted `download-run`, `not-found`, and `not-queued`.
  - Bump version to `0.3.32` and document that full ATPlayer parity is still open.

### Task 33: Add ATPlayer Audio Context Labels (0.3.33)

- [x] **Direct audio context actions**
  - Rename visible play actions to **Abspielen** in result/history/bookmark contexts.
  - Add **Speichern** in result/history/bookmark contexts and map it to the existing `download-enqueue` queue path.
- [x] **Film information alias**
  - Add **Filminformation anzeigen** as an ATPlayer-near alias for the compact info section while keeping **Audioinformation anzeigen**.
- [x] **Checks/docs/version**
  - Extend source and installed validation for the new labels.
  - Bump version to `0.3.33` and document that full ATPlayer parity is still open.

### Task 34: Add Result Bookmark Batch Actions (0.3.34)

- [x] **ATPlayer-style selected bookmark actions**
  - Add **Markierte als Bookmarks anlegen** for currently selected visible Treffer.
  - Add **Markierte Bookmarks löschen** for currently selected visible Treffer.
- [x] **Reuse existing helper paths**
  - Use `bookmark-add` and `bookmark-remove` per selected item; do not add a separate bookmark store mutation path.
  - Refresh favorites/sections after batch completion.
- [x] **Checks/docs/version**
  - Extend source and installed validation for labels and handlers.
  - Bump version to `0.3.34` and document that full ATPlayer parity is still open.

### Task 35: Add Result History Batch Actions (0.3.35)

- [x] **ATPlayer-style selected history actions**
  - Add **Markierte als gesehen markieren** for currently selected visible Treffer.
  - Add **Markierte als ungesehen markieren** for currently selected visible Treffer.
- [x] **Reuse existing helper paths**
  - Use `history-add` and `history-remove` per selected item; do not add a separate history store mutation path.
  - Refresh history after batch completion.
  - Make `_xdgOpen()` return `true`/`false` so batch play does not count blocked URL opens as success.
- [x] **Checks/docs/version**
  - Extend source and installed validation for labels and handlers.
  - Bump version to `0.3.35` and document that full ATPlayer parity is still open.

### Task 36: Add Filter/Info Visibility Toggles (0.3.36)

- [x] **ATPlayer-style visibility actions**
  - Add **Filter ein-/ausblenden** as a top-level popup action.
  - Add **Infos ein-/ausblenden** as a top-level popup action.
- [x] **Persistent Cinnamon settings**
  - Add `show-filter-section` and `show-info-section` to `settings-schema.json`, default `true`.
  - Bind both settings in `applet.js` and apply them to the existing filter/info menu sections.
  - Reset both settings to visible in **Alle Programmeinstellungen zurücksetzen**.
- [x] **Checks/docs/version**
  - Extend source and installed validation for labels, handlers, reset defaults and schema keys.
  - Bump version to `0.3.36` and document that full ATPlayer parity is still open.

### Task 37: Harden Left-Click Menu Open Path (0.3.37)

- [x] **Applet click contract**
  - Make `on_applet_clicked(event)` explicit and accept only Button 1 defensively.
  - Open the applet popup menu deterministically on left click with `menu.open(true)`.
- [x] **Settings entry remains visible**
  - Keep **Einstellungen** in the top-level applet menu.
  - Keep the action wired to `configureApplet()`.
- [x] **Checks/docs/version**
  - Extend source and installed validation so Linksklick opens the menu instead of only checking for a generic toggle.
  - Bump version to `0.3.37` and document that full ATPlayer parity is still open.

### Task 38: Add Selected Queue Start Action (0.3.38)

- [x] **ATPlayer-near selected download start**
  - Add top-level **Markierte Downloads starten** to the queue menu.
  - Reuse visible queue selection and the existing `_runQueueBatchAction(...)` flow.
  - Start each selected queued item through the existing callback-capable `_runQueueRunItem(item, callback)` path and `download-run --url`.
- [x] **Checks/docs/version**
  - Extend source and installed validation for the label and `_runQueueRunSelected()`.
  - Bump version to `0.3.38` and document that full ATPlayer parity is still open.

### Task 39: Add Selected Queue Reorder Actions (0.3.39)

- [x] **ATPlayer-near selected queue reorder**
  - Add top-level **Markierte Downloads vorziehen** to the queue menu.
  - Add top-level **Markierte Downloads zurückstellen** to the queue menu.
  - Reuse visible queue selection and the existing `_runQueueBatchAction(...)` flow.
  - Reuse existing helper paths `download-prefer --url` and `download-put-back --url`.
- [x] **Checks/docs/version**
  - Make `_runQueuePrefer(...)` and `_runQueuePutBack(...)` callback-capable for batch use.
  - Extend source and installed validation for labels, action state and handlers.
  - Bump version to `0.3.39` and document that full ATPlayer parity is still open.

### Task 40: Add Selected Queue Media Actions (0.3.40)

- [x] **ATPlayer-near selected queue media actions**
  - Add top-level **Audio (URL) abspielen** and **Download (URL) kopieren** actions to the queue menu.
  - Reuse visible queue selection and existing per-item handlers (`_playItem` and `_copyQueueUrl`) without adding helper/backend paths.
- [x] **Checks/docs/version**
  - Extend source and installed validation for new labels, action handlers, and action-state wiring.
  - Bump version to `0.3.40` and document that full ATPlayer parity is still open.

### Task 41: Add Web Help Link (0.3.41)

- [x] **ATPlayer-Guide link in help submenu**
  - Add **Anleitung im Web** under **Hilfe** that opens the fixed ATPlayer manual URL `https://www.p2tools.de/atplayer/manual/`.
  - Reuse the existing `_xdgOpen()` path so HTTP/HTTPS validation remains enforced and no new helpers are introduced.
- [x] **Checks/docs/version**
  - Extend source and installed validation for help-label and handler wiring.
  - Bump version to `0.3.41` and document that full ATPlayer parity is still open.

### Task 42: Align Queue Selection Labels to ATPlayer (0.3.42)

- [x] **ATPlayer-near queue selection labels**
  - Rename selected queue actions to **Downloads starten**, **Downloads stoppen**, **Downloads vorziehen**, **Downloads zurückstellen**, **Downloads aus Liste entfernen** without helper changes.
- [x] **Checks/docs/version**
  - Extend source and installed validations to match the new labels and keep `status`/selection behavior unchanged.
  - Bump version to `0.3.42` and document that full ATPlayer parity is still open.

### Task 43: Add Top-Level Queue Edit Action (0.3.43)

- [x] **ATPlayer-nahe Queue-Top-Aktion**
  - Add top-level queue action **Download ändern** to the queue action section.
  - Use the existing visible selection and existing `_runQueueEditDialog()` path to open the first selected visible queue entry.
- [x] **Defensive status behavior**
  - Set explicit status for empty queue selection and for running selected entries (`Download läuft (nicht änderbar)`).
  - Preserve helper/backend paths; no new dialog/helper methods.
- [x] **Checks/docs/version**
  - Extend static checks/installed validation for `Download ändern`, `_runQueueEditSelected()`, `_queueActionEditSelected`, and wiring.
  - Bump version to `0.3.43`, update metadata/version/readme/changelog.

### Task 44: Add Top-Level Film Actions for Selected Result (0.3.44)

- [x] **ATPlayer-nahe Ergebnis-Treffer-Top-Aktionen**
  - Add **Film abspielen** and **Film speichern** in the Treffer section.
  - Both actions use the first currently visible selected result and reuse the existing `_playItem` and `_runDownloadEnqueue` paths.
- [x] **Defensive UX**
  - Keep explicit status output on missing selection for both actions (`Film abspielen: keine Auswahl`, `Film speichern: keine Auswahl`).
- [x] **Checks/docs/version**
  - Extend source/installed checks for new top-level labels and handler symbols.
  - Bump version to `0.3.44`, update metadata/version/readme/changelog.

### Task 45: Add Result Top-Level Info/Copy Actions for Selected Item (0.3.45)

- [x] **Top-Level Treffer-Aktionserweiterung**
  - Ergänze die Treffer-Toplevel-Aktionen um **Filminformation anzeigen**, **Thema in die Zwischenablage kopieren**, **Titel in die Zwischenablage kopieren** und nutze den ersten markierten sichtbaren Treffer.
  - Bei fehlender Auswahl immer explizite Statusmeldungen setzen; bei fehlendem Thema/Titel weiterhin klare Clipboard-Fehlermeldungen liefern.
- [x] **Checks/docs/version**
  - Erweitere Source-/Installed-Checks um die neuen Top-Level-Labels, Handler und Applet-Version.
  - Bump auf `0.3.45`; update `metadata.json`, `VERSION`, `README` und `CHANGELOG`.

### Task 46: Align Result Selection Labels to ATPlayer (0.3.46)

- [x] **ATPlayer-nahe Treffer-Auswahllabels**
  - Rename existing result batch actions to **Filme als gesehen markieren**, **Filme als ungesehen markieren**, **Neue Bookmarks anlegen**, and **Bookmarks löschen**.
  - Keep existing result selection handlers and helper/backend paths unchanged.
- [x] **Checks/docs/version**
  - Extend source and installed validation for the updated visible labels.
  - Bump version to `0.3.46`, update metadata/version/readme/changelog.

### Task 47: Add Result Top-Level Blacklist Actions (0.3.47)

- [x] **ATPlayer-nahe Blacklist-Top-Level-Aktionen**
  - Add **Blacklist-Eintrag für den Film erstellen** and **Thema direkt in die Blacklist einfügen** to the Treffer top-level action section.
  - Reuse visible result selection and the existing `_runBlacklistAdd()` helper path for the first selected visible result.
- [x] **Defensive UX**
  - Set explicit status for missing selection and missing topic.
  - Do not add helper/backend paths or shell command construction.
- [x] **Checks/docs/version**
  - Extend source and installed validation for the new visible labels and handler symbols.
  - Bump version to `0.3.47`, update metadata/version/readme/changelog.


### ATPlayer Parity Audit

ATCinna is not yet feature-complete against ATPlayer. It must not be treated as done until the remaining ATPlayer behavior below is either implemented or explicitly rejected. The applet currently covers the core quick-access path: left-click menu open with a direct **Einstellungen** entry, catalog refresh/search, sender/genre/topic/title/theme-title/somewhere/time/duration/new/bookmark/history/podcast filters, a direct ATPlayer-style **Bookmarks anzeigen** filter toggle, first Filterprofile management, first Blacklist modes and direct Blacklist context actions, play/open/download handoff, ATPlayer-style filter/info visibility toggles, visible Treffer selection with **Film abspielen**, **Alle markierten Audios abspielen**, **Film speichern**, **Filme als gesehen markieren**, **Filme als ungesehen markieren**, **Neue Bookmarks anlegen**, **Bookmarks löschen**, direct **Abspielen**/**Speichern** audio context actions, audio URL/title/genre/topic copy actions, first Bookmark add/remove/clear workflows, first seen/unseen history actions, a durable download queue with several ATPlayer-style actions including per-entry **Download starten**, selected **Downloads starten**, selected **Downloads vorziehen/zurückstellen**, selected **Downloads stoppen**, selected **Downloads aus Liste entfernen**, `Download ändern`, refresh/cleanup labels, first visible-list selection/reset workflows, **Anleitung im Web**, D-Bus status/profile apply, local install/package checks, and runtime smoke checks.

Known parity gaps from `/home/teladi/ATPlayer`:

- Download queue management: ATPlayer has durable queue concepts and UI actions for start/stop/edit/delete/reorder/cleanup; ATCinna now has enqueue/list/run-next/run-by-url/run-selected/run-all/cancel/clear/update/remove/undo/prefer/put-back/selected-prefer/selected-put-back/open-directory/copy-url/open-file/trash-file workflows plus refresh/cleanup labels and first visible-list selection/reset actions, but still lacks the deeper table model and full queue table workflow parity.
- Blacklist management and filter profiles: ATCinna now has direct context-menu Blacklist adds, search modes, Whitelist/Invers wording for `only`, a first Blacklist editor with selection/reset/restore and row-activation workflow, exact/active toggles, `theme_title`, `!:` exclude-rule semantics, undo/clean/clear, and first Filterprofile management, but still lacks legacy migration and deeper ATPlayer table workflows.
- Rich audio-list actions: ATPlayer has table/context-menu workflows such as metadata/info dialogs and broader audio actions; ATCinna now covers compact popup info with **Filminformation anzeigen** alias, filter/info visibility toggles, visible result selection with batch play/save/bookmark/history actions, direct **Abspielen**/**Speichern** context actions, audio URL/title/genre/topic copy actions, first Bookmark add/remove/clear workflows, and first seen/unseen history actions, but still lacks deeper table-level audio workflows.
- Full settings/config migration: ATPlayer has a multi-pane configuration model and legacy config data; ATCinna only uses Cinnamon applet settings and has no legacy import path.

### Task 17: Add ATPlayer-Style Program/Help Submenu (0.3.17)

- [x] **Hilfe-/Programmmenü auf Top-Level ergänzen**
  - Untermenü **Hilfe** mit `Hilfedialog`, `Alle Programmeinstellungen zurücksetzen`, `Gibt's ein Update?`, `Über dieses Programm`.
- [x] **Hilfedialog und Über-Infos ins bestehende Info-Panel lenken**
  - Aktionen nutzen die vorhandene Info-Section und den Statusbereich, um Inhalte anzuzeigen.
- [x] **Lokale Update-Information**
  - `Gibt's ein Update?` zeigt lokale Versions- und Pfadinformationen ohne externen Netzwerkzugriff oder Shell-Navigation.
- [x] **Reset der Anwendungseinstellungen**
  - `Alle Programmeinstellungen zurücksetzen` setzt `search-query`, `sender-filter`, `genre-filter`, `topic-filter`, `blacklist-mode`, `max-hits` auf Standardwerte.
  - Popup-Suchfeld, Filterstatus und Trefferansicht werden nach dem Reset aktualisiert.
- [x] **Statische Checks ergänzen**
  - `scripts/check.sh` prüft Hilfemenü-Labels, Handler-Namen und Reset-Wiring auf Applet-Ebene.

### Task 16: Add ATPlayer-Style Filter Submenu (0.3.16)

- [x] **Filtern-Menü in Einträgen hinzufügen**
  - Treffer-, Verlauf-, Favoriten- und Warteschlange-Untermenüs enthalten ein Untermenü **Filter**.
- [x] **Filtern-Aktionen verdrahten**
  - `nach Sender filtern`, `nach Genre filtern`, `nach Thema filtern`, `nach Titel filtern`,
    `nach Sender und Thema filtern`, `nach Sender, und Titel filtern`.
- [x] **Settings setzen statt lokale Suche**
  - Aktionen schreiben `sender-filter`, `genre-filter`, `topic-filter` und `search-query`.
- [x] **Kein Erzwingen leerer Werte**
  - Bei fehlendem Feld wird ein Status gesetzt und die Aktion bricht ohne Setzen ab.
- [x] **Aktualisierungsfluss sichern**
  - Filter-/Suchänderung triggert anschließend `Refresh` der Trefferansicht.
- [x] **Lokale Checks ergänzen**
  - Label-Checks für neues Filter-Menü.
  - Wiring-Checks auf alle 4 Menükontexte (`_addFilterActions`).
  - Regex-Check auf kombinierte `Sender + Titel`-Aktion (`sender-filter` + `search-query`).

Next parity implementation priority: deeper queue table workflows beyond the visible applet list, legacy settings/config migration, and broader ATPlayer audio-list/context-menu behavior where it is meaningful for a Cinnamon applet.

### Task 20: First ATPlayer Filterprofile Parity (0.3.20)

- [x] **Profile store**
  - Add `filter-profiles.json` with normalized `name`, `search_query`, `sender`, `genre`, `topic`, `blacklist_mode`, `max_hits`, and `timestamp`.
  - Provide default profiles when no profile store exists and a reset operation to restore them.
- [x] **Helper actions**
  - Add `filter-profile-list`, `filter-profile-get`, `filter-profile-next-name`, `filter-profile-save`, `filter-profile-rename`, `filter-profile-remove`, `filter-profile-clear`, `filter-profile-reset`, and `filter-profile-sort`.
  - Keep writes atomic and normalize invalid blacklist modes and max-hit values before persistence.
- [x] **Applet menu**
  - Add **Filterprofile** submenu for saving current filters, refreshing the profile list, opening management, and loading saved profiles directly.
  - Add `ApplyFilterProfile` D-Bus method so an external dialog can apply profile JSON to the running applet.
- [x] **GTK management dialog**
  - Add `atcinna-filter-profiles-dialog` with load/new/overwrite/rename/delete/clear/sort/reset actions.
- [x] **Checks**
  - Extend local and installed validation for the new helper actions, dialog self-test, applet wiring, and profile CRUD behavior.

### Task 18: Add Optional Blacklist Dialog (0.3.18)

- [x] **Menu and fixed-launch path**
  - Add `this._blacklistDialogPath` in the applet constructor.
  - Add help/program submenu item `Blacklist verwalten`.
  - Add handler `_launchBlacklistDialog` and launch `Util.spawn` with a fixed argument list.

- [x] **GTK dialog script**
  - Add executable script `atcinna@H234598/scripts/atcinna-blacklist-dialog`.
  - Implement `--self-test` output (`status`, `helper`, `gtk3`) for headless checks.
  - List blacklist rules via `blacklist-list` and remove checked rows via `blacklist-remove`.
  - No shell strings, fixed helper argument lists only.

- [x] **Static/install checks**
  - Extend `scripts/check.sh` with executable, py_compile, static wiring, and dialog self-test checks.
  - Extend `scripts/validate-installed.sh` with executable and self-test checks.
  - Extend package/install verification for presence of the new script.

- [x] **Docs + version**
  - Update `README.md`, `CHANGELOG.md`, `VERSION`, and `atcinna@H234598/metadata.json` to 0.3.18.

### Task 19: First real ATPlayer Blacklist Core Parity (0.3.19)

- [x] **Blacklist-Regeln mit Aktivierungs- und Topic-Match-Modus**
  - Regeln speichern/normalisieren `active` und `topic_exact` mit Standard `true` und behalten bestehende `sender`/`genre`/`topic`/`title`-Kompatibilität.
  - Matching respektiert inaktive Regeln (`active=false`) als nicht wirksam.
  - `topic_exact=true` erzwingt exakte Themenübereinstimmung, `topic_exact=false` erlaubt Teiltreffer; Sender/Genre/Title bleiben Teiltreffer.
- [x] **Undo/Putzen/Clear**
  - Neue Helper-Aktionen `blacklist-undo`, `blacklist-clean`, `blacklist-clear`.
  - `blacklist-clean` entfernt ATPlayer-artig leere und doppelte Regeln.
  - `blacklist-remove`, `blacklist-clean` und `blacklist-clear` lagern entfernte Regeln in eine Undo-Datei.
  - `blacklist-undo` stellt dedupliziert vorherig entfernte Regeln wieder her.
- [x] **`blacklist-add` Optionals**
  - `--active` und `--topic-exact` als optionale Flags ergänzt.
  - Gleiche `sender`/`genre`/`topic`/`title`/`topic_exact`-Kombination aktualisiert stattdessen bestehende Regel.
- [x] **Gezielte Entfernung von Regelvarianten**
  - `blacklist-remove` akzeptiert optional `--active` und `--topic-exact`, damit der Dialog bei gleicher Topic-Regel exakt die markierte Variante entfernen kann.
- [x] **Dialog-Oberfläche erweitern**
  - `atcinna-blacklist-dialog` zeigt `active`/`topic_exact` an.
  - Neue Regler erlauben Hinzufügen, Entfernen markierter Regeln, Undo, Putzen und Komplett-Löschen mit GTK-Abfrage.
- [x] **Checks**
  - `scripts/check.sh` erweitert um neue Helper-Args/Actions, Suchsemantik (`topic_exact`), Undo/Clean/Clear und Dialog-Wiring.

### Task 15: Add Queue Download Edit Action (0.3.15)

- [x] Add helper action `download-update --url URL` with optional title/folder/metadata/website updates.
- [x] Keep queue order stable and reject running downloads from updates.
- [x] Add optional GTK dialog `atcinna-queue-edit-dialog` with `--self-test`.
- [x] Add applet queue submenu action **Download ändern** and disable it for running entries.
- [x] Extend install/package validation and local checks for the new dialog and helper behavior.

### Task 14: First Blacklist Context-Action Parity (0.3.14)

- [x] Add persistent helper-managed `blacklist.json` with `blacklist-add`, `blacklist-list`, and `blacklist-remove`.
- [x] Add `search --blacklist-mode off|hide|only` and preserve existing query/sender/genre/topic filtering.
- [x] Add Applet setting `blacklist-mode` and pass it to popup search and optional GTK search dialog.
- [x] Add the five ATPlayer-style direct Blacklist actions to Treffer, Verlauf, Favoriten, and Queue submenus.
- [x] Preserve the ATPlayer direct action nuance where **Sender und Genre** stores sender, genre, and topic/theme.
- [x] Extend local checks for Blacklist storage, dedupe, filter modes, menu labels, and applet wiring.

### Task 13: Harden Installed Click/Settings Contract (0.3.13)

- [x] Keep `on_applet_clicked(event)` as the applet menu opener.
- [x] Keep the applet popup menu item **Einstellungen** wired to `_openAppletSettings()` and `configureApplet()`.
- [x] Add installed-tree validation in `scripts/validate-installed.sh` so the copied applet is checked for the same click/settings contract, not just the source tree.
- [x] Update this plan so ATPlayer parity remains explicitly open.

### Task 9: First Download Queue Parity Milestone

- [x] **Step 1: Add helper queue actions**
  - Add `download-enqueue`, `download-list`, `download-run-next`, `download-cancel`, and `download-clear`.
  - Store queue state in `XDG_DATA_HOME/atcinna@H234598/download-queue.json` with atomic writes and a 500-entry cap.
  - Keep direct `download` available.

- [x] **Step 2: Add applet queue controls**
  - Add per-result **In Warteschlange legen**.
  - Add queue menu actions for show, run next, stop queued/running, and clear done/error/cancelled entries.

- [x] **Step 3: Verify queue behavior**
  - Check enqueue/list/dedupe/FIFO order.
  - Check `download-run-next` against a local HTTP fixture.
  - Check cancel/clear and HTTP-only URL enforcement.

- [x] **Step 4: Add ATPlayer queue parity actions**
  - Add `download-remove`, `download-undo`, `download-prefer`, `download-put-back`.
  - Add queue-entry context actions (`URL kopieren`, `Ordner öffnen`, `Aus Liste entfernen`, `Vorziehen`, `Zurückstellen`) and global restore.
  - Run helper checks that validate remove/undo/reorder and running-entry safety.

- [x] **Task 10: Add ATPlayer queue parity expansion**

  - [x] Add global queue control actions: `Nächsten Download starten`, `Alle Downloads starten`, `Alle Downloads stoppen`, and `Alle wartenden Downloads stoppen`.
  - [x] Expand per-entry queue submenu with:
    `Download stoppen`, `Audio (URL) abspielen`, `Download (URL) kopieren`, `Gespeichertes Audio (Datei) abspielen`, `Zielordner öffnen`.
  - [x] Add applet/static checks for new labels and new handlers (`_runQueueRunAll`, `_runQueueCancelItem`, `_runQueueCancelQueued`, `_openQueueFile`), plus helper coverage for `download-cancel --queued-only`.

### Task 11: Add Audio-Metadaten und Clipboard-Infos (0.3.11)

- [x] **Helper erweitern**
  - `history-add`, `bookmark-add`, `download-enqueue` akzeptieren optionale `--date`, `--time`, `--duration`, `--description`.
  - Normalisierte Queue/History/Bookmark-Einträge speichern diese Felder und lesen ältere Einträge kompatibel weiter ein.

- [x] **Applet-Aktionen ergänzen**
  - Untermenüs von Treffer/Verlauf/Favoriten/Queue enthalten `Audioinformation anzeigen`.
  - Neue Clipboard-Aktionen: `Titel in die Zwischenablage kopieren`, `Genre in die Zwischenablage kopieren`, `Thema in die Zwischenablage kopieren`.

- [x] **Infos-Panel und Tests**
  - Kompakter, nichtreaktiver Info-Bereich im Popup (`this._infoSection`) mit Titel, Sender, Genre, Thema, Datum/Uhrzeit/Dauer, Beschreibung, URL, Website, Pfad.
  - `scripts/check.sh` ergänzt um Label-/Methoden-Checks und funktionale Persistenzprüfungen für `date/time/duration/description` in History/Bookmark/Queue.

### Task 12: Add Queue Trash Action (0.3.12)

- [x] **Helper Action ergänzen**
  - Neue Aktion `download-trash-file --url URL` implementiert.
  - Queue-Eintrag wird per URL gesucht; `path` wird auf absolute Pfadangabe, Existenz, `regular` und Zugehörigkeit zu Queue-`folder` geprüft (Fallback `~/Downloads`).
  - Pfadauflösung auf `resolve(strict=True)` gesetzt, kein neues Queue-Verzeichnis anlegen.
  - Löschen nur über `gio trash <path>` mit Argumentliste; Fehler werden als JSON-Fehler zurückgegeben.

- [x] **Applet anreichern**
  - Queue-Menüpunkterweiterung um **„Gespeichertes Audio (Datei) löschen“**.
  - Neue Aktion ruft Helper auf, übernimmt Queue-Refresh und Statusmeldung.

- [x] **Check/Test erweitern**
  - `scripts/check.sh` um neue Action-/Handler-/Label-Checks ergänzt.
  - Funktionale Tests für gültigen Trash, außerhalb-Queue-Ablehnung und fehlende URL/Path (JSON-Fehler).

### URL-Trust-Boundary-Härtung

- [x] **Suchergebnisse filtern Audio-URLs auf http/https, nicht-http(s)-Audiozeilen auslassen**
- [x] **`website`-Feld in Suchergebnissen auf http/https reduzieren (sonst leer)**
- [x] **`_xdgOpen` blockt nicht-HTTP(S)-URIs und setzt Status vor `Util.spawn`**

## Primary Plan

### Task 1: Harden The MVP Gate

**Files:**
- Modify: `scripts/check.sh`
- Read: `atcinna@H234598/applet.js`
- Read: `atcinna@H234598/scripts/atcinna-catalog`
- Read: `atcinna@H234598/settings-schema.json`
- Read: `atcinna@H234598/metadata.json`

- [x] **Step 1: Add deterministic local checks**

Ensure `scripts/check.sh` performs these checks:

```bash
jq -e . "$APPLET_DIR/metadata.json" >/dev/null
jq -e . "$APPLET_DIR/settings-schema.json" >/dev/null
python3 -m py_compile "$HELPER"
test -x "$HELPER"
```

- [x] **Step 2: Add static import guard**

Reject GNOME Shell imports and Java references in the applet source:

```python
for forbidden in ("ExtensionUtils", "PanelMenu", "imports.ui.panelMenu", "imports.misc.extensionUtils", "java", "Java"):
    if forbidden in applet_source:
        raise SystemExit(f"forbidden token in applet.js: {forbidden}")
```

- [x] **Step 3: Add a compressed fixture search test**

Create an `audios.xz` fixture in a temporary `XDG_CACHE_HOME` with two `"Audios"` rows and verify that inherited sender, title, URL, and max-result behavior survive parsing.

- [x] **Step 4: Add negative URL test**

Run:

```bash
XDG_CACHE_HOME="$tmp_cache" python3 "$HELPER" download --url "file:///tmp/test.mp3" --folder "$tmp_downloads" --title bad >/tmp/out 2>/tmp/err
```

Expected: command exits non-zero and stderr contains JSON with `invalid URL scheme`.

- [x] **Step 5: Verify and commit**

Run:

```bash
./scripts/check.sh
git status --short
```

Expected: check exits 0; only intended files are modified. The Teamleiterin performs the commit.

### Task 2: Add In-Popup Search Input

**Files:**
- Modify: `atcinna@H234598/applet.js`
- Modify: `atcinna@H234598/stylesheet.css`
- Modify: `atcinna@H234598/metadata.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `VERSION`
- Modify: `docs/superpowers/plans/2026-06-04-atcinna-implementation-plan.md`

- [x] **Step 1: Add a `St.Entry` search field above the refresh action**

Use the Cinnamon `St.Entry` widget in the applet menu. Keep the existing settings-backed `search-query` as the initial value and fallback.

- [x] **Step 2: Debounce searches**

Use a single `Mainloop.timeout_add` handle for input changes. Remove the previous handle before adding a new one.

- [x] **Step 3: Keep settings and popup in sync**

Keep popup search input and settings value synchronized. On user input, run search from the current field value and do not write to settings on every keypress.

- [x] **Step 4: Verify**

Run:

```bash
./scripts/check.sh
```

Expected: check exits 0 and static import guard still passes.

- [x] **Step 5: Commit**

```bash
git add atcinna@H234598/applet.js README.md CHANGELOG.md
git commit -m "feat: add popup search input"
```

### Task 3: Add History And Bookmarks

**Files:**
- Modify: `atcinna@H234598/applet.js`
- Modify: `atcinna@H234598/scripts/atcinna-catalog`
- Modify: `atcinna@H234598/settings-schema.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Add helper actions**

Add helper actions that store small JSON files below `XDG_DATA_HOME/atcinna@H234598`:

```text
history-add
history-list
bookmark-add
bookmark-remove
bookmark-list
```

- [x] **Step 2: Add bounded storage**

Keep history at 100 entries and bookmarks at 500 entries. Store only title, sender, genre, topic, URL, website, and timestamp.

- [x] **Step 3: Add menu sections**

Render "Zuletzt gespielt" and "Favoriten" as separate popup sections below search results.

- [x] **Step 4: Verify**

Run:

```bash
./scripts/check.sh
```

Expected: helper fixture tests pass and no unbounded file writes are introduced.

- [x] **Step 5: Commit**

```bash
git add atcinna@H234598 README.md CHANGELOG.md
git commit -m "feat: add history and bookmarks"
```

### Task 4: Add Filter Controls

**Files:**
- Modify: `atcinna@H234598/applet.js`
- Modify: `atcinna@H234598/scripts/atcinna-catalog`
- Modify: `atcinna@H234598/settings-schema.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Extend helper search arguments**

Add optional `--sender`, `--genre`, and `--topic` filters. Match them case-insensitively after inherited row values are normalized.

- [x] **Step 2: Add settings schema entries**

Add string settings for sender, genre, and topic filters.

- [x] **Step 3: Add compact filter actions**

Add menu items that expose current filter values and a clear-filters action.

- [x] **Step 4: Verify**

Run:

```bash
./scripts/check.sh
```

Expected: fixture search validates filter matching and clear-filters leaves broad search working.

- [x] **Step 5: Commit**

```bash
git add atcinna@H234598 README.md CHANGELOG.md
git commit -m "feat: add catalog filters"
```

### Task 5: Non-Mutating Installed Applet Validation

**Files:**
- Create: `scripts/validate-installed.sh`
- Modify: `scripts/check.sh`
- Modify: `scripts/install-local.sh`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `VERSION`
- Modify: `atcinna@H234598/metadata.json`
- Modify: `docs/superpowers/plans/2026-06-04-atcinna-implementation-plan.md`

- [x] **Step 1: Add validator for installed applet tree**

Create `scripts/validate-installed.sh` with `--target-dir DIR` (default `~/.local/share/cinnamon/applets`) and optional `--version VERSION`.
Validate mandatory files, `metadata.json` (`uuid`, `version`), JSON parseability of metadata/settings, JS syntax, helper executable + help output, and helper search against isolated `XDG_CACHE_HOME` fixture.

- [x] **Step 2: Wire validator into quality gate**

Call `validate-installed.sh` in `scripts/check.sh` after temporary `install-local.sh` self-install.

- [x] **Step 3: Optionally validate real install in install-local**

Add optional validation step in `scripts/install-local.sh` after successful install (`--skip-validate-installed` to disable).

### Task 6: Runtime-Smoke Runtime Check

**Files:**
- Create: `scripts/runtime-smoke.sh`
- Modify: `scripts/check.sh`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `VERSION`
- Modify: `atcinna@H234598/metadata.json`
- Modify: `docs/superpowers/plans/2026-06-04-atcinna-implementation-plan.md`

- [x] **Step 1: Add runtime smoke script**

Create a non-mutating runtime smoke path in `scripts/runtime-smoke.sh` that checks required commands, Cinnamon DBus reachability, `validate-installed.sh`, running UUIDs, and AppletManager instances when ATCinna is active.

- [x] **Step 2: Add temporary activation workflow**

Add `--activate-temporarily` mode that saves `enabled-applets` and `next-applet-id`, activates/reloads ATCinna as needed, waits up to configurable timeout, validates state, and restores via `trap` in all exit/error paths.

- [x] **Step 3: Static validation integration**

Wire runtime script into `scripts/check.sh` shellcheck scope only (not as an executed runtime mutation check).

- [x] **Step 4: Version bump and docs**

Update `VERSION`, `atcinna@H234598/metadata.json`, `CHANGELOG.md`, and `README.md` to reflect runtime-smoke addition and set baseline to `0.3.4`.

### Task 7: Read-only DBus Status API

**Files:**
- Modify: `atcinna@H234598/applet.js`
- Modify: `scripts/runtime-smoke.sh`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `VERSION`
- Modify: `atcinna@H234598/metadata.json`
- Modify: `docs/superpowers/plans/2026-06-04-atcinna-implementation-plan.md`

- [x] **Step 1: Export read-only status interface in applet**

Add D-Bus registration in the applet constructor and cleanup in removal/destroy:
`org.Cinnamon.Applets.ATCinna` on `/org/Cinnamon/Applets/ATCinna`, methods `Ping` and `GetStatus`.

- [x] **Step 2: Status payload**

`GetStatus` must return a JSON string containing at least:
`status`, `uuid`, `instanceId`, `version`, `activeSearchQuery`, `maxHits`, `hasHelper`, `dbusPath`.

- [x] **Step 3: Smoke checks**

In `runtime-smoke.sh`, when ATCinna is active (or temporary activation is enabled), call:
`Ping` and `GetStatus`, then validate returned status and identifiers.

- [x] **Step 4: Versioned docs update**

Bump version and update changelog/runtime docs for the new read-only interface.

## Alternative Plan

If Cinnamon menu input proves too fragile across local Cinnamon versions, the applet can use a small external GTK search dialog launched from the applet. The current implementation keeps the working in-popup search and adds this dialog as an optional fallback/expanded search surface. The applet still remains Java-free: Cinnamon JavaScript launches a Python GTK dialog, and the existing `atcinna-catalog` helper remains the catalog backend.

### Alternative Task A: Keep Popup As Launcher

**Files:**
- Modify: `atcinna@H234598/applet.js`
- Create: `atcinna@H234598/scripts/atcinna-search-dialog`
- Modify: `README.md`

- [x] **Step 1: Add a popup action**

Add "Suche öffnen" to the applet menu and launch:

```javascript
Util.spawn([dialogPath]);
```

- [x] **Step 2: Implement dialog with Python GTK**

Use Python plus GI GTK bindings only if available locally. If GTK bindings are missing, keep this alternative inactive and continue with the primary in-popup search.

- [x] **Step 3: Verify**

Run:

```bash
./scripts/check.sh
python3 atcinna@H234598/scripts/atcinna-search-dialog --self-test
```

Expected: both commands exit 0 on systems with Python GTK bindings.

## Non-Goals

- No Java runtime dependency.
- No JavaFX.
- No embedded media engine in the applet process.
- No shell-string command execution.
- No automatic release unless tests are green and the Teamleiterin performs the release step.
