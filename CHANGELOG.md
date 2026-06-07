# Changelog
## 0.3.59

- Persistente ATPlayer-nahe Downloadfehlerliste ergänzt: direkte Downloadfehler und Queue-Downloadfehler werden in `download-errors.json` mit Titel, URL, Datei, Fehler, Fehlerausgabe und Zeitstempel protokolliert.
- Neue Helper-Actions `download-error-list` und `download-error-clear`; das Applet bietet **Downloadfehler anzeigen**, **Downloadfehler löschen** und eine Fehlersektion im Popup.
- Neuer Applet-Schalter `download-dialog-error-show` mit Default `true`: Fehler werden weiter protokolliert, aber die automatische Fehlerlisten-Anzeige kann deaktiviert werden.
- `scripts/check.sh` und `scripts/validate-installed.sh` sichern Schema, Binding, Reset-Default, Helper-Actions, Applet-Labels sowie funktionale direkte und Queue-Fehlerlistenpfade ab.

## 0.3.58

- Direkte Downloads und Queue-Downloads melden `Main.notify("Download beendet", details)` nach fertiggestelltem Download als Erfolg oder Fehler, sofern die neue Applet-Einstellung `download-show-notification` aktiv ist.
- Für **Alle Downloads starten** gibt es jetzt eine zusammenfassende Abschlussbenachrichtigung (`Download-Warteschlange abgeschlossen: erledigt X, Fehler Y`) statt Einzelmeldungen.
- Das neue Einstellungsschlüssel `download-show-notification` ist im Settings-Schema mit Default `true` ergänzt; Versionssprung auf `0.3.58` in Metadaten/VERSION/README/Checks.

## 0.3.57

- Audio-Info-Abschnitt: **URL** und **Website** sind jetzt als klickbare Zeilen verfügbar; beide rufen beim Aktivieren `this._xdgOpen(value)` auf, während Titel/Sender/Genre/Thema/Beschreibung etc. statisch bleiben.
- `scripts/check.sh` und `scripts/validate-installed.sh` prüfen die neue klickbare Info-Zeilen-Contract.
- Versionssprung auf `0.3.57`; `metadata.json`, `README`, `VERSION` und Applet-Dateien aktualisiert.

## 0.3.56

- `download-trash-file` bricht jetzt explizit bei `running`-Queue-Einträgen mit klarer JSON-Fehlermeldung ab und verschiebt bei Erfolg optional die zugehörige `.txt`-Infodatei zusammen mit der Audiodatei in den Papierkorb.
- Applet-Queue-Kontext deaktiviert die Aktion **Gespeichertes Audio (Datei) löschen** für `running`-Einträge, damit ein aktiver Download nicht währenddessen gelöscht werden kann.
- `scripts/check.sh` ergänzt funktionale Tests für `running`-Blockade bei `download-trash-file` sowie den gemeinsamen Trash-Vorgang inkl. `.txt`-Infodatei.
- Versionssprung auf `0.3.56`; `metadata.json`, `README`, `VERSION` und `scripts/check.sh` aktualisiert.

## 0.3.55

- Optionales Hilfsdatei-Verhalten ergänzt: `download-info-file` im Applet und `--info-file` im Helper für direkte und Queue-Downloads, mit robuster, atomarer Speicherung der ATPlayer-nahen Text-Infodatei (Metadaten neben der Audio-Datei).
- `scripts/check.sh` testet jetzt beide Pfade (`download --info-file` und `download-enqueue --info-file`) inkl. erfolgreichem Erzeugen und Unterdrücken der Infodatei.
- `scripts/validate-installed.sh` prüft zusätzlich `download-info-file` im Settings-Schema und das neue Helper-Flag `--info-file`.
- Versionssprung auf `0.3.55`; `metadata.json`, `VERSION` und `README` aktualisiert.

## 0.3.54

