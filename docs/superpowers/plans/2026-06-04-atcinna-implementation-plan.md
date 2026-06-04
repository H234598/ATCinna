# ATCinna Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ATCinna as a Java-free Cinnamon applet that searches, plays, opens, and downloads entries from the ATPlayer-compatible audio catalog.

**Architecture:** Keep the applet UI in Cinnamon JavaScript and keep catalog work in a small Python helper. The helper owns network, cache parsing, search, and download operations; the applet owns panel state, settings, menu rendering, and non-blocking subprocess calls. The legacy ATPlayer Java application is only a format and behavior reference.

**Tech Stack:** Cinnamon 6.6 applet API, GJS/CJS-style Cinnamon JavaScript, Python 3 standard library, `curl`, `jq`, `shellcheck`.

---

## Current Baseline

- `VERSION` is `0.1.1`.
- `atcinna@H234598/applet.js` provides the Cinnamon applet shell, popup search input, refresh action, result rendering, and play/open/download handoff.
- `atcinna@H234598/scripts/atcinna-catalog` provides `refresh`, `search`, and `download`.
- `scripts/check.sh` is the local quality gate.

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

- [ ] **Step 1: Extend helper search arguments**

Add optional `--sender`, `--genre`, and `--topic` filters. Match them case-insensitively after inherited row values are normalized.

- [ ] **Step 2: Add settings schema entries**

Add string settings for sender, genre, and topic filters.

- [ ] **Step 3: Add compact filter actions**

Add menu items that expose current filter values and a clear-filters action.

- [ ] **Step 4: Verify**

Run:

```bash
./scripts/check.sh
```

Expected: fixture search validates filter matching and clear-filters leaves broad search working.

- [ ] **Step 5: Commit**

```bash
git add atcinna@H234598 README.md CHANGELOG.md
git commit -m "feat: add catalog filters"
```

## Alternative Plan

If Cinnamon menu input proves too fragile across local Cinnamon versions, keep the applet popup read-only and build a small external GTK search dialog launched from the applet. The applet still remains Java-free: Cinnamon JavaScript launches a Python GTK dialog, and the existing `atcinna-catalog` helper remains the catalog backend.

### Alternative Task A: Keep Popup As Launcher

**Files:**
- Modify: `atcinna@H234598/applet.js`
- Create: `atcinna@H234598/scripts/atcinna-search-dialog`
- Modify: `README.md`

- [ ] **Step 1: Add a popup action**

Add "Suche öffnen" to the applet menu and launch:

```javascript
Util.spawn([dialogPath]);
```

- [ ] **Step 2: Implement dialog with Python GTK**

Use Python plus GI GTK bindings only if available locally. If GTK bindings are missing, keep this alternative inactive and continue with the primary plan.

- [ ] **Step 3: Verify**

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
