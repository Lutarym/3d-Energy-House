# 3D Energy House

Drehbare 3D-Darstellung eines Einfamilienhauses für Home Assistant, mit Etagen, Dachform, Raumtemperaturen, Luftfeuchtigkeit, Außentemperatur, Temperaturschwankung, Rückblick, offenen Fenstern, Sonnenstand, Energiefluss, Garten und Himmel nach Tageszeit.

## Funktionen

- 1 bis 5 Etagen, frei benennbar, einzeln ausblendbar
- Vier Dachformen: Flachdach, Satteldach, Walmdach, Pultdach
- Grundriss-Bild als Vorlage, Räume werden per Maus darauf aufgezogen
- Anbauten außerhalb des Hauptbaukörpers, etwa Carport oder Wintergarten
- Raumtypen frei wählbar, mit Vorschlägen und eigener Farbe
- Temperatur, Luftfeuchtigkeit, beides oder Schwankung als Anzeige
- Außentemperatur im Infofeld und als Tafel vor dem Haus
- Beschriftung flach auf dem Raumboden, dreht sich mit dem Haus
- Rückblick mit Schieberegler und Abspielen-Knopf
- Fünf Darstellungen im Menü umschaltbar: Puppenhaus, Wärmebild, Hologramm, Säulen und Klassisch
- Etagen per Knopf animiert auseinander- und zusammenfahren, feiner per Schieberegler
- Himmel nach Tageszeit mit ziehenden Wolken, Abendrot und Sternen
- Nachts warmes Licht in den Räumen und vor den Außenwänden
- Garten mit Rasen, Hecke und Bäumen, Weg zum Flur und Einfahrt zum Carport
- Offene Fenster und Türen markieren den Raum
- Nordpfeil, Sonne und Mond mit Phase passend zur Uhrzeit
- Energiefluss: PV-Module auf dem Dach, Wärmepumpe und Wallbox mit Live-Werten
- Haus wird automatisch mittig ausgerichtet und lässt sich jederzeit verschieben
- Menü links zum Aufklappen, ab Werk geschlossen
- Vollständiger visueller Editor

## Installation über HACS

1. HACS öffnen
2. Benutzerdefinierte Repositories
3. Repository-URL eintragen, Kategorie: Dashboard
4. Installieren
5. Browser neu laden

## Manuelle Installation

1. `house-3d-card.js` nach `/config/www/` kopieren
2. Bei den Dashboard-Ressourcen `/local/house-3d-card.js` mit dem Typ JavaScript-Modul eintragen
3. Home Assistant im Browser neu laden

Wichtig: Die Karte nur auf einem Weg einbinden. Ist sie zusätzlich über `extra_module_url` in der `configuration.yaml` eingetragen, bleibt die zuerst geladene Version aktiv. Die Karte meldet das in der Browser-Konsole mit beiden Versionsnummern. Welche Version läuft, steht oben im Editor.

## Bedienung

| Aktion | Wirkung |
|---|---|
| Menü oben links | Ansicht, Anzeigeart, Legende und Raumliste aufklappen |
| Ziehen mit der linken Maustaste oder einem Finger | drehen |
| Ziehen mit der rechten Maustaste | verschieben |
| Umschalt und Ziehen | verschieben |
| Zwei Finger | zoomen und verschieben |
| Knopf Verschieben | Ziehen verschiebt statt zu drehen, praktisch am Tablet |
| Mausrad | zoomen, nachdem ins Bild geklickt wurde |
| Strg und Mausrad | zoomen, jederzeit |
| Pfeil-Knöpfe | schrittweise drehen |
| Auto | Dauerdrehung an und aus |
| Zentrieren | Haus wieder mittig ausrichten |
| Klick auf einen Raum | Raum auswählen, Details rechts |
| Schieberegler unten | Transparenz |
| Etagen | fährt die Etagen animiert auseinander und wieder zusammen |
| Etagen auseinander im Menü | hebt Etagen und Dach stufenlos an |
| Darstellung im Menü | wechselt die Darstellung |

Das Mausrad zoomt erst nach einem Klick ins Bild. Sonst bliebe das Scrollen der Seite an der Karte hängen, sobald der Mauszeiger darüber liegt.

