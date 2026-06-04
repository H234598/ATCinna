# Changelog
## 0.3.14

- Erste ATPlayer-Blacklist-Paritätsstufe ergänzt: persistente `blacklist.json` mit Helper-Aktionen `blacklist-add`, `blacklist-list` und `blacklist-remove`.
- Suche unterstützt `--blacklist-mode off|hide|only`; die Applet-Einstellung **Blacklist-Modus** blendet Treffer aus oder zeigt nur passende Blacklist-Treffer.
- Kontextmenüs von Treffer-, Verlauf-, Favoriten- und Queue-Einträgen erhalten die fünf ATPlayer-ähnlichen Blacklist-Aktionen für Audio, Sender+Genre+Thema, Sender+Thema, Thema und Titel.
- Suchergebnisse liefern jetzt auch `description`, damit Info- und Blacklist-Flächen aus der Katalogsuche vollständiger gefüllt werden.
- Lokale Checks prüfen Blacklist-Store, Deduplizierung, Filtermodi, Menüverdrahtung und ATPlayer-kompatible Sender+Genre+Thema-Semantik.

## 0.3.13

- Installationsvalidierung härtet jetzt auch die installierte `applet.js`-Kopie gegen die UI-Verträge ab: Linksklick-Handler vorhanden, `this.menu.toggle()` im Handler, Menüpunkt **„Einstellungen“** vorhanden und über `configureApplet()` verdrahtet.
- Der Linksklick-/Einstellungen-Pfad bleibt im Applet-Code unverändert, weil die Runtime- und Quellprüfung gezeigt hat, dass diese Funktionen bereits vorhanden sind.
- Implementierungsplan aktualisiert: ATPlayer-Parität wird ausdrücklich als noch nicht vollständig dokumentiert, statt die vorhandenen Kernfunktionen als Abschluss zu werten.

## 0.3.12

- Queue-Management um sichere gespeicherte-Datei-Löschung ergänzt: neue Helper-Action `download-trash-file --url URL`, die Queue-Eintrag mit vorhandenem `path` prüft, den Download-Pfad per `gio trash` in den Papierkorb verschiebt und den Eintrag defensiv auf `cancelled` setzt.
- Queue-Menü im Applet ergänzt um **„Gespeichertes Audio (Datei) löschen“**, inkl. Refresh nach der Aktion.
- `scripts/check.sh` erweitert um statische Checks für neue Action/Label/Handler und funktionale Tests (Trash innerhalb Queue-Ordner, Außenbereich-Verbot, fehlende URL/Path).

## 0.3.11

- History/Favorites/Queue- und Suchergebnis-Einträge um neue Metadaten-Felder ergänzt: `date`, `time`, `duration`, `description`.
- Applet-Menüs erhalten die Aktion **„Audioinformation anzeigen“** in Treffer-, Verlauf-, Favoriten- und Queue-Untermenüs mit kompakter Anzeige in einem neuen Popup-Infobereich.
- Applet-Menüs erhalten Kopieraktionen für **Titel**, **Genre** und **Thema** als gemeinsame sichere Clipboard-Helferfunktion.
- Helper-Funktionen für `history-add`, `bookmark-add` und `download-enqueue` akzeptieren jetzt optionale `--date`, `--time`, `--duration`, `--description` und persistieren diese Felder rückwärtskompatibel.
- `scripts/check.sh` erweitert um statische Prüfungen und funktionale Helfertests für die neuen Metadaten-Felder.

## 0.3.10

- Queue-Parität im Applet-Menü erweitert: Globaler Durchlauf „Alle Downloads starten/stoppen“, „Nächsten Download starten“ bleibt erhalten, ergänzt um „Alle wartenden Downloads stoppen“ als eigener Warteschlangen-Pfad.
- Neue pro Queue-Eintrag Aktionen im Untermenü: „Download stoppen“, „Audio (URL) abspielen“, „Download (URL) kopieren“, „Gespeichertes Audio (Datei) abspielen“, „Zielordner öffnen“.
- „Alle Downloads starten“ ruft `download-run-next` nacheinander mit defensivem Limit bis `state: empty` auf; danach wird Queue-Status (Erfolge/Fehler) gesetzt und die Liste aktualisiert.
- Keine neuen Helper-Aktionen eingeführt; `download-cancel` wurde um `--queued-only` erweitert, damit wartende und laufende Downloads getrennt gestoppt werden können.

## 0.3.9

- Queue-Management erweitert auf ATPlayer-Parität für Warteschlangen-Bearbeitung: `download-remove`, `download-undo`, `download-prefer`, `download-put-back`.
- Queue-Einträge im Applet-UI jetzt mit Untermenüs (`URL kopieren`, `Ordner öffnen`, `Aus Liste entfernen`, `Vorziehen`, `Zurückstellen`) und globaler Aktion `Gelöschte wieder anlegen`.
- `download-remove` entfernt nur nicht laufende Einträge, `download-undo` stellt die letzte entfernte Auswahl wieder her.
- Queue-Reihenfolge-Operationen respektieren `running`-Einträge und greifen nur auf `queued`-Einträge ein.
- Lokale Checks um neue Queue-Aktionen sowie Helper-Funktionstests für Remove/Undo/Prefer/Put-back erweitert.


## 0.3.8

- Erste ATPlayer-Paritätsstufe für Downloads ergänzt: persistente FIFO-Download-Warteschlange mit `download-enqueue`, `download-list`, `download-run-next`, `download-cancel` und `download-clear`.
- Applet-Menü erweitert um „In Warteschlange legen“, „Warteschlange anzeigen“, „Nächsten Download starten“, „Wartende stoppen“ und „Erledigte entfernen“.
- Lokaler Check prüft Queue-Deduplizierung, FIFO-Abarbeitung, lokalen HTTP-Download, Cancel/Clear und URL-Schema-Abwehr.

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