- Neu: Import/Export für ATPlayer-History-/Bookmark-Textformate im Helper ergänzt (`atplayer-history-import`, `atplayer-history-export`).
- Import verarbeitet neue/alte ATPlayer-Formatzeilen mit exakten Trennern, dedupliziert nach URL, setzt Duplikate vorne und zählt `imported`/`skipped`.
- Export schreibt atomar im ATPlayer-Textformat, legt Elternverzeichnisse bei Bedarf an und liefert `exported`/`skipped` im Status.
- `scripts/check.sh` und `scripts/validate-installed.sh` prüfen jetzt:
  - neuen/alten ATPlayer-Importpfad,
  - Nicht-`http(s)`-URL-Skips,
  - Duplikat-Handling,
  - Export- und Export/Import-Roundtrip.
- Versionssprung auf `0.3.54`; Dokumentation/Plan/Metadata aktualisiert. Es handelt sich explizit um History/Bookmark-Formatparität, nicht um komplette ATPlayer-Migrationspfade.

## 0.3.53

- ATPlayer-nahes Queue-Top-Level ergänzt: **Gespeichertes Audio (Datei) abspielen** für die erste markierte Queue-Auswahl.
- Die neue Aktion nutzt bestehende Logik: `this._openQueueFile(first)` auf dem ausgewählten Queue-Eintrag, inklusive klarer Status bei leerer Auswahl.
- Keine neuen Shell-/Backend-Pfade wurden eingeführt; bestehende Datei-Pfad- und Queue-Routinen werden wiederverwendet.
- Versionssprung auf `0.3.53`; `metadata.json`, `VERSION`, README, Plan, `scripts/check.sh` und `scripts/validate-installed.sh` aktualisiert.
- ATPlayer-Parität bleibt offen (Datei-Abspielflow nur top-level erweitert; weitere Queue-/Workflow-Lücken bleiben offen).

## 0.3.52

- Treffer-Untermenüs erhalten die neue ATPlayer-nahe Kontextaktion **Tabelle zurücksetzen**, die `this._runResultResetSelection()` für die Treffer-Zeilenauswahl aufruft.
- Queue-Untermenüs erhalten die neue Kontextaktion **Tabelle zurücksetzen**, die `this._runQueueResetSelection()` für die sichtbare Queue-Auswahl aufruft.
- `scripts/check.sh` und `scripts/validate-installed.sh` prüfen jetzt die neuen Entry-level-Konstanten und die konkreten `connect`-Handler-Zeilen (`resultEntryResetSelection`, `queueEntryResetSelection`) statt nur allgemeiner Label-Prüfungen.
- Versionssprung auf `0.3.52`; `metadata.json`, `VERSION`, README und Plan aktualisiert.

## 0.3.51

- Katalog-Leseweg auf optionalen SQLite-Cache umgestellt: `action_refresh` baut nach erfolgreichem `audios.xz`-Update atomar `catalog.sqlite` in `XDG_CACHE_HOME/atcinna@H234598` auf.
- Einheitliche Audio-Normalisierung für XZ-Parsing und DB-Import eingeführt.
- `search` bevorzugt den SQLite-Katalog; bei fehlender/kaputter DB wird sauber auf `audios.xz` zurückgefallen.
- `check.sh` und `validate-installed.sh` prüfen jetzt DB-Bau/Verwendung, sowie Suchverhalten bei fehlender oder kaputter DB mit vorhandenem XZ-Fallback.
- Versionssprung auf `0.3.51`; `metadata.json`, `VERSION`, README und Plan aktualisiert.

## 0.3.50

- History-Eintragskontexte auf ATPlayer-nahe Beschriftung ausgerichtet: **Filme als gesehen markieren**, **Filme als ungesehen markieren**.
- Backend-Logik unverändert; `check.sh` und `validate-installed.sh` prüfen jetzt die konkreten Entry-Labels statt der alten Kurzlabels.
- Versionssprung auf `0.3.50`; `metadata.json`, `VERSION`, README, Plan und Checkskripte aktualisiert.

## 0.3.49

- Per-Entry-Queue-Kontextbeschriftungen auf ATPlayer-Wortlaut gebracht: **Aus Liste entfernen**, **Vorziehen** und **Zurückstellen** wurden auf **Downloads aus Liste entfernen**, **Downloads vorziehen** und **Downloads zurückstellen** vereinheitlicht.
- Queue-Handler und Warteschlangenlogik bleiben unverändert; Source- und Installationschecks prüfen jetzt die konkreten Per-Entry-Labels.
- Versionssprung auf `0.3.49`; `metadata.json`, `VERSION`, README, Plan und Checkskripte aktualisiert.

