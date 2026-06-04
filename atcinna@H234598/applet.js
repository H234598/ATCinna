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

        this.setAllowedLayout(Applet.AllowedLayout.BOTH);
        this.set_applet_icon_symbolic_name("audio-x-generic-symbolic");
        this.set_applet_label("ATCinna");
        this.set_applet_tooltip("ATCinna");

        this.settings = new Settings.AppletSettings(this, UUID, instanceId);
        this.settings.bind("search-query", "searchQuery", this._onSearchSettingsChanged.bind(this));
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

        this._refreshItem = new PopupMenu.PopupMenuItem("Jetzt aktualisieren");
        this._refreshItem.connect("activate", () => this._runRefresh());
        this.menu.addMenuItem(this._refreshItem);

        this._resultsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._resultsSection);

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

    _runSearch(searchQuery = null) {
        this._setStatus("suche im Katalog ...");
        const query = searchQuery === null ? this._getActiveSearchQuery() : searchQuery;
        const maxHits = Math.max(1, Math.min(Number(this.maxHits) || 20, 100));
        this._runHelper([
            "search",
            `--query=${query}`,
            `--max=${maxHits}`
        ], (status, stdout, stderr) => {
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
            } catch (error) {
                this._setStatus(`Antwort ungültig: ${error.message}`);
                this._clearResults();
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
            play.connect("activate", () => this._xdgOpen(item.url));
            entry.menu.addMenuItem(play);

            if (item.website) {
                const web = new PopupMenu.PopupMenuItem("Webseite");
                web.connect("activate", () => this._xdgOpen(item.website));
                entry.menu.addMenuItem(web);
            }

            const download = new PopupMenu.PopupMenuItem("Herunterladen");
            download.connect("activate", () => this._runDownload(item));
            entry.menu.addMenuItem(download);

            this._resultsSection.addMenuItem(entry);
        }
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
            return;
        }
        Util.spawn(["xdg-open", uri]);
    }

    _clearResults() {
        this._resultsSection.removeAll();
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
