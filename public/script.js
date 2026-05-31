// ========== JARVIS COCKPIT - CLIENT LOGIC ==========

// DOM Elements
const terminal = document.getElementById('terminal-output');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const avatarContainer = document.querySelector('.avatar-container');
const avatarStatus = document.getElementById('avatar-status');
const fileAttach = document.getElementById('file-attach');

// ========== HOLOGRAPHIC BRAIN 3D — Three.js Iron Man ==========
class NeuralTree {
  constructor(canvasOrContainer) {
    // Three.js takes over the container, not the canvas directly
    this.container = canvasOrContainer.parentElement || canvasOrContainer;
    this.state = 'idle';
    this.time = 0;
    this.speedMul = 1;
    this.targetSpeed = 1;
    this.stateSpeeds = { idle: 0.4, listening: 0.8, thinking: 1.5, speaking: 1.0 };

    // Hide the original canvas (Three.js creates its own)
    if (canvasOrContainer.tagName === 'CANVAS') canvasOrContainer.style.display = 'none';

    this._init3D();
    this.animate = this.animate.bind(this);
    this.animate();
  }

  setState(state) { this.state = state; this.targetSpeed = this.stateSpeeds[state] || 0.4; }

  resize() {
    if (!this.renderer || !this.camera) return;
    const w = this.container.clientWidth || this.container.getBoundingClientRect().width || 400;
    const h = this.container.clientHeight || this.container.getBoundingClientRect().height || 400;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _init3D() {
    const rect = this.container.getBoundingClientRect();
    const w = rect.width || 500, h = rect.height || 500;

    // Scene
    this.scene = new THREE.Scene();

    // Camera — positioned to see brain from side (like the reference image)
    // FOV 50 + near 0.01 prevents frustum clipping on the brain model
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 200);
    this.camera.position.set(0, 0, 7);
    this.camera.lookAt(0, -1.5, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.overflow = 'visible';
    this.renderer.domElement.style.zIndex = '2';
    this.renderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => this.resize());

    // ── HOLOGRAPHIC SHADER — Fresnel + scan lines + chromatic aberration ──
    const holoVertexShader = `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const holoFragmentShader = `
      uniform float uTime;
      uniform float uPulse;
      uniform float uOpacity;
      uniform vec3 uColor;
      uniform float uScanY;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewDir = normalize(-vPosition);
        float fresnel = 1.0 - abs(dot(viewDir, vNormal));
        fresnel = pow(fresnel, 1.8);
        float scanLine = sin(vWorldPos.y * 60.0 + uTime * 3.0) * 0.5 + 0.5;
        scanLine = smoothstep(0.4, 0.6, scanLine) * 0.12;
        float scanBar = 1.0 - smoothstep(0.0, 0.15, abs(vWorldPos.y - uScanY));
        scanBar *= 0.35;
        float alpha = (fresnel * 0.7 + 0.06 + scanLine + scanBar) * uOpacity;
        vec3 color = uColor;
        color.r += fresnel * 0.08;
        color.b += fresnel * 0.12;
        gl_FragColor = vec4(color, alpha * uPulse);
      }
    `;

    this.holoMaterial = new THREE.ShaderMaterial({
      vertexShader: holoVertexShader,
      fragmentShader: holoFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 1.0 },
        uOpacity: { value: 0.85 },
        uColor: { value: new THREE.Color(0x00e4ff) },
        uScanY: { value: 0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Wireframe material
    this.wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x00e4ff, wireframe: true, transparent: true, opacity: 0.1, depthWrite: false,
    });

    // ── Load real brain model (GLB) ──
    this.brainGroup = new THREE.Group();
    this.scene.add(this.brainGroup);

    // Placeholder meshes (used before model loads + as fallback)
    this.brainHolo = null;
    this.brainWire = null;
    this.brainWire2 = null;
    this.brainSolid = null;

    // Load brain model (with retry if GLTFLoader not ready yet)
    const self = this;
    function tryLoadBrain() {
      if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
        console.log('[JARVIS] GLTFLoader not ready, retrying in 500ms...');
        setTimeout(tryLoadBrain, 500);
        return;
      }
      const loader = new THREE.GLTFLoader();
      console.log('[JARVIS] Loading brain.glb...');
      loader.load('brain.glb', (gltf) => {
      const model = gltf.scene;
      console.log('[JARVIS] Brain model loaded!');

      // Center and scale — model is ~214 units, need to fit in ~3 units
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const brainScale = 2.7 / maxDim;

      // Wrap in a group for clean transform
      const brainPivot = new THREE.Group();
      model.position.set(-center.x, -center.y, -center.z); // center it
      brainPivot.add(model);
      brainPivot.scale.setScalar(brainScale);

      // Apply holographic material to all meshes
      model.traverse(function(child) {
        if (child.isMesh) {
          child.material = self.holoMaterial;
          child.renderOrder = 1;
        }
      });
      self.brainHolo = brainPivot;
      self.brainGroup.add(brainPivot);

      // Wireframe clone
      const wireModel = model.clone(true);
      wireModel.traverse(function(child) {
        if (child.isMesh) {
          child.material = self.wireMaterial.clone();
          child.renderOrder = 0;
        }
      });
      const wirePivot = new THREE.Group();
      wireModel.position.set(-center.x, -center.y, -center.z);
      wirePivot.add(wireModel);
      wirePivot.scale.setScalar(brainScale * 1.003);
      self.brainWire = wirePivot;
      self.brainGroup.add(wirePivot);

      // Second wireframe (outer glow layer)
      const wire2Model = model.clone(true);
      wire2Model.traverse(function(child) {
        if (child.isMesh) {
          child.material = new THREE.MeshBasicMaterial({
            color: 0x3366cc, wireframe: true, transparent: true, opacity: 0.04, depthWrite: false,
          });
        }
      });
      const wire2Pivot = new THREE.Group();
      wire2Model.position.set(-center.x, -center.y, -center.z);
      wire2Pivot.add(wire2Model);
      wire2Pivot.scale.setScalar(brainScale * 1.02);
      self.brainWire2 = wire2Pivot;
      self.brainGroup.add(wire2Pivot);

      // Inner volume glow
      const solidModel = model.clone(true);
      solidModel.traverse(function(child) {
        if (child.isMesh) {
          child.material = new THREE.MeshBasicMaterial({
            color: 0x003355, transparent: true, opacity: 0.04, side: THREE.BackSide, depthWrite: false,
          });
        }
      });
      const solidPivot = new THREE.Group();
      solidModel.position.set(-center.x, -center.y, -center.z);
      solidPivot.add(solidModel);
      solidPivot.scale.setScalar(brainScale * 0.98);
      self.brainSolid = solidPivot;
      self.brainGroup.add(solidPivot);

      console.log('[JARVIS] Brain 3D model loaded successfully');
    }, undefined, (err) => {
      console.warn('[JARVIS] Failed to load brain.glb:', err);
      // Fallback: deformed sphere
      const fallbackGeo = new THREE.SphereGeometry(1.5, 48, 32);
      self.brainHolo = new THREE.Mesh(fallbackGeo, self.holoMaterial);
      self.brainGroup.add(self.brainHolo);
      self.brainWire = new THREE.Mesh(fallbackGeo.clone(), self.wireMaterial);
      self.brainGroup.add(self.brainWire);
    });
    }
    tryLoadBrain();

    // Glow shells removidos — cerebro limpo sem esferas ao redor
    this.brainGlow = null;
    this.brainGlow2 = null;

    // ── NEURAL TREE — Full width root system below brain ──
    this.treeGroup = new THREE.Group();
    this.scene.add(this.treeGroup);

    const branchMat = new THREE.LineBasicMaterial({ color: 0x00e4ff, transparent: true, opacity: 0.4 });
    const secMat = new THREE.LineBasicMaterial({ color: 0x00aacc, transparent: true, opacity: 0.25 });
    const leafMat = new THREE.LineBasicMaterial({ color: 0x007799, transparent: true, opacity: 0.15 });
    const rootMat = new THREE.LineBasicMaterial({ color: 0x005566, transparent: true, opacity: 0.1 });
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0x00e4ff, transparent: true, opacity: 0.6 });
    const nodeGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const goldNodeMat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.5 });
    this._treeNodes = [];

    // Helper: add circuit-board style branch (L-shaped lines) + octahedron node
    const octGeo = new THREE.OctahedronGeometry(0.06, 0);
    const addBranch = (from, to, mat, nodeM, nodeScale) => {
      // Circuit board style: go down first, then horizontal (L-shape)
      const midY = from.y + (to.y - from.y) * (0.3 + Math.random() * 0.4);
      const cornerPt = new THREE.Vector3(from.x, midY, from.z);
      const cornerPt2 = new THREE.Vector3(to.x, midY, to.z);

      // Vertical segment (down from parent)
      this.treeGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from, cornerPt]),
        mat
      ));
      // Horizontal segment (to the side)
      this.treeGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([cornerPt, cornerPt2]),
        mat
      ));
      // Vertical segment (down to target)
      this.treeGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([cornerPt2, to]),
        mat
      ));

      // Corner dots (circuit junction points)
      const dotGeo = new THREE.SphereGeometry(0.025, 4, 4);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x00e4ff, transparent: true, opacity: 0.4 });
      const dot1 = new THREE.Mesh(dotGeo, dotMat);
      dot1.position.copy(cornerPt);
      this.treeGroup.add(dot1);
      const dot2 = new THREE.Mesh(dotGeo, dotMat.clone());
      dot2.position.copy(cornerPt2);
      this.treeGroup.add(dot2);

      // Octahedron node (sci-fi diamond shape)
      const n = new THREE.Mesh(octGeo, nodeM.clone());
      n.position.copy(to);
      n.scale.setScalar(nodeScale || 0.7);
      this.treeGroup.add(n);
      this._treeNodes.push(n);
      return to;
    };

    // Brain stem — connects from brain CENTER (0,0,0) down to tree
    const stemOrigin = new THREE.Vector3(0, 0, 0);  // centro do cerebro
    const stemEnd = new THREE.Vector3(0, -2.5, 0);
    // Main stem (thick, bright)
    const mainStem = new THREE.QuadraticBezierCurve3(stemOrigin, new THREE.Vector3(0, -1.2, 0), stemEnd);
    this.treeGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(mainStem.getPoints(25)),
      new THREE.LineBasicMaterial({ color: 0x00e4ff, transparent: true, opacity: 0.7 })
    ));
    // Spinal cord effect (5 secondary lines from brain center)
    for (let si = 0; si < 5; si++) {
      const angle = (si / 5) * Math.PI * 2;
      const ox = Math.cos(angle) * 0.12;
      const oz = Math.sin(angle) * 0.08;
      const sCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(ox, -0.2, oz),
        new THREE.Vector3(ox * 0.3, -1.3, oz * 0.3),
        new THREE.Vector3(0, -2.5, 0)
      );
      this.treeGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(sCurve.getPoints(18)),
        new THREE.LineBasicMaterial({ color: 0x00aacc, transparent: true, opacity: 0.25 })
      ));
    }

    // 9 primary branches — spread wide from stem base
    const primaries = [
      { x: -3.5, y: -3.5, z: 0.7 }, { x: -2.5, y: -3.8, z: -0.5 },
      { x: -1.2, y: -3.6, z: 0.4 }, { x: -0.4, y: -3.4, z: -0.3 },
      { x: 0.4, y: -3.4, z: 0.3 },
      { x: 1.2, y: -3.6, z: -0.4 }, { x: 2.5, y: -3.8, z: 0.5 },
      { x: 3.5, y: -3.5, z: -0.7 },
      { x: 0, y: -3.2, z: 0.6 }
    ];
    const primEnds = [];
    for (const p of primaries) {
      const end = addBranch(stemEnd, new THREE.Vector3(p.x, p.y, p.z), branchMat, nodeMat, 0.8);
      primEnds.push(end);
    }

    // Secondary branches (4-5 per primary)
    const secEnds = [];
    for (const pe of primEnds) {
      const count = 4 + Math.floor(Math.random() * 2);
      for (let j = 0; j < count; j++) {
        const sx = pe.x + (Math.random() - 0.5) * 1.8;
        const sy = pe.y - 0.4 - Math.random() * 0.9;
        const sz = pe.z + (Math.random() - 0.5) * 1.2;
        const end = addBranch(pe, new THREE.Vector3(
          Math.max(-5, Math.min(5, sx)), Math.max(-6.5, sy), sz
        ), secMat, j % 2 === 0 ? goldNodeMat : nodeMat, 0.5);
        secEnds.push(end);
      }
    }

    // Tertiary/leaf nodes (2-3 per secondary)
    const leafEnds = [];
    for (const se of secEnds) {
      const count = 2 + Math.floor(Math.random() * 2);
      for (let k = 0; k < count; k++) {
        const lx = se.x + (Math.random() - 0.5) * 1.4;
        const ly = se.y - 0.3 - Math.random() * 0.7;
        const lz = se.z + (Math.random() - 0.5) * 0.9;
        const end = addBranch(se, new THREE.Vector3(
          Math.max(-6, Math.min(6, lx)), Math.max(-8, ly), lz
        ), leafMat, goldNodeMat, 0.3);
        leafEnds.push(end);
      }
    }

    // Cross-connections between nearby nodes (neural web effect)
    for (let i = 0; i < 20; i++) {
      const allEnds = [...primEnds, ...secEnds.slice(0, 20)];
      const a = Math.floor(Math.random() * allEnds.length);
      const b = Math.floor(Math.random() * allEnds.length);
      if (a !== b) {
        const dist = allEnds[a].distanceTo(allEnds[b]);
        if (dist < 2.5 && dist > 0.5) {
          this.treeGroup.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([allEnds[a], allEnds[b]]),
            new THREE.LineBasicMaterial({ color: 0x006688, transparent: true, opacity: 0.08 })
          ));
        }
      }
    }

    // Bottom root tendrils (fade into void)
    for (let i = 0; i < 20; i++) {
      const rx = (Math.random() - 0.5) * 10;
      const ry = -6.5 - Math.random() * 2.5;
      const rz = (Math.random() - 0.5) * 2.5;
      const startY = -5.5 - Math.random();
      this.treeGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(rx + (Math.random()-0.5)*0.5, startY, rz),
          new THREE.Vector3(rx, ry, rz + (Math.random()-0.5)*0.3)
        ]), rootMat
      ));
    }

    // ── Floating particles (more, bigger, spread across entire tree area) ──
    this._particles = [];
    const pMat = new THREE.MeshBasicMaterial({ color: 0x00e4ff, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 250; i++) {
      const size = 0.02 + Math.random() * 0.04;
      const pGeo = new THREE.SphereGeometry(size, 4, 4);
      const p = new THREE.Mesh(pGeo, pMat.clone());
      p.position.set((Math.random()-0.5)*8, 1+Math.random()*-9, (Math.random()-0.5)*3);
      p.userData = {
        speed: 0.002+Math.random()*0.01,
        phase: Math.random()*Math.PI*2,
        baseX: p.position.x,
        baseZ: p.position.z,
        drift: 0.15+Math.random()*0.5
      };
      this.scene.add(p);
      this._particles.push(p);
    }

    // ── Lightning bolts (more, brighter) ──
    this._lightningLines = [];
    for (let i = 0; i < 16; i++) {
      const pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.7 }));
      line.visible = false;
      this.scene.add(line);
      this._lightningLines.push(line);
    }

    // Scan ring removido — cerebro limpo sem anel

    // ── Electric pulse points ──
    this._pulsePoints = [];
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 25; i++) {
      const pp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), pulseMat.clone());
      const theta = Math.random()*Math.PI*2, phi = Math.random()*Math.PI;
      pp.position.set(Math.sin(phi)*Math.cos(theta)*2.4, Math.cos(phi)*1.7, Math.sin(phi)*Math.sin(theta)*2.0);
      pp.userData = { phase: Math.random()*Math.PI*2, speed: 1.5+Math.random()*4 };
      this.scene.add(pp);
      this._pulsePoints.push(pp);
    }
  }

  pause() {
    this._paused = true;
  }

  resume() {
    if (this._paused) {
      this._paused = false;
      this.animate();
    }
  }

  dispose() {
    this._disposed = true;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement?.remove();
    }
    if (this.scene) {
      this.scene.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }
  }

  animate() {
    if (this._disposed) return;
    if (this._paused) return;

    this.time += 0.016;
    this.speedMul += (this.targetSpeed - this.speedMul) * 0.03;
    const t = this.time * this.speedMul;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 1.2);

    // ── Brain rotation (rotate entire group) ──
    const rotSpeed = this.state === 'thinking' ? 0.008 : 0.002;
    if (this.brainGroup) {
      this.brainGroup.rotation.y += rotSpeed * this.speedMul;
    }

    // Brain subtle breathing
    const breathe = 1 + 0.04 * Math.sin(this.time * 1.5);
    if (this.brainGroup) {
      this.brainGroup.scale.setScalar(breathe);
    }

    // ── Update holographic shader uniforms ──
    if (this.holoMaterial) {
      this.holoMaterial.uniforms.uTime.value = this.time;
      this.holoMaterial.uniforms.uPulse.value = 0.7 + 0.3 * pulse;
      this.holoMaterial.uniforms.uScanY.value = (Math.sin(this.time * 0.8) + 1) * 0.5;

      // Color shift by state
      if (this.state === 'speaking') {
        this.holoMaterial.uniforms.uColor.value.setHex(0x00ffaa);
        this.holoMaterial.uniforms.uOpacity.value = 1.0;
      } else if (this.state === 'thinking') {
        this.holoMaterial.uniforms.uColor.value.setHex(0x44aaff);
        this.holoMaterial.uniforms.uOpacity.value = 1.0;
      } else if (this.state === 'listening') {
        this.holoMaterial.uniforms.uColor.value.setHex(0x00ffcc);
        this.holoMaterial.uniforms.uOpacity.value = 0.9;
      } else {
        this.holoMaterial.uniforms.uColor.value.setHex(0x00e4ff);
        this.holoMaterial.uniforms.uOpacity.value = 0.8;
      }
    }

    // ── Wireframe opacity by state ──
    if (this.brainWire && this.wireMaterial) {
      if (this.state === 'speaking') {
        this.wireMaterial.opacity = 0.18 + 0.08 * pulse;
        this.wireMaterial.color.setHex(0x00ffaa);
      } else if (this.state === 'thinking') {
        this.wireMaterial.opacity = 0.15 + 0.1 * pulse;
        this.wireMaterial.color.setHex(0x44aaff);
      } else if (this.state === 'listening') {
        this.wireMaterial.opacity = 0.1 + 0.05 * pulse;
        this.wireMaterial.color.setHex(0x00ffcc);
      } else {
        this.wireMaterial.opacity = 0.1 + 0.04 * pulse;
        this.wireMaterial.color.setHex(0x00e4ff);
      }
    }

    // Glow + scan ring removidos

    // ── Lightning bolts (random arcs between brain surface points) ──
    for (let i = 0; i < this._lightningLines.length; i++) {
      const line = this._lightningLines[i];
      if (Math.random() < (this.state === 'thinking' ? 0.15 : 0.03)) {
        // Create new lightning
        const t1 = Math.random() * Math.PI * 2, p1 = Math.random() * Math.PI;
        const t2 = t1 + (Math.random() - 0.5) * 2, p2 = p1 + (Math.random() - 0.5) * 1;
        const r = 1.55;
        const start = new THREE.Vector3(Math.sin(p1)*Math.cos(t1)*r, Math.cos(p1)*0.75*r, Math.sin(p1)*Math.sin(t1)*0.85*r);
        const end = new THREE.Vector3(Math.sin(p2)*Math.cos(t2)*r, Math.cos(p2)*0.75*r, Math.sin(p2)*Math.sin(t2)*0.85*r);
        const mid = start.clone().add(end).multiplyScalar(0.5).add(new THREE.Vector3((Math.random()-0.5)*0.3, (Math.random()-0.5)*0.2, (Math.random()-0.5)*0.3));
        const pts = [start, mid, end];
        line.geometry.setFromPoints(pts);
        line.material.opacity = 0.5 + Math.random() * 0.5;
        line.material.color.setHex(Math.random() > 0.5 ? 0x88ddff : 0xffffff);
        line.visible = true;
        setTimeout(() => { line.visible = false; }, 80 + Math.random() * 120);
      }
    }

    // ── Electric pulses on brain surface ──
    if (this._pulsePoints) {
      for (const pp of this._pulsePoints) {
        const intensity = 0.5 + 0.5 * Math.sin(this.time * pp.userData.speed + pp.userData.phase);
        pp.material.opacity = intensity * (this.state === 'thinking' ? 1 : 0.5);
        pp.scale.setScalar(0.5 + intensity * (this.state === 'thinking' ? 1.5 : 0.5));
      }
    }

    // ── Particles flowing upward ──
    for (const p of this._particles) {
      const ud = p.userData;
      const speed = ud.speed * this.speedMul * (this.state === 'listening' ? 2 : 1);
      p.position.y += speed * (this.state === 'speaking' ? -1 : 1);

      // Drift sideways
      p.position.x = ud.baseX + Math.sin(this.time * 0.5 + ud.phase) * ud.drift;
      p.position.z = ud.baseZ + Math.cos(this.time * 0.3 + ud.phase) * ud.drift * 0.5;

      // Wrap around
      if (p.position.y > 2) { p.position.y = -8; }
      if (p.position.y < -9) { p.position.y = 2; }

      // Fade based on distance from brain
      const distY = Math.abs(p.position.y);
      p.material.opacity = Math.max(0.05, 0.6 - distY * 0.15) * (0.5 + 0.5 * Math.sin(this.time * 2 + ud.phase));
    }

    // ── Tree nodes pulse ──
    for (let i = 0; i < this._treeNodes.length; i++) {
      const n = this._treeNodes[i];
      const nodePulse = 0.7 + 0.3 * Math.sin(this.time * 1.5 + i * 0.5);
      n.material.opacity = nodePulse * (this.state === 'thinking' ? 1 : 0.6);

      if (this.state === 'thinking') {
        const cascade = 0.5 + 0.5 * Math.sin(this.time * 4 - i * 0.3);
        n.scale.setScalar(0.5 + cascade * 0.8);
      } else {
        n.scale.setScalar(0.5 + nodePulse * 0.3);
      }
    }

    // ── Glitch effect (occasional) ──
    if (this.brainGroup && Math.random() < 0.01) {
      this.brainGroup.position.x = (Math.random() - 0.5) * 0.05;
      const bg = this.brainGroup;
      setTimeout(() => { bg.position.x = 0; }, 50);
    }

    // ── Camera subtle sway ──
    this.camera.position.x = Math.sin(this.time * 0.12) * 0.2;
    this.camera.position.y = Math.sin(this.time * 0.08) * 0.15;
    this.camera.lookAt(0, -1.5, 0);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate);
  }
}

// Initialize Neural Tree (after layout settles)
let particleOrb = null;
requestAnimationFrame(() => {
  const canvas = document.getElementById('particle-orb');
  if (canvas) {
    particleOrb = new NeuralTree(canvas);
    window.particleOrb = particleOrb;
  }
});

// Pause 3D animation when tab is not visible (saves GPU)
document.addEventListener('visibilitychange', () => {
  if (!particleOrb) return;
  if (document.hidden) {
    particleOrb.pause();
  } else {
    particleOrb.resume();
  }
});

// State
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let currentAttachment = null;
let voiceEnabled = true;
let ttsVoice = localStorage.getItem('ttsVoice') || 'ash';

// Realtime API supports a different voice set than TTS.
// Map TTS voice to nearest valid Realtime voice.
const REALTIME_VOICES = new Set(['alloy','ash','ballad','coral','echo','sage','shimmer','verse','marin','cedar']);
const REALTIME_VOICE_MAP = { onyx: 'ash', nova: 'shimmer', fable: 'sage' };
function getRealtimeVoice() {
  if (REALTIME_VOICES.has(ttsVoice)) return ttsVoice;
  return REALTIME_VOICE_MAP[ttsVoice] || 'ash';
}

let wakeWordEnabled = false;
let wakeWordRecognition = null;
let ttsQueue = [];
let ttsPlaying = false;
let userGestureReceived = false;
let webSpeechRec = null;
const canWebSpeech = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

// ========== SCREEN CAPTURE (LIVE MODE) ==========
let capturedScreen = null;    // base64 PNG of last captured frame
let screenStream = null;       // persistent stream for live mode
let liveScreenMode = false;    // when true: stream stays alive, fresh frame per query
let hiddenVideo = null;        // off-screen video element bound to stream

const screenBtn = document.getElementById('screen-btn');

function stopScreenCapture() {
  capturedScreen = null;
  liveScreenMode = false;
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  if (hiddenVideo) { hiddenVideo.srcObject = null; hiddenVideo.remove(); hiddenVideo = null; }
  document.getElementById('screen-preview-box')?.remove();
  screenBtn.classList.remove('active');
}

// Legacy alias (existing X button callback expects this name)
const removeScreenPreview = stopScreenCapture;

// Grab latest frame from the live stream (returns base64 dataURL)
async function grabLatestFrame() {
  if (!hiddenVideo || hiddenVideo.readyState < 2) return capturedScreen;
  const canvas = document.createElement('canvas');
  canvas.width = hiddenVideo.videoWidth || 1920;
  canvas.height = hiddenVideo.videoHeight || 1080;
  canvas.getContext('2d').drawImage(hiddenVideo, 0, 0);
  capturedScreen = canvas.toDataURL('image/jpeg', 0.85); // jpeg for smaller payload
  return capturedScreen;
}

async function captureScreen() {
  // Toggle off if already active
  if (liveScreenMode || capturedScreen) {
    stopScreenCapture();
    addTerminalLine(
      currentLang === 'BR' ? '[system] Compartilhamento de tela desligado.' : '[system] Screen sharing stopped.',
      'system-line'
    );
    return;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'monitor', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 15 } },
      audio: false,
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
      monitorTypeSurfaces: 'include'
    });

    // Bind stream to a hidden <video> so we can grab frames on demand
    hiddenVideo = document.createElement('video');
    hiddenVideo.autoplay = true;
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    hiddenVideo.style.position = 'fixed';
    hiddenVideo.style.left = '-9999px';
    hiddenVideo.srcObject = screenStream;
    document.body.appendChild(hiddenVideo);
    await new Promise((resolve) => {
      hiddenVideo.onloadedmetadata = () => { hiddenVideo.play().then(resolve).catch(resolve); };
    });

    // User stops sharing via browser UI → clean up
    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      stopScreenCapture();
      addTerminalLine(
        currentLang === 'BR' ? '[system] Compartilhamento encerrado pelo navegador.' : '[system] Sharing ended by browser.',
        'system-line'
      );
    });

    liveScreenMode = true;
    await grabLatestFrame();
    showScreenPreview(capturedScreen);
    screenBtn.classList.add('active');

    addTerminalLine(
      currentLang === 'BR'
        ? '[system] 🔴 LIVE — tela compartilhada. JARVIS vê em tempo real. Fale ou digite suas perguntas.'
        : '[system] 🔴 LIVE — screen shared. JARVIS sees in real-time. Speak or type your questions.',
      'system-line'
    );
  } catch (err) {
    if (err.name !== 'NotAllowedError') {
      addTerminalLine(`[error] Screen capture failed: ${err.message}`, 'error-line');
    }
    stopScreenCapture();
  }
}

function showScreenPreview(dataUrl) {
  document.getElementById('screen-preview-box')?.remove();

  const preview = document.createElement('div');
  preview.id = 'screen-preview-box';
  preview.className = 'screen-preview live';
  preview.innerHTML = `
    <img src="${dataUrl}" alt="Live screen">
    <span class="screen-label">LIVE</span>
    <button class="remove-screen" title="Stop sharing">✕</button>
  `;
  preview.querySelector('.remove-screen').onclick = stopScreenCapture;

  // Posicionar acima do terminal (canto inferior direito)
  preview.style.cssText = 'position:fixed; bottom:200px; right:16px; width:360px; z-index:51;';
  document.body.appendChild(preview);
}

function updatePreviewImage(dataUrl) {
  const img = document.querySelector('#screen-preview-box img');
  if (img) img.src = dataUrl;
}

async function analyzeScreen(userMessage) {
  // In live mode, grab a FRESH frame for every question
  if (liveScreenMode) {
    await grabLatestFrame();
    updatePreviewImage(capturedScreen);
  }
  if (!capturedScreen) return null;

  const screen = capturedScreen;
  setAvatarState('thinking');

  try {
    // Fast path: GPT-4o-mini vision (~1s, real-time)
    const res = await fetch('/api/analyze-screen-fast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: screen, message: userMessage, language: currentLang, saveHistory: true })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.response) return data.response;
    }
    // Fallback: Claude vision (deeper analysis)
    const res2 = await fetch('/api/analyze-screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: screen, message: userMessage, language: currentLang, saveHistory: true })
    });
    const data2 = await res2.json();
    return data2.response || null;
  } catch (err) {
    addTerminalLine(`[error] Screen analysis failed: ${err.message}`, 'error-line');
    return null;
  }
}

screenBtn?.addEventListener('click', captureScreen);

// ========== CONCLAVE TOGGLE ==========
let conclaveEnabled = localStorage.getItem('jarvis-conclave') !== 'false';

function initConclaveToggle() {
  const cb = document.getElementById('conclave-checkbox');
  const chip = cb?.closest('.mega-chip');
  if (!cb) return;

  cb.checked = conclaveEnabled;
  if (!conclaveEnabled) chip?.classList.add('conclave-off');

  cb.addEventListener('change', () => {
    conclaveEnabled = cb.checked;
    localStorage.setItem('jarvis-conclave', conclaveEnabled);
    if (conclaveEnabled) chip?.classList.remove('conclave-off');
    else chip?.classList.add('conclave-off');
  });
}

// ========== LANGUAGE STATE ==========
let currentLang = localStorage.getItem('jarvis-lang') || 'BR';

function initLangToggle() {
  const enBtn = document.getElementById('lang-en');
  const brBtn = document.getElementById('lang-br');
  const esBtn = document.getElementById('lang-es');
  if (!enBtn || !brBtn) return;

  function applyLang(lang) {
    currentLang = lang;
    localStorage.setItem('jarvis-lang', lang);
    enBtn.classList.toggle('active', lang === 'EN');
    brBtn.classList.toggle('active', lang === 'BR');
    if (esBtn) esBtn.classList.toggle('active', lang === 'ES');
    const placeholders = {
      BR: 'Fale com o JARVIS...',
      ES: 'Habla con JARVIS...',
      EN: 'Talk to JARVIS...'
    };
    document.getElementById('chat-input').placeholder = placeholders[lang] || placeholders.EN;
    const bootMsg = document.getElementById('boot-msg');
    if (bootMsg) {
      const boots = {
        BR: '[system] JARVIS COCKPIT INICIALIZADO. TODO SISTEMA DE INTELIGÊNCIA CARREGADO COM SUCESSO E PRONTO PARA USO.',
        ES: '[system] JARVIS COCKPIT INICIADO. TODO EL SISTEMA DE INTELIGENCIA CARGADO CON ÉXITO Y LISTO PARA USAR.',
        EN: '[system] JARVIS COCKPIT ONLINE. ALL SYSTEMS LOADED AND READY.'
      };
      bootMsg.textContent = boots[lang] || boots.EN;
    }
    // Update tab labels based on language
    const langKey = `data-lang-${lang.toLowerCase()}`;
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      const label = btn.getAttribute(langKey);
      if (label) btn.textContent = label;
    });

    // If Realtime is active, reconnect to pick up new language instructions
    if (realtimeActive) { stopRealtime(); setTimeout(() => startRealtime(), 300); }
  }

  applyLang(currentLang);

  enBtn.addEventListener('click', () => { if (currentLang !== 'EN') applyLang('EN'); });
  brBtn.addEventListener('click', () => { if (currentLang !== 'BR') applyLang('BR'); });
  if (esBtn) esBtn.addEventListener('click', () => { if (currentLang !== 'ES') applyLang('ES'); });
}

// ========== AUDIO CONTEXT (SOUND FEEDBACK) ==========
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, duration = 80, vol = 0.1) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
    osc.stop(ctx.currentTime + duration / 1000);
  } catch {}
}

function playSendSound() { playTone(880, 60); setTimeout(() => playTone(1100, 60), 70); }
function playReceiveSound() { playTone(660, 80); }
function playErrorSound() { playTone(440, 100); setTimeout(() => playTone(330, 150), 120); }

// ========== TERMINAL RENDERING ==========
function getTimestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function addTerminalLine(text, type = '') {
  const line = document.createElement('div');
  line.className = `terminal-line ${type}`;
  const ts = document.createElement('span');
  ts.className = 'ts';
  ts.textContent = `[${getTimestamp()}]`;
  const msg = document.createElement('span');
  msg.className = 'msg';

  if (type === '' || type === 'jarvis-line') {
    msg.innerHTML = renderMarkdown(text);
    addCopyButtons(msg);
  } else {
    msg.textContent = text;
  }

  line.appendChild(ts);
  line.appendChild(document.createTextNode(' '));
  line.appendChild(msg);
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

let pendingAckTTS = null; // Track ACK that needs TTS

// ========== MODEL CARD HIGHLIGHTING ==========
function setActiveModel(model) {
  document.querySelectorAll('.model-card').forEach(c => c.classList.remove('active-model'));
  const id = model === 'opus' ? 'model-opus' : model === 'sonnet' ? 'model-sonnet' : 'model-haiku';
  document.getElementById(id)?.classList.add('active-model');
}

// ========== AGENT CHIP HIGHLIGHTING ==========
function highlightAgents(text) {
  document.querySelectorAll('.agent-chip').forEach(c => c.classList.remove('active-agent'));
  const agentMap = {
    'dev': 'dev', 'architect': 'architect', 'qa': 'qa', 'pm': 'pm',
    'po': 'po', 'devops': 'devops', 'analyst': 'analyst', 'ux': 'ux',
    'sm': 'sm', 'data-eng': 'data-eng', 'data-engineer': 'data-eng',
    'aios-master': 'aios-master', 'orion': 'aios-master',
    'conclave': 'conclave', 'crítico': 'conclave', 'advogado': 'conclave', 'sintetizador': 'conclave',
  };
  const lower = text.toLowerCase();
  for (const [keyword, dataAgent] of Object.entries(agentMap)) {
    if (lower.includes(`@${keyword}`) || lower.includes(keyword)) {
      document.querySelector(`.agent-chip[data-agent="${dataAgent}"]`)?.classList.add('active-agent');
    }
  }
}

// Show which model is active based on agent chip selection
function setModelFromAgent(agentEl) {
  if (!agentEl) return;
  document.querySelectorAll('.model-card').forEach(c => c.classList.remove('active-model'));
  if (agentEl.classList.contains('model-opus'))   document.getElementById('model-opus')?.classList.add('active-model');
  if (agentEl.classList.contains('model-sonnet')) document.getElementById('model-sonnet')?.classList.add('active-model');
  if (agentEl.classList.contains('model-haiku'))  document.getElementById('model-haiku')?.classList.add('active-model');
}

function processStreamLine(line) {
  if (!line.trim()) return;

  if (line.startsWith('[translated]')) {
    // Replace last user line in terminal with English translation
    const translated = line.slice(12).trim();
    const userLines = terminal.querySelectorAll('.user-line');
    if (userLines.length > 0) {
      const last = userLines[userLines.length - 1];
      last.querySelector('.msg').textContent = `> ${translated}`;
    }
    return true;
  } else if (line.startsWith('[ack]')) {
    // 7A: Instant acknowledgment — show + speak immediately
    const ackText = line.slice(5).trim();
    addTerminalLine(ackText, 'info-line');
    // Fire TTS for ACK immediately (non-blocking)
    if (shouldUseLocalTTS()) {
      pendingAckTTS = speakResponse(ackText);
    }
    return true;
  } else if (line.startsWith('[system]')) {
    addTerminalLine(line, 'system-line');
    // Completion TTS is handled exclusively by GPT-mini push notifications (SSE)
  } else if (line.startsWith('[file]')) {
    addTerminalLine(line, 'file-line');
    const match = line.match(/\[file\]\s*(.+?)\s*\|\s*(.+)/);
    if (match) addDownloadCard(match[1].trim(), match[2].trim());
  } else if (line.startsWith('[error]')) {
    addTerminalLine(line, 'error-line');
  } else if (line.startsWith('[warn]')) {
    addTerminalLine(line, 'warn-line');
  } else if (line.startsWith('[info]')) {
    addTerminalLine(line, 'info-line');
  } else {
    return false;
  }
  return true;
}

function addDownloadCard(fileName, filePath) {
  const card = document.createElement('div');
  card.className = 'download-card';
  card.innerHTML = `
    <span class="file-icon">📄</span>
    <span class="file-name">${fileName}</span>
    <a class="dl-btn" href="/api/files/download?path=${encodeURIComponent(filePath)}" download>Download</a>
  `;
  terminal.appendChild(card);
  terminal.scrollTop = terminal.scrollHeight;
}

// ========== MARKDOWN RENDERING ==========
function renderMarkdown(text) {
  try {
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        highlight: function(code, lang) {
          if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
          }
          return code;
        },
        breaks: true,
        gfm: true
      });
      return marked.parse(text);
    }
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  } catch {
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

function addCopyButtons(container) {
  container.querySelectorAll('pre').forEach(pre => {
    pre.style.position = 'relative';
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.textContent = 'Copy';
    btn.onclick = () => {
      const code = pre.querySelector('code')?.textContent || pre.textContent;
      navigator.clipboard.writeText(code);
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    };
    pre.appendChild(btn);
  });
}

// ========== CHAT - SEND MESSAGE ==========
async function sendMessage(text, fromVoice = false) {
  if (!text.trim() && !capturedScreen) return;

  userGestureReceived = true;
  pendingAckTTS = null;
  const displayText = text.trim() || (currentLang === 'BR' ? '[análise de tela]' : '[screen analysis]');
  addTerminalLine(`> ${displayText}`, 'user-line');
  chatInput.value = '';
  playSendSound();
  setAvatarState('thinking');

  // If screen is captured + Q&A → GPT-4o-mini vision (fast, real-time)
  // If screen is captured + build task → fall through to normal chat (Claude gets context via /api/chat)
  const isBuildTask = /\b(create|generate|build|make|write|produce|design|implement|develop|fix|update|report|crie|gere|construa|faça|escreva|implemente|corrija|analise|relatório)\b/i.test(text);
  if ((capturedScreen || liveScreenMode) && !isBuildTask) {
    const screenResponse = await analyzeScreen(text.trim());
    if (screenResponse) {
      addTerminalLine(screenResponse, 'jarvis-line');
      playReceiveSound();
      highlightAgents(screenResponse);
      if (shouldUseLocalTTS()) {
        const brief = screenResponse.replace(/```[\s\S]*?```/g, '').replace(/[#*_`~>|]/g, '')
          .replace(/\n+/g, ' ').trim().split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').slice(0, 300);
        if (brief) await speakResponse(brief);
      }
      setAvatarState('idle');
      scheduleNextListen(1200); // continuous voice mode restart after vision
      return;
    }
    setAvatarState('idle');
    scheduleNextListen(1500);
    return;
  }

  if (!text.trim()) return;

  // Highlight active model based on complexity
  const opusMatch = /\b(architect|redesign|refactor|infrastructure|migration|deploy|scale|database|system design|e-?book|full|complete|advanced|complex|detailed|comprehensive|deep|entire|production|enterprise)\b/i.test(text);
  const sonnetMatch = /\b(create|generate|build|make|write|produce|design|implement|develop|fix|update|modify|analyze|report|presentation|website|app|pdf|document|code|script|html|css|crie|gere|construa|faça|escreva)\b/i.test(text);
  const isVoiceTask = fromVoice && (opusMatch || sonnetMatch);
  setActiveModel(opusMatch ? 'opus' : sonnetMatch ? 'sonnet' : 'haiku');

  // ACK is now handled by GPT-mini response (Phase 1 of /api/chat)
  let ackPromise = null;

  try {
    const body = { message: text, fromVoice, language: currentLang, conclaveEnabled };
    if (currentAttachment) {
      body.attachmentId = currentAttachment.id;
      currentAttachment = null;
      removeAttachmentPreview();
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let buffer = '';
    let claudeSilent = false;   // true after [build-start] — Claude output is terminal-only
    let gptResponse = '';       // GPT-mini portion (before [build-start]) — this gets spoken
    let streamTtsBuffer = '';
    let streamTtsFired = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      fullResponse += chunk;

      // Extract GPT portion (before [build-start]) for TTS — before mutating claudeSilent
      const ackPortion = chunk.split('[build-start]')[0];
      const hadBuildStart = chunk.includes('[build-start]');

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('[build-start]')) { claudeSilent = true; continue; }
        processStreamLine(line);
        if (!claudeSilent) gptResponse += line + '\n';
      }

      // Streaming TTS: fire on ACK portion regardless of claudeSilent state
      if (!streamTtsFired && shouldUseLocalTTS() && ackPortion.trim()) {
        const cleanAck = ackPortion.split('\n')
          .filter(l => !l.match(/^\[(system|file|error|warn|info|ack|build-start|translated)\]/))
          .join(' ').trim();
        if (cleanAck) {
          streamTtsBuffer += cleanAck + ' ';
          // Fire TTS as soon as possible: first clause ending with .!?,: OR 18+ chars accumulated
          const sentMatch = streamTtsBuffer.match(/^(.{6,}?[.!?,:])\s/);
          const bufTrim = streamTtsBuffer.trim();
          if (sentMatch || (hadBuildStart && bufTrim.length > 6) || bufTrim.length >= 18) {
            streamTtsFired = true;
            speakResponse((sentMatch ? sentMatch[1] : bufTrim).trim());
          }
        }
      }
    }

    if (buffer.trim() && !buffer.startsWith('[build-start]')) processStreamLine(buffer);

    // GPT-mini response → render + speak (if not already fired by streaming)
    const cleanGpt = gptResponse.split('\n')
      .filter(l => !l.startsWith('[system]') && !l.startsWith('[file]') && !l.startsWith('[error]') && !l.startsWith('[warn]') && !l.startsWith('[info]') && !l.startsWith('[ack]'))
      .join('\n').trim();

    // Claude output (after [build-start]) → render to terminal, NO TTS
    const claudeOutput = fullResponse.split('[build-start]')[1] || '';
    const cleanClaude = claudeOutput.split('\n')
      .filter(l => !l.startsWith('[system]') && !l.startsWith('[file]') && !l.startsWith('[error]') && !l.startsWith('[warn]') && !l.startsWith('[info]') && !l.startsWith('[ack]'))
      .join('\n').trim();

    if (cleanGpt) {
      addTerminalLine(cleanGpt, 'jarvis-line');
      playReceiveSound();
      highlightAgents(cleanGpt);
      // Speak GPT-mini response if streaming TTS didn't already fire
      if (shouldUseLocalTTS() && !streamTtsFired) {
        const brief = cleanGpt.replace(/```[\s\S]*?```/g, '').replace(/[#*_`~>|]/g, '')
          .replace(/\n+/g, ' ').trim()
          .split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5).slice(0, 2).join(' ').slice(0, 300);
        if (brief) await speakResponse(brief);
      }
    }

    if (cleanClaude) {
      addTerminalLine(cleanClaude, 'jarvis-line');
      if (!cleanGpt) { playReceiveSound(); highlightAgents(cleanClaude); }
      // NO TTS — completion will come via push notification (GPT-mini SSE)
    }

    if (true) { // keep block structure
    }

    setAvatarState('idle');
    scheduleNextListen(1500); // continuous mode restart
  } catch (err) {
    addTerminalLine(`[error] ${err.message}`, 'error-line');
    playErrorSound();
    setAvatarState('idle');
    scheduleNextListen(2000);
  }
}

