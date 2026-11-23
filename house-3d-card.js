/*
 * 3D Energy House
 * Lovelace-Karte für Home Assistant: drehbares 3D-Haus mit Etagen und Dachform,
 * Temperatur, Luftfeuchtigkeit, Außentemperatur, Schwankung, Rückblick,
 * offenen Fenstern, Sonnenstand und Energiefluss.
 */

const VERSION = '4.1.0';
const CARD_TAG = 'house-3d-card';
const EDITOR_TAG = 'house-3d-card-editor';

// Three.js wird zur Laufzeit geladen. Ist der erste Server nicht erreichbar,
// wird der zweite versucht.
const THREE_URLS = [
  'https://unpkg.com/three@0.160.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'
];

const DEFAULT_THETA = Math.PI * 0.25;
const DEFAULT_PHI = Math.PI * 0.34;
const NO_VALUE = 0x8892a0;
const HOUR = 3600 * 1000;
const EXPLODE_GAP = 3.5;      // größter zusätzlicher Abstand zwischen zwei Etagen in m

const ROOF_TYPES = [
  { value: 'flat',  label: 'Flachdach' },
  { value: 'gable', label: 'Satteldach' },
  { value: 'hip',   label: 'Walmdach' },
  { value: 'mono',  label: 'Pultdach' }
];

// alias: frühere Schreibweisen, damit ältere Konfigurationen ihre Farbe behalten
const ROOM_TYPES = [
  { value: 'room',    label: 'Wohnraum',        color: 0x8892a0 },
  { value: 'hall',    label: 'Flur',            color: 0x6f7e8a },
  { value: 'stairs',  label: 'Treppenhaus',     color: 0xb0763f },
  { value: 'bath',    label: 'Bad',             color: 0x5f8fa6 },
  { value: 'kitchen', label: 'Küche',           color: 0x8a7f6a, alias: ['Kueche'] },
  { value: 'utility', label: 'Wirtschaftsraum', color: 0x68806c },
  { value: 'storage', label: 'Abstellraum',     color: 0x6b6b78 },
  { value: 'garage',  label: 'Garage',          color: 0x565660 },
  { value: 'carport', label: 'Carport',         color: 0x4f6470, open: true },
  { value: 'annex',   label: 'Anbau',           color: 0x7d6a8f }
];

const TEMP_SCALE = [
  { max: 15,       color: 0x2f6bff, label: 'bis 15 °C' },
  { max: 18,       color: 0x28c0e8, label: '15 bis 18 °C' },
  { max: 22,       color: 0x2ecc71, label: '18 bis 22 °C' },
  { max: 25,       color: 0xf1c40f, label: '22 bis 25 °C' },
  { max: Infinity, color: 0xe8582c, label: 'über 25 °C' }
];

const HUM_SCALE = [
  { max: 30,       color: 0xe8a33d, label: 'bis 30 %, trocken' },
  { max: 40,       color: 0x9ccc65, label: '30 bis 40 %' },
  { max: 60,       color: 0x2ecc71, label: '40 bis 60 %, gut' },
  { max: 70,       color: 0xf1c40f, label: '60 bis 70 %' },
  { max: Infinity, color: 0x3a7bd5, label: 'über 70 %, feucht' }
];

const FLUCT_SCALE = [
  { max: 1,        color: 0x2ecc71, label: 'bis 1 K, stabil' },
  { max: 2,        color: 0x9ccc65, label: '1 bis 2 K' },
  { max: 3,        color: 0xf1c40f, label: '2 bis 3 K' },
  { max: 4,        color: 0xe8a33d, label: '3 bis 4 K' },
  { max: Infinity, color: 0xe8582c, label: 'über 4 K, unruhig' }
];

const MODES = [
  { value: 'temp',  label: 'Temp' },
  { value: 'hum',   label: 'Feuchte' },
  { value: 'both',  label: 'Beides' },
  { value: 'fluct', label: 'Schwankung' }
];

const SENSOR_DOMAINS = {
  temp:    ['sensor', 'climate', 'number', 'input_number'],
  hum:     ['sensor', 'climate', 'number', 'input_number'],
  out:     ['sensor', 'weather', 'climate', 'number', 'input_number'],
  power:   ['sensor', 'number', 'input_number'],
  contact: ['binary_sensor']
};

const OPEN_COLOR = 0xff3b30;
const CONTACT_CLASSES = ['window', 'door', 'garage_door', 'opening'];

// Einheiten der Geräteklasse power in Home Assistant, umgerechnet in Watt
const POWER_FACTORS = { mW: 0.001, W: 1, kW: 1000, MW: 1e6, GW: 1e9, TW: 1e12 };
const FLOW_MIN_W = 5;          // darunter gilt ein Fluss als ruhend
const SIDES = [
  { value: 'top',    label: 'Oben' },
  { value: 'right',  label: 'Rechts' },
  { value: 'bottom', label: 'Unten' },
  { value: 'left',   label: 'Links' }
];
const ENERGY_ITEMS = [
  { key: 'pv', field: 'pv_entity',       label: 'PV',         color: 0xffc400 },
  { key: 'hp', field: 'heatpump_entity', label: 'Wärmepumpe', color: 0x4fc3f7 },
  { key: 'wb', field: 'wallbox_entity',  label: 'Wallbox',    color: 0x7ed957 }
];

// Gespeicherte Blickwinkel je Karte, damit ein Neuaufbau die Ansicht behält
const VIEW_STORE = new Map();

/* ========================== Hilfsfunktionen ========================== */

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort()
    .map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

function clampNum(v, min, max, fallback) {
  const n = parseFloat(v);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function hasValue(v) {
  return !(v === undefined || v === null || v === '' || isNaN(parseFloat(v)));
}

function toCss(n) {
  return '#' + (n >>> 0).toString(16).padStart(6, '0');
}

// Vom Benutzer eingegebene Texte landen in HTML und werden deshalb maskiert
function esc(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scaleColor(scale, v) {
  if (!hasValue(v)) return null;
  const n = parseFloat(v);
  for (const s of scale) if (n <= s.max) return s.color;
  return scale[scale.length - 1].color;
}

function tempColorHex(v) {
  const c = scaleColor(TEMP_SCALE, v);
  return c === null ? NO_VALUE : c;
}

function humColorHex(v) {
  return scaleColor(HUM_SCALE, v);
}

function fluctColorHex(v) {
  return scaleColor(FLUCT_SCALE, v);
}

function findRoomType(type) {
  const t = String(type || '').trim().toLowerCase();
  if (!t) return null;
  return ROOM_TYPES.find((r) => r.value === t || r.label.toLowerCase() === t ||
    (r.alias || []).some((a) => a.toLowerCase() === t)) || null;
}

function roomTypeColor(type) {
  const t = findRoomType(type);
  return t ? t.color : NO_VALUE;
}

function roomTypeLabel(type) {
  const t = findRoomType(type);
  if (t) return t.label;
  const own = String(type || '').trim();
  return own !== '' ? own : 'Wohnraum';
}

// Offene Bauteile wie der Carport haben keine geschlossenen Wände
function roomTypeIsOpen(type) {
  const t = findRoomType(type);
  return !!(t && t.open);
}

// Eigene Farbe hat Vorrang, sonst die des bekannten Typs
function roomColor(room) {
  if (room && typeof room.color === 'string' && /^#[0-9a-f]{6}$/i.test(room.color)) {
    return parseInt(room.color.slice(1), 16);
  }
  return roomTypeColor(room && room.type);
}

function displayName(room, index) {
  const nm = String((room && room.name) || '').trim();
  return nm !== '' ? nm : 'Raum ' + (index + 1);
}

function domainOf(id) {
  return String(id || '').split('.')[0];
}

// Temperatur einer Entität: climate liefert sie als Attribut, weather ebenso,
// sonst steht sie im Zustand
function readTemp(id, st) {
  if (!st) return undefined;
  const a = st.attributes || {};
  if (a.current_temperature !== undefined && a.current_temperature !== null) return a.current_temperature;
  if (domainOf(id) === 'weather') return a.temperature;
  return st.state;
}

function readHum(id, st) {
  if (!st) return undefined;
  const a = st.attributes || {};
  if (a.current_humidity !== undefined && a.current_humidity !== null) return a.current_humidity;
  if (domainOf(id) === 'weather') return a.humidity;
  return st.state;
}

// Passt eine Entität zur gesuchten Messgröße? Grundlage für die Vorschlagslisten.
function matchesKind(kind, id, st) {
  const dom = domainOf(id);
  if (SENSOR_DOMAINS[kind].indexOf(dom) < 0) return false;
  const a = (st && st.attributes) || {};
  if (kind === 'contact') return CONTACT_CLASSES.indexOf(String(a.device_class || '')) >= 0;
  if (dom === 'weather') return kind === 'out';
  if (dom === 'climate') return kind === 'hum' ? a.current_humidity !== undefined : a.current_temperature !== undefined;
  const unit = String(a.unit_of_measurement || '');
  const dc = String(a.device_class || '');
  if (kind === 'hum') {
    return dc === 'humidity' || (unit === '%' && /feucht|humid/i.test(id + ' ' + (a.friendly_name || '')));
  }
  if (kind === 'power') return dc === 'power' || POWER_FACTORS[unit] !== undefined;
  return dc === 'temperature' || unit === '°C' || unit === '°F' || unit === 'K';
}

/* ========================== Sonnenstand ========================== */

// Vereinfachtes Verfahren des U.S. Naval Observatory. Abweichung unter einem
// Grad, für die Darstellung mehr als ausreichend. Azimut im Uhrzeigersinn ab Norden.
function sunPosition(ms, lat, lon) {
  const rad = Math.PI / 180;
  const d = ms / 86400000 - 10957.5;                 // Tage seit 1.1.2000, 12 Uhr Weltzeit
  const g = (357.529 + 0.98560028 * d) * rad;        // mittlere Anomalie
  const q = 280.459 + 0.98564736 * d;                // mittlere Länge
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;         // Schiefe der Ekliptik
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const H = (gmst * 15 + lon) * rad - ra;            // Stundenwinkel
  const phi = lat * rad;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  return { azimuth: ((az / rad) % 360 + 360) % 360, elevation: el / rad };
}

// Richtung im Modell zu einer Himmelsrichtung. north ist die Himmelsrichtung der
// oberen Grundrisskante: 0 Nord, 90 Ost, 180 Süd, 270 West.
function compassToScene(azimuthDeg, elevationDeg, north) {
  const rad = Math.PI / 180;
  const a = (azimuthDeg - north) * rad;
  const el = (elevationDeg || 0) * rad;
  return { x: Math.cos(el) * Math.sin(a), y: Math.sin(el), z: -Math.cos(el) * Math.cos(a) };
}

function makeCompassTexture(THREE) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  if (ctx) {
    const c = 128;
    ctx.clearRect(0, 0, 256, 256);
    ctx.beginPath();
    ctx.arc(c, c, 104, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(13,15,20,0.85)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#5d6675';
    ctx.stroke();
    // Nadel: Norden rot, Süden grau
    ctx.beginPath();
    ctx.moveTo(c, c - 78); ctx.lineTo(c + 16, c); ctx.lineTo(c - 16, c); ctx.closePath();
    ctx.fillStyle = '#ff5a4f';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(c, c + 78); ctx.lineTo(c + 16, c); ctx.lineTo(c - 16, c); ctx.closePath();
    ctx.fillStyle = '#9aa3b2';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 34px sans-serif';
    ctx.fillStyle = '#ff5a4f';
    ctx.fillText('N', c, 22);
    ctx.fillStyle = '#c8cfdb';
    ctx.font = '700 26px sans-serif';
    ctx.fillText('S', c, 234);
    ctx.fillText('O', 234, c);
    ctx.fillText('W', 22, c);
  }
  return canvasTexture(THREE, cv);
}

/* ========================== Zahlenformat ========================== */

// Zahlen im Format der Sprach- und Zahleneinstellung des Benutzers
function resolveLocale(hass) {
  const loc = hass && hass.locale;
  const lang = (loc && loc.language) || (hass && hass.language) || 'de';
  switch (loc && loc.number_format) {
    case 'comma_decimal': return 'en-US';
    case 'decimal_comma': return 'de';
    case 'space_comma': return 'fr';
    case 'system': return undefined;
    default: return lang;
  }
}

class Fmt {
  constructor(locale) {
    this.locale = locale;
    this.cache = {};
  }

  nf(min, max) {
    const k = min + ':' + max;
    if (!this.cache[k]) {
      const opt = { minimumFractionDigits: min, maximumFractionDigits: max };
      try {
        this.cache[k] = new Intl.NumberFormat(this.locale, opt);
      } catch (e) {
        this.cache[k] = new Intl.NumberFormat('de', opt);
      }
    }
    return this.cache[k];
  }

  num(v, min, max) {
    if (!hasValue(v)) return '--';
    return this.nf(min, max === undefined ? min : max).format(parseFloat(v));
  }

  temp(v)   { return this.num(v, 1); }
  hum(v)    { return this.num(v, 0); }
  kelvin(v) { return this.num(v, 1); }
  dim(v)    { return this.num(v, 0, 2); }

  // 850 W, ab 1000 W in kW mit einer Nachkommastelle
  power(w) {
    if (!hasValue(w)) return '--';
    const v = parseFloat(w);
    const a = Math.abs(v);
    if (Math.round(a) >= 1e6) return this.num(v / 1e6, 2) + ' MW';
    if (Math.round(a) >= 1000) return this.num(v / 1000, 1) + ' kW';
    return this.num(v, 0) + ' W';
  }

  time(ms) {
    const opt = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };
    try {
      return new Date(ms).toLocaleString(this.locale, opt);
    } catch (e) {
      return new Date(ms).toLocaleString('de-DE', opt);
    }
  }
}

const FMT_CACHE = new Map();

function fmtFor(hass) {
  const loc = resolveLocale(hass);
  const key = String(loc);
  if (!FMT_CACHE.has(key)) FMT_CACHE.set(key, new Fmt(loc));
  return FMT_CACHE.get(key);
}

/* ========================== Konfiguration ========================== */

const DEFAULT_CONFIG = () => ({
  type: 'custom:house-3d-card',
  title: '',
  opacity: 40,
  display: 'temp',
  house: { width: 12, depth: 10 },
  roof: { type: 'gable', height: 3, overhang: 0.4, axis: 'x' },
  outdoor: { temp_entity: '' },
  orientation: { north: 0 },
  energy: { pv_entity: '', pv_peak: 10, heatpump_entity: '', heatpump_side: 'right', wallbox_entity: '', wallbox_side: 'auto' },
  fluctuation: { hours: 24 },
  history: { hours: 0 },
  floors: [
    { name: 'Erdgeschoss', height: 2.6, floorplan: '', rooms: [] }
  ]
});

function cleanEntity(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function cleanList(v) {
  const arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',') : []);
  return arr.filter((x) => typeof x === 'string').map((x) => x.trim()).filter((x, i, a) => x && a.indexOf(x) === i);
}

// binary_sensor: on bedeutet offen. Abdeckungen wie Garagentore melden open.
function contactIsOpen(st) {
  return !!st && (st.state === 'on' || st.state === 'open' || st.state === 'opening');
}

function contactText(open, states) {
  if (!open.length) return '';
  if (open.length > 1) return open.length + ' offen';
  const st = states && states[open[0]];
  const dc = String((st && st.attributes && st.attributes.device_class) || '');
  if (dc === 'window') return 'Fenster offen';
  if (dc === 'door') return 'Tür offen';
  if (dc === 'garage_door') return 'Tor offen';
  return 'offen';
}

// Leistung in Watt. Ohne Einheit wird Watt angenommen.
function toWatts(v, unit) {
  if (!hasValue(v)) return undefined;
  const f = POWER_FACTORS[String(unit === undefined || unit === null ? 'W' : unit).trim()];
  return parseFloat(v) * (f === undefined ? 1 : f);
}

function readPower(st) {
  if (!st) return undefined;
  return toWatts(st.state, st.attributes && st.attributes.unit_of_measurement);
}

// Mischfarbe zwischen a und b, t von 0 bis 1
function mixColor(a, b, t) {
  const k = clamp(t, 0, 1);
  const ch = (c, sh) => (c >> sh) & 255;
  const m = (sh) => Math.round(ch(a, sh) + (ch(b, sh) - ch(a, sh)) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

// Bereinigte Fassung für die Karte. Ungültige Werte werden ersetzt statt abzustürzen.
function normalizeCardConfig(config) {
  const c = (config && typeof config === 'object') ? config : {};
  const house = c.house || {};
  const roof = c.roof || {};
  const flHours = Math.round(clampNum(c.fluctuation && c.fluctuation.hours, 0, 8760, 24));
  const en = (c.energy && typeof c.energy === 'object') ? c.energy : {};
  const isSide = (v) => SIDES.some((x) => x.value === v);
  let display = MODES.some((m) => m.value === c.display) ? c.display : 'temp';
  if (display === 'fluct' && !flHours) display = 'temp';

  const floors = (Array.isArray(c.floors) && c.floors.length ? c.floors : DEFAULT_CONFIG().floors)
    .map((f) => f || {})
    .map((f) => ({
      name: typeof f.name === 'string' && f.name.trim() !== '' ? f.name : 'Etage',
      height: clampNum(f.height, 1.5, 6, 2.6),
      floorplan: typeof f.floorplan === 'string' ? f.floorplan.trim() : '',
      rooms: (Array.isArray(f.rooms) ? f.rooms : []).filter((r) => r && typeof r === 'object').map((r) => ({
        name: typeof r.name === 'string' ? r.name : '',
        type: typeof r.type === 'string' && r.type.trim() !== '' ? r.type.trim() : 'room',
        color: (typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color)) ? r.color : undefined,
        x: clampNum(r.x, -60, 60, 0),
        z: clampNum(r.z, -60, 60, 0),
        w: clampNum(r.w, 0.5, 60, 3),
        d: clampNum(r.d, 0.5, 60, 3),
        temp_entity: cleanEntity(r.temp_entity),
        hum_entity: cleanEntity(r.hum_entity),
        contacts: cleanList(r.contacts)
      }))
    }));

  return {
    title: typeof c.title === 'string' ? c.title : '',
    opacity: clampNum(c.opacity, 5, 100, 40),
    display: display,
    // Nur wenn der Benutzer in der Abschnittsansicht eine Zeilenzahl festlegt,
    // gibt Home Assistant eine feste Höhe vor. Dann füllt die Karte diese aus.
    fill: !!(c.grid_options && typeof c.grid_options.rows === 'number'),
    house: {
      width: clampNum(house.width, 3, 40, 12),
      depth: clampNum(house.depth, 3, 40, 10)
    },
    roof: {
      type: ROOF_TYPES.some((r) => r.value === roof.type) ? roof.type : 'gable',
      height: clampNum(roof.height, 0.2, 10, 3),
      overhang: clampNum(roof.overhang, 0, 2, 0.4),
      axis: roof.axis === 'z' ? 'z' : 'x'
    },
    outdoor: { temp_entity: cleanEntity(c.outdoor && c.outdoor.temp_entity) },
    orientation: { north: ((clampNum(c.orientation && c.orientation.north, -3600, 3600, 0) % 360) + 360) % 360 },
    energy: {
      pv_entity: cleanEntity(en.pv_entity),
      pv_peak: clampNum(en.pv_peak, 0.1, 10000, 10),
      heatpump_entity: cleanEntity(en.heatpump_entity),
      heatpump_side: isSide(en.heatpump_side) ? en.heatpump_side : 'right',
      wallbox_entity: cleanEntity(en.wallbox_entity),
      wallbox_side: (en.wallbox_side === 'auto' || isSide(en.wallbox_side)) ? en.wallbox_side : 'auto'
    },
    fluctuation: { hours: flHours },
    history: { hours: Math.round(clampNum(c.history && c.history.hours, 0, 26280, 0)) },
    floors: floors
  };
}

/* ========================== Dach-Geometrie ========================== */

function buildRoofGeometry(THREE, type, W, D, H) {
  if (type === 'flat') {
    return new THREE.BoxGeometry(W, 0.3, D);
  }

  const hw = W / 2, hd = D / 2;
  const positions = [];

  const tri = (a, b, c) => { positions.push(...a, ...b, ...c); };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };

  if (type === 'gable') {
    const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], Dp = [-hw, 0, hd];
    const R1 = [-hw, H, 0], R2 = [hw, H, 0];
    quad(A, B, R2, R1);
    quad(C, Dp, R1, R2);
    tri(A, R1, Dp);
    tri(B, C, R2);
    quad(A, Dp, C, B);
  } else if (type === 'hip') {
    const inset = Math.min(hw * 0.6, hd);
    const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], Dp = [-hw, 0, hd];
    const R1 = [-hw + inset, H, 0], R2 = [hw - inset, H, 0];
    quad(A, B, R2, R1);
    quad(C, Dp, R1, R2);
    tri(A, R1, Dp);
    tri(B, C, R2);
    quad(A, Dp, C, B);
  } else if (type === 'mono') {
    const A  = [-hw, 0, -hd], B  = [hw, 0, -hd];
    const C0 = [ hw, 0,  hd], D0 = [-hw, 0, hd];
    const C1 = [ hw, H,  hd], D1 = [-hw, H, hd];
    quad(A, B, C1, D1);
    quad(D0, C0, C1, D1);
    tri(A, D0, D1);
    tri(B, C1, C0);
    quad(A, D0, C0, B);
  } else {
    return new THREE.BoxGeometry(W, 0.3, D);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/* ========================== Texturen ========================== */

function canvasTexture(THREE, cv) {
  const tex = new THREE.CanvasTexture(cv);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function textWidth(ctx, text) {
  if (typeof ctx.measureText !== 'function') return 0;
  const m = ctx.measureText(text);
  return (m && typeof m.width === 'number') ? m.width : 0;
}

// Schrift verkleinern, bis der Text in die Breite passt
function fitFont(ctx, text, size, weight, maxW) {
  let s = size;
  ctx.font = weight + ' ' + s + 'px sans-serif';
  while (textWidth(ctx, text) > maxW && s > 20) {
    s -= 2;
    ctx.font = weight + ' ' + s + 'px sans-serif';
  }
  return s;
}

// Raumbeschriftung: Name plus bis zu zwei Wertezeilen, weiß mit dunkler Kontur
function makeLabelTexture(THREE, name, lines) {
  const rows = (lines || []).filter((l) => l);
  const cv = document.createElement('canvas');
  const W = 512;
  const H = 96 + rows.length * 76;
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const draw = (text, y, size, color) => {
      const s = fitFont(ctx, text, size, '700', W - 24);
      ctx.lineWidth = Math.max(2, Math.round(s / 5));
      ctx.strokeStyle = 'rgba(10,12,16,0.85)';
      ctx.lineJoin = 'round';
      ctx.strokeText(text, W / 2, y);
      ctx.fillStyle = color;
      ctx.fillText(text, W / 2, y);
    };
    draw(name, 50, 60, '#ffffff');
    rows.forEach((t, i) => {
      const alert = t.charAt(0) === '!';
      draw(alert ? t.slice(1) : t, 110 + i * 76, 62, alert ? '#ff5a4f' : '#ffffff');
    });
  }

  return { texture: canvasTexture(THREE, cv), aspect: W / H };
}

// Tafel für die Außentemperatur: dunkler Grund, Rahmen und Wert in der Temperaturfarbe
function makeBadgeTexture(THREE, title, value, colorHex) {
  const cv = document.createElement('canvas');
  const W = 512, H = 240;
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  if (ctx) {
    const col = toCss(colorHex);
    const r = 36, p = 8;
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.moveTo(p + r, p);
    ctx.lineTo(W - p - r, p);
    ctx.arcTo(W - p, p, W - p, p + r, r);
    ctx.lineTo(W - p, H - p - r);
    ctx.arcTo(W - p, H - p, W - p - r, H - p, r);
    ctx.lineTo(p + r, H - p);
    ctx.arcTo(p, H - p, p, H - p - r, r);
    ctx.lineTo(p, p + r);
    ctx.arcTo(p, p, p + r, p, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(13,15,20,0.9)';
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = col;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c8cfdb';
    fitFont(ctx, title, 52, '600', W - 60);
    ctx.fillText(title, W / 2, 72);
    ctx.fillStyle = col;
    fitFont(ctx, value, 96, '700', W - 60);
    ctx.fillText(value, W / 2, 160);
  }

  return { texture: canvasTexture(THREE, cv), aspect: W / H };
}

// Ein Modul aus 4 mal 8 Zellen, wird über die Fläche wiederholt
function makePanelTexture(THREE) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1d3a6e';
    ctx.fillRect(0, 0, 128, 256);
    ctx.strokeStyle = '#5d7fb8';
    ctx.lineWidth = 2;
    for (let x = 32; x < 128; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke(); }
    for (let y = 32; y < 256; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke(); }
    ctx.strokeStyle = '#c8d2e6';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, 128, 256);
  }
  return canvasTexture(THREE, cv);
}