Solange weder verschoben noch gezoomt wurde, richtet sich das Haus bei jeder Größenänderung neu mittig aus. Dabei zählen auch Anbauten, die Tafel der Außentemperatur, der Nordpfeil sowie Geräte und Schilder des Energieflusses. Der Garten zählt nicht dazu.

## Anzeigearten

| Anzeige | Färbung | Beschriftung |
|---|---|---|
| Temp | nach Temperatur | Grad |
| Feuchte | nach Luftfeuchtigkeit | Prozent |
| Beides | nach Temperatur | beide Werte |
| Schwankung | nach Spanne | Spanne in Kelvin |

Welche Anzeige beim Öffnen gilt, legst du im Editor fest. Im Menü lässt sie sich jederzeit umschalten.

## Außentemperatur

Im Editor unter Außentemperatur einen Sensor oder eine Wetter-Entität eintragen. Der Wert erscheint oben im Infofeld und als Tafel flach vor dem Haus, eingefärbt nach der Temperaturskala. Die Tafel lässt sich im Menü einzeln ausblenden.

Bei `weather`-Entitäten wird das Attribut `temperature` verwendet. Wetter-Entitäten führen keine Langzeitstatistik, im Rückblick bleibt die Außentemperatur dann leer. Mit einem Sensor mit `state_class: measurement` funktioniert auch der Rückblick.

## Schwankung

Zeigt je Raum, wie stark die Temperatur im eingestellten Zeitraum geschwankt hat: die Spanne zwischen niedrigstem und höchstem Wert. Ab Werk sind es 24 Stunden, im Editor einstellbar, 0 schaltet die Funktion ab.

Grundlage sind die stündlichen Tiefst- und Höchstwerte der Langzeitstatistik plus der aktuelle Messwert. Im Rückblick gilt das Zeitfenster vor dem gewählten Zeitpunkt.

| Spanne | Farbe |
|---|---|
| bis 1 K | grün, stabil |
| 1 bis 2 K | hellgrün |
| 2 bis 3 K | gelb |
| 3 bis 4 K | orange |
| über 4 K | rot, unruhig |

Die Stufen sind eine Festlegung dieser Karte, keine Norm.

## Rückblick

Trägst du im Editor einen Zeitraum in Stunden ein, erscheint unten eine Leiste mit Schieberegler, Abspielen-Knopf, Zeitangabe und dem Knopf Jetzt. Das Haus zeigt dann die Werte des gewählten Zeitpunkts.

Anhaltspunkte: 24 entspricht einem Tag, 168 einer Woche, 720 einem Monat, 8760 einem Jahr. Ein Durchlauf beim Abspielen dauert höchstens etwa 30 Sekunden, bei langen Zeiträumen werden dafür Stunden übersprungen.

Grundlage sind die Stundenwerte der Langzeitstatistik, abgerufen über `recorder/statistics_during_period`. Sie bleiben dauerhaft erhalten, anders als die genauen Messwerte, die der Recorder nach `purge_keep_days` löscht, in der Voreinstellung nach 10 Tagen.

Voraussetzungen:

- Der Sensor führt eine Langzeitstatistik. Das tun Sensoren mit `state_class: measurement`.
- Der Sensor ist im Recorder nicht ausgeschlossen.

Fehlt etwas, nennt die Leiste den Grund.

## Darstellungen

Im Menü unter „Darstellung“ lässt sich jederzeit umschalten. Welche beim Öffnen gilt, legst du im Editor unter „Darstellung beim Öffnen“ fest.

