const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const Util = imports.misc.util;

const CMD_SUCCESS = 0;
const UUID = "atcinna@H234598";

class ATCinnaApplet extends Applet.TextIconApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this.metadata = metadata || {};
        this.instanceId = instanceId;
        const appletPath = this.metadata.path || GLib.build_filenamev([global.userdatadir, "applets", UUID]);
        this._helperPath = GLib.build_filenamev([appletPath, "scripts", "atcinna-catalog"]);
        this._refreshTimer = 0;
        this._searchDebounceTimer = 0;
        this._searchEntry = null;
        this._activeSearchQuery = "";
        this._isSyncingSearchQueryFromSettings = false;
        this._isSyncingFilterSettingsFromSettings = false;
        this._historySection = null;
        this._favoritesSection = null;
        this._filterSection = null;
        this._filterSummaryItem = null;
        this._clearFiltersItem = null;

        this.setAllowedLayout(Applet.AllowedLayout.BOTH);
        this.set_applet_icon_symbolic_name("audio-x-generic-symbolic");
        this.set_applet_label("ATCinna");
        this.set_applet_tooltip("ATCinna");

        this.settings = new Settings.AppletSettings(this, UUID, instanceId);
        this.settings.bind("search-query", "searchQuery", this._onSearchSettingsChanged.bind(this));
        this.settings.bind("sender-filter", "senderFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("genre-filter", "genreFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("topic-filter", "topicFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("max-hits", "maxHits", this._onMaxHitsChanged.bind(this));
        this.settings.bind("download-folder", "downloadFolder", null);
        this.settings.bind("refresh-mirror", "refreshMirror", null);
        this._activeSearchQuery = this.searchQuery || "";

        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);

        this._statusItem = new PopupMenu.PopupMenuItem("initialisiere...");
        this._statusItem.actor.reactive = false;
        this.menu.addMenuItem(this._statusItem);

        this._searchEntry = new St.Entry({
            name: "atcinna-search-entry",
            style_class: "atcinna-search-entry",
            text: this.searchQuery || "",
            hint_text: "Suche ...",
            can_focus: true,
            track_hover: true,
            x_expand: true
        });
        const searchRow = new St.BoxLayout({
            style_class: "atcinna-search-row",
            vertical: false,
            x_expand: true
        });
        searchRow.add_actor(this._searchEntry);
        this._searchEntry.clutter_text.connect("text-changed", () => {
            this._onSearchInputChanged();
        });
        this._searchEntry.clutter_text.connect("activate", () => {
            this._runSearchNow();
        });
        this.menu.addActor(searchRow);

        this._filterSection = new PopupMenu.PopupMenuSection();
        this._filterSummaryItem = new PopupMenu.PopupMenuItem("Filter: keine");
        this._filterSummaryItem.actor.reactive = false;
        this._filterSummaryItem.actor.add_style_class_name("atcinna-filter-summary");
        this._filterSection.addMenuItem(this._filterSummaryItem);

        this._clearFiltersItem = new PopupMenu.PopupMenuItem("Filter löschen");
        this._clearFiltersItem.connect("activate", () => {
            this._clearFilters();
        });
        this._filterSection.addMenuItem(this._clearFiltersItem);
        this.menu.addMenuItem(this._filterSection);

        this._refreshItem = new PopupMenu.PopupMenuItem("Jetzt aktualisieren");
        this._refreshItem.connect("activate", () => this._runRefresh());
        this.menu.addMenuItem(this._refreshItem);

        this._resultsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._resultsSection);

        this._historySection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._historySection);

        this._favoritesSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._favoritesSection);

        this._refreshFilterSummary();

        this._refreshTimer = Mainloop.timeout_add_seconds(1, () => {
            this._refreshTimer = 0;
            this._runSearch();
            return GLib.SOURCE_REMOVE;
        });
    }

    _runHelper(args, cb) {
        const argv = [this._helperPath, ...args];
        let proc;
        try {
            proc = Gio.Subprocess.newv(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (error) {
            cb(-1, "", `${error}`);
            return;
        }

        proc.communicate_utf8_async(null, null, (source, res) => {
            try {
                const [, stdout, stderr] = source.communicate_utf8_finish(res);
                const status = source.get_exit_status();
                cb(status, stdout, stderr);
            } catch (error) {
                cb(-1, "", `${error}`);
            }
        });
    }

    _setStatus(message) {
        this._statusItem.label.text = message;
    }

    _runRefresh() {
        this._setStatus("aktualisiere Katalog ...");
        this._runHelper([
            "refresh",
            `--mirror=${this.refreshMirror || ""}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`refresh fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }

            let payload = {};
            try {
                payload = JSON.parse((stdout || "{}"));
            } catch (error) {
                this._setStatus(`refresh ungültige Antwort: ${error.message}`);
                return;
            }

            this._setStatus(`cache: ${payload.entries} Einträge`);
            this._runSearch();
        });
    }

    _toTrimmed(value) {
        return (value || "").trim();
    }

    _getActiveFilters() {
        return {
            sender: this._toTrimmed(this.senderFilter),
            genre: this._toTrimmed(this.genreFilter),
            topic: this._toTrimmed(this.topicFilter)
        };
    }

    _shortFilterValue(value) {
        const clean = this._toTrimmed(value).replace(/\s+/g, " ");
        if (clean.length <= 32) {
            return clean;
        }
        return `${clean.slice(0, 29)}...`;
    }

    _refreshFilterSummary() {
        if (!this._filterSummaryItem) {
            return;
        }
        const filters = this._getActiveFilters();
        const active = [];
        if (filters.sender.length > 0) {
            active.push(`S:${this._shortFilterValue(filters.sender)}`);
        }
        if (filters.genre.length > 0) {
            active.push(`G:${this._shortFilterValue(filters.genre)}`);
        }
        if (filters.topic.length > 0) {
            active.push(`T:${this._shortFilterValue(filters.topic)}`);
        }
        this._filterSummaryItem.label.text = active.length ? `Filter: ${active.join(" · ")}` : "Filter: keine";
        if (this._clearFiltersItem) {
            this._clearFiltersItem.setSensitive(active.length > 0);
        }
    }

    _clearFilters() {
        const filters = this._getActiveFilters();
        if (!filters.sender && !filters.genre && !filters.topic) {
            this._refreshFilterSummary();
            this._runSearch();
            return;
        }

        this._isSyncingFilterSettingsFromSettings = true;
        try {
            this.senderFilter = "";
            this.genreFilter = "";
            this.topicFilter = "";
            this.settings.setValue("sender-filter", "");
            this.settings.setValue("genre-filter", "");
            this.settings.setValue("topic-filter", "");
        } finally {
            this._isSyncingFilterSettingsFromSettings = false;
        }

        this._refreshFilterSummary();
        this._runSearch();
    }

    _onFilterSettingsChanged() {
        if (this._isSyncingFilterSettingsFromSettings) {
            return;
        }
        this._refreshFilterSummary();
        this._runSearch();
    }

    _runSearch(searchQuery = null) {
        this._setStatus("suche im Katalog ...");
        const query = searchQuery === null ? this._getActiveSearchQuery() : searchQuery;
        const maxHits = Math.max(1, Math.min(Number(this.maxHits) || 20, 100));
        const filters = this._getActiveFilters();
        const args = [
            "search",
            `--query=${query}`,
            `--max=${maxHits}`
        ];

        if (filters.sender.length > 0) {
            args.push(`--sender=${filters.sender}`);
        }
        if (filters.genre.length > 0) {
            args.push(`--genre=${filters.genre}`);
        }
        if (filters.topic.length > 0) {
            args.push(`--topic=${filters.topic}`);
        }

        this._runHelper(args, (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`suche fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                this._clearResults();
                return;
            }

            try {
                const payload = JSON.parse((stdout || "{}"));
                const results = Array.isArray(payload.results) ? payload.results : [];
                this._setStatus(`${payload.count || 0} Treffer für "${payload.query || query}"`);
                this._renderResults(results);
                this._loadSections();
            } catch (error) {
                this._setStatus(`Antwort ungültig: ${error.message}`);
                this._clearResults();
                this._clearHistoryAndFavorites();
            }
        });
    }

    _runSearchNow() {
        const query = this._searchEntry ? this._searchEntry.get_text() : this.searchQuery || "";
        if (this._searchDebounceTimer > 0) {
            GLib.source_remove(this._searchDebounceTimer);
            this._searchDebounceTimer = 0;
        }
        this._activeSearchQuery = query;
        this._runSearch(query);
    }

    _onSearchInputChanged() {
        if (this._isSyncingSearchQueryFromSettings) {
            return;
        }
        if (this._searchDebounceTimer > 0) {
            GLib.source_remove(this._searchDebounceTimer);
            this._searchDebounceTimer = 0;
        }

        this._searchDebounceTimer = Mainloop.timeout_add(350, () => {
            this._searchDebounceTimer = 0;
            this._runSearchNow();
            return GLib.SOURCE_REMOVE;
        });
    }

    _renderResults(results) {
        this._clearResults();
        if (!results.length) {
            const empty = new PopupMenu.PopupMenuItem("keine Treffer");
            empty.actor.reactive = false;
            this._resultsSection.addMenuItem(empty);
            return;
        }

        for (const item of results) {
            const title = item.title || "";
            const sender = item.sender || "";
            const genre = item.genre || "";
            const topic = item.topic || "";
            const subtitle = [sender, genre, topic].filter(Boolean).join(" · ");
            const entry = new PopupMenu.PopupSubMenuMenuItem(`${title}${subtitle ? ` — ${subtitle}` : ""}`);

            const play = new PopupMenu.PopupMenuItem("Abspielen (xdg-open)");
            play.connect("activate", () => this._playItem(item));
            entry.menu.addMenuItem(play);

            this._addWebsiteAction(entry.menu, item);

            const download = new PopupMenu.PopupMenuItem("Herunterladen");
            download.connect("activate", () => this._runDownload(item));
            entry.menu.addMenuItem(download);

            const addBookmark = new PopupMenu.PopupMenuItem("Zu Favoriten hinzufügen");
            addBookmark.connect("activate", () => this._runBookmarkAdd(item));
            entry.menu.addMenuItem(addBookmark);

            this._resultsSection.addMenuItem(entry);
        }
    }

    _loadSections() {
        this._clearHistoryAndFavorites();
        this._loadHistory();
        this._loadBookmarks();
    }

    _clearHistoryAndFavorites() {
        if (this._historySection) {
            this._historySection.removeAll();
        }
        if (this._favoritesSection) {
            this._favoritesSection.removeAll();
        }
    }

    _renderHistory(items) {
        if (!this._historySection) {
            return;
        }
        this._historySection.removeAll();

        const heading = new PopupMenu.PopupMenuItem("Zuletzt gespielt");
        heading.actor.reactive = false;
        heading.actor.add_style_class_name("atcinna-section-title");
        this._historySection.addMenuItem(heading);

        const entries = Array.isArray(items) ? items : [];
        if (!entries.length) {
            const empty = new PopupMenu.PopupMenuItem("keine Historie");
            empty.actor.reactive = false;
            this._historySection.addMenuItem(empty);
            return;
        }

        for (const item of entries.slice(0, 5)) {
            this._historySection.addMenuItem(this._buildPlayableSubItem(item, false));
        }
    }

    _renderBookmarks(items) {
        if (!this._favoritesSection) {
            return;
        }
        this._favoritesSection.removeAll();

        const heading = new PopupMenu.PopupMenuItem("Favoriten");
        heading.actor.reactive = false;
        heading.actor.add_style_class_name("atcinna-section-title");
        this._favoritesSection.addMenuItem(heading);

        const entries = Array.isArray(items) ? items : [];
        if (!entries.length) {
            const empty = new PopupMenu.PopupMenuItem("keine Favoriten");
            empty.actor.reactive = false;
            this._favoritesSection.addMenuItem(empty);
            return;
        }

        for (const item of entries.slice(0, 5)) {
            this._favoritesSection.addMenuItem(this._buildPlayableSubItem(item, true));
        }
    }

    _buildPlayableSubItem(item, withRemoveAction) {
        const title = item.title || "";
        const sender = item.sender || "";
        const genre = item.genre || "";
        const topic = item.topic || "";
        const subtitle = [sender, genre, topic].filter(Boolean).join(" · ");
        const row = new PopupMenu.PopupSubMenuMenuItem(`${title}${subtitle ? ` — ${subtitle}` : ""}`);

        const play = new PopupMenu.PopupMenuItem("Abspielen (xdg-open)");
        play.connect("activate", () => this._playItem(item));
        row.menu.addMenuItem(play);

        this._addWebsiteAction(row.menu, item);

        if (withRemoveAction) {
            const remove = new PopupMenu.PopupMenuItem("Entfernen");
            remove.connect("activate", () => this._runBookmarkRemove(item));
            row.menu.addMenuItem(remove);
        }

        return row;
    }

    _entryArgs(item) {
        return [
            `--title=${item.title || ""}`,
            `--sender=${item.sender || ""}`,
            `--genre=${item.genre || ""}`,
            `--topic=${item.topic || ""}`,
            `--url=${item.url || ""}`,
            `--website=${item.website || ""}`
        ];
    }

    _addWebsiteAction(menu, item) {
        if (!item.website) {
            return;
        }
        const web = new PopupMenu.PopupMenuItem("Webseite");
        web.connect("activate", () => this._xdgOpen(item.website));
        menu.addMenuItem(web);
    }

    _runHistoryAdd(item, onComplete = null) {
        this._runHelper([
            "history-add",
            ...this._entryArgs(item)
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`history-add fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                if (onComplete) {
                    onComplete();
                }
                return;
            }
            try {
                const payload = JSON.parse((stdout || "{}"));
                if (payload.status !== "ok") {
                    this._setStatus("history-add: unerwartete Antwort");
                    if (onComplete) {
                        onComplete();
                    }
                    return;
                }
                this._loadHistory();
            } catch (error) {
                this._setStatus(`history-add ungültige Antwort: ${error.message}`);
            }
            if (onComplete) {
                onComplete();
            }
        });
    }

    _loadHistory() {
        this._runHelper([
            "history-list"
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`history-list fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse((stdout || "{}"));
                this._renderHistory(payload.results || []);
            } catch (error) {
                this._setStatus(`history-list ungültige Antwort: ${error.message}`);
            }
        });
    }

    _runBookmarkAdd(item) {
        this._runHelper([
            "bookmark-add",
            ...this._entryArgs(item)
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`bookmark-add fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse((stdout || "{}"));
                if (payload.status !== "ok") {
                    this._setStatus("bookmark-add: unerwartete Antwort");
                    return;
                }
                this._loadSections();
            } catch (error) {
                this._setStatus(`bookmark-add ungültige Antwort: ${error.message}`);
            }
        });
    }

    _loadBookmarks() {
        this._runHelper([
            "bookmark-list"
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`bookmark-list fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse((stdout || "{}"));
                this._renderBookmarks(payload.results || []);
            } catch (error) {
                this._setStatus(`bookmark-list ungültige Antwort: ${error.message}`);
            }
        });
    }

    _runBookmarkRemove(item) {
        const url = item.url || "";
        if (!url) {
            this._setStatus("bookmark-remove fehlgeschlagen: keine URL");
            return;
        }
        this._runHelper([
            "bookmark-remove",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`bookmark-remove fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse((stdout || "{}"));
                if (payload.status !== "ok") {
                    this._setStatus("bookmark-remove: unerwartete Antwort");
                    return;
                }
                this._loadBookmarks();
            } catch (error) {
                this._setStatus(`bookmark-remove ungültige Antwort: ${error.message}`);
            }
        });
    }

    _playItem(item) {
        const url = item.url || "";
        if (!url) {
            this._setStatus("abspielen fehlgeschlagen: keine URL");
            return;
        }
        this._runHistoryAdd(item, () => {
            this._xdgOpen(url);
        });
    }

    _runDownload(item) {
        const folder = this.downloadFolder || "";
        this._setStatus(`lade herunter: ${item.title || "Eintrag"}`);
        const url = item.url || "";
        if (!url) {
            this._setStatus("Download fehlgeschlagen: keine URL");
            return;
        }
        this._runHelper([
            "download",
            `--url=${url}`,
            `--folder=${folder}`,
            `--title=${item.title || ""}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            let payload = {};
            try {
                payload = JSON.parse(stdout || "{}");
                if (payload.path) {
                    this._setStatus(`gespeichert: ${payload.path}`);
                } else {
                    this._setStatus("download abgeschlossen");
                }
            } catch (error) {
                this._setStatus(`download Antwort ungültig: ${error.message}`);
            }
        });
    }

    _xdgOpen(uri) {
        if (!uri) {
            this._setStatus("öffnen fehlgeschlagen: keine URL");
            return;
        }

        const targetUri = `${uri}`.trim();
        const lowered = targetUri.toLowerCase();
        if (!lowered.startsWith("http://") && !lowered.startsWith("https://")) {
            this._setStatus("öffnen fehlgeschlagen: unzulässiges URL-Schema");
            return;
        }

        this._setStatus(`öffne: ${targetUri}`);
        Util.spawn(["xdg-open", targetUri]);
    }

    _clearResults() {
        this._resultsSection.removeAll();
        this._clearHistoryAndFavorites();
    }

    _getActiveSearchQuery() {
        if (this._searchEntry) {
            return this._searchEntry.get_text();
        }
        return this._activeSearchQuery || this.searchQuery || "";
    }

    _onSearchSettingsChanged() {
        this._activeSearchQuery = this.searchQuery || "";
        if (this._searchEntry && this._searchEntry.get_text() !== this.searchQuery) {
            this._isSyncingSearchQueryFromSettings = true;
            try {
                this._searchEntry.set_text(this.searchQuery || "");
            } finally {
                this._isSyncingSearchQueryFromSettings = false;
            }
        }
        this._refreshFilterSummary();
        this._runSearch(this.searchQuery || "");
    }

    _onMaxHitsChanged() {
        this._runSearch();
    }

    on_applet_clicked() {
        this.menu.toggle();
    }

    on_applet_removed_from_panel() {
        if (this._refreshTimer > 0) {
            GLib.source_remove(this._refreshTimer);
            this._refreshTimer = 0;
        }
        if (this._searchDebounceTimer > 0) {
            GLib.source_remove(this._searchDebounceTimer);
            this._searchDebounceTimer = 0;
        }
        if (this.settings) {
            this.settings.finalize();
            this.settings = null;
        }
    }

    destroy() {
        this.on_applet_removed_from_panel();
        if (this.menu) {
            this.menu.destroy();
            this.menu = null;
        }
        super.destroy();
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new ATCinnaApplet(metadata, orientation, panelHeight, instanceId);
}