/* ========================== Three.js laden ========================== */

// Einmal je Seite laden, auch wenn mehrere Karten gleichzeitig starten
function loadThreeModule() {
  if (window.__house3dThree) return Promise.resolve(window.__house3dThree);
  if (!window.__house3dThreeLoading) {
    window.__house3dThreeLoading = (async () => {
      let lastErr = null;
      for (const url of THREE_URLS) {
        try {
          const mod = await import(url);
          window.__house3dThree = mod;
          return mod;
        } catch (e) {
          lastErr = e;
        }
      }
      window.__house3dThreeLoading = null;
      throw lastErr || new Error('unbekannter Fehler');
    })();
  }
  return window.__house3dThreeLoading;
}

/* ========================== Darstellung ========================== */

// Alle Regeln beginnen mit dem Tag der Karte und wirken nur innerhalb der Karte
const CARD_CSS = `
house-3d-card { display: block; }
house-3d-card.h3d-fill { height: 100%; }
house-3d-card ha-card { overflow: hidden; display: flex; flex-direction: column; }
house-3d-card.h3d-fill ha-card { height: 100%; }
house-3d-card .h3d-title { padding: 14px 16px 10px; font-size: 16px; font-weight: 600; }
house-3d-card .h3d-root { position: relative; display: flex; height: 620px; background: #12141a; color: #e9edf3; font-size: 13px; }
house-3d-card.h3d-fill .h3d-root { height: auto; flex: 1 1 auto; min-height: 300px; }
house-3d-card .h3d-stage { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; overflow: hidden; }
house-3d-card .h3d-canvas { position: absolute; inset: 0; }
house-3d-card .h3d-canvas canvas { display: block; touch-action: none; cursor: grab; outline: none; -webkit-tap-highlight-color: transparent; }
house-3d-card .h3d-info { flex: 0 0 230px; width: 230px; box-sizing: border-box; background: #0d0f14; border-left: 1px solid #262a33; padding: 12px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
house-3d-card .h3d-root.h3d-narrow { flex-direction: column; height: auto; }
house-3d-card .h3d-root.h3d-narrow .h3d-stage { flex: 0 0 auto; height: 420px; }
house-3d-card.h3d-fill .h3d-root.h3d-narrow .h3d-stage { flex: 1 1 auto; height: auto; min-height: 240px; }
house-3d-card .h3d-root.h3d-narrow .h3d-info { flex: 0 0 auto; width: auto; border-left: 0; border-top: 1px solid #262a33; max-height: 320px; }
house-3d-card .h3d-btn { height: 32px; min-width: 32px; padding: 0 10px; box-sizing: border-box; background: #1c2029; color: #fff; border: 1px solid #333a46; border-radius: 6px; cursor: pointer; font: inherit; font-size: 12px; line-height: 1; white-space: nowrap; }
house-3d-card .h3d-btn:hover { background: #252b37; }
house-3d-card .h3d-btn.active { background: #2f6bff; border-color: #2f6bff; }
house-3d-card .h3d-tl { position: absolute; top: 10px; left: 10px; z-index: 6; display: flex; gap: 6px; }
house-3d-card .h3d-tr { position: absolute; top: 10px; right: 10px; z-index: 5; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; max-width: calc(100% - 110px); }
house-3d-card .h3d-bottom { position: absolute; left: 10px; right: 10px; bottom: 10px; z-index: 5; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
house-3d-card .h3d-bottom > * { pointer-events: auto; }
house-3d-card .h3d-hist { display: none; align-items: center; gap: 8px; background: rgba(13,15,20,.88); border: 1px solid #262a33; border-radius: 8px; padding: 6px 10px; }
house-3d-card .h3d-hist input { flex: 1; min-width: 60px; cursor: pointer; }
house-3d-card .h3d-hist-msg { display: none; font-size: 11px; color: #f1c40f; line-height: 1.4; }
house-3d-card .h3d-time { font-size: 11px; color: #c8cfdb; white-space: nowrap; min-width: 100px; text-align: right; font-variant-numeric: tabular-nums; }
house-3d-card .h3d-op { display: flex; align-items: center; gap: 10px; font-size: 11px; color: #9aa3b2; background: rgba(13,15,20,.6); border-radius: 8px; padding: 4px 10px; align-self: flex-start; min-width: 220px; }
house-3d-card .h3d-op input { flex: 1; cursor: pointer; }
house-3d-card .h3d-status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #7c8595; font-size: 13px; padding: 16px; text-align: center; pointer-events: none; }
house-3d-card .h3d-status.err { color: #e8582c; }
house-3d-card .h3d-hint { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: rgba(13,15,20,.92); border: 1px solid #333a46; border-radius: 8px; padding: 8px 12px; font-size: 12px; color: #c8cfdb; pointer-events: none; opacity: 0; transition: opacity .2s; z-index: 9; text-align: center; max-width: 80%; }
house-3d-card .h3d-hint.show { opacity: 1; }
house-3d-card .h3d-drawer { position: absolute; top: 0; left: 0; bottom: 0; width: 250px; max-width: 86%; box-sizing: border-box; background: rgba(13,15,20,.97); border-right: 1px solid #262a33; z-index: 8; overflow-y: auto; transform: translateX(-105%); visibility: hidden; transition: transform .2s ease, visibility .2s; }
house-3d-card .h3d-drawer.open { transform: none; visibility: visible; }
house-3d-card .h3d-dhead { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #262a33; font-weight: 600; }
house-3d-card .h3d-sec { padding: 12px; border-bottom: 1px solid #262a33; }
house-3d-card .h3d-sec:last-child { border-bottom: 0; }
house-3d-card .h3d-h { font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #7c8595; margin-bottom: 8px; }
house-3d-card .h3d-col { display: flex; flex-direction: column; gap: 4px; }
house-3d-card .h3d-toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; padding: 5px 6px; border-radius: 4px; background: #161a21; }
house-3d-card .h3d-toggle input { margin: 0; cursor: pointer; }
house-3d-card .h3d-range { display: flex; flex-direction: column; gap: 4px; font-size: 12px; padding: 6px; border-radius: 4px; background: #161a21; }
house-3d-card .h3d-range input { width: 100%; cursor: pointer; margin: 0; }
house-3d-card .h3d-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 10px; }
house-3d-card .h3d-modes button { padding: 7px 4px; font: inherit; font-size: 11px; border-radius: 5px; cursor: pointer; background: #161a21; color: #fff; border: 1px solid #262a33; }
house-3d-card .h3d-modes button.active { background: #2f6bff; border-color: #2f6bff; font-weight: 600; }
house-3d-card .h3d-legend { display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
house-3d-card .h3d-li { display: flex; align-items: center; gap: 8px; }
house-3d-card .h3d-li-note { color: #7c8595; margin-top: 4px; line-height: 1.4; }
house-3d-card .h3d-sw { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; display: inline-block; }
house-3d-card .h3d-fhead { font-size: 10px; color: #5d6675; text-transform: uppercase; letter-spacing: .06em; margin: 6px 0 2px; }
house-3d-card .h3d-room { padding: 8px; background: #161a21; border: 1px solid #262a33; border-radius: 5px; color: #fff; cursor: pointer; text-align: left; font: inherit; font-size: 12px; width: 100%; }
house-3d-card .h3d-room.sel { background: #1e2531; }
house-3d-card .h3d-room .line { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
house-3d-card .h3d-room .n { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
house-3d-card .h3d-room .vals { display: flex; gap: 6px; flex-shrink: 0; font-weight: 700; white-space: nowrap; }
house-3d-card .h3d-box { background: #161a21; border: 1px solid #262a33; border-radius: 6px; padding: 12px; }
house-3d-card .h3d-big { text-align: center; }
house-3d-card .h3d-big .t { font-size: 11px; color: #7c8595; margin-bottom: 6px; }
house-3d-card .h3d-big .v { font-size: 28px; font-weight: 700; line-height: 1; }
house-3d-card .h3d-big .v small { font-size: 15px; font-weight: 600; }
house-3d-card .h3d-big .s { font-size: 11px; color: #9aa3b2; margin-top: 6px; }
house-3d-card .h3d-out { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
house-3d-card .h3d-out .t { font-size: 11px; color: #7c8595; }
house-3d-card .h3d-out .v { font-size: 22px; font-weight: 700; white-space: nowrap; }
house-3d-card .h3d-rows { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
house-3d-card .h3d-row { display: flex; justify-content: space-between; }
house-3d-card .h3d-row span:first-child { color: #7c8595; }
house-3d-card .h3d-name { font-weight: 600; font-size: 14px; }
house-3d-card .h3d-sub { font-size: 11px; color: #7c8595; margin-top: -6px; }
house-3d-card .h3d-note { font-size: 11px; color: #f1c40f; }
house-3d-card .h3d-open { border-color: #ff3b30; color: #ffb3ae; font-size: 12px; display: flex; flex-direction: column; gap: 2px; }
house-3d-card .h3d-open .t { color: #ff5a4f; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
house-3d-card .h3d-muted { color: #7c8595; font-size: 13px; text-align: center; padding: 18px 0; line-height: 1.5; }
house-3d-card .h3d-ents { margin-top: auto; padding-top: 10px; border-top: 1px solid #262a33; font-size: 10px; color: #5d6675; word-break: break-all; display: flex; flex-direction: column; gap: 2px; }
`;

/* ========================== Karte ========================== */

class House3DCard extends HTMLElement {

  static get VERSION() {
    return VERSION;
  }

  static getConfigElement() {
    return document.createElement(EDITOR_TAG);
  }

  static getStubConfig() {
    return DEFAULT_CONFIG();
  }

  constructor() {
    super();
    this.config = normalizeCardConfig({});
    this._entityIds = [];
    this._statIds = [];
    this.temps = {};
    this.hums = {};
    this.flucts = {};
    this.openContacts = {};
    this.outdoorTemp = undefined;
    this.roomMeshes = [];
    this.labels = [];
    this.floorGroups = [];
    this.slabMeshes = [];
    this.roofGroup = null;
    this.roofMesh = null;
    this.outdoorMesh = null;
    this.hiddenFloors = new Set();
    this.roofHidden = false;
    this.labelsVisible = true;
    this.outdoorVisible = true;
    this.selected = null;
    this.displayMode = 'temp';
    this.opacity = 0.4;
    this.stat = null;
    this.histBuckets = [];
    this.histOffset = 0;
    this.histIndex = null;      // null bedeutet Live-Anzeige
    this.histPlaying = false;
    this.menuOpen = false;
    this._pointers = new Map();
    this._statToken = 0;
    this._autoFit = true;
    this._panMode = false;
    this._auto = false;
    this.explode = 0;           // 0 bis 1, Anteil von EXPLODE_GAP
    this.sunVisible = true;
    this.energy = {};           // Leistung in W je Eintrag aus ENERGY_ITEMS
    this.energyVisible = true;
    this.energyGroup = null;
    this.pvPanel = null;
    this.flows = [];
    this._energyObjs = {};
  }

  /* ---------- Home Assistant Schnittstelle ---------- */