// ========== AVATAR STATES ==========
function setAvatarState(state) {
  if (avatarContainer) {
    avatarContainer.classList.remove('listening', 'thinking', 'speaking');
    if (state === 'listening' || state === 'thinking' || state === 'speaking') {
      avatarContainer.classList.add(state);
    }
  }
  switch (state) {
    case 'listening': avatarStatus.textContent = 'LISTENING'; break;
    case 'thinking':  avatarStatus.textContent = 'PROCESSING'; break;
    case 'speaking':  avatarStatus.textContent = 'SPEAKING'; break;
    default:          avatarStatus.textContent = '';
  }
  // Update particle orb
  if (particleOrb) particleOrb.setState(state);
}

// ========== VOICE CAPTURE (MEDIARECORDER + WHISPER) ==========
let recordingStartTime = 0;
let audioAnalyser = null;
let peakVolume = 0;
let vadTimer = null;         // silence auto-stop timer
let continuousMode = false;  // hands-free loop
let continuousTimer = null;

const VAD_SILENCE_MS = 1100; // fastest: stop after 1.1s of silence

// Continuous mode toggle button (injected into input bar)
function initContinuousBtn() {
  const btn = document.createElement('button');
  btn.id = 'continuous-btn';
  btn.className = 'screen-btn';
  btn.title = 'Continuous voice mode';
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <circle cx="12" cy="22" r="1.5" fill="currentColor"/>
  </svg>`;
  btn.addEventListener('click', async () => {
    if (realtimeConnecting) {
      addTerminalLine(
        currentLang === 'BR' ? '[status] Conectando, aguarde...' : '[status] Connecting, please wait...',
        'info-line'
      );
      // Wait for current connection attempt to finish, then report final status
      while (realtimeConnecting) await new Promise(r => setTimeout(r, 200));
      btn.style.color = realtimeActive ? 'var(--cyan)' : '';
      btn.style.background = realtimeActive ? 'rgba(0,212,255,0.1)' : '';
      addTerminalLine(
        realtimeActive
          ? (currentLang === 'BR' ? '[status] Modo contínuo: ATIVADO' : '[status] Continuous mode: ON')
          : (currentLang === 'BR' ? '[status] Modo contínuo: DESATIVADO' : '[status] Continuous mode: OFF'),
        'info-line'
      );
      return;
    }
    await startRealtime();
    btn.style.color = realtimeActive ? 'var(--cyan)' : '';
    btn.style.background = realtimeActive ? 'rgba(0,212,255,0.1)' : '';
    addTerminalLine(
      realtimeActive
        ? (currentLang === 'BR' ? '[status] Modo contínuo: ATIVADO' : '[status] Continuous mode: ON')
        : (currentLang === 'BR' ? '[status] Modo contínuo: DESATIVADO' : '[status] Continuous mode: OFF'),
      'info-line'
    );
  });
  const sendBtn = document.getElementById('send-btn');
  sendBtn.parentNode.insertBefore(btn, sendBtn);
}

// ========== REALTIME VOICE MODE (OpenAI WebRTC — ~300ms latency) ==========
let realtimePC = null;
let realtimeStream = null;
let realtimeAudio = null;
let realtimeDC = null;
let realtimeActive = false;
let realtimeConnecting = false;
let realtimeUserDisabled = false;

function shouldUseLocalTTS() {
  // Avoid double-voice: if Realtime voice channel is active, local TTS must stay silent.
  return voiceEnabled && userGestureReceived && !(realtimeActive && realtimeDC?.readyState === 'open');
}

async function startRealtime() {
  if (realtimeActive) { realtimeUserDisabled = true; return stopRealtime(); }
  if (realtimeConnecting) return; // guard against parallel connects
  realtimeConnecting = true;
  realtimeUserDisabled = false;
  try {
    try {
      if (_currentAudio) _currentAudio.pause();
      _currentAudio = null;
      _ttsQueue = Promise.resolve();
    } catch {}
    userGestureReceived = true;
    const tokenRes = await fetch('/api/realtime/session', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      // Realtime API only supports: alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar
      // TTS voices like onyx, nova, fable are NOT supported — always map to a valid Realtime voice
      body: JSON.stringify({ language: currentLang, voice: getRealtimeVoice() })
    });
    const sess = await tokenRes.json();
    if (!sess.client_secret?.value) throw new Error(sess.error || 'No ephemeral token');

    const pc = new RTCPeerConnection();
    realtimePC = pc;

    // Remote audio sink
    realtimeAudio = new Audio();
    realtimeAudio.autoplay = true;
    pc.ontrack = (e) => { realtimeAudio.srcObject = e.streams[0]; setAvatarState('speaking'); };

    // Mic input
    realtimeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    realtimeStream.getTracks().forEach(t => pc.addTrack(t, realtimeStream));

    // Data channel for events
    const dc = pc.createDataChannel('oai-events');
    realtimeDC = dc;
    dc.addEventListener('message', (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'input_audio_buffer.speech_started') setAvatarState('listening');
        if (ev.type === 'response.audio.done') setAvatarState('idle');
        if (ev.type === 'conversation.item.input_audio_transcription.completed' && ev.transcript) {
          // Translate user transcript to match the active language toggle
          (async () => {
            try {
              const r = await fetch('/api/translate', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ text: ev.transcript, targetLang: currentLang })
              });
              const d = await r.json();
              addTerminalLine('> ' + (d.translated || ev.transcript), 'user-line');
            } catch {
              addTerminalLine('> ' + ev.transcript, 'user-line');
            }
          })();
          // PATCH 10 · fallback de execução do mic + deduplicação
          window._pendingTranscript = ev.transcript;
          window._dispatchedThisTurn = false;
          clearTimeout(window._pendingTranscriptTimer);
          window._pendingTranscriptTimer = setTimeout(() => {
            if (window._dispatchedThisTurn) return;
            const t = window._pendingTranscript;
            if (!t) return;
            window._pendingTranscript = null;
            window._dispatchedThisTurn = true;
            handleRealtimeTask(null, JSON.stringify({ request: t }));
          }, 700);
        }
        if (ev.type === 'response.audio_transcript.done' && ev.transcript) {
          addTerminalLine(ev.transcript, 'jarvis-line');
        }
        // Handle function call: GPT-realtime asks us to dispatch to Claude
        if (ev.type === 'response.function_call_arguments.done' && ev.name === 'execute_task') {
          // PATCH 10 · dedup
          window._pendingTranscript = null;
          clearTimeout(window._pendingTranscriptTimer);
          if (window._dispatchedThisTurn) return;
          window._dispatchedThisTurn = true;
          handleRealtimeTask(ev.call_id, ev.arguments);
        }
      } catch {}
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls?model=gpt-realtime', {
      method: 'POST',
      body: offer.sdp,
      headers: { 'Authorization': `Bearer ${sess.client_secret.value}`, 'Content-Type': 'application/sdp' }
    });
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });

    realtimeActive = true;
    realtimeConnecting = false;
    // Stop wake word listener (Realtime owns the mic now)
    try { if (wakeWordRecognition) { wakeWordRecognition.onend = null; wakeWordRecognition.stop(); } } catch {}
    const btn = document.getElementById('realtime-btn');
    if (btn) { btn.style.color = 'var(--cyan)'; btn.style.background = 'rgba(0,212,255,0.15)'; }
    const cbtn = document.getElementById('continuous-btn');
    if (cbtn) { cbtn.style.color = 'var(--cyan)'; cbtn.style.background = 'rgba(0,212,255,0.1)'; }
    micBtn.classList.add('recording');
  } catch (err) {
    addTerminalLine('[error] Realtime: ' + err.message, 'error-line');
    realtimeConnecting = false;
    stopRealtime();
  }
}

function stopRealtime() {
  realtimeActive = false;
  realtimeConnecting = false;
  try { realtimeDC?.close(); } catch {}
  try { realtimePC?.close(); } catch {}
  try { realtimeStream?.getTracks().forEach(t => t.stop()); } catch {}
  if (realtimeAudio) { realtimeAudio.srcObject = null; realtimeAudio = null; }
  realtimePC = null; realtimeStream = null; realtimeDC = null;
  const btn = document.getElementById('realtime-btn');
  if (btn) { btn.style.color = ''; btn.style.background = ''; }
  const cbtn = document.getElementById('continuous-btn');
  if (cbtn) { cbtn.style.color = ''; cbtn.style.background = ''; }
  micBtn.classList.remove('recording');
  setAvatarState('idle');
  // Resume wake word listening so "jarvis" can reactivate later
  if (wakeWordEnabled) { try { startWakeWord(); } catch {} }
}

// Dispatch Realtime function call to Claude via existing /api/chat, then feed result back
async function handleRealtimeTask(callId, argsJson) {
  let request = '';
  try { request = JSON.parse(argsJson).request || ''; } catch {}
  if (!request) return;

  // PATCH 10 · só envia function_call_output se callId real (fallback usa callId=null)
  // PATCH 14 · 1ª pessoa
  if (callId && realtimeDC?.readyState === 'open') {
    realtimeDC.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify({ status: 'dispatched', message: 'Task is executing in background' })
      }
    }));
    realtimeDC.send(JSON.stringify({ type: 'response.create' }));
  }

  // Fire Claude in background via /api/chat (non-blocking)
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: request, fromVoice: true, language: currentLang, conclaveEnabled })
    });
    // Stream & render to terminal; completion announcement comes via SSE notification channel
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line && !line.startsWith('[build-start]')) processStreamLine(line);
      }
    }
  } catch (err) {
    addTerminalLine('[error] Claude dispatch: ' + err.message, 'error-line');
  }
}

// When Claude finishes (SSE push), inject completion announcement into Realtime session.
// The message is ALREADY the final sentence to speak — just tell the model to say it verbatim.
// Falls back to TTS if Realtime data channel is dead.
function announceToRealtime(message) {
  // If Realtime DC is alive, inject the message for GPT to speak
  if (realtimeActive && realtimeDC?.readyState === 'open') {
    try {
      const INSTR = {
        BR: `Fale exatamente esta frase ao senhor, sem traduzir nem adicionar nada: "${message}"`,
        ES: `Di exactamente esta frase al señor, sin traducir ni añadir nada: "${message}"`,
        EN: `Say exactly this sentence to the user, do not translate or add anything: "${message}"`
      };
      const instruction = INSTR[currentLang] || INSTR.EN;
      realtimeDC.send(JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: instruction }] }
      }));
      realtimeDC.send(JSON.stringify({ type: 'response.create' }));
      return;
    } catch (e) {
      console.warn('[JARVIS] Realtime DC send failed, falling back to TTS:', e.message);
    }
  }
  // Fallback: Realtime is supposed to be active but DC is dead — use TTS directly
  if (shouldUseLocalTTS()) {
    speakResponse(message);
  }
}

function initRealtimeBtn() {
  // Push-to-talk: Realtime only starts when user explicitly clicks mic button.
  // No auto-start, no auto-reconnect. User is in full control.
  // Wake word ("Jarvis") can also activate if enabled in settings.
}

async function startRecording() {
  try {
    userGestureReceived = true;

    // Fast path: Web Speech API — zero latency, no server round-trip
    if (canWebSpeech) {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      webSpeechRec = new SpeechRec();
      // Language follows the BR/EN toggle
      webSpeechRec.lang = ({ BR: 'pt-BR', ES: 'es-ES', EN: 'en-US' }[currentLang]) || 'en-US';
      webSpeechRec.interimResults = true;
      webSpeechRec.maxAlternatives = 1;
      webSpeechRec.continuous = false;

      let finalSent = false;
      webSpeechRec.onresult = (event) => {
        let interim = '', final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) final += event.results[i][0].transcript;
          else interim += event.results[i][0].transcript;
        }
        if (interim) chatInput.value = interim;
        if (final && !finalSent) {
          finalSent = true;
          chatInput.value = final;
          stopRecording();
          sendMessage(final.trim(), true);
        }
      };

      webSpeechRec.onerror = (e) => {
        console.warn('[JARVIS] Web Speech error:', e.error, '— falling back to Whisper');
        isRecording = false;
        micBtn.classList.remove('recording');
        setAvatarState('idle');
        webSpeechRec = null;
      };

      webSpeechRec.onend = () => {
        if (!finalSent) {
          isRecording = false;
          micBtn.classList.remove('recording');
          setAvatarState('idle');
          webSpeechRec = null;
          // Continuous mode: restart after brief pause
          if (continuousMode) {
            continuousTimer = setTimeout(() => startRecording(), 800);
          }
        }
      };

      webSpeechRec.start();
      isRecording = true;
      micBtn.classList.add('recording');
      setAvatarState('listening');
      playTone(1200, 40);
      addTerminalLine('[system] Listening (real-time)...', 'system-line');
      return;
    }

    // Fallback: MediaRecorder + Whisper
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true
      }
    });

    // Set up audio level monitoring
    try {
      const actx = getAudioCtx();
      const source = actx.createMediaStreamSource(stream);
      audioAnalyser = actx.createAnalyser();
      audioAnalyser.fftSize = 512;
      source.connect(audioAnalyser);
      peakVolume = 0;

      const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
      const monitorVolume = () => {
        if (!isRecording) return;
        audioAnalyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        if (avg > peakVolume) peakVolume = avg;

        // VAD: auto-stop on sustained silence (after user has spoken)
        const elapsed = Date.now() - recordingStartTime;
        if (elapsed > 1200 && peakVolume > 8) {
          // User spoke at least once — now detect silence
          if (avg < 3) {
            if (!vadTimer) {
              vadTimer = setTimeout(() => {
                if (isRecording) {
                  addTerminalLine('[system] Silence detected — processing...', 'system-line');
                  stopRecording();
                }
              }, VAD_SILENCE_MS);
            }
          } else {
            // Sound detected — reset silence timer
            clearTimeout(vadTimer);
            vadTimer = null;
          }
        }

        requestAnimationFrame(monitorVolume);
      };
      requestAnimationFrame(monitorVolume);
    } catch {}

    // 64kbps: half upload size = ~40% faster Whisper round-trip, quality still excellent for STT
    const recorderOpts = { audioBitsPerSecond: 64000 };
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      recorderOpts.mimeType = 'audio/webm;codecs=opus';
    }

    mediaRecorder = new MediaRecorder(stream, recorderOpts);
    console.log('MediaRecorder:', mediaRecorder.mimeType, recorderOpts.audioBitsPerSecond + 'bps');

    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());

      const duration = Date.now() - recordingStartTime;
      if (duration < 800) {
        addTerminalLine('[warn] Recording too short. Hold the mic button and speak, then click again to stop.', 'warn-line');
        setAvatarState('idle');
        return;
      }

      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      if (blob.size < 1000) {
        addTerminalLine('[warn] No audio captured. Check your microphone.', 'warn-line');
        setAvatarState('idle');
        return;
      }

      if (peakVolume < 5) {
        addTerminalLine('[warn] No voice detected — only silence captured. Speak louder or check mic.', 'warn-line');
        setAvatarState('idle');
        return;
      }

      addTerminalLine(`[system] Audio captured: ${(blob.size / 1024).toFixed(1)}KB, ${(duration / 1000).toFixed(1)}s, peak vol: ${peakVolume.toFixed(0)}`, 'system-line');
      await transcribeAndSend(blob);
    };

    // Single chunk — timeslice fragments corrupt WebM for Whisper
    mediaRecorder.start();
    recordingStartTime = Date.now();
    isRecording = true;
    micBtn.classList.add('recording');
    setAvatarState('listening');
    playTone(1200, 40);
    addTerminalLine('[system] Listening... Click mic again when done speaking.', 'system-line');
  } catch (err) {
    addTerminalLine(`[error] Microphone access denied: ${err.message}`, 'error-line');
    playErrorSound();
  }
}

function stopRecording() {
  clearTimeout(vadTimer); vadTimer = null;
  if (webSpeechRec && isRecording) {
    webSpeechRec.stop();
    isRecording = false;
    micBtn.classList.remove('recording');
    setAvatarState('thinking');
    playTone(800, 40);
    return;
  }
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    micBtn.classList.remove('recording');
    setAvatarState('thinking');
    playTone(800, 40);
  }
}

// After JARVIS finishes responding in continuous mode — restart listening
function scheduleNextListen(delayMs = 1200) {
  if (!continuousMode) return;
  clearTimeout(continuousTimer);
  continuousTimer = setTimeout(() => {
    if (!isRecording && continuousMode) startRecording();
  }, delayMs);
}

async function transcribeAndSend(audioBlob) {
  try {
    setAvatarState('thinking');
    addTerminalLine('[system] Transcribing voice...', 'system-line');

    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');
    formData.append('lang', currentLang);

    const sttRes = await fetch('/api/stt', { method: 'POST', body: formData });
    if (!sttRes.ok) {
      const err = await sttRes.json().catch(() => ({ error: 'STT failed' }));
      throw new Error(err.error || 'Transcription failed');
    }
    const sttData = await sttRes.json();

    // Handle filtered hallucinations
    if (sttData.filtered) {
      addTerminalLine(`[warn] ${sttData.reason || 'No clear speech detected.'}  Speak clearly and try again.`, 'warn-line');
      setAvatarState('idle');
      return;
    }

    if (!sttData.text || !sttData.text.trim()) {
      addTerminalLine('[warn] No speech detected. Try again.', 'warn-line');
      setAvatarState('idle');
      return;
    }

    // Use sendMessage with fromVoice=true for the optimized pipeline
    await sendMessage(sttData.text, true);
  } catch (err) {
    addTerminalLine(`[error] Voice processing failed: ${err.message}`, 'error-line');
    playErrorSound();
    setAvatarState('idle');
  }
}

// ========== TTS PIPELINE (SERIAL QUEUE — prevents double-voice overlap) ==========
let _ttsQueue = Promise.resolve();
let _currentAudio = null;

function speakResponse(text) {
  if (!shouldUseLocalTTS()) return Promise.resolve();
  // Enqueue — each call waits for the previous to finish before starting
  _ttsQueue = _ttsQueue.then(() => _ttsPlay(text)).catch(() => _ttsPlay(text));
  return _ttsQueue;
}

async function _ttsPlay(text) {
  // Clean text for TTS — remove code blocks, markdown, bracket prefixes
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[#*_`~>|]/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  // Split into sentences, max 3 for voice brevity
  const sentences = cleanText
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 5)
    .slice(0, 3);

  if (sentences.length === 0) return;

  // Combine into one TTS call for speed (avoid multiple round-trips)
  const ttsText = sentences.join(' ').slice(0, 500);

  setAvatarState('speaking');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ttsText, language: currentLang, voice: ttsVoice }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error('TTS failed:', res.status);
      setAvatarState('idle');
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    await new Promise((resolve) => {
      const audio = new Audio(url);
      _currentAudio = audio;
      audio.onended = () => { _currentAudio = null; URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { _currentAudio = null; URL.revokeObjectURL(url); resolve(); };
      audio.play().catch((e) => {
        console.warn('Audio autoplay blocked:', e.message);
        _currentAudio = null;
        URL.revokeObjectURL(url);
        resolve();
      });
    });
  } catch (err) {
    console.error('TTS error:', err.message);
  }

  setAvatarState('idle');
}