## 0.3.48

- Treffer-Auswahlaktionen wieder auf den ATPlayer-Wortlaut gesetzt: **Alles auswählen**, **Auswahl umkehren**, **Tabelle zurücksetzen**.
- Handler und Auswahlverhalten bleiben unverändert; Source- und Installationschecks erwarten nun denselben sichtbaren Wortlaut, die Reset-Rückmeldung nutzt denselben Begriff.
- Versionssprung auf `0.3.48`; `metadata.json`, `VERSION`, README, Plan und Checkskripte aktualisiert.

## 0.3.47

- Top-Level-Trefferaktionen ergänzt auf den ersten markierten sichtbaren Treffer: **Blacklist-Eintrag für den Film erstellen** und **Thema direkt in die Blacklist einfügen**.
- Beide Top-Level-Blacklist-Aktionen liefern klare Statusmeldungen bei fehlender Auswahl bzw. fehlendem Thema und nutzen weiterhin `blacklist-add` ohne neue Backend-Helfer.
- Versionssprung auf `0.3.47`; `metadata.json`, `VERSION`, README und Checkskripte aktualisiert.

## 0.3.46

- Treffer-Batch-Aktionen im Treffer-Top-Level auf ATPlayer-nahe Labels umgestellt: **Filme als gesehen markieren**, **Filme als ungesehen markieren**, **Neue Bookmarks anlegen**, **Bookmarks löschen**.
- Source- und Installationschecks schützen die neuen Sichtbarkeitslabels sowie `metadata.json`, `VERSION`, README und Checkskripte.

## 0.3.45

- Top-Level-Trefferaktionen ergänzt: **Filminformation anzeigen**, **Thema in die Zwischenablage kopieren**, **Titel in die Zwischenablage kopieren** auf den ersten markierten sichtbaren Treffer umgesetzt.
- Bei fehlender Treffer-Auswahl liefern die neuen Top-Level-Aktionen klare Statusmeldungen; bei fehlendem Titel/Thema werden bestehende Clipboard-Meldungen verwendet.
- Version auf `0.3.45`; `metadata.json`, `VERSION`, README, Checkskripte und Installvalidierung aktualisiert.

## 0.3.44

- Treffer-Top-Level ergänzt: **Film abspielen** und **Film speichern** greifen jetzt auf den ersten markierten sichtbaren Treffer zu.
- Bei fehlender Treffer-Auswahl liefern die neuen Aktionen klare Statusmeldungen statt stiller No-Op.
- Bestehende Batch-Aktionen und Queue-/Helfer-Workflows bleiben unverändert erhalten.
- Versionssprung auf `0.3.44`; `metadata.json`, `VERSION`, README, Checkskripte und Installvalidierung angepasst.

## 0.3.43

- ATPlayer-nahe Queue-Top-Aktion ergänzt: **Download ändern** öffnet nun den vorhandenen Edit-Dialog für den ersten markierten sichtbaren Queue-Eintrag.
- Die Top-Level-Aktion ist defensiv: bei fehlender Auswahl wird klarer Status gesetzt, bei bereits `running` markierten Einträgen wird `Download läuft (nicht änderbar)` zurückgemeldet.
- Selektion-Zustand und Auswahlprüfung wurden unverändert wiederverwendet, es wurden keine neuen Helper-/Backend-Flows eingeführt.
- Versionssprung auf `0.3.43`; `metadata.json`, `VERSION`, README, Checkskripte und Installvalidierung aktualisiert.

## 0.3.42

- Queue-Auswahl-Aktionen im Warteschlangen-Menü auf ATPlayer-nahe Labels umgestellt: **Downloads starten**, **Downloads stoppen**, **Downloads vorziehen**, **Downloads zurückstellen**, **Downloads aus Liste entfernen**.
- Status-/Check-Labels und Check-Expectations wurden auf denselben Wortlaut harmonisiert; Logik bleibt unverändert.
- Versionssprung auf `0.3.42`; `metadata.json`, `VERSION`, README, Plan und Checks angepasst. ATPlayer-Parität bleibt offen.