| Darstellung | Aussehen |
|---|---|
| Puppenhaus | Echte Wände, halbhoch aufgeschnitten wie ein Modellhaus. Böden aus Holz, in Bad, Küche und Wirtschaftsraum Fliesen, in Garage und Carport Beton. Die Temperatur liegt als farbiger Schein auf dem Boden, das Haus wirft Schatten nach Sonnenstand. Standard. |
| Wärmebild | Wie eine Wärmebildkamera: Der Boden zeigt den Verlauf, zu den Nachbarräumen geht es weich über, warme Luft steigt als leuchtender Schleier auf. Räume ohne Sensor sind schraffiert. Die Legende zeigt den Farbverlauf. |
| Hologramm | Leuchtende Kanten, ein Raster am Boden und je Raum eine Lichtsäule, je wärmer desto höher, mit dem Wert darüber. Eine Scanebene wandert langsam auf und ab. |
| Säulen | Helle Tafeln je Raum, die Temperatur als farbige Säule mit Wert darüber, je wärmer desto höher, mit Schatten. |
| Klassisch | Die bisherige Darstellung mit durchscheinenden, farbigen Räumen. Nur hier erscheint das Grundriss-Bild. |

In allen Darstellungen gelten die Anzeigearten, die Farben der Legende, die Auswahl per Antippen und die rote Markierung offener Fenster. Der Schieberegler Transparenz steuert vor allem das Dach.

## Etagen auseinanderziehen

Der Knopf „Etagen“ oben fährt die Etagen weich auseinander, das Dach hebt ab und neben jeder Etage erscheint ihr Name. Ein zweiter Druck fährt sie wieder zusammen. Die Kamera folgt, solange du nicht selbst verschoben oder gezoomt hast.

Bei mehr als einer Etage steht im Menü der Schieberegler „Etagen auseinander“. Er hebt die oberen Etagen und das Dach an, bis zu 3,5 m zusätzlich je Etage. So werden die Räume darunter frei sichtbar. Räume lassen sich dabei weiter antippen.

## Offene Fenster und Türen

Je Raum lassen sich im Editor beliebig viele Kontakte hinterlegen, etwa `binary_sensor` mit der Geräteklasse Fenster, Tür, Garagentor oder Öffnung. Meldet einer davon `on`, also offen, werden die Kanten des Raumes rot. Die Beschriftung zeigt „Fenster offen“, „Tür offen“, „Tor offen“ oder bei mehreren die Anzahl. Die Raumliste zeigt einen roten Punkt, das Infofeld die Namen der offenen Kontakte.

Kontakte haben keine Langzeitstatistik. Im Rückblick erscheinen sie deshalb nicht.

## Nordpfeil, Sonne und Mond

Im Editor unter „Ausrichtung für Nordpfeil und Sonne“ angeben, in welche Himmelsrichtung die obere Kante des Grundrisses zeigt. Ein Nordpfeil liegt dann vorne links am Boden.

Die Sonne steht als gelbe Kugel am Himmel, berechnet aus Uhrzeit und dem Standort in den Einstellungen von Home Assistant, und beleuchtet das Haus aus dieser Richtung. Nachts ist sie ausgeblendet, das Haus bleibt trotzdem gut lesbar. Im Rückblick wandert sie mit der gewählten Stunde. Ist kein Standort hinterlegt, verwendet die Karte in der Live-Ansicht die Entität `sun.sun`.

Der Mond steht in seiner Himmelsrichtung und zeigt die aktuelle Phase, auf der Südhalbkugel gespiegelt. Ist er nachts über dem Horizont, kommt das schwache, kühle Nachtlicht aus seiner Richtung, bei Vollmond etwas heller. Der Mond braucht den Standort in den Einstellungen von Home Assistant.

Der Schalter „Sonne, Mond und Nordpfeil“ im Menü blendet alles davon aus.

## Himmel und Licht

Der Himmel wechselt mit der Sonnenhöhe zwischen Tag, Dämmerung und Nacht. Am Horizont ziehen Wolken langsam vorbei, mittags weiß, bei Sonnenuntergang rosa, nachts dunkel. Steht die Sonne tief, wird ihr Licht warm. In der Dämmerung erscheinen nach und nach die Sterne.

Ab Sonnenuntergang leuchten die Räume warm von innen, und vor den Außenwänden des Erdgeschosses fällt Licht auf den Boden. Garage, Carport und Abstellraum bleiben dunkel. Im Wärmebild und im Hologramm leuchten die Räume nicht zusätzlich, dort bleibt auch der Garten gedämpft, damit die Werte hervortreten.

Im Rückblick folgen Himmel, Mond und Licht der gewählten Stunde. Ohne Standort und ohne `sun.sun` bleibt der Himmel neutral dunkel, ohne Wolken und Sterne.