  setConfig(config) {
    const cfg = normalizeCardConfig(config);
    const sig = stableStringify(cfg);
    if (sig === this._configSig) return;          // nichts geändert
    const prev = this._configSig ? this.config : null;
    this._configSig = sig;
    this.config = cfg;
    this.opacity = cfg.opacity / 100;
    this.displayMode = cfg.display;
    this._entityIds = this.collectEntities();
    this._statIds = this.collectStatEntities();
    this.classList.toggle('h3d-fill', cfg.fill);
    if (!this._built) return;

    this.stopPlay();
    this.histIndex = null;
    this.selected = null;
    this.temps = {};
    this.hums = {};
    this.flucts = {};
    this.outdoorTemp = undefined;
    this.energy = {};
    this._valueSig = null;
    if (prev && prev.floors.length !== cfg.floors.length) this.hiddenFloors = new Set();

    const statSig = this.statSignature();
    if (statSig !== this._statSig) {
      this._statSig = statSig;
      this.stat = null;
      this.histBuckets = [];
      this.scheduleStats(600);    // beim Tippen im Editor nicht bei jedem Zeichen abrufen
    }

    this.renderStatic();
    if (this._ready3D) this.rebuildScene();
    this.setLive();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._built) return;
    if (this._ready3D && this.pvPanel && this.southern() !== this._pvSouth) {
      this.rebuildScene();
      this._valueSig = null;
    }
    if (this.isLive()) this.updateSun(Date.now(), first);
    this.updateValues(false);
    if (first || this._statsPending) {
      this._statsPending = false;
      this.scheduleStats(0);
    }
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 13;
  }

  // Abschnittsansicht: ganze Breite, Zeilen frei wählbar
  getGridOptions() {
    return { columns: 12, min_columns: 6, min_rows: 6 };
  }

  connectedCallback() {
    if (this._teardownTimer) {
      clearTimeout(this._teardownTimer);
      this._teardownTimer = null;
    }
    this._stopped = false;

    if (!this._built) {
      this._built = true;
      this.buildDom();
      this._statSig = this.statSignature();
      this.renderStatic();
      this.setLive();
      this.scheduleStats(0);
    }

    this.observe();
    this.startStatTimer();
    // Wurde ein geplanter Abruf beim Entfernen abgebrochen, jetzt nachholen
    if (!this.stat && (this.config.history.hours || this.config.fluctuation.hours)) this.scheduleStats(0);
    if (this._ready3D) {
      this.onResize();
      this.requestRender();
    } else {
      this.loadThree();
    }
  }

  disconnectedCallback() {
    this._stopped = true;
    this.stopPlay();
    this.unobserve();
    this.stopStatTimer();
    this._pointers.clear();
    this._drag = null;
    if (this._raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.stopFlowTimer();
    // Beim Verschieben im Dashboard kommt die Karte sofort zurück. Erst wenn sie
    // länger fort ist, wird die 3D-Grafik freigegeben, damit der Browser nicht an
    // seine Grenze für gleichzeitige 3D-Ansichten stößt.
    if (this._teardownTimer) clearTimeout(this._teardownTimer);
    this._teardownTimer = setTimeout(() => {
      this._teardownTimer = null;
      if (!this.isConnected) this.teardown3D();
    }, 15000);
  }

  /* ---------- Aufbau der Oberfläche ---------- */

  buildDom() {
    this.innerHTML = `
      <style>${CARD_CSS}</style>
      <ha-card>
        <div class="h3d-title" id="card-title"></div>
        <div class="h3d-root">
          <div class="h3d-stage" id="stage">
            <div class="h3d-canvas" id="canvas-container"></div>
            <div class="h3d-status" id="status">3D wird geladen</div>
            <div class="h3d-hint" id="hint"></div>
            <div class="h3d-tl">
              <button type="button" class="h3d-btn" id="menu-toggle" title="Menü öffnen" aria-expanded="false">&#9776; Menü</button>
            </div>
            <div class="h3d-tr">
              <button type="button" class="h3d-btn" id="rot-left" title="Nach links drehen">&#8630;</button>
              <button type="button" class="h3d-btn" id="rot-right" title="Nach rechts drehen">&#8631;</button>
              <button type="button" class="h3d-btn" id="pan-mode" aria-pressed="false"
                title="Ziehen verschiebt das Haus statt es zu drehen. Alternativ: rechte Maustaste, Umschalt und Ziehen oder zwei Finger">&#10021; Verschieben</button>
              <button type="button" class="h3d-btn" id="auto-rot" aria-pressed="false" title="Dauerdrehung">Auto</button>
              <button type="button" class="h3d-btn" id="reset-cam" title="Haus mittig ausrichten">Zentrieren</button>
            </div>
            <aside class="h3d-drawer" id="drawer" aria-label="Menü">
              <div class="h3d-dhead"><span>Menü</span>
                <button type="button" class="h3d-btn" id="menu-close" title="Menü schließen">&#10005;</button>
              </div>
              <div class="h3d-sec"><div class="h3d-h">Ansicht</div><div class="h3d-col" id="floor-toggles"></div></div>
              <div class="h3d-sec"><div class="h3d-h">Anzeige</div>
                <div class="h3d-modes" id="mode-buttons"></div>
                <div class="h3d-legend" id="legend"></div>
              </div>
              <div class="h3d-sec"><div class="h3d-h">Räume</div><div class="h3d-col" id="rooms-list"></div></div>
            </aside>
            <div class="h3d-bottom">
              <div class="h3d-hist" id="history-bar">
                <span class="h3d-hist-msg" id="hist-msg"></span>
                <button type="button" class="h3d-btn" id="hist-play" title="Abspielen">&#9654;</button>
                <input type="range" id="hist-slider" min="0" max="0" value="0" aria-label="Zeitpunkt">
                <span class="h3d-time" id="hist-time">jetzt</span>
                <button type="button" class="h3d-btn" id="hist-now">Jetzt</button>
              </div>
              <label class="h3d-op"><span>Transparenz</span><input type="range" id="opacity" min="5" max="100" value="40"></label>
            </div>
          </div>
          <div class="h3d-info" id="info-panel"></div>
        </div>
      </ha-card>`;

    const on = (id, ev, fn) => this.querySelector('#' + id).addEventListener(ev, fn);
    on('menu-toggle', 'click', () => this.setMenu(!this.menuOpen));
    on('menu-close', 'click', () => this.setMenu(false));
    on('rot-left', 'click', () => this.rotateStep(0.4));
    on('rot-right', 'click', () => this.rotateStep(-0.4));
    on('pan-mode', 'click', () => this.setPanMode(!this._panMode));
    on('auto-rot', 'click', () => this.setAuto(!this._auto));
    on('reset-cam', 'click', () => this.recenter());
    on('opacity', 'input', (e) => {
      this.opacity = parseInt(e.target.value, 10) / 100;
      this.applyOpacity();
    });
    on('hist-slider', 'input', (e) => {
      this.stopPlay();
      this.applyBucket(parseInt(e.target.value, 10));
    });
    on('hist-play', 'click', () => this.togglePlay());
    on('hist-now', 'click', () => this.setLive());
  }

  renderStatic() {
    const cfg = this.config;
    const title = this.querySelector('#card-title');
    title.textContent = cfg.title;
    title.style.display = cfg.title ? '' : 'none';
    this.querySelector('#opacity').value = String(Math.round(cfg.opacity));
    this.buildToggles();
    this.buildModeButtons();
    this.buildLegend();
    this.buildRoomsList();
    this.renderHistBar();
  }

  setMenu(open) {
    this.menuOpen = !!open;
    const d = this.querySelector('#drawer');
    if (d) d.classList.toggle('open', this.menuOpen);
    const b = this.querySelector('#menu-toggle');
    if (b) b.setAttribute('aria-expanded', String(this.menuOpen));
  }

  isNarrow() {
    const root = this.querySelector('.h3d-root');
    return !!(root && root.classList.contains('h3d-narrow'));
  }

  makeToggle(label, checked, cb) {
    const row = document.createElement('label');
    row.className = 'h3d-toggle';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', () => cb(box.checked));
    const txt = document.createElement('span');
    txt.textContent = label;
    row.appendChild(box);
    row.appendChild(txt);
    return row;
  }

  buildToggles() {
    const box = this.querySelector('#floor-toggles');
    box.innerHTML = '';
    this.config.floors.forEach((f, i) => {
      box.appendChild(this.makeToggle(f.name, !this.hiddenFloors.has(i), (on) => {
        if (on) this.hiddenFloors.delete(i); else this.hiddenFloors.add(i);
        this.applyVisibility();
      }));
    });
    box.appendChild(this.makeToggle('Dach', !this.roofHidden, (on) => {
      this.roofHidden = !on;
      this.applyVisibility();
    }));
    box.appendChild(this.makeToggle('Beschriftung', this.labelsVisible, (on) => {
      this.labelsVisible = on;
      this.applyVisibility();
    }));
    if (this.config.outdoor.temp_entity) {
      box.appendChild(this.makeToggle('Außentemperatur', this.outdoorVisible, (on) => {
        this.outdoorVisible = on;
        this.applyVisibility();
      }));
    }
    if (ENERGY_ITEMS.some((it) => this.config.energy[it.field])) {
      box.appendChild(this.makeToggle('Energiefluss', this.energyVisible, (on) => {
        this.energyVisible = on;
        this.applyVisibility();
        if (this._autoFit) this.fitView(false);
      }));
    }
    box.appendChild(this.makeToggle('Sonne und Nordpfeil', this.sunVisible, (on) => {
      this.sunVisible = on;
      this.applyVisibility();
      if (this._autoFit) this.fitView(false);
    }));
    if (this.config.floors.length > 1) {
      const wrap = document.createElement('label');
      wrap.className = 'h3d-range';
      wrap.innerHTML = '<span>Etagen auseinander</span>';
      const range = document.createElement('input');
      range.type = 'range';
      range.id = 'explode';
      range.min = '0';
      range.max = '100';
      range.value = String(Math.round(this.explode * 100));
      range.addEventListener('input', () => this.setExplode(parseInt(range.value, 10) / 100));
      wrap.appendChild(range);
      box.appendChild(wrap);
    } else if (this.explode) {
      this.explode = 0;
    }
  }

  // Hebt die Etagen und das Dach an, damit untere Räume frei sichtbar werden
  setExplode(v) {
    this.explode = clamp(v || 0, 0, 1);
    this.applyExplode();
  }

  applyExplode() {
    if (!this._ready3D) return;
    const gap = this.explode * EXPLODE_GAP;
    this.floorGroups.forEach((g, i) => { g.position.y = i * gap; });
    if (this.roofGroup) this.roofGroup.position.y = this.floorGroups.length * gap;
    this._houseBounds = this.computeBounds(gap);
    this.updateFlowPaths();
    if (this._autoFit) this.fitView(false);
    else this.requestRender();
  }

  availableModes() {
    return MODES.filter((m) => m.value !== 'fluct' || this.config.fluctuation.hours > 0);
  }

  mode() {
    const m = this.displayMode || 'temp';
    return (m === 'fluct' && !this.config.fluctuation.hours) ? 'temp' : m;
  }

  showTemp() {
    return this.mode() !== 'hum';
  }

  showHum() {
    const m = this.mode();
    return m === 'hum' || m === 'both';
  }

  setMode(m) {
    this.displayMode = m;
    this.buildModeButtons();
    this.buildLegend();
    this.refreshView();
  }

  buildModeButtons() {
    const box = this.querySelector('#mode-buttons');
    box.innerHTML = '';
    this.availableModes().forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.mode = m.value;
      b.textContent = m.label;
      if (m.value === this.mode()) b.classList.add('active');
      b.addEventListener('click', () => this.setMode(m.value));
      box.appendChild(b);
    });
  }

  buildLegend() {
    const m = this.mode();
    const scale = m === 'hum' ? HUM_SCALE : (m === 'fluct' ? FLUCT_SCALE : TEMP_SCALE);
    const item = (color, text) =>
      '<div class="h3d-li"><span class="h3d-sw" style="background:' + toCss(color) + '"></span>' + esc(text) + '</div>';
    let html = scale.map((s) => item(s.color, s.label)).join('') + item(NO_VALUE, 'kein Wert');
    if (m === 'both') {
      html += '<div class="h3d-li-note">Farbe nach Temperatur, Beschriftung mit beiden Werten</div>';
    }
    if (m === 'fluct') {
      html += '<div class="h3d-li-note">Spanne zwischen niedrigster und höchster Temperatur der letzten ' +
        this.config.fluctuation.hours + ' Stunden</div>';
    }
    this.querySelector('#legend').innerHTML = html;
  }

  buildRoomsList() {
    const list = this.querySelector('#rooms-list');
    list.innerHTML = '';
    this.config.floors.forEach((floor, fi) => {
      const head = document.createElement('div');
      head.className = 'h3d-fhead';
      head.textContent = floor.name;
      list.appendChild(head);
      floor.rooms.forEach((room, ri) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'h3d-room';
        btn.dataset.floor = String(fi);
        btn.dataset.room = String(ri);
        btn.addEventListener('click', () => {
          this.selectRoom(fi, ri);
          if (this.isNarrow()) this.setMenu(false);
        });
        list.appendChild(btn);
      });
    });
    this.paintRoomButtons(true);
  }

  /* ---------- Werte ---------- */

  fmt() {
    return fmtFor(this._hass);
  }

  tempKey(fi, ri) {
    return fi + ':' + ri;
  }

  isLive() {
    return this.histIndex === null;
  }

  collectStatEntities() {
    const ids = [];
    const add = (id) => { if (id && ids.indexOf(id) < 0) ids.push(id); };
    this.config.floors.forEach((f) => f.rooms.forEach((r) => { add(r.temp_entity); add(r.hum_entity); }));
    add(this.config.outdoor.temp_entity);
    ENERGY_ITEMS.forEach((it) => add(this.config.energy[it.field]));
    return ids;
  }

  collectEntities() {
    const ids = this.collectStatEntities();
    this.config.floors.forEach((f) => f.rooms.forEach((r) => r.contacts.forEach((id) => {
      if (ids.indexOf(id) < 0) ids.push(id);
    })));
    return ids;
  }

  // Ändert sich keine der benutzten Entitäten, bleibt alles unangetastet.
  // Home Assistant meldet Änderungen des gesamten Systems, oft mehrmals pro Sekunde.
  valueSignature(hass) {
    let s = String(resolveLocale(hass)) + ';';
    const states = (hass && hass.states) || {};
    for (const id of this._entityIds) {
      const st = states[id];
      if (!st) { s += id + '=x;'; continue; }
      const a = st.attributes || {};
      s += id + '=' + st.state + '|' + a.current_temperature + '|' + a.current_humidity + '|' +
        a.temperature + '|' + a.humidity + '|' + a.unit_of_measurement + ';';
    }
    return s;
  }

  updateValues(force) {
    if (!this._built || !this.isLive()) return;
    const hass = this._hass;
    if (!hass) {
      if (force) this.refreshView();
      return;
    }
    const sig = this.valueSignature(hass);
    if (!force && sig === this._valueSig) return;
    this._valueSig = sig;

    const states = hass.states || {};
    this.config.floors.forEach((floor, fi) => {
      floor.rooms.forEach((room, ri) => {
        const key = this.tempKey(fi, ri);
        this.temps[key] = room.temp_entity ? readTemp(room.temp_entity, states[room.temp_entity]) : undefined;
        this.hums[key] = room.hum_entity ? readHum(room.hum_entity, states[room.hum_entity]) : undefined;
      });
    });
    const out = this.config.outdoor.temp_entity;
    this.outdoorTemp = out ? readTemp(out, states[out]) : undefined;

    this.energy = {};
    ENERGY_ITEMS.forEach((it) => {
      const id = this.config.energy[it.field];
      if (id) this.energy[it.key] = readPower(states[id]);
    });

    this.openContacts = {};
    this.config.floors.forEach((floor, fi) => {
      floor.rooms.forEach((room, ri) => {
        const open = room.contacts.filter((id) => contactIsOpen(states[id]));
        if (open.length) this.openContacts[this.tempKey(fi, ri)] = open;
      });
    });

    if (this.stat) this.computeFlucts(this.stat.buckets.length - 1, true);
    this.refreshView();
  }

  valueColor(fi, ri, room) {
    if (!room) return NO_VALUE;
    const key = this.tempKey(fi, ri);
    const m = this.mode();
    if (m === 'fluct') {
      const fl = this.flucts[key];
      const c = fl ? fluctColorHex(fl.range) : null;
      return c === null ? roomColor(room) : c;
    }
    if (m === 'hum') {
      const c = humColorHex(this.hums[key]);
      return c === null ? roomColor(room) : c;
    }
    const t = this.temps[key];
    if (hasValue(t)) return tempColorHex(t);
    if (m === 'both') {
      const c = humColorHex(this.hums[key]);
      if (c !== null) return c;
    }
    return roomColor(room);
  }

  labelLines(fi, ri) {
    const key = this.tempKey(fi, ri);
    const f = this.fmt();
    const m = this.mode();
    const out = [];
    if (m === 'fluct') {
      const fl = this.flucts[key];
      if (fl) out.push('Spanne ' + f.kelvin(fl.range) + ' K');
    } else {
      if (m !== 'hum' && hasValue(this.temps[key])) out.push(f.temp(this.temps[key]) + ' °C');
      if ((m === 'hum' || m === 'both') && hasValue(this.hums[key])) out.push(f.hum(this.hums[key]) + ' %');
    }
    const open = this.openContacts[key];
    if (open) out.push('!' + contactText(open, this._hass && this._hass.states));
    return out;
  }

  roomButtonHtml(fi, ri) {
    const room = this.config.floors[fi] && this.config.floors[fi].rooms[ri];
    if (!room) return '';
    const key = this.tempKey(fi, ri);
    const f = this.fmt();
    const m = this.mode();
    const span = (color, text) => '<span style="color:' + toCss(color) + '">' + text + '</span>';
    const vals = [];
    if (m === 'fluct') {
      const fl = this.flucts[key];
      const c = fl ? fluctColorHex(fl.range) : null;
      vals.push(span(c === null ? NO_VALUE : c, fl ? f.kelvin(fl.range) + ' K' : '--'));
    } else {
      if (this.showTemp()) vals.push(span(tempColorHex(this.temps[key]), f.temp(this.temps[key]) + '°'));
      if (this.showHum()) {
        const c = humColorHex(this.hums[key]);
        vals.push(span(c === null ? NO_VALUE : c, f.hum(this.hums[key]) + '%'));
      }
    }
    if (this.openContacts[key]) vals.unshift(span(OPEN_COLOR, '&#9679;'));
    return '<div class="line"><span class="n">' + esc(displayName(room, ri)) + '</span><span class="vals">' +
      vals.join('') + '</span></div>';
  }

  paintRoomButtons(force) {
    this.querySelectorAll('#rooms-list .h3d-room').forEach((btn) => {
      const fi = parseInt(btn.dataset.floor, 10);
      const ri = parseInt(btn.dataset.room, 10);
      const html = this.roomButtonHtml(fi, ri);
      if (force || btn._html !== html) {
        btn.innerHTML = html;
        btn._html = html;
      }
      const sel = !!(this.selected && this.selected.fi === fi && this.selected.ri === ri);
      btn.classList.toggle('sel', sel);
      const border = sel ? toCss(this.valueColor(fi, ri, this.config.floors[fi].rooms[ri])) : '';
      if (btn.style.borderColor !== border) btn.style.borderColor = border;
    });
  }

  // Überträgt die aktuellen Werte auf Modell, Liste und Infofeld
  refreshView() {
    if (!this._built) return;
    if (this._ready3D) {
      this.config.floors.forEach((floor, fi) => {
        floor.rooms.forEach((room, ri) => {
          const key = this.tempKey(fi, ri);
          const c = this.valueColor(fi, ri, room);
          const mesh = this._meshByKey && this._meshByKey[key];
          if (mesh) {
            const open = !!this.openContacts[key];
            mesh.material.color.setHex(c);
            mesh.userData.isOpen = open;
            if (mesh.userData.glow) mesh.userData.glow.material.color.setHex(open ? OPEN_COLOR : c);
          }
          const label = this._labelByKey && this._labelByKey[key];
          if (label) this.updateLabel(label, displayName(room, ri), this.labelLines(fi, ri));
        });
      });
      this.updateOutdoorMesh();
      this.updateEnergy();
      this.applyOpacity();
    }
    this.paintRoomButtons(false);
    this.renderInfo();
  }

  renderInfo() {
    const box = this.querySelector('#info-panel');
    if (!box) return;
    const f = this.fmt();
    const cfg = this.config;
    const parts = [];

    const big = (title, value, unit, color, sub) =>
      '<div class="h3d-box h3d-big"><div class="t">' + title + '</div>' +
      '<div class="v" style="color:' + toCss(color) + '">' + value + '<small>' + unit + '</small></div>' +
      (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';

    if (cfg.outdoor.temp_entity) {
      const v = this.outdoorTemp;
      parts.push('<div class="h3d-box h3d-out"><div><div class="t">Außentemperatur</div></div>' +
        '<div class="v" style="color:' + toCss(tempColorHex(v)) + '">' + f.temp(v) + ' °C</div></div>');
    }

    const enItems = ENERGY_ITEMS.filter((it) => cfg.energy[it.field]);
    if (enItems.length) {
      parts.push('<div class="h3d-box h3d-rows" id="energy-box"><div class="h3d-h">Energie</div>' + enItems.map((it) => {
        const w = this.energy[it.key];
        const active = hasValue(w) && w > FLOW_MIN_W;
        return '<div class="h3d-row"><span>' + esc(it.label) + '</span><span' +
          (active ? ' style="color:' + toCss(it.color) + ';font-weight:600"' : '') + '>' + f.power(w) + '</span></div>';
      }).join('') + '</div>');
    }

    if (!this.isLive() && this.histBuckets[this.histIndex] !== undefined) {
      parts.push('<div class="h3d-note">Rückblick ' + esc(f.time(this.histBuckets[this.histIndex])) +
        ' Uhr, Stundenmittel</div>');
    }

    const sel = this.selected;
    const floor = sel && cfg.floors[sel.fi];
    const room = floor && floor.rooms[sel.ri];

    if (!room) {
      parts.push('<div class="h3d-muted">Raum im Modell antippen<br>oder im Menü wählen</div>');
    } else {
      const key = this.tempKey(sel.fi, sel.ri);
      const t = this.temps[key];
      const h = this.hums[key];
      const m = this.mode();
      const fl = this.flucts[key];

      parts.push('<div class="h3d-name">' + esc(displayName(room, sel.ri)) + '</div>');
      parts.push('<div class="h3d-sub">' + esc(floor.name) + ' &middot; ' + esc(roomTypeLabel(room.type)) + '</div>');
      const open = this.openContacts[key];
      if (open) {
        const states = (this._hass && this._hass.states) || {};
        const names = open.map((id) => {
          const fn = states[id] && states[id].attributes && states[id].attributes.friendly_name;
          return esc(fn || id);
        });
        parts.push('<div class="h3d-box h3d-open"><div class="t">Offen</div>' + names.map((x) => '<div>' + x + '</div>').join('') + '</div>');
      }

      const fluctBlock = () => {
        if (!cfg.fluctuation.hours || !room.temp_entity) return '';
        const c = fl ? fluctColorHex(fl.range) : null;
        const sub = fl ? 'von ' + f.temp(fl.min) + ' bis ' + f.temp(fl.max) + ' °C' : 'keine Statistik vorhanden';
        return big('Schwankung ' + cfg.fluctuation.hours + ' h', fl ? f.kelvin(fl.range) : '--', ' K',
          c === null ? NO_VALUE : c, sub);
      };

      if (m === 'fluct') parts.push(fluctBlock());
      if (this.showTemp()) parts.push(big('Temperatur', f.temp(t), ' °C', tempColorHex(t)));
      if (this.showHum()) {
        const c = humColorHex(h);
        parts.push(big('Luftfeuchtigkeit', f.hum(h), ' %', c === null ? NO_VALUE : c));
      }
      if (m !== 'fluct' && m !== 'hum') parts.push(fluctBlock());

      parts.push('<div class="h3d-box h3d-rows">' +
        '<div class="h3d-row"><span>Fläche</span><span>' + f.num(room.w * room.d, 1) + ' m²</span></div>' +
        '<div class="h3d-row"><span>Breite</span><span>' + f.dim(room.w) + ' m</span></div>' +
        '<div class="h3d-row"><span>Tiefe</span><span>' + f.dim(room.d) + ' m</span></div>' +
        '<div class="h3d-row"><span>Höhe</span><span>' + f.dim(floor.height) + ' m</span></div></div>');

      parts.push('<div class="h3d-ents"><span>' + esc(room.temp_entity || 'kein Temperatur-Sensor') + '</span>' +
        '<span>' + esc(room.hum_entity || 'kein Feuchte-Sensor') + '</span></div>');
    }

    const html = parts.join('');
    if (html !== this._infoHtml) {
      box.innerHTML = html;
      this._infoHtml = html;
    }
  }

  selectRoom(fi, ri) {
    const floor = this.config.floors[fi];
    this.selected = (floor && floor.rooms[ri]) ? { fi: fi, ri: ri } : null;
    this.applyOpacity();
    this.paintRoomButtons(false);
    this.renderInfo();
  }

  /* ---------- Statistik: Rückblick und Schwankung ---------- */

  statSignature() {
    return stableStringify({
      ids: this._statIds.slice().sort(),
      h: this.config.history.hours,
      f: this.config.fluctuation.hours
    });
  }

  scheduleStats(delay) {
    if (this._statTimer) clearTimeout(this._statTimer);
    this._statTimer = setTimeout(() => {
      this._statTimer = null;
      this.loadStats();
    }, delay || 0);
  }

  startStatTimer() {
    this.stopStatTimer();
    // Die Stundenwerte wachsen nach. Alle 30 Minuten neu laden, solange live angezeigt wird.
    this._statInterval = setInterval(() => {
      const c = this.config;
      if (this.isLive() && !this.histPlaying && (c.history.hours || c.fluctuation.hours)) this.loadStats();
    }, 30 * 60 * 1000);
  }

  stopStatTimer() {
    if (this._statInterval) clearInterval(this._statInterval);
    this._statInterval = null;
    if (this._statTimer) clearTimeout(this._statTimer);
    this._statTimer = null;
  }

  histMessage(text) {
    const bar = this.querySelector('#history-bar');
    const msg = this.querySelector('#hist-msg');
    if (!bar || !msg) return;
    ['#hist-play', '#hist-slider', '#hist-time', '#hist-now'].forEach((id) => {
      const el = this.querySelector(id);
      if (el) el.style.display = text ? 'none' : '';
    });
    msg.style.display = text ? 'block' : 'none';
    msg.textContent = text || '';
    bar.style.display = 'flex';
  }

  renderHistBar() {
    const bar = this.querySelector('#history-bar');
    if (!this.config.history.hours) {
      bar.style.display = 'none';
      return;
    }
    if (this.histBuckets.length > 1) this.histMessage('');
    else if (!this.stat) this.histMessage('Rückblick wird geladen');
  }

  async loadStats() {
    const cfg = this.config;
    const histH = cfg.history.hours;
    const flH = cfg.fluctuation.hours;
    const bar = this.querySelector('#history-bar');
    if (!bar) return;

    if (!histH && !flH) {
      this.stat = null;
      this.histBuckets = [];
      bar.style.display = 'none';
      return;
    }
    if (!histH) bar.style.display = 'none';

    const ids = this._statIds;
    if (!ids.length) {
      this.stat = null;
      this.histBuckets = [];
      if (histH) this.histMessage('Rückblick: kein Raum hat einen Sensor hinterlegt.');
      return;
    }

    if (!this._hass || typeof this._hass.callWS !== 'function') {
      // Ohne Verbindung warten, bis Home Assistant hass übergibt
      this._statsPending = true;
      if (histH) this.histMessage('Rückblick wird geladen');
      return;
    }

    if (histH && this.histBuckets.length < 2) this.histMessage('Rückblick wird geladen');

    // Mehrere Abrufe können sich überholen. Nur der jüngste zählt.
    const token = ++this._statToken;
    const now = Date.now();
    const start = now - (histH + flH) * HOUR;

    let res;
    try {
      res = await this._hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: new Date(start).toISOString(),
        end_time: new Date(now).toISOString(),
        statistic_ids: ids,
        period: 'hour',
        types: ['mean', 'min', 'max']
      });
    } catch (e) {
      if (token !== this._statToken) return;
      console.warn('house-3d-card: Statistik nicht abrufbar:', e);
      this.stat = null;
      this.histBuckets = [];
      if (histH) this.histMessage('Rückblick: Abruf fehlgeschlagen (' + (e && e.message ? e.message : 'unbekannter Fehler') + ').');
      this.flucts = {};
      this.refreshView();
      return;
    }
    if (token !== this._statToken) return;

    // Zeitraster aus vollen Stunden
    const first = Math.floor(start / HOUR) * HOUR;
    const last = Math.floor(now / HOUR) * HOUR;
    const buckets = [];
    for (let t = first; t <= last; t += HOUR) buckets.push(t);
    const n = buckets.length;
    const toNum = (v) => (v === null || v === undefined || isNaN(parseFloat(v))) ? null : parseFloat(v);

    const series = {};
    const withData = [];
    ids.forEach((id) => {
      const rows = (res && Array.isArray(res[id])) ? res[id] : [];
      const mean = new Array(n).fill(null);
      const min = new Array(n).fill(null);
      const max = new Array(n).fill(null);
      rows.forEach((row) => {
        const ts = typeof row.start === 'number' ? row.start : Date.parse(row.start);
        if (isNaN(ts)) return;
        const i = Math.round((Math.floor(ts / HOUR) * HOUR - first) / HOUR);
        if (i < 0 || i >= n) return;
        mean[i] = toNum(row.mean);
        min[i] = toNum(row.min);
        max[i] = toNum(row.max);
      });
      // Stunden ohne Wert übernehmen den letzten bekannten Wert. Für die
      // Schwankung zählen sie damit nicht als Ausschlag.
      let lastVal = null;
      for (let i = 0; i < n; i++) {
        if (mean[i] !== null) {
          lastVal = mean[i];
          if (min[i] === null) min[i] = mean[i];
          if (max[i] === null) max[i] = mean[i];
        } else {
          mean[i] = lastVal;
          min[i] = lastVal;
          max[i] = lastVal;
        }
      }
      if (rows.length) withData.push(id);
      series[id] = { mean: mean, min: min, max: max };
    });

    this.stat = { buckets: buckets, series: series, withData: withData };

    if (histH) {
      if (!withData.length) {
        this.histBuckets = [];
        this.histMessage('Rückblick: keine Langzeitstatistik vorhanden. Der Sensor braucht state_class measurement und darf im Recorder nicht ausgeschlossen sein.');
      } else {
        this.histOffset = Math.max(0, n - 1 - histH);
        this.histBuckets = buckets.slice(this.histOffset);
        if (this.histBuckets.length < 2) {
          this.histMessage('Rückblick: zu wenig Daten für den gewählten Zeitraum.');
        } else {
          this.histMessage('');
          const slider = this.querySelector('#hist-slider');
          slider.min = '0';
          slider.max = String(this.histBuckets.length - 1);
          if (this.isLive()) slider.value = slider.max;
        }
      }
    } else {
      this.histBuckets = [];
    }

    if (ids.length > withData.length) {
      console.info('house-3d-card: ' + (ids.length - withData.length) + ' Sensor(en) ohne Langzeitstatistik');
    }

    if (this.isLive()) {
      this._valueSig = null;
      this.updateValues(true);
    } else if (this.histBuckets.length) {
      this.applyBucket(Math.min(this.histIndex, this.histBuckets.length - 1));
    } else {
      this.setLive();
    }
  }

  // Spanne über das Zeitfenster, das bei Index fullIdx endet
  computeFlucts(fullIdx, live) {
    this.flucts = {};
    const flH = this.config.fluctuation.hours;
    if (!flH || !this.stat || fullIdx < 0) return;
    const from = Math.max(0, fullIdx - flH + 1);
    this.config.floors.forEach((floor, fi) => {
      floor.rooms.forEach((room, ri) => {
        const s = room.temp_entity && this.stat.series[room.temp_entity];
        if (!s) return;
        let lo = Infinity, hi = -Infinity;
        for (let j = from; j <= fullIdx; j++) {
          if (s.min[j] !== null && s.min[j] < lo) lo = s.min[j];
          if (s.max[j] !== null && s.max[j] > hi) hi = s.max[j];
        }
        // Ohne Statistikwerte im Fenster gibt es keine Spanne. Der aktuelle Wert
        // allein ergäbe sonst irreführend 0 K.
        if (lo === Infinity || hi === -Infinity) return;
        const key = this.tempKey(fi, ri);
        if (live && hasValue(this.temps[key])) {
          const cur = parseFloat(this.temps[key]);
          lo = Math.min(lo, cur);
          hi = Math.max(hi, cur);
        }
        if (lo === Infinity || hi === -Infinity) return;
        this.flucts[key] = { range: hi - lo, min: lo, max: hi };
      });
    });
  }

  applyBucket(index) {
    if (!this.histBuckets.length || !this.stat) return;
    const i = clamp(Math.round(index) || 0, 0, this.histBuckets.length - 1);
    this.histIndex = i;
    const full = this.histOffset + i;

    const pick = (id) => {
      const s = id && this.stat.series[id];
      const v = s ? s.mean[full] : null;
      return (v === null || v === undefined) ? undefined : v;
    };

    this.config.floors.forEach((floor, fi) => {
      floor.rooms.forEach((room, ri) => {
        const key = this.tempKey(fi, ri);
        this.temps[key] = pick(room.temp_entity);
        this.hums[key] = pick(room.hum_entity);
      });
    });
    this.outdoorTemp = pick(this.config.outdoor.temp_entity);
    // Home Assistant liefert die Statistik in der Einheit des Sensors
    this.energy = {};
    ENERGY_ITEMS.forEach((it) => {
      const id = this.config.energy[it.field];
      if (!id) return;
      const st = this._hass && this._hass.states && this._hass.states[id];
      this.energy[it.key] = toWatts(pick(id), st && st.attributes && st.attributes.unit_of_measurement);
    });
    this.openContacts = {};
    this.computeFlucts(full, false);
    this.updateSun(this.histBuckets[i] + HOUR / 2, true);

    const timeEl = this.querySelector('#hist-time');
    if (timeEl) timeEl.textContent = this.fmt().time(this.histBuckets[i]) + ' Uhr';
    const nowBtn = this.querySelector('#hist-now');
    if (nowBtn) nowBtn.classList.add('active');
    const slider = this.querySelector('#hist-slider');
    if (slider && parseInt(slider.value, 10) !== i) slider.value = String(i);

    this.refreshView();
  }

  setLive() {
    this.histIndex = null;
    this.stopPlay();
    const slider = this.querySelector('#hist-slider');
    if (slider) slider.value = slider.max;
    const timeEl = this.querySelector('#hist-time');
    if (timeEl) timeEl.textContent = 'jetzt';
    const nowBtn = this.querySelector('#hist-now');
    if (nowBtn) nowBtn.classList.remove('active');
    this._valueSig = null;
    this.updateValues(true);
    this.updateSun(Date.now(), true);
  }

  togglePlay() {
    if (this.histPlaying) {
      this.stopPlay();
      return;
    }
    const n = this.histBuckets.length;
    if (!n) return;

    this.histPlaying = true;
    const btn = this.querySelector('#hist-play');
    if (btn) {
      btn.innerHTML = '&#10074;&#10074;';
      btn.classList.add('active');
    }

    // Ein Durchlauf dauert höchstens etwa 30 Sekunden, auch bei einem Jahr
    const step = Math.max(1, Math.ceil(n / 120));
    let i = (this.histIndex === null) ? 0 : this.histIndex;
    this.applyBucket(i);
    this._playTimer = setInterval(() => {
      i = (i >= n - 1) ? 0 : Math.min(n - 1, i + step);
      this.applyBucket(i);
    }, 250);
  }

  stopPlay() {
    this.histPlaying = false;
    if (this._playTimer) clearInterval(this._playTimer);
    this._playTimer = null;
    const btn = this.querySelector('#hist-play');
    if (btn) {
      btn.innerHTML = '&#9654;';
      btn.classList.remove('active');
    }
  }

  /* ---------- 3D: Laden und Abbau ---------- */

  showStatus(text, isError) {
    const s = this.querySelector('#status');
    if (!s) return;
    s.textContent = text || '';
    s.style.display = text ? 'flex' : 'none';
    s.classList.toggle('err', !!isError);
    if (isError && text) console.error('house-3d-card:', text);
  }

  loadThree() {
    if (!this._threeLoad) {
      this._threeLoad = loadThreeModule().then((T) => {
        this.THREE = T;
        return T;
      });
      this._threeLoad.catch(() => { this._threeLoad = null; });
    }
    return this._threeLoad.then(() => {
      if (!this._ready3D && this._built && this.isConnected) {
        try {
          this.initThree();
        } catch (e) {
          this.showStatus('3D-Aufbau fehlgeschlagen: ' + (e && e.message ? e.message : e), true);
        }
      }
    }, (e) => {
      this.showStatus('Three.js konnte nicht geladen werden: ' + (e && e.message ? e.message : e), true);
    });
  }

  initThree() {
    const THREE = this.THREE;
    const container = this.querySelector('#canvas-container');
    if (!THREE || !container) return;

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x12141a);
    this._scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.3);
    d1.position.set(20, 30, 16);
    this._scene.add(d1);
    this._scene.add(d1.target);
    this._sunLight = d1;
    const d2 = new THREE.DirectionalLight(0xffffff, 0.5);
    d2.position.set(-18, 12, -14);
    this._scene.add(d2);

    this._camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this._raycaster = new THREE.Raycaster();

    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    // Sehr hohe Pixeldichten bringen kaum Schärfe, kosten aber viel Rechenzeit
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(this._renderer.domElement);
    this._canvas = this._renderer.domElement;
    this.attachCanvas(this._canvas);

    this._ready3D = true;
    this._viewW = 0;
    this._viewH = 0;
    if (!this._orbit) this._orbit = { theta: DEFAULT_THETA, phi: DEFAULT_PHI, radius: 30, target: { x: 0, y: 4, z: 0 } };

    this.buildHouse();
    this.applyStoredOrFit();
    this.updateSun(Date.now(), true);
    this.showStatus('');
    this.onResize();
    this.refreshView();
    this.requestRender();
  }

  teardown3D() {
    if (!this._ready3D) return;
    this.stopPlay();
    this.stopFlowTimer();
    this.disposeHouse();
    if (this._grid) {
      this.disposeObject(this._grid);
      this._grid = null;
    }
    try {
      this._renderer.dispose();
      if (typeof this._renderer.forceContextLoss === 'function') this._renderer.forceContextLoss();
    } catch (e) { /* bereits freigegeben */ }
    if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    this._renderer = null;
    this._scene = null;
    this._camera = null;
    this._canvas = null;
    this._ready3D = false;
    this._viewW = 0;
    this._viewH = 0;
    this.showStatus('3D wird geladen');
  }

  disposeObject(obj) {
    obj.traverse((o) => {
      if (o.geometry && !o.isSprite) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    });
    if (obj.parent) obj.parent.remove(obj);
  }

  disposeHouse() {
    [...this.floorGroups, this.roofGroup, this.outdoorMesh, this.compassGroup, this.sunMesh, this.energyGroup].forEach((g) => { if (g) this.disposeObject(g); });
    this.energyGroup = null;
    this.pvPanel = null;
    this.flows = [];
    this._energyObjs = {};
    this.compassGroup = null;
    this.sunMesh = null;
    this.floorGroups = [];
    this.roomMeshes = [];
    this.slabMeshes = [];
    this.labels = [];
    this.roofGroup = null;
    this.roofMesh = null;
    this.outdoorMesh = null;
    this._meshByKey = {};
    this._labelByKey = {};
  }

  rebuildScene() {
    if (!this._ready3D) return;
    const oldKey = this._boundsKey;
    this.buildHouse();
    this.updateSun(this.isLive() ? Date.now() : this.histBuckets[this.histIndex], true);
    if (this._boundsKey !== oldKey) {
      // Grundriss geändert: neu mittig ausrichten, Blickwinkel bleibt
      this._viewKey = null;
      this._autoFit = true;
      this.fitView(false);
    } else if (this._autoFit) {
      this.fitView(false);
    } else {
      this._applyCamera();
    }
  }

  /* ---------- 3D: Modell ---------- */

  buildHouse() {
    const THREE = this.THREE;
    const cfg = this.config;
    const W = cfg.house.width;
    const D = cfg.house.depth;
    this.disposeHouse();
    const token = this._buildToken = (this._buildToken || 0) + 1;
    const loader = new THREE.TextureLoader();

    let baseY = 0;
    cfg.floors.forEach((floor, fi) => {
      const group = new THREE.Group();

      // Bodenplatte mit optionalem Grundriss. Sie schreibt keine Tiefe, sonst
      // wären die Räume der Etage darunter von oben nicht zu sehen.
      const slabMat = new THREE.MeshBasicMaterial({
        color: floor.floorplan ? 0xffffff : 0x232935,
        transparent: true,
        opacity: Math.min(1, this.opacity + 0.35),
        side: THREE.DoubleSide,
        depthWrite: false
      });
      if (floor.floorplan) {
        loader.load(floor.floorplan, (tex) => {
          if (token !== this._buildToken || !this._ready3D) { tex.dispose(); return; }
          if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
          slabMat.map = tex;
          slabMat.needsUpdate = true;
          this.requestRender();
        }, undefined, () => console.warn('house-3d-card: Grundriss nicht ladbar:', floor.floorplan));
      }
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(W, D), slabMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(0, baseY + 0.02, 0);
      slab.renderOrder = 0;
      group.add(slab);
      this.slabMeshes.push(slab);

      floor.rooms.forEach((room, ri) => {
        const key = this.tempKey(fi, ri);
        const open = roomTypeIsOpen(room.type);
        const col = roomColor(room);
        const geo = new THREE.BoxGeometry(room.w, floor.height, room.d);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
          color: col,
          transparent: true,
          opacity: open ? this.opacity * 0.4 : this.opacity,
          depthWrite: false,
          roughness: 0.65,
          metalness: 0.05
        }));
        mesh.position.set(room.x + room.w / 2 - W / 2, baseY + floor.height / 2, room.z + room.d / 2 - D / 2);
        mesh.renderOrder = 2;
        const glow = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: open ? 0.8 : 0.4 })
        );
        mesh.add(glow);
        mesh.userData = { fi: fi, ri: ri, name: displayName(room, ri), glow: glow, open: open };
        group.add(mesh);
        this.roomMeshes.push(mesh);
        this._meshByKey[key] = mesh;

        // Beschriftung flach auf dem Boden des Raumes, dreht sich mit dem Haus
        const label = this.makeLabel(displayName(room, ri), this.labelLines(fi, ri), room.w, room.d);
        label.position.set(mesh.position.x, baseY + 0.06, mesh.position.z);
        label.userData.fi = fi;
        label.userData.ri = ri;
        label.visible = this.labelsVisible;
        group.add(label);
        this.labels.push(label);
        this._labelByKey[key] = label;
      });

      this._scene.add(group);
      this.floorGroups.push(group);
      baseY += floor.height;
    });
    this.totalHeight = baseY;

    // Dach über dem Hauptbaukörper
    const r = cfg.roof;
    const turned = r.axis === 'z' && (r.type === 'gable' || r.type === 'mono');
    const rw = turned ? D + 2 * r.overhang : W + 2 * r.overhang;
    const rd = turned ? W + 2 * r.overhang : D + 2 * r.overhang;
    const roofGeo = buildRoofGeometry(THREE, r.type, rw, rd, r.height);
    const roofMesh = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({
      color: 0x6b4f3f,
      transparent: true,
      opacity: Math.min(0.9, this.opacity + 0.15),
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.02
    }));
    roofMesh.position.y = baseY + (r.type === 'flat' ? 0.15 : 0);
    if (turned) roofMesh.rotation.y = Math.PI / 2;
    roofMesh.renderOrder = 3;
    roofMesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(roofGeo),
      new THREE.LineBasicMaterial({ color: 0x3a2c24, transparent: true, opacity: 0.6 })
    ));
    const roofGroup = new THREE.Group();
    roofGroup.add(roofMesh);
    this._scene.add(roofGroup);
    this.roofGroup = roofGroup;
    this.roofMesh = roofMesh;

    const hb = this.computeBounds(0);
    this._boundsKey = [hb.minX, hb.maxX, hb.minY, hb.maxY, hb.minZ, hb.maxZ].map((v) => round1(v)).join(',');
    this._houseBounds = this.computeBounds(this.explode * EXPLODE_GAP);

    // PV-Module, Wärmepumpe, Wallbox und Leitungen
    const deviceFront = this.buildEnergy(roofMesh, rw, rd, hb);

    // Außentemperatur als Tafel vor dem Haus
    if (cfg.outdoor.temp_entity) {
      const made = makeBadgeTexture(THREE, 'Außen', '--', NO_VALUE);
      const pw = clamp((hb.maxX - hb.minX) * 0.3, 2.4, 6);
      const ph = pw / made.aspect;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({
        map: made.texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      }));
      plate.rotation.x = -Math.PI / 2;
      plate.position.set((hb.minX + hb.maxX) / 2, 0.04, Math.max(hb.maxZ, deviceFront) + 0.8 + ph / 2);
      plate.renderOrder = 6;
      plate.userData = { text: '', w: pw, h: ph };
      this._scene.add(plate);
      this.outdoorMesh = plate;
    }

    // Nordpfeil am Boden vorne links, dreht sich mit dem Haus
    const ext = Math.max(hb.maxX - hb.minX, hb.maxZ - hb.minZ);
    const cr = clamp(ext * 0.1, 1.0, 2.4);
    const compassPlane = new THREE.Mesh(new THREE.PlaneGeometry(cr * 2, cr * 2), new THREE.MeshBasicMaterial({
      map: makeCompassTexture(THREE),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    }));
    compassPlane.rotation.x = -Math.PI / 2;
    const compass = new THREE.Group();
    compass.add(compassPlane);
    compass.rotation.y = cfg.orientation.north * Math.PI / 180;
    compass.position.set(hb.minX - cr - 0.6, 0.03, hb.maxZ + cr + 0.6);
    compass.renderOrder = 6;
    compass.userData = { r: cr };
    this._scene.add(compass);
    this.compassGroup = compass;

    // Sonne als leuchtende Kugel, Lage nach Uhrzeit und Standort
    const sun = new THREE.Mesh(new THREE.SphereGeometry(clamp(ext * 0.035, 0.35, 1.2), 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd54a }));
    sun.visible = false;
    this._scene.add(sun);
    this.sunMesh = sun;
    this._sunT = 0;

    this.rebuildGrid();
    this.floorGroups.forEach((g, i) => { g.position.y = i * this.explode * EXPLODE_GAP; });
    this.roofGroup.position.y = this.floorGroups.length * this.explode * EXPLODE_GAP;
    this.updateFlowPaths();
    this.applyVisibility();
    this.applyOpacity();
  }

  rebuildGrid() {
    const THREE = this.THREE;
    const hb = this._houseBounds;
    const ext = Math.max(Math.abs(hb.minX), Math.abs(hb.maxX), Math.abs(hb.minZ), Math.abs(hb.maxZ) + 4);
    const size = Math.max(30, 2 * Math.ceil(ext + 6));
    if (this._grid && this._gridSize === size) return;
    if (this._grid) this.disposeObject(this._grid);
    this._grid = new THREE.GridHelper(size, size, 0x2a303c, 0x1c212a);
    this._gridSize = size;
    this._scene.add(this._grid);
  }

  labelSize(aspect, roomW, roomD) {
    let h = Math.min(roomD * 0.55, 1.3);
    let w = h * aspect;
    const maxW = roomW * 0.88;
    if (w > maxW) {
      w = maxW;
      h = w / aspect;
    }
    return { w: w, h: h };
  }

  makeLabel(name, lines, roomW, roomD) {
    const THREE = this.THREE;
    const made = makeLabelTexture(THREE, name, lines);
    const size = this.labelSize(made.aspect, roomW, roomD);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size.w, size.h), new THREE.MeshBasicMaterial({
      map: made.texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    }));
    plane.rotation.x = -Math.PI / 2;
    plane.renderOrder = 5;
    plane.userData = {
      text: name + '|' + (lines || []).join('|'),
      isLabel: true,
      roomW: roomW,
      roomD: roomD,
      aspect: made.aspect
    };
    return plane;
  }

  // Neu gezeichnet wird nur, wenn sich Name oder Wert tatsächlich ändern
  updateLabel(label, name, lines) {
    const key = name + '|' + (lines || []).join('|');
    if (label.userData.text === key) return;
    const made = makeLabelTexture(this.THREE, name, lines);
    if (label.material.map) label.material.map.dispose();
    label.material.map = made.texture;
    label.material.needsUpdate = true;
    if (made.aspect !== label.userData.aspect) {
      const size = this.labelSize(made.aspect, label.userData.roomW, label.userData.roomD);
      label.geometry.dispose();
      label.geometry = new this.THREE.PlaneGeometry(size.w, size.h);
      label.userData.aspect = made.aspect;
    }
    label.userData.text = key;
  }

  updateOutdoorMesh() {
    const plate = this.outdoorMesh;
    if (!plate) return;
    const v = this.outdoorTemp;
    const text = hasValue(v) ? this.fmt().temp(v) + ' °C' : '--';
    const color = hasValue(v) ? tempColorHex(v) : NO_VALUE;
    const key = text + '|' + color;
    if (plate.userData.text === key) return;
    const made = makeBadgeTexture(this.THREE, 'Außen', text, color);
    if (plate.material.map) plate.material.map.dispose();
    plate.material.map = made.texture;
    plate.material.needsUpdate = true;
    plate.userData.text = key;
  }

  /* ---------- 3D: Energiefluss ---------- */

  southern() {
    const c = this._hass && this._hass.config;
    return !!(c && typeof c.latitude === 'number' && c.latitude < 0);
  }

  // Platz an einer Seite des Hauptbaus. f ist der Anteil entlang der Seite.
  // Steht an dieser Stelle ein Anbau im Erdgeschoss, rückt das Gerät vor dessen
  // Außenwand. rot dreht die Vorderseite des Geräts vom Haus weg.
  sidePlacement(side, f, dev) {
    const cfg = this.config;
    const W = cfg.house.width, D = cfg.house.depth;
    const u = dev.userData;
    const gap = 0.45 + u.d / 2;
    const half = u.w / 2 + 0.2;
    const across = side === 'top' || side === 'bottom';
    const along = across ? -W / 2 + f * W : -D / 2 + f * D;
    const rooms = ((cfg.floors[0] && cfg.floors[0].rooms) || []).map((rm) => ({
      x0: rm.x - W / 2, x1: rm.x - W / 2 + rm.w, z0: rm.z - D / 2, z1: rm.z - D / 2 + rm.d
    })).filter((r) => (across ? r.x0 < along + half && r.x1 > along - half : r.z0 < along + half && r.z1 > along - half));
    if (side === 'top') return { x: along, z: Math.min(-D / 2, ...rooms.map((r) => r.z0)) - gap, rot: Math.PI };
    if (side === 'bottom') return { x: along, z: Math.max(D / 2, ...rooms.map((r) => r.z1)) + gap, rot: 0 };
    if (side === 'left') return { x: Math.min(-W / 2, ...rooms.map((r) => r.x0)) - gap, z: along, rot: -Math.PI / 2 };
    return { x: Math.max(W / 2, ...rooms.map((r) => r.x1)) + gap, z: along, rot: Math.PI / 2 };
  }

  // Wallbox im Carport, sonst in der Garage, an der Wand, die dem Haus am nächsten ist
  carportPlacement() {
    const cfg = this.config;
    const f0 = cfg.floors[0];
    if (!f0) return null;
    const isType = (rm, v) => {
      const t = findRoomType(rm.type);
      return !!(t && t.value === v);
    };
    const rm = f0.rooms.find((r) => isType(r, 'carport')) || f0.rooms.find((r) => isType(r, 'garage'));
    if (!rm) return null;
    const W = cfg.house.width, D = cfg.house.depth;
    const x0 = rm.x - W / 2, x1 = x0 + rm.w, z0 = rm.z - D / 2, z1 = z0 + rm.d;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const ix = Math.min(0.3, rm.w / 2), iz = Math.min(0.3, rm.d / 2);
    const opts = [
      { dist: Math.hypot(x0, cz), x: x0 + ix, z: cz, rot: Math.PI / 2 },
      { dist: Math.hypot(x1, cz), x: x1 - ix, z: cz, rot: -Math.PI / 2 },
      { dist: Math.hypot(cx, z0), x: cx, z: z0 + iz, rot: 0 },
      { dist: Math.hypot(cx, z1), x: cx, z: z1 - iz, rot: Math.PI }
    ];
    return opts.reduce((a, b) => (b.dist < a.dist ? b : a));
  }

  // Baut alles für den Energiefluss. Gibt die vorderste Kante der Geräte an der
  // unteren Seite zurück, damit die Außentafel nicht darauf liegt.
  buildEnergy(roofMesh, rw, rd, hb) {
    const THREE = this.THREE;
    const en = this.config.energy;
    this._energyObjs = {};
    this.flows = [];
    this._pvSouth = this.southern();
    if (!ENERGY_ITEMS.some((it) => en[it.field])) return -Infinity;

    const group = new THREE.Group();
    this._scene.add(group);
    this.energyGroup = group;
    const items = {};
    ENERGY_ITEMS.forEach((it) => { items[it.key] = it; });
    const ext = Math.max(hb.maxX - hb.minX, hb.maxZ - hb.minZ);
    const sh = clamp(ext * 0.1, 0.9, 1.8);      // Höhe der Schilder
    let front = -Infinity;

    // Verteilpunkt im Haus: unter den Modulen, sonst in der Mitte des Hauptbaus
    let hub = new THREE.Vector3(0, 0.15, 0);
    if (en.pv_entity) {
      const panel = this.buildPvPanel(roofMesh, rw, rd);
      const sprite = this.makeEnergySprite(items.pv, sh);
      sprite.position.set(0, 0, 0.5 + sh / 2);
      panel.add(sprite);
      this.pvPanel = panel;
      const pc = panel.getWorldPosition(new THREE.Vector3());
      hub = new THREE.Vector3(pc.x, 0.15, pc.z);
      const flow = this.makeFlow(items.pv, [pc, hub]);
      group.add(flow.line);
      this._energyObjs.pv = { sprite: sprite, flow: flow };
    }
    this._energyHub = hub;

    const place = (key, dev, side, f) => {
      const u = dev.userData;
      const p = side === 'auto'
        ? (this.carportPlacement() || this.sidePlacement('right', f, dev))
        : this.sidePlacement(side, f, dev);
      dev.position.set(p.x, 0, p.z);
      dev.rotation.y = p.rot;
      u.r = Math.max(u.w, u.d) / 2;
      group.add(dev);
      const sprite = this.makeEnergySprite(items[key], sh);
      sprite.position.set(p.x, u.h + 0.35 + sh / 2, p.z);
      group.add(sprite);
      // Leitung vom Verteilpunkt zur Rückseite des Geräts
      const back = new THREE.Vector3(p.x - Math.sin(p.rot) * u.d / 2, 0.15, p.z - Math.cos(p.rot) * u.d / 2);
      const flow = this.makeFlow(items[key], [hub, back]);
      group.add(flow.line);
      this._energyObjs[key] = { device: dev, sprite: sprite, flow: flow };
      if (side === 'bottom') front = Math.max(front, p.z + u.r);
    };
    if (en.heatpump_entity) place('hp', this.makeHeatPump(), en.heatpump_side, 0.3);
    if (en.wallbox_entity) place('wb', this.makeWallbox(), en.wallbox_side, 0.72);
    return front;
  }

  // Module auf der Dachfläche, die am meisten zur Mittagssonne zeigt
  buildPvPanel(roofMesh, rw, rd) {
    const THREE = this.THREE;
    const r = this.config.roof;
    const H = r.height;
    const hw = rw / 2, hd = rd / 2;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const faces = [];
    if (r.type === 'flat') {
      faces.push({ c: V(0, 0.15, 0), u: V(0, 0, -1), n: V(0, 1, 0), len: rd });
    } else if (r.type === 'mono') {
      const sl = Math.hypot(H, rd);
      faces.push({ c: V(0, H / 2, 0), u: V(0, H / sl, rd / sl), n: V(0, rd / sl, -H / sl), len: sl });
    } else {
      const sl = Math.hypot(H, hd);
      faces.push({ c: V(0, H / 2, hd / 2), u: V(0, H / sl, -hd / sl), n: V(0, hd / sl, H / sl), len: sl });
      faces.push({ c: V(0, H / 2, -hd / 2), u: V(0, H / sl, hd / sl), n: V(0, hd / sl, -H / sl), len: sl });
    }
    const want = this.southern() ? 0 : 180;
    const north = this.config.orientation.north;
    const off = (fc) => {
      const v = fc.n.clone().applyAxisAngle(V(0, 1, 0), roofMesh.rotation.y);
      if (Math.hypot(v.x, v.z) < 1e-6) return 0;
      const az = north + Math.atan2(v.x, -v.z) * 180 / Math.PI;
      return Math.abs(((((az - want) % 360) + 540) % 360) - 180);
    };
    const face = faces.reduce((a, b) => (off(b) < off(a) - 1e-6 ? b : a));

    // Beim Walmdach wird die Fläche nach oben schmaler
    const ph = face.len * (r.type === 'flat' ? 0.5 : 0.55);
    const inset = r.type === 'hip' ? Math.min(hw * 0.6, hd) : 0;
    const avail = rw - 2 * inset * (0.5 + ph / (2 * face.len));
    const pw = Math.max(0.6, avail - 2 * Math.max(0.4, rw * 0.08));

    const tex = makePanelTexture(THREE);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, Math.round(pw / 1.1)), Math.max(1, Math.round(ph / 1.8)));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({
      map: tex,
      color: 0x5f6878,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide
    }));
    const x = new THREE.Vector3().crossVectors(face.u, face.n);
    panel.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, face.u, face.n));
    panel.position.copy(face.c).addScaledVector(face.n, 0.06);
    panel.renderOrder = 4;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(panel.geometry),
      new THREE.LineBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.2 }));
    panel.add(edge);
    panel.userData = { edge: edge, w: pw, h: ph };
    roofMesh.add(panel);
    return panel;
  }

  // Außeneinheit der Wärmepumpe, Vorderseite mit Lüfter zeigt nach +z
  makeHeatPump() {
    const THREE = this.THREE;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xd5d9df, roughness: 0.6, metalness: 0.1 }));
    body.position.y = 0.4;
    g.add(body);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.27, 32), new THREE.MeshBasicMaterial({ color: 0x2b3038 }));
    fan.position.set(-0.14, 0.42, 0.212);
    g.add(fan);
    g.userData = { w: 1.0, d: 0.42, h: 0.8 };
    return g;
  }

  // Ladesäule mit Leuchte, die beim Laden grün wird
  makeWallbox() {
    const THREE = this.THREE;
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.3, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.5, metalness: 0.2 }));
    post.position.y = 0.65;
    g.add(post);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.28), new THREE.MeshBasicMaterial({ color: 0x5d6675 }));
    lamp.position.set(0, 1.0, 0.112);
    g.add(lamp);
    g.userData = { w: 0.32, d: 0.22, h: 1.3, lamp: lamp };
    return g;
  }

  // Schild mit Wert, das sich immer zur Kamera dreht
  makeEnergySprite(item, h) {
    const THREE = this.THREE;
    const made = makeBadgeTexture(THREE, item.label, '--', NO_VALUE);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: made.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    }));
    sprite.scale.set(h * made.aspect, h, 1);
    sprite.renderOrder = 7;
    sprite.userData = { text: '', h: h, w: h * made.aspect };
    return sprite;
  }

  updateEnergySprite(sprite, item, w, active) {
    const text = this.fmt().power(w);
    const color = active ? item.color : NO_VALUE;
    const key = text + '|' + color;
    if (sprite.userData.text === key) return;
    const made = makeBadgeTexture(this.THREE, item.label, text, color);
    if (sprite.material.map) sprite.material.map.dispose();
    sprite.material.map = made.texture;
    sprite.material.needsUpdate = true;
    sprite.userData.text = key;
  }

  // Leitung mit wandernden Punkten in Flussrichtung
  makeFlow(item, pts) {
    const THREE = this.THREE;
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      color: item.color,
      transparent: true,
      opacity: 0.12,
      depthWrite: false
    }));
    line.renderOrder = 6;
    const flow = { key: item.key, line: line, dots: [], phase: 0, speed: 0, active: false, pts: [], cum: [0], len: 0 };
    this.setFlowPath(flow, pts);
    const n = clamp(Math.round(flow.len / 0.8), 4, 14);
    const geo = new THREE.SphereGeometry(0.1, 12, 8);
    const mat = new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0.95, depthWrite: false });
    for (let i = 0; i < n; i++) {
      const d = new THREE.Mesh(geo, mat);
      d.visible = false;
      d.renderOrder = 6;
      line.add(d);
      flow.dots.push(d);
    }
    this.placeDots(flow);
    this.flows.push(flow);
    return flow;
  }

  setFlowPath(flow, pts) {
    flow.pts = pts.map((q) => q.clone());
    flow.cum = [0];
    for (let i = 1; i < flow.pts.length; i++) flow.cum.push(flow.cum[i - 1] + flow.pts[i].distanceTo(flow.pts[i - 1]));
    flow.len = flow.cum[flow.cum.length - 1];
    const old = flow.line.geometry;
    flow.line.geometry = new this.THREE.BufferGeometry().setFromPoints(flow.pts);
    if (old) old.dispose();
    this.placeDots(flow);
  }

  pointOnPath(flow, s, out) {
    const pts = flow.pts, cum = flow.cum;
    if (pts.length < 2) return out;
    const dist = s * flow.len;
    let i = 1;
    while (i < pts.length - 1 && cum[i] < dist) i++;
    const seg = cum[i] - cum[i - 1];
    return out.copy(pts[i - 1]).lerp(pts[i], seg > 0 ? clamp((dist - cum[i - 1]) / seg, 0, 1) : 0);
  }

  placeDots(flow) {
    const n = flow.dots.length;
    flow.dots.forEach((d, i) => this.pointOnPath(flow, (i / n + flow.phase) % 1, d.position));
  }

  // Die Leitung der Module folgt dem Dach, wenn die Etagen angehoben werden
  updateFlowPaths() {
    const pv = this._energyObjs && this._energyObjs.pv;
    if (!pv || !this.pvPanel || !this._energyHub) return;
    const pc = this.pvPanel.getWorldPosition(new this.THREE.Vector3());
    this.setFlowPath(pv.flow, [pc, this._energyHub]);
  }

  updateEnergy() {
    const objs = this._energyObjs || {};
    ENERGY_ITEMS.forEach((it) => {
      const o = objs[it.key];
      if (!o) return;
      const w = this.energy[it.key];
      const active = hasValue(w) && w > FLOW_MIN_W;
      this.updateEnergySprite(o.sprite, it, w, active);
      const f = o.flow;
      f.active = active;
      // Schneller bei mehr Leistung, logarithmisch, damit kleine Werte sichtbar bleiben
      f.speed = active ? 0.6 + 0.6 * Math.log10(1 + w / 100) : 0;
      f.line.material.opacity = active ? 0.45 : 0.12;
      f.dots.forEach((d) => { d.visible = active; });
      if (o.device && o.device.userData.lamp) o.device.userData.lamp.material.color.setHex(active ? it.color : 0x5d6675);
    });
    if (this.pvPanel) {
      const w = this.energy.pv;
      const ratio = hasValue(w) ? clamp(w / (this.config.energy.pv_peak * 1000), 0, 1) : 0;
      this.pvPanel.material.color.setHex(mixColor(0x5f6878, 0xffffff, ratio));
      this.pvPanel.userData.edge.material.opacity = 0.2 + 0.8 * ratio;
    }
  }

  // Bewegt die Punkte. Gibt true zurück, solange etwas fließt und zu sehen ist.
  animateFlows(now) {
    const running = this.flows.filter((f) => f.active && f.len > 0 && f.line.visible);
    if (!running.length || !this.energyGroup || !this.energyGroup.visible || this._visible === false) {
      this._flowT = 0;
      return false;
    }
    const dt = this._flowT ? clamp((now - this._flowT) / 1000, 0, 0.1) : 0;
    this._flowT = now;
    running.forEach((f) => {
      f.phase = (f.phase + dt * f.speed / f.len) % 1;
      this.placeDots(f);
    });
    return true;
  }

  // Etwa 25 Bilder pro Sekunde reichen für die Punkte und schonen das Gerät
  scheduleFlowFrame() {
    if (this._flowTimer || this._stopped) return;
    this._flowTimer = setTimeout(() => {
      this._flowTimer = null;
      this.requestRender();
    }, 40);
  }

  stopFlowTimer() {
    if (this._flowTimer) clearTimeout(this._flowTimer);
    this._flowTimer = null;
    this._flowT = 0;
  }

  applyVisibility() {
    this.floorGroups.forEach((g, i) => { g.visible = !this.hiddenFloors.has(i); });
    if (this.roofGroup) this.roofGroup.visible = !this.roofHidden;
    this.labels.forEach((l) => { l.visible = this.labelsVisible; });
    if (this.outdoorMesh) this.outdoorMesh.visible = this.outdoorVisible;
    if (this.compassGroup) this.compassGroup.visible = this.sunVisible;
    if (this.energyGroup) this.energyGroup.visible = this.energyVisible;
    if (this.pvPanel) this.pvPanel.visible = this.energyVisible;
    const pvo = this._energyObjs && this._energyObjs.pv;
    if (pvo) pvo.flow.line.visible = !this.roofHidden;
    this.updateSun(this.isLive() ? Date.now() : this.histBuckets[this.histIndex], true);
    this.requestRender();
  }

  // Sonnenstand aus Standort und Uhrzeit, ersatzweise aus sun.sun
  sunAt(ms) {
    const c = this._hass && this._hass.config;
    if (c && typeof c.latitude === 'number' && typeof c.longitude === 'number') {
      return sunPosition(ms, c.latitude, c.longitude);
    }
    const st = this._hass && this._hass.states && this._hass.states['sun.sun'];
    const a = st && st.attributes;
    if (this.isLive() && a && hasValue(a.azimuth) && hasValue(a.elevation)) {
      return { azimuth: parseFloat(a.azimuth), elevation: parseFloat(a.elevation) };
    }
    return null;
  }

  updateSun(ms, force) {
    if (!this._ready3D || !this.sunMesh || !this._sunLight) return;
    const t = ms || Date.now();
    if (!force && Math.abs(t - (this._sunT || 0)) < 60000) return;
    this._sunT = t;
    const light = this._sunLight;
    const pos = this.sunVisible ? this.sunAt(t) : null;
    this.sunPos = pos;
    const hb = this._houseBounds;
    const cx = (hb.minX + hb.maxX) / 2, cy = (hb.minY + hb.maxY) / 2, cz = (hb.minZ + hb.maxZ) / 2;
    light.target.position.set(cx, cy, cz);
    if (!pos) {
      this.sunMesh.visible = false;
      light.position.set(cx + 20, cy + 30, cz + 16);
      light.intensity = 1.3;
      this.requestRender();
      return;
    }
    const dir = compassToScene(pos.azimuth, pos.elevation, this.config.orientation.north);
    const R = Math.max(hb.maxX - hb.minX, hb.maxZ - hb.minZ, hb.maxY - hb.minY) * 0.9 + 6;
    this.sunMesh.position.set(cx + dir.x * R, cy + dir.y * R, cz + dir.z * R);
    this.sunMesh.visible = pos.elevation > -1;
    if (pos.elevation > 0) {
      light.position.copy(this.sunMesh.position);
      light.intensity = 0.5 + 1.1 * Math.sin(pos.elevation * Math.PI / 180);
    } else {
      // Nachts schwaches Licht von oben, damit die Farben lesbar bleiben
      light.position.set(cx, cy + 30, cz);
      light.intensity = 0.35;
    }
    this.requestRender();
  }

  applyOpacity() {
    this.roomMeshes.forEach((m) => {
      const sel = !!(this.selected && m.userData.fi === this.selected.fi && m.userData.ri === this.selected.ri);
      const base = m.userData.open ? this.opacity * 0.4 : this.opacity;
      m.material.opacity = sel ? Math.min(1, base + 0.45) : base;
      if (m.userData.glow) m.userData.glow.material.opacity = (sel || m.userData.isOpen) ? 1 : (m.userData.open ? 0.8 : 0.4);
    });
    if (this.roofMesh) this.roofMesh.material.opacity = Math.min(0.9, this.opacity + 0.15);
    this.slabMeshes.forEach((s) => { s.material.opacity = Math.min(1, this.opacity + 0.35); });
    this.requestRender();
  }

  /* ---------- 3D: Kamera ---------- */

  // Ausdehnung von Hauptbaukörper, Dach und allen Räumen samt Anbauten
  computeBounds(gap) {
    const cfg = this.config;
    const W = cfg.house.width, D = cfg.house.depth, oh = cfg.roof.overhang;
    const g = gap || 0;
    let total = cfg.floors.length * g;
    cfg.floors.forEach((f) => { total += f.height; });
    const b = {
      minX: -W / 2 - oh, maxX: W / 2 + oh,
      minY: 0, maxY: total + (cfg.roof.type === 'flat' ? 0.3 : cfg.roof.height),
      minZ: -D / 2 - oh, maxZ: D / 2 + oh
    };
    let base = 0;
    cfg.floors.forEach((f) => {
      f.rooms.forEach((rm) => {
        const x0 = rm.x - W / 2, z0 = rm.z - D / 2;
        b.minX = Math.min(b.minX, x0);
        b.maxX = Math.max(b.maxX, x0 + rm.w);
        b.minZ = Math.min(b.minZ, z0);
        b.maxZ = Math.max(b.maxZ, z0 + rm.d);
        b.maxY = Math.max(b.maxY, base + f.height);
      });
      base += f.height + g;
    });
    return b;
  }

  fitBounds() {
    const b = Object.assign({}, this._houseBounds || this.computeBounds());
    const cp = this.compassGroup;
    if (cp && cp.visible) {
      b.minX = Math.min(b.minX, cp.position.x - cp.userData.r);
      b.maxZ = Math.max(b.maxZ, cp.position.z + cp.userData.r);
    }
    const p = this.outdoorMesh;
    if (p && p.visible) {
      b.maxZ = Math.max(b.maxZ, p.position.z + p.userData.h / 2);
      b.minX = Math.min(b.minX, p.position.x - p.userData.w / 2);
      b.maxX = Math.max(b.maxX, p.position.x + p.userData.w / 2);
    }
    if (this.energyGroup && this.energyGroup.visible) {
      const grow = (x, z, r, top) => {
        b.minX = Math.min(b.minX, x - r);
        b.maxX = Math.max(b.maxX, x + r);
        b.minZ = Math.min(b.minZ, z - r);
        b.maxZ = Math.max(b.maxZ, z + r);
        b.maxY = Math.max(b.maxY, top);
      };
      ['hp', 'wb'].forEach((k) => {
        const o = this._energyObjs[k];
        if (!o) return;
        const q = o.device.position;
        grow(q.x, q.z, Math.max(o.device.userData.r, o.sprite.userData.w / 2), o.sprite.position.y + o.sprite.userData.h / 2);
      });
      const pv = this._energyObjs.pv;
      if (pv && this.pvPanel && this.pvPanel.visible && this.roofGroup && this.roofGroup.visible) {
        const q = pv.sprite.getWorldPosition(new this.THREE.Vector3());
        grow(q.x, q.z, pv.sprite.userData.w / 2, q.y + pv.sprite.userData.h / 2);
      }
    }
    return b;
  }

  // Achsen der Kamera aus den Kugelkoordinaten
  cameraBasis(theta, phi) {
    const st = Math.sin(theta), ct = Math.cos(theta), sp = Math.sin(phi), cp = Math.cos(phi);
    return {
      back:  { x: sp * st, y: cp, z: sp * ct },
      right: { x: ct, y: 0, z: -st },
      up:    { x: -st * cp, y: sp, z: -ct * cp }
    };
  }

  // Richtet die Kamera so aus, dass das ganze Haus mittig ins Bild passt.
  // Berechnet wird die tatsächliche Projektion der Eckpunkte, nicht nur eine
  // grobe Kugel, damit das Haus weder angeschnitten noch zu klein ist.
  fitView(resetAngles) {
    if (!this._camera || !this._orbit) return;
    const o = this._orbit;
    if (resetAngles) {
      o.theta = DEFAULT_THETA;
      o.phi = DEFAULT_PHI;
    }
    o.phi = clamp(o.phi, 0.12, Math.PI / 2.02);
    const b = this.fitBounds();
    const corners = [];
    [b.minX, b.maxX].forEach((x) => [b.minY, b.maxY].forEach((y) => [b.minZ, b.maxZ].forEach((z) => corners.push({ x: x, y: y, z: z }))));

    const vfov = this._camera.fov * Math.PI / 180;
    const ty = Math.tan(vfov / 2);
    const tx = ty * (this._camera.aspect || 1);
    const M = 0.84;     // Anteil der Bildfläche, den das Haus höchstens einnimmt
    const B = this.cameraBasis(o.theta, o.phi);
    const dot = (a, c) => a.x * c.x + a.y * c.y + a.z * c.z;
    const target = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: (b.minZ + b.maxZ) / 2 };

    const radiusFor = (t) => {
      let r = 0;
      corners.forEach((c) => {
        const d = { x: c.x - t.x, y: c.y - t.y, z: c.z - t.z };
        const zb = dot(d, B.back);
        r = Math.max(r, zb + Math.abs(dot(d, B.right)) / (M * tx), zb + Math.abs(dot(d, B.up)) / (M * ty), zb + 1);
      });
      return r;
    };

    let r = radiusFor(target);
    for (let k = 0; k < 4; k++) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      corners.forEach((c) => {
        const d = { x: c.x - target.x, y: c.y - target.y, z: c.z - target.z };
        const depth = r - dot(d, B.back);
        const nx = dot(d, B.right) / (depth * tx);
        const ny = dot(d, B.up) / (depth * ty);
        minX = Math.min(minX, nx); maxX = Math.max(maxX, nx);
        minY = Math.min(minY, ny); maxY = Math.max(maxY, ny);
      });
      const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2;
      if (Math.abs(ox) < 0.002 && Math.abs(oy) < 0.002) break;
      // Verschiebung des Zielpunkts in der Bildebene
      const sx = ox * r * tx, sy = oy * r * ty;
      target.x += B.right.x * sx + B.up.x * sy;
      target.y += B.right.y * sx + B.up.y * sy;
      target.z += B.right.z * sx + B.up.z * sy;
      r = radiusFor(target);
    }

    o.target = target;
    o.radius = r;
    this._fitRadius = r;
    this._applyCamera();
  }

  viewKey() {
    if (!this._viewKey) this._viewKey = stableStringify({ t: this.config.title, b: this._boundsKey || '' });
    return this._viewKey;
  }

  applyStoredOrFit() {
    const saved = VIEW_STORE.get(this.viewKey());
    if (saved) {
      this._orbit = { theta: saved.theta, phi: saved.phi, radius: saved.radius, target: Object.assign({}, saved.target) };
      this._fitRadius = saved.fitRadius || saved.radius;
      this._autoFit = !!saved.autoFit;
      this._applyCamera();
    } else {
      this._autoFit = true;
      this.fitView(false);
    }
  }

  _applyCamera() {
    const o = this._orbit;
    const cam = this._camera;
    if (!o || !cam) return;
    o.phi = clamp(o.phi, 0.12, Math.PI / 2.02);
    const fr = this._fitRadius || o.radius || 30;
    o.radius = clamp(o.radius, fr * 0.15, fr * 6);
    const B = this.cameraBasis(o.theta, o.phi);
    cam.position.set(o.target.x + o.radius * B.back.x, o.target.y + o.radius * B.back.y, o.target.z + o.radius * B.back.z);
    cam.lookAt(o.target.x, o.target.y, o.target.z);
    const far = Math.max(1000, o.radius * 20);
    if (cam.far !== far) {
      cam.far = far;
      cam.updateProjectionMatrix();
    }
    VIEW_STORE.set(this.viewKey(), {
      theta: o.theta, phi: o.phi, radius: o.radius, target: Object.assign({}, o.target),
      fitRadius: this._fitRadius, autoFit: this._autoFit
    });
    if (VIEW_STORE.size > 50) VIEW_STORE.delete(VIEW_STORE.keys().next().value);
    this.requestRender();
  }

  rotateBy(dx, dy) {
    this._orbit.theta -= dx * 0.006;
    this._orbit.phi -= dy * 0.006;
    this._applyCamera();
  }

  rotateStep(a) {
    if (!this._orbit) return;
    this._orbit.theta += a;
    this._applyCamera();
  }

  // Verschiebt das Haus in der Bildebene um dx, dy Bildpunkte
  panBy(dx, dy) {
    const o = this._orbit;
    if (!o || !this._camera) return;
    this._autoFit = false;
    const h = this._viewH || 400;
    const k = 2 * o.radius * Math.tan(this._camera.fov * Math.PI / 360) / h;
    const B = this.cameraBasis(o.theta, o.phi);
    o.target.x += (-dx * B.right.x + dy * B.up.x) * k;
    o.target.y += (-dx * B.right.y + dy * B.up.y) * k;
    o.target.z += (-dx * B.right.z + dy * B.up.z) * k;
    // Nicht beliebig weit, damit das Haus nicht verloren geht
    const b = this.fitBounds();
    const ext = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, b.maxY - b.minY);
    o.target.x = clamp(o.target.x, b.minX - ext, b.maxX + ext);
    o.target.y = clamp(o.target.y, b.minY - ext, b.maxY + ext);
    o.target.z = clamp(o.target.z, b.minZ - ext, b.maxZ + ext);
    this._applyCamera();
  }

  zoomBy(factor) {
    if (!this._orbit) return;
    this._autoFit = false;
    this._orbit.radius *= factor;
    this._applyCamera();
  }

  recenter() {
    this._autoFit = true;
    this.fitView(true);
  }

  setPanMode(on) {
    this._panMode = !!on;
    const b = this.querySelector('#pan-mode');
    if (b) {
      b.classList.toggle('active', this._panMode);
      b.setAttribute('aria-pressed', String(this._panMode));
    }
    if (this._canvas) this._canvas.style.cursor = this._panMode ? 'move' : 'grab';
  }

  setAuto(on) {
    this._auto = !!on;
    this._lastT = 0;
    const b = this.querySelector('#auto-rot');
    if (b) {
      b.classList.toggle('active', this._auto);
      b.setAttribute('aria-pressed', String(this._auto));
    }
    this.requestRender();
  }

  /* ---------- 3D: Zeichnen nur bei Bedarf ---------- */

  requestRender() {
    if (this._raf || !this._ready3D || this._stopped) return;
    this._raf = requestAnimationFrame((t) => {
      this._raf = 0;
      this.renderFrame(t);
    });
  }

  renderFrame(t) {
    if (!this._ready3D || this._stopped) return;
    const now = typeof t === 'number' ? t : Date.now();
    if (this._auto && this._visible !== false && !this._pointers.size) {
      const dt = this._lastT ? Math.min(0.1, (now - this._lastT) / 1000) : 1 / 60;
      this._lastT = now;
      this._orbit.theta += 0.25 * dt;
      this._applyCamera();          // fordert das nächste Bild an
    } else {
      this._lastT = 0;
    }
    if (this.animateFlows(now)) this.scheduleFlowFrame();
    this._renderer.render(this._scene, this._camera);
  }

  observe() {
    const root = this.querySelector('.h3d-root');
    const stage = this.querySelector('#canvas-container');
    if (window.ResizeObserver && root && stage) {
      if (!this._ro) this._ro = new ResizeObserver(() => this.onResize());
      this._ro.observe(root);
      this._ro.observe(stage);
    }
    // Außerhalb des sichtbaren Bereichs wird die Dauerdrehung angehalten
    if (window.IntersectionObserver) {
      if (!this._io) {
        this._io = new IntersectionObserver((entries) => {
          this._visible = entries.some((e) => e.isIntersecting);
          if (this._visible) this.requestRender();
        });
      }
      this._io.observe(this);
    }
  }

  unobserve() {
    if (this._ro) this._ro.disconnect();
    if (this._io) this._io.disconnect();
  }

  onResize() {
    const root = this.querySelector('.h3d-root');
    if (root && root.clientWidth > 0) root.classList.toggle('h3d-narrow', root.clientWidth < 640);
    if (!this._ready3D) return;
    const stage = this.querySelector('#canvas-container');
    const w = stage ? stage.clientWidth : 0;
    const h = stage ? stage.clientHeight : 0;
    if (!w || !h || (w === this._viewW && h === this._viewH)) return;
    this._viewW = w;
    this._viewH = h;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
    // Solange niemand verschoben oder gezoomt hat, bleibt das Haus mittig
    if (this._autoFit) this.fitView(false);
    this.requestRender();
  }

  /* ---------- 3D: Bedienung mit Maus und Finger ---------- */

  attachCanvas(el) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('pointerup', (e) => this.onPointerUp(e, false));
    el.addEventListener('pointercancel', (e) => this.onPointerUp(e, true));
    el.addEventListener('lostpointercapture', (e) => {
      if (this._pointers.has(e.pointerId)) this.onPointerUp(e, true);
    });
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this._pointers.size) this._wheelArmed = false;
    });
    el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  onPointerDown(e) {
    if (!this._canvas) return;
    try { this._canvas.setPointerCapture(e.pointerId); } catch (err) { /* nicht unterstützt */ }
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this._wheelArmed = true;
    if (this._pointers.size === 1) {
      const pan = this._panMode || e.button === 1 || e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey;
      this._drag = { mode: pan ? 'pan' : 'rotate', moved: false, sx: e.clientX, sy: e.clientY, click: (e.button || 0) === 0 };
    } else if (this._pointers.size === 2) {
      const p = [...this._pointers.values()];
      this._drag = {
        mode: 'pinch', moved: true, click: false,
        dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y),
        mid: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }
      };
    }
    this._canvas.style.cursor = (this._drag && this._drag.mode === 'pan') ? 'move' : 'grabbing';
  }

  onPointerMove(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.updateHover(e);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const d = this._drag;
    if (!d) return;

    if (d.mode === 'pinch') {
      if (this._pointers.size < 2) return;
      const q = [...this._pointers.values()];
      const dist = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y);
      const mid = { x: (q[0].x + q[1].x) / 2, y: (q[0].y + q[1].y) / 2 };
      if (dist > 0 && d.dist > 0) this.zoomBy(d.dist / dist);
      this.panBy(mid.x - d.mid.x, mid.y - d.mid.y);
      d.dist = dist;
      d.mid = mid;
      return;
    }

    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
    if (!d.moved) return;
    if (d.mode === 'pan') this.panBy(dx, dy);
    else this.rotateBy(dx, dy);
  }

  onPointerUp(e, cancel) {
    const had = this._pointers.has(e.pointerId);
    this._pointers.delete(e.pointerId);
    try { if (this._canvas) this._canvas.releasePointerCapture(e.pointerId); } catch (err) { /* nicht gefangen */ }
    const d = this._drag;
    if (!this._pointers.size) {
      this._drag = null;
      if (this._canvas) this._canvas.style.cursor = this._panMode ? 'move' : 'grab';
      if (had && !cancel && d && d.click && !d.moved) {
        const hit = this.pick(e);
        if (hit) this.selectRoom(hit.userData.fi, hit.userData.ri);
      }
      this.requestRender();
    } else if (this._pointers.size === 1 && d && d.mode === 'pinch') {
      // Nach dem Zwei-Finger-Griff ohne Sprung mit einem Finger weiter
      const rest = [...this._pointers.values()][0];
      this._drag = { mode: this._panMode ? 'pan' : 'rotate', moved: true, sx: rest.x, sy: rest.y, click: false };
    }
  }

  // Das Mausrad zoomt erst, wenn ins Bild geklickt wurde. Sonst bliebe das
  // Scrollen der Seite an der Karte hängen. Strg und Mausrad zoomt immer.
  onWheel(e) {
    if (!this._wheelArmed && !e.ctrlKey && !e.metaKey) {
      const now = Date.now();
      if (now - (this._hintShownAt || 0) > 8000) {
        this._hintShownAt = now;
        this.showHint('Zum Zoomen erst ins Bild klicken oder Strg und Mausrad verwenden');
      }
      return;
    }
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoomBy(Math.exp(clamp(dy, -200, 200) * 0.0015));
  }

  showHint(text) {
    const h = this.querySelector('#hint');
    if (!h) return;
    h.textContent = text;
    h.classList.add('show');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => h.classList.remove('show'), 1800);
  }

  updateHover(e) {
    const now = Date.now();
    if (now - (this._hoverT || 0) < 60 || !this._canvas) return;
    this._hoverT = now;
    this._canvas.style.cursor = this.pick(e) ? 'pointer' : (this._panMode ? 'move' : 'grab');
  }

  pick(e) {
    if (!this._raycaster || !this._camera || !this._canvas) return null;
    const r = this._canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const ndc = new this.THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    // Ohne laufende Zeichenschleife müssen die Matrizen hier aktuell gehalten werden
    this._scene.updateMatrixWorld();
    this._camera.updateMatrixWorld();
    this._raycaster.setFromCamera(ndc, this._camera);
    const visible = this.roomMeshes.filter((m) => !this.hiddenFloors.has(m.userData.fi));
    const hits = this._raycaster.intersectObjects(visible, false);
    return hits.length ? hits[0].object : null;
  }
}

