# ATCinna

ATCinna ist ein kleines Cinnamon-Applet für den schnellen Zugriff auf eine
ATPlayer-kompatible Audioliste. Es ist bewusst Java-frei und nutzt nur
GNOME/Cinnamon-UI-Elemente plus einen kleinen Python-Helper.

## Features

- Panel-Anzeige mit Icon/Label.
- Popup-Menü mit Statuszeile, In-Popup-Suchfeld, Refresh-Knopf und Ergebnisliste.
- Linksklick auf das Applet schaltet das Popup-Menü (`on_applet_clicked` als Toggle); über den Menüpunkt **Einstellungen** wird direkt `configureApplet()` geöffnet.
- Popup-Aktion „Suche öffnen“ für den optionalen externen GTK-Suchdialog.
- Menüeintrag „Einstellungen“ für direktes Öffnen der Applet-Einstellungen.
- Hilfe-/Programm-Untermenü mit ATPlayer-nahen Aktionen:
  - Hilfedialog (Infos im Popup-Infobereich)
  - Alle Programmeinstellungen zurücksetzen
  - Gibt's ein Update?
  - Blacklist verwalten
  - Über dieses Programm
- Texteingaben in der Suchzeile werden entprellt (ca. 350 ms), Enter sucht sofort.
- Suchabfrage aus Einstellungen (`search-query`).
- Erweiterte Teiltreffer-Filter (`sender-filter`, `genre-filter`, `topic-filter`) im Popup mit kompaktem Status (`Filter: ...`) und Schnellaktion „Filter löschen“.
- ATPlayer-nahe Filtererweiterung (0.3.21): zusätzliche Felder `title`, `theme_title`, `somewhere`, `max_days`, `min_duration`, `max_duration`, `only_bookmarks`, `hide_history`.
- ATPlayer-nahe Filterprofile: Applet-Menü **Filterprofile** mit Speichern/Laden sowie GTK-Verwaltung fuer Neu, Überschreiben, Umbenennen, Löschen, Sortieren und Standardprofile.
- ATPlayer-Parität ist noch nicht vollständig; diese Filter- und Profil-Erweiterungen decken nur einen Teil der kompletten ATPlayer-Funktionalität ab.
- Blacklist-Modus (`blacklist-mode`) fuer Suche: aus, passende Treffer ausblenden oder nur Blacklist-Treffer anzeigen.
- Play-Aktion über `xdg-open`.
- Beim Abspielen eines Eintrags wird er zusätzlich im Verlauf gespeichert.
- Website-Aktion (falls vorhanden).
- Favoriten: Einträge können pro Treffer als Favorit gespeichert, in der Liste angezeigt und wieder entfernt werden.
- Unterhalb der Treffer werden zusätzlich die letzten Einträge aus dem Verlauf sowie Favoriten (je max. 5) als kompakte Untermenüs gezeigt.
- Download per sicherem Helper mit `curl` in konfigurierbaren Zielordner.
- Download-Warteschlange: Treffer können in eine FIFO-Warteschlange gelegt werden; das Menü kann den nächsten oder alle Downloads starten, alle Downloads stoppen, nur wartende Downloads stoppen, die Queue anzeigen, erledigte Einträge entfernen und gelöschte Einträge wiederherstellen.
- Warteschlange im Applet kann per Untermenü pro Eintrag bearbeitet werden: Download ändern, Download stoppen, Audio (URL) abspielen, Download (URL) kopieren, gespeichertes Audio (Datei) abspielen, gespeicherte Datei löschen, Zielordner öffnen, aus Liste entfernen, vorziehen und zurückstellen.
- Kontextmenüs in Treffer-, Verlauf-, Favoriten- und Warteschlange-Einträgen zeigen jetzt zusätzliche Metadatenaktion:
  "Audioinformation anzeigen", plus Kopieraktionen für Titel, Genre und Thema.
- Kontextmenüs in Treffer-, Verlauf-, Favoriten- und Warteschlange-Einträgen besitzen zusätzlich das Untermenü **Filter** mit filtern- und kombinierten Filteraktionen im ATPlayer-Stil:
  Sender, Genre, Thema, Titel, Sender+Thema sowie Sender+Titel.
- Kontextmenüs in Treffer-, Verlauf-, Favoriten- und Warteschlange-Einträgen bieten ATPlayer-ähnliche Blacklist-Aktionen fuer Audio, Sender/Genre/Thema, Sender/Thema, Thema und Titel.
- Das Script `atcinna@H234598/scripts/atcinna-search-dialog` nutzt `atcinna-catalog` als Backend und bietet Play-, Webseiten- und Download-Buttons mit sicheren Argumentlisten, wenn Python-GTK3 verfügbar ist.
- Das Script `atcinna@H234598/scripts/atcinna-blacklist-dialog` nutzt `atcinna-catalog` als Backend. Es listet Regeln inkl. `active`/`topic_exact`, erlaubt neue Regeln anzulegen und bietet sichere Aktionen für markierte Regel-Entfernung, Undo, Putzen leerer/doppelter Regeln und Komplett-Löschung mit GTK-Bestätigung.
- Das Script `atcinna@H234598/scripts/atcinna-queue-edit-dialog` bietet einen optionalen GTK-Dialog fuer **Download ändern** und nutzt `download-update` im Helper.
- Headless-Selbsttest für die Dialoge: `python3 atcinna@H234598/scripts/atcinna-search-dialog --self-test`, `python3 atcinna@H234598/scripts/atcinna-queue-edit-dialog --self-test`, `python3 atcinna@H234598/scripts/atcinna-blacklist-dialog --self-test` und `python3 atcinna@H234598/scripts/atcinna-filter-profiles-dialog --self-test` melden `gtk3: true/false`; das Applet bleibt auch ohne GTK3 über die interne Popup-Suche nutzbar.

## Installation (lokal)

- Für einen reproduzierbaren lokalen Installationslauf:
  - `./scripts/install-local.sh` (Standardziel: `~/.local/share/cinnamon/applets/atcinna@H234598`)
  - mit alternativer Basis: `./scripts/install-local.sh --target-dir <pfad>`
  - im Dry-Run: `./scripts/install-local.sh --dry-run --target-dir <pfad>`
  - optionale Installvalidierung nach erfolgreichem Kopiervorgang: `./scripts/validate-installed.sh --target-dir <pfad>`
- Paketierung (`0.3.21`): `./scripts/package.sh` erzeugt `dist/atcinna@H234598-<version>.tar.gz`.
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