## Garten

Rund um das Haus liegt ein Grundstück mit Rasen und Hecke.

- Ein gepflasterter Weg führt zum Raum vom Typ Flur, an dessen erste Außenwand, geprüft in der Reihenfolge unten, rechts, links, oben im Grundriss. Ohne Flur mit Außenwand führt er an der unteren Seite zur Mitte des Hauses.
- Steht an dieser Stelle die Wärmepumpe oder die Wallbox, rückt der Weg an der Wand entlang zur Seite.
- Eine Einfahrt führt an die kurze Seite des Carports, ohne Carport an die der Garage. Ohne beides gibt es keine Einfahrt.
- Bis zu fünf Bäume stehen dort, wo Platz ist. Die Ecke unten rechts im Grundriss bleibt frei, von dort blickt die Standardansicht auf das Haus.
- Die Tafel der Außentemperatur weicht Weg und Einfahrt aus.

Der Schalter „Garten“ im Menü blendet Weg, Einfahrt, Hecke und Bäume aus. Der Boden wird dann zur ruhigen Fläche in der Farbe des Himmels.

## Energiefluss

Im Editor unter „Energiefluss“ Leistungssensoren für PV-Anlage, Wärmepumpe und Wallbox eintragen. Jeder ist freiwillig, angezeigt wird nur, was eingetragen ist.

- Auf welchen Dachflächen die PV-Module liegen, legst du im Editor unter „Dachflächen mit PV-Modulen“ fest. Die Knöpfe zeigen die Flächen deiner Dachform mit Himmelsrichtung, berechnet aus der Ausrichtung des Hauses. Mehrere Flächen sind möglich, etwa Ost und West. Beim Walmdach stehen alle vier Flächen zur Wahl, beim Pultdach die eine. Beim Flachdach werden die Module leicht zur gewählten Seite geneigt, bei mehreren Seiten nebeneinander.
- Ohne Auswahl liegen die Module auf der Fläche, die am meisten nach Süden zeigt, auf der Südhalbkugel nach Norden, beim Flachdach flach.
- Je mehr die Anlage liefert, desto heller leuchten die Module, gemessen an der eingetragenen Spitzenleistung.
- Die Außeneinheit der Wärmepumpe und die Wallbox stehen an der gewählten Seite des Hauses, bezogen auf den Grundriss im Editor. Steht an der Stelle ein Anbau, rückt das Gerät vor dessen Außenwand. „Auto“ stellt die Wallbox in den Carport, sonst in die Garage, gibt es beides nicht, rechts neben das Haus.
- Über den Modulen und jedem Gerät steht ein kleines Schild mit dem aktuellen Wert: PV, WP für die Wärmepumpe und Wallbox. Es dreht sich zum Betrachter und behält beim Zoomen seine Größe.
- Leitungen mit wandernden Punkten zeigen die Richtung: von den Modulen ins Haus, vom Haus zur Wärmepumpe und zur Wallbox. Mehr Leistung bedeutet schnellere Punkte. Unter 5 W ruht der Fluss und das Schild wird grau.
- Im Infofeld steht der Kasten „Energie“ mit allen Werten.

Die Einheit des Sensors wird berücksichtigt, etwa W oder kW. Im Rückblick erscheinen die Stundenmittel, sofern der Sensor eine Langzeitstatistik führt. Der Schalter „Energiefluss“ im Menü blendet alles davon aus. Ist das Dach ausgeblendet, verschwinden auch die Module und ihre Leitung.

## Grundriss hinterlegen

1. Grundriss als PNG oder JPG nach `/config/www/` legen, zum Beispiel `/config/www/grundriss_eg.png`
2. Im Editor bei der jeweiligen Etage eintragen: `/local/grundriss_eg.png`
3. Hausbreite und Haustiefe in Metern setzen. Das Bild wird auf diese Fläche gestreckt, es sollte den Grundriss also randlos zeigen.
4. Räume mit „+ Raum“ hinzufügen und auf dem Bild an die richtige Stelle ziehen

