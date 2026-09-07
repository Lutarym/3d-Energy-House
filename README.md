# 3D Energy House

Drehbare 3D-Uebersicht der Raumtemperaturen fuer Home Assistant.

## Features

- 4 Raeume Erdgeschoss, 3 Raeume Obergeschoss
- Raeume sind durchsichtig, Innenraeume bleiben sichtbar
- Transparenz per Schieberegler einstellbar
- Drehen per Maus, per Button oder automatisch
- Zoom per Mausrad
- Farbe je nach Temperatur
- Raum anklicken zeigt Details

## Installation ueber HACS

1. HACS oeffnen
2. Custom repositories
3. URL eintragen, Category: Dashboard
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

## Konfiguration

```yaml
type: custom:house-3d-card
rooms:
  - name: Wohnzimmer
    temp_entity: sensor.DEINE_ENTITY
  - name: Kueche
    temp_entity: sensor.DEINE_ENTITY
  - name: Schlafzimmer
    temp_entity: sensor.DEINE_ENTITY
  - name: Bad
    temp_entity: sensor.DEINE_ENTITY
  - name: Zimmer 1
    temp_entity: sensor.DEINE_ENTITY
  - name: Zimmer 2
    temp_entity: sensor.DEINE_ENTITY
  - name: Flur OG
    temp_entity: sensor.DEINE_ENTITY
```

Die Reihenfolge bestimmt die Position im Haus. Die ersten vier Eintraege sind das Erdgeschoss, die letzten drei das Obergeschoss. `name` ist optional und ueberschreibt die Beschriftung.

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
| Ziehen mit Maus | drehen horizontal und vertikal |
| Pfeil-Buttons | schrittweise drehen |
| Auto | Dauerrotation an und aus |
| Mausrad | zoomen |
| Klick auf Raum | Raum auswaehlen |
| Schieberegler | Transparenz |

## Lizenz

MIT
