# Changelog

## 0.1.1

- Popup-Suche im Menü hinzugefügt (`St.Entry` über den Refresh-Knopf): initial aus `search-query`, Debounce bei Eingabe (ca. 350 ms), Sofortsuche auf Enter.
- Aktuelle Popup-Suche bleibt bei Refresh und Trefferlimit-Änderungen erhalten.
- Popup-Timer sauber entfernt (`on_applet_removed_from_panel`) inklusive Debounce-Timer.
- Lokales Check-Gate um Java/GNOME-Shell-Import-Guard und JavaScript-Syntaxprüfung erweitert.
- Version auf 0.1.1 angehoben.

## 0.1.0

- Erstes installierbares Java-freies Cinnamon-Applet-MVP.
- Hilfsskript `atcinna-catalog` mit `refresh`, `search`, `download`.
- Asynchrone Helper-Aufrufe über `Gio.Subprocess`, non-blocking UI.
- Suchstatus im Popup, Refresh-Aktion, Play/Website/Download-Aktionen.