Rechteck ziehen verschiebt den Raum, die blaue Ecke unten rechts skaliert ihn. Werte lassen sich darunter auch exakt eintippen. Unter dem Zeichenbereich steht die Liste der Räume mit Knopf zum Löschen.

Raumnamen sind freiwillig. Ohne Namen zeigt die Karte „Raum 1“, „Raum 2“ und so weiter.

## Anbauten

„+ Anbau“ legt einen Raum neben dem Hauptbaukörper an, an der ersten freien Stelle rechts, unten, links oder oben. Der gestrichelte Rahmen im Zeichenbereich markiert den Hauptbaukörper. Liegt ein Raum weiter außen, wächst der Zeichenbereich mit. Das Dach deckt nur den Hauptbaukörper ab.

## Raumtypen

Freies Textfeld mit Vorschlägen. Räume ohne Sensor erscheinen in der Farbe ihres Typs, je Raum ist auch eine eigene Farbe möglich.

| Typ | Verwendung |
|---|---|
| Wohnraum | Standard |
| Flur | Verkehrsfläche |
| Treppenhaus | Treppe |
| Bad | Nassbereich |
| Küche | Küche |
| Wirtschaftsraum | Hauswirtschaft, Technik |
| Abstellraum | Lager |
| Garage | geschlossene Garage |
| Carport | offen, wird durchscheinender dargestellt |
| Anbau | Wintergarten, Anbau |

## Größe in der Abschnittsansicht

Ohne Angabe ist die Karte 620 Pixel hoch. Legst du in der Abschnittsansicht eine Zeilenzahl fest, füllt die Karte genau diese Fläche aus. Ist die Karte schmaler als 640 Pixel, rutscht das Infofeld unter das Bild.

## Konfiguration per YAML

```yaml
type: custom:house-3d-card
title: Raumklima
opacity: 40
display: temp          # temp, hum, both, fluct
style: dollhouse       # dollhouse, thermal, hologram, columns, classic
house:
  width: 12
  depth: 10
roof:
  type: gable          # flat, gable, hip, mono
  height: 3
  overhang: 0.4
  axis: x              # Firstrichtung bei gable und mono
outdoor:
  temp_entity: sensor.aussentemperatur
orientation:
  north: 0             # Himmelsrichtung der oberen Grundrisskante in Grad
energy:
  pv_entity: sensor.pv_leistung
  pv_peak: 10          # Spitzenleistung in kWp
  pv_faces: [bottom]   # Dachflächen mit Modulen: top, right, bottom, left
  heatpump_entity: sensor.waermepumpe_leistung
  heatpump_side: right # top, right, bottom, left
  wallbox_entity: sensor.wallbox_leistung
  wallbox_side: auto   # auto, top, right, bottom, left
fluctuation:
  hours: 24
history:
  hours: 168
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
        temp_entity: sensor.wohnzimmer_temperatur
        hum_entity: sensor.wohnzimmer_luftfeuchtigkeit
        contacts:
          - binary_sensor.fenster_wohnzimmer
          - binary_sensor.terrassentuer
      - name: Carport
        type: Carport
        x: 12.2
        z: 0
        w: 3
        d: 6
```

### Optionen

