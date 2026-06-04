# ATCinna

ATCinna ist ein kleines Cinnamon-Applet für den schnellen Zugriff auf eine
ATPlayer-kompatible Audioliste. Es ist bewusst Java-frei und nutzt nur
GNOME/Cinnamon-UI-Elemente plus einen kleinen Python-Helper.

## Features

- Panel-Anzeige mit Icon/Label.
- Popup-Menü mit Statuszeile, In-Popup-Suchfeld, Refresh-Knopf und Ergebnisliste.
- Texteingaben in der Suchzeile werden entprellt (ca. 350 ms), Enter sucht sofort.
- Suchabfrage aus Einstellungen (`search-query`).
- Erweiterte Teiltreffer-Filter (`sender-filter`, `genre-filter`, `topic-filter`) im Popup mit kompaktem Status (`Filter: ...`) und Schnellaktion „Filter löschen“.
- Play-Aktion über `xdg-open`.
- Beim Abspielen eines Eintrags wird er zusätzlich im Verlauf gespeichert.
- Website-Aktion (falls vorhanden).
- Favoriten: Einträge können pro Treffer als Favorit gespeichert, in der Liste angezeigt und wieder entfernt werden.
- Unterhalb der Treffer werden zusätzlich die letzten Einträge aus dem Verlauf sowie Favoriten (je max. 5) als kompakte Untermenüs gezeigt.
- Download per sicherem Helper mit `curl` in konfigurierbaren Zielordner.

## Installation (lokal)

- Für einen reproduzierbaren lokalen Installationslauf:
  - `./scripts/install-local.sh` (Standardziel: `~/.local/share/cinnamon/applets/atcinna@H234598`)
  - mit alternativer Basis: `./scripts/install-local.sh --target-dir <pfad>`
  - im Dry-Run: `./scripts/install-local.sh --dry-run --target-dir <pfad>`
  - optionale Installvalidierung nach erfolgreichem Kopiervorgang: `./scripts/validate-installed.sh --target-dir <pfad>`
- Paketierung (`0.3.2`): `./scripts/package.sh` erzeugt `dist/atcinna@H234598-<version>.tar.gz`.

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
- Es werden keine Java- oder JavaFX-Abhängigkeiten genutzt.