## 0.3.41

- Hilfemenü um **Anleitung im Web** ergänzt und verknüpft mit dem festen ATPlayer-Hilfe-Link `https://www.p2tools.de/atplayer/manual/` via bestehendem sicheren Browser-Öffner `_xdgOpen()`.
- Keine neuen Helferklassen oder Shell-String-Bausteine eingeführt; bestehender URL-Sicherheitscheck in `_xdgOpen` wird wiederverwendet.
- Versionssprung auf `0.3.41`; `metadata.json`, `VERSION`, README, Plan und Checks angepasst. ATPlayer-Parität bleibt offen.

## 0.3.40

- ATPlayer-nahe Queue-Top-Aktionen ergänzt: **Audio (URL) abspielen** und **Download (URL) kopieren** im Warteschlangen-Top-Level.
- Die neuen Aktionen verwenden bestehende Top-Level-Selection-Helfer und pro markiertem Queue-Eintrag vorhandene Untermenü-Helfer `_playItem` bzw. `_copyQueueUrl`.
- Sensitivität der neuen Aktionen hängt vom markierten Queue-Eintrag ab; keine neuen Helper-Subprozesse hinzugefügt.
- Versionssprung auf `0.3.40`; `metadata.json`, `VERSION`, README und Checks angepasst.

## 0.3.39

- ATPlayer-nahe Queue-Batch-Aktionen **Markierte Downloads vorziehen** und **Markierte Downloads zurückstellen** ergänzt.
- Die Aktionen nutzen die vorhandene sichtbare Queue-Auswahl und die bestehenden Helper-Pfade `download-prefer --url` und `download-put-back --url`.
- `Vorziehen`/`Zurückstellen` sind callback-fähig, damit Batch-Aktionen genau einmal am Ende die Queue aktualisieren.
- Versionssprung auf `0.3.39`; `metadata.json`, README, Checks und Plan angepasst. ATPlayer-Parität bleibt offen.

## 0.3.38

- ATPlayer-nahe Queue-Batch-Aktion **Markierte Downloads starten** im Warteschlangen-Menü ergänzt.
- Die Aktion nutzt die vorhandene sichtbare Queue-Auswahl und startet jeden markierten wartenden Eintrag über den bestehenden `download-run --url`-Pfad.
- Source- und Installationschecks schützen Label, Handler und Menüvertrag.
- Versionssprung auf `0.3.38`; `metadata.json`, README und Plan angepasst. ATPlayer-Parität bleibt offen.

## 0.3.37

- Linksklick-Pfad gehärtet: `on_applet_clicked(event)` akzeptiert defensiv nur Button 1 und öffnet das Popup-Menü deterministisch.
- Menüpunkt **Einstellungen** bleibt im Hauptmenü geschützt und öffnet weiter direkt `configureApplet()`.
- Source- und Installationschecks prüfen nun explizit den Linksklick-Kontrakt statt nur einen generischen Toggle.
- Versionssprung auf `0.3.37`; `metadata.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.36

- ATPlayer-nahe Menüaktionen **Filter ein-/ausblenden** und **Infos ein-/ausblenden** ergänzt.
- Sichtbarkeit von Filter- und Infobereich wird über Cinnamon-Settings persistiert und durch den Programm-Reset wieder aktiviert.
- Source- und Installationschecks schützen Labels, Handler, Reset-Defaults und neue Schema-Keys.
- Versionssprung auf `0.3.36`; `metadata.json`, `settings-schema.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.35

