const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const VERSION = '2.2.1';

const ROOF_TYPES = [
  { value: 'flat',  label: 'Flachdach' },
  { value: 'gable', label: 'Satteldach' },
  { value: 'hip',   label: 'Walmdach' },
  { value: 'mono',  label: 'Pultdach' }
];

const ROOM_TYPES = [
  { value: 'room',    label: 'Wohnraum',        color: 0x8892a0 },
  { value: 'hall',    label: 'Flur',            color: 0x6f7e8a },
  { value: 'stairs',  label: 'Treppenhaus',     color: 0xb0763f },
  { value: 'bath',    label: 'Bad',             color: 0x5f8fa6 },
  { value: 'kitchen', label: 'Kueche',          color: 0x8a7f6a },
  { value: 'utility', label: 'Wirtschaftsraum', color: 0x68806c },
  { value: 'storage', label: 'Abstellraum',     color: 0x6b6b78 },
  { value: 'garage',  label: 'Garage',          color: 0x565660 },
  { value: 'annex',   label: 'Anbau',           color: 0x7d6a8f }
];

function roomTypeColor(type) {
  const t = ROOM_TYPES.find((r) => r.value === type);
  return t ? t.color : 0x8892a0;
}

function roomTypeLabel(type) {
  const t = ROOM_TYPES.find((r) => r.value === type);
  return t ? t.label : 'Wohnraum';
}

// Blickwinkel ueberlebt einen Neuaufbau der Karte im Editor
let LAST_VIEW = null;

const DEFAULT_CONFIG = () => ({
  type: 'custom:house-3d-card',
  title: '',
  opacity: 40,
  house: { width: 12, depth: 10 },
  roof: { type: 'gable', height: 3, overhang: 0.4, axis: 'x' },
  floors: [
    { name: 'Erdgeschoss', height: 2.6, floorplan: '', rooms: [] }
  ]
});