/* ========================== Editor ========================== */

// Eigene Eingabefelder statt ha-textfield. Interne Elemente von Home Assistant
// sind nur registriert, wenn zuvor ein eingebauter Editor sie geladen hat.
// Ist das nicht der Fall, bleibt das Feld eine leere Hülle ohne Funktion.
const INPUT_CSS =
  'width:100%;box-sizing:border-box;padding:10px;border-radius:6px;font-size:14px;' +
  'font-family:inherit;border:1px solid var(--divider-color,#c4c4c4);' +
  'background:var(--card-background-color,#fff);color:var(--primary-text-color,#212121);';

const LABEL_CSS =
  'display:block;font-size:12px;margin-bottom:4px;color:var(--secondary-text-color,#727272);';

const SECTION_CSS =
  'border:1px solid var(--divider-color);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:10px;';

const HINT_CSS = 'font-size:11px;color:var(--secondary-text-color);line-height:1.4;';

function fieldHtml(id, label, type, extra) {
  return '<label style="' + LABEL_CSS + '" for="' + id + '">' + label + '</label>' +
         '<input id="' + id + '" type="' + (type || 'text') + '" ' + (extra || '') +
         ' style="' + INPUT_CSS + '">';
}

function makeField(label, type) {
  const wrap = document.createElement('div');
  const lab = document.createElement('label');
  lab.style.cssText = LABEL_CSS;
  lab.textContent = label;
  const input = document.createElement('input');
  input.type = type || 'text';
  input.style.cssText = INPUT_CSS;
  wrap.appendChild(lab);
  wrap.appendChild(input);
  wrap.input = input;
  return wrap;
}