// ========== WAKE WORD DETECTION ==========
function startWakeWord() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  wakeWordRecognition = new SpeechRec();
  wakeWordRecognition.continuous = true;
  wakeWordRecognition.interimResults = true;
  wakeWordRecognition.lang = currentLang === 'BR' ? 'pt-BR' : currentLang === 'ES' ? 'es-ES' : 'en-US';

  // PATCH WAKE · "Jarvis" sozinho/com saudação curta — bloqueia "criei um jarvis"
  function isWakeWordOnly(rawTranscript) {
    if (!rawTranscript) return false;
    const t = rawTranscript.toLowerCase().trim()
      .replace(/[.,!?;:"'`]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return false;

    // Remove saudações comuns no início ("ei", "oi", "hey", "olá", "ô")
    const stripped = t.replace(/^(ei|oi|ô|o|olá|ola|hey|hello|hi|alô|alo)\s+/, '').trim();

    // DEVE começar com jarvis (ou pronúncia variante)
    if (!/^(jarvis|j[áa]rvis|jarves|jarbis|jarves)\b/.test(stripped)) return false;

    // Remove "jarvis" + permite só sufixos curtos de chamada
    // OK: "jarvis", "jarvis você aí", "jarvis me ouve", "jarvis tá aí", "jarvis por favor"
    // BAD: "criei um jarvis" (não começa com jarvis), "o jarvis é demais" (não chamada direta)
    const afterJarvis = stripped.replace(/^(jarvis|j[áa]rvis|jarves|jarbis)\s*/, '').trim();
    if (!afterJarvis) return true; // só "jarvis"

    // Sufixos aceitos (curtos, no máximo 4 palavras de chamada)
    const validSuffix = /^(voc[êe]|tu|t[áa]|est[áa]|aqui|ai|a[ií]|me\s+(ouve|escuta)|escuta|ouve|por\s+favor|please|hey|listen|are\s+you|hello|oi)?\s*(aqui|ai|a[ií]|por\s+favor|please)?\s*$/;
    return validSuffix.test(afterJarvis);
  }

  let lastWakeAt = 0;
  wakeWordRecognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      // PATCH WAKE · só processa transcrição FINAL (evita falsos positivos com interim)
      if (!result.isFinal) continue;

      const transcript = result[0].transcript || '';

      // PATCH WAKE · validação rigorosa: "Jarvis" sozinho ou com saudação curta
      if (!isWakeWordOnly(transcript)) continue;

      // Debounce: bloqueia ativações em <2s
      const now = Date.now();
      if (now - lastWakeAt < 2000) continue;
      lastWakeAt = now;

      if (!realtimeActive && !realtimeConnecting) {
        addTerminalLine('[info] 🎤 JARVIS ativado por voz — modo escuta + cowork ON', 'info-line');
        userGestureReceived = true;
        const greetings = {
          BR: ['Pronto, senhor.', 'Estou aqui, senhor.', 'Sim, senhor.', 'Às ordens, senhor.', 'Pode falar, senhor.'],
          ES: ['Listo, señor.', 'Aquí estoy, señor.', 'Sí, señor.'],
          EN: ['Ready, sir.', 'I\'m here, sir.', 'Yes, sir.']
        };
        const list = greetings[currentLang] || greetings.EN;
        const pick = list[Math.floor(Math.random() * list.length)];
        Promise.resolve(startRealtime())
          .then(() => announceToRealtime(pick))
          .catch(() => { if (shouldUseLocalTTS()) speakResponse(pick); });
        fetch('/api/cowork/start', { method: 'POST' }).catch(() => {});
      }
      break;
    }
  };

  wakeWordRecognition.onend = () => {
    if (wakeWordEnabled) wakeWordRecognition.start();
  };

  wakeWordRecognition.start();
}

