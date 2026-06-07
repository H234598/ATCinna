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
    <method name="ApplyFilterProfile">
      <arg type="s" direction="in" name="profile_json"/>
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
        this._queueEditDialogPath = GLib.build_filenamev([appletPath, "scripts", "atcinna-queue-edit-dialog"]);
        this._blacklistDialogPath = GLib.build_filenamev([appletPath, "scripts", "atcinna-blacklist-dialog"]);
        this._filterProfilesDialogPath = GLib.build_filenamev([appletPath, "scripts", "atcinna-filter-profiles-dialog"]);
        this._historySection = null;
        this._favoritesSection = null;
        this._filterSection = null;
        this._filterProfilesMenu = null;
        this._filterProfilesListSection = null;
        this._resultSelectionItems = new Set();
        this._resultItemsCache = [];
        this._resultActionSelectAll = null;
        this._resultActionInvertSelection = null;
        this._resultActionResetSelection = null;
        this._resultActionPlaySelected = null;
        this._resultActionSaveSelected = null;
        this._resultActionPlayFirstSelected = null;
        this._resultActionSaveFirstSelected = null;
        this._queueSection = null;
        this._queueListSection = null;
        this._queueSelectionItems = new Set();
        this._queueItemsCache = [];
        this._queueActionSelectAll = null;
        this._queueActionInvertSelection = null;
        this._queueActionResetSelection = null;
        this._queueActionRunSelected = null;
        this._queueActionPlaySelected = null;
        this._queueActionEditSelected = null;
        this._queueActionCopySelected = null;
        this._queueActionPreferSelected = null;
        this._queueActionPutBackSelected = null;
        this._queueActionCancelSelected = null;
        this._queueActionRemoveSelected = null;
        this._infoSection = null;
        this._filterSummaryItem = null;
        this._clearFiltersItem = null;
        this._bookmarkFilterToggleItem = null;
        this._filterVisibilityItem = null;
        this._infoVisibilityItem = null;
        this._bookmarkFilterSnapshot = null;
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
        this.settings.bind("title-filter", "titleFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("theme-title-filter", "themeTitleFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("somewhere-filter", "somewhereFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("max-days-filter", "maxDaysFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("min-duration-filter", "minDurationFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("max-duration-filter", "maxDurationFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("only-new-filter", "onlyNewFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("only-bookmarks-filter", "onlyBookmarksFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("hide-history-filter", "hideHistoryFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("podcast-filter", "podcastFilter", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("blacklist-mode", "blacklistMode", this._onFilterSettingsChanged.bind(this));
        this.settings.bind("max-hits", "maxHits", this._onMaxHitsChanged.bind(this));
        this.settings.bind("show-filter-section", "showFilterSection", this._onSectionVisibilityChanged.bind(this));
        this.settings.bind("show-info-section", "showInfoSection", this._onSectionVisibilityChanged.bind(this));
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

        this._bookmarkFilterToggleItem = new PopupMenu.PopupMenuItem("Bookmarks anzeigen");
        this._bookmarkFilterToggleItem.connect("activate", () => {
            this._toggleBookmarksFilter();
        });
        this._filterSection.addMenuItem(this._bookmarkFilterToggleItem);

        this._filterProfilesMenu = new PopupMenu.PopupSubMenuMenuItem("Filterprofile");
        this._saveFilterProfileItem = new PopupMenu.PopupMenuItem("Aktuelle Filter als Profil speichern");
        this._saveFilterProfileItem.connect("activate", () => {
            this._saveCurrentFilterProfile();
        });
        this._filterProfilesMenu.menu.addMenuItem(this._saveFilterProfileItem);
        this._refreshFilterProfilesItem = new PopupMenu.PopupMenuItem("Profile neu laden");
        this._refreshFilterProfilesItem.connect("activate", () => {
            this._refreshFilterProfilesMenu();
        });
        this._filterProfilesMenu.menu.addMenuItem(this._refreshFilterProfilesItem);
        this._manageFilterProfilesItem = new PopupMenu.PopupMenuItem("Filterprofile verwalten");
        this._manageFilterProfilesItem.connect("activate", () => {
            this._launchFilterProfilesDialog();
        });
        this._filterProfilesMenu.menu.addMenuItem(this._manageFilterProfilesItem);
        this._filterProfilesListSection = new PopupMenu.PopupMenuSection();
        this._filterProfilesMenu.menu.addMenuItem(this._filterProfilesListSection);
        this._filterSection.addMenuItem(this._filterProfilesMenu);
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

        this._filterVisibilityItem = new PopupMenu.PopupMenuItem("Filter ein-/ausblenden");
        this._filterVisibilityItem.connect("activate", () => {
            this._toggleFilterSectionVisibility();
        });
        this.menu.addMenuItem(this._filterVisibilityItem);

        this._infoVisibilityItem = new PopupMenu.PopupMenuItem("Infos ein-/ausblenden");
        this._infoVisibilityItem.connect("activate", () => {
            this._toggleInfoSectionVisibility();
        });
        this.menu.addMenuItem(this._infoVisibilityItem);

        this._helpMenu = new PopupMenu.PopupSubMenuMenuItem("Hilfe");

        this._helpDialogItem = new PopupMenu.PopupMenuItem("Hilfedialog");
        this._helpDialogItem.connect("activate", () => {
            this._showHelpDialog();
        });
        this._helpMenu.menu.addMenuItem(this._helpDialogItem);

        this._helpWebItem = new PopupMenu.PopupMenuItem("Anleitung im Web");
        this._helpWebItem.connect("activate", () => {
            this._openWebHelp();
        });
        this._helpMenu.menu.addMenuItem(this._helpWebItem);

        this._helpBlacklistItem = new PopupMenu.PopupMenuItem("Blacklist verwalten");
        this._helpBlacklistItem.connect("activate", () => {
            this._launchBlacklistDialog();
        });
        this._helpMenu.menu.addMenuItem(this._helpBlacklistItem);

        this._helpResetItem = new PopupMenu.PopupMenuItem("Alle Programmeinstellungen zurücksetzen");
        this._helpResetItem.connect("activate", () => {
            this._resetAppletSettings();
        });
        this._helpMenu.menu.addMenuItem(this._helpResetItem);

        this._helpUpdateItem = new PopupMenu.PopupMenuItem("Gibt's ein Update?");
        this._helpUpdateItem.connect("activate", () => {
            this._showUpdateInfo();
        });
        this._helpMenu.menu.addMenuItem(this._helpUpdateItem);

        this._helpAboutItem = new PopupMenu.PopupMenuItem("Über dieses Programm");
        this._helpAboutItem.connect("activate", () => {
            this._showAboutProgram();
        });
        this._helpMenu.menu.addMenuItem(this._helpAboutItem);

        this.menu.addMenuItem(this._helpMenu);

        this._refreshItem = new PopupMenu.PopupMenuItem("Jetzt aktualisieren");
        this._refreshItem.connect("activate", () => this._runRefresh());
        this.menu.addMenuItem(this._refreshItem);

        this._resultsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._resultsSection);

        this._historySection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._historySection);

        this._infoSection = new PopupMenu.PopupMenuSection();
        this._renderInfoSection();
        this.menu.addMenuItem(this._infoSection);

        this._favoritesSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._favoritesSection);

        this._queueSection = new PopupMenu.PopupMenuSection();
        this._queueListSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._queueSection);
        this.menu.addMenuItem(this._queueListSection);

        this._applySectionVisibility();
        this._setupQueueActions();

        this._refreshFilterSummary();
        this._refreshFilterProfilesMenu();

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

    ApplyFilterProfile(profileJson) {
        try {
            const profile = JSON.parse(profileJson || "{}");
            this._applyFilterProfile(profile);
            return JSON.stringify({ status: "ok" });
        } catch (error) {
            return JSON.stringify({ status: "error", message: `${error.message || error}` });
        }
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
            senderFilter: this._toTrimmed(this.senderFilter),
            genreFilter: this._toTrimmed(this.genreFilter),
            topicFilter: this._toTrimmed(this.topicFilter),
            titleFilter: this._toTrimmed(this.titleFilter),
            themeTitleFilter: this._toTrimmed(this.themeTitleFilter),
            somewhereFilter: this._toTrimmed(this.somewhereFilter),
            maxDaysFilter: this._boundedInt(this.maxDaysFilter, 0, 0, 50),
            minDurationFilter: this._boundedInt(this.minDurationFilter, 0, 0, 150),
            maxDurationFilter: this._boundedInt(this.maxDurationFilter, 150, 0, 150),
            onlyNewFilter: Boolean(this.onlyNewFilter),
            onlyBookmarksFilter: Boolean(this.onlyBookmarksFilter),
            hideHistoryFilter: Boolean(this.hideHistoryFilter),
            podcastFilter: this._getPodcastMode(),
            blacklistMode: this._getBlacklistMode(),
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

    _shortText(value, maxLength = 140) {
        const text = this._toTrimmed(value);
        if (text.length <= maxLength) {
            return text;
        }
        return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
    }

    _boundedInt(value, fallback, minValue, maxValue) {
        const parsed = Number(value);
        const normalized = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
        return Math.max(minValue, Math.min(normalized, maxValue));
    }

    _getActiveFilters() {
        return {
            sender: this._toTrimmed(this.senderFilter),
            genre: this._toTrimmed(this.genreFilter),
            topic: this._toTrimmed(this.topicFilter),
            title: this._toTrimmed(this.titleFilter),
            themeTitle: this._toTrimmed(this.themeTitleFilter),
            somewhere: this._toTrimmed(this.somewhereFilter),
            maxDays: this._boundedInt(this.maxDaysFilter, 0, 0, 50),
            minDuration: this._boundedInt(this.minDurationFilter, 0, 0, 150),
            maxDuration: this._boundedInt(this.maxDurationFilter, 150, 0, 150),
            onlyNew: Boolean(this.onlyNewFilter),
            onlyBookmarks: Boolean(this.onlyBookmarksFilter),
            hideHistory: Boolean(this.hideHistoryFilter),
            podcastMode: this._getPodcastMode()
        };
    }

    _isBookmarkFilterOnly(filters = this._getActiveFilters()) {
        return filters.onlyBookmarks &&
            !filters.sender &&
            !filters.genre &&
            !filters.topic &&
            !filters.title &&
            !filters.themeTitle &&
            !filters.somewhere &&
            filters.maxDays === 0 &&
            filters.minDuration === 0 &&
            filters.maxDuration === 150 &&
            !filters.onlyNew &&
            !filters.hideHistory &&
            filters.podcastMode === "all" &&
            this._getActiveSearchQuery() === "";
    }

    _getPodcastMode(value = this.podcastFilter) {
        const mode = this._toTrimmed(value).toLowerCase();
        return mode === "only" || mode === "none" ? mode : "all";
    }

    _getBlacklistMode() {
        const mode = this._toTrimmed(this.blacklistMode).toLowerCase();
        if (mode === "hide" || mode === "only") {
            return mode;
        }
        return "off";
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
        if (filters.title.length > 0) {
            active.push(`Titel:${this._shortFilterValue(filters.title)}`);
        }
        if (filters.themeTitle.length > 0) {
            active.push(`Thema/Titel:${this._shortFilterValue(filters.themeTitle)}`);
        }
        if (filters.somewhere.length > 0) {
            active.push(`Irgendwo:${this._shortFilterValue(filters.somewhere)}`);
        }
        if (filters.maxDays > 0) {
            active.push(`Tage:${filters.maxDays}`);
        }
        if (filters.minDuration > 0) {
            active.push(`Min:${filters.minDuration}`);
        }
        if (filters.maxDuration < 150) {
            active.push(`Max:${filters.maxDuration}`);
        }
        if (filters.onlyNew) {
            active.push("nur neue");
        }
        if (filters.onlyBookmarks) {
            active.push("nur Favoriten");
        }
        if (filters.hideHistory) {
            active.push("ohne Verlauf");
        }
        if (filters.podcastMode === "only") {
            active.push("Podcast:nur");
        } else if (filters.podcastMode === "none") {
            active.push("Podcast:keine");
        }
        const blacklistMode = this._getBlacklistMode();
        const modeText = blacklistMode === "hide" ? "BL: ausblenden" : blacklistMode === "only" ? "BL: Whitelist" : "BL: aus";
        this._filterSummaryItem.label.text = active.length
            ? `Filter: ${active.join(" · ")} · ${modeText}`
            : `Filter: keine · ${modeText}`;
        if (this._clearFiltersItem) {
            this._clearFiltersItem.setSensitive(active.length > 0);
        }
        if (this._bookmarkFilterToggleItem) {
            this._bookmarkFilterToggleItem.label.text = this._isBookmarkFilterOnly(filters)
                ? "Bookmark-Filter ausschalten"
                : "Bookmarks anzeigen";
        }
    }

    _filterSnapshot() {
        const filters = this._getActiveFilters();
        return {
            searchQuery: this._getActiveSearchQuery(),
            sender: filters.sender,
            genre: filters.genre,
            topic: filters.topic,
            title: filters.title,
            themeTitle: filters.themeTitle,
            somewhere: filters.somewhere,
            maxDays: filters.maxDays,
            minDuration: filters.minDuration,
            maxDuration: filters.maxDuration,
            onlyNew: filters.onlyNew,
            onlyBookmarks: filters.onlyBookmarks,
            hideHistory: filters.hideHistory,
            podcastMode: filters.podcastMode
        };
    }

    _applyFilterSnapshot(snapshot, statusText) {
        this._isSyncingSearchQueryFromSettings = true;
        this._isSyncingFilterSettingsFromSettings = true;
        try {
            this.searchQuery = snapshot.searchQuery;
            this._activeSearchQuery = snapshot.searchQuery;
            this.senderFilter = snapshot.sender;
            this.genreFilter = snapshot.genre;
            this.topicFilter = snapshot.topic;
            this.titleFilter = snapshot.title;
            this.themeTitleFilter = snapshot.themeTitle;
            this.somewhereFilter = snapshot.somewhere;
            this.maxDaysFilter = snapshot.maxDays;
            this.minDurationFilter = snapshot.minDuration;
            this.maxDurationFilter = snapshot.maxDuration;
            this.onlyNewFilter = snapshot.onlyNew;
            this.onlyBookmarksFilter = snapshot.onlyBookmarks;
            this.hideHistoryFilter = snapshot.hideHistory;
            this.podcastFilter = snapshot.podcastMode;
            this.settings.setValue("search-query", snapshot.searchQuery);
            this.settings.setValue("sender-filter", snapshot.sender);
            this.settings.setValue("genre-filter", snapshot.genre);
            this.settings.setValue("topic-filter", snapshot.topic);
            this.settings.setValue("title-filter", snapshot.title);
            this.settings.setValue("theme-title-filter", snapshot.themeTitle);
            this.settings.setValue("somewhere-filter", snapshot.somewhere);
            this.settings.setValue("max-days-filter", snapshot.maxDays);
            this.settings.setValue("min-duration-filter", snapshot.minDuration);
            this.settings.setValue("max-duration-filter", snapshot.maxDuration);
            this.settings.setValue("only-new-filter", snapshot.onlyNew);
            this.settings.setValue("only-bookmarks-filter", snapshot.onlyBookmarks);
            this.settings.setValue("hide-history-filter", snapshot.hideHistory);
            this.settings.setValue("podcast-filter", snapshot.podcastMode);
            if (this._searchEntry && this._searchEntry.get_text() !== snapshot.searchQuery) {
                this._searchEntry.set_text(snapshot.searchQuery);
            }
        } finally {
            this._isSyncingSearchQueryFromSettings = false;
            this._isSyncingFilterSettingsFromSettings = false;
        }

        this._refreshFilterSummary();
        this._setStatus(statusText);
        this._runSearch(snapshot.searchQuery);
    }

    _toggleBookmarksFilter() {
        const filters = this._getActiveFilters();
        if (this._isBookmarkFilterOnly(filters)) {
            const restore = this._bookmarkFilterSnapshot || this._filterSnapshot();
            restore.onlyBookmarks = this._bookmarkFilterSnapshot ? restore.onlyBookmarks : false;
            this._bookmarkFilterSnapshot = null;
            this._applyFilterSnapshot(restore, "Bookmark-Filter ausgeschaltet");
            return;
        }

        this._bookmarkFilterSnapshot = this._filterSnapshot();
        this._applyFilterSnapshot({
            searchQuery: "",
            sender: "",
            genre: "",
            topic: "",
            title: "",
            themeTitle: "",
            somewhere: "",
            maxDays: 0,
            minDuration: 0,
            maxDuration: 150,
            onlyNew: false,
            onlyBookmarks: true,
            hideHistory: false,
            podcastMode: "all"
        }, "Bookmarks anzeigen");
    }

    _profileBlacklistMode(value) {
        const mode = this._toTrimmed(value).toLowerCase();
        return mode === "off" || mode === "hide" || mode === "only" ? mode : "hide";
    }

    _profileMaxHits(value) {
        return Math.max(1, Math.min(Number(value) || 20, 100));
    }

    _profileBool(value) {
        if (typeof value === "boolean") {
            return value;
        }
        if (typeof value === "number") {
            return value !== 0;
        }
        const text = this._toTrimmed(value).toLowerCase();
        return text === "1" || text === "true" || text === "yes" || text === "on";
    }

    _currentFilterProfileArgs(name = "") {
        const filters = this._getActiveFilters();
        const args = [
            "filter-profile-save",
            `--search-query=${this._getActiveSearchQuery()}`,
            `--sender=${filters.sender}`,
            `--genre=${filters.genre}`,
            `--topic=${filters.topic}`,
            `--title=${filters.title}`,
            `--theme-title=${filters.themeTitle}`,
            `--somewhere=${filters.somewhere}`,
            `--blacklist-mode=${this._getBlacklistMode()}`,
            `--max-hits=${this._profileMaxHits(this.maxHits)}`,
            `--max-days=${filters.maxDays}`,
            `--min-duration=${filters.minDuration}`,
            `--max-duration=${filters.maxDuration}`,
            `--podcast-mode=${filters.podcastMode}`
        ];
        if (filters.onlyNew) {
            args.push("--only-new");
        }
        if (filters.onlyBookmarks) {
            args.push("--only-bookmarks");
        }
        if (filters.hideHistory) {
            args.push("--hide-history");
        }
        if (name) {
            args.push(`--name=${name}`);
        }
        return args;
    }

    _applyFilterProfile(profile) {
        if (!profile || typeof profile !== "object") {
            throw new Error("ungültiges Filterprofil");
        }
        const name = this._toTrimmed(profile.name) || "Filterprofil";
        const nextSearchQuery = this._toTrimmed(profile.search_query);
        const nextSender = this._toTrimmed(profile.sender);
        const nextGenre = this._toTrimmed(profile.genre);
        const nextTopic = this._toTrimmed(profile.topic);
        const nextTitle = this._toTrimmed(profile.title);
        const nextThemeTitle = this._toTrimmed(profile.theme_title);
        const nextSomewhere = this._toTrimmed(profile.somewhere);
        const nextBlacklistMode = this._profileBlacklistMode(profile.blacklist_mode);
        const nextMaxHits = this._profileMaxHits(profile.max_hits);
        const nextMaxDays = this._boundedInt(profile.max_days, 0, 0, 50);
        const nextMinDuration = this._boundedInt(profile.min_duration, 0, 0, 150);
        const nextMaxDuration = this._boundedInt(profile.max_duration, 150, 0, 150);
        const nextOnlyNew = this._profileBool(profile.only_new);
        const nextOnlyBookmarks = this._profileBool(profile.only_bookmarks);
        const nextHideHistory = this._profileBool(profile.hide_history);
        const nextPodcastMode = this._getPodcastMode(profile.podcast_mode);
        this._bookmarkFilterSnapshot = null;

        this._isSyncingSearchQueryFromSettings = true;
        this._isSyncingFilterSettingsFromSettings = true;
        try {
            this.searchQuery = nextSearchQuery;
            this._activeSearchQuery = nextSearchQuery;
            this.senderFilter = nextSender;
            this.genreFilter = nextGenre;
            this.topicFilter = nextTopic;
            this.titleFilter = nextTitle;
            this.themeTitleFilter = nextThemeTitle;
            this.somewhereFilter = nextSomewhere;
            this.blacklistMode = nextBlacklistMode;
            this.maxHits = nextMaxHits;
            this.maxDaysFilter = nextMaxDays;
            this.minDurationFilter = nextMinDuration;
            this.maxDurationFilter = nextMaxDuration;
            this.onlyNewFilter = nextOnlyNew;
            this.onlyBookmarksFilter = nextOnlyBookmarks;
            this.hideHistoryFilter = nextHideHistory;
            this.podcastFilter = nextPodcastMode;
            this.settings.setValue("search-query", nextSearchQuery);
            this.settings.setValue("sender-filter", nextSender);
            this.settings.setValue("genre-filter", nextGenre);
            this.settings.setValue("topic-filter", nextTopic);
            this.settings.setValue("title-filter", nextTitle);
            this.settings.setValue("theme-title-filter", nextThemeTitle);
            this.settings.setValue("somewhere-filter", nextSomewhere);
            this.settings.setValue("blacklist-mode", nextBlacklistMode);
            this.settings.setValue("max-hits", nextMaxHits);
            this.settings.setValue("max-days-filter", nextMaxDays);
            this.settings.setValue("min-duration-filter", nextMinDuration);
            this.settings.setValue("max-duration-filter", nextMaxDuration);
            this.settings.setValue("only-new-filter", nextOnlyNew);
            this.settings.setValue("only-bookmarks-filter", nextOnlyBookmarks);
            this.settings.setValue("hide-history-filter", nextHideHistory);
            this.settings.setValue("podcast-filter", nextPodcastMode);
            if (this._searchEntry && this._searchEntry.get_text() !== nextSearchQuery) {
                this._searchEntry.set_text(nextSearchQuery);
            }
        } finally {
            this._isSyncingSearchQueryFromSettings = false;
            this._isSyncingFilterSettingsFromSettings = false;
        }

        this._refreshFilterSummary();
        this._setStatus(`Filterprofil geladen: ${name}`);
        this._runSearch();
    }

    _saveCurrentFilterProfile(name = "") {
        this._setStatus("Filterprofil wird gespeichert ...");
        this._runHelper(this._currentFilterProfileArgs(name), (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`Filterprofil konnte nicht gespeichert werden: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            let payload = {};
            try {
                payload = JSON.parse(stdout || "{}");
            } catch (error) {
                this._setStatus(`Filterprofil ungültige Antwort: ${error.message}`);
                return;
            }
            if (payload.status !== "ok" || !payload.profile) {
                this._setStatus("Filterprofil: unerwartete Antwort");
                return;
            }
            this._setStatus(`Filterprofil gespeichert: ${payload.profile.name || "Filter"}`);
            this._refreshFilterProfilesMenu();
        });
    }

    _refreshFilterProfilesMenu() {
        if (!this._filterProfilesListSection) {
            return;
        }
        this._runHelper(["filter-profile-list"], (status, stdout, stderr) => {
            this._filterProfilesListSection.removeAll();
            if (status !== CMD_SUCCESS) {
                const item = new PopupMenu.PopupMenuItem("Profile nicht verfügbar");
                item.actor.reactive = false;
                this._filterProfilesListSection.addMenuItem(item);
                this._setStatus(`Filterprofile konnten nicht geladen werden: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            let payload = {};
            try {
                payload = JSON.parse(stdout || "{}");
            } catch (error) {
                const item = new PopupMenu.PopupMenuItem("Profile ungültig");
                item.actor.reactive = false;
                this._filterProfilesListSection.addMenuItem(item);
                this._setStatus(`Filterprofile ungültige Antwort: ${error.message}`);
                return;
            }
            const profiles = Array.isArray(payload.results) ? payload.results : [];
            if (profiles.length === 0) {
                const empty = new PopupMenu.PopupMenuItem("Keine Profile");
                empty.actor.reactive = false;
                this._filterProfilesListSection.addMenuItem(empty);
                return;
            }
            for (const profile of profiles.slice(0, 20)) {
                const label = this._toTrimmed(profile.name) || "Filterprofil";
                const item = new PopupMenu.PopupMenuItem(label);
                item.connect("activate", () => {
                    try {
                        this._applyFilterProfile(profile);
                    } catch (error) {
                        this._setStatus(`Filterprofil konnte nicht geladen werden: ${error.message || error}`);
                    }
                });
                this._filterProfilesListSection.addMenuItem(item);
            }
        });
    }

    _clearFilters() {
        const filters = this._getActiveFilters();
        const hasAdvancedFilters = filters.title || filters.themeTitle || filters.somewhere ||
            filters.maxDays > 0 || filters.minDuration > 0 || filters.maxDuration < 150 ||
            filters.onlyNew || filters.onlyBookmarks || filters.hideHistory || filters.podcastMode !== "all";
        if (!filters.sender && !filters.genre && !filters.topic && !hasAdvancedFilters) {
            this._refreshFilterSummary();
            this._runSearch();
            return;
        }

        this._isSyncingFilterSettingsFromSettings = true;
        this._bookmarkFilterSnapshot = null;
        try {
            this.senderFilter = "";
            this.genreFilter = "";
            this.topicFilter = "";
            this.titleFilter = "";
            this.themeTitleFilter = "";
            this.somewhereFilter = "";
            this.maxDaysFilter = 0;
            this.minDurationFilter = 0;
            this.maxDurationFilter = 150;
            this.onlyNewFilter = false;
            this.onlyBookmarksFilter = false;
            this.hideHistoryFilter = false;
            this.podcastFilter = "all";
            this.settings.setValue("sender-filter", "");
            this.settings.setValue("genre-filter", "");
            this.settings.setValue("topic-filter", "");
            this.settings.setValue("title-filter", "");
            this.settings.setValue("theme-title-filter", "");
            this.settings.setValue("somewhere-filter", "");
            this.settings.setValue("max-days-filter", 0);
            this.settings.setValue("min-duration-filter", 0);
            this.settings.setValue("max-duration-filter", 150);
            this.settings.setValue("only-new-filter", false);
            this.settings.setValue("only-bookmarks-filter", false);
            this.settings.setValue("hide-history-filter", false);
            this.settings.setValue("podcast-filter", "all");
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
        this._bookmarkFilterSnapshot = null;
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
        const blacklistMode = this._getBlacklistMode();
        args.push(`--blacklist-mode=${blacklistMode}`);

        if (filters.sender.length > 0) {
            args.push(`--sender=${filters.sender}`);
        }
        if (filters.genre.length > 0) {
            args.push(`--genre=${filters.genre}`);
        }
        if (filters.topic.length > 0) {
            args.push(`--topic=${filters.topic}`);
        }
        if (filters.title.length > 0) {
            args.push(`--title=${filters.title}`);
        }
        if (filters.themeTitle.length > 0) {
            args.push(`--theme-title=${filters.themeTitle}`);
        }
        if (filters.somewhere.length > 0) {
            args.push(`--somewhere=${filters.somewhere}`);
        }
        if (filters.maxDays > 0) {
            args.push(`--max-days=${filters.maxDays}`);
        }
        if (filters.minDuration > 0) {
            args.push(`--min-duration=${filters.minDuration}`);
        }
        if (filters.maxDuration < 150) {
            args.push(`--max-duration=${filters.maxDuration}`);
        }
        if (filters.onlyNew) {
            args.push("--only-new");
        }
        if (filters.onlyBookmarks) {
            args.push("--only-bookmarks");
        }
        if (filters.hideHistory) {
            args.push("--hide-history");
        }
        if (filters.podcastMode !== "all") {
            args.push(`--podcast-mode=${filters.podcastMode}`);
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

    _toggleFilterSectionVisibility() {
        const nextValue = !this._boolSetting(this.showFilterSection, true);
        this.showFilterSection = nextValue;
        if (this.settings) {
            this.settings.setValue("show-filter-section", nextValue);
        }
        this._applySectionVisibility();
        this._setStatus(nextValue ? "Filter eingeblendet" : "Filter ausgeblendet");
    }

    _toggleInfoSectionVisibility() {
        const nextValue = !this._boolSetting(this.showInfoSection, true);
        this.showInfoSection = nextValue;
        if (this.settings) {
            this.settings.setValue("show-info-section", nextValue);
        }
        this._applySectionVisibility();
        this._setStatus(nextValue ? "Infos eingeblendet" : "Infos ausgeblendet");
    }

    _onSectionVisibilityChanged() {
        this._applySectionVisibility();
    }

    _applySectionVisibility() {
        this._setSectionVisible(this._filterSection, this._boolSetting(this.showFilterSection, true));
        this._setSectionVisible(this._infoSection, this._boolSetting(this.showInfoSection, true));
    }

    _setSectionVisible(section, visible) {
        if (!section || !section.actor) {
            return;
        }
        if (visible) {
            section.actor.show();
        } else {
            section.actor.hide();
        }
    }

    _boolSetting(value, fallback) {
        if (typeof value === "boolean") {
            return value;
        }
        return fallback;
    }

    _showHelpDialog() {
        this._setStatus("Hilfedialog geöffnet");
        const version = this.metadata && this.metadata.version ? this.metadata.version : "unbekannt";
        this._renderInfoSection([
            ["Bereich", "ATCinna-Applet Hilfeseiten"],
            ["Version", version],
            ["Suche", "Oben im Popup ein Schlüsselwort eintragen und Enter drücken."],
            ["Filter", "Unter Filter können bestehende Treffer-Listen per Sender, Genre, Thema, Titel eingegrenzt werden."],
            ["Blacklist", "Im Kontextmenü pro Eintrag sind Blacklist-Aktionen verfügbar."],
            ["Downloads", "Einträge können in die Download-Warteschlange gelegt oder direkt heruntergeladen werden."],
            ["Tastatur", "Popup kann mit Maus geöffnet und per Enter im Suchfeld ausgelöst werden."]
        ]);
    }

    _openWebHelp() {
        this._setStatus("Web-Anleitung wird geöffnet");
        this._xdgOpen("https://www.p2tools.de/atplayer/manual/");
    }

    _resetAppletSettings() {
        if (!this.settings) {
            this._setStatus("Einstellungen zurücksetzen nicht möglich: Konfiguration nicht verfügbar");
            return;
        }

        const defaults = {
            "search-query": "",
            "sender-filter": "",
            "genre-filter": "",
            "topic-filter": "",
            "title-filter": "",
            "theme-title-filter": "",
            "somewhere-filter": "",
            "blacklist-mode": "hide",
            "max-hits": 20,
            "max-days-filter": 0,
            "min-duration-filter": 0,
            "max-duration-filter": 150,
            "only-new-filter": false,
            "only-bookmarks-filter": false,
            "hide-history-filter": false,
            "podcast-filter": "all",
            "show-filter-section": true,
            "show-info-section": true
        };
        const nextSearchQuery = defaults["search-query"];

        this._isSyncingFilterSettingsFromSettings = true;
        this._isSyncingSearchQueryFromSettings = true;
        try {
            this.searchQuery = nextSearchQuery;
            this.senderFilter = defaults["sender-filter"];
            this.genreFilter = defaults["genre-filter"];
            this.topicFilter = defaults["topic-filter"];
            this.titleFilter = defaults["title-filter"];
            this.themeTitleFilter = defaults["theme-title-filter"];
            this.somewhereFilter = defaults["somewhere-filter"];
            this.blacklistMode = defaults["blacklist-mode"];
            this.maxHits = defaults["max-hits"];
            this.maxDaysFilter = defaults["max-days-filter"];
            this.minDurationFilter = defaults["min-duration-filter"];
            this.maxDurationFilter = defaults["max-duration-filter"];
            this.onlyNewFilter = defaults["only-new-filter"];
            this.onlyBookmarksFilter = defaults["only-bookmarks-filter"];
            this.hideHistoryFilter = defaults["hide-history-filter"];
            this.podcastFilter = defaults["podcast-filter"];
            this.showFilterSection = defaults["show-filter-section"];
            this.showInfoSection = defaults["show-info-section"];

            this.settings.setValue("search-query", defaults["search-query"]);
            this.settings.setValue("sender-filter", defaults["sender-filter"]);
            this.settings.setValue("genre-filter", defaults["genre-filter"]);
            this.settings.setValue("topic-filter", defaults["topic-filter"]);
            this.settings.setValue("title-filter", defaults["title-filter"]);
            this.settings.setValue("theme-title-filter", defaults["theme-title-filter"]);
            this.settings.setValue("somewhere-filter", defaults["somewhere-filter"]);
            this.settings.setValue("blacklist-mode", defaults["blacklist-mode"]);
            this.settings.setValue("max-hits", defaults["max-hits"]);
            this.settings.setValue("max-days-filter", defaults["max-days-filter"]);
            this.settings.setValue("min-duration-filter", defaults["min-duration-filter"]);
            this.settings.setValue("max-duration-filter", defaults["max-duration-filter"]);
            this.settings.setValue("only-new-filter", defaults["only-new-filter"]);
            this.settings.setValue("only-bookmarks-filter", defaults["only-bookmarks-filter"]);
            this.settings.setValue("hide-history-filter", defaults["hide-history-filter"]);
            this.settings.setValue("podcast-filter", defaults["podcast-filter"]);
            this.settings.setValue("show-filter-section", defaults["show-filter-section"]);
            this.settings.setValue("show-info-section", defaults["show-info-section"]);

            if (this._searchEntry && this._searchEntry.get_text() !== nextSearchQuery) {
                this._searchEntry.set_text(nextSearchQuery);
            }
            this._activeSearchQuery = nextSearchQuery;
        } finally {
            this._isSyncingSearchQueryFromSettings = false;
            this._isSyncingFilterSettingsFromSettings = false;
        }

        this._refreshFilterSummary();
        this._applySectionVisibility();
        this._setStatus("Alle Programmeinstellungen auf Standard zurückgesetzt");
        this._renderInfoSection([
            ["Status", "Programmweite Sucheinstellungen wurden auf Standard zurückgesetzt."],
            ["Aktive Suche", this._activeSearchQuery || "leer"],
            ["Sender-Filter", "leer"],
            ["Genre-Filter", "leer"],
            ["Thema-Filter", "leer"],
            ["Titel-Filter", "leer"],
            ["Thema/Titel-Filter", "leer"],
            ["Irgendwo-Filter", "leer"],
            ["Blacklist-Modus", defaults["blacklist-mode"]],
            ["Max-Treffer", `${defaults["max-hits"]}`],
            ["Zeitraum", "alles"],
            ["Dauer", "alles"],
            ["Nur neue", "nein"],
            ["Nur Favoriten", "nein"],
            ["Verlauf ausblenden", "nein"],
            ["Podcast", "alles"]
        ]);
        this._runSearch();
    }

    _showUpdateInfo() {
        const status = this._buildDbusStatus();
        const version = this.metadata && this.metadata.version ? this.metadata.version : "unbekannt";
        const info = status.version ? `installiert: ${status.version}` : "Version nicht ermittelbar";
        this._setStatus(`Update-Check: ${info}`);
        this._renderInfoSection([
            ["Version", version],
            ["Katalog-Pfad", this._helperPath],
            ["Refresh-Mirror", this.refreshMirror || ""],
            ["Letzter Status", info],
            ["Hinweis", "Automatische Onlineprüfung wird aus Sicherheitsgründen nicht gestartet."]
        ]);
    }

    _showAboutProgram() {
        const version = this.metadata && this.metadata.version ? this.metadata.version : "unbekannt";
        this._setStatus("Über dieses Programm");
        const iconPath = this.metadata && this.metadata.icon ? this.metadata.icon : "";
        this._renderInfoSection([
            ["Programm", "ATCinna"],
            ["Version", version],
            ["Architektur", "Java-freies Cinnamon-Applet (GJS + Python-Helper)"],
            ["Ziel", "ATPlayer-kompatiblen Audiokatalog schnell durchsuchen, filtern und laden"],
            ["UUID", UUID],
            ["Icon", iconPath],
            ["Datenzugriff", "Katalogcache lokal, Downloads über sicheren Helper"],
            ["Java", "Keine Java-Abhängigkeit im Applet"]
        ]);
    }

    _launchSearchDialog() {
        if (!GLib.file_test(this._searchDialogPath, GLib.FileTest.EXISTS | GLib.FileTest.IS_EXECUTABLE)) {
            this._setStatus("Suchdialog nicht verfügbar: Script fehlt");
            return;
        }
        const filters = this._getActiveFilters();
        const args = [
            this._searchDialogPath,
            `--download-folder=${this.downloadFolder || ""}`,
            `--blacklist-mode=${this._getBlacklistMode()}`
        ];
        for (const [name, value] of [
            ["sender", filters.sender],
            ["genre", filters.genre],
            ["topic", filters.topic],
            ["title", filters.title],
            ["theme-title", filters.themeTitle],
            ["somewhere", filters.somewhere]
        ]) {
            if (value) {
                args.push(`--${name}=${value}`);
            }
        }
        if (filters.maxDays > 0) {
            args.push(`--max-days=${filters.maxDays}`);
        }
        if (filters.minDuration > 0) {
            args.push(`--min-duration=${filters.minDuration}`);
        }
        if (filters.maxDuration < 150) {
            args.push(`--max-duration=${filters.maxDuration}`);
        }
        if (filters.onlyNew) {
            args.push("--only-new=true");
        }
        if (filters.onlyBookmarks) {
            args.push("--only-bookmarks=true");
        }
        if (filters.hideHistory) {
            args.push("--hide-history=true");
        }
        if (filters.podcastMode !== "all") {
            args.push(`--podcast-mode=${filters.podcastMode}`);
        }
        try {
            Util.spawn(args);
        } catch (error) {
            this._setStatus(`Suchdialog konnte nicht gestartet werden: ${error}`);
        }
    }

    _launchBlacklistDialog() {
        if (!GLib.file_test(this._blacklistDialogPath, GLib.FileTest.EXISTS | GLib.FileTest.IS_EXECUTABLE)) {
            this._setStatus("Blacklist-Dialog nicht verfügbar: Script fehlt");
            return;
        }
        try {
            Util.spawn([
                this._blacklistDialogPath
            ]);
        } catch (error) {
            this._setStatus(`Blacklist-Dialog konnte nicht gestartet werden: ${error}`);
        }
    }

    _launchFilterProfilesDialog() {
        if (!GLib.file_test(this._filterProfilesDialogPath, GLib.FileTest.EXISTS | GLib.FileTest.IS_EXECUTABLE)) {
            this._setStatus("Filterprofil-Dialog nicht verfügbar: Script fehlt");
            return;
        }
        const filters = this._getActiveFilters();
        try {
            Util.spawn([
                this._filterProfilesDialogPath,
                `--search-query=${this._getActiveSearchQuery()}`,
                `--sender=${filters.sender}`,
                `--genre=${filters.genre}`,
                `--topic=${filters.topic}`,
                `--title=${filters.title}`,
                `--theme-title=${filters.themeTitle}`,
                `--somewhere=${filters.somewhere}`,
                `--blacklist-mode=${this._getBlacklistMode()}`,
                `--max-hits=${this._profileMaxHits(this.maxHits)}`,
                `--max-days=${filters.maxDays}`,
                `--min-duration=${filters.minDuration}`,
                `--max-duration=${filters.maxDuration}`,
                `--only-new=${filters.onlyNew ? "true" : "false"}`,
                `--only-bookmarks=${filters.onlyBookmarks ? "true" : "false"}`,
                `--hide-history=${filters.hideHistory ? "true" : "false"}`,
                `--podcast-mode=${filters.podcastMode}`
            ]);
        } catch (error) {
            this._setStatus(`Filterprofil-Dialog konnte nicht gestartet werden: ${error}`);
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

    _renderResults(results, clearRelatedSections = true) {
        if (clearRelatedSections) {
            this._clearResults();
        } else {
            this._resultsSection.removeAll();
        }
        this._resultItemsCache = Array.isArray(results) ? results.slice(0) : [];
        this._pruneResultSelection();
        if (!results.length) {
            const empty = new PopupMenu.PopupMenuItem("keine Treffer");
            empty.actor.reactive = false;
            this._resultsSection.addMenuItem(empty);
            return;
        }

        this._setupResultActions();
        for (const item of results) {
            const title = item.title || "";
            const sender = item.sender || "";
            const genre = item.genre || "";
            const topic = item.topic || "";
            const subtitle = [sender, genre, topic].filter(Boolean).join(" · ");
            const key = this._resultItemKey(item);
            const selectionMark = key && this._resultSelectionItems.has(key) ? "[x]" : "[ ]";
            const entry = new PopupMenu.PopupSubMenuMenuItem(`${selectionMark} ${title}${subtitle ? ` — ${subtitle}` : ""}`);

            const toggleSelection = new PopupMenu.PopupMenuItem("Auswahl umschalten");
            toggleSelection.connect("activate", () => this._runResultToggleSelection(item));
            entry.menu.addMenuItem(toggleSelection);

            const play = new PopupMenu.PopupMenuItem("Abspielen");
            play.connect("activate", () => this._playItem(item));
            entry.menu.addMenuItem(play);

            this._addWebsiteAction(entry.menu, item);
            this._addFilterActions(entry.menu, item);
            this._addInfoAction(entry.menu, item);
            this._addMetadataCopyActions(entry.menu, item);
            this._addHistoryActions(entry.menu, item);
            this._addBlacklistActions(entry.menu, item);

            const download = new PopupMenu.PopupMenuItem("Herunterladen");
            download.connect("activate", () => this._runDownload(item));
            entry.menu.addMenuItem(download);

            const save = new PopupMenu.PopupMenuItem("Speichern");
            save.connect("activate", () => this._runDownloadEnqueue(item));
            entry.menu.addMenuItem(save);

            const enqueue = new PopupMenu.PopupMenuItem("In Warteschlange legen");
            enqueue.connect("activate", () => this._runDownloadEnqueue(item));
            entry.menu.addMenuItem(enqueue);

            const addBookmark = new PopupMenu.PopupMenuItem("Zu Favoriten hinzufügen");
            addBookmark.connect("activate", () => this._runBookmarkAdd(item));
            entry.menu.addMenuItem(addBookmark);

            const removeBookmark = new PopupMenu.PopupMenuItem("Bookmarks löschen");
            removeBookmark.connect("activate", () => this._runBookmarkRemove(item));
            entry.menu.addMenuItem(removeBookmark);

            this._resultsSection.addMenuItem(entry);
        }
        this._updateResultSelectionActionState();
    }

    _setupResultActions() {
        const heading = new PopupMenu.PopupMenuItem("Treffer");
        heading.actor.reactive = false;
        heading.actor.add_style_class_name("atcinna-section-title");
        this._resultsSection.addMenuItem(heading);

        const selectAll = new PopupMenu.PopupMenuItem("Alle Treffer auswählen");
        selectAll.connect("activate", () => this._runResultSelectAll());
        this._resultsSection.addMenuItem(selectAll);

        const invertSelection = new PopupMenu.PopupMenuItem("Treffer-Auswahl umkehren");
        invertSelection.connect("activate", () => this._runResultInvertSelection());
        this._resultsSection.addMenuItem(invertSelection);

        const resetSelection = new PopupMenu.PopupMenuItem("Treffer-Auswahl zurücksetzen");
        resetSelection.connect("activate", () => this._runResultResetSelection());
        this._resultsSection.addMenuItem(resetSelection);

        const playSelected = new PopupMenu.PopupMenuItem("Alle markierten Audios abspielen");
        playSelected.connect("activate", () => this._runResultPlaySelected());
        this._resultsSection.addMenuItem(playSelected);

        const playMovie = new PopupMenu.PopupMenuItem("Film abspielen");
        playMovie.connect("activate", () => this._runResultPlayFirstSelected());
        this._resultsSection.addMenuItem(playMovie);

        const saveSelected = new PopupMenu.PopupMenuItem("Markierte Audios speichern");
        saveSelected.connect("activate", () => this._runResultSaveSelected());
        this._resultsSection.addMenuItem(saveSelected);

        const saveMovie = new PopupMenu.PopupMenuItem("Film speichern");
        saveMovie.connect("activate", () => this._runResultSaveFirstSelected());
        this._resultsSection.addMenuItem(saveMovie);

        const markShownSelected = new PopupMenu.PopupMenuItem("Markierte als gesehen markieren");
        markShownSelected.connect("activate", () => this._runResultMarkShownSelected());
        this._resultsSection.addMenuItem(markShownSelected);

        const markUnshownSelected = new PopupMenu.PopupMenuItem("Markierte als ungesehen markieren");
        markUnshownSelected.connect("activate", () => this._runResultMarkUnshownSelected());
        this._resultsSection.addMenuItem(markUnshownSelected);

        const bookmarkSelected = new PopupMenu.PopupMenuItem("Markierte als Bookmarks anlegen");
        bookmarkSelected.connect("activate", () => this._runResultBookmarkSelected());
        this._resultsSection.addMenuItem(bookmarkSelected);

        const removeBookmarksSelected = new PopupMenu.PopupMenuItem("Markierte Bookmarks löschen");
        removeBookmarksSelected.connect("activate", () => this._runResultRemoveBookmarksSelected());
        this._resultsSection.addMenuItem(removeBookmarksSelected);

        this._resultActionSelectAll = selectAll;
        this._resultActionInvertSelection = invertSelection;
        this._resultActionResetSelection = resetSelection;
        this._resultActionPlaySelected = playSelected;
        this._resultActionSaveSelected = saveSelected;
        this._resultActionPlayFirstSelected = playMovie;
        this._resultActionSaveFirstSelected = saveMovie;
        this._resultActionMarkShownSelected = markShownSelected;
        this._resultActionMarkUnshownSelected = markUnshownSelected;
        this._resultActionBookmarkSelected = bookmarkSelected;
        this._resultActionRemoveBookmarksSelected = removeBookmarksSelected;
    }

    _runResultSelectAll() {
        for (const item of this._resultItemsCache) {
            const key = this._resultItemKey(item);
            if (key) {
                this._resultSelectionItems.add(key);
            }
        }
        this._renderResults(this._resultItemsCache, false);
        this._setStatus(`Treffer ausgewählt: ${this._getSelectedResultItems().length}`);
    }

    _runResultInvertSelection() {
        const nextSelection = new Set();
        for (const item of this._resultItemsCache) {
            const key = this._resultItemKey(item);
            if (key && !this._resultSelectionItems.has(key)) {
                nextSelection.add(key);
            }
        }
        this._resultSelectionItems = nextSelection;
        this._renderResults(this._resultItemsCache, false);
        this._setStatus(`Treffer ausgewählt: ${this._getSelectedResultItems().length}`);
    }

    _runResultResetSelection() {
        this._resultSelectionItems.clear();
        this._renderResults(this._resultItemsCache, false);
        this._setStatus("Treffer-Auswahl zurückgesetzt");
    }

    _runResultToggleSelection(item) {
        const key = this._resultItemKey(item);
        if (!key) {
            this._setStatus("Auswahl umschalten fehlgeschlagen: keine URL");
            return;
        }
        if (this._resultSelectionItems.has(key)) {
            this._resultSelectionItems.delete(key);
        } else {
            this._resultSelectionItems.add(key);
        }
        this._renderResults(this._resultItemsCache, false);
    }

    _runResultPlaySelected() {
        this._runResultBatchAction(
            "Alle markierten Audios abspielen",
            this._getSelectedResultItems(),
            (item, callback) => {
                this._runHistoryAdd(item, (result) => {
                    if (!result) {
                        callback(false, 0);
                        return;
                    }
                    const opened = this._xdgOpen(item.url || "");
                    callback(opened, opened ? 1 : 0);
                });
            },
            false
        );
    }

    _runResultSaveSelected() {
        this._runResultBatchAction(
            "Markierte Audios speichern",
            this._getSelectedResultItems(),
            (item, callback) => this._runDownloadEnqueue(item, callback),
            true
        );
    }

    _runResultPlayFirstSelected() {
        const selectedItems = this._getSelectedResultItems();
        if (!selectedItems.length) {
            this._setStatus("Film abspielen: keine Auswahl");
            return;
        }
        this._playItem(selectedItems[0]);
    }

    _runResultSaveFirstSelected() {
        const selectedItems = this._getSelectedResultItems();
        if (!selectedItems.length) {
            this._setStatus("Film speichern: keine Auswahl");
            return;
        }
        this._runDownloadEnqueue(selectedItems[0]);
    }

    _runResultBookmarkSelected() {
        this._runResultBatchAction(
            "Markierte als Bookmarks anlegen",
            this._getSelectedResultItems(),
            (item, callback) => this._runBookmarkAdd(item, callback),
            false,
            () => this._loadSections()
        );
    }

    _runResultRemoveBookmarksSelected() {
        this._runResultBatchAction(
            "Markierte Bookmarks löschen",
            this._getSelectedResultItems(),
            (item, callback) => this._runBookmarkRemove(item, callback),
            false,
            () => this._loadBookmarks()
        );
    }

    _runResultMarkShownSelected() {
        this._runResultBatchAction(
            "Markierte als gesehen markieren",
            this._getSelectedResultItems(),
            (item, callback) => this._runHistoryAdd(item, callback),
            false,
            () => this._loadHistory()
        );
    }

    _runResultMarkUnshownSelected() {
        this._runResultBatchAction(
            "Markierte als ungesehen markieren",
            this._getSelectedResultItems(),
            (item, callback) => this._runHistoryRemove(item, callback),
            false,
            () => this._loadHistory()
        );
    }

    _runResultBatchAction(label, items, action, refreshQueue, afterDone = null) {
        if (!Array.isArray(items) || !items.length) {
            this._setStatus(`${label}: keine Auswahl`);
            return;
        }

        let changed = 0;
        let failed = 0;
        const runNext = () => {
            if (!items.length) {
                if (refreshQueue) {
                    this._runQueueList();
                }
                if (afterDone) {
                    afterDone();
                }
                if (changed > 0) {
                    this._setStatus(`${label}: ${changed}`);
                } else if (failed > 0) {
                    this._setStatus(`${label}: ${failed} fehlgeschlagen`);
                } else {
                    this._setStatus(`${label}: keine Änderung`);
                }
                return;
            }

            const item = items.shift();
            action(item, (result, value) => {
                if (result) {
                    const numericValue = Number(value);
                    changed += (Number.isFinite(numericValue) ? numericValue : 0);
                } else {
                    failed += 1;
                }
                runNext();
            });
        };

        this._setStatus(`${label}: ${items.length}`);
        runNext();
    }

    _getSelectedResultItems() {
        if (!this._resultItemsCache.length) {
            return [];
        }
        return this._resultItemsCache
            .filter((item) => {
                const key = this._resultItemKey(item);
                return key && this._resultSelectionItems.has(key);
            })
            .slice(0, 20);
    }

    _resultItemKey(item) {
        const url = this._toTrimmed(item && item.url ? item.url : "");
        if (url) {
            return `url:${url}`;
        }
        return "";
    }

    _pruneResultSelection() {
        const visibleKeys = new Set();
        for (const item of this._resultItemsCache) {
            const key = this._resultItemKey(item);
            if (key) {
                visibleKeys.add(key);
            }
        }
        this._resultSelectionItems = new Set([...this._resultSelectionItems].filter((key) => visibleKeys.has(key)));
    }

    _updateResultSelectionActionState() {
        const selectableCount = this._resultItemsCache.filter((item) => this._resultItemKey(item)).length;
        const visibleSelectionCount = this._getSelectedResultItems().length;
        const hasSelection = visibleSelectionCount > 0;
        if (this._resultActionSelectAll) {
            this._resultActionSelectAll.setSensitive(selectableCount > 0);
        }
        if (this._resultActionInvertSelection) {
            this._resultActionInvertSelection.setSensitive(selectableCount > 0);
        }
        if (this._resultActionResetSelection) {
            this._resultActionResetSelection.setSensitive(hasSelection);
        }
        if (this._resultActionPlaySelected) {
            this._resultActionPlaySelected.setSensitive(hasSelection);
        }
        if (this._resultActionSaveSelected) {
            this._resultActionSaveSelected.setSensitive(hasSelection);
        }
        if (this._resultActionPlayFirstSelected) {
            this._resultActionPlayFirstSelected.setSensitive(hasSelection);
        }
        if (this._resultActionSaveFirstSelected) {
            this._resultActionSaveFirstSelected.setSensitive(hasSelection);
        }
        if (this._resultActionMarkShownSelected) {
            this._resultActionMarkShownSelected.setSensitive(hasSelection);
        }
        if (this._resultActionMarkUnshownSelected) {
            this._resultActionMarkUnshownSelected.setSensitive(hasSelection);
        }
        if (this._resultActionBookmarkSelected) {
            this._resultActionBookmarkSelected.setSensitive(hasSelection);
        }
        if (this._resultActionRemoveBookmarksSelected) {
            this._resultActionRemoveBookmarksSelected.setSensitive(hasSelection);
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

        const refresh = new PopupMenu.PopupMenuItem("Downloads aktualisieren");
        refresh.connect("activate", () => this._runQueueList());
        this._queueSection.addMenuItem(refresh);

        const runNext = new PopupMenu.PopupMenuItem("Nächsten Download starten");
        runNext.connect("activate", () => this._runQueueRunNext());
        this._queueSection.addMenuItem(runNext);

        const runSelected = new PopupMenu.PopupMenuItem("Downloads starten");
        runSelected.connect("activate", () => this._runQueueRunSelected());
        this._queueSection.addMenuItem(runSelected);

        const playSelected = new PopupMenu.PopupMenuItem("Audio (URL) abspielen");
        playSelected.connect("activate", () => this._runQueuePlaySelected());
        this._queueSection.addMenuItem(playSelected);

        const editSelected = new PopupMenu.PopupMenuItem("Download ändern");
        editSelected.connect("activate", () => this._runQueueEditSelected());
        this._queueSection.addMenuItem(editSelected);

        const copySelected = new PopupMenu.PopupMenuItem("Download (URL) kopieren");
        copySelected.connect("activate", () => this._runQueueCopySelected());
        this._queueSection.addMenuItem(copySelected);

        const runAll = new PopupMenu.PopupMenuItem("Alle Downloads starten");
        runAll.connect("activate", () => this._runQueueRunAll());
        this._queueSection.addMenuItem(runAll);

        const stopAll = new PopupMenu.PopupMenuItem("Alle Downloads stoppen");
        stopAll.connect("activate", () => this._runQueueCancelAll());
        this._queueSection.addMenuItem(stopAll);

        const stopQueued = new PopupMenu.PopupMenuItem("Alle wartenden Downloads stoppen");
        stopQueued.connect("activate", () => this._runQueueCancelQueued());
        this._queueSection.addMenuItem(stopQueued);

        const selectAll = new PopupMenu.PopupMenuItem("Alles auswählen");
        selectAll.connect("activate", () => this._runQueueSelectAll());
        this._queueSection.addMenuItem(selectAll);

        const invertSelection = new PopupMenu.PopupMenuItem("Auswahl umkehren");
        invertSelection.connect("activate", () => this._runQueueInvertSelection());
        this._queueSection.addMenuItem(invertSelection);

        const resetSelection = new PopupMenu.PopupMenuItem("Tabelle zurücksetzen");
        resetSelection.connect("activate", () => this._runQueueResetSelection());
        this._queueSection.addMenuItem(resetSelection);

        const preferSelected = new PopupMenu.PopupMenuItem("Downloads vorziehen");
        preferSelected.connect("activate", () => this._runQueuePreferSelected());
        this._queueSection.addMenuItem(preferSelected);

        const putBackSelected = new PopupMenu.PopupMenuItem("Downloads zurückstellen");
        putBackSelected.connect("activate", () => this._runQueuePutBackSelected());
        this._queueSection.addMenuItem(putBackSelected);

        const cancelSelected = new PopupMenu.PopupMenuItem("Downloads stoppen");
        cancelSelected.connect("activate", () => this._runQueueCancelSelected());
        this._queueSection.addMenuItem(cancelSelected);

        const removeSelected = new PopupMenu.PopupMenuItem("Downloads aus Liste entfernen");
        removeSelected.connect("activate", () => this._runQueueRemoveSelected());
        this._queueSection.addMenuItem(removeSelected);

        const clearDone = new PopupMenu.PopupMenuItem("Erledigte entfernen");
        clearDone.connect("activate", () => this._runQueueClear());
        this._queueSection.addMenuItem(clearDone);

        const tidyDownloads = new PopupMenu.PopupMenuItem("Liste der Downloads aufräumen");
        tidyDownloads.connect("activate", () => this._runQueueClear());
        this._queueSection.addMenuItem(tidyDownloads);

        const restore = new PopupMenu.PopupMenuItem("Gelöschte wieder anlegen");
        restore.connect("activate", () => this._runQueueUndo());
        this._queueSection.addMenuItem(restore);

        this._queueActionSelectAll = selectAll;
        this._queueActionInvertSelection = invertSelection;
        this._queueActionResetSelection = resetSelection;
        this._queueActionRunSelected = runSelected;
        this._queueActionPlaySelected = playSelected;
        this._queueActionEditSelected = editSelected;
        this._queueActionCopySelected = copySelected;
        this._queueActionPreferSelected = preferSelected;
        this._queueActionPutBackSelected = putBackSelected;
        this._queueActionCancelSelected = cancelSelected;
        this._queueActionRemoveSelected = removeSelected;
        this._updateQueueSelectionActionState();
    }

    _runDownloadEnqueue(item, callback = null) {
        const folder = this.downloadFolder || "";
        this._setStatus(`in Warteschlange: ${item.title || "Eintrag"}`);
        this._runHelper([
            "download-enqueue",
            ...this._entryArgs(item),
            `--folder=${folder}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`queue-enqueue fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                if (callback) {
                    callback(false, 0);
                }
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("queue-enqueue: unerwartete Antwort");
                    if (callback) {
                        callback(false, 0);
                    }
                    return;
                }
                if (callback) {
                    callback(true, 1);
                } else {
                    this._setStatus("in Warteschlange gespeichert");
                    this._runQueueList();
                }
            } catch (error) {
                this._setStatus(`queue-enqueue ungültige Antwort: ${error.message}`);
                if (callback) {
                    callback(false, 0);
                }
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

    _runQueueRunItem(item) {
        const callback = arguments.length > 1 ? arguments[1] : null;
        const url = this._normalizeQueueItemUrl(item);
        if (!url) {
            this._setStatus("Download starten fehlgeschlagen: keine URL");
            if (callback) {
                callback(false, 0);
            }
            return;
        }

        const title = item && item.title ? item.title : "Eintrag";
        this._setStatus(`starte Download: ${title}`);
        this._runHelper([
            "download-run",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-run fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                if (callback) {
                    callback(false, 0);
                }
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-run: unerwartete Antwort");
                    if (callback) {
                        callback(false, 0);
                    }
                    return;
                }
                if (payload.state === "not-found") {
                    this._setStatus("Download nicht in der Warteschlange");
                    if (callback) {
                        callback(true, 0);
                    } else {
                        this._runQueueList();
                    }
                    return;
                }
                if (payload.state === "not-queued") {
                    this._setStatus("Download ist nicht wartend");
                    if (callback) {
                        callback(true, 0);
                    } else {
                        this._runQueueList();
                    }
                    return;
                }
                if (payload.result && payload.result.path) {
                    this._setStatus(`gespeichert: ${payload.result.path}`);
                } else if (payload.result && payload.result.status === "error") {
                    this._setStatus(`download fehlgeschlagen: ${payload.result.error || "unbekannter Fehler"}`);
                } else {
                    this._setStatus("download abgeschlossen");
                }
                if (callback) {
                    callback(true, payload.result ? 1 : 0);
                } else {
                    this._runQueueList();
                }
            } catch (error) {
                this._setStatus(`download-run ungültige Antwort: ${error.message}`);
                if (callback) {
                    callback(false, 0);
                }
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
        const url = this._normalizeQueueItemUrl(item);
        const callback = arguments.length > 1 ? arguments[1] : null;
        if (!url) {
            this._setStatus("Download stoppen fehlgeschlagen: keine URL");
            if (callback) {
                callback(false, 0);
            }
            return;
        }
        this._setStatus(`storniere Download: ${item.title || "Eintrag"}`);
        this._runHelper([
            "download-cancel",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-cancel fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                if (callback) {
                    callback(false, 0);
                }
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-cancel: unerwartete Antwort");
                    if (callback) {
                        callback(false, 0);
                    }
                    return;
                }
                if (callback) {
                    callback(true, payload.changed || 0);
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
                if (!callback) {
                    this._runQueueList();
                }
            } catch (error) {
                this._setStatus(`download-cancel ungültige Antwort: ${error.message}`);
                if (callback) {
                    callback(false, 0);
                }
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
        const visibleEntries = entries.slice(0, 20);
        this._queueItemsCache = visibleEntries;

        if (!entries.length) {
            const empty = new PopupMenu.PopupMenuItem("keine Einträge in Warteschlange");
            empty.actor.reactive = false;
            this._queueListSection.addMenuItem(empty);
            this._updateQueueSelectionActionState();
            return;
        }

        for (const item of visibleEntries) {
            const status = item.status || "queued";
            const title = item.title || "Eintrag";
            const subtitle = item.status === "finished" && item.path ? ` — ${item.path}` : "";
            const queueKey = this._queueItemKey(item);
            const selectionMark = queueKey && this._queueSelectionItems.has(queueKey) ? "[x]" : "[ ]";
            const row = new PopupMenu.PopupSubMenuMenuItem(`${selectionMark} ${title} (${status})${subtitle}`);
            const toggleSelection = new PopupMenu.PopupMenuItem("Auswahl umschalten");
            toggleSelection.connect("activate", () => this._runQueueToggleSelection(item));
            row.menu.addMenuItem(toggleSelection);

            const run = new PopupMenu.PopupMenuItem("Download starten");
            if (status !== "queued") {
                run.setSensitive(false);
            } else {
                run.connect("activate", () => this._runQueueRunItem(item));
            }
            row.menu.addMenuItem(run);

            const edit = new PopupMenu.PopupMenuItem("Download ändern");
            if (status === "running") {
                edit.label.text = "Download läuft (nicht änderbar)";
                edit.setSensitive(false);
            } else {
                edit.connect("activate", () => this._runQueueEditDialog(item));
            }
            row.menu.addMenuItem(edit);

            const cancel = new PopupMenu.PopupMenuItem("Download stoppen");
            cancel.connect("activate", () => this._runQueueCancelItem(item));
            row.menu.addMenuItem(cancel);

            this._addInfoAction(row.menu, item);
            this._addFilterActions(row.menu, item);
            this._addMetadataCopyActions(row.menu, item);
            this._addHistoryActions(row.menu, item);
            this._addBlacklistActions(row.menu, item);

            const play = new PopupMenu.PopupMenuItem("Audio (URL) abspielen");
            play.connect("activate", () => this._playItem(item));
            row.menu.addMenuItem(play);

            const copy = new PopupMenu.PopupMenuItem("Download (URL) kopieren");
            copy.connect("activate", () => this._copyQueueUrl(item));
            row.menu.addMenuItem(copy);

            const openFile = new PopupMenu.PopupMenuItem("Gespeichertes Audio (Datei) abspielen");
            openFile.connect("activate", () => this._openQueueFile(item));
            row.menu.addMenuItem(openFile);

            const trashFile = new PopupMenu.PopupMenuItem("Gespeichertes Audio (Datei) löschen");
            trashFile.connect("activate", () => this._runQueueTrashFile(item));
            row.menu.addMenuItem(trashFile);

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

        this._updateQueueSelectionActionState();
    }

    _runQueueSelectAll() {
        const nextSelection = new Set();
        for (const item of this._queueItemsCache) {
            const key = this._queueItemKey(item);
            if (key) {
                nextSelection.add(key);
            }
        }
        this._queueSelectionItems = nextSelection;
        this._setStatus(`Warteschlange ausgewählt: ${this._queueSelectionItems.size}`);
        this._runQueueList();
    }

    _runQueueInvertSelection() {
        const nextSelection = new Set();
        for (const item of this._queueItemsCache) {
            const key = this._queueItemKey(item);
            if (!key) {
                continue;
            }
            if (!this._queueSelectionItems.has(key)) {
                nextSelection.add(key);
            }
        }
        this._queueSelectionItems = nextSelection;
        this._setStatus(`Auswahl umgekehrt: ${this._queueSelectionItems.size}`);
        this._runQueueList();
    }

    _runQueueResetSelection() {
        this._queueSelectionItems = new Set();
        this._setStatus("Tabelle zurückgesetzt");
        this._runQueueList();
    }

    _runQueueRunSelected() {
        this._runQueueBatchAction(
            "Downloads starten",
            this._getSelectedQueueItems(),
            (item, callback) => this._runQueueRunItem(item, callback)
        );
    }

    _runQueuePlaySelected() {
        const selectedItems = this._getSelectedQueueItems();
        if (!selectedItems.length) {
            this._setStatus("Audio (URL) abspielen: keine Auswahl");
            return;
        }
        this._playItem(selectedItems[0]);
    }

    _runQueueEditSelected() {
        const selectedItems = this._getSelectedQueueItems();
        if (!selectedItems.length) {
            this._setStatus("Download ändern: keine Auswahl");
            return;
        }

        const first = selectedItems[0];
        if ((first.status || "queued") === "running") {
            this._setStatus("Download läuft (nicht änderbar)");
            return;
        }

        this._runQueueEditDialog(first);
    }

    _runQueueCopySelected() {
        const selectedItems = this._getSelectedQueueItems();
        if (!selectedItems.length) {
            this._setStatus("Download (URL) kopieren: keine Auswahl");
            return;
        }
        this._copyQueueUrl(selectedItems[0]);
    }

    _runQueuePreferSelected() {
        this._runQueueBatchAction(
            "Downloads vorziehen",
            this._getSelectedQueueItems(),
            (item, callback) => this._runQueuePrefer(item, callback)
        );
    }

    _runQueuePutBackSelected() {
        this._runQueueBatchAction(
            "Downloads zurückstellen",
            this._getSelectedQueueItems(),
            (item, callback) => this._runQueuePutBack(item, callback)
        );
    }

    _runQueueCancelSelected() {
        this._runQueueBatchAction(
            "Downloads stoppen",
            this._getSelectedQueueItems(),
            (item, callback) => this._runQueueCancelItem(item, callback)
        );
    }

    _runQueueRemoveSelected() {
        this._runQueueBatchAction(
            "Downloads aus Liste entfernen",
            this._getSelectedQueueItems(),
            (item, callback) => this._runQueueRemove(item, callback)
        );
    }

    _runQueueToggleSelection(item) {
        const key = this._queueItemKey(item);
        if (!key) {
            this._setStatus("Auswahl umschalten fehlgeschlagen: keine URL");
            return;
        }
        if (this._queueSelectionItems.has(key)) {
            this._queueSelectionItems.delete(key);
        } else {
            this._queueSelectionItems.add(key);
        }
        this._runQueueList();
    }

    _runQueueBatchAction(label, items, action) {
        if (!Array.isArray(items) || !items.length) {
            this._setStatus(`${label}: keine Auswahl`);
            return;
        }

        let changed = 0;
        let failed = 0;
        const runNext = () => {
            if (!items.length) {
                this._runQueueList();
                if (changed > 0) {
                    this._setStatus(`${label}: ${changed}`);
                } else if (failed > 0) {
                    this._setStatus(`${label}: ${failed} fehlgeschlagen`);
                } else {
                    this._setStatus(`${label}: keine Änderung`);
                }
                return;
            }

            const item = items.shift();
            action(item, (result, value) => {
                if (result) {
                    const numericValue = Number(value);
                    changed += (Number.isFinite(numericValue) ? numericValue : 0);
                } else {
                    failed += 1;
                }
                runNext();
            });
        };

        this._setStatus(`${label}: ${items.length}`);
        runNext();
    }

    _getSelectedQueueItems() {
        if (!this._queueItemsCache.length) {
            return [];
        }
        return this._queueItemsCache
            .filter((item) => {
                const key = this._queueItemKey(item);
                return key && this._queueSelectionItems.has(key);
            })
            .slice(0, 20);
    }

    _queueItemKey(item) {
        const url = this._normalizeQueueItemUrl(item);
        if (url) {
            return `url:${url}`;
        }
        return "";
    }

    _updateQueueSelectionActionState() {
        const selectableCount = this._queueItemsCache.filter((item) => this._queueItemKey(item)).length;
        const visibleSelectionCount = this._queueItemsCache.filter((item) => this._queueSelectionItems.has(this._queueItemKey(item))).length;
        const hasSelection = visibleSelectionCount > 0;
        if (this._queueActionSelectAll) {
            this._queueActionSelectAll.setSensitive(selectableCount > 0);
        }
        if (this._queueActionInvertSelection) {
            this._queueActionInvertSelection.setSensitive(selectableCount > 0);
        }
        if (this._queueActionResetSelection) {
            this._queueActionResetSelection.setSensitive(hasSelection);
        }
        if (this._queueActionRunSelected) {
            this._queueActionRunSelected.setSensitive(hasSelection);
        }
        if (this._queueActionPlaySelected) {
            this._queueActionPlaySelected.setSensitive(hasSelection);
        }
        if (this._queueActionEditSelected) {
            this._queueActionEditSelected.setSensitive(hasSelection);
        }
        if (this._queueActionCopySelected) {
            this._queueActionCopySelected.setSensitive(hasSelection);
        }
        if (this._queueActionPreferSelected) {
            this._queueActionPreferSelected.setSensitive(hasSelection);
        }
        if (this._queueActionPutBackSelected) {
            this._queueActionPutBackSelected.setSensitive(hasSelection);
        }
        if (this._queueActionCancelSelected) {
            this._queueActionCancelSelected.setSensitive(hasSelection);
        }
        if (this._queueActionRemoveSelected) {
            this._queueActionRemoveSelected.setSensitive(hasSelection);
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

    _runQueueEditDialog(item) {
        const url = this._normalizeQueueItemUrl(item);
        if (!url) {
            this._setStatus("Download ändern fehlgeschlagen: keine URL");
            return;
        }
        if (!GLib.file_test(this._queueEditDialogPath, GLib.FileTest.EXISTS | GLib.FileTest.IS_EXECUTABLE)) {
            this._setStatus("Editierdialog nicht verfügbar: Script fehlt");
            return;
        }

        const args = [
            this._queueEditDialogPath,
            `--url=${url}`,
            `--title=${item.title || ""}`,
            `--folder=${item.folder || ""}`,
            `--sender=${item.sender || ""}`,
            `--genre=${item.genre || ""}`,
            `--topic=${item.topic || ""}`,
            `--date=${item.date || ""}`,
            `--time=${item.time || ""}`,
            `--duration=${item.duration || ""}`,
            `--description=${item.description || ""}`,
            `--website=${item.website || ""}`
        ];

        this._setStatus(`ändere Download: ${item.title || "Eintrag"}`);
        try {
            const proc = Gio.Subprocess.newv(args, Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            proc.communicate_utf8_async(null, null, (source, result) => {
                let stdout = "";
                let stderr = "";
                let exitStatus = CMD_SUCCESS;
                try {
                    const [, payloadOut, payloadErr] = source.communicate_utf8_finish(result);
                    stdout = payloadOut || "";
                    stderr = payloadErr || "";
                    exitStatus = source.get_exit_status();
                } catch (error) {
                    this._setStatus(`Download bearbeiten fehlgeschlagen: ${error.message}`);
                    this._runQueueList();
                    return;
                }

                if (exitStatus !== CMD_SUCCESS) {
                    this._setStatus(`Download bearbeiten fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                    this._runQueueList();
                    return;
                }

                let payload = {};
                if (stdout && stdout.trim().startsWith("{")) {
                    try {
                        payload = JSON.parse(stdout);
                    } catch (error) {
                        this._setStatus(`Antwort ungültig: ${error.message}`);
                    }
                }
                if (payload.status && payload.status !== "ok") {
                    this._setStatus(`Download bearbeiten: ${payload.message || "unbekannter Fehler"}`);
                    return;
                }
                if (payload.cancelled) {
                    this._setStatus("Download ändern abgebrochen");
                    this._runQueueList();
                    return;
                }
                if (payload.updated === 0 && payload.running_blocks > 0) {
                    this._setStatus("laufender Download kann nicht geändert werden");
                } else if (payload.updated === 0) {
                    this._setStatus("keine Änderung");
                } else {
                    this._setStatus(`Download aktualisiert: ${payload.updated}`);
                }
                this._runQueueList();
            });
        } catch (error) {
            this._setStatus(`Download bearbeiten nicht gestartet: ${error.message}`);
        }
    }

    _runQueueRemove(item) {
        const url = this._normalizeQueueItemUrl(item);
        const callback = arguments.length > 1 ? arguments[1] : null;
        if (!url) {
            this._setStatus("queue-remove fehlgeschlagen: keine URL");
            if (callback) {
                callback(false, 0);
            }
            return;
        }
        this._setStatus(`entferne aus Warteschlange: ${item.title || "Eintrag"}`);
        this._runHelper([
            "download-remove",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-remove fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                if (callback) {
                    callback(false, 0);
                }
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-remove: unerwartete Antwort");
                    if (callback) {
                        callback(false, 0);
                    }
                    return;
                }
                if (payload.removed === 0 && payload.running_blocks > 0) {
                    this._setStatus("laufender Download wird nicht entfernt");
                } else if (payload.removed === 0) {
                    this._setStatus("nichts entfernt");
                } else {
                    this._setStatus(`entfernt: ${payload.removed}`);
                }
                if (callback) {
                    callback(true, payload.removed || 0);
                } else {
                    this._runQueueList();
                }
            } catch (error) {
                this._setStatus(`download-remove ungültige Antwort: ${error.message}`);
                if (callback) {
                    callback(false, 0);
                }
            }
        });
    }

    _runQueuePrefer(item) {
        const callback = arguments.length > 1 ? arguments[1] : null;
        const url = this._normalizeQueueItemUrl(item);
        if (!url) {
            this._setStatus("queue-prefer fehlgeschlagen: keine URL");
            if (callback) {
                callback(false, 0);
            }
            return;
        }
        const title = item && item.title ? item.title : "Eintrag";
        this._setStatus(`ziehe vor: ${title}`);
        this._runHelper([
            "download-prefer",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-prefer fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                if (callback) {
                    callback(false, 0);
                }
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-prefer: unerwartete Antwort");
                    if (callback) {
                        callback(false, 0);
                    }
                    return;
                }
                if (!payload.moved) {
                    this._setStatus("Eintrag konnte nicht vorgezogen werden");
                }
                if (callback) {
                    callback(true, payload.moved ? 1 : 0);
                } else {
                    this._runQueueList();
                }
            } catch (error) {
                this._setStatus(`download-prefer ungültige Antwort: ${error.message}`);
                if (callback) {
                    callback(false, 0);
                }
            }
        });
    }

    _runQueuePutBack(item) {
        const callback = arguments.length > 1 ? arguments[1] : null;
        const url = this._normalizeQueueItemUrl(item);
        if (!url) {
            this._setStatus("queue-put-back fehlgeschlagen: keine URL");
            if (callback) {
                callback(false, 0);
            }
            return;
        }
        const title = item && item.title ? item.title : "Eintrag";
        this._setStatus(`stelle zurück: ${title}`);
        this._runHelper([
            "download-put-back",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-put-back fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                if (callback) {
                    callback(false, 0);
                }
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-put-back: unerwartete Antwort");
                    if (callback) {
                        callback(false, 0);
                    }
                    return;
                }
                if (!payload.moved) {
                    this._setStatus("Eintrag konnte nicht zurückgestellt werden");
                }
                if (callback) {
                    callback(true, payload.moved ? 1 : 0);
                } else {
                    this._runQueueList();
                }
            } catch (error) {
                this._setStatus(`download-put-back ungültige Antwort: ${error.message}`);
                if (callback) {
                    callback(false, 0);
                }
            }
        });
    }

    _copyQueueUrl(item) {
        const url = this._normalizeQueueItemUrl(item);
        if (!url) {
            this._setStatus("Download (URL) kopieren: kein Wert");
            return;
        }

        this._copyToClipboard(url, "Download (URL) kopieren");
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

    _runQueueTrashFile(item) {
        const url = this._normalizeQueueItemUrl(item);
        if (!url) {
            this._setStatus("Datei löschen fehlgeschlagen: keine URL");
            return;
        }

        this._setStatus(`lösche gespeicherte Datei: ${item.title || "Eintrag"}`);
        this._runHelper([
            "download-trash-file",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`download-trash-file fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse(stdout || "{}");
                if (payload.status !== "ok") {
                    this._setStatus("download-trash-file: unerwartete Antwort");
                    return;
                }
                if (!payload.trashed) {
                    this._setStatus("Datei konnte nicht gelöscht werden");
                    return;
                }
                this._setStatus("Datei in den Papierkorb verschoben");
                this._runQueueList();
            } catch (error) {
                this._setStatus(`download-trash-file ungültige Antwort: ${error.message}`);
            }
        });
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

        const clearBookmarks = new PopupMenu.PopupMenuItem("Alle angelegten Bookmarks löschen");
        clearBookmarks.connect("activate", () => this._runBookmarkClear());
        this._favoritesSection.addMenuItem(clearBookmarks);

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

        const play = new PopupMenu.PopupMenuItem("Abspielen");
        play.connect("activate", () => this._playItem(item));
        row.menu.addMenuItem(play);

        const save = new PopupMenu.PopupMenuItem("Speichern");
        save.connect("activate", () => this._runDownloadEnqueue(item));
        row.menu.addMenuItem(save);

        this._addWebsiteAction(row.menu, item);
        this._addFilterActions(row.menu, item);
        this._addInfoAction(row.menu, item);
        this._addMetadataCopyActions(row.menu, item);
        this._addHistoryActions(row.menu, item);
        this._addBlacklistActions(row.menu, item);

        if (withRemoveAction) {
            const remove = new PopupMenu.PopupMenuItem("Bookmarks löschen");
            remove.connect("activate", () => this._runBookmarkRemove(item));
            row.menu.addMenuItem(remove);
        } else {
            const removeBookmark = new PopupMenu.PopupMenuItem("Bookmarks löschen");
            removeBookmark.connect("activate", () => this._runBookmarkRemove(item));
            row.menu.addMenuItem(removeBookmark);
        }

        return row;
    }

    _entryArgs(item) {
        return [
            `--title=${item.title || ""}`,
            `--sender=${item.sender || ""}`,
            `--genre=${item.genre || ""}`,
            `--topic=${item.topic || ""}`,
            `--date=${item.date || ""}`,
            `--time=${item.time || ""}`,
            `--duration=${item.duration || ""}`,
            `--description=${item.description || ""}`,
            `--url=${item.url || ""}`,
            `--website=${item.website || ""}`
        ];
    }

    _addInfoAction(menu, item) {
        const action = new PopupMenu.PopupMenuItem("Audioinformation anzeigen");
        action.connect("activate", () => this._setInfoSection(item));
        menu.addMenuItem(action);

        const filmInfo = new PopupMenu.PopupMenuItem("Filminformation anzeigen");
        filmInfo.connect("activate", () => this._setInfoSection(item));
        menu.addMenuItem(filmInfo);
    }

    _addMetadataCopyActions(menu, item) {
        this._addCopyFieldAction(menu, "Audio-URL kopieren", item.url);
        this._addCopyFieldAction(menu, "Titel in die Zwischenablage kopieren", item.title);
        this._addCopyFieldAction(menu, "Genre in die Zwischenablage kopieren", item.genre);
        this._addCopyFieldAction(menu, "Thema in die Zwischenablage kopieren", item.topic);
    }

    _addHistoryActions(menu, item) {
        const markShown = new PopupMenu.PopupMenuItem("Als gesehen markieren");
        markShown.connect("activate", () => this._runHistoryAdd(item));
        menu.addMenuItem(markShown);

        const markUnshown = new PopupMenu.PopupMenuItem("Als ungesehen markieren");
        markUnshown.connect("activate", () => this._runHistoryRemove(item));
        menu.addMenuItem(markUnshown);
    }

    _addFilterActions(menu, item) {
        const sender = this._toTrimmed(item.sender || "");
        const genre = this._toTrimmed(item.genre || "");
        const topic = this._toTrimmed(item.topic || "");
        const title = this._toTrimmed(item.title || "");

        const filterMenu = new PopupMenu.PopupSubMenuMenuItem("Filter");

        const senderFilterItem = new PopupMenu.PopupMenuItem("nach Sender filtern");
        senderFilterItem.connect("activate", () => {
            this._applyFilterSettings("sender-filter", sender, {
                fallback: item.topic || item.title || item.genre || ""
            });
        });
        filterMenu.menu.addMenuItem(senderFilterItem);

        const genreFilterItem = new PopupMenu.PopupMenuItem("nach Genre filtern");
        genreFilterItem.connect("activate", () => {
            this._applyFilterSettings("genre-filter", genre, {
                fallback: item.sender || item.title || item.topic || ""
            });
        });
        filterMenu.menu.addMenuItem(genreFilterItem);

        const topicFilterItem = new PopupMenu.PopupMenuItem("nach Thema filtern");
        topicFilterItem.connect("activate", () => {
            this._applyFilterSettings("topic-filter", topic, {
                fallback: item.sender || item.title || item.genre || ""
            });
        });
        filterMenu.menu.addMenuItem(topicFilterItem);

        const titleFilterItem = new PopupMenu.PopupMenuItem("nach Titel filtern");
        titleFilterItem.connect("activate", () => {
            this._applyFilterSettings("title-filter", title, {
                fallback: item.sender || item.topic || item.genre || ""
            });
        });
        filterMenu.menu.addMenuItem(titleFilterItem);

        const senderTopicFilterItem = new PopupMenu.PopupMenuItem("nach Sender und Thema filtern");
        senderTopicFilterItem.connect("activate", () => {
            this._applyFilterSettings("sender-filter", sender, {
                fallback: item.genre || item.title || ""
            }, "topic-filter", topic, {
                fallback: item.sender || item.title || ""
            });
        });
        filterMenu.menu.addMenuItem(senderTopicFilterItem);

        const senderTitleFilterItem = new PopupMenu.PopupMenuItem("nach Sender, und Titel filtern");
        senderTitleFilterItem.connect("activate", () => {
            this._applyFilterSettings("sender-filter", sender, {
                fallback: item.topic || item.genre || ""
            }, "title-filter", title, {
                fallback: item.sender || item.topic || item.genre || ""
            });
        });
        filterMenu.menu.addMenuItem(senderTitleFilterItem);

        menu.addMenuItem(filterMenu);
    }

    _applyFilterSettings(settingName, rawValue, statusMeta, secondaryName, secondaryRawValue, secondaryStatusMeta) {
        const value = this._toTrimmed(rawValue);
        if (!value) {
            const fallback = statusMeta && statusMeta.fallback ? ` (${statusMeta.fallback})` : "";
            this._setStatus(`Filter kann nicht gesetzt werden: kein ${settingName.replace(/-/g, " ")}wert${fallback}`);
            return;
        }

        const updates = [{
            name: settingName,
            value
        }];
        this._bookmarkFilterSnapshot = null;

        if (secondaryName) {
            const secondaryValue = this._toTrimmed(secondaryRawValue);
            if (!secondaryValue) {
                const fallback = secondaryStatusMeta && secondaryStatusMeta.fallback ? ` (${secondaryStatusMeta.fallback})` : "";
                this._setStatus(`Filter kann nicht gesetzt werden: kein ${secondaryName.replace(/-/g, " ")}wert${fallback}`);
                return;
            }
            updates.push({
                name: secondaryName,
                value: secondaryValue
            });
        }

        this._isSyncingFilterSettingsFromSettings = true;
        try {
            this._isSyncingSearchQueryFromSettings = secondaryName === "search-query" || settingName === "search-query";
            for (const update of updates) {
                if (update.name === "sender-filter") {
                    this.senderFilter = update.value;
                    this.settings.setValue("sender-filter", update.value);
                } else if (update.name === "genre-filter") {
                    this.genreFilter = update.value;
                    this.settings.setValue("genre-filter", update.value);
                } else if (update.name === "topic-filter") {
                    this.topicFilter = update.value;
                    this.settings.setValue("topic-filter", update.value);
                } else if (update.name === "title-filter") {
                    this.titleFilter = update.value;
                    this.settings.setValue("title-filter", update.value);
                } else if (update.name === "theme-title-filter") {
                    this.themeTitleFilter = update.value;
                    this.settings.setValue("theme-title-filter", update.value);
                } else if (update.name === "somewhere-filter") {
                    this.somewhereFilter = update.value;
                    this.settings.setValue("somewhere-filter", update.value);
                } else if (update.name === "search-query") {
                    this.searchQuery = update.value;
                    this._activeSearchQuery = update.value;
                    this.settings.setValue("search-query", update.value);
                    if (this._searchEntry && this._searchEntry.get_text() !== update.value) {
                        this._searchEntry.set_text(update.value);
                    }
                }
            }
        } finally {
            this._isSyncingSearchQueryFromSettings = false;
            this._isSyncingFilterSettingsFromSettings = false;
        }

        this._refreshFilterSummary();
        this._runSearch();
    }

    _applySearchQueryFilter(rawValue, statusMeta) {
        const value = this._toTrimmed(rawValue);
        if (!value) {
            const fallback = statusMeta && statusMeta.fallback ? ` (${statusMeta.fallback})` : "";
            this._setStatus(`Filter kann nicht gesetzt werden: kein Titelwert${fallback}`);
            return;
        }

        this._isSyncingSearchQueryFromSettings = true;
        this._activeSearchQuery = value;
        try {
            this.searchQuery = value;
            this.settings.setValue("search-query", value);
            if (this._searchEntry && this._searchEntry.get_text() !== value) {
                this._searchEntry.set_text(value);
            }
        } finally {
            this._isSyncingSearchQueryFromSettings = false;
        }

        this._runSearch(value);
    }

    _addBlacklistActions(menu, item) {
        const addFull = new PopupMenu.PopupMenuItem("Blacklist-Eintrag für das Audio erstellen");
        addFull.connect("activate", () => this._runBlacklistAdd(item, {
            sender: item.sender || "",
            genre: item.genre || "",
            topic: item.topic || "",
            title: item.title || ""
        }));
        menu.addMenuItem(addFull);

        const addSenderGenre = new PopupMenu.PopupMenuItem("Sender und Genre direkt in die Blacklist einfügen");
        addSenderGenre.connect("activate", () => this._runBlacklistAdd(item, {
            sender: item.sender || "",
            genre: item.genre || "",
            topic: item.topic || ""
        }));
        menu.addMenuItem(addSenderGenre);

        const addSenderTopic = new PopupMenu.PopupMenuItem("Sender und Thema direkt in die Blacklist einfügen");
        addSenderTopic.connect("activate", () => this._runBlacklistAdd(item, {
            sender: item.sender || "",
            topic: item.topic || ""
        }));
        menu.addMenuItem(addSenderTopic);

        const addTopic = new PopupMenu.PopupMenuItem("Thema direkt in die Blacklist einfügen");
        addTopic.connect("activate", () => this._runBlacklistAdd(item, {
            topic: item.topic || ""
        }));
        menu.addMenuItem(addTopic);

        const addTitle = new PopupMenu.PopupMenuItem("Titel direkt in die Blacklist einfügen");
        addTitle.connect("activate", () => this._runBlacklistAdd(item, {
            title: item.title || ""
        }));
        menu.addMenuItem(addTitle);

        const addThemeTitle = new PopupMenu.PopupMenuItem("Thema oder Titel direkt in die Blacklist einfügen");
        addThemeTitle.connect("activate", () => {
            const themeTitle = this._toTrimmed(item.topic || item.title || "");
            this._runBlacklistAdd(item, {
                themeTitle
            });
        });
        menu.addMenuItem(addThemeTitle);
    }

    _addCopyFieldAction(menu, label, value) {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect("activate", () => this._copyToClipboard(value, label));
        menu.addMenuItem(item);
    }

    _copyToClipboard(value, actionLabel) {
        const text = this._toTrimmed(value);
        if (!text) {
            this._setStatus(`${actionLabel}: kein Wert`);
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
            clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
            this._setStatus(`${actionLabel}: kopiert`);
        } catch (error) {
            this._setStatus(`Clipboard-Fehler: ${actionLabel}: ${error.message}`);
        }
    }

    _setInfoSection(item) {
        if (!this._infoSection) {
            return;
        }

        const safeItem = item || {};
        const fields = [
            ["Titel", safeItem.title],
            ["Sender", safeItem.sender],
            ["Genre", safeItem.genre],
            ["Thema", safeItem.topic],
            ["Datum/Uhrzeit/Dauer", `${safeItem.date || ""} ${safeItem.time || ""} ${safeItem.duration || ""}`.trim().replace(/\s+/g, " ")],
            ["Beschreibung", safeItem.description],
            ["URL", safeItem.url],
            ["Website", safeItem.website],
            ["Pfad", safeItem.path]
        ];

        this._renderInfoSection(fields);
    }

    _renderInfoSection(fields = []) {
        if (!this._infoSection) {
            return;
        }

        this._infoSection.removeAll();
        const header = new PopupMenu.PopupMenuItem("Audioinformation");
        header.actor.reactive = false;
        header.actor.add_style_class_name("atcinna-section-title");
        this._infoSection.addMenuItem(header);

        let hasField = false;
        for (const [label, value] of fields) {
            if (!value) {
                continue;
            }
            hasField = true;
            const itemRow = new PopupMenu.PopupMenuItem(`${label}: ${this._shortText(value)}`);
            itemRow.actor.reactive = false;
            this._infoSection.addMenuItem(itemRow);
        }

        if (!hasField) {
            const empty = new PopupMenu.PopupMenuItem("Keine Audioinformation verfügbar");
            empty.actor.reactive = false;
            this._infoSection.addMenuItem(empty);
        }
    }

    _addWebsiteAction(menu, item) {
        if (!item.website) {
            return;
        }
        const web = new PopupMenu.PopupMenuItem("Webseite");
        web.connect("activate", () => this._xdgOpen(item.website));
        menu.addMenuItem(web);
    }

    _runHistoryAdd(item, callback = null) {
        this._runHelper([
            "history-add",
            ...this._entryArgs(item)
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`history-add fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                if (callback) {
                    callback(false, 0);
                }
                return;
            }
            try {
                const payload = JSON.parse((stdout || "{}"));
                if (payload.status !== "ok") {
                    this._setStatus("history-add: unerwartete Antwort");
                    if (callback) {
                        callback(false, 0);
                    }
                    return;
                }
                if (callback) {
                    callback(true, 1);
                } else {
                    this._loadHistory();
                }
            } catch (error) {
                this._setStatus(`history-add ungültige Antwort: ${error.message}`);
                if (callback) {
                    callback(false, 0);
                }
            }
        });
    }

    _runHistoryRemove(item, callback = null) {
        const url = item.url || "";
        if (!url) {
            this._setStatus("history-remove fehlgeschlagen: keine URL");
            if (callback) {
                callback(false, 0);
            }
            return;
        }
        this._runHelper([
            "history-remove",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`history-remove fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                if (callback) {
                    callback(false, 0);
                }
                return;
            }
            try {
                const payload = JSON.parse((stdout || "{}"));
                if (payload.status !== "ok") {
                    this._setStatus("history-remove: unerwartete Antwort");
                    if (callback) {
                        callback(false, 0);
                    }
                    return;
                }
                if (callback) {
                    callback(true, payload.removed ? 1 : 0);
                } else {
                    this._setStatus(payload.removed ? "Als ungesehen markiert" : "nicht in History");
                    this._loadHistory();
                }
            } catch (error) {
                this._setStatus(`history-remove ungültige Antwort: ${error.message}`);
                if (callback) {
                    callback(false, 0);
                }
            }
        });
    }

    _runBlacklistAdd(item, fields) {
        const args = ["blacklist-add"];
        const sender = this._toTrimmed(fields.sender || "");
        const genre = this._toTrimmed(fields.genre || "");
        const topic = this._toTrimmed(fields.topic || "");
        const title = this._toTrimmed(fields.title || "");
        const themeTitle = this._toTrimmed(fields.themeTitle || fields.theme_title || "");
        if (!sender && !genre && !topic && !title && !themeTitle) {
            this._setStatus("Blacklist: keine Daten für Eintrag");
            return;
        }
        if (sender) {
            args.push(`--sender=${sender}`);
        }
        if (genre) {
            args.push(`--genre=${genre}`);
        }
        if (topic) {
            args.push(`--topic=${topic}`);
        }
        if (title) {
            args.push(`--title=${title}`);
        }
        if (themeTitle) {
            args.push(`--theme-title=${themeTitle}`);
        }

        this._setStatus(`Blacklist aktualisiere: ${item.title || item.topic || item.sender || "Eintrag"}`);
        this._runHelper(args, (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`Blacklist konnte nicht aktualisiert werden: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse((stdout || "{}"));
                if (payload.status !== "ok") {
                    this._setStatus("Blacklist: unerwartete Antwort");
                    return;
                }
                this._setStatus("Blacklist aktualisiert");
                this._loadSections();
                this._runSearch();
                this._runQueueList();
            } catch (error) {
                this._setStatus(`Blacklist ungültige Antwort: ${error.message}`);
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

    _runBookmarkAdd(item, callback = null) {
        this._runHelper([
            "bookmark-add",
            ...this._entryArgs(item)
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`bookmark-add fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                if (callback) {
                    callback(false, 0);
                }
                return;
            }
            try {
                const payload = JSON.parse((stdout || "{}"));
                if (payload.status !== "ok") {
                    this._setStatus("bookmark-add: unerwartete Antwort");
                    if (callback) {
                        callback(false, 0);
                    }
                    return;
                }
                if (callback) {
                    callback(true, 1);
                } else {
                    this._loadSections();
                }
            } catch (error) {
                this._setStatus(`bookmark-add ungültige Antwort: ${error.message}`);
                if (callback) {
                    callback(false, 0);
                }
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

    _runBookmarkRemove(item, callback = null) {
        const url = item.url || "";
        if (!url) {
            this._setStatus("bookmark-remove fehlgeschlagen: keine URL");
            if (callback) {
                callback(false, 0);
            }
            return;
        }
        this._runHelper([
            "bookmark-remove",
            `--url=${url}`
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`bookmark-remove fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                if (callback) {
                    callback(false, 0);
                }
                return;
            }
            try {
                const payload = JSON.parse((stdout || "{}"));
                if (payload.status !== "ok") {
                    this._setStatus("bookmark-remove: unerwartete Antwort");
                    if (callback) {
                        callback(false, 0);
                    }
                    return;
                }
                if (callback) {
                    callback(true, payload.removed ? 1 : 0);
                } else {
                    this._loadBookmarks();
                }
            } catch (error) {
                this._setStatus(`bookmark-remove ungültige Antwort: ${error.message}`);
                if (callback) {
                    callback(false, 0);
                }
            }
        });
    }

    _runBookmarkClear() {
        this._runHelper([
            "bookmark-clear"
        ], (status, stdout, stderr) => {
            if (status !== CMD_SUCCESS) {
                this._setStatus(`bookmark-clear fehlgeschlagen: ${stderr || "unbekannter Fehler"}`);
                return;
            }
            try {
                const payload = JSON.parse((stdout || "{}"));
                if (payload.status !== "ok") {
                    this._setStatus("bookmark-clear: unerwartete Antwort");
                    return;
                }
                this._setStatus(`Bookmarks gelöscht: ${payload.removed || 0}`);
                this._loadBookmarks();
            } catch (error) {
                this._setStatus(`bookmark-clear ungültige Antwort: ${error.message}`);
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
            return false;
        }

        const targetUri = `${uri}`.trim();
        const lowered = targetUri.toLowerCase();
        if (!lowered.startsWith("http://") && !lowered.startsWith("https://")) {
            this._setStatus("öffnen fehlgeschlagen: unzulässiges URL-Schema");
            return false;
        }

        this._setStatus(`öffne: ${targetUri}`);
        Util.spawn(["xdg-open", targetUri]);
        return true;
    }

    _clearResults() {
        this._resultsSection.removeAll();
        this._resultItemsCache = [];
        this._resultSelectionItems.clear();
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

    on_applet_clicked(event) {
        if (event && typeof event.get_button === "function" && event.get_button() !== 1) {
            return;
        }
        this.menu.open(true);
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
