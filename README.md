# ATCinna

ATCinna ist ein kleines Cinnamon-Applet für den schnellen Zugriff auf eine
ATPlayer-kompatible Audioliste. Es ist bewusst Java-frei und nutzt nur
GNOME/Cinnamon-UI-Elemente plus einen kleinen Python-Helper.

## Features

- Panel-Anzeige mit Icon/Label.
- Popup-Menü mit Statuszeile, Refresh-Knopf und Ergebnisliste.
- Suchabfrage aus Einstellungen (`search-query`).
- Play-Aktion über `xdg-open`.
- Website-Aktion (falls vorhanden).
- Download per sicherem Helper mit `curl` in konfigurierbaren Zielordner.

## Installation (lokal)

- Verzeichnis als Cinnamon-Applet in `~/.local/share/cinnamon/applets/atcinna@H234598` kopieren.
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
