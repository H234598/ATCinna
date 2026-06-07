# ATCinna

ATCinna ist ein kleines Cinnamon-Applet für den schnellen Zugriff auf eine
ATPlayer-kompatible Audioliste. Es ist bewusst Java-frei und nutzt nur
GNOME/Cinnamon-UI-Elemente plus einen kleinen Python-Helper.

## Features

- Panel-Anzeige mit Icon/Label.
- Popup-Menü mit Statuszeile, In-Popup-Suchfeld, Refresh-Knopf und Ergebnisliste.
- Linksklick auf das Applet öffnet das Popup-Menü explizit über `on_applet_clicked(event)`; über den Menüpunkt **Einstellungen** wird direkt `configureApplet()` geöffnet.
- Popup-Aktion „Suche öffnen“ für den optionalen externen GTK-Suchdialog.
- Menüeintrag „Einstellungen“ für direktes Öffnen der Applet-Einstellungen.
- ATPlayer-nahe Umschaltung im Menü: **Filter ein-/ausblenden** und **Infos ein-/ausblenden**; beide Zustände werden in Cinnamon-Settings gespeichert.
- Hilfe-/Programm-Untermenü mit ATPlayer-nahen Aktionen:
  - Hilfedialog (Infos im Popup-Infobereich)
  - Anleitung im Web (führt auf die ATPlayer-Hilfeseite)
  - Alle Programmeinstellungen zurücksetzen
  - Gibt's ein Update?
  - Blacklist verwalten
  - Über dieses Programm
- Texteingaben in der Suchzeile werden entprellt (ca. 350 ms), Enter sucht sofort.
- Suchabfrage aus Einstellungen (`search-query`).
- Erweiterte Teiltreffer-Filter (`sender-filter`, `genre-filter`, `topic-filter`) im Popup mit kompaktem Status (`Filter: ...`), Schnellaktion „Filter löschen“ und ATPlayer-nahem **Bookmarks anzeigen**-Toggle.
- ATPlayer-nahe Filtererweiterung: zusätzliche Felder `title`, `theme_title`, `somewhere`, `max_days`, `min_duration`, `max_duration`, `only_new`, `only_bookmarks`, `hide_history` und dreistufiges `podcast_mode` (`all`, `only`, `none`).
- ATPlayer-nahe Filterprofile: Applet-Menü **Filterprofile** mit Speichern/Laden sowie GTK-Verwaltung fuer Neu, Überschreiben, Umbenennen, Löschen, Sortieren und Standardprofile.
- ATPlayer-Parität ist noch nicht vollständig; diese Filter- und Profil-Erweiterungen decken nur einen Teil der kompletten ATPlayer-Funktionalität ab.
- Blacklist-Modus (`blacklist-mode`) fuer Suche: aus, passende Treffer ausblenden oder nur Whitelist/Invers-Treffer anzeigen.
- Play-Aktion über `xdg-open`.
- Trefferliste mit ATPlayer-naher sichtbarer Auswahl: Treffer auswählen, Auswahl umkehren/zurücksetzen, alle markierten Audios abspielen, markierte Audios speichern (in die Download-Warteschlange legen), Filme als gesehen/ungesehen markieren, neue Bookmarks anlegen und Bookmarks löschen.
- Treffer-Untermenüs enthalten zusätzlich die Kontextaktion **Tabelle zurücksetzen**.
- Top-Level trefferbezogene ATPlayer-nähere Aktionen ergänzt: **Film abspielen**, **Film speichern**, **Filminformation anzeigen**, **Thema in die Zwischenablage kopieren**, **Titel in die Zwischenablage kopieren**, **Blacklist-Eintrag für den Film erstellen** und **Thema direkt in die Blacklist einfügen**.
- Die beiden neuen Top-Level-Blacklist-Aktionen verarbeiten den ersten markierten sichtbaren Treffer, melden **keine Auswahl** sowie **kein Thema** klar und verwenden weiterhin `blacklist-add` ohne Backend- oder Untermenüänderung.
- Beim Abspielen eines Eintrags wird er zusätzlich im Verlauf gespeichert; Kontextmenüs können Einträge über **Filme als gesehen markieren** direkt als gesehen markieren oder über **Filme als ungesehen markieren** wieder aus dem Verlauf entfernen.
- Website-Aktion (falls vorhanden).
- Favoriten/Bookmarks: Einträge können pro Treffer als Favorit gespeichert, aus den Kontexten wieder entfernt, in der Liste angezeigt und gesammelt über **Alle angelegten Bookmarks löschen** geleert werden.
- Unterhalb der Treffer werden zusätzlich die letzten Einträge aus dem Verlauf sowie Favoriten (je max. 5) als kompakte Untermenüs gezeigt.
- Audio-Kontextaktionen im ATPlayer-Stil: **Abspielen**, **Speichern** (legt in die Download-Warteschlange), **Filminformation anzeigen** und die bestehende kompakte **Audioinformation anzeigen**.
- Download per sicherem Helper mit `curl` in konfigurierbaren Zielordner.
- Download-Warteschlange: Treffer können in eine FIFO-Warteschlange gelegt werden; das Menü kann den nächsten, markierte oder alle Downloads starten, alle Downloads stoppen, nur wartende Downloads stoppen, die Queue anzeigen/aktualisieren, erledigte Einträge entfernen, die Liste der Downloads aufräumen und gelöschte Einträge wiederherstellen.
- Warteschlangen-Menü mit ATPlayer-nahen Auswahlaktionen für die sichtbare Queue-Liste: Alles auswählen, Auswahl umkehren, Tabelle zurücksetzen, Audio (URL) abspielen, gespeichertes Audio (Datei) abspielen, Download ändern, Download (URL) kopieren, Downloads starten, Downloads vorziehen/Downloads zurückstellen, Downloads stoppen und Downloads aus Liste entfernen.
- Warteschlange im Applet kann per Untermenü pro Eintrag bearbeitet werden: Download starten, Download ändern, Download stoppen, Audio (URL) abspielen, Download (URL) kopieren, gespeichertes Audio (Datei) abspielen, gespeicherte Datei löschen, Zielordner öffnen, Downloads aus Liste entfernen, Downloads vorziehen, Downloads zurückstellen und **Tabelle zurücksetzen**.
- Kontextmenüs in Treffer-, Verlauf-, Favoriten- und Warteschlange-Einträgen zeigen jetzt zusätzliche Metadatenaktion:
  "Audioinformation anzeigen", plus Kopieraktionen für Audio-URL, Titel, Genre und Thema.