function stopWakeWord() {
  if (wakeWordRecognition) {
    wakeWordEnabled = false;
    wakeWordRecognition.stop();
    wakeWordRecognition = null;
  }
}

// ========== TAB NAVIGATION ==========
// Floating "Back to Cockpit" button
var backToCockpitBtn = document.createElement('button');
backToCockpitBtn.id = 'back-to-cockpit';
backToCockpitBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"><polyline points="15 18 9 12 15 6"/></svg>COCKPIT';
backToCockpitBtn.style.cssText = 'display:none;position:fixed;top:12px;left:12px;z-index:9999;padding:8px 16px;background:rgba(0,20,40,0.9);border:1px solid var(--cyan);border-radius:6px;color:var(--cyan);font-family:Orbitron,sans-serif;font-size:10px;letter-spacing:1px;cursor:pointer;transition:all 0.3s;backdrop-filter:blur(10px);box-shadow:0 0 15px rgba(0,228,255,0.2);';
backToCockpitBtn.onmouseenter = function() { this.style.background = 'rgba(0,228,255,0.15)'; this.style.boxShadow = '0 0 20px rgba(0,228,255,0.4)'; };
backToCockpitBtn.onmouseleave = function() { this.style.background = 'rgba(0,20,40,0.9)'; this.style.boxShadow = '0 0 15px rgba(0,228,255,0.2)'; };
backToCockpitBtn.onclick = function() {
  var cockpitTab = document.querySelector('.tab-btn[data-tab="principal"]');
  if (cockpitTab) cockpitTab.click();
};
document.body.appendChild(backToCockpitBtn);

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

    // Show/hide back button
    backToCockpitBtn.style.display = btn.dataset.tab === 'principal' ? 'none' : 'block';

    if (btn.dataset.tab === 'file') loadFiles();
  });
});

