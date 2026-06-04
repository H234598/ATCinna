# Changelog

## 0.3.1

- Reproduzierbare lokale Installation ergänzt: `./scripts/install-local.sh`
  mit `--dry-run` und `--target-dir`, sichere Zwischenkopie und atomarem Austausch
  nach `~/.local/share/cinnamon/applets/atcinna@H234598` (oder angegebenem Ziel).
- Paketierung ergänzt: `./scripts/package.sh` erstellt
  `dist/atcinna@H234598-<version>.tar.gz` nach erfolgreichem Check.
- `scripts/check.sh` validiert zusätzlich Install- und Package-Skripte (ShellCheck) und
  führt im Testlauf eine temporäre lokale Installation mit `--target-dir`.

## 0.3.0

- Neue Einstellungen für Filter (`sender-filter`, `genre-filter`, `topic-filter`) hinzugefügt.
- Popup zeigt jetzt einen kompakten Filterstatus und den Befehl „Filter löschen“; bei Nichtnutzung wird „Filter: keine“ angezeigt.
- Filter werden als Teiltreffer an den Helper mit `--sender`, `--genre`, `--topic` weitergereicht; Änderungen aus Einstellungen lösen sofort neue Suche aus.
- Plan-Stand wurde auf Version 0.3.0 angehoben.

## 0.2.0

- Suche erweitert um Verlauf und Favoriten in der Popup-UI: Abschnitte „Zuletzt gespielt“ und „Favoriten“ werden nach Suchlauf geladen, jeweils bis zu 5 Einträge.
- Beim Abspielen wird der Titel vor dem Öffnen zuerst als History-Eintrag (`history-add`) gespeichert; danach startet `xdg-open`.
- Treffer bieten direkt „Zu Favoriten hinzufügen“ an; Favoriten zeigen zusätzlich „Entfernen“.
- Fehler von Helper-Aktionen (history/bookmark/search/download/refresh) werden abgefangen und als Status angezeigt, ohne UI-Absturz.

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
