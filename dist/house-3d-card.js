class House3DCard extends HTMLElement {
  setConfig(config) {
    this.config = config;
  }

  set hass(hass) {
    this.hass = hass;
    this.updateTemperatures();
  }

  connectedCallback() {
    this.selectedRoom = null;
    
    // Standardräume (können überschrieben werden)
    this.rooms = {
      'Wohnzimmer': { pos: [-5, 0, -5], size: [4, 3, 4], baseColor: 0xff6b6b, floor: 'EG', tempEntity: this.config?.rooms?.[0]?.temp_entity || null },
      'Küche': { pos: [5, 0, -5], size: [4, 3, 4], baseColor: 0x4ecdc4, floor: 'EG', tempEntity: this.config?.rooms?.[1]?.temp_entity || null },
      'Schlafzimmer': { pos: [-5, 0, 5], size: [4, 3, 4], baseColor: 0xffe66d, floor: 'EG', tempEntity: this.config?.rooms?.[2]?.temp_entity || null },
      'Bad': { pos: [5, 0, 5], size: [4, 3, 4], baseColor: 0x95e1d3, floor: 'EG', tempEntity: this.config?.rooms?.[3]?.temp_entity || null },
      'Zimmer 1': { pos: [-5, 3.5, -2], size: [4, 3, 5], baseColor: 0xa8e6cf, floor: 'OG', tempEntity: this.config?.rooms?.[4]?.temp_entity || null },
      'Zimmer 2': { pos: [5, 3.5, -2], size: [4, 3, 5], baseColor: 0xffd3b6, floor: 'OG', tempEntity: this.config?.rooms?.[5]?.temp_entity || null },
      'Flur OG': { pos: [0, 3.5, 5], size: [4, 3, 4], baseColor: 0xffaaa5, floor: 'OG', tempEntity: this.config?.rooms?.[6]?.temp_entity || null }
    };

    this.temperatures = {};
    this.roomMeshes = {};

    this.innerHTML = `
      <div style="display: flex; height: 600px; background: #1a1a1a; border-radius: 8px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #fff;">
        
        <!-- Linke Sidebar -->
        <div style="width: 280px; background: #0f0f0f; border-right: 1px solid #333; display: flex; flex-direction: column; overflow-y: auto;">
          
          <!-- Legende -->
          <div style="padding: 16px; border-bottom: 1px solid #333;">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 12px; color: #999;">Temperatur-Skala</div>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
              <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 16px; height: 16px; background: #0066ff; border-radius: 2px;"></div><span>Kalt (≤15°C)</span></div>
              <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 16px; height: 16px; background: #00ccff; border-radius: 2px;"></div><span>Kühl (15-18°C)</span></div>
              <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 16px; height: 16px; background: #00ff99; border-radius: 2px;"></div><span>Angenehm (18-22°C)</span></div>
              <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 16px; height: 16px; background: #ffdd00; border-radius: 2px;"></div><span>Warm (22-25°C)</span></div>
              <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 16px; height: 16px; background: #ff6600; border-radius: 2px;"></div><span>Heiß (≥25°C)</span></div>
            </div>
          </div>

          <!-- Räume Liste -->
          <div style="padding: 16px; flex: 1;">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 12px; color: #999;">Räume</div>
            <div id="rooms-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
          </div>
        </div>

        <!-- 3D Viewer -->
        <div style="flex: 1; position: relative;">
          <div id="canvas-container" style="width: 100%; height: 100%;"></div>
          
          <!-- Buttons -->
          <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 8px; z-index: 10;">
            <button id="rotate-left" style="padding: 8px 12px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">←</button>
            <button id="rotate-right" style="padding: 8px 12px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">→</button>
          </div>
        </div>

        <!-- Rechte Info-Panel -->
        <div style="width: 280px; background: #0f0f0f; border-left: 1px solid #333; display: flex; flex-direction: column; padding: 16px;">
          <div id="info-panel" style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
            <div style="text-align: center; color: #999; padding: 24px;">Raum auswählen</div>
          </div>
        </div>

      </div>
    `;

    this.initThreeJS();
    this.renderRoomsList();
  }

  getTemperatureColor(temp) {
    if (temp === null || temp === undefined) return 0x888888;
    const t = parseFloat(temp);
    if (t <= 15) return 0x0066ff;
    if (t <= 18) return 0x00ccff;
    if (t <= 22) return 0x00ff99;
    if (t <= 25) return 0xffdd00;
    return 0xff6600;
  }

  updateTemperatures() {
    Object.entries(this.rooms).forEach(([name, data]) => {
      if (data.tempEntity && this.hass?.states[data.tempEntity]) {
        const temp = this.hass.states[data.tempEntity].state;
        this.temperatures[name] = temp;
        
        if (this.roomMeshes[name]) {
          const color = this.getTemperatureColor(temp);
          this.roomMeshes[name].material.color.setHex(color);
        }
      }
    });

    this.updateRoomsList();
    if (this.selectedRoom) {
      this.updateInfoPanel(this.selectedRoom);
    }
  }

  renderRoomsList() {
    const list = this.querySelector('#rooms-list');
    Object.keys(this.rooms).forEach((name) => {
      const btn = document.createElement('button');
      btn.style.cssText = `padding: 12px; background: rgba(255,255,255,0.05); border: 2px solid transparent; border-radius: 4px; color: #fff; cursor: pointer; text-align: left; font-size: 12px; transition: all 0.2s;`;
      btn.dataset.room = name;
      this.updateRoomButton(btn, name);

      btn.addEventListener('mouseover', () => {
        if (this.selectedRoom !== name) {
          btn.style.background = 'rgba(255,255,255,0.1)';
        }
      });
      btn.addEventListener('mouseout', () => {
        if (this.selectedRoom !== name) {
          btn.style.background = 'rgba(255,255,255,0.05)';
        }
      });
      btn.addEventListener('click', () => this.selectRoom(name, btn));
      list.appendChild(btn);
    });
  }

  updateRoomButton(btn, name) {
    const data = this.rooms[name];
    const temp = this.temperatures[name] || '--';
    const tempColor = this.getTemperatureColor(this.temperatures[name]);
    const color = '#' + tempColor.toString(16).padStart(6, '0');
    
    btn.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
        <div style="font-weight: 600;">${name}</div>
        <div style="font-weight: 600; font-size: 13px; color: ${color};">${temp}°C</div>
      </div>
      <div style="font-size: 10px; color: #999;">${data.floor}</div>
    `;
  }

  updateRoomsList() {
    Object.keys(this.rooms).forEach((name) => {
      const btn = this.querySelector(`#rooms-list button[data-room="${name}"]`);
      if (btn) this.updateRoomButton(btn, name);
    });
  }

  selectRoom(roomName, btn) {
    this.selectedRoom = roomName;
    const roomData = this.rooms[roomName];

    this.querySelectorAll('#rooms-list button').forEach(b => {
      b.style.background = 'rgba(255,255,255,0.05)';
      b.style.borderColor = 'transparent';
    });
    const tempColor = this.getTemperatureColor(this.temperatures[roomName]);
    const color = '#' + tempColor.toString(16).padStart(6, '0');
    btn.style.background = 'rgba(255,255,255,0.15)';
    btn.style.borderColor = color;

    this.updateInfoPanel(roomName);
  }

  updateInfoPanel(roomName) {
    const roomData = this.rooms[roomName];
    const temp = this.temperatures[roomName] || '--';
    const tempColor = this.getTemperatureColor(this.temperatures[roomName]);
    const color = '#' + tempColor.toString(16).padStart(6, '0');

    const panel = this.querySelector('#info-panel');
    panel.innerHTML = `
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 12px;">${roomName}</div>
      
      <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 4px; text-align: center;">
        <div style="font-size: 11px; color: #999; margin-bottom: 6px;">Temperatur</div>
        <div style="font-size: 28px; font-weight: 700; color: ${color};">${temp}°C</div>
      </div>

      <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; font-size: 12px;">
        <div style="color: #999; margin-bottom: 4px;">Etage</div>
        <div>${roomData.floor}</div>
      </div>

      <div style="margin-top: auto; padding-top: 12px; border-top: 1px solid #333; font-size: 11px; color: #999;">
        ${roomData.tempEntity ? `Entity: ${roomData.tempEntity}` : 'Keine Temperatur konfiguriert'}
      </div>
    `;
  }

  initThreeJS() {
    const container = this.querySelector('#canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(15, 12, 15);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const light1 = new THREE.DirectionalLight(0xffffff, 0.8);
    light1.position.set(20, 20, 20);
    light1.castShadow = true;
    scene.add(light1);

    const light2 = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(light2);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const createRoom = (name, pos, size, color) => {
      const geometry = new THREE.BoxGeometry(...size);
      const material = new THREE.MeshStandardMaterial({ 
        color: color,
        metalness: 0.1,
        roughness: 0.7
      });
      const room = new THREE.Mesh(geometry, material);
      room.position.set(...pos);
      room.castShadow = true;
      room.receiveShadow = true;
      room.userData.name = name;

      const edges = new THREE.EdgesGeometry(geometry);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
      room.add(line);

      this.roomMeshes[name] = room;
      return room;
    };

    Object.entries(this.rooms).forEach(([name, data]) => {
      const color = this.getTemperatureColor(this.temperatures[name]);
      scene.add(createRoom(name, data.pos, data.size, color));
    });

    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    this.rotationState = {
      mouseDown: false,
      mouseX: 0,
      mouseY: 0
    };

    container.addEventListener('mousedown', (e) => {
      this.rotationState.mouseDown = true;
      this.rotationState.mouseX = e.clientX;
      this.rotationState.mouseY = e.clientY;
    });

    container.addEventListener('mousemove', (e) => {
      if (this.rotationState.mouseDown) {
        const deltaX = e.clientX - this.rotationState.mouseX;
        camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * 0.005);
        this.rotationState.mouseX = e.clientX;
      }

      mouse.x = (e.clientX / width) * 2 - 1;
      mouse.y = -(e.clientY / height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(Object.values(this.roomMeshes));
      container.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
    });

    container.addEventListener('mouseup', () => {
      this.rotationState.mouseDown = false;
    });

    container.addEventListener('click', (e) => {
      if (!this.rotationState.mouseDown) {
        mouse.x = (e.clientX / width) * 2 - 1;
        mouse.y = -(e.clientY / height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(Object.values(this.roomMeshes));
        if (intersects.length > 0) {
          const roomName = intersects[0].object.userData.name;
          const btn = Array.from(this.querySelectorAll('#rooms-list button')).find(b => b.dataset.room === roomName);
          if (btn) {
            this.selectRoom(roomName, btn);
          }
        }
      }
    });

    this.querySelector('#rotate-left').addEventListener('click', () => {
      camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.3);
    });

    this.querySelector('#rotate-right').addEventListener('click', () => {
      camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.3);
    });

    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    window.addEventListener('resize', () => {
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    });
  }
}

customElements.define('house-3d-card', House3DCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'house-3d-card',
  name: '3D Haus Temperatur',
  description: 'Interaktive 3D-Übersicht mit Temperatur-Farbcodierung'
});
