const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

class House3DCard extends HTMLElement {
  setConfig(config) {
    this.config = config || {};
    this._roomConfig = Array.isArray(this.config.rooms) ? this.config.rooms : [];
  }

  set hass(hass) {
    this._hass = hass;
    this.updateTemperatures();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 8;
  }

  connectedCallback() {
    if (this._built) return;
    this._built = true;

    this.selectedRoom = null;
    this.temperatures = {};
    this.roomMeshes = {};
    this.opacity = 0.45;

    const layout = [
      { name: 'Wohnzimmer', pos: [-3, 1.5, -3], size: [5.6, 3, 5.6], floor: 'EG' },
      { name: 'Kueche',     pos: [ 3, 1.5, -3], size: [5.6, 3, 5.6], floor: 'EG' },
      { name: 'Schlafzimmer',pos:[-3, 1.5,  3], size: [5.6, 3, 5.6], floor: 'EG' },
      { name: 'Bad',        pos: [ 3, 1.5,  3], size: [5.6, 3, 5.6], floor: 'EG' },
      { name: 'Zimmer 1',   pos: [-3, 5.0, -2], size: [5.6, 3, 7.6], floor: 'OG' },
      { name: 'Zimmer 2',   pos: [ 3, 5.0, -2], size: [5.6, 3, 7.6], floor: 'OG' },
      { name: 'Flur OG',    pos: [ 0, 5.0,  3], size: [11.6, 3, 3.6], floor: 'OG' }
    ];

    this.rooms = {};
    layout.forEach((slot, i) => {
      const cfg = this._roomConfig[i] || {};
      const name = cfg.name || slot.name;
      this.rooms[name] = {
        pos: slot.pos,
        size: slot.size,
        floor: cfg.floor || slot.floor,
        tempEntity: cfg.temp_entity || null
      };
    });

    this.innerHTML = `
      <ha-card style="overflow:hidden;">
        <div style="display:flex;height:600px;background:#12141a;font-family:var(--paper-font-body1_-_font-family,sans-serif);color:#fff;">

          <div style="width:250px;background:#0d0f14;border-right:1px solid #262a33;display:flex;flex-direction:column;overflow-y:auto;">
            <div style="padding:14px;border-bottom:1px solid #262a33;">
              <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#7c8595;margin-bottom:10px;">Temperatur</div>
              <div style="display:flex;flex-direction:column;gap:5px;font-size:11px;">
                <div style="display:flex;align-items:center;gap:8px;"><span style="width:14px;height:14px;background:#2f6bff;border-radius:3px;"></span>bis 15 &deg;C</div>
                <div style="display:flex;align-items:center;gap:8px;"><span style="width:14px;height:14px;background:#28c0e8;border-radius:3px;"></span>15 bis 18 &deg;C</div>
                <div style="display:flex;align-items:center;gap:8px;"><span style="width:14px;height:14px;background:#2ecc71;border-radius:3px;"></span>18 bis 22 &deg;C</div>
                <div style="display:flex;align-items:center;gap:8px;"><span style="width:14px;height:14px;background:#f1c40f;border-radius:3px;"></span>22 bis 25 &deg;C</div>
                <div style="display:flex;align-items:center;gap:8px;"><span style="width:14px;height:14px;background:#e8582c;border-radius:3px;"></span>ab 25 &deg;C</div>
                <div style="display:flex;align-items:center;gap:8px;"><span style="width:14px;height:14px;background:#8892a0;border-radius:3px;"></span>kein Wert</div>
              </div>
            </div>
            <div style="padding:14px;flex:1;">
              <div style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#7c8595;margin-bottom:10px;">Raeume</div>
              <div id="rooms-list" style="display:flex;flex-direction:column;gap:6px;"></div>
            </div>
          </div>

          <div style="flex:1;position:relative;min-width:0;">
            <div id="canvas-container" style="width:100%;height:100%;"></div>
            <div id="status" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#7c8595;font-size:13px;pointer-events:none;">3D wird geladen</div>
            <div style="position:absolute;top:10px;right:10px;display:flex;gap:6px;z-index:5;">
              <button id="rot-left"  style="width:34px;height:34px;background:#1c2029;color:#fff;border:1px solid #333a46;border-radius:6px;cursor:pointer;font-size:14px;">&#8630;</button>
              <button id="rot-right" style="width:34px;height:34px;background:#1c2029;color:#fff;border:1px solid #333a46;border-radius:6px;cursor:pointer;font-size:14px;">&#8631;</button>
              <button id="auto-rot"  style="height:34px;padding:0 10px;background:#1c2029;color:#fff;border:1px solid #333a46;border-radius:6px;cursor:pointer;font-size:12px;">Auto</button>
            </div>
            <div style="position:absolute;bottom:10px;left:10px;right:10px;display:flex;align-items:center;gap:10px;z-index:5;">
              <span style="font-size:11px;color:#7c8595;white-space:nowrap;">Transparenz</span>
              <input id="opacity" type="range" min="10" max="100" value="45" style="flex:1;cursor:pointer;">
            </div>
          </div>

          <div style="width:250px;background:#0d0f14;border-left:1px solid #262a33;padding:14px;display:flex;flex-direction:column;">
            <div id="info-panel" style="flex:1;display:flex;flex-direction:column;gap:10px;">
              <div style="color:#7c8595;font-size:13px;text-align:center;padding:24px 0;">Raum waehlen</div>
            </div>
          </div>

        </div>
      </ha-card>
    `;

    this.renderRoomsList();
    this.loadThree();
  }