- ATPlayer-nahe History-Batch-Aktionen für markierte Treffer ergänzt: **Markierte als gesehen markieren** und **Markierte als ungesehen markieren**.
- Batch-Play nutzt jetzt eine echte Erfolgsmeldung aus dem URL-Öffnen statt impliziter Annahmen; History-Helper-Callbacks melden Erfolg/Fehler an die Batch-Zählung.
- Source- und Installationschecks schützen neue Labels und Handler.
- Versionssprung auf `0.3.35`; `metadata.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.34

- ATPlayer-nahe Bookmark-Batch-Aktionen für markierte Treffer ergänzt: **Markierte als Bookmarks anlegen** und **Markierte Bookmarks löschen**.
- Die Aktionen nutzen die bestehenden atomaren Helper `bookmark-add` und `bookmark-remove`; nach Abschluss werden Favoriten/Abschnitte aktualisiert.
- Source- und Installationschecks schützen neue Labels und Handler.
- Versionssprung auf `0.3.34`; `metadata.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.33

- Audio-Kontextmenüs näher an ATPlayer geführt: Einträge zeigen jetzt **Abspielen** und **Speichern** als direkte Aktionen; **Speichern** nutzt Java-frei die bestehende Download-Warteschlange.
- **Filminformation anzeigen** als ATPlayer-naher Alias auf die vorhandene kompakte Audioinformation ergänzt.
- Source- und Installationschecks schützen die neuen Audio-Kontextlabels.
- Versionssprung auf `0.3.33`; `metadata.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.32

- ATPlayer-nahe Queue-Aktion **Download starten** pro Warteschlangen-Eintrag ergänzt; der Helper kann mit `download-run --url URL` gezielt einen wartenden Eintrag starten.
- Queue-Menü um **Downloads aktualisieren** und **Liste der Downloads aufräumen** als direkte ATPlayer-nahe Bedienpfade erweitert, ohne die vorhandenen Labels zu entfernen.
- Source- und Installationschecks schützen die neuen Labels; `scripts/check.sh` testet `download-run` funktional gegen die lokale HTTP-Fixture inkl. `not-found` und `not-queued`.
- Versionssprung auf `0.3.32`; `metadata.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.31

- Trefferliste um ATPlayer-nahe Auswahl erweitert: **Alle Treffer auswählen**, **Treffer-Auswahl umkehren**, **Treffer-Auswahl zurücksetzen** und pro Treffer **Auswahl umschalten**.
- Batch-Aktionen ergänzt: **Alle markierten Audios abspielen** und **Markierte Audios speichern**; Speichern legt die markierten Audios Java-frei in die bestehende Download-Warteschlange.
- Source- und Installationschecks schützen Labels und Handler für die neue Treffer-Auswahl.
- Versionssprung auf `0.3.31`; `metadata.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.30

- ATPlayer-nahe Filteraktion **Bookmarks anzeigen** ergänzt.
- Der Toggle setzt den bestehenden `only-bookmarks`-Suchpfad, leert die übrigen Filter temporär und stellt beim zweiten Klick den vorherigen Filterzustand wieder her.
- Source- und Installationschecks schützen Label und Handler für den neuen Bookmark-Filterpfad.
- Versionssprung auf `0.3.30`; `metadata.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.29

- ATPlayer-nahe Verlauf-Aktionen ergänzt: Kontextmenüs bieten jetzt **Als gesehen markieren** und **Als ungesehen markieren**.
- Der Helper erhält die atomare Aktion `history-remove`, die einzelne History-Einträge URL-basiert entfernt.
- Source- und Installationschecks prüfen Linksklick/Einstellungen weiter und validieren die neuen History-Labels plus `history-remove` funktional.
- Versionssprung auf `0.3.29`; `metadata.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.28

- ATPlayer-nahe Bookmark-Aktionen ergänzt: Einträge bieten jetzt **Bookmarks löschen** zusätzlich zum Favoriten-Hinzufügen.
- Favoritenbereich erhält **Alle angelegten Bookmarks löschen** und der Helper die neue atomare Aktion `bookmark-clear`.
- Source- und Installationschecks prüfen neue Labels, Handler und `bookmark-clear` funktional.
- Versionssprung auf `0.3.28`; `metadata.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.27

