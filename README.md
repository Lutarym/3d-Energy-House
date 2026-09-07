# 3D Energy House

Drehbare 3D-Darstellung eines Einfamilienhauses fuer Home Assistant, mit Etagen, Dachform und Raumtemperaturen.

## Features

- 1 bis 5 Etagen, frei benennbar
- Vier Dachformen: Flachdach, Satteldach, Walmdach, Pultdach
- Grundriss-Bild als Vorlage, Raeume werden per Maus darauf aufgezogen
- Etagen und Dach einzeln ausblendbar
- Raeume nach Temperatur eingefaerbt
- Drehen per Maus, per Button oder automatisch, Zoom per Mausrad
- Transparenz stufenlos einstellbar
- Vollstaendiger visueller Editor

## Installation ueber HACS

1. HACS oeffnen
2. Custom repositories
3. Repository-URL eintragen, Kategorie: Dashboard
4. Installieren
5. Home Assistant neu starten

## Manuelle Installation

1. `house-3d-card.js` nach `/config/www/` kopieren
2. In `configuration.yaml`:

```yaml
frontend:
  extra_module_url:
    - /local/house-3d-card.js
```

3. Home Assistant neu starten

## Grundriss hinterlegen

1. Grundriss als PNG oder JPG nach `/config/www/` legen, zum Beispiel `/config/www/grundriss_eg.png`
2. Im Editor bei der jeweiligen Etage eintragen: `/local/grundriss_eg.png`
3. Hausbreite und Haustiefe in Metern setzen. Das Bild wird auf diese Flaeche gestreckt, es sollte also den Grundriss randlos zeigen.
4. Raeume mit dem Knopf "Raum" hinzufuegen und auf dem Bild an die richtige Stelle ziehen

Im Zeichenbereich gilt: Rechteck ziehen verschiebt den Raum, die blaue Ecke unten rechts skaliert ihn. Werte lassen sich darunter auch exakt eintippen.

## Koordinatensystem

- `x` laeuft von links nach rechts, `0` ist die linke Hauskante
- `z` laeuft von oben nach unten, `0` ist die obere Hauskante
- Alle Angaben in Metern

## Konfiguration

Die Karte hat einen visuellen Editor. Alternativ per YAML:

```yaml
type: custom:house-3d-card
title: Raumtemperaturen
opacity: 40
house:
  width: 12
  depth: 10
roof:
  type: gable      # flat, gable, hip, mono
  height: 3
  overhang: 0.4
  axis: x          # Firstrichtung bei gable und mono
floors:
  - name: Erdgeschoss
    height: 2.6
    floorplan: /local/grundriss_eg.png
    rooms:
      - name: Wohnzimmer
        x: 0
        z: 0
        w: 6
        d: 5
        temp_entity: sensor.temperatur_wohnzimmer
      - name: Kueche
        x: 6
        z: 0
        w: 6
        d: 5
        temp_entity: sensor.temperatur_kueche
  - name: Obergeschoss
    height: 2.5
    floorplan: /local/grundriss_og.png
    rooms:
      - name: Zimmer 1
        x: 0
        z: 0
        w: 6
        d: 6
        temp_entity: sensor.temperatur_zimmer1
```

### Optionen

| Option | Typ | Standard | Bedeutung |
|---|---|---|---|
| `title` | Text | leer | Ueberschrift der Karte |
| `opacity` | 5 bis 100 | 40 | Transparenz der Raeume in Prozent |
| `house.width` | 3 bis 40 | 12 | Hausbreite in m |
| `house.depth` | 3 bis 40 | 10 | Haustiefe in m |
| `roof.type` | flat, gable, hip, mono | gable | Dachform |
| `roof.height` | 0.2 bis 10 | 3 | Hoehe des Dachs in m |
| `roof.overhang` | 0 bis 2 | 0.4 | Dachueberstand in m |
| `roof.axis` | x, z | x | Firstrichtung bei Sattel- und Pultdach |
| `floors[].name` | Text | Etage | Bezeichnung |
| `floors[].height` | 1.5 bis 6 | 2.6 | Geschosshoehe in m |
| `floors[].floorplan` | Pfad | leer | Grundriss-Bild |
| `rooms[].x` `.z` | Zahl | 0 | Position der linken oberen Ecke in m |
| `rooms[].w` `.d` | Zahl | 3 | Breite und Tiefe in m |
| `rooms[].temp_entity` | Entity | leer | Temperaturquelle |

Bei `climate`-Entities wird das Attribut `current_temperature` verwendet, sonst der State.

## Farbskala

| Bereich | Farbe |
|---|---|
| bis 15 °C | blau |
| 15 bis 18 °C | hellblau |
| 18 bis 22 °C | gruen |
| 22 bis 25 °C | gelb |
| ab 25 °C | orange |
| kein Wert | grau |

## Bedienung

| Aktion | Wirkung |
|---|---|
| Ziehen mit der Maus | drehen, waagerecht und senkrecht |
| Pfeil-Buttons | schrittweise drehen |
| Auto | Dauerdrehung an und aus |
| Reset | Ansicht zuruecksetzen |
| Mausrad | zoomen |
| Klick auf einen Raum | Raum auswaehlen |
| Haken links | Etage oder Dach ausblenden |
| Schieberegler unten | Transparenz |

## Hinweis

Die Karte laedt Three.js zur Laufzeit von `unpkg.com`. Ohne Internetzugang im Browser erscheint eine Fehlermeldung im Kartenbereich.

## Lizenz

MIT