- Kontextmenüs in Treffer-, Verlauf-, Favoriten- und Warteschlange-Einträgen besitzen zusätzlich das Untermenü **Filter** mit filtern- und kombinierten Filteraktionen im ATPlayer-Stil:
  Sender, Genre, Thema, Titel, Sender+Thema sowie Sender+Titel.
- Kontextmenüs in Treffer-, Verlauf-, Favoriten- und Warteschlange-Einträgen bieten ATPlayer-ähnliche Blacklist-Aktionen für Audio, Sender/Genre/Thema, Sender/Thema, Thema, Titel sowie das neue `theme_title`-Konstrukt „Thema oder Titel“.
- Blacklist-Regeln unterstützen das Negationspräfix `!:` (Ausschluss auf Feldebene). Das Regex-Präfix `#:` ist aus Sicherheitsgründen ausgeschlossen.
- Das Script `atcinna@H234598/scripts/atcinna-search-dialog` nutzt `atcinna-catalog` als Backend und bietet Play-, Webseiten- und Download-Buttons mit sicheren Argumentlisten, wenn Python-GTK3 verfügbar ist.
- Das Script `atcinna@H234598/scripts/atcinna-blacklist-dialog` nutzt `atcinna-catalog` als Backend. Es listet Regeln inkl. `active`/`topic_exact`/`theme_title`, erlaubt neue Regeln anzulegen, übernimmt eine aktivierte Regel ins Formular und bietet sichere Aktionen für Auswahl, markierte Regel-Entfernung, Gelöschte wieder anlegen, Putzen leerer/doppelter Regeln und Komplett-Löschung mit GTK-Bestätigung.
- Das Script `atcinna@H234598/scripts/atcinna-queue-edit-dialog` bietet einen optionalen GTK-Dialog fuer **Download ändern** und nutzt `download-update` im Helper.
- Headless-Selbsttest für die Dialoge: `python3 atcinna@H234598/scripts/atcinna-search-dialog --self-test`, `python3 atcinna@H234598/scripts/atcinna-queue-edit-dialog --self-test`, `python3 atcinna@H234598/scripts/atcinna-blacklist-dialog --self-test` und `python3 atcinna@H234598/scripts/atcinna-filter-profiles-dialog --self-test` melden `gtk3: true/false`; das Applet bleibt auch ohne GTK3 über die interne Popup-Suche nutzbar.

## Installation (lokal)

- Für einen reproduzierbaren lokalen Installationslauf:
  - `./scripts/install-local.sh` (Standardziel: `~/.local/share/cinnamon/applets/atcinna@H234598`)
  - mit alternativer Basis: `./scripts/install-local.sh --target-dir <pfad>`
  - im Dry-Run: `./scripts/install-local.sh --dry-run --target-dir <pfad>`
  - optionale Installvalidierung nach erfolgreichem Kopiervorgang: `./scripts/validate-installed.sh --target-dir <pfad>`
- Paketierung (`0.3.53`): `./scripts/package.sh` erzeugt `dist/atcinna@H234598-<version>.tar.gz`.
- Runtime-Smoke:
  - Nicht mutierend: `./scripts/runtime-smoke.sh`
  - Temporär aktivierend (mit automatischem Zurücksetzen): `./scripts/runtime-smoke.sh --activate-temporarily`
  - Timeout steuerbar: `./scripts/runtime-smoke.sh --timeout 25 --activate-temporarily`
  - In beiden Modi wird bei aktiver ATCinna-Instanz zusätzlich die interne
    D-Bus-Schnittstelle geprüft: `org.Cinnamon.Applets.ATCinna` mit den
    Methoden `Ping`, `GetStatus` und `ApplyFilterProfile`.

- Für manuelle Entwicklung kann das Applet auch direkt nach `~/.local/share/cinnamon/applets/atcinna@H234598` kopiert werden.
- Cinnamon Applets-Neuladen oder Neu-Anmeldung.
- Applet hinzufügen und Einstellungen setzen.

## Datenquelle

- `https://atlist.de/audios.xz`
- `https://p2atlist.de/audios.xz`
- `https://atlist.eu/audios.xz`

## Sicherheit

- Keine Shell-Interpolation: Helper nutzt `subprocess`-Aufrufe mit festen Argumentlisten.
- `xdg-open` und `curl` werden ebenfalls ohne Shell-String-Konkatentation aufgerufen.
- Suchergebnisse werden im Helper auf `http`/`https`-Audio-URLs gefiltert. Nicht vertrauenswürdige
  Website-URIs werden verworfen bzw. bereinigt.
- Es werden keine Java- oder JavaFX-Abhängigkeiten genutzt.