- Audiokontext-Menüs um ATPlayer-nahe Aktion **Audio-URL kopieren** ergänzt.
- Die Aktion nutzt den bestehenden Clipboard-Helfer ohne Shellaufruf und ist in Treffer-, Verlauf-, Favoriten- und Queue-Kontexten verfügbar.
- Source- und Installationschecks schützen das neue Label.
- Versionssprung auf `0.3.27`; `metadata.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.26

- Blacklist-Dialog näher an ATPlayer-Tabellenbedienung gebracht: **Alles auswählen**, **Auswahl umkehren**, **Tabelle zurücksetzen** und **Gelöschte wieder anlegen** sind jetzt sichtbar.
- Aktivierte Blacklist-Regeln können per Zeilenaktivierung in das Formular übernommen und dort als neue/aktualisierte Regel gespeichert werden.
- `scripts/check.sh` und `scripts/validate-installed.sh` schützen Labels und Handler für die neuen Blacklist-Dialog-Workflows.
- Versionssprung auf `0.3.26`; `metadata.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.25

- Warteschlangen-Menü um ATPlayer-nahe Auswahlaktionen ergänzt: **Alles auswählen**, **Auswahl umkehren**, **Tabelle zurücksetzen**, **Ausgewählte Downloads stoppen** und **Ausgewählte aus Liste entfernen**.
- Queue-Zeilen erhalten **Auswahl umschalten** und zeigen den Auswahlzustand mit `[x]`/`[ ]` im Menüeintrag.
- Batch-Aktionen verwenden weiter die bestehenden URL-basierten Helper-Aktionen (`download-cancel`, `download-remove`) und bauen keinen neuen Backend-Pfad.
- `scripts/check.sh` schützt die neuen Queue-Selection-Labels, Handler und Auswahlmarker statisch ab.
- Versionssprung auf `0.3.25`; `metadata.json` und Dokumentation angepasst. ATPlayer-Parität bleibt offen.

## 0.3.24

- ATPlayer-kompatible Blacklist-Exklusion ergänzt: `!:` wirkt jetzt als Negationspräfix auf den Regelwerten (`sender`, `genre`, `topic`, `title`, `theme_title`) und wird pro Feld mit AND-Logik mit bestehenden gesetzten Feldern kombiniert.
- `topic`-Semantik bleibt: `topic_exact=true` erzwingt exakte Übereinstimmung, `topic_exact=false` Substring; bei `!:` wird das Match-Ergebnis invertiert.
- Regex-Prefixes `#:` (und die Kombination `!:#`) werden bei `blacklist-add` hart abgelehnt und liefern JSON-Fehler.
- Applet/Schema-Label für `blacklist-mode=only` wurde auf Whitelist/Invers-Wording umgestellt (`BL: Whitelist`).
- Hilfedialog ergänzt einen kurzen Hinweis zu `!:`/`#:`; `scripts/check.sh` und `scripts/validate-installed.sh` testen Negationsfelder für `genre/title/topic/theme_title` sowie Regex-Rejection.
- Versionssprung auf `0.3.24`; `metadata.json` und Dokumentation angepasst.

## 0.3.23

- Blacklist-Erweiterung um `theme_title` abgeschlossen: `atcinna-catalog` und Dialog speichern, listen, deduplizieren, `undo/clean/clear/remove` und Matching unterstützen jetzt das neue Feld.
- `theme_title` wird ATPlayer-artig als OR-Filter auf Thema oder Titel gematcht; bestehende gesetzte Felder (`sender`, `genre`, `topic`, `title`, `topic_exact`, `active`) werden mit UND-Logik kombiniert.
- `atcinna-blacklist-dialog` kann neue `themeTitle`-Regel per Formular erfassen und im Kontext-Menü wird die neue Blacklist-Aktion **„Thema oder Titel direkt in die Blacklist einfügen“** angeboten.
- `scripts/check.sh` und `scripts/validate-installed.sh` prüfen jetzt `--theme-title` in Blacklist-Add/Remove sowie Matching/Remove-Pfade.
- Versionssprung auf `0.3.23`, `metadata.json` und Dokumentation aktualisiert; Paritäts-Lücke: Whitelist/negatives Blacklist-Semantik ist weiterhin offen.

## 0.3.22