function typeFieldValue(type) {
  const t = findRoomType(type);
  return t ? t.label : String(type || '');
}

class House3DCardEditor extends HTMLElement {

  setConfig(config) {
    const base = DEFAULT_CONFIG();
    const c = JSON.parse(JSON.stringify(config || {}));
    const en = (c.energy && typeof c.energy === 'object') ? c.energy : {};
    const str = (v) => (typeof v === 'string' ? v : '');
    // Alles Unbekannte unverändert übernehmen. Home Assistant legt hier eigene
    // Angaben ab, etwa grid_options für die Kartengröße oder visibility.
    const next = {
      ...c,
      type: 'custom:house-3d-card',
      title: c.title || '',
      opacity: typeof c.opacity === 'number' ? c.opacity : 40,
      display: MODES.some((m) => m.value === c.display) ? c.display : 'temp',
      house: {
        width: (c.house && c.house.width) || base.house.width,
        depth: (c.house && c.house.depth) || base.house.depth
      },
      roof: {
        type: (c.roof && c.roof.type) || 'gable',
        height: (c.roof && c.roof.height !== undefined) ? c.roof.height : 3,
        overhang: (c.roof && c.roof.overhang !== undefined) ? c.roof.overhang : 0.4,
        axis: (c.roof && c.roof.axis) === 'z' ? 'z' : 'x'
      },
      outdoor: {
        temp_entity: (c.outdoor && typeof c.outdoor.temp_entity === 'string') ? c.outdoor.temp_entity : ''
      },
      orientation: {
        north: (c.orientation && c.orientation.north !== undefined) ? c.orientation.north : 0
      },
      energy: {
        pv_entity: str(en.pv_entity),
        pv_peak: en.pv_peak !== undefined ? en.pv_peak : 10,
        heatpump_entity: str(en.heatpump_entity),
        heatpump_side: SIDES.some((x) => x.value === en.heatpump_side) ? en.heatpump_side : 'right',
        wallbox_entity: str(en.wallbox_entity),
        wallbox_side: (en.wallbox_side === 'auto' || SIDES.some((x) => x.value === en.wallbox_side)) ? en.wallbox_side : 'auto'
      },
      fluctuation: {
        hours: (c.fluctuation && c.fluctuation.hours !== undefined) ? c.fluctuation.hours : 24
      },
      history: {
        hours: (c.history && c.history.hours !== undefined) ? c.history.hours : 0
      },
      floors: (Array.isArray(c.floors) && c.floors.length) ? c.floors : base.floors
    };
    next.floors.forEach((f) => {
      if (!Array.isArray(f.rooms)) f.rooms = [];
      f.rooms.forEach((r) => {
        if (!r.type) r.type = 'room';
        if (r.contacts !== undefined && !Array.isArray(r.contacts)) r.contacts = cleanList(r.contacts);
      });
    });

    // Spielt Home Assistant nur unsere eigene Änderung zurück, ändert sich
    // inhaltlich nichts. Dann bleibt die Oberfläche unangetastet, sonst
    // springt die Etage zurück und Textfelder verlieren den Fokus.
    if (this._config && stableStringify(next) === stableStringify(this._config)) return;

    this._config = next;

    const maxFloor = this._config.floors.length - 1;
    if (typeof this._activeFloor !== 'number' || this._activeFloor > maxFloor) this._activeFloor = 0;
    const rooms = this._config.floors[this._activeFloor].rooms;
    if (this._selRoom === undefined) this._selRoom = null;
    if (this._selRoom !== null && !rooms[this._selRoom]) this._selRoom = null;

    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    // Home Assistant setzt hass bei jeder Zustandsänderung neu, oft mehrmals
    // pro Sekunde. Würde hier neu gerendert, klappte jedes geöffnete Auswahlfeld
    // sofort wieder zu und Textfelder verlören den Fokus.
    if (first) {
      this._render();
      return;
    }
    this.querySelectorAll('ha-selector').forEach((p) => { p.hass = hass; });
  }

