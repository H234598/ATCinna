# Changelog

## 0.3.7

- Linksklick bleibt unverändert und toggelt weiterhin das Applet-Menü.
- Im Popup-Menü wurde „Einstellungen“ ergänzt, das direkt
  `configureApplet()` öffnet.
- `scripts/check.sh` enthält neue statische Prüfungen für Klick-Verhalten und
  vorhandenen Einstellungen-Menüpunkt im Applet-UI.

## 0.3.6

- Alternative Task A ergänzt: „Suche öffnen“-Popup-Aktion im Applet, die ein optionales externes
  GTK3-Dialogskript startet.
- Neues Skript `atcinna@H234598/scripts/atcinna-search-dialog` mit
  `--self-test`-Modus, Suchoberfläche, sowie Play/Webseite/Download-Aktionen über
  sichere Argumentlisten.
- Check- und Installvalidierung prüfen den Dialog, ohne GTK3 zur Pflichtabhängigkeit
  des Applets zu machen.
- Versionssprung auf 0.3.6 für die GTK-Suchdialog-Variante.

## 0.3.5

- Kleine read-only D-Bus-Schnittstelle hinzugefügt: `org.Cinnamon.Applets.ATCinna` unter dem Objektpfad `/org/Cinnamon/Applets/ATCinna` mit den Methoden `Ping()` und `GetStatus()`.
- `GetStatus` liefert Statusfelder (`status`, `uuid`, `instanceId`, `version`, `activeSearchQuery`, `maxHits`, `hasHelper`, `dbusPath`) zur Laufzeitbeobachtung.
- Runtime-Smoke prüft die D-Bus-Statusschnittstelle (`Ping`/`GetStatus`) im temporären Aktivierungsmodus und, falls aktiv, auch im non-mutating-Modus.

## 0.3.4

- Neues Runtime-Smoke-Skript hinzugefügt: `scripts/runtime-smoke.sh`
  - Default-Modus non-mutierend: prüft notwendige Commands, DBus-Erreichbarkeit, installierte Applet-Version via `validate-installed.sh`, aktuelle UUID-Laufzeitliste und (falls aktiv) AppletManager-Instanzen.
  - Optionaler temporärer Modus mit sicherem `enabled-applets`/`next-applet-id`-Backup und automatischem Restore per Trap.
  - `--timeout` konfigurierbar; keine automatischen mutierenden Prüfpfade in `check.sh`.

## 0.3.3

- Suchergebnisse im Helper filtern auf vertrauenswürdige `http`/`https`-Audio-URLs.
- Ungültige Website-URLs in Katalogzeilen werden auf leeren Wert bereinigt; solche Zeilen werden nicht für `file://`-Audio-URLs mehr angezeigt.
- `xdg-open` im Applet lehnt nicht-HTTP(S)-URIs aktiv ab und setzt den Status vor dem Aufruf.

## 0.3.2

- `scripts/validate-installed.sh` eingeführt: neue nicht-mutierende Validierung für installierte Applets mit Prüfung auf
  - zwingende Applet-Dateien unter `<target-dir>/atcinna@H234598`
  - korrekte `metadata.json` (`uuid`, `version`)
  - parsebare `metadata.json` und `settings-schema.json`
  - JS-Syntaxcheck (`node --check`) von `applet.js`
  - Ausführbarkeit und `--help`-Funktion des Helpers
  - Suchfunktion gegen lokale `audios.xz`-Fixture in isoliertem `XDG_CACHE_HOME`
- `scripts/check.sh` nutzt die installierte Applet-Validierung als Selftest direkt nach temporärer Installation.
- `scripts/install-local.sh` validiert die reale Zielinstallation optional standardmäßig nach dem Kopiervorgang.
- Version auf `0.3.2` angehoben.

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