- ATPlayer-nahe Filter um `only_new` und dreistufiges `podcast_mode` (`all`, `only`, `none`) erweitert; beide Felder werden aus den echten Audiolisten-Feldern `JSON_AUDIO_NEW` und `JSON_AUDIO_PODCAST` gelesen.
- Applet-Settings, Filterprofile, externer Suchdialog, Filterprofil-Dialog, D-Bus-Status und Runtime-Smoke transportieren die neuen Filter.
- Lokale Checks und Installvalidierung prüfen `--only-new`, `--podcast-mode only` und `--podcast-mode none` funktional.
- ATPlayer-Parität bleibt weiter offen; Whitelist-/ThemeTitle-Blacklist-Details und weitere Tabellen-/Migrationsworkflows fehlen noch.

## 0.3.21

- 0.3.21 erweitert die ATPlayer-nahe Filterbasis um zusätzliche Felder (`title`, `theme_title`, `somewhere`, `max_days`, `min_duration`, `max_duration`, `only_bookmarks`, `hide_history`) und nimmt diese auch in den Filterprofil-Speicherpfad auf.
- Linksklick-Verhalten ist bestätigt: `on_applet_clicked()` bleibt als Toggle erhalten und der Menüpunkt **Einstellungen** öffnet weiterhin direkt die Applet-Einstellungen (`configureApplet()`).
- Die ATPlayer-Parität ist weiterhin nicht vollständig umgesetzt; insbesondere fehlen noch einige weitere ATPlayer-Oberflächen-/Workflow-Pfade (z. B. tiefere Playlist/Queue- und Migrationszustände sowie zusätzliche Settings-Komplexität).
- Paket- und Runtime-Dokumentation wurden für Version 0.3.21 angepasst.

## 0.3.20

- Erste ATPlayer-nahe Filterprofil-Verwaltung ergänzt: Profile speichern `search_query`, Sender-, Genre-, Thema-Filter, Blacklist-Modus und maximale Trefferzahl.
- Neue Helper-Aktionen `filter-profile-list/get/next-name/save/rename/remove/clear/reset/sort` mit Normalisierung, Deduplizierung und atomarem JSON-Store `filter-profiles.json`.
- Neues Applet-Untermenü **Filterprofile** zum Speichern aktueller Filter, Neuladen der Profilliste, Öffnen der Verwaltung und direktem Laden gespeicherter Profile.
- Neuer GTK-Dialog `atcinna-filter-profiles-dialog` für Laden, Neu, Überschreiben, Umbenennen, Löschen, Alle löschen, Sortieren und Standardprofile.
- D-Bus-Schnittstelle `ApplyFilterProfile` ergänzt, damit der externe Dialog Profile ins laufende Applet laden kann.
- Lokale Checks und Installvalidierung prüfen Helper-Aktionen, Dialog-Selbsttest, installierte Dialogdatei und funktionale Filterprofil-CRUD-Pfade.

## 0.3.19

- Blacklist-Ressourcen werden jetzt um ATPlayer-nahe Kern-Felder `active` (Standard: `true`) und `topic_exact` (Standard: `true`) normalisiert. Inaktive Regeln werden beim Suchen automatisch ignoriert.
- `blacklist-search`-Matching für `topic` ist jetzt abhängig von `topic_exact` (exakt oder Teiltreffer), während `sender`/`genre`/`title` weiterhin Teiltreffer bleiben.
- Neue Helper-Operationen:
  - `blacklist-undo` mit Deduplizierung gegen bestehende Regeln
  - `blacklist-clean` zum Entfernen leerer und doppelter Regeln
  - `blacklist-clear` zum vollständigen Entfernen aller Regeln
  - Alle drei Operationen persistieren entferntes Material in `blacklist-undo.json`.
- `blacklist-add` akzeptiert optionale Flags `--active` und `--topic-exact`; beim Hinzufügen werden identische Regeln per Sender/Genre/Topic/Title/Topic-Exact aktualisiert statt dupliziert.
- `blacklist-remove` kann mit optionalen Flags `--active` und `--topic-exact` gezielt einzelne Regelvarianten entfernen, bleibt ohne diese Flags aber kompatibel zum alten Feld-Matching.
- `atcinna-blacklist-dialog` wurde für ATPlayer-paritäres Verhalten erweitert: Anzeige von `active`/`topic_exact`, Hinzufügen neuer Regeln und sichere UI-Aktionen für Entfernen markierter Regeln, Undo, Putzen und Alles-Entfernen mit GTK-Abfrage.
- `scripts/check.sh` enthält neue statische Checks auf die neuen Helper-Flags/Actions sowie funktionale Checks für `active`/`topic_exact`, Undo/Clean/Clear und Dialog-Wiring.

