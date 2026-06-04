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
const DBUS_SERVICE_NAME = "org.Cinnamon.Applets.ATCinna";
const DBUS_OBJECT_PATH = "/org/Cinnamon/Applets/ATCinna";
const DBUS_INTERFACE_NAME = "org.Cinnamon.Applets.ATCinna";
const DBUS_INTERFACE_XML = `<node>
  <interface name="${DBUS_INTERFACE_NAME}">
    <method name="Ping">
      <arg type="s" direction="out" name="response"/>
    </method>
    <method name="GetStatus">
      <arg type="s" direction="out" name="json"/>
    </method>
  </interface>
</node>`;

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
        this._searchDialogPath = GLib.build_filenamev([appletPath, "scripts", "atcinna-search-dialog"]);
        this._historySection = null;
        this._favoritesSection = null;
        this._filterSection = null;
        this._queueSection = null;
        this._queueListSection = null;
        this._filterSummaryItem = null;
        this._clearFiltersItem = null;
        this._dbusImpl = null;
        this._dbusOwnerId = 0;
        this._dbusPath = DBUS_OBJECT_PATH;
        this._registerDbusInterface();

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

        this._openSearchDialogItem = new PopupMenu.PopupMenuItem("Suche öffnen");
        this._openSearchDialogItem.connect("activate", () => {
            this._launchSearchDialog();
        });
        this.menu.addMenuItem(this._openSearchDialogItem);

        this._openSettingsItem = new PopupMenu.PopupMenuItem("Einstellungen");
        this._openSettingsItem.connect("activate", () => {
            this._openAppletSettings();
        });
        this.menu.addMenuItem(this._openSettingsItem);

        this._refreshItem = new PopupMenu.PopupMenuItem("Jetzt aktualisieren");
        this._refreshItem.connect("activate", () => this._runRefresh());
        this.menu.addMenuItem(this._refreshItem);

        this._resultsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._resultsSection);

        this._historySection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._historySection);

        this._favoritesSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._favoritesSection);

        this._queueSection = new PopupMenu.PopupMenuSection();
        this._queueListSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._queueSection);
        this.menu.addMenuItem(this._queueListSection);

        this._setupQueueActions();

        this._refreshFilterSummary();

        this._refreshTimer = Mainloop.timeout_add_seconds(1, () => {
            this._refreshTimer = 0;
            this._runSearch();
            return GLib.SOURCE_REMOVE;
        });

        this._runQueueList();
    }

    _registerDbusInterface() {
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(DBUS_INTERFACE_XML, this);
        this._dbusImpl.export(Gio.DBus.session, this._dbusPath);
        this._dbusOwnerId = Gio.DBus.session.own_name(DBUS_SERVICE_NAME, Gio.BusNameOwnerFlags.REPLACE, null, null);
    }

    _unregisterDbusInterface() {
        if (this._dbusImpl) {
            try {
                this._dbusImpl.unexport();
            } catch (error) {
                // Ignore best-effort cleanup errors to avoid disrupting panel teardown.
            }
            this._dbusImpl = null;
        }
        if (this._dbusOwnerId > 0) {
            try {
                Gio.DBus.session.unown_name(this._dbusOwnerId);
            } catch (error) {
                // Ignore best-effort cleanup errors to avoid teardown noise.
            }
            this._dbusOwnerId = 0;
        }
    }

    Ping() {
        return "pong";
    }

    GetStatus() {
        return JSON.stringify(this._buildDbusStatus());
    }

    _buildDbusStatus() {
        const hasHelper = GLib.file_test(this._helperPath, GLib.FileTest.EXISTS | GLib.FileTest.IS_EXECUTABLE);
        const maxHits = Number(this.maxHits) || 0;
        return {
            status: "ok",
            uuid: UUID,
            instanceId: `${this.instanceId || ""}`,
            version: this.metadata && this.metadata.version ? this.metadata.version : "",
            activeSearchQuery: this._activeSearchQuery || "",
            maxHits: maxHits,
            hasHelper: hasHelper,
            dbusPath: this._dbusPath
        };
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

    _openAppletSettings() {
        if (typeof this.configureApplet === "function") {
            this.configureApplet();
            this.menu.close();
            return;
        }
        this._setStatus("Einstellungen nicht verfügbar");
    }

    _launchSearchDialog() {
        if (!GLib.file_test(this._searchDialogPath, GLib.FileTest.EXISTS | GLib.FileTest.IS_EXECUTABLE)) {
            this._setStatus("Suchdialog nicht verfügbar: Script fehlt");
            return;
        }
        try {
            Util.spawn([this._searchDialogPath, `--download-folder=${this.downloadFolder || ""}`]);
        } catch (error) {
            this._setStatus(`Suchdialog konnte nicht gestartet werden: ${error}`);
        }
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

            const enqueue = new PopupMenu.PopupMenuItem("In Warteschlange legen");
            enqueue.connect("activate", () => this._runDownloadEnqueue(item));
            entry.menu.addMenuItem(enqueue);

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

    _setupQueueActions() {
        if (!this._queueSection) {
            return;
        }

        const heading = new PopupMenu.PopupMenuItem("Download-Warteschlange");
        heading.actor.reactive = false;
        heading.actor.add_style_class_name("atcinna-section-title");
        this._queueSection.addMenuItem(heading);

        const show = new PopupMenu.PopupMenuItem("Warteschlange anzeigen");
        show.connect("activate", () => this._runQueueList());
        this._queueSection.addMenuItem(show);

        const runNext = new PopupMenu.PopupMenuItem("Nächsten Download starten");
        runNext.connect("activate", () => this._runQueueRunNext());
        this._queueSection.addMenuItem(runNext);

        const runAll = new PopupMenu.PopupMenuItem("Alle Downloads starten");
        runAll.connect("activate", () => this._runQueueRunAll());
        this._queueSection.addMenuItem(runAll);

        const stopAll = new PopupMenu.PopupMenuItem("Alle Downloads stoppen");
        stopAll.connect("activate", () => this._runQueueCancelAll());
        this._queueSection.addMenuItem(stopAll);

        const stopQueued = new PopupMenu.PopupMenuItem("Alle wartenden Downloads stoppen");
        stopQueued.connect("activate", () => this._runQueueCancelQueued());
        this._queueSection.addMenuItem(stopQueued);

        const clearDone = new PopupMenu.PopupMenuItem("Erledigte entfernen");
        clearDone.connect("activate", () => this._runQueueClear());
        this._queueSection.addMenuItem(clearDone);

        const restore = new PopupMenu.PopupMenuItem("Gelöschte wieder anlegen");
        restore.connect("activate", () => this._runQueueUndo());
        this._queueSection.addMenuItem(restore);
    }

    _runDownloadEnqueue(item) {
        const folder = this.downloadFolder || "";
        this._setStatus(`in Warteschlange: ${item.title || "Eintrag"}`);
        this._runHelper([
            "download-enqueue",
            ...this._entryArgs(item),
            `--folder=${folder}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`queue-enqueue fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("queue-enqueue: unerwartete Antwort");
                    return;
                }
                this._setStatus("in Warteschlange gespeichert");
                this._runQueueList();
            } catch (error) {
                this._setStatus(`queue-enqueue ungültige Antwort: ${error.message}`);
            }
        });
    }

    _runQueueList() {
        this._runHelper([
            "download-list"
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-list fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                this._renderQueue(payload.results || []);
            } catch (error) {
                this._setStatus(`download-list ungültige Antwort: ${error.message}`);
            }
        });
    }

    _runQueueRunNext() {
        this._setStatus("starte nächsten Download");
        this._runHelper([
            "download-run-next"
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-run-next fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-run-next: unerwartete Antwort");
                    return;
                }
                if (payload.state === "empty") {
                    this._setStatus("warteschlange leer");
                    return;
                }
                if (payload.result && payload.result.path) {
                    this._setStatus(`gespeichert: ${payload.result.path}`);
                } else if (payload.result && payload.result.status === "error") {
                    this._setStatus(`download fehlgeschlagen: ${payload.result.error}`);
                } else {
                    this._setStatus("download abgeschlossen");
                }
                this._runQueueList();
            } catch (error) {
                this._setStatus(`download-run-next ungültige Antwort: ${error.message}`);
            }
        });
    }

    _runQueueRunAll() {
        let remaining = 100;
        let finishedCount = 0;
        let errorCount = 0;

        const runQueued = () => {
            if (remaining <= 0) {
                this._setStatus(`Alle Downloads gestartet: erledigt ${finishedCount}, Fehler ${errorCount} (Limit erreicht)`);
                this._runQueueList();
                return;
            }

            this._runHelper([
                "download-run-next"
            ], (status, stdout, stderr) => {
                if (status !== CMD_SUCCESS) {
                    this._setStatus(`download-run-next fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                    this._runQueueList();
                    return;
                }

                try {
                    const payload = JSON.parse(stdout || "{}");
                    if (payload.status !== "ok") {
                        this._setStatus("download-run-next: unerwartete Antwort");
                        this._runQueueList();
                        return;
                    }

                    if (payload.state === "empty") {
                        this._setStatus(`Alle Downloads abgearbeitet: erledigt ${finishedCount}, Fehler ${errorCount}`);
                        this._runQueueList();
                        return;
                    }

                    if (payload.result && payload.result.status === "finished") {
                        finishedCount += 1;
                    } else if (payload.result && payload.result.status === "error") {
                        errorCount += 1;
                    } else if (!payload.result && payload.state !== "empty") {
                        errorCount += 1;
                    }

                    remaining -= 1;
                    runQueued();
                } catch (error) {
                    this._setStatus(`download-run-next ungültige Antwort: ${error.message}`);
                    this._runQueueList();
                }
            });
        };

        this._setStatus("starte alle Downloads");
        runQueued();
    }

    _runQueueCancelItem(item) {
        const url = item && item.url ? `${item.url}`.trim() : "";
        if (!this._normalizeQueueItemUrl(item)) {
            this._setStatus("Download stoppen fehlgeschlagen: keine URL");
            return;
        }
        this._setStatus(`storniere Download: ${item.title || "Eintrag"}`);
        this._runHelper([
            "download-cancel",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-cancel fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-cancel: unerwartete Antwort");
                    return;
                }
                if (payload.changed === 0 && payload.running_blocks > 0) {
                    this._setStatus("läuft: Eintrag ist bereits inaktiv");
                } else if (payload.changed === 0) {
                    this._setStatus("nichts geändert");
                } else if (payload.changed >= 1) {
                    this._setStatus(`Download gestoppt: ${payload.changed}`);
                } else {
                    this._setStatus("Download wurde abgeschlossen oder nicht aktiv");
                }
                this._runQueueList();
            } catch (error) {
                this._setStatus(`download-cancel ungültige Antwort: ${error.message}`);
            }
        });
    }

    _runQueueCancelAll() {
        this._setStatus("stoppe Warteschlange");
        this._runHelper([
            "download-cancel",
            "--all"
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-cancel fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            this._runQueueList();
        });
    }

    _runQueueCancelQueued() {
        this._setStatus("stoppe wartende Downloads");
        this._runHelper([
            "download-cancel",
            "--queued-only"
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-cancel fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-cancel: unerwartete Antwort");
                    return;
                }
                this._setStatus(`wartende Downloads gestoppt: ${payload.changed || 0}`);
                this._runQueueList();
            } catch (error) {
                this._setStatus(`download-cancel ungültige Antwort: ${error.message}`);
            }
        });
    }

    _runQueueClear() {
        this._setStatus("entferne erledigte Downloads");
        this._runHelper([
            "download-clear"
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-clear fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            this._runQueueList();
        });
    }

    _renderQueue(items) {
        if (!this._queueListSection) {
            return;
        }

        this._queueListSection.removeAll();
        const entries = Array.isArray(items) ? items : [];

        if (!entries.length) {
            const empty = new PopupMenu.PopupMenuItem("keine Einträge in Warteschlange");
            empty.actor.reactive = false;
            this._queueListSection.addMenuItem(empty);
            return;
        }

        for (const item of entries.slice(0, 20)) {
            const status = item.status || "queued";
            const title = item.title || "Eintrag";
            const subtitle = item.status === "finished" && item.path ? ` — ${item.path}` : "";
            const row = new PopupMenu.PopupSubMenuMenuItem(`${title} (${status})${subtitle}`);

            const cancel = new PopupMenu.PopupMenuItem("Download stoppen");
            cancel.connect("activate", () => this._runQueueCancelItem(item));
            row.menu.addMenuItem(cancel);

            const play = new PopupMenu.PopupMenuItem("Audio (URL) abspielen");
            play.connect("activate", () => this._playItem(item));
            row.menu.addMenuItem(play);

            const copy = new PopupMenu.PopupMenuItem("Download (URL) kopieren");
            copy.connect("activate", () => this._copyQueueUrl(item));
            row.menu.addMenuItem(copy);

            const openFile = new PopupMenu.PopupMenuItem("Gespeichertes Audio (Datei) abspielen");
            openFile.connect("activate", () => this._openQueueFile(item));
            row.menu.addMenuItem(openFile);

            const openFolder = new PopupMenu.PopupMenuItem("Zielordner öffnen");
            openFolder.connect("activate", () => this._openQueuePathFolder(item));
            row.menu.addMenuItem(openFolder);

            const remove = new PopupMenu.PopupMenuItem("Aus Liste entfernen");
            remove.connect("activate", () => this._runQueueRemove(item));
            row.menu.addMenuItem(remove);

            const prefer = new PopupMenu.PopupMenuItem("Vorziehen");
            prefer.connect("activate", () => this._runQueuePrefer(item));
            row.menu.addMenuItem(prefer);

            const putBack = new PopupMenu.PopupMenuItem("Zurückstellen");
            putBack.connect("activate", () => this._runQueuePutBack(item));
            row.menu.addMenuItem(putBack);

            this._queueListSection.addMenuItem(row);
        }
    }

    _runQueueUndo() {
        this._setStatus("stelle gelöschte Einträge wieder her");
        this._runHelper([
            "download-undo"
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-undo fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-undo: unerwartete Antwort");
                    return;
                }
                if (payload.restored === 0) {
                    this._setStatus("nichts zum Wiederherstellen");
                } else {
                    this._setStatus(`wiederhergestellt: ${payload.restored}`);
                }
                this._runQueueList();
            } catch (error) {
                this._setStatus(`download-undo ungültige Antwort: ${error.message}`);
            }
        });
    }

    _runQueueRemove(item) {
        const url = item.url || "";
        if (!url) {
            this._setStatus("queue-remove fehlgeschlagen: keine URL");
            return;
        }
        this._setStatus(`entferne aus Warteschlange: ${item.title || "Eintrag"}`);
        this._runHelper([
            "download-remove",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-remove fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-remove: unerwartete Antwort");
                    return;
                }
                if (payload.removed === 0 && payload.running_blocks > 0) {
                    this._setStatus("laufender Download wird nicht entfernt");
                } else if (payload.removed === 0) {
                    this._setStatus("nichts entfernt");
                } else {
                    this._setStatus(`entfernt: ${payload.removed}`);
                }
                this._runQueueList();
            } catch (error) {
                this._setStatus(`download-remove ungültige Antwort: ${error.message}`);
            }
        });
    }

    _runQueuePrefer(item) {
        const url = item.url || "";
        if (!url) {
            this._setStatus("queue-prefer fehlgeschlagen: keine URL");
            return;
        }
        this._setStatus(`ziehe vor: ${item.title || "Eintrag"}`);
        this._runHelper([
            "download-prefer",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-prefer fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-prefer: unerwartete Antwort");
                    return;
                }
                if (!payload.moved) {
                    this._setStatus("Eintrag konnte nicht vorgezogen werden");
                }
                this._runQueueList();
            } catch (error) {
                this._setStatus(`download-prefer ungültige Antwort: ${error.message}`);
            }
        });
    }

    _runQueuePutBack(item) {
        const url = item.url || "";
        if (!url) {
            this._setStatus("queue-put-back fehlgeschlagen: keine URL");
            return;
        }
        this._setStatus(`stelle zurück: ${item.title || "Eintrag"}`);
        this._runHelper([
            "download-put-back",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-put-back fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-put-back: unerwartete Antwort");
                    return;
                }
                if (!payload.moved) {
                    this._setStatus("Eintrag konnte nicht zurückgestellt werden");
                }
                this._runQueueList();
            } catch (error) {
                this._setStatus(`download-put-back ungültige Antwort: ${error.message}`);
            }
        });
    }

    _copyQueueUrl(item) {
        const url = this._normalizeQueueItemUrl(item);
        if (!url) {
            this._setStatus("URL kopieren fehlgeschlagen: keine URL");
            return;
        }

        try {
            if (!St.Clipboard || !St.ClipboardType || typeof St.Clipboard.get_default !== "function") {
                throw new Error("Clipboard-API nicht verfügbar");
            }
            const clipboard = St.Clipboard.get_default();
            if (!clipboard || typeof clipboard.set_text !== "function") {
                throw new Error("Clipboard-Objekt nicht verfügbar");
            }
            clipboard.set_text(St.ClipboardType.CLIPBOARD, url);
            this._setStatus("URL in Zwischenablage kopiert");
            return;
        } catch (error) {
            this._setStatus(`URL kopieren nicht verfügbar: ${error.message}`);
        }
    }

    _normalizeQueueItemUrl(item) {
        const raw = item && item.url ? item.url : "";
        const trimmed = `${raw}`.trim();
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            return "";
        }
        return trimmed;
    }

    _openQueuePathFolder(item) {
        const folderCandidate = this._queueFolderCandidate(item);
        if (!folderCandidate) {
            this._setStatus("Ordner öffnen fehlgeschlagen: kein Pfad gespeichert");
            return;
        }
        if (folderCandidate.includes("\u0000")) {
            this._setStatus("Ordner öffnen fehlgeschlagen: ungültiger Pfad");
            return;
        }
        if (!GLib.path_is_absolute(folderCandidate)) {
            this._setStatus("Ordner öffnen fehlgeschlagen: kein absoluter Pfad");
            return;
        }

        let folderToOpen = folderCandidate;
        try {
            const target = Gio.File.new_for_path(folderCandidate);
            if (!target.query_exists(null)) {
                this._setStatus("Ordner öffnen fehlgeschlagen: Pfad existiert nicht");
                return;
            }
            const fileInfo = target.query_info("standard::type", Gio.FileQueryInfoFlags.NONE, null);
            if (!fileInfo) {
                this._setStatus("Ordner öffnen fehlgeschlagen: Ziel nicht prüfbar");
                return;
            }
            const type = fileInfo.get_file_type();
            if (type === Gio.FileType.DIRECTORY) {
                folderToOpen = folderCandidate;
            } else {
                const parent = target.get_parent();
                if (!parent) {
                    this._setStatus("Ordner öffnen fehlgeschlagen: Datei ohne Elterndatei");
                    return;
                }
                if (!parent.query_exists(null)) {
                    this._setStatus("Ordner öffnen fehlgeschlagen: Elternordner fehlt");
                    return;
                }
                folderToOpen = parent.get_path() || folderCandidate;
            }

            const fileTarget = Gio.File.new_for_path(folderToOpen);
            if (!GLib.file_test(fileTarget.get_path(), GLib.FileTest.IS_DIR)) {
                this._setStatus("Ordner öffnen fehlgeschlagen: kein gültiges Verzeichnis");
                return;
            }
        } catch (error) {
            this._setStatus(`Ordner öffnen fehlgeschlagen: ${error.message}`);
            return;
        }

        this._setStatus(`öffne Ordner: ${folderToOpen}`);
        Util.spawn(["xdg-open", folderToOpen]);
    }

    _openQueueFile(item) {
        const pathValue = item && item.path ? `${item.path}`.trim() : "";
        if (!pathValue) {
            this._setStatus("Datei öffnen fehlgeschlagen: kein Pfad gespeichert");
            return;
        }
        if (pathValue.includes("\u0000") || !GLib.path_is_absolute(pathValue)) {
            this._setStatus("Datei öffnen fehlgeschlagen: ungültiger Pfad");
            return;
        }

        try {
            const fileTarget = Gio.File.new_for_path(pathValue);
            if (!fileTarget.query_exists(null)) {
                this._setStatus("Datei öffnen fehlgeschlagen: Datei nicht vorhanden");
                return;
            }
            const fileInfo = fileTarget.query_info("standard::type", Gio.FileQueryInfoFlags.NONE, null);
            if (!fileInfo) {
                this._setStatus("Datei öffnen fehlgeschlagen: Ziel nicht prüfbar");
                return;
            }
            if (fileInfo.get_file_type() !== Gio.FileType.REGULAR) {
                this._setStatus("Datei öffnen fehlgeschlagen: kein regulärer File-Typ");
                return;
            }
        } catch (error) {
            this._setStatus(`Datei öffnen fehlgeschlagen: ${error.message}`);
            return;
        }

        this._setStatus(`spiele Datei ab: ${pathValue}`);
        Util.spawn(["xdg-open", pathValue]);
    }

    _queueFolderCandidate(item) {
        const pathValue = item && item.path ? `${item.path}`.trim() : "";
        if (pathValue) {
            return pathValue;
        }
        const folderValue = item && item.folder ? `${item.folder}`.trim() : "";
        if (folderValue) {
            return folderValue;
        }
        return this._defaultDownloadFolder();
    }

    _defaultDownloadFolder() {
        try {
            const specialDownloads = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD);
            if (specialDownloads) {
                return specialDownloads;
            }
        } catch (error) {
            // Fall back below when the desktop does not expose the XDG user dir.
        }
        return GLib.build_filenamev([GLib.get_home_dir(), "Downloads"]);
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
        this._unregisterDbusInterface();
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