| Option | Werte | Standard | Bedeutung |
|---|---|---|---|
| `title` | Text | leer | Überschrift |
| `opacity` | 5 bis 100 | 40 | Transparenz der Räume in Prozent |
| `display` | temp, hum, both, fluct | temp | Anzeige beim Öffnen |
| `style` | dollhouse, thermal, hologram, columns, classic | dollhouse | Darstellung beim Öffnen: Puppenhaus, Wärmebild, Hologramm, Säulen, Klassisch |
| `house.width` | 3 bis 40 | 12 | Hausbreite in m |
| `house.depth` | 3 bis 40 | 10 | Haustiefe in m |
| `roof.type` | flat, gable, hip, mono | gable | Dachform |
| `roof.height` | 0.2 bis 10 | 3 | Dachhöhe in m |
| `roof.overhang` | 0 bis 2 | 0.4 | Dachüberstand in m |
| `roof.axis` | x, z | x | Firstrichtung |
| `outdoor.temp_entity` | Entität | leer | Außentemperatur |
| `orientation.north` | 0 bis 359 | 0 | Himmelsrichtung der oberen Grundrisskante: 0 Nord, 90 Ost, 180 Süd, 270 West |
| `energy.pv_entity` | Entität | leer | Leistung der PV-Anlage |
| `energy.pv_peak` | 0.1 bis 10000 | 10 | Spitzenleistung in kWp, bestimmt die Helligkeit der Module |
| `energy.pv_faces` | Liste aus top, right, bottom, left | leer | Dachflächen mit Modulen, benannt nach der Seite im Grundriss, zu der die Fläche abfällt. Leer: automatisch |
| `energy.heatpump_entity` | Entität | leer | Leistung der Wärmepumpe |
| `energy.heatpump_side` | top, right, bottom, left | right | Seite im Grundriss |
| `energy.wallbox_entity` | Entität | leer | Leistung der Wallbox |
| `energy.wallbox_side` | auto, top, right, bottom, left | auto | Seite im Grundriss, auto: Carport oder Garage |
| `fluctuation.hours` | 0 bis 8760 | 24 | Zeitraum der Schwankung, 0 schaltet ab |
| `history.hours` | 0 bis 26280 | 0 | Zeitraum des Rückblicks, 0 schaltet ab |
| `floors[].name` | Text | Etage | Bezeichnung |
| `floors[].height` | 1.5 bis 6 | 2.6 | Geschosshöhe in m |
| `floors[].floorplan` | Pfad | leer | Grundriss-Bild |
| `rooms[].name` | Text | leer | leer bedeutet Nummerierung |
| `rooms[].type` | Text | Wohnraum | Raumtyp |
| `rooms[].color` | #rrggbb | leer | eigene Farbe |
| `rooms[].x`, `rooms[].z` | Zahl | 0 | linke obere Ecke in m, negativ für Anbauten |
| `rooms[].w`, `rooms[].d` | Zahl | 3 | Breite und Tiefe in m |
| `rooms[].temp_entity` | Entität | leer | Temperatur |
| `rooms[].hum_entity` | Entität | leer | Luftfeuchtigkeit |
| `rooms[].contacts` | Liste von Entitäten | leer | Fenster- und Türkontakte |

Bei `climate`-Entitäten werden `current_temperature` und `current_humidity` verwendet, nicht der Sollwert.

## Farbskalen

| Temperatur | Farbe |
|---|---|
| bis 15 °C | blau |
| 15 bis 18 °C | hellblau |
| 18 bis 22 °C | grün |
| 22 bis 25 °C | gelb |
| über 25 °C | orange |

| Luftfeuchtigkeit | Farbe |
|---|---|
| bis 30 % | orange, trocken |
| 30 bis 40 % | hellgrün |
| 40 bis 60 % | grün |
| 60 bis 70 % | gelb |
| über 70 % | blau, feucht |

Zahlen erscheinen im Format deiner Spracheinstellung in Home Assistant.

## Technische Hinweise

- Three.js 0.160.0 wird zur Laufzeit von `unpkg.com` geladen, ersatzweise von `cdn.jsdelivr.net`. Ohne Internetzugang im Browser erscheint eine Fehlermeldung in der Karte.
- Gezeichnet wird nur, wenn sich etwas ändert. Ausnahmen sind die Dauerdrehung, ein laufender Energiefluss und die Scanebene im Hologramm, diese mit etwa 25 Bildern pro Sekunde. Alles davon pausiert außerhalb des sichtbaren Bereichs.
- Puppenhaus und Säulen berechnen Schatten, auch von Hecke und Bäumen. Auf sehr schwachen Geräten sind Wärmebild, Hologramm oder Klassisch sparsamer.
- Mondstand und Mondphase folgen den Formeln von Astronomy Answers (aa.quae.nl), wie sie auch die Bibliothek SunCalc verwendet.
- Wird die Karte länger als 15 Sekunden nicht angezeigt, gibt sie die 3D-Grafik frei. So stößt der Browser nicht an seine Grenze für gleichzeitige 3D-Ansichten.
- Der Editor verwendet eigene Eingabefelder und ist nicht auf interne Elemente von Home Assistant angewiesen.

## Lizenz

MIT
