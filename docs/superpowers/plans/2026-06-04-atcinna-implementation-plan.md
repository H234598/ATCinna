# ATCinna Implementation Plan

> **For agentic Arbeitsbienen:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ATCinna as a Java-free Cinnamon applet that searches, plays, opens, and downloads entries from the ATPlayer-compatible audio catalog.

**Architecture:** Keep the applet UI in Cinnamon JavaScript and keep catalog work in a small Python helper. The helper owns network, cache parsing, search, and download operations; the applet owns panel state, settings, menu rendering, and non-blocking subprocess calls. The legacy ATPlayer Java application is only a format and behavior reference.

**Tech Stack:** Cinnamon 6.6 applet API, GJS/CJS-style Cinnamon JavaScript, Python 3 standard library, `curl`, `jq`, `shellcheck`.

---

## Current Baseline

- `VERSION` is `0.3.11`.
- `atcinna@H234598/applet.js` provides the Cinnamon applet shell, popup search input, filter summary, refresh action, result rendering, history/bookmark sections, and play/open/download handoff.
- `atcinna@H234598/scripts/atcinna-catalog` provides `refresh`, filtered `search`, direct `download`, `download-*` queue actions, `history-*`, and `bookmark-*`.
- `atcinna@H234598/scripts/atcinna-search-dialog` provides the optional external GTK search dialog used by the "Suche öffnen" popup action; the primary in-popup search remains active when it works locally.
- `scripts/check.sh` is the local quality gate and includes a non-mutating installed-tree validation selftest.

### Quick Follow-up

- [x] **Task 8: Add settings launcher in applet menu**
  - Add a menu item **Einstellungen** in `atcinna@H234598/applet.js`.
  - Keep `on_applet_clicked()` as menu toggle.
  - Add static `scripts/check.sh` checks for click/menu invariants (`on_applet_clicked`, `this.menu.toggle()`, Einstellungen item, `configureApplet()` wiring).

### ATPlayer Parity Audit

ATCinna is not yet feature-complete against ATPlayer. The applet currently covers the core quick-access path: catalog refresh/search, sender/genre/topic filters, play/open/download handoff, a first FIFO download queue, history, favorites, optional GTK search dialog, D-Bus status, local install/package checks, and runtime smoke checks.

Known parity gaps from `/home/teladi/ATPlayer`:

- Download queue management: ATPlayer has durable queue concepts and UI actions for start/stop/edit/delete/reorder/cleanup; ATCinna now has a first FIFO queue with enqueue/list/run-next/cancel/clear, but not yet edit/delete/reorder/undo/open-directory/copy-url queue workflows.
- Blacklist management and filter profiles: ATPlayer has blacklist/filter configuration surfaces; ATCinna only has simple text filters.
- Rich audio-list actions: ATPlayer has table/context-menu workflows such as metadata/info dialogs and broader audio actions; ATCinna exposes only compact popup actions.
- Full settings/config migration: ATPlayer has a multi-pane configuration model and legacy config data; ATCinna only uses Cinnamon applet settings and has no legacy import path.

Next parity implementation priority: expand the download queue with edit/delete/reorder/undo/open-directory/copy-url workflows, then add blacklist/filter-profile management.

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