function clampNum(v, min, max, fallback) {
  const n = parseFloat(v);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function tempColorHex(value) {
  if (value === undefined || value === null || value === '' || isNaN(parseFloat(value))) return 0x8892a0;
  const t = parseFloat(value);
  if (t <= 15) return 0x2f6bff;
  if (t <= 18) return 0x28c0e8;
  if (t <= 22) return 0x2ecc71;
  if (t <= 25) return 0xf1c40f;
  return 0xe8582c;
}

function toCss(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

function displayName(room, index) {
  const nm = (room.name || '').trim();
  return nm !== '' ? nm : 'Raum ' + (index + 1);
}

function fmtTemp(raw) {
  if (raw === undefined || raw === null || raw === '' || isNaN(parseFloat(raw))) return '--';
  return parseFloat(raw).toFixed(1);
}

/* ===================== Dach-Geometrie ===================== */

function buildRoofGeometry(THREE, type, W, D, H) {
  if (type === 'flat') {
    return new THREE.BoxGeometry(W, 0.3, D);
  }

  const hw = W / 2, hd = D / 2;
  let positions = [];

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

/* ========================== CARD ========================== */

class House3DCard extends HTMLElement {

  static getConfigElement() {
    return document.createElement('house-3d-card-editor');
  }

  static getStubConfig() {
    return DEFAULT_CONFIG();
  }

  setConfig(config) {
    const c = config || {};
    this.config = {
      title: c.title || '',
      opacity: typeof c.opacity === 'number' ? c.opacity : 40,
      house: {
        width: clampNum(c.house && c.house.width, 3, 40, 12),
        depth: clampNum(c.house && c.house.depth, 3, 40, 10)
      },
      roof: {
        type: (c.roof && c.roof.type) || 'gable',
        height: clampNum(c.roof && c.roof.height, 0.2, 10, 3),
        overhang: clampNum(c.roof && c.roof.overhang, 0, 2, 0.4),
        axis: (c.roof && c.roof.axis) === 'z' ? 'z' : 'x'
      },
      floors: Array.isArray(c.floors) && c.floors.length ? c.floors.map((f) => ({
        name: f.name || 'Etage',
        height: clampNum(f.height, 1.5, 6, 2.6),
        floorplan: f.floorplan || '',
        rooms: Array.isArray(f.rooms) ? f.rooms.map((r) => ({
          name: typeof r.name === 'string' ? r.name : '',
          type: r.type || 'room',
          x: clampNum(r.x, -60, 60, 0),
          z: clampNum(r.z, -60, 60, 0),
          w: clampNum(r.w, 0.5, 60, 3),
          d: clampNum(r.d, 0.5, 60, 3),
          temp_entity: r.temp_entity || ''
        })) : []
      })) : DEFAULT_CONFIG().floors
    };

    this.opacity = this.config.opacity / 100;

    if (this._built) {
      this.buildSidebar();
      this.rebuildScene();
      this.updateTemperatures();
    }
  }

  set hass(hass) {
    this._hass = hass;
    this.updateTemperatures();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 10;
  }

  connectedCallback() {
    if (this._built) return;
    this._built = true;

    this.selected = null;
    this.temps = {};
    this.floorGroups = [];
    this.roomMeshes = [];
    this.hiddenFloors = new Set();
    this.roofHidden = false;

    this.innerHTML = `
      <ha-card style="overflow:hidden;">
        <div id="card-title" style="padding:14px 16px 0;font-size:16px;font-weight:600;"></div>
        <div style="display:flex;height:620px;background:#12141a;font-family:var(--paper-font-body1_-_font-family,sans-serif);color:#fff;">

          <div style="width:230px;background:#0d0f14;border-right:1px solid #262a33;display:flex;flex-direction:column;overflow-y:auto;flex-shrink:0;">
            <div style="padding:12px;border-bottom:1px solid #262a33;">
              <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#7c8595;margin-bottom:8px;">Ansicht</div>
              <div id="floor-toggles" style="display:flex;flex-direction:column;gap:4px;"></div>
            </div>
            <div style="padding:12px;border-bottom:1px solid #262a33;">
              <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#7c8595;margin-bottom:8px;">Temperatur</div>
              <div style="display:flex;flex-direction:column;gap:4px;font-size:11px;">
                <div style="display:flex;align-items:center;gap:8px;"><span style="width:12px;height:12px;background:#2f6bff;border-radius:2px;flex-shrink:0;"></span>bis 15 &deg;C</div>
                <div style="display:flex;align-items:center;gap:8px;"><span style="width:12px;height:12px;background:#28c0e8;border-radius:2px;flex-shrink:0;"></span>15 bis 18 &deg;C</div>
                <div style="display:flex;align-items:center;gap:8px;"><span style="width:12px;height:12px;background:#2ecc71;border-radius:2px;flex-shrink:0;"></span>18 bis 22 &deg;C</div>
                <div style="display:flex;align-items:center;gap:8px;"><span style="width:12px;height:12px;background:#f1c40f;border-radius:2px;flex-shrink:0;"></span>22 bis 25 &deg;C</div>
                <div style="display:flex;align-items:center;gap:8px;"><span style="width:12px;height:12px;background:#e8582c;border-radius:2px;flex-shrink:0;"></span>ab 25 &deg;C</div>
                <div style="display:flex;align-items:center;gap:8px;"><span style="width:12px;height:12px;background:#8892a0;border-radius:2px;flex-shrink:0;"></span>kein Wert</div>
              </div>
            </div>
            <div style="padding:12px;flex:1;">
              <div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#7c8595;margin-bottom:8px;">Raeume</div>
              <div id="rooms-list" style="display:flex;flex-direction:column;gap:10px;"></div>
            </div>
          </div>

          <div style="flex:1;position:relative;min-width:0;">
            <div id="canvas-container" style="width:100%;height:100%;"></div>
            <div id="status" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#7c8595;font-size:13px;padding:16px;text-align:center;pointer-events:none;">3D wird geladen</div>
            <div style="position:absolute;top:10px;right:10px;display:flex;gap:6px;z-index:5;">
              <button id="rot-left"  title="links drehen"  style="width:32px;height:32px;background:#1c2029;color:#fff;border:1px solid #333a46;border-radius:6px;cursor:pointer;">&#8630;</button>
              <button id="rot-right" title="rechts drehen" style="width:32px;height:32px;background:#1c2029;color:#fff;border:1px solid #333a46;border-radius:6px;cursor:pointer;">&#8631;</button>
              <button id="auto-rot"  title="Dauerdrehung"  style="height:32px;padding:0 10px;background:#1c2029;color:#fff;border:1px solid #333a46;border-radius:6px;cursor:pointer;font-size:12px;">Auto</button>
              <button id="reset-cam" title="Ansicht zuruecksetzen" style="height:32px;padding:0 10px;background:#1c2029;color:#fff;border:1px solid #333a46;border-radius:6px;cursor:pointer;font-size:12px;">Reset</button>
            </div>
            <div style="position:absolute;bottom:10px;left:10px;right:10px;display:flex;align-items:center;gap:10px;z-index:5;">
              <span style="font-size:11px;color:#7c8595;white-space:nowrap;">Transparenz</span>
              <input id="opacity" type="range" min="5" max="100" value="40" style="flex:1;cursor:pointer;">
            </div>
          </div>

          <div style="width:230px;background:#0d0f14;border-left:1px solid #262a33;padding:12px;display:flex;flex-direction:column;flex-shrink:0;">
            <div id="info-panel" style="flex:1;display:flex;flex-direction:column;gap:10px;">
              <div style="color:#7c8595;font-size:13px;text-align:center;padding:24px 0;">Raum waehlen</div>
            </div>
          </div>

        </div>
      </ha-card>
    `;

    this.buildSidebar();
    this.loadThree();
  }

  disconnectedCallback() {
    this._stopped = true;
    if (this._ro) this._ro.disconnect();
  }

  showError(msg) {
    console.error('house-3d-card:', msg);
    const s = this.querySelector('#status');
    if (!s) return;
    s.style.display = 'flex';
    s.style.color = '#e8582c';
    s.textContent = msg;
  }

  async loadThree() {
    try {
      if (!window.__three_module) window.__three_module = await import(THREE_URL);
      this.THREE = window.__three_module;
    } catch (e) {
      this.showError('Three.js konnte nicht geladen werden: ' + e.message);
      return;
    }
    try {
      this.querySelector('#status').style.display = 'none';
      this.initThree();
      this.updateTemperatures();
    } catch (e) {
      this.showError('3D-Aufbau fehlgeschlagen: ' + e.message);
    }
  }

  /* ---------- Sidebar ---------- */

  buildSidebar() {
    const titleEl = this.querySelector('#card-title');
    titleEl.textContent = this.config.title || '';
    titleEl.style.display = this.config.title ? 'block' : 'none';

    const opSlider = this.querySelector('#opacity');
    opSlider.value = this.config.opacity;

    const toggles = this.querySelector('#floor-toggles');
    toggles.innerHTML = '';

    this.config.floors.forEach((f, i) => {
      toggles.appendChild(this.makeToggle(f.name, !this.hiddenFloors.has(i), (on) => {
        if (on) this.hiddenFloors.delete(i); else this.hiddenFloors.add(i);
        this.applyVisibility();
      }));
    });

    toggles.appendChild(this.makeToggle('Dach', !this.roofHidden, (on) => {
      this.roofHidden = !on;
      this.applyVisibility();
    }));

    this.buildRoomsList();
  }

  makeToggle(label, checked, cb) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding:4px 6px;border-radius:4px;background:#161a21;';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.style.cssText = 'cursor:pointer;margin:0;';
    box.addEventListener('change', () => cb(box.checked));
    row.appendChild(box);
    const txt = document.createElement('span');
    txt.textContent = label;
    row.appendChild(txt);
    return row;
  }

  buildRoomsList() {
    const list = this.querySelector('#rooms-list');
    list.innerHTML = '';

    this.config.floors.forEach((floor, fi) => {
      const head = document.createElement('div');
      head.style.cssText = 'font-size:10px;color:#5d6675;text-transform:uppercase;letter-spacing:.06em;margin-top:4px;';
      head.textContent = floor.name;
      list.appendChild(head);

      floor.rooms.forEach((room, ri) => {
        const btn = document.createElement('button');
        btn.dataset.floor = String(fi);
        btn.dataset.room = String(ri);
        btn.style.cssText = 'padding:8px;background:#161a21;border:1px solid #262a33;border-radius:5px;color:#fff;cursor:pointer;text-align:left;font-size:12px;font-family:inherit;width:100%;';
        this.paintRoomButton(btn, fi, ri);
        btn.addEventListener('click', () => this.selectRoom(fi, ri));
        list.appendChild(btn);
      });
    });
  }

  tempKey(fi, ri) {
    return fi + ':' + ri;
  }

  paintRoomButton(btn, fi, ri) {
    const room = this.config.floors[fi].rooms[ri];
    const raw = this.temps[this.tempKey(fi, ri)];
    const c = toCss(tempColorHex(raw));
    btn.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${displayName(room, ri)}</span>
        <span style="font-weight:700;color:${c};white-space:nowrap;">${fmtTemp(raw)}&deg;</span>
      </div>
    `;
  }

  updateTemperatures() {
    if (!this._built || !this._hass || !this.config) return;

    this.config.floors.forEach((floor, fi) => {
      floor.rooms.forEach((room, ri) => {
        const key = this.tempKey(fi, ri);
        if (!room.temp_entity) { this.temps[key] = undefined; return; }
        const st = this._hass.states[room.temp_entity];
        let val = st ? st.state : undefined;
        if (st && st.attributes && st.attributes.current_temperature !== undefined) {
          val = st.attributes.current_temperature;
        }
        this.temps[key] = val;

        const mesh = this.roomMeshes.find((m) => m.userData.fi === fi && m.userData.ri === ri);
        if (mesh) {
          const hasVal = !(val === undefined || val === null || val === '' || isNaN(parseFloat(val)));
          const c = hasVal ? tempColorHex(val) : roomTypeColor(room.type);
          mesh.material.color.setHex(c);
          if (mesh.userData.glow) mesh.userData.glow.material.color.setHex(c);
        }
      });
    });

    this.querySelectorAll('#rooms-list button').forEach((btn) => {
      this.paintRoomButton(btn, parseInt(btn.dataset.floor, 10), parseInt(btn.dataset.room, 10));
    });

    if (this.selected) this.updateInfoPanel(this.selected.fi, this.selected.ri);
  }

  selectRoom(fi, ri) {
    this.selected = { fi, ri };

    this.querySelectorAll('#rooms-list button').forEach((b) => {
      const active = parseInt(b.dataset.floor, 10) === fi && parseInt(b.dataset.room, 10) === ri;
      b.style.background = active ? '#1e2531' : '#161a21';
      b.style.borderColor = active ? toCss(tempColorHex(this.temps[this.tempKey(fi, ri)])) : '#262a33';
    });

    this.applyOpacity();
    this.updateInfoPanel(fi, ri);
  }

  updateInfoPanel(fi, ri) {
    const floor = this.config.floors[fi];
    if (!floor) return;
    const room = floor.rooms[ri];
    if (!room) return;

    const raw = this.temps[this.tempKey(fi, ri)];
    const c = toCss(tempColorHex(raw));
    const area = (room.w * room.d).toFixed(1);

    this.querySelector('#info-panel').innerHTML = `
      <div style="font-weight:600;font-size:14px;">${displayName(room, ri)}</div>
      <div style="font-size:11px;color:#7c8595;margin-top:-6px;">${floor.name} &middot; ${roomTypeLabel(room.type)}</div>
      <div style="background:#161a21;border:1px solid #262a33;border-radius:6px;padding:16px;text-align:center;">
        <div style="font-size:11px;color:#7c8595;margin-bottom:6px;">Temperatur</div>
        <div style="font-size:30px;font-weight:700;color:${c};line-height:1;">${fmtTemp(raw)}<span style="font-size:15px;">&deg;C</span></div>
      </div>
      <div style="background:#161a21;border:1px solid #262a33;border-radius:6px;padding:10px;font-size:12px;display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;justify-content:space-between;"><span style="color:#7c8595;">Flaeche</span><span>${area} m&sup2;</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#7c8595;">Breite</span><span>${room.w} m</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#7c8595;">Tiefe</span><span>${room.d} m</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#7c8595;">Hoehe</span><span>${floor.height} m</span></div>
      </div>
      <div style="margin-top:auto;padding-top:10px;border-top:1px solid #262a33;font-size:10px;color:#5d6675;word-break:break-all;">
        ${room.temp_entity || 'keine Entity konfiguriert'}
      </div>
    `;
  }

  /* ---------- 3D ---------- */

  applyVisibility() {
    this.floorGroups.forEach((g, i) => { g.visible = !this.hiddenFloors.has(i); });
    if (this.roofGroup) this.roofGroup.visible = !this.roofHidden;
  }

  applyOpacity() {
    this.roomMeshes.forEach((m) => {
      const sel = this.selected && m.userData.fi === this.selected.fi && m.userData.ri === this.selected.ri;
      m.material.opacity = sel ? Math.min(1, this.opacity + 0.45) : this.opacity;
      if (m.userData.glow) m.userData.glow.material.opacity = sel ? 1 : 0.4;
    });
    if (this.roofMesh) this.roofMesh.material.opacity = Math.min(0.9, this.opacity + 0.15);
    this.slabMeshes.forEach((s) => { s.material.opacity = Math.min(1, this.opacity + 0.35); });
  }

  rebuildScene() {
    if (!this._scene || !this.THREE) return;
    const THREE = this.THREE;

    [...this.floorGroups, this.roofGroup].forEach((g) => {
      if (!g) return;
      g.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      this._scene.remove(g);
    });

    this.floorGroups = [];
    this.roomMeshes = [];
    this.slabMeshes = [];
    this.roofGroup = null;
    this.roofMesh = null;
    this.selected = null;

    this.buildHouse(THREE);
    this.applyVisibility();
    this.applyOpacity();
    // Blickwinkel bleibt erhalten, nur bei ungueltigem Abstand neu setzen
    if (!this._orbit || !this._orbit.radius) this.frameCamera();
  }

  buildHouse(THREE) {
    const W = this.config.house.width;
    const D = this.config.house.depth;
    const loader = new THREE.TextureLoader();

    let baseY = 0;

    this.config.floors.forEach((floor, fi) => {
      const group = new THREE.Group();

      // Bodenplatte mit optionalem Grundriss
      const slabMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: Math.min(1, this.opacity + 0.35),
        side: THREE.DoubleSide
      });
      if (floor.floorplan) {
        loader.load(
          floor.floorplan,
          (tex) => {
            if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
            slabMat.map = tex;
            slabMat.needsUpdate = true;
          },
          undefined,
          () => console.warn('house-3d-card: Grundriss nicht ladbar:', floor.floorplan)
        );
      } else {
        slabMat.color.setHex(0x232935);
      }

      const slab = new THREE.Mesh(new THREE.PlaneGeometry(W, D), slabMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(0, baseY + 0.02, 0);
      slab.renderOrder = 0;
      group.add(slab);
      this.slabMeshes.push(slab);

      // Raeume
      floor.rooms.forEach((room, ri) => {
        const geo = new THREE.BoxGeometry(room.w, floor.height, room.d);
        const mat = new THREE.MeshStandardMaterial({
          color: roomTypeColor(room.type),
          transparent: true,
          opacity: this.opacity,
          depthWrite: false,
          roughness: 0.65,
          metalness: 0.05
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
          room.x + room.w / 2 - W / 2,
          baseY + floor.height / 2,
          room.z + room.d / 2 - D / 2
        );
        mesh.userData = { fi, ri, name: displayName(room, ri) };
        mesh.renderOrder = 2;

        const glow = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: roomTypeColor(room.type), transparent: true, opacity: 0.4 })
        );
        mesh.add(glow);
        mesh.userData.glow = glow;

        group.add(mesh);
        this.roomMeshes.push(mesh);
      });

      this._scene.add(group);
      this.floorGroups.push(group);
      baseY += floor.height;
    });

    this.totalHeight = baseY;

    // Dach
    const r = this.config.roof;
    const oh = r.overhang;
    const roofGroup = new THREE.Group();

    let rw = W + 2 * oh;
    let rd = D + 2 * oh;
    if (r.axis === 'z' && (r.type === 'gable' || r.type === 'mono')) {
      const t = rw; rw = rd; rd = t;
    }

    const roofGeo = buildRoofGeometry(THREE, r.type, rw, rd, r.height);
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x6b4f3f,
      transparent: true,
      opacity: Math.min(0.9, this.opacity + 0.15),
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.02
    });
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.y = baseY + (r.type === 'flat' ? 0.15 : 0);
    if (r.axis === 'z' && (r.type === 'gable' || r.type === 'mono')) {
      roofMesh.rotation.y = Math.PI / 2;
    }
    roofMesh.renderOrder = 3;

    const roofEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(roofGeo),
      new THREE.LineBasicMaterial({ color: 0x3a2c24, transparent: true, opacity: 0.6 })
    );
    roofMesh.add(roofEdges);

    roofGroup.add(roofMesh);
    this._scene.add(roofGroup);
    this.roofGroup = roofGroup;
    this.roofMesh = roofMesh;
  }

  frameCamera() {
    if (!this._orbit) return;
    const W = this.config.house.width;
    const D = this.config.house.depth;
    const H = (this.totalHeight || 5) + this.config.roof.height;
    this._orbit.target.set(0, H / 2, 0);
    this._orbit.radius = Math.max(W, D, H) * 1.9;
    this._applyCamera();
  }

  initThree() {
    const THREE = this.THREE;
    const container = this.querySelector('#canvas-container');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12141a);
    this._scene = scene;

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.3);
    d1.position.set(20, 30, 16);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.5);
    d2.position.set(-18, 12, -14);
    scene.add(d2);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 800);
    this._camera = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(renderer.domElement);
    const el = renderer.domElement;
    el.style.display = 'block';
    el.style.cursor = 'grab';
    el.style.touchAction = 'none';

    this.slabMeshes = [];
    scene.add(new THREE.GridHelper(60, 60, 0x2a303c, 0x1c212a));

    this._orbit = LAST_VIEW
      ? { theta: LAST_VIEW.theta, phi: LAST_VIEW.phi, radius: LAST_VIEW.radius, target: new THREE.Vector3(LAST_VIEW.tx, LAST_VIEW.ty, LAST_VIEW.tz) }
      : { theta: Math.PI * 0.25, phi: Math.PI * 0.34, radius: 30, target: new THREE.Vector3(0, 4, 0) };
    this._applyCamera = () => {
      const o = this._orbit;
      o.phi = Math.max(0.12, Math.min(Math.PI / 2.02, o.phi));
      camera.position.set(
        o.target.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta),
        o.target.y + o.radius * Math.cos(o.phi),
        o.target.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta)
      );
      camera.lookAt(o.target);
      LAST_VIEW = { theta: o.theta, phi: o.phi, radius: o.radius, tx: o.target.x, ty: o.target.y, tz: o.target.z };
    };

    this.buildHouse(THREE);
    this.applyVisibility();
    this.applyOpacity();
    if (!LAST_VIEW) this.frameCamera(); else this._applyCamera();

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();

    let dragging = false, moved = false, lastX = 0, lastY = 0;

    el.addEventListener('pointerdown', (e) => {
      dragging = true; moved = false;
      lastX = e.clientX; lastY = e.clientY;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });

    el.addEventListener('pointermove', (e) => {
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        this._orbit.theta -= dx * 0.006;
        this._orbit.phi   -= dy * 0.006;
        lastX = e.clientX; lastY = e.clientY;
        this._applyCamera();
      } else {
        el.style.cursor = this.pick(e, el) ? 'pointer' : 'grab';
      }
    });

    el.addEventListener('pointerup', (e) => {
      dragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (!moved) {
        const hit = this.pick(e, el);
        if (hit) this.selectRoom(hit.userData.fi, hit.userData.ri);
      }
    });

    el.addEventListener('pointercancel', () => { dragging = false; });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._orbit.radius = Math.max(6, Math.min(160, this._orbit.radius + e.deltaY * 0.03));
      this._applyCamera();
    }, { passive: false });

    this.querySelector('#rot-left').addEventListener('click', () => { this._orbit.theta += 0.4; this._applyCamera(); });
    this.querySelector('#rot-right').addEventListener('click', () => { this._orbit.theta -= 0.4; this._applyCamera(); });
    this.querySelector('#reset-cam').addEventListener('click', () => {
      this._orbit.theta = Math.PI * 0.25;
      this._orbit.phi = Math.PI * 0.34;
      this.frameCamera();
    });

    this._auto = false;
    const autoBtn = this.querySelector('#auto-rot');
    autoBtn.addEventListener('click', () => {
      this._auto = !this._auto;
      autoBtn.style.background = this._auto ? '#2f6bff' : '#1c2029';
    });

    this.querySelector('#opacity').addEventListener('input', (e) => {
      this.opacity = parseInt(e.target.value, 10) / 100;
      this.applyOpacity();
    });

    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    this._ro = new ResizeObserver(resize);
    this._ro.observe(container);

    const loop = () => {
      if (this._stopped) return;
      requestAnimationFrame(loop);
      if (this._auto && !dragging) { this._orbit.theta += 0.003; this._applyCamera(); }
      renderer.render(scene, camera);
    };
    loop();
  }

  pick(event, el) {
    if (!this._raycaster) return null;
    const r = el.getBoundingClientRect();
    this._pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
    this._pointer.y = -((event.clientY - r.top) / r.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this._camera);
    const visible = this.roomMeshes.filter((m) => !this.hiddenFloors.has(m.userData.fi));
    const hits = this._raycaster.intersectObjects(visible, false);
    return hits.length ? hits[0].object : null;
  }
}

customElements.define('house-3d-card', House3DCard);

/* ========================== EDITOR ========================== */

class House3DCardEditor extends HTMLElement {

  setConfig(config) {
    // Kommt die Aenderung von uns selbst, ist unser Zustand bereits aktuell.
    // Ohne diese Sperre wuerde bei jedem Tastendruck der ganze Editor neu
    // aufgebaut: Etage springt auf die erste, Textfelder verlieren den Fokus.
    if (this._selfUpdate) { this._selfUpdate = false; return; }

    const base = DEFAULT_CONFIG();
    const c = JSON.parse(JSON.stringify(config || {}));
    this._config = {
      type: 'custom:house-3d-card',
      title: c.title || '',
      opacity: typeof c.opacity === 'number' ? c.opacity : 40,
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
      floors: (Array.isArray(c.floors) && c.floors.length) ? c.floors : base.floors
    };
    this._config.floors.forEach((f) => {
      if (!Array.isArray(f.rooms)) f.rooms = [];
      f.rooms.forEach((r) => { if (!r.type) r.type = 'room'; });
    });

    const maxFloor = this._config.floors.length - 1;
    if (typeof this._activeFloor !== 'number' || this._activeFloor > maxFloor) this._activeFloor = 0;
    const rooms = this._config.floors[this._activeFloor].rooms;
    if (this._selRoom !== null && this._selRoom !== undefined && !rooms[this._selRoom]) this._selRoom = null;
    if (this._selRoom === undefined) this._selRoom = null;

    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _fire() {
    this._selfUpdate = true;
    try {
      this.dispatchEvent(new CustomEvent('config-changed', {
        detail: { config: this._config },
        bubbles: true,
        composed: true
      }));
    } catch (e) {
      this._selfUpdate = false;
      console.error('house-3d-card: Konfiguration konnte nicht uebergeben werden:', e);
    }
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (this._rendered) { this._refresh(); return; }
    this._rendered = true;

    this.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:18px;padding:8px 0;">

        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--secondary-text-color);">
          <span style="background:#2f6bff;color:#fff;border-radius:4px;padding:2px 7px;font-weight:600;">3D Energy House ${VERSION}</span>
          <span>Steht hier eine aeltere Nummer, laedt der Browser noch die alte Datei.</span>
        </div>

        <ha-textfield id="f-title" label="Titel (optional)" style="width:100%;"></ha-textfield>

        <div style="display:flex;gap:12px;">
          <ha-textfield id="f-width" type="number" label="Hausbreite in m" style="flex:1;"></ha-textfield>
          <ha-textfield id="f-depth" type="number" label="Haustiefe in m" style="flex:1;"></ha-textfield>
        </div>

        <div style="border:1px solid var(--divider-color);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:12px;">
          <div style="font-weight:600;">Dach</div>
          <div>
            <div style="font-size:12px;color:var(--secondary-text-color);margin-bottom:6px;">Dachform</div>
            <div id="roof-types" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
          </div>
          <div style="display:flex;gap:12px;">
            <ha-textfield id="f-roof-h"  type="number" label="Dachhoehe in m" style="flex:1;"></ha-textfield>
            <ha-textfield id="f-roof-oh" type="number" label="Ueberstand in m" style="flex:1;"></ha-textfield>
          </div>
          <div id="ridge-row">
            <div style="font-size:12px;color:var(--secondary-text-color);margin-bottom:6px;">Firstrichtung</div>
            <div style="display:flex;gap:6px;">
              <button class="axis-btn" type="button" data-axis="x" style="flex:1;padding:8px;border-radius:6px;cursor:pointer;">laengs (X)</button>
              <button class="axis-btn" type="button" data-axis="z" style="flex:1;padding:8px;border-radius:6px;cursor:pointer;">quer (Z)</button>
            </div>
          </div>
        </div>

        <div style="border:1px solid var(--divider-color);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:600;">Etagen</div>
            <div style="display:flex;gap:6px;">
              <button id="floor-add" type="button" style="padding:6px 10px;border-radius:6px;cursor:pointer;">+ Etage</button>
              <button id="floor-del" type="button" style="padding:6px 10px;border-radius:6px;cursor:pointer;">Etage entfernen</button>
            </div>
          </div>
          <div id="floor-tabs" style="display:flex;gap:6px;flex-wrap:wrap;"></div>

          <div style="display:flex;gap:12px;">
            <ha-textfield id="f-floor-name" label="Bezeichnung" style="flex:2;"></ha-textfield>
            <ha-textfield id="f-floor-h" type="number" label="Hoehe in m" style="flex:1;"></ha-textfield>
          </div>

          <ha-textfield id="f-plan" label="Grundriss-Bild, z.B. /local/grundriss_eg.png" style="width:100%;"></ha-textfield>
          <div style="font-size:11px;color:var(--secondary-text-color);margin-top:-6px;">
            Bild nach /config/www/ legen und hier als /local/dateiname.png eintragen.
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div style="font-size:12px;color:var(--secondary-text-color);">Raeume aufziehen</div>
              <div style="display:flex;gap:6px;">
                <button id="room-add" type="button" style="padding:6px 10px;border-radius:6px;cursor:pointer;">+ Raum</button>
                <button id="annex-add" type="button" style="padding:6px 10px;border-radius:6px;cursor:pointer;">+ Anbau</button>
              </div>
            </div>
            <canvas id="plan-canvas" style="width:100%;border:1px solid var(--divider-color);border-radius:6px;background:#1b1f27;cursor:crosshair;touch-action:none;display:block;"></canvas>
            <div style="font-size:11px;color:var(--secondary-text-color);margin-top:6px;">
              Rechteck ziehen zum Verschieben. Ecke unten rechts zum Skalieren.
              Anbauten gehoeren ausserhalb des gestrichelten Rahmens.
            </div>
          </div>

          <div>
            <div style="font-size:12px;color:var(--secondary-text-color);margin-bottom:6px;">Raeume dieser Etage</div>
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

    const numField = (id, apply) => {
      this.querySelector(id).addEventListener('input', (e) => {
        apply(parseFloat(e.target.value));
        this._drawPlan();
        this._fire();
      });
    };

    numField('#f-width',   (v) => { this._config.house.width = clampNum(v, 3, 40, 12); });
    numField('#f-depth',   (v) => { this._config.house.depth = clampNum(v, 3, 40, 10); });
    numField('#f-roof-h',  (v) => { this._config.roof.height = clampNum(v, 0.2, 10, 3); });
    numField('#f-roof-oh', (v) => { this._config.roof.overhang = clampNum(v, 0, 2, 0.4); });

    const roofBox = this.querySelector('#roof-types');
    ROOF_TYPES.forEach((rt) => {
      const b = document.createElement('button');
      b.className = 'roof-btn';
      b.dataset.type = rt.value;
      b.textContent = rt.label;
      b.type = 'button';
      b.style.cssText = 'flex:1;min-width:90px;padding:8px;border-radius:6px;cursor:pointer;';
      b.addEventListener('click', () => {
        this._config.roof.type = rt.value;
        this._refresh();
        this._fire();
      });
      roofBox.appendChild(b);
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
      this._selRoom = null;
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
      this._config.floors[this._activeFloor].height = clampNum(e.target.value, 1.5, 6, 2.6);
      this._fire();
    });

    this.querySelector('#f-plan').addEventListener('input', (e) => {
      this._config.floors[this._activeFloor].floorplan = e.target.value.trim();
      this._loadPlanImage();
      this._fire();
    });

    this.querySelector('#room-add').addEventListener('click', () => {
      this._addRoom('room');
    });

    this.querySelector('#annex-add').addEventListener('click', () => {
      this._addRoom('annex');
    });

    this._setupCanvas();
    this._refresh();
  }

  _addRoom(type) {
    const f = this._config.floors[this._activeFloor];
    const b = this._bounds();
    let x = 0, z = 0, w = 3, d = 3;

    if (type === 'annex') {
      // Anbau rechts neben dem Hauptbaukoerper absetzen, vollstaendig im Zeichenbereich
      const gap = 0.2;
      w = round1(Math.max(1, Math.min(4, b.mx - gap)));
      x = round1(b.W + gap);
      z = round1(Math.min(2, Math.max(0, b.D - d)));
    } else {
      // freie Stelle im Hauptbaukoerper suchen
      const step = 0.5;
      outer:
      for (let zz = 0; zz <= b.D - d; zz += step) {
        for (let xx = 0; xx <= b.W - w; xx += step) {
          const clash = f.rooms.some((r) =>
            xx < r.x + r.w && xx + w > r.x && zz < r.z + r.d && zz + d > r.z);
          if (!clash) { x = round1(xx); z = round1(zz); break outer; }
        }
      }
    }

    f.rooms.push({ name: '', type: type, x: x, z: z, w: w, d: d, temp_entity: '' });
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
    box.innerHTML = '';

    if (!f.rooms.length) {
      box.innerHTML = '<div style="font-size:12px;color:var(--secondary-text-color);">Noch keine Raeume. Mit "+ Raum" anlegen.</div>';
      return;
    }

    f.rooms.forEach((r, i) => {
      const row = document.createElement('div');
      const active = i === this._selRoom;
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;border:1px solid ' +
        (active ? 'var(--primary-color)' : 'var(--divider-color)') + ';background:' +
        (active ? 'rgba(127,127,127,0.12)' : 'transparent') + ';';

      const swatch = document.createElement('span');
      swatch.style.cssText = 'width:12px;height:12px;border-radius:3px;flex-shrink:0;background:' + toCss(roomTypeColor(r.type)) + ';';
      row.appendChild(swatch);

      const label = document.createElement('button');
      label.type = 'button';
      label.style.cssText = 'flex:1;text-align:left;background:transparent;border:0;color:var(--primary-text-color);cursor:pointer;font-size:13px;padding:2px 0;font-family:inherit;';
      const nm = (r.name || '').trim();
      label.innerHTML = (nm !== ''
        ? '<span>' + nm + '</span>'
        : '<span style="opacity:.55;font-style:italic;">ohne Namen</span>') +
        '<span style="opacity:.55;font-size:11px;"> &middot; ' + roomTypeLabel(r.type) + ' &middot; ' + r.w + ' x ' + r.d + ' m</span>';
      label.addEventListener('click', () => {
        this._selRoom = i;
        this._buildRoomList();
        this._buildRoomEditor(true);
        this._drawPlan();
      });
      row.appendChild(label);

      const del = document.createElement('button');
      del.type = 'button';
      del.title = 'Raum loeschen';
      del.textContent = 'loeschen';
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

    this.querySelector('#f-title').value = this._config.title || '';
    this.querySelector('#f-width').value = this._config.house.width;
    this.querySelector('#f-depth').value = this._config.house.depth;
    this.querySelector('#f-roof-h').value = this._config.roof.height;
    this.querySelector('#f-roof-oh').value = this._config.roof.overhang;

    this.querySelectorAll('.roof-btn').forEach((b) => {
      const active = b.dataset.type === this._config.roof.type;
      b.style.border = '1px solid var(--divider-color)';
      b.style.background = active ? 'var(--primary-color)' : 'transparent';
      b.style.color = active ? 'var(--text-primary-color)' : 'var(--primary-text-color)';
      b.style.fontWeight = active ? '600' : '400';
    });

    const showRidge = this._config.roof.type === 'gable' || this._config.roof.type === 'mono';
    this.querySelector('#ridge-row').style.display = showRidge ? 'block' : 'none';
    this.querySelectorAll('.axis-btn').forEach((b) => {
      const active = b.dataset.axis === this._config.roof.axis;
      b.style.border = '1px solid var(--divider-color)';
      b.style.background = active ? 'var(--primary-color)' : 'transparent';
      b.style.color = active ? 'var(--text-primary-color)' : 'var(--primary-text-color)';
    });

    this._buildFloorTabs();

    const floor = this._config.floors[this._activeFloor];
    this.querySelector('#f-floor-name').value = floor.name || '';
    this.querySelector('#f-floor-h').value = floor.height;
    this.querySelector('#f-plan').value = floor.floorplan || '';

    this._loadPlanImage();
    this._buildRoomList();
    this._buildRoomEditor(true);
  }

  _loadPlanImage() {
    const floor = this._config.floors[this._activeFloor];
    const src = floor.floorplan;
    if (!src) { this._planImg = null; this._drawPlan(); return; }
    if (this._planImg && this._planImgSrc === src) { this._drawPlan(); return; }

    const img = new Image();
    this._planImgSrc = src;
    img.onload = () => { this._planImg = img; this._drawPlan(); };
    img.onerror = () => { this._planImg = null; this._drawPlan(); };
    img.src = src;
  }

  _bounds() {
    const W = this._config.house.width;
    const D = this._config.house.depth;
    const mx = round1(Math.max(2, W * 0.3));
    const mz = round1(Math.max(2, D * 0.3));
    return { W, D, mx, mz, totalW: W + 2 * mx, totalD: D + 2 * mz };
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const s = cssW / b.totalW;
    const px = (x) => (x + b.mx) * s;
    const pz = (z) => (z + b.mz) * s;

    // Aussenbereich fuer Anbauten
    ctx.fillStyle = '#15181f';
    ctx.fillRect(0, 0, cssW, cssH);

    // Hausflaeche
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

    // Umriss des Hauptbaukoerpers
    ctx.strokeStyle = '#4a5568';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeRect(hx, hy, hw, hh);
    ctx.setLineDash([]);

    ctx.fillStyle = '#5d6675';
    ctx.font = '10px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('Hauptbaukoerper, ausserhalb sind Anbauten moeglich', 4, 4);

    const floor = this._config.floors[this._activeFloor];
    floor.rooms.forEach((r, i) => {
      const sel = i === this._selRoom;
      const x = px(r.x), y = pz(r.z), w = r.w * s, h = r.d * s;
      const col = toCss(roomTypeColor(r.type));

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
        ctx.fillText(r.w + ' x ' + r.d + ' m', cx, cy + 7);
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
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
      return {
        x: (e.clientX - r.left) / s - b.mx,
        z: (e.clientY - r.top) / s - b.mz,
        s: s,
        b: b
      };
    };

    cv.addEventListener('pointerdown', (e) => {
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
      startX = p.x; startY = p.z;
      orig = Object.assign({}, floor.rooms[hit]);
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this._drawPlan();
      this._buildRoomList();
      this._buildRoomEditor(true);
    });

    cv.addEventListener('pointermove', (e) => {
      if (!mode || this._selRoom === null) return;
      const p = toPlan(e);
      const r = this._config.floors[this._activeFloor].rooms[this._selRoom];
      const b = p.b;

      if (mode === 'move') {
        r.x = round1(Math.max(-b.mx, Math.min(b.W + b.mx - orig.w, orig.x + (p.x - startX))));
        r.z = round1(Math.max(-b.mz, Math.min(b.D + b.mz - orig.d, orig.z + (p.z - startY))));
      } else {
        r.w = round1(Math.max(0.5, Math.min(b.W + b.mx - r.x, orig.w + (p.x - startX))));
        r.d = round1(Math.max(0.5, Math.min(b.D + b.mz - r.z, orig.d + (p.z - startY))));
      }
      this._drawPlan();
      this._syncRoomFields();
    });

    const finish = (e) => {
      if (!mode) return;
      mode = null;
      try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
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
      box.innerHTML = '<div style="font-size:12px;color:var(--secondary-text-color);">Kein Raum ausgewaehlt. Auf ein Rechteck klicken oder Raum hinzufuegen.</div>';
      this._editorKey = null;
      return;
    }

    // Felder nur neu aufbauen, wenn ein anderer Raum gewaehlt wurde.
    // Sonst verliert das Namensfeld beim Tippen den Fokus.
    const key = this._activeFloor + ':' + this._selRoom;
    if (!force && this._editorKey === key) { this._syncRoomFields(); return; }
    this._editorKey = key;

    const room = floor.rooms[this._selRoom];
    box.innerHTML = '';

    const nameF = document.createElement('ha-textfield');
    nameF.setAttribute('label', 'Raumname (optional)');
    nameF.style.width = '100%';
    nameF.id = 'room-name-field';
    nameF.value = room.name || '';
    nameF.addEventListener('input', (e) => {
      room.name = e.target.value;
      this._drawPlan();
      this._buildRoomList();
      this._fire();
    });
    box.appendChild(nameF);

    const typeWrap = document.createElement('div');
    typeWrap.innerHTML = '<div style="font-size:12px;color:var(--secondary-text-color);margin-bottom:6px;">Raumtyp</div>';
    const sel = document.createElement('select');
    sel.id = 'room-type-field';
    sel.style.cssText = 'width:100%;padding:10px;border-radius:6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);font-size:14px;';
    ROOM_TYPES.forEach((rt) => {
      const opt = document.createElement('option');
      opt.value = rt.value;
      opt.textContent = rt.label;
      sel.appendChild(opt);
    });
    sel.value = room.type || 'room';
    sel.addEventListener('change', (e) => {
      room.type = e.target.value;
      this._drawPlan();
      this._buildRoomList();
      this._fire();
    });
    typeWrap.appendChild(sel);
    box.appendChild(typeWrap);

    const picker = document.createElement('ha-selector');
    picker.hass = this._hass;
    picker.selector = { entity: { domain: ['sensor', 'climate', 'number', 'input_number'] } };
    picker.label = 'Temperatur-Sensor (optional)';
    picker.value = room.temp_entity || '';
    picker.addEventListener('value-changed', (e) => {
      room.temp_entity = e.detail.value || '';
      this._fire();
    });
    box.appendChild(picker);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;';
    const fields = [
      { key: 'x', label: 'Position X in m', min: -60 },
      { key: 'z', label: 'Position Z in m', min: -60 },
      { key: 'w', label: 'Breite in m',      min: 0.5 },
      { key: 'd', label: 'Tiefe in m',       min: 0.5 }
    ];
    fields.forEach((f) => {
      const tf = document.createElement('ha-textfield');
      tf.setAttribute('type', 'number');
      tf.setAttribute('label', f.label);
      tf.className = 'room-num';
      tf.dataset.key = f.key;
      tf.value = room[f.key];
      tf.addEventListener('input', (e) => {
        room[f.key] = clampNum(e.target.value, f.min, 60, room[f.key]);
        this._drawPlan();
        this._fire();
      });
      grid.appendChild(tf);
    });
    box.appendChild(grid);

    const dup = document.createElement('button');
    dup.textContent = 'Raum duplizieren';
    dup.style.cssText = 'padding:8px;border-radius:6px;cursor:pointer;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);';
    dup.type = 'button';
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

  _syncRoomFields() {
    const floor = this._config.floors[this._activeFloor];
    if (this._selRoom === null || !floor.rooms[this._selRoom]) return;
    const room = floor.rooms[this._selRoom];

    const nameF = this.querySelector('#room-name-field');
    if (nameF && document.activeElement !== nameF) nameF.value = room.name || '';

    const typeF = this.querySelector('#room-type-field');
    if (typeF && document.activeElement !== typeF) typeF.value = room.type || 'room';

    this.querySelectorAll('.room-num').forEach((tf) => {
      if (document.activeElement === tf) return;
      tf.value = room[tf.dataset.key];
    });
  }
}

customElements.define('house-3d-card-editor', House3DCardEditor);

/* ========================== REGISTRY ========================== */

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'house-3d-card',
  name: '3D Energy House',
  description: 'Drehbares 3D-Haus mit Etagen, Dachformen und Raumtemperaturen',
  preview: false,
  documentationURL: 'https://github.com/Lutarym/3d-Energy-House'
});

console.info('%c 3D-ENERGY-HOUSE %c ' + VERSION + ' ', 'background:#2f6bff;color:#fff;border-radius:3px 0 0 3px', 'background:#1c2029;color:#fff;border-radius:0 3px 3px 0');