## 0.3.18

- Neue optionale Blacklist-Verwaltung im Hilfe-Menü hinzugefügt: Menüpunkt **Blacklist verwalten**.
- Neuer GTK-Dialog `atcinna-blacklist-dialog` mit:
  - Self-Test (`--self-test`) für Helper-/GTK-Verfügbarkeit
  - Listenansicht vorhandener `blacklist-list`-Regeln
  - Entfernen ausgewählter Regeln über `blacklist-remove`
- Applet startet den Dialog über festen `Util.spawn`-Argumentpfad (`[this._blacklistDialogPath]`), bestehend aus optionaler UI in der Hilfe-/Programm-Fläche.
- Install-/Validierungs-Pipeline erweitert um neuen Dialog (ausführbar, `py_compile`, Self-Test, Paket-/Installationsartefakt).

## 0.3.17

- ATPlayer-ähnliches Hilfemenü ergänzt (unter "Hilfe") mit Aktionen:
  - Hilfedialog
  - Alle Programmeinstellungen zurücksetzen
  - Gibt's ein Update?
  - Über dieses Programm
- Der Reset setzt ATCinna-spezifische Einstellungen wieder auf Standardwerte:
  - `search-query`, `sender-filter`, `genre-filter`, `topic-filter`, `blacklist-mode`, `max-hits`
  - Sucheingabefeld im Popup wird ebenfalls auf Standard zurückgesetzt.
- "Hilfedialog" und "Über dieses Programm" nutzen den vorhandenen Info-Bereich im Popup zur Anzeige.
- "Gibt's ein Update?" zeigt sichere lokale Versions-/Pfadinformationen ohne Netzwerkzugriff.
- Lokale Checks ergänzt für das neue Hilfemenü, Reset-Handler und Update-/About-Wiring.

## 0.3.16

- Kontextmenü im Treffer-, Verlauf-, Favoriten- und Warteschlangenbereich um ein ATPlayer-artiges Untermenü **Filter** ergänzt.
- Neue Filteraktionen setzen bestehende Applet-Settings und aktualisieren automatisch die Trefferansicht:
  - `nach Sender filtern` → `sender-filter`
  - `nach Genre filtern` → `genre-filter`
  - `nach Thema filtern` → `topic-filter`
  - `nach Titel filtern` → `search-query`
  - `nach Sender und Thema filtern` → `sender-filter` + `topic-filter`
  - `nach Sender, und Titel filtern` → `sender-filter` + `search-query`
- Leere Metadaten führen zu klarer Statusmeldung und erzwingen keine leeren Filterwerte.
- Lokale Checks prüfen neue Filterlabels, Wiring-Aufrufe sowie die kombinierte Sender+Titel-Aktion auf `sender-filter` und `search-query`.

## 0.3.15

- ATPlayer-Queue-Aktion **„Download ändern“** ergänzt: Queue-Einträge können vor dem Start über einen optionalen GTK-Dialog bearbeitet werden.
- Neue Helper-Action `download-update --url URL` aktualisiert Titel, Zielordner, Sender, Genre, Thema, Datum, Uhrzeit, Dauer, Beschreibung und Website, blockiert laufende Downloads und erhält die Queue-Reihenfolge.
- Neuer Dialog `atcinna-queue-edit-dialog` arbeitet ohne Shell-Interpolation, bietet einen Headless-`--self-test` und wird in Install-/Paketvalidierung aufgenommen.
- Queue-Menü blendet „Download ändern“ pro Eintrag ein und deaktiviert die Aktion für laufende Downloads.
- Lokale Checks prüfen `download-update` inklusive Erfolgsfall, Reihenfolge, Pflichtfeldfehler, ungültigem Zielordner und laufender-Download-Blockierung.

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