  disconnectedCallback() {
    this._stopped = true;
    if (this._resizeObserver) this._resizeObserver.disconnect();
  }

  async loadThree() {
    try {
      if (!window.__three_module) {
        window.__three_module = await import(THREE_URL);
      }
      this.THREE = window.__three_module;
      this.querySelector('#status').style.display = 'none';
      this.initThreeJS();
      this.updateTemperatures();
    } catch (e) {
      this.querySelector('#status').textContent = 'Three.js konnte nicht geladen werden';
      console.error('house-3d-card:', e);
    }
  }

  tempColor(value) {
    if (value === undefined || value === null || value === '' || isNaN(parseFloat(value))) return 0x8892a0;
    const t = parseFloat(value);
    if (t <= 15) return 0x2f6bff;
    if (t <= 18) return 0x28c0e8;
    if (t <= 22) return 0x2ecc71;
    if (t <= 25) return 0xf1c40f;
    return 0xe8582c;
  }

  hex(n) {
    return '#' + n.toString(16).padStart(6, '0');
  }

  updateTemperatures() {
    if (!this._built || !this._hass) return;

    Object.entries(this.rooms).forEach(([name, data]) => {
      if (!data.tempEntity) return;
      const st = this._hass.states[data.tempEntity];
      this.temperatures[name] = st ? st.state : undefined;

      const mesh = this.roomMeshes[name];
      if (mesh) {
        const c = this.tempColor(this.temperatures[name]);
        mesh.material.color.setHex(c);
        if (mesh.userData.glow) mesh.userData.glow.material.color.setHex(c);
      }
    });

    this.updateRoomsList();
    if (this.selectedRoom) this.updateInfoPanel(this.selectedRoom);
  }

  renderRoomsList() {
    const list = this.querySelector('#rooms-list');
    list.innerHTML = '';
    Object.keys(this.rooms).forEach((name) => {
      const btn = document.createElement('button');
      btn.dataset.room = name;
      btn.style.cssText = 'padding:10px;background:#161a21;border:1px solid #262a33;border-radius:6px;color:#fff;cursor:pointer;text-align:left;font-size:12px;font-family:inherit;';
      this.paintRoomButton(btn, name);
      btn.addEventListener('click', () => this.selectRoom(name));
      list.appendChild(btn);
    });
  }