  connectedCallback() {
    const cv = this.querySelector('#plan-canvas');
    if (this._cvRo && cv) this._cvRo.observe(cv);
  }

  disconnectedCallback() {
    if (this._cvRo) this._cvRo.disconnect();
  }

  _fire() {
    // Eine eigenständige Kopie senden. Würde this._config selbst übergeben,
    // hielte Home Assistant dieselbe Referenz, die der Editor danach weiter
    // verändert. Beim nächsten Senden fände es keinen Unterschied und
    // verwürfe die Änderung.
    try {
      this.dispatchEvent(new CustomEvent('config-changed', {
        detail: { config: JSON.parse(JSON.stringify(this._config)) },
        bubbles: true,
        composed: true
      }));
    } catch (e) {
      console.error('house-3d-card: Konfiguration konnte nicht übergeben werden:', e);
    }
  }

  _fmt() {
    return fmtFor(this._hass);
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (this._rendered) {
      this._refresh();
      return;
    }
    this._rendered = true;

    const btn = 'padding:8px;border-radius:6px;cursor:pointer;';
    this.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px;padding:8px 0;">

        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--secondary-text-color);">
          <span style="background:#2f6bff;color:#fff;border-radius:4px;padding:2px 7px;font-weight:600;">3D Energy House ${VERSION}</span>
          <span>Steht hier eine ältere Nummer, lädt der Browser noch die alte Datei.</span>
        </div>