// ========== FILE BROWSER ==========
async function loadFiles() {
  try {
    const res = await fetch('/api/files');
    const data = await res.json();
    const fileList = document.getElementById('file-list');

    if (!data.files || data.files.length === 0) {
      fileList.innerHTML = '<div class="file-empty">No files yet. Ask JARVIS to create something.</div>';
      return;
    }

    const icons = {
      '.pdf': '📕', '.md': '📝', '.txt': '📄', '.html': '🌐', '.css': '🎨',
      '.js': '⚡', '.ts': '💠', '.py': '🐍', '.json': '📋', '.png': '🖼️',
      '.jpg': '🖼️', '.jpeg': '🖼️', '.gif': '🖼️', '.svg': '🖼️',
      '.xlsx': '📊', '.pptx': '📽️', '.docx': '📃', '.zip': '📦',
      '.mp3': '🎵', '.mp4': '🎬', '.wav': '🎵'
    };

    // Group by project
    const byProject = {};
    for (const f of data.files) {
      const proj = f.project || 'General';
      if (!byProject[proj]) byProject[proj] = [];
      byProject[proj].push(f);
    }

    fileList.innerHTML = Object.entries(byProject).map(([project, files]) => {
      const items = files.map(f => {
        const icon = icons[f.ext] || '📄';
        const size = f.size > 1024 * 1024
          ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
          : `${(f.size / 1024).toFixed(1)} KB`;
        const date = new Date(f.createdAt).toLocaleDateString();
        return `<div class="file-item">
          <span class="file-item-icon">${icon}</span>
          <div class="file-item-info">
            <div class="file-item-name">${f.name}</div>
            <div class="file-item-meta">${size} · ${date}</div>
          </div>
          <div class="file-item-actions">
            <a href="/api/files/view?path=${encodeURIComponent(f.path)}" target="_blank">Preview</a>
            <a href="${f.downloadUrl}" download>Download</a>
          </div>
        </div>`;
      }).join('');
      return `<div class="file-project-group">
        <div class="file-project-header">${project}</div>
        ${items}
      </div>`;
    }).join('');
  } catch (err) {
    document.getElementById('file-list').innerHTML = '<div class="file-empty">Error loading files.</div>';
  }
}

// ========== ATTACHMENT ==========
fileAttach.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/attach', { method: 'POST', body: formData });
    const data = await res.json();

    currentAttachment = { id: data.attachmentId, name: data.name };
    showAttachmentPreview(data.name);
  } catch (err) {
    addTerminalLine(`[error] Upload failed: ${err.message}`, 'error-line');
  }
  fileAttach.value = '';
});

function showAttachmentPreview(name) {
  removeAttachmentPreview();
  const preview = document.createElement('div');
  preview.className = 'attachment-preview';
  preview.id = 'att-preview';
  preview.innerHTML = `📎 ${name} <button class="remove-att" onclick="removeAttachment()">✕</button>`;
  document.querySelector('.input-bar').insertAdjacentElement('beforebegin', preview);
}

function removeAttachmentPreview() {
  document.getElementById('att-preview')?.remove();
}

function removeAttachment() {
  currentAttachment = null;
  removeAttachmentPreview();
}

