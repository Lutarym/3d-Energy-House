# House 3D Card

Eine interaktive 3D-Visualisierung deines Hauses für Home Assistant.

## Features

- 3D-Darstellung mit 4 Räumen Erdgeschoss und 3 Räumen Obergeschoss
- Drehbare Kamera mit Buttons oder Maus
- Räume-Liste zum Auswählen (klickbar)
- Legende mit Farben
- Info-Panel mit Raumdetails
- Lichtkontrolle (An/Aus)
- Helligkeitsregler
- Temperaturanzeige
- Echtzeit-3D-Rendering mit Three.js
- Responsive Design

## Installation

### HACS
1. Gehe zu HACS
2. Klicke auf Custom repositories
3. Füge diese URL ein: `https://github.com/lutarym/house-3d-card`
4. Wähle Category: Lovelace

### Manuell
1. Lade die Datei `house-3d-card.js` herunter
2. Speichere sie unter `/config/www/house-3d-card.js`
3. Füge in `configuration.yaml` ein:

```yaml
frontend:
  extra_module_url:
    - /local/house-3d-card.js
```

4. Starte Home Assistant neu

## Verwendung

Im Dashboard (YAML):

```yaml
type: custom:house-3d-card
rooms:
  - name: Wohnzimmer
    temp_entity: sensor.temp_wohnzimmer
  - name: Küche
    temp_entity: sensor.temp_kueche
  - name: Schlafzimmer
    temp_entity: sensor.temp_schlafzimmer
  - name: Bad
    temp_entity: sensor.temp_bad
  - name: Zimmer 1
    temp_entity: sensor.temp_zimmer1
  - name: Zimmer 2
    temp_entity: sensor.temp_zimmer2
  - name: Flur OG
    temp_entity: sensor.temp_flur_og
```

Ersetze die Entity-Namen mit deinen tatsächlichen Sensoren.

## Bedienung

- **Buttons** (unten links): Ansicht drehen
- **Maus**: Klicken und ziehen zum Rotieren

## Räume

### Erdgeschoss (4 Räume)
- Wohnzimmer (rot)
- Küche (türkis)
- Schlafzimmer (gelb)
- Bad (hellgrün)

### Obergeschoss (3 Räume)
- Zimmer 1 (grün)
- Zimmer 2 (orange)
- Flur OG (pink)

## Anforderungen

- Home Assistant 2024.1+
- Modernes Browser mit WebGL-Unterstützung

## Lizenz

MIT

## Autor

Lutarym