        <div>${fieldHtml('f-title', 'Titel (optional)', 'text')}</div>

        <div style="display:flex;gap:12px;">
          <div style="flex:1;">${fieldHtml('f-width', 'Hausbreite in m', 'number', 'step="0.1" min="3" max="40"')}</div>
          <div style="flex:1;">${fieldHtml('f-depth', 'Haustiefe in m', 'number', 'step="0.1" min="3" max="40"')}</div>
        </div>

        <div>
          <div style="font-size:12px;color:var(--secondary-text-color);margin-bottom:6px;">Anzeige beim Öffnen</div>
          <div id="display-buttons" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <button type="button" class="disp-btn" data-mode="temp" style="${btn}">Temperatur</button>
            <button type="button" class="disp-btn" data-mode="hum" style="${btn}">Feuchte</button>
            <button type="button" class="disp-btn" data-mode="both" style="${btn}">Beides</button>
            <button type="button" class="disp-btn" data-mode="fluct" style="${btn}">Schwankung</button>
          </div>
        </div>

        <div style="${SECTION_CSS}">
          <div style="font-weight:600;">Außentemperatur</div>
          <div id="outdoor-field"></div>
          <div style="${HINT_CSS}">Sensor oder Wetter-Entität. Erscheint rechts im Infofeld und als Tafel vor dem Haus.</div>
        </div>

        <div style="${SECTION_CSS}">
          <div style="font-weight:600;">Ausrichtung für Nordpfeil und Sonne</div>
          <div style="font-size:12px;color:var(--secondary-text-color);">Die obere Kante des Grundrisses zeigt nach</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
            <button type="button" class="north-btn" data-north="0" style="${btn}">Norden</button>
            <button type="button" class="north-btn" data-north="90" style="${btn}">Osten</button>
            <button type="button" class="north-btn" data-north="180" style="${btn}">Süden</button>
            <button type="button" class="north-btn" data-north="270" style="${btn}">Westen</button>
          </div>
          <div>${fieldHtml('f-north', 'oder genau in Grad, im Uhrzeigersinn ab Norden', 'number', 'step="1" min="0" max="359"')}</div>
          <div style="${HINT_CSS}">Der Sonnenstand wird aus dem Standort in Home Assistant und der Uhrzeit berechnet, im Rückblick passend zum gewählten Zeitpunkt.</div>
        </div>

        <div style="${SECTION_CSS}">
          <div style="font-weight:600;">Energiefluss</div>
          <div id="pv-field"></div>
          <div>${fieldHtml('f-pv-peak', 'Spitzenleistung der PV-Anlage in kWp', 'number', 'step="0.1" min="0.1" max="10000"')}</div>
          <div style="${HINT_CSS}margin-top:-6px;">Bestimmt, wie hell die Module leuchten. Die Module liegen auf der Dachfläche, die am meisten nach Süden zeigt.</div>
          <div id="hp-field"></div>
          <div>
            <div style="font-size:12px;color:var(--secondary-text-color);margin-bottom:6px;">Wärmepumpe steht im Grundriss</div>
            <div id="hp-sides" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;"></div>
          </div>
          <div id="wb-field"></div>
          <div>
            <div style="font-size:12px;color:var(--secondary-text-color);margin-bottom:6px;">Wallbox steht im Grundriss</div>
            <div id="wb-sides" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;"></div>
          </div>
          <div style="${HINT_CSS}">
            Leistungssensoren in W oder kW. Oben, rechts, unten und links beziehen sich auf den Grundriss unten.
            Auto stellt die Wallbox in den Carport oder die Garage, ohne beides rechts neben das Haus.
          </div>
        </div>

        <div style="${SECTION_CSS}">
          <div style="font-weight:600;">Schwankung und Rückblick</div>
          <div>${fieldHtml('f-fluct', 'Schwankung: Zeitraum in Stunden, 0 schaltet aus', 'number', 'step="1" min="0" max="8760"')}</div>
          <div style="${HINT_CSS}">Zeigt je Raum die Spanne zwischen niedrigster und höchster Temperatur im Zeitraum.</div>
          <div>${fieldHtml('f-hist', 'Rückblick: Zeitraum in Stunden, 0 schaltet aus', 'number', 'step="1" min="0" max="26280"')}</div>
          <div style="${HINT_CSS}">
            Blendet in der Karte einen Schieberegler mit Abspielen-Knopf ein.
            Grundlage für beides sind die Stundenwerte der Langzeitstatistik.
            24 entspricht einem Tag, 168 einer Woche, 8760 einem Jahr.
          </div>
        </div>

        <div style="${SECTION_CSS}">
          <div style="font-weight:600;">Dach</div>
          <div>
            <div style="font-size:12px;color:var(--secondary-text-color);margin-bottom:6px;">Dachform</div>
            <div id="roof-types" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
          </div>
          <div style="display:flex;gap:12px;">
            <div style="flex:1;">${fieldHtml('f-roof-h', 'Dachhöhe in m', 'number', 'step="0.1" min="0.2" max="10"')}</div>
            <div style="flex:1;">${fieldHtml('f-roof-oh', 'Überstand in m', 'number', 'step="0.1" min="0" max="2"')}</div>
          </div>
          <div id="ridge-row">
            <div style="font-size:12px;color:var(--secondary-text-color);margin-bottom:6px;">Firstrichtung</div>
            <div style="display:flex;gap:6px;">
              <button class="axis-btn" type="button" data-axis="x" style="flex:1;${btn}">längs (X)</button>
              <button class="axis-btn" type="button" data-axis="z" style="flex:1;${btn}">quer (Z)</button>
            </div>
          </div>
        </div>

        <div style="${SECTION_CSS}">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:600;">Etagen</div>
            <div style="display:flex;gap:6px;">
              <button id="floor-add" type="button" style="padding:6px 10px;border-radius:6px;cursor:pointer;">+ Etage</button>
              <button id="floor-del" type="button" style="padding:6px 10px;border-radius:6px;cursor:pointer;">Etage entfernen</button>
            </div>
          </div>
          <div id="floor-tabs" style="display:flex;gap:6px;flex-wrap:wrap;"></div>

          <div style="display:flex;gap:12px;">
            <div style="flex:2;">${fieldHtml('f-floor-name', 'Bezeichnung', 'text')}</div>
            <div style="flex:1;">${fieldHtml('f-floor-h', 'Höhe in m', 'number', 'step="0.1" min="1.5" max="6"')}</div>
          </div>

          <div>${fieldHtml('f-plan', 'Grundriss-Bild, z.B. /local/grundriss_eg.png', 'text')}</div>
          <div style="${HINT_CSS}margin-top:-6px;">Bild nach /config/www/ legen und hier als /local/dateiname.png eintragen.</div>

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div style="font-size:12px;color:var(--secondary-text-color);">Räume aufziehen</div>
              <div style="display:flex;gap:6px;">
                <button id="room-add" type="button" style="padding:6px 10px;border-radius:6px;cursor:pointer;">+ Raum</button>
                <button id="annex-add" type="button" style="padding:6px 10px;border-radius:6px;cursor:pointer;">+ Anbau</button>
              </div>
            </div>
            <canvas id="plan-canvas" style="width:100%;border:1px solid var(--divider-color);border-radius:6px;background:#1b1f27;cursor:crosshair;touch-action:none;display:block;"></canvas>
            <div style="${HINT_CSS}margin-top:6px;">
              Rechteck ziehen zum Verschieben, Ecke unten rechts zum Skalieren.
              Anbauten gehören außerhalb des gestrichelten Rahmens.
            </div>
          </div>

          <div>
            <div style="font-size:12px;color:var(--secondary-text-color);margin-bottom:6px;">Räume dieser Etage</div>
            <div id="room-list" style="display:flex;flex-direction:column;gap:4px;"></div>
          </div>

          <div id="room-editor" style="border-top:1px solid var(--divider-color);padding-top:12px;display:flex;flex-direction:column;gap:10px;"></div>
        </div>