  paintRoomButton(btn, name) {
    const data = this.rooms[name];
    const raw = this.temperatures[name];
    const shown = (raw === undefined || raw === null || raw === '' || isNaN(parseFloat(raw))) ? '--' : parseFloat(raw).toFixed(1);
    const c = this.hex(this.tempColor(raw));
    btn.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <span style="font-weight:600;">${name}</span>
        <span style="font-weight:700;color:${c};white-space:nowrap;">${shown}&deg;</span>
      </div>
      <div style="font-size:10px;color:#7c8595;margin-top:2px;">${data.floor}</div>
    `;
  }

  updateRoomsList() {
    Object.keys(this.rooms).forEach((name) => {
      const btn = this.querySelector(`#rooms-list button[data-room="${name}"]`);
      if (btn) this.paintRoomButton(btn, name);
    });
  }

  selectRoom(name) {
    this.selectedRoom = name;

    this.querySelectorAll('#rooms-list button').forEach((b) => {
      const active = b.dataset.room === name;
      b.style.background = active ? '#1e2531' : '#161a21';
      b.style.borderColor = active ? this.hex(this.tempColor(this.temperatures[name])) : '#262a33';
    });

    Object.entries(this.roomMeshes).forEach(([rn, mesh]) => {
      mesh.material.opacity = rn === name ? Math.min(1, this.opacity + 0.4) : this.opacity;
      if (mesh.userData.glow) mesh.userData.glow.material.opacity = rn === name ? 1 : 0.35;
    });

    this.updateInfoPanel(name);
  }

  updateInfoPanel(name) {
    const data = this.rooms[name];
    const raw = this.temperatures[name];
    const shown = (raw === undefined || raw === null || raw === '' || isNaN(parseFloat(raw))) ? '--' : parseFloat(raw).toFixed(1);
    const c = this.hex(this.tempColor(raw));

    this.querySelector('#info-panel').innerHTML = `
      <div style="font-weight:600;font-size:14px;">${name}</div>
      <div style="background:#161a21;border:1px solid #262a33;border-radius:6px;padding:16px;text-align:center;">
        <div style="font-size:11px;color:#7c8595;margin-bottom:6px;">Temperatur</div>
        <div style="font-size:32px;font-weight:700;color:${c};line-height:1;">${shown}<span style="font-size:16px;">&deg;C</span></div>
      </div>
      <div style="background:#161a21;border:1px solid #262a33;border-radius:6px;padding:10px;font-size:12px;">
        <div style="color:#7c8595;font-size:11px;">Etage</div>
        <div>${data.floor}</div>
      </div>
      <div style="margin-top:auto;padding-top:10px;border-top:1px solid #262a33;font-size:10px;color:#5d6675;word-break:break-all;">
        ${data.tempEntity ? data.tempEntity : 'keine Entity konfiguriert'}
      </div>
    `;
  }

  initThreeJS() {
    const THREE = this.THREE;
    const container = this.querySelector('#canvas-container');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12141a);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(18, 26, 14);
    scene.add(dir);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    Object.entries(this.rooms).forEach(([name, data]) => {
      const geo = new THREE.BoxGeometry(...data.size);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x8892a0,
        transparent: true,
        opacity: this.opacity,
        depthWrite: false,
        roughness: 0.6,
        metalness: 0.05
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...data.pos);
      mesh.userData.name = name;
      mesh.renderOrder = 1;

      const glow = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x8892a0, transparent: true, opacity: 0.35 })
      );
      mesh.add(glow);
      mesh.userData.glow = glow;

      this.roomMeshes[name] = mesh;
      scene.add(mesh);
    });

    const grid = new THREE.GridHelper(30, 30, 0x2a303c, 0x1c212a);
    grid.position.y = 0;
    scene.add(grid);

    // Kamera-Orbit
    const orbit = { theta: Math.PI * 0.25, phi: Math.PI * 0.32, radius: 26, target: new THREE.Vector3(0, 3.5, 0) };
    const applyCamera = () => {
      const p = Math.max(0.15, Math.min(Math.PI / 2.05, orbit.phi));
      orbit.phi = p;
      camera.position.set(
        orbit.target.x + orbit.radius * Math.sin(p) * Math.sin(orbit.theta),
        orbit.target.y + orbit.radius * Math.cos(p),
        orbit.target.z + orbit.radius * Math.sin(p) * Math.cos(orbit.theta)
      );
      camera.lookAt(orbit.target);
    };
    applyCamera();

    // Maus
    let dragging = false, moved = false, lastX = 0, lastY = 0;
    const el = renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      dragging = true; moved = false;
      lastX = e.clientX; lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        orbit.theta -= dx * 0.006;
        orbit.phi   -= dy * 0.006;
        lastX = e.clientX; lastY = e.clientY;
        applyCamera();
      } else {
        el.style.cursor = this.pick(e, camera, el) ? 'pointer' : 'grab';
      }
    });

    el.addEventListener('pointerup', (e) => {
      dragging = false;
      el.releasePointerCapture(e.pointerId);
      if (!moved) {
        const hit = this.pick(e, camera, el);
        if (hit) this.selectRoom(hit);
      }
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      orbit.radius = Math.max(12, Math.min(60, orbit.radius + e.deltaY * 0.02));
      applyCamera();
    }, { passive: false });

    el.style.cursor = 'grab';
    el.style.touchAction = 'none';

    this.querySelector('#rot-left').addEventListener('click', () => { orbit.theta += 0.4; applyCamera(); });
    this.querySelector('#rot-right').addEventListener('click', () => { orbit.theta -= 0.4; applyCamera(); });

    this._auto = false;
    const autoBtn = this.querySelector('#auto-rot');
    autoBtn.addEventListener('click', () => {
      this._auto = !this._auto;
      autoBtn.style.background = this._auto ? '#2f6bff' : '#1c2029';
    });

    this.querySelector('#opacity').addEventListener('input', (e) => {
      this.opacity = parseInt(e.target.value, 10) / 100;
      Object.entries(this.roomMeshes).forEach(([rn, m]) => {
        m.material.opacity = rn === this.selectedRoom ? Math.min(1, this.opacity + 0.4) : this.opacity;
      });
    });

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();

    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    this._resizeObserver = new ResizeObserver(resize);
    this._resizeObserver.observe(container);

    const loop = () => {
      if (this._stopped) return;
      requestAnimationFrame(loop);
      if (this._auto && !dragging) { orbit.theta += 0.003; applyCamera(); }
      renderer.render(scene, camera);
    };
    loop();
  }

  pick(event, camera, el) {
    if (!this._raycaster) return null;
    const r = el.getBoundingClientRect();
    this._pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
    this._pointer.y = -((event.clientY - r.top) / r.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, camera);
    const hits = this._raycaster.intersectObjects(Object.values(this.roomMeshes), false);
    return hits.length ? hits[0].object.userData.name : null;
  }
}

customElements.define('house-3d-card', House3DCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'house-3d-card',
  name: '3D Energy House',
  description: 'Drehbare 3D-Uebersicht der Raumtemperaturen',
  preview: false
});

console.info('%c 3D-ENERGY-HOUSE %c 1.1.0 ', 'background:#2f6bff;color:#fff;border-radius:3px 0 0 3px', 'background:#1c2029;color:#fff;border-radius:0 3px 3px 0');