// ========== STAT CARD POLLING ==========
async function updateStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    const h = Math.floor(data.uptime / 3600000);
    const m = Math.floor((data.uptime % 3600000) / 60000);
    const s = Math.floor((data.uptime % 60000) / 1000);
    const sessionEl = document.getElementById('stat-session');
    if (sessionEl) sessionEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const tokensEl = document.getElementById('stat-tokens');
    if (tokensEl) tokensEl.textContent = data.tokens.toLocaleString();
    const planEl = document.getElementById('stat-plan');
    if (planEl) planEl.textContent = data.plan;
    const reqEl = document.getElementById('stat-requests');
    if (reqEl) reqEl.textContent = data.requests;

    // Latency
    const latEl = document.getElementById('stat-latency');
    if (latEl && data.lastLatency) {
      const ms = data.lastLatency;
      latEl.textContent = ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
      latEl.style.color = ms < 800 ? '#00ff88' : ms < 2000 ? '#ffd700' : '#ff4444';
    }

    // Pool health HUD — O=Opus S=Sonnet H=Haiku, number = warm processes ready
    const poolEl = document.getElementById('stat-pool');
    if (poolEl && data.pool) {
      const { opus = 0, sonnet = 0, haiku = 0 } = data.pool;
      poolEl.textContent = `O${opus} S${sonnet} H${haiku}`;
      poolEl.style.color = (opus + sonnet + haiku) > 4 ? '#00ff88' : '#ffd700';
    }
  } catch {}
}

// ========== CLOCK ==========
function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
}

// ========== CONFIG ==========
document.getElementById('save-api-key')?.addEventListener('click', async () => {
  const key = document.getElementById('config-api-key').value;
  if (!key) return;
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'OPENAI_API_KEY', value: key })
    });
    addTerminalLine('[system] API key updated. Restart server for changes to take effect.', 'system-line');
  } catch (err) {
    addTerminalLine(`[error] Failed to save config: ${err.message}`, 'error-line');
  }
});

document.getElementById('config-voice')?.addEventListener('change', (e) => {
  voiceEnabled = e.target.checked;
  addTerminalLine(`[system] Voice ${voiceEnabled ? 'enabled' : 'disabled'}`, 'system-line');
});

document.getElementById('config-wakeword')?.addEventListener('change', (e) => {
  wakeWordEnabled = e.target.checked;
  localStorage.setItem('jarvis-wakeword-disabled', wakeWordEnabled ? 'false' : 'true');
  if (wakeWordEnabled) {
    try {
      startWakeWord();
      addTerminalLine('[system] Wake word "Jarvis" activated', 'system-line');
    } catch (err) {
      wakeWordEnabled = false;
      e.target.checked = false;
      addTerminalLine(`[error] Wake word failed: ${err.message || err}`, 'error-line');
    }
  } else {
    stopWakeWord();
    addTerminalLine('[system] Wake word deactivated', 'system-line');
  }
});

// TTS Voice selector — persists to localStorage
const ttsVoiceSelect = document.getElementById('config-tts-voice');
if (ttsVoiceSelect) {
  ttsVoiceSelect.value = ttsVoice;
  ttsVoiceSelect.addEventListener('change', (e) => {
    ttsVoice = e.target.value;
    localStorage.setItem('ttsVoice', ttsVoice);
    addTerminalLine(`[info] TTS voice set to: ${ttsVoice}`, 'info-line');
  });
}

// ========== AUTO-START WAKE WORD ==========
// JARVIS listens for his name — only if user hasn't explicitly disabled it
setTimeout(() => {
  const userDisabled = localStorage.getItem('jarvis-wakeword-disabled') === 'true';
  if (canWebSpeech && !wakeWordEnabled && !userDisabled) {
    try {
      wakeWordEnabled = true;
      startWakeWord();
      console.log('[JARVIS] Wake word "JARVIS" auto-activated');
      // Sync checkbox if exists
      const wakeChk = document.getElementById('config-wakeword');
      if (wakeChk) wakeChk.checked = true;
    } catch (err) {
      console.warn('[JARVIS] Wake word auto-start failed (mic denied?):', err.message || err);
      wakeWordEnabled = false;
    }
  }
}, 2000);

// ========== EVENT LISTENERS ==========
sendBtn.addEventListener('click', () => sendMessage(chatInput.value));

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(chatInput.value);
  }
});

micBtn.addEventListener('click', () => {
  userGestureReceived = true;
  // Feedback visual imediato
  micBtn.classList.toggle('recording');
  addTerminalLine(realtimeActive ? '[system] Desconectando voz...' : '[system] Conectando voz...', 'system-line');
  startRealtime().then(() => {
    if (realtimeActive) micBtn.classList.add('recording');
    else micBtn.classList.remove('recording');
  }).catch((err) => {
    micBtn.classList.remove('recording');
    addTerminalLine(`[error] Voz: ${err.message || err}`, 'error-line');
  });
});

// Terminal direct input
terminal.addEventListener('click', () => chatInput.focus());

// Agent chip click → insert @mention + highlight model
document.querySelectorAll('.agent-chip[data-agent]').forEach(chip => {
  chip.style.cursor = 'pointer';
  chip.addEventListener('click', () => {
    const agent = chip.dataset.agent;
    const mention = `@${agent} `;
    const input = document.getElementById('chat-input');
    if (!input.value.startsWith('@')) {
      input.value = mention + input.value;
    } else {
      input.value = mention;
    }
    input.focus();
    setModelFromAgent(chip);
    // Visual feedback
    document.querySelectorAll('.agent-chip').forEach(c => c.classList.remove('active-agent'));
    chip.classList.add('active-agent');
  });
});

// ========== INIT ==========
updateClock();
setInterval(updateClock, 1000);
setInterval(updateStats, 4000);
updateStats();
initLangToggle();
initConclaveToggle();
initContinuousBtn();
initRealtimeBtn();

// Realtime connects when user clicks mic — no auto-connect to save API calls


// ── PUSH NOTIFICATION CHANNEL ──────────────────────────────────────────────
// Listens for Claude build completions. GPT-mini generates the message server-side
// and pushes it here — frontend speaks it automatically via TTS.
(function initNotifications() {
  const es = new EventSource('/api/notifications');
  es.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      // PATCH 2 · switch handler para múltiplos tipos
      switch (payload.type) {
        case 'build-complete':
          if (payload.message) {
            addTerminalLine(`[info] ✓ ${payload.message}`, 'info-line');
            console.log('[JARVIS] Build complete notification received:', payload.message);
            if (realtimeActive && realtimeDC?.readyState === 'open') announceToRealtime(payload.message);
            else if (shouldUseLocalTTS()) speakResponse(payload.message);
          }
          break;
        case 'pet-mic':
          // PATCH 2 · botão PET liga/desliga mic
          if (payload.active === true && typeof startRealtime === 'function') {
            startRealtime();
          } else if (payload.active === false && typeof stopRealtime === 'function') {
            stopRealtime();
          }
          break;
      }
    } catch {}
  };
  es.onerror = () => { /* silent reconnect handled by browser */ };
})();

// ── PRE-FLIGHT VERIFICATION ──────────────────────────────────────────────
// Runs on first visit (or if user cleared localStorage). Tests all systems.
(async function runPreflight() {
  const PREFLIGHT_KEY = 'jarvis_preflight_passed';
  const overlay = document.getElementById('preflight-overlay');
  if (!overlay) return;

  // Skip if already passed (unless Shift held during load for re-check)
  if (localStorage.getItem(PREFLIGHT_KEY) && !window._forcePreflightRecheck) {
    overlay.style.display = 'none';
    return;
  }

  overlay.style.display = 'flex';

  try {
    const res = await fetch('/api/health/preflight', { method: 'POST' });
    const data = await res.json();

    // Update each check item
    for (const [key, result] of Object.entries(data.results)) {
      const el = document.querySelector(`.pf-item[data-key="${key}"]`);
      if (!el) continue;
      const icon = el.querySelector('.pf-icon');
      if (result.status === 'ok') {
        icon.textContent = '✅';
        el.classList.add('pf-ok');
      } else {
        icon.textContent = '❌';
        el.classList.add('pf-err');
        el.setAttribute('data-detail', result.detail || 'Unknown error');
      }
    }

    // Collect failed issues for auto-fix
    const failedIssues = [];
    for (const [key, result] of Object.entries(data.results)) {
      if (result.status !== 'ok') {
        failedIssues.push({ key, detail: result.detail || 'Unknown error' });
      }
    }

    // Show result
    const resultDiv = document.getElementById('preflight-result');
    const msgEl = document.getElementById('preflight-msg');
    const okBtn = document.getElementById('preflight-ok');
    const retryBtn = document.getElementById('preflight-retry');
    resultDiv.style.display = 'block';

    // Ensure autofix button exists
    let fixBtn = document.getElementById('preflight-autofix');
    if (!fixBtn) {
      fixBtn = document.createElement('button');
      fixBtn.id = 'preflight-autofix';
      fixBtn.style.cssText = 'background:linear-gradient(135deg,#00d4ff,#00ff88);color:#000;border:none;padding:10px 28px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;margin-left:8px;';
      fixBtn.textContent = 'Corrigir Automaticamente';
      retryBtn.parentElement.appendChild(fixBtn);
    }

    // Ensure autofix log area exists
    let fixLog = document.getElementById('preflight-fixlog');
    if (!fixLog) {
      fixLog = document.createElement('div');
      fixLog.id = 'preflight-fixlog';
      fixLog.style.cssText = 'display:none;margin-top:14px;background:#060a1a;border:1px solid #1a3a5c;border-radius:8px;padding:12px;max-height:180px;overflow-y:auto;font-family:"JetBrains Mono",monospace;font-size:10px;color:#c9d1d9;white-space:pre-wrap;word-break:break-all;';
      resultDiv.appendChild(fixLog);
    }

    if (data.status === 'ready') {
      msgEl.textContent = 'Todos os sistemas operacionais. JARVIS esta pronto.';
      msgEl.style.color = '#00ff88';
      okBtn.textContent = 'Iniciar JARVIS';
      okBtn.style.background = '#00d4ff';
      okBtn.style.display = 'inline-block';
      retryBtn.style.display = 'none';
      fixBtn.style.display = 'none';
    } else {
      msgEl.textContent = 'Problemas detectados. JARVIS pode funcionar com recursos limitados.';
      msgEl.style.color = '#ffaa00';
      okBtn.textContent = 'Continuar Assim';
      okBtn.style.background = '#555';
      okBtn.style.display = 'inline-block';
      retryBtn.style.display = 'inline-block';
      // Show auto-fix only if Claude CLI is available
      const claudeOk = data.results.claude_cli?.status === 'ok';
      fixBtn.style.display = claudeOk ? 'inline-block' : 'none';
    }

    okBtn.onclick = () => {
      localStorage.setItem(PREFLIGHT_KEY, Date.now().toString());
      overlay.style.display = 'none';
    };

    retryBtn.onclick = () => {
      document.querySelectorAll('.pf-item').forEach(el => {
        el.classList.remove('pf-ok', 'pf-err');
        el.removeAttribute('data-detail');
        el.querySelector('.pf-icon').textContent = '⏳';
      });
      resultDiv.style.display = 'none';
      fixLog.style.display = 'none';
      fixLog.textContent = '';
      window._forcePreflightRecheck = true;
      runPreflight();
    };

    fixBtn.onclick = async () => {
      // Disable buttons during fix
      fixBtn.disabled = true;
      fixBtn.textContent = 'Corrigindo...';
      fixBtn.style.opacity = '0.6';
      retryBtn.disabled = true;
      okBtn.disabled = true;
      fixLog.style.display = 'block';
      fixLog.textContent = '[JARVIS] Acionando sistema para corrigir problemas...\n\n';

      try {
        const fixRes = await fetch('/api/health/autofix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issues: failedIssues })
        });

        const reader = fixRes.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fixLog.textContent += chunk;
          fixLog.scrollTop = fixLog.scrollHeight;
        }

        fixLog.textContent += '\n\n[JARVIS] Correcao concluida. Executando verificacao novamente...\n';

        // Wait 2s then re-run preflight
        await new Promise(r => setTimeout(r, 2000));
        document.querySelectorAll('.pf-item').forEach(el => {
          el.classList.remove('pf-ok', 'pf-err');
          el.removeAttribute('data-detail');
          el.querySelector('.pf-icon').textContent = '⏳';
        });
        resultDiv.style.display = 'none';
        fixLog.style.display = 'none';
        fixLog.textContent = '';
        window._forcePreflightRecheck = true;
        runPreflight();

      } catch (err) {
        fixLog.textContent += `\n[ERRO] ${err.message}\n`;
        fixBtn.disabled = false;
        fixBtn.textContent = 'Corrigir Automaticamente';
        fixBtn.style.opacity = '1';
        retryBtn.disabled = false;
        okBtn.disabled = false;
      }
    };
  } catch (e) {
    // Server not reachable
    const resultDiv = document.getElementById('preflight-result');
    const msgEl = document.getElementById('preflight-msg');
    resultDiv.style.display = 'block';
    msgEl.textContent = '❌ Cannot reach JARVIS server. Is it running?';
    msgEl.style.color = '#ff4444';
  }
})();



// ═══════════════════════════════════════════════
// COCKPIT HUD LOGIC — Iron Man Edition
// ═══════════════════════════════════════════════