      </div>
    `;

    this.querySelector('#f-title').addEventListener('input', (e) => {
      const v = e.target.value.trim();
      if (v) this._config.title = v; else delete this._config.title;
      this._fire();
    });

    // Während des Tippens nur grob absichern, erst beim Verlassen des Feldes
    // auf den erlaubten Bereich begrenzen. Sonst wird aus der ersten Ziffer
    // von "15" sofort das Minimum und die Vorschau springt bei jedem Zeichen.
    const numField = (id, min, max, fallback, set) => {
      const el = this.querySelector(id);
      if (!el) return;
      el.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        if (isNaN(v)) return;
        set(Math.min(max, Math.max(0.1, v)));
        this._drawPlan();
        this._fire();
      });
      el.addEventListener('change', (e) => {
        const v = clampNum(e.target.value, min, max, fallback);
        set(v);
        e.target.value = v;
        this._drawPlan();
        this._fire();
      });
    };

    numField('#f-width',   3,   40,    12,  (v) => { this._config.house.width = v; });
    numField('#f-depth',   3,   40,    10,  (v) => { this._config.house.depth = v; });
    numField('#f-roof-h',  0.2, 10,    3,   (v) => { this._config.roof.height = v; });
    numField('#f-roof-oh', 0,   2,     0.4, (v) => { this._config.roof.overhang = v; });
    numField('#f-hist',    0,   26280, 0,   (v) => { this._config.history.hours = Math.round(v); });
    numField('#f-fluct',   0,   8760,  24,  (v) => { this._config.fluctuation.hours = Math.round(v); });
    numField('#f-north',   0,   359,   0,   (v) => { this._config.orientation.north = Math.round(v) % 360; });

    this.querySelectorAll('.north-btn').forEach((b) => {
      b.addEventListener('click', () => {
        this._config.orientation.north = parseInt(b.dataset.north, 10);
        this._refresh();
        this._fire();
      });
    });

    this._outdoorEl = this._sensorField(
      this.querySelector('#outdoor-field'), 'Außentemperatur-Sensor (optional)', 'out',
      () => this._config.outdoor.temp_entity,
      (v) => { this._config.outdoor.temp_entity = v; },
      'f-outdoor'
    );

    this._energyEls = {
      pv_entity: this._sensorField(this.querySelector('#pv-field'), 'PV-Leistung (optional)', 'power',
        () => this._config.energy.pv_entity, (v) => { this._config.energy.pv_entity = v; }, 'f-pv', 'sensor.pv_leistung'),
      heatpump_entity: this._sensorField(this.querySelector('#hp-field'), 'Leistung der Wärmepumpe (optional)', 'power',
        () => this._config.energy.heatpump_entity, (v) => { this._config.energy.heatpump_entity = v; }, 'f-hp', 'sensor.waermepumpe_leistung'),
      wallbox_entity: this._sensorField(this.querySelector('#wb-field'), 'Leistung der Wallbox (optional)', 'power',
        () => this._config.energy.wallbox_entity, (v) => { this._config.energy.wallbox_entity = v; }, 'f-wb', 'sensor.wallbox_leistung')
    };
    numField('#f-pv-peak', 0.1, 10000, 10, (v) => { this._config.energy.pv_peak = v; });

    const sideButtons = (boxId, cls, withAuto, set) => {
      const box = this.querySelector(boxId);
      (withAuto ? [{ value: 'auto', label: 'Auto' }] : []).concat(SIDES).forEach((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.dataset.side = o.value;
        b.textContent = o.label;
        b.style.cssText = btn;
        b.addEventListener('click', () => {
          set(o.value);
          this._refresh();
          this._fire();
        });
        box.appendChild(b);
      });
    };
    sideButtons('#hp-sides', 'hp-side-btn', false, (v) => { this._config.energy.heatpump_side = v; });
    sideButtons('#wb-sides', 'wb-side-btn', true, (v) => { this._config.energy.wallbox_side = v; });

    const roofBox = this.querySelector('#roof-types');
    ROOF_TYPES.forEach((rt) => {
      const b = document.createElement('button');
      b.className = 'roof-btn';
      b.dataset.type = rt.value;
      b.textContent = rt.label;
      b.type = 'button';
      b.style.cssText = 'flex:1;min-width:90px;' + btn;
      b.addEventListener('click', () => {
        this._config.roof.type = rt.value;
        this._refresh();
        this._fire();
      });
      roofBox.appendChild(b);
    });

    this.querySelectorAll('.disp-btn').forEach((b) => {
      b.addEventListener('click', () => {
        this._config.display = b.dataset.mode;
        this._refresh();
        this._fire();
      });
    });

    this.querySelectorAll('.axis-btn').forEach((b) => {
      b.addEventListener('click', () => {
        this._config.roof.axis = b.dataset.axis;
        this._refresh();
        this._fire();
      });
    });

    this.querySelector('#floor-add').addEventListener('click', () => {
      if (this._config.floors.length >= 5) return;
      this._config.floors.push({ name: 'Etage ' + (this._config.floors.length + 1), height: 2.5, floorplan: '', rooms: [] });
      this._activeFloor = this._config.floors.length - 1;
      this._selRoom = null;
      this._refresh();
      this._fire();
    });

    this.querySelector('#floor-del').addEventListener('click', () => {
      if (this._config.floors.length <= 1) return;
      this._config.floors.splice(this._activeFloor, 1);
      this._activeFloor = Math.max(0, this._activeFloor - 1);
      this._selRoom = null;
      this._refresh();
      this._fire();
    });

    this.querySelector('#f-floor-name').addEventListener('input', (e) => {
      this._config.floors[this._activeFloor].name = e.target.value;
      this._buildFloorTabs();
      this._fire();
    });

    this.querySelector('#f-floor-h').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (isNaN(v)) return;
      this._config.floors[this._activeFloor].height = Math.min(6, Math.max(0.5, v));
      this._fire();
    });

    this.querySelector('#f-floor-h').addEventListener('change', (e) => {
      const v = clampNum(e.target.value, 1.5, 6, 2.6);
      this._config.floors[this._activeFloor].height = v;
      e.target.value = v;
      this._fire();
    });

    this.querySelector('#f-plan').addEventListener('input', (e) => {
      this._config.floors[this._activeFloor].floorplan = e.target.value.trim();
      this._loadPlanImage();
      this._fire();
    });

    this.querySelector('#room-add').addEventListener('click', () => this._addRoom('room'));
    this.querySelector('#annex-add').addEventListener('click', () => this._addRoom('annex'));

    this._setupCanvas();
    this._refresh();
  }

  // Auswahlfeld für eine Entität. ha-selector nur verwenden, wenn es
  // registriert ist, sonst ein eigenes Feld mit Vorschlagsliste.
  _sensorField(container, label, kind, get, set, id, placeholder) {
    if (window.customElements && window.customElements.get('ha-selector')) {
      const picker = document.createElement('ha-selector');
      picker.hass = this._hass;
      picker.selector = { entity: { filter: { domain: SENSOR_DOMAINS[kind] } } };
      picker.label = label;
      picker.value = get() || '';
      picker.addEventListener('value-changed', (e) => {
        set(e.detail.value || '');
        this._fire();
      });
      container.appendChild(picker);
      return picker;
    }
    const wrap = makeField(label, 'text');
    const inp = wrap.input;
    inp.id = id;
    inp.value = get() || '';
    inp.setAttribute('list', this._ensureDatalist(kind).id);
    inp.setAttribute('placeholder', placeholder || (kind === 'hum' ? 'sensor.bad_luftfeuchtigkeit' : 'sensor.wohnzimmer_temperatur'));
    inp.addEventListener('input', (e) => {
      set(e.target.value.trim());
      this._fire();
    });
    container.appendChild(wrap);
    return inp;
  }

  // Fenster- und Türkontakte eines Raumes, beliebig viele
  _contactsField(container, room) {
    if (!Array.isArray(room.contacts)) room.contacts = [];
    const wrap = document.createElement('div');
    const lab = document.createElement('label');
    lab.style.cssText = LABEL_CSS;
    lab.textContent = 'Fenster- und Türkontakte (optional)';
    wrap.appendChild(lab);

    if (window.customElements && window.customElements.get('ha-selector')) {
      const picker = document.createElement('ha-selector');
      picker.hass = this._hass;
      picker.selector = { entity: { multiple: true, filter: { domain: 'binary_sensor' } } };
      picker.value = room.contacts.slice();
      picker.addEventListener('value-changed', (e) => {
        const v = e.detail.value;
        room.contacts = Array.isArray(v) ? v.filter((x) => x) : (v ? [v] : []);
        this._buildRoomList();
        this._fire();
      });
      wrap.appendChild(picker);
      container.appendChild(wrap);
      return;
    }

    const listId = this._ensureDatalist('contact').id;
    const list = document.createElement('div');
    list.id = 'room-contacts';
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    const btnCss = 'padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);font-family:inherit;';
    const render = () => {
      list.innerHTML = '';
      room.contacts.forEach((id, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'contact-field';
        inp.style.cssText = INPUT_CSS;
        inp.value = id;
        inp.setAttribute('list', listId);
        inp.setAttribute('placeholder', 'binary_sensor.fenster_bad');
        inp.addEventListener('input', (e) => {
          room.contacts[i] = e.target.value.trim();
          this._fire();
        });
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'contact-del';
        del.textContent = 'entfernen';
        del.style.cssText = btnCss + 'color:var(--error-color,#c0392b);flex-shrink:0;';
        del.addEventListener('click', () => {
          room.contacts.splice(i, 1);
          render();
          this._buildRoomList();
          this._fire();
        });
        row.appendChild(inp);
        row.appendChild(del);
        list.appendChild(row);
      });
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'contact-add';
      add.textContent = '+ Kontakt';
      add.style.cssText = btnCss + 'align-self:flex-start;';
      add.addEventListener('click', () => {
        room.contacts.push('');
        render();
        const fields = list.querySelectorAll('.contact-field');
        if (fields.length && typeof fields[fields.length - 1].focus === 'function') fields[fields.length - 1].focus();
      });
      list.appendChild(add);
    };
    render();
    wrap.appendChild(list);
    container.appendChild(wrap);
  }

  // Eine Vorschlagsliste je Messgröße, gefiltert nach Einheit und Geräteklasse.
  // Findet der Filter nichts, werden alle passenden Domänen angeboten.
  _ensureDatalist(kind) {
    const id = 'house3d-' + kind + '-entities';
    let dl = this.querySelector('#' + id);
    if (dl) return dl;
    dl = document.createElement('datalist');
    dl.id = id;
    const states = (this._hass && this._hass.states) || {};
    let ids = Object.keys(states).filter((eid) => matchesKind(kind, eid, states[eid]));
    if (!ids.length) ids = Object.keys(states).filter((eid) => SENSOR_DOMAINS[kind].indexOf(domainOf(eid)) >= 0);
    ids.sort().forEach((eid) => {
      const o = document.createElement('option');
      o.value = eid;
      const fn = states[eid] && states[eid].attributes && states[eid].attributes.friendly_name;
      if (fn) o.label = fn;
      dl.appendChild(o);
    });
    this.appendChild(dl);
    return dl;
  }

  _overlaps(rooms, x, z, w, d) {
    return rooms.some((r) => x < r.x + r.w && x + w > r.x && z < r.z + r.d && z + d > r.z);
  }

  // Sucht eine freie Stelle im angegebenen Bereich. Gibt null zurück, wenn alles belegt ist.
  _findFreeSpot(rooms, w, d, x0, x1, z0, z1) {
    const step = 0.5;
    for (let z = z0; z <= z1 - d + 0.001; z += step) {
      for (let x = x0; x <= x1 - w + 0.001; x += step) {
        if (!this._overlaps(rooms, x, z, w, d)) return { x: round1(x), z: round1(z) };
      }
    }
    return null;
  }

  _addRoom(type) {
    const f = this._config.floors[this._activeFloor];
    const b = this._bounds();
    const gap = 0.2;
    let w = 3, d = 3, spot = null;

    if (type === 'annex') {
      w = round1(Math.max(1, Math.min(3, b.mx - gap)));
      d = round1(Math.max(1, Math.min(3, b.D)));
      // Streifen rechts, unten, links, oben nacheinander absuchen
      const strips = [
        [b.W + gap, b.W + b.mx, 0, b.D],
        [0, b.W, b.D + gap, b.D + b.mz],
        [-b.mx, -gap, 0, b.D],
        [0, b.W, -b.mz, -gap]
      ];
      for (const st of strips) {
        spot = this._findFreeSpot(f.rooms, w, d, st[0], st[1], st[2], st[3]);
        if (spot) break;
      }
    } else {
      spot = this._findFreeSpot(f.rooms, w, d, 0, b.W, 0, b.D);
    }

    // Ist alles belegt, versetzt anlegen statt deckungsgleich stapeln
    if (!spot) {
      const minX = type === 'annex' ? b.W + gap : 0;
      let off = 0.5;
      let x = minX, z = 0;
      while (this._overlaps(f.rooms, x, z, w, d) && off < 30) {
        x = round1(minX + off);
        z = round1(off);
        off += 0.5;
      }
      spot = {
        x: round1(Math.max(-b.mx, Math.min(b.W + b.mx - w, x))),
        z: round1(Math.max(-b.mz, Math.min(b.D + b.mz - d, z)))
      };
    }

    f.rooms.push({ name: '', type: type, x: spot.x, z: spot.z, w: w, d: d, temp_entity: '', hum_entity: '', contacts: [] });
    this._selRoom = f.rooms.length - 1;
    this._buildRoomList();
    this._buildRoomEditor(true);
    this._drawPlan();
    this._fire();
  }

  _deleteRoom(index) {
    const f = this._config.floors[this._activeFloor];
    if (!f.rooms[index]) return;
    f.rooms.splice(index, 1);
    if (this._selRoom === index) this._selRoom = null;
    else if (this._selRoom !== null && this._selRoom > index) this._selRoom--;
    this._buildRoomList();
    this._buildRoomEditor(true);
    this._drawPlan();
    this._fire();
  }

  _buildRoomList() {
    const box = this.querySelector('#room-list');
    if (!box) return;
    const f = this._config.floors[this._activeFloor];
    const fm = this._fmt();
    box.innerHTML = '';

    if (!f.rooms.length) {
      box.innerHTML = '<div style="font-size:12px;color:var(--secondary-text-color);">Noch keine Räume. Mit „+ Raum“ anlegen.</div>';
      return;
    }

    f.rooms.forEach((r, i) => {
      const row = document.createElement('div');
      const active = i === this._selRoom;
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;border:1px solid ' +
        (active ? 'var(--primary-color)' : 'var(--divider-color)') + ';background:' +
        (active ? 'rgba(127,127,127,0.12)' : 'transparent') + ';';

      const swatch = document.createElement('span');
      swatch.style.cssText = 'width:12px;height:12px;border-radius:3px;flex-shrink:0;background:' + toCss(roomColor(r)) + ';';
      row.appendChild(swatch);

      const label = document.createElement('button');
      label.type = 'button';
      label.style.cssText = 'flex:1;text-align:left;background:transparent;border:0;color:var(--primary-text-color);cursor:pointer;font-size:13px;padding:2px 0;font-family:inherit;';
      const nm = (r.name || '').trim();
      label.innerHTML = (nm !== ''
        ? '<span>' + esc(nm) + '</span>'
        : '<span style="opacity:.55;font-style:italic;">ohne Namen</span>') +
        '<span style="opacity:.55;font-size:11px;"> &middot; ' + esc(roomTypeLabel(r.type)) + ' &middot; ' +
        fm.dim(r.w) + ' × ' + fm.dim(r.d) + ' m</span>';
      label.addEventListener('click', () => {
        this._selRoom = i;
        this._buildRoomList();
        this._buildRoomEditor(true);
        this._drawPlan();
      });
      row.appendChild(label);

      const del = document.createElement('button');
      del.type = 'button';
      del.title = 'Raum löschen';
      del.textContent = 'löschen';
      del.style.cssText = 'background:transparent;border:1px solid var(--divider-color);border-radius:5px;color:var(--error-color,#c0392b);cursor:pointer;font-size:11px;padding:4px 8px;flex-shrink:0;font-family:inherit;';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteRoom(i);
      });
      row.appendChild(del);

      box.appendChild(row);
    });
  }

  _buildFloorTabs() {
    const tabs = this.querySelector('#floor-tabs');
    tabs.innerHTML = '';
    this._config.floors.forEach((f, i) => {
      const b = document.createElement('button');
      const active = i === this._activeFloor;
      b.textContent = f.name || ('Etage ' + (i + 1));
      b.type = 'button';
      b.style.cssText = 'padding:8px 12px;border-radius:6px;cursor:pointer;border:1px solid var(--divider-color);' +
        (active ? 'background:var(--primary-color);color:var(--text-primary-color);font-weight:600;' : 'background:transparent;color:var(--primary-text-color);');
      b.addEventListener('click', () => {
        this._activeFloor = i;
        this._selRoom = null;
        this._refresh();
      });
      tabs.appendChild(b);
    });
  }

  _refresh() {
    if (!this._rendered) return;

    const setField = (id, val) => {
      const el = this.querySelector(id);
      if (el && document.activeElement !== el) el.value = val;
    };
    setField('#f-title', this._config.title || '');
    setField('#f-width', this._config.house.width);
    setField('#f-depth', this._config.house.depth);
    setField('#f-roof-h', this._config.roof.height);
    setField('#f-roof-oh', this._config.roof.overhang);
    setField('#f-hist', this._config.history.hours);
    setField('#f-fluct', this._config.fluctuation.hours);
    setField('#f-north', this._config.orientation.north);
    if (this._outdoorEl && document.activeElement !== this._outdoorEl) {
      this._outdoorEl.value = this._config.outdoor.temp_entity || '';
    }
    setField('#f-pv-peak', this._config.energy.pv_peak);
    Object.keys(this._energyEls || {}).forEach((k) => {
      const el = this._energyEls[k];
      if (el && document.activeElement !== el) el.value = this._config.energy[k] || '';
    });

    const paint = (b, active) => {
      b.style.border = '1px solid var(--divider-color)';
      b.style.background = active ? 'var(--primary-color)' : 'transparent';
      b.style.color = active ? 'var(--text-primary-color)' : 'var(--primary-text-color)';
      b.style.fontWeight = active ? '600' : '400';
    };
    this.querySelectorAll('.roof-btn').forEach((b) => paint(b, b.dataset.type === this._config.roof.type));
    this.querySelectorAll('.axis-btn').forEach((b) => paint(b, b.dataset.axis === this._config.roof.axis));
    this.querySelectorAll('.disp-btn').forEach((b) => paint(b, b.dataset.mode === this._config.display));
    this.querySelectorAll('.north-btn').forEach((b) => paint(b, parseInt(b.dataset.north, 10) === Math.round(Number(this._config.orientation.north) || 0)));
    this.querySelectorAll('.hp-side-btn').forEach((b) => paint(b, b.dataset.side === this._config.energy.heatpump_side));
    this.querySelectorAll('.wb-side-btn').forEach((b) => paint(b, b.dataset.side === this._config.energy.wallbox_side));

    const showRidge = this._config.roof.type === 'gable' || this._config.roof.type === 'mono';
    this.querySelector('#ridge-row').style.display = showRidge ? 'block' : 'none';

    this._buildFloorTabs();

    const floor = this._config.floors[this._activeFloor];
    setField('#f-floor-name', floor.name || '');
    setField('#f-floor-h', floor.height);
    setField('#f-plan', floor.floorplan || '');

    this._loadPlanImage();
    this._buildRoomList();
    this._buildRoomEditor();
  }

  _loadPlanImage() {
    const floor = this._config.floors[this._activeFloor];
    const src = floor.floorplan;
    if (!src) {
      this._planImg = null;
      this._planImgSrc = '';
      this._drawPlan();
      return;
    }
    if (this._planImgSrc === src) {
      this._drawPlan();
      return;
    }
    const img = new Image();
    this._planImgSrc = src;
    this._planImg = null;
    img.onload = () => { if (this._planImgSrc === src) { this._planImg = img; this._drawPlan(); } };
    img.onerror = () => { if (this._planImgSrc === src) { this._planImg = null; this._drawPlan(); } };
    img.src = src;
    this._drawPlan();
  }

  // Zeichenbereich: Hauptbaukörper plus Rand für Anbauten. Liegt ein Raum
  // weiter außen, wächst der Bereich mit, damit er sichtbar und greifbar bleibt.
  _bounds() {
    if (this._dragBounds) return this._dragBounds;
    const W = this._config.house.width;
    const D = this._config.house.depth;
    const mx = round1(Math.max(2, W * 0.3));
    const mz = round1(Math.max(2, D * 0.3));
    let minX = -mx, maxX = W + mx, minZ = -mz, maxZ = D + mz;
    this._config.floors.forEach((f) => (f.rooms || []).forEach((r) => {
      minX = Math.min(minX, r.x - 1);
      maxX = Math.max(maxX, r.x + r.w + 1);
      minZ = Math.min(minZ, r.z - 1);
      maxZ = Math.max(maxZ, r.z + r.d + 1);
    }));
    return { W: W, D: D, mx: mx, mz: mz, minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ, totalW: maxX - minX, totalD: maxZ - minZ };
  }

  _drawPlan() {
    const cv = this.querySelector('#plan-canvas');
    if (!cv) return;

    const b = this._bounds();
    const cssW = cv.clientWidth || 400;
    const cssH = Math.max(140, cssW * (b.totalD / b.totalW));

    cv.style.height = cssH + 'px';
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);

    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const s = cssW / b.totalW;
    const px = (x) => (x - b.minX) * s;
    const pz = (z) => (z - b.minZ) * s;
    const fm = this._fmt();

    // Außenbereich für Anbauten
    ctx.fillStyle = '#15181f';
    ctx.fillRect(0, 0, cssW, cssH);

    // Hausfläche
    const hx = px(0), hy = pz(0), hw = b.W * s, hh = b.D * s;
    if (this._planImg) {
      ctx.drawImage(this._planImg, hx, hy, hw, hh);
    } else {
      ctx.fillStyle = '#1b1f27';
      ctx.fillRect(hx, hy, hw, hh);
      ctx.strokeStyle = '#2a303c';
      ctx.lineWidth = 1;
      for (let m = 1; m < b.W; m++) {
        ctx.beginPath(); ctx.moveTo(px(m), hy); ctx.lineTo(px(m), hy + hh); ctx.stroke();
      }
      for (let m = 1; m < b.D; m++) {
        ctx.beginPath(); ctx.moveTo(hx, pz(m)); ctx.lineTo(hx + hw, pz(m)); ctx.stroke();
      }
    }

    // Umriss des Hauptbaukörpers
    ctx.strokeStyle = '#4a5568';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeRect(hx, hy, hw, hh);
    ctx.setLineDash([]);

    ctx.fillStyle = '#5d6675';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Hauptbaukörper, außerhalb sind Anbauten möglich', 4, 4);

    const floor = this._config.floors[this._activeFloor];
    floor.rooms.forEach((r, i) => {
      const sel = i === this._selRoom;
      const x = px(r.x), y = pz(r.z), w = r.w * s, h = r.d * s;
      const col = toCss(roomColor(r));

      ctx.globalAlpha = sel ? 0.55 : 0.35;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = sel ? '#2f6bff' : col;
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(x, y, w, h);

      // Beschriftung mittig im Raum
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, y + 2, Math.max(0, w - 4), Math.max(0, h - 4));
      ctx.clip();

      const cx = x + w / 2;
      const cy = y + h / 2;
      const nm = (r.name || '').trim();
      const showSize = h > 34;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (nm !== '') {
        ctx.fillStyle = '#fff';
        ctx.font = '600 11px sans-serif';
        ctx.fillText(nm, cx, showSize ? cy - 7 : cy);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = 'italic 10px sans-serif';
        ctx.fillText('ohne Namen', cx, showSize ? cy - 7 : cy);
      }
      if (showSize) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '9px sans-serif';
        ctx.fillText(fm.dim(r.w) + ' × ' + fm.dim(r.d) + ' m', cx, cy + 7);
      }
      ctx.restore();

      if (sel) {
        ctx.fillStyle = '#2f6bff';
        ctx.fillRect(x + w - 11, y + h - 11, 11, 11);
      }
    });
  }

  _setupCanvas() {
    const cv = this.querySelector('#plan-canvas');
    let mode = null, startX = 0, startY = 0, orig = null;

    const toPlan = (e) => {
      const r = cv.getBoundingClientRect();
      const b = this._bounds();
      const s = r.width / b.totalW;
      return { x: (e.clientX - r.left) / s + b.minX, z: (e.clientY - r.top) / s + b.minZ, s: s, b: b };
    };

    cv.addEventListener('pointerdown', (e) => {
      this._dragBounds = null;
      const p = toPlan(e);
      const floor = this._config.floors[this._activeFloor];

      let hit = null, handle = false;
      for (let i = floor.rooms.length - 1; i >= 0; i--) {
        const r = floor.rooms[i];
        const hx = r.x + r.w, hz = r.z + r.d;
        const handleSize = 12 / p.s;
        if (p.x >= hx - handleSize && p.x <= hx && p.z >= hz - handleSize && p.z <= hz) { hit = i; handle = true; break; }
        if (p.x >= r.x && p.x <= hx && p.z >= r.z && p.z <= hz) { hit = i; break; }
      }

      if (hit === null) {
        this._selRoom = null;
        this._drawPlan();
        this._buildRoomList();
        this._buildRoomEditor(true);
        return;
      }

      this._selRoom = hit;
      mode = handle ? 'resize' : 'move';
      startX = p.x;
      startY = p.z;
      orig = Object.assign({}, floor.rooms[hit]);
      // Bereich während des Ziehens einfrieren, sonst wächst er mit und das Bild springt
      this._dragBounds = p.b;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* nicht unterstützt */ }
      this._drawPlan();
      this._buildRoomList();
      this._buildRoomEditor(true);
    });

    cv.addEventListener('pointermove', (e) => {
      if (!mode || this._selRoom === null) return;
      const p = toPlan(e);
      const r = this._config.floors[this._activeFloor].rooms[this._selRoom];
      if (!r) return;
      const b = p.b;
      if (mode === 'move') {
        r.x = round1(Math.max(b.minX, Math.min(b.maxX - orig.w, orig.x + (p.x - startX))));
        r.z = round1(Math.max(b.minZ, Math.min(b.maxZ - orig.d, orig.z + (p.z - startY))));
      } else {
        r.w = round1(Math.max(0.5, Math.min(b.maxX - r.x, orig.w + (p.x - startX))));
        r.d = round1(Math.max(0.5, Math.min(b.maxZ - r.z, orig.d + (p.z - startY))));
      }
      this._drawPlan();
      this._syncRoomFields();
    });

    const finish = (e) => {
      if (!mode) return;
      mode = null;
      this._dragBounds = null;
      try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* nicht gefangen */ }
      this._drawPlan();
      this._buildRoomList();
      this._fire();
    };
    cv.addEventListener('pointerup', finish);
    cv.addEventListener('pointercancel', finish);

    if (window.ResizeObserver) {
      this._cvRo = new ResizeObserver(() => this._drawPlan());
      this._cvRo.observe(cv);
    }
  }

  _buildRoomEditor(force) {
    const box = this.querySelector('#room-editor');
    const floor = this._config.floors[this._activeFloor];

    if (this._selRoom === null || !floor.rooms[this._selRoom]) {
      box.innerHTML = '<div style="font-size:12px;color:var(--secondary-text-color);">Kein Raum ausgewählt. Auf ein Rechteck klicken oder Raum hinzufügen.</div>';
      this._editorKey = null;
      return;
    }

    // Felder nur neu aufbauen, wenn ein anderer Raum gewählt wurde.
    // Sonst verliert das Namensfeld beim Tippen den Fokus.
    const key = this._activeFloor + ':' + this._selRoom;
    if (!force && this._editorKey === key) {
      this._syncRoomFields();
      return;
    }
    this._editorKey = key;

    const room = floor.rooms[this._selRoom];
    box.innerHTML = '';

    const nameWrap = makeField('Raumname (optional)', 'text');
    const nameF = nameWrap.input;
    nameF.id = 'room-name-field';
    nameF.value = room.name || '';
    nameF.addEventListener('input', (e) => {
      room.name = e.target.value;
      this._drawPlan();
      this._buildRoomList();
      this._fire();
    });
    box.appendChild(nameWrap);

    // Raumtyp frei eingebbar, die bekannten Typen dienen als Vorschlag
    const typeWrap = makeField('Raumtyp (frei wählbar)', 'text');
    const typeF = typeWrap.input;
    typeF.id = 'room-type-field';
    typeF.setAttribute('list', 'house3d-roomtypes');
    typeF.setAttribute('placeholder', 'z.B. Hobbyraum');
    typeF.value = typeFieldValue(room.type);
    typeF.addEventListener('input', (e) => {
      room.type = e.target.value;
      this._drawPlan();
      this._buildRoomList();
      this._syncColorField();
      this._fire();
    });
    if (!this.querySelector('#house3d-roomtypes')) {
      const dl = document.createElement('datalist');
      dl.id = 'house3d-roomtypes';
      ROOM_TYPES.forEach((rt) => {
        const o = document.createElement('option');
        o.value = rt.label;
        dl.appendChild(o);
      });
      this.appendChild(dl);
    }
    box.appendChild(typeWrap);

    // Eigene Farbe, greift wenn kein Sensor hinterlegt ist
    const colorRow = document.createElement('div');
    colorRow.style.cssText = 'display:flex;align-items:flex-end;gap:10px;';
    const colorWrap = makeField('Farbe ohne Sensor', 'color');
    const colorF = colorWrap.input;
    colorF.id = 'room-color-field';
    colorF.style.cssText = INPUT_CSS + 'padding:4px;height:42px;cursor:pointer;';
    colorF.value = room.color || toCss(roomTypeColor(room.type));
    colorF.addEventListener('input', (e) => {
      room.color = e.target.value;
      this._drawPlan();
      this._buildRoomList();
      this._fire();
    });
    colorWrap.style.flex = '1';
    colorRow.appendChild(colorWrap);
    const resetColor = document.createElement('button');
    resetColor.type = 'button';
    resetColor.textContent = 'Farbe des Typs';
    resetColor.style.cssText = 'padding:10px;border-radius:6px;cursor:pointer;border:1px solid var(--divider-color,#c4c4c4);background:transparent;color:var(--primary-text-color,#212121);font-family:inherit;white-space:nowrap;';
    resetColor.addEventListener('click', () => {
      delete room.color;
      this._syncColorField();
      this._drawPlan();
      this._buildRoomList();
      this._fire();
    });
    colorRow.appendChild(resetColor);
    box.appendChild(colorRow);

    this._sensorField(box, 'Temperatur-Sensor (optional)', 'temp',
      () => room.temp_entity, (v) => { room.temp_entity = v; }, 'room-entity-field');
    this._sensorField(box, 'Feuchte-Sensor (optional)', 'hum',
      () => room.hum_entity, (v) => { room.hum_entity = v; }, 'room-hum-field');
    this._contactsField(box, room);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;';
    const fields = [
      { key: 'x', label: 'Position X in m', min: -60 },
      { key: 'z', label: 'Position Z in m', min: -60 },
      { key: 'w', label: 'Breite in m',      min: 0.5 },
      { key: 'd', label: 'Tiefe in m',       min: 0.5 }
    ];
    fields.forEach((f) => {
      const wrap = makeField(f.label, 'number');
      const tf = wrap.input;
      tf.step = '0.1';
      tf.className = 'room-num';
      tf.dataset.key = f.key;
      tf.value = room[f.key];
      tf.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        if (isNaN(v)) return;
        room[f.key] = Math.min(60, Math.max(-60, v));
        this._drawPlan();
        this._fire();
      });
      tf.addEventListener('change', (e) => {
        const v = clampNum(e.target.value, f.min, 60, room[f.key]);
        room[f.key] = v;
        e.target.value = v;
        this._drawPlan();
        this._buildRoomList();
        this._fire();
      });
      grid.appendChild(wrap);
    });
    box.appendChild(grid);

    const dup = document.createElement('button');
    dup.type = 'button';
    dup.textContent = 'Raum duplizieren';
    dup.style.cssText = 'padding:8px;border-radius:6px;cursor:pointer;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);';
    dup.addEventListener('click', () => {
      const copy = Object.assign({}, room);
      copy.x = round1(Math.min(room.x + 1, 60));
      copy.z = round1(Math.min(room.z + 1, 60));
      floor.rooms.push(copy);
      this._selRoom = floor.rooms.length - 1;
      this._buildRoomList();
      this._buildRoomEditor(true);
      this._drawPlan();
      this._fire();
    });
    box.appendChild(dup);
  }

  _syncColorField() {
    const floor = this._config.floors[this._activeFloor];
    if (this._selRoom === null || !floor.rooms[this._selRoom]) return;
    const room = floor.rooms[this._selRoom];
    const cf = this.querySelector('#room-color-field');
    if (cf) cf.value = room.color || toCss(roomTypeColor(room.type));
  }

  _syncRoomFields() {
    const floor = this._config.floors[this._activeFloor];
    if (this._selRoom === null || !floor.rooms[this._selRoom]) return;
    const room = floor.rooms[this._selRoom];
    const set = (id, val) => {
      const el = this.querySelector(id);
      if (el && document.activeElement !== el) el.value = val;
    };
    set('#room-name-field', room.name || '');
    set('#room-type-field', typeFieldValue(room.type));
    set('#room-color-field', room.color || toCss(roomTypeColor(room.type)));
    set('#room-entity-field', room.temp_entity || '');
    set('#room-hum-field', room.hum_entity || '');
    this.querySelectorAll('.room-num').forEach((tf) => {
      if (document.activeElement !== tf) tf.value = room[tf.dataset.key];
    });
  }
}

/* ========================== Anmeldung ========================== */

// Wird die Datei zweimal eingebunden, etwa einmal manuell und einmal über HACS,
// bleibt die zuerst geladene Version aktiv. Ein Hinweis in der Konsole nennt beide.
(function register() {
  const existing = window.customElements.get(CARD_TAG);
  if (existing) {
    console.warn('3D Energy House ' + VERSION + ' wurde nicht geladen, weil bereits Version ' +
      (existing.VERSION || 'unbekannt') + ' aktiv ist. Bitte die doppelte Einbindung entfernen.');
    return;
  }
  window.customElements.define(CARD_TAG, House3DCard);
  if (!window.customElements.get(EDITOR_TAG)) window.customElements.define(EDITOR_TAG, House3DCardEditor);

  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === CARD_TAG)) {
    window.customCards.push({
      type: CARD_TAG,
      name: '3D Energy House',
      description: 'Drehbares 3D-Haus mit Etagen, Temperatur, Luftfeuchtigkeit, Außentemperatur und Schwankung',
      preview: false,
      documentationURL: 'https://github.com/Lutarym/3d-Energy-House'
    });
  }
  console.info('%c 3D-ENERGY-HOUSE %c ' + VERSION + ' ',
    'background:#2f6bff;color:#fff;border-radius:3px 0 0 3px',
    'background:#1c2029;color:#fff;border-radius:0 3px 3px 0');
})();