(function() {
  // ── Quick Access Buttons (HUD esquerdo) ──
  document.querySelectorAll('.hud-qbtn[data-quick-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.quickTab;
      const tabBtn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
      if (tabBtn) tabBtn.click();
    });
  });

  // ── Weather Widget ──
  async function loadWeather() {
    try {
      // Detectar cidade: GPS (mais preciso) → múltiplos serviços IP → fallback
      let city = 'Presidente Prudente';

      // Método 1: GPS do browser (mais preciso)
      try {
        const pos = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) reject('no geo');
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 300000 });
        });
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        // Reverse geocode via wttr.in
        const geoR = await fetch(`https://wttr.in/${lat},${lon}?format=j1`);
        if (geoR.ok) {
          const geoD = await geoR.json();
          const area = geoD.nearest_area?.[0];
          if (area) city = area.areaName?.[0]?.value || area.region?.[0]?.value || city;
        }
      } catch {
        // Método 2: IP geolocation (fallback)
        try {
          const geoRes = await fetch('https://ipapi.co/json/');
          if (geoRes.ok) {
            const geo = await geoRes.json();
            if (geo.city) city = geo.city;
          }
        } catch {
          try {
            const geoRes2 = await fetch('https://ip-api.com/json/?fields=city');
            if (geoRes2.ok) {
              const geo2 = await geoRes2.json();
              if (geo2.city) city = geo2.city;
            }
          } catch {}
        }
      }

      // Primeiro tenta endpoint local (se JARVIS server tiver)
      let data = null;
      try {
        const r = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
        if (r.ok) data = await r.json();
      } catch {}

      // Fallback: wttr.in direto (nao precisa de server)
      if (!data) {
        const r2 = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
        if (r2.ok) {
          const w = await r2.json();
          const cur = w.current_condition[0];
          data = {
            city,
            temp: cur.temp_C,
            desc: cur.lang_pt?.[0]?.value || cur.weatherDesc[0].value
          };
        }
      }

      if (data) {
        const wCity = document.getElementById('weather-city');
        const wTemp = document.getElementById('weather-temp');
        const wDesc = document.getElementById('weather-desc');
        if (wCity) wCity.textContent = data.city.toUpperCase();
        if (wTemp) wTemp.textContent = `${data.temp}°C`;
        if (wDesc) wDesc.textContent = data.desc;
      }
    } catch (err) {
      const wCity = document.getElementById('weather-city');
      const wTemp = document.getElementById('weather-temp');
      const wDesc = document.getElementById('weather-desc');
      if (wCity) wCity.textContent = 'OFFLINE';
      if (wTemp) wTemp.textContent = '--°C';
      if (wDesc) wDesc.textContent = 'sem conexao';
    }
  }

  // ── System Health Bars ──
  async function updateHealth() {
    const barApi = document.getElementById('bar-api');
    const barVoice = document.getElementById('bar-voice');
    const barClaude = document.getElementById('bar-claude');
    const sApi = document.getElementById('bar-api-status');
    const sVoice = document.getElementById('bar-voice-status');
    const sClaude = document.getElementById('bar-claude-status');

    try {
      const r = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const data = await r.json();
        if (barApi) barApi.className = 'bar-fill ok';
        if (sApi) { sApi.textContent = 'OK'; sApi.style.color = 'var(--green, #00ff88)'; }

        if (data.capabilities?.voice_realtime) {
          if (barVoice) barVoice.className = 'bar-fill ok';
          if (sVoice) { sVoice.textContent = 'OK'; sVoice.style.color = 'var(--green, #00ff88)'; }
        } else {
          if (barVoice) barVoice.className = 'bar-fill err';
          if (sVoice) { sVoice.textContent = 'OFF'; sVoice.style.color = '#ff4455'; }
        }

        if (data.capabilities?.task_execution) {
          if (barClaude) barClaude.className = 'bar-fill ok';
          if (sClaude) { sClaude.textContent = 'OK'; sClaude.style.color = 'var(--green, #00ff88)'; }
        } else {
          if (barClaude) barClaude.className = 'bar-fill err';
          if (sClaude) { sClaude.textContent = 'OFF'; sClaude.style.color = '#ff4455'; }
        }
        return;
      }
    } catch {}

    // Offline
    if (barApi) barApi.className = 'bar-fill err';
    if (barVoice) barVoice.className = 'bar-fill err';
    if (barClaude) barClaude.className = 'bar-fill err';
    if (sApi) { sApi.textContent = 'ERR'; sApi.style.color = '#ff4455'; }
    if (sVoice) { sVoice.textContent = 'ERR'; sVoice.style.color = '#ff4455'; }
    if (sClaude) { sClaude.textContent = 'ERR'; sClaude.style.color = '#ff4455'; }
  }

  // ── Active Model Display ──
  function updateModel(model, status) {
    const modelEl = document.getElementById('active-model');
    const statusEl = document.getElementById('model-status');
    if (!modelEl) return;

    const modelMap = {
      'claude-opus-4-6': 'Opus 4.6',
      'claude-sonnet-4-6': 'Sonnet 4.6',
      'claude-haiku-4-5': 'Haiku 4.5',
      'opus': 'Opus 4.6',
      'sonnet': 'Sonnet 4.6',
      'haiku': 'Haiku 4.5',
    };

    modelEl.textContent = modelMap[model] || model || 'Sonnet 4.6';
    statusEl.textContent = status || 'standby';
  }

  // Listen to server-log events for model detection
  window.addEventListener('jarvis-log', (e) => {
    const msg = e.detail || '';
    if (msg.includes('opus')) updateModel('opus', 'executing');
    else if (msg.includes('sonnet')) updateModel('sonnet', 'executing');
    else if (msg.includes('haiku')) updateModel('haiku', 'executing');
  });

  // ── Active Agents ──
  const agentsList = document.getElementById('agents-list');
  const activeAgents = new Set();

  function addAgent(name) {
    activeAgents.add(name);
    renderAgents();
  }
  function removeAgent(name) {
    activeAgents.delete(name);
    renderAgents();
  }
  function renderAgents() {
    if (!agentsList) return;
    if (activeAgents.size === 0) {
      agentsList.innerHTML = '<span class="agent-pill idle">nenhum</span>';
      return;
    }
    agentsList.innerHTML = [...activeAgents]
      .map(a => `<span class="agent-pill active">${a}</span>`)
      .join('');
  }

  // Expose for external calls
  window.jarvisHUD = {
    addAgent, removeAgent, updateModel,
    detectAgent: (text) => {
      const agents = ['architect', 'dev', 'qa', 'pm', 'po', 'analyst', 'ux', 'devops', 'conclave'];
      agents.forEach(a => {
        if (text?.toLowerCase().includes(`@${a}`) || text?.toLowerCase().includes(a)) {
          addAgent(a);
          setTimeout(() => removeAgent(a), 30000);
        }
      });
    }
  };

  // ── Metrics (tasks/uptime/voice) ──
  let startTime = Date.now();
  let taskCount = parseInt(localStorage.getItem('jarvis-tasks-today') || '0');
  const lastTaskDate = localStorage.getItem('jarvis-last-task-date');
  const today = new Date().toDateString();
  if (lastTaskDate !== today) {
    taskCount = 0;
    localStorage.setItem('jarvis-tasks-today', '0');
    localStorage.setItem('jarvis-last-task-date', today);
  }

  function updateMetrics() {
    const tasksEl = document.getElementById('metric-tasks');
    const uptimeEl = document.getElementById('metric-uptime');
    const voiceEl = document.getElementById('metric-voice');

    if (tasksEl) tasksEl.textContent = taskCount;

    if (uptimeEl) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      uptimeEl.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }

    if (voiceEl) {
      const micBtn = document.getElementById('mic-btn');
      if (micBtn?.classList.contains('recording')) voiceEl.textContent = 'REC';
      else voiceEl.textContent = 'READY';
    }
  }

  window.jarvisHUD.incrementTasks = () => {
    taskCount++;
    localStorage.setItem('jarvis-tasks-today', String(taskCount));
    updateMetrics();
  };

  // ── System Stats (CPU/GPU temperature + usage) ──
  async function updateSystemStats() {
    try {
      const r = await fetch('/api/system-stats', { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return;
      const s = await r.json();

      // ── CPU ──
      const cpuTempEl = document.getElementById('cpu-temp');
      const cpuUsageEl = document.getElementById('cpu-usage');
      const cpuCoresEl = document.getElementById('cpu-cores');
      const cpuLabel = document.querySelector('#widget-cpu .widget-label');

      // CPU name (ex: "AMD Ryzen 5 7600X")
      if (cpuLabel && s.cpu?.name) {
        const shortName = s.cpu.name.replace(/\(R\)|\(TM\)|CPU|Processor|@.*$/gi, '').trim();
        cpuLabel.textContent = shortName.length > 25 ? shortName.substring(0, 25) : shortName;
      }
      if (cpuTempEl) {
        if (s.cpu?.temp !== null && s.cpu?.temp !== undefined) {
          cpuTempEl.textContent = `${s.cpu.temp}°C`;
          cpuTempEl.style.color = s.cpu.temp > 80 ? '#ff4455' : s.cpu.temp > 65 ? '#ffaa00' : 'var(--cyan)';
        } else {
          cpuTempEl.textContent = '—';
        }
      }
      if (cpuUsageEl) cpuUsageEl.textContent = s.cpu?.usage !== null ? `${s.cpu.usage}%` : '--%';
      if (cpuCoresEl) cpuCoresEl.textContent = `${s.cpu?.cores || '--'} cores`;

      // ── GPU (sem duplicata — só dedicada) ──
      const gpuTempEl = document.getElementById('gpu-temp');
      const gpuStatusEl = document.getElementById('gpu-status');
      const gpuLabel = document.querySelector('#widget-gpu .widget-label');

      if (gpuLabel && s.gpu?.name) {
        gpuLabel.textContent = s.gpu.name;
      }
      if (gpuTempEl) {
        if (s.gpu?.temp !== null && s.gpu?.temp !== undefined) {
          gpuTempEl.textContent = `${s.gpu.temp}°C`;
          gpuTempEl.style.color = s.gpu.temp > 80 ? '#ff4455' : s.gpu.temp > 65 ? '#ffaa00' : 'var(--cyan)';
        } else {
          gpuTempEl.textContent = '—';
        }
      }
      if (gpuStatusEl) {
        let gpuInfo = [];
        if (s.gpu?.vram) gpuInfo.push(s.gpu.vram + 'GB');
        if (s.gpu?.usage !== null && s.gpu?.usage !== undefined) gpuInfo.push(s.gpu.usage + '%');
        gpuStatusEl.textContent = gpuInfo.length ? gpuInfo.join(' · ') : (s.gpu?.name ? 'dedicada' : 'N/A');
      }

      // ── RAM (com tipo DDR e total) ──
      const ramVal = document.getElementById('ram-value');
      const ramDetail = document.getElementById('ram-detail');
      if (ramVal && s.ram) ramVal.textContent = `${s.ram.usage}%`;
      if (ramDetail && s.ram) {
        const ramType = s.ram.type || '';
        ramDetail.textContent = `${s.ram.total}GB ${ramType}`.trim();
      }

      // ── Server status (marcar OK online) ──
      const serverLabel = document.querySelector('#widget-health .widget-label');
      if (serverLabel) serverLabel.textContent = 'SERVER · ONLINE';

      // ── Update circular gauges (CSS --value) ──
      // CPU gauge
      const cpuGauge = document.querySelector('#widget-cpu .gauge-ring, #widget-cpu [style*="--value"]');
      if (cpuGauge && s.cpu?.usage !== null) {
        cpuGauge.style.setProperty('--value', s.cpu.usage);
      }
      // Also try generic gauge elements inside cpu widget
      document.querySelectorAll('#widget-cpu .gauge-ring').forEach(g => {
        if (s.cpu?.usage !== null) g.style.setProperty('--value', s.cpu.usage);
      });
      const cpuGaugeVal = document.querySelector('#widget-cpu .gauge-value, #widget-cpu .gauge-pct');
      if (cpuGaugeVal && s.cpu?.usage !== null) cpuGaugeVal.textContent = s.cpu.usage + '%';

      // GPU gauge
      document.querySelectorAll('#widget-gpu .gauge-ring').forEach(g => {
        // GPU doesn't have usage %, show VRAM as fraction (vram/16 = %)
        g.style.setProperty('--value', s.gpu?.vram ? Math.min(100, Math.round(s.gpu.vram / 16 * 100)) : 0);
      });
      const gpuGaugeVal = document.querySelector('#widget-gpu .gauge-value, #widget-gpu .gauge-pct');
      if (gpuGaugeVal) gpuGaugeVal.textContent = s.gpu?.vram ? s.gpu.vram + 'GB' : '--';

      // RAM gauge
      document.querySelectorAll('#widget-ram .gauge-ring, .widget-ram .gauge-ring').forEach(g => {
        if (s.ram?.usage !== null) g.style.setProperty('--value', s.ram.usage);
      });
      const ramGaugeVal = document.querySelector('#widget-ram .gauge-value, #widget-ram .gauge-pct, .widget-ram .gauge-value');
      if (ramGaugeVal && s.ram?.usage !== null) ramGaugeVal.textContent = s.ram.usage + '%';

      // Also update any gauge with data-metric attribute
      document.querySelectorAll('[data-metric="cpu"]').forEach(g => {
        if (s.cpu?.usage !== null) g.style.setProperty('--value', s.cpu.usage);
      });
      document.querySelectorAll('[data-metric="ram"]').forEach(g => {
        if (s.ram?.usage !== null) g.style.setProperty('--value', s.ram.usage);
      });

      // ── System uptime ──
      const uptimeEl = document.querySelector('.sys-uptime-value, #sys-uptime');
      if (uptimeEl) {
        const now = new Date();
        uptimeEl.textContent = now.toLocaleTimeString('pt-BR');
      }

    } catch {}
  }

  // ── Init ──
  loadWeather();
  updateHealth();
  updateMetrics();
  updateSystemStats();

  // Periodic updates
  setInterval(loadWeather, 15 * 60 * 1000);     // 15 min
  setInterval(updateHealth, 10 * 1000);         // 10 sec
  setInterval(updateMetrics, 1000);             // 1 sec
  setInterval(updateSystemStats, 5 * 1000);     // 5 sec
})();

// ═══════════════════════════════════════════════
// PREFLIGHT AUTO-SKIP (se server offline)
// ═══════════════════════════════════════════════
(function() {
  const overlay = document.getElementById('preflight-overlay');
  if (!overlay) return;

  // Auto-fechar preflight depois de 5s independente do resultado
  setTimeout(() => {
    if (overlay.style.display !== 'none') {
      console.log('[JARVIS] Preflight timeout — fechando modal');
      overlay.style.display = 'none';
    }
  }, 5000);

  // Também fecha se clicar em qualquer botão do preflight
  const okBtn = document.getElementById('preflight-ok');
  const retryBtn = document.getElementById('preflight-retry');
  if (okBtn) okBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
  if (retryBtn) retryBtn.addEventListener('click', () => { location.reload(); });
})();


// ═══════════════════════════════════════════════


// ═══════════════════════════════════════════════
// HUD FUNCTIONAL — Entity activation, Obsidian, Ingest, Brain Viewer
// ═══════════════════════════════════════════════

(function() {
  // ── Entity Activation (modelos/agentes/conclave) ──
  function setEntityActive(name, active) {
    const row = document.querySelector('[data-entity="' + name + '"]');
    if (!row) return;
    if (active) { row.classList.add('active'); row.classList.remove('idle'); }
    else { row.classList.remove('active'); row.classList.add('idle'); }
  }
  function pulseEntity(name, ms) {
    setEntityActive(name, true);
    setTimeout(function() { setEntityActive(name, false); }, ms || 15000);
  }

  // Detection rules
  var rules = [
    { p: /opus/i, e: 'opus' }, { p: /sonnet/i, e: 'sonnet' }, { p: /haiku/i, e: 'haiku' },
    { p: /realtime|gpt-4o-rt/i, e: 'gpt-realtime' }, { p: /gpt-4o-mini/i, e: 'gpt-mini' },
    { p: /@architect|aria/i, e: 'architect' }, { p: /@dev\b|dex/i, e: 'dev' },
    { p: /@qa|quinn/i, e: 'qa' }, { p: /@pm|morgan/i, e: 'pm' },
    { p: /@po\b|pax/i, e: 'po' }, { p: /@analyst|atlas/i, e: 'analyst' },
    { p: /@ux|uma/i, e: 'ux' }, { p: /@devops|gage/i, e: 'devops' },
    { p: /@sm\b|river/i, e: 'sm' }, { p: /data.engineer|dara/i, e: 'data-engineer' },
    { p: /aios.master|orion/i, e: 'aios-master' }, { p: /squad.creator|craft/i, e: 'squad-creator' },
    { p: /conclave.critico|critico/i, e: 'conclave-critico' },
    { p: /conclave.advogado|advogado/i, e: 'conclave-advogado' },
    { p: /conclave.sintetizador|sintetizador/i, e: 'conclave-sintetizador' },
  ];
  window.jarvisHUD = window.jarvisHUD || {};
  window.jarvisHUD.setEntityActive = setEntityActive;
  window.jarvisHUD.pulseEntity = pulseEntity;
  window.jarvisHUD.analyzeText = function(text) {
    if (!text) return;
    rules.forEach(function(r) { if (r.p.test(text)) pulseEntity(r.e, 20000); });
  };

  // ── Obsidian Stats ──
  async function loadObsidianStats() {
    var notesEl = document.getElementById('obsidian-notes');
    var statusEl = document.getElementById('obsidian-status');
    if (!notesEl) return;
    try {
      var r = await fetch('/api/obsidian/stats');
      if (!r.ok) throw new Error('offline');
      var data = await r.json();
      if (data.connected) {
        notesEl.textContent = data.notes + ' notas';
        statusEl.textContent = 'conectado';
        // Update detail cards
        var foldersEl = document.getElementById('obs-folders');
        var linksEl = document.getElementById('obs-links');
        if (foldersEl) foldersEl.textContent = data.folders;
        if (linksEl) linksEl.textContent = data.links;
      } else {
        notesEl.textContent = 'N/A';
        statusEl.textContent = 'vault nao instalado';
      }
    } catch(e) {
      notesEl.textContent = 'N/A';
      statusEl.textContent = 'offline';
    }
  }
  loadObsidianStats();
  setInterval(loadObsidianStats, 60000);

  // ── Quick Access Buttons ──
  document.querySelectorAll('.hud-qbtn[data-quick-tab]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tabBtn = document.querySelector('.tab-btn[data-tab="' + btn.dataset.quickTab + '"]');
      if (tabBtn) tabBtn.click();
    });
  });

  // ── Desktop Pet Launcher (toggle) ──
  var petBtn = document.getElementById('btn-launch-pet');
  var petActive = false;
  if (petBtn) {
    petBtn.addEventListener('click', async function() {
      petBtn.style.opacity = '0.5';
      try {
        var r = await fetch('/api/pet/launch', { method: 'POST' });
        var data = await r.json();
        if (data.ok) {
          petActive = data.action === 'opened';
          petBtn.querySelector('span').textContent = petActive ? '✅ ON' : 'Pet';
          petBtn.style.borderColor = petActive ? 'rgba(0,255,100,0.5)' : 'rgba(255,215,0,0.3)';
        }
      } catch(e) {
        petBtn.querySelector('span').textContent = '❌ Erro';
        setTimeout(function() { petBtn.querySelector('span').textContent = 'Pet'; }, 2000);
      }
      petBtn.style.opacity = '1';
    });
  }

  // ── Ingest Modal ──
  var ingestModal = document.getElementById('ingest-modal');
  var btnIngest = document.getElementById('btn-ingest');
  var ingestClose = document.getElementById('ingest-close');
  var ingestCancel = document.getElementById('ingest-cancel');
  var ingestSubmit = document.getElementById('ingest-submit');
  var ingestStatus = document.getElementById('ingest-status');

  if (btnIngest) {
    btnIngest.addEventListener('click', function() {
      if (ingestModal) ingestModal.style.display = 'flex';
    });
  }
  if (ingestClose) ingestClose.addEventListener('click', function() { ingestModal.style.display = 'none'; });
  if (ingestCancel) ingestCancel.addEventListener('click', function() { ingestModal.style.display = 'none'; });

  // Ingest tabs
  document.querySelectorAll('.ingest-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.ingest-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.ingest-panel').forEach(function(p) { p.classList.remove('active'); });
      tab.classList.add('active');
      var panel = document.getElementById('ingest-' + tab.dataset.ingest);
      if (panel) panel.classList.add('active');
    });
  });

  // File dropzone
  var dropzone = document.getElementById('ingest-dropzone');
  var fileInput = document.getElementById('ingest-file-input');
  var fileNameEl = document.getElementById('ingest-file-name');
  var selectedFile = null;

  if (dropzone) {
    dropzone.addEventListener('click', function() { fileInput.click(); });
    dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('dragover'); });
    dropzone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        selectedFile = e.dataTransfer.files[0];
        fileNameEl.textContent = '\u2705 ' + selectedFile.name + ' (' + Math.round(selectedFile.size/1024) + 'KB)';
      }
    });
    fileInput.addEventListener('change', function() {
      if (fileInput.files.length) {
        selectedFile = fileInput.files[0];
        fileNameEl.textContent = '\u2705 ' + selectedFile.name + ' (' + Math.round(selectedFile.size/1024) + 'KB)';
      }
    });
  }

  // Submit ingest
  if (ingestSubmit) {
    ingestSubmit.addEventListener('click', async function() {
      var activeTab = document.querySelector('.ingest-tab.active');
      var tabType = activeTab ? activeTab.dataset.ingest : 'text';
      ingestStatus.textContent = '\u23F3 Processando...';
      ingestSubmit.disabled = true;

      try {
        var body = {};

        if (tabType === 'text') {
          var text = document.getElementById('ingest-text-input').value.trim();
          var cat = document.getElementById('ingest-text-category').value;
          if (!text) { ingestStatus.textContent = '\u274C Digite algo primeiro'; ingestSubmit.disabled = false; return; }
          body = { type: 'text', text: text, category: cat };
        }

        if (tabType === 'file') {
          if (!selectedFile) { ingestStatus.textContent = '\u274C Selecione um arquivo'; ingestSubmit.disabled = false; return; }
          var reader = new FileReader();
          var content = await new Promise(function(resolve) {
            reader.onload = function() { resolve(reader.result); };
            reader.readAsText(selectedFile);
          });
          body = { type: 'file', fileName: selectedFile.name, fileContent: content };
        }

        if (tabType === 'session') {
          body = { type: 'session' };
        }

        var r = await fetch('/api/obsidian/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        var data = await r.json();

        if (data.ok) {
          ingestStatus.textContent = '\u2705 Salvo no Obsidian: ' + (data.title || data.count + ' notas');
          loadObsidianStats();
          setTimeout(function() { ingestModal.style.display = 'none'; ingestStatus.textContent = ''; }, 2000);
        } else {
          ingestStatus.textContent = '\u274C ' + (data.error || 'Erro desconhecido');
        }
      } catch(err) {
        ingestStatus.textContent = '\u274C ' + err.message;
      }
      ingestSubmit.disabled = false;
    });
  }

  // ── Brain Viewer Modal ──
  var brainModal = document.getElementById('brain-modal');
  var btnBrain = document.getElementById('btn-brain');
  var brainClose = document.getElementById('brain-close');
  var brainMaximize = document.getElementById('brain-maximize');
  var brainTree = document.getElementById('brain-tree');
  var brainPreview = document.getElementById('brain-preview');
  var brainSearch = document.getElementById('brain-search');

  if (btnBrain) {
    btnBrain.addEventListener('click', function() {
      if (brainModal) {
        brainModal.style.display = 'flex';
        loadBrainTree();
      }
    });
  }
  if (brainClose) brainClose.addEventListener('click', function() { brainModal.style.display = 'none'; });
  if (brainMaximize) {
    brainMaximize.addEventListener('click', function() {
      var card = brainModal.querySelector('.modal-brain');
      card.classList.toggle('maximized');
      brainMaximize.textContent = card.classList.contains('maximized') ? '\u2750' : '\u2B1C';
    });
  }

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });

  // Load brain tree
  async function loadBrainTree() {
    if (!brainTree) return;
    brainTree.innerHTML = '<div class="brain-loading">Carregando vault...</div>';
    try {
      var r = await fetch('/api/obsidian/tree');
      var data = await r.json();
      if (!data.tree || !data.tree.length) {
        brainTree.innerHTML = '<div class="brain-loading">Vault vazio ou nao encontrado</div>';
        return;
      }
      brainTree.innerHTML = '';
      renderTree(data.tree, brainTree);
    } catch(err) {
      brainTree.innerHTML = '<div class="brain-loading">Erro: ' + err.message + '</div>';
    }
  }

  function renderTree(items, parent) {
    items.forEach(function(item) {
      if (item.type === 'folder') {
        var folder = document.createElement('div');
        folder.className = 'brain-folder';
        var header = document.createElement('div');
        header.className = 'brain-folder-header';
        header.innerHTML = '<span class="folder-icon">\uD83D\uDCC1</span><span class="folder-name">' + item.name + '</span><span class="folder-count">' + (item.children ? item.children.length : 0) + '</span>';
        var items_div = document.createElement('div');
        items_div.className = 'brain-folder-items';
        items_div.style.display = 'none';
        header.addEventListener('click', function() {
          items_div.style.display = items_div.style.display === 'none' ? 'block' : 'none';
          header.querySelector('.folder-icon').textContent = items_div.style.display === 'none' ? '\uD83D\uDCC1' : '\uD83D\uDCC2';
        });
        folder.appendChild(header);
        folder.appendChild(items_div);
        if (item.children) renderTree(item.children, items_div);
        parent.appendChild(folder);
      } else {
        var note = document.createElement('div');
        note.className = 'brain-note';
        note.innerHTML = '<span class="note-icon">\uD83D\uDCC4</span> ' + item.name;
        note.addEventListener('click', function() {
          document.querySelectorAll('.brain-note').forEach(function(n) { n.classList.remove('active'); });
          note.classList.add('active');
          loadNote(item.path);
        });
        parent.appendChild(note);
      }
    });
  }

  // Load note content
  async function loadNote(notePath) {
    if (!brainPreview) return;
    brainPreview.innerHTML = '<div class="brain-loading">Carregando...</div>';
    try {
      var r = await fetch('/api/obsidian/note?path=' + encodeURIComponent(notePath));
      var data = await r.json();
      if (data.content) {
        // Render markdown
        var html = marked.parse(data.content);
        // Convert [[links]] to clickable elements
        html = html.replace(/\[\[([^\]|#]+)\]\]/g, '<span class="brain-link" data-link="$1">$1</span>');
        brainPreview.innerHTML = html;
        // Make [[links]] clickable
        brainPreview.querySelectorAll('.brain-link').forEach(function(link) {
          link.addEventListener('click', function() {
            var target = link.dataset.link;
            // Find note in tree by name
            var noteEl = null;
            document.querySelectorAll('.brain-note').forEach(function(n) {
              if (n.textContent.trim().includes(target)) noteEl = n;
            });
            if (noteEl) noteEl.click();
          });
        });
      } else {
        brainPreview.innerHTML = '<div class="brain-empty"><p>Nota nao encontrada</p></div>';
      }
    } catch(err) {
      brainPreview.innerHTML = '<div class="brain-empty"><p>Erro: ' + err.message + '</p></div>';
    }
  }

  // Brain search
  if (brainSearch) {
    brainSearch.addEventListener('input', function() {
      var q = brainSearch.value.toLowerCase();
      document.querySelectorAll('.brain-note').forEach(function(n) {
        n.style.display = n.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
      // Show all parent folders
      document.querySelectorAll('.brain-folder-items').forEach(function(fi) {
        var hasVisible = fi.querySelector('.brain-note:not([style*="display: none"])');
        fi.style.display = q && hasVisible ? 'block' : (q ? 'none' : '');
      });
    });
  }

  // ── RAM metric ──
  // RAM atualizado via updateSystemStats() — removida funcao duplicada
})();


// ═══ CLAUDE ACTIVITY TRACKER ═══
(function() {
  var actEl = document.getElementById("metric-activity");
  if (!actEl) return;

  window.jarvisHUD = window.jarvisHUD || {};
  window.jarvisHUD.setActivity = function(text, isActive) {
    actEl.textContent = text || "idle";
    if (isActive) actEl.classList.add("active");
    else actEl.classList.remove("active");
  };

  // Listen for terminal output to detect Claude activity
  var origAddTerminal = window.addTerminalLine;
  if (typeof origAddTerminal === "function") {
    window.addTerminalLine = function(msg, cls) {
      origAddTerminal(msg, cls);
      if (!msg) return;
      var m = String(msg).toLowerCase();
      if (m.includes("[build-start]") || m.includes("creating") || m.includes("generating")) {
        window.jarvisHUD.setActivity("criando...", true);
      } else if (m.includes("[file]")) {
        var fname = msg.match(/\[file\]\s*(.+?)\s*\|/);
        window.jarvisHUD.setActivity(fname ? fname[1] : "arquivo criado", true);
      } else if (m.includes("[system] done") || m.includes("concluido") || m.includes("pronto")) {
        window.jarvisHUD.setActivity("concluido", false);
        setTimeout(function() { window.jarvisHUD.setActivity("idle", false); }, 5000);
      }
    };
  }
})();


// === DATE + TIME WIDGET ===
(function() {
  var days = ['Domingo', 'Segunda-feira', 'Terca-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sabado'];
  function updateDateTime() {
    var now = new Date();
    var dayEl = document.getElementById('date-day');
    var timeEl = document.getElementById('date-time');
    var fullEl = document.getElementById('date-full');
    if (dayEl) dayEl.textContent = days[now.getDay()].toUpperCase();
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    if (fullEl) {
      var d = String(now.getDate()).padStart(2,'0');
      var m = String(now.getMonth()+1).padStart(2,'0');
      var y = String(now.getFullYear()).slice(-2);
      fullEl.textContent = d + '/' + m + '/' + y;
    }
  }
  updateDateTime();
  setInterval(updateDateTime, 1000);
})();


