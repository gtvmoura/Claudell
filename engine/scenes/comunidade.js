// Cena: "A Comunidade" — assentamento pós-apocalíptico low-poly, do pôr do sol à noite.
// Unidades em metros. Chão em y = 0. Portão ao sul (+Z), fogueira no centro (0, 0).
// Moradores: script.json -> cidadaos: [{ id, nome, funcao, acao, pos: [x, z], yaw, y?, visual?, seed?, vaga? }]
// Eventos usados: luzes (varal acende), noite (todos vão para a fogueira dançar — extras)
import { makePeopleKit, ANIM, SKINS, HAIR_COLORS, CLOTHES, PANTS, HAIR_STYLES, HATS, TOPS } from '../lib/people.js';

export async function build({ THREE, renderer, scene, camera, script, events, helpers }) {
  const { rng, clamp, lerp, smooth } = helpers;
  const R = rng(script.seed ?? 77);
  const kit = makePeopleKit(THREE);
  const { add, box, cyl, ico, M } = kit;
  const DUR = script.duration;
  const DEG = Math.PI / 180;
  // ESTÁGIO DO ACAMPAMENTO: só existe de verdade o que está em script.construido.
  // O resto vai para "futuro" (planta holográfica que pode aparecer no vídeo).
  const BUILT = new Set(script.construido || []);
  const has = k => BUILT.has(k);
  const futuro = new THREE.Group(); scene.add(futuro);
  const at = k => (has(k) ? scene : futuro);

  // =====================================================================
  // CÉU + LUZ
  // =====================================================================
  const sunDir = new THREE.Vector3();
  const skyU = { sunDir: { value: sunDir }, dusk: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 40, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: skyU,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir; uniform float dusk;
      void main(){ float h = vDir.y;
        vec3 zen = mix(vec3(0.22,0.3,0.45), vec3(0.03,0.04,0.12), dusk);
        vec3 mid = mix(vec3(0.66,0.56,0.5), vec3(0.22,0.13,0.26), dusk);
        vec3 hor = mix(vec3(0.95,0.6,0.34), vec3(0.85,0.32,0.16), dusk);
        vec3 col = h > 0.0 ? mix(mid, zen, smoothstep(0.0, 0.5, h)) : mid * 0.6;
        col = mix(col, hor, (1.0 - smoothstep(0.0, 0.18, abs(h))) * 0.9);
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += vec3(1.0,0.6,0.25) * pow(s, 10.0) * 0.5 + vec3(1.0,0.85,0.55) * pow(s, 700.0) * 7.0 * (1.0 - dusk * 0.6);
        vec3 q = floor(vDir * 380.0); float st = fract(sin(dot(q, vec3(12.9898,78.233,37.719))) * 43758.5453);
        col += vec3(step(0.998, st)) * smoothstep(0.55, 1.0, dusk) * smoothstep(0.1, 0.4, h);
        gl_FragColor = vec4(col, 1.0); }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  scene.fog = new THREE.Fog(0xb88a62, 55, 330);

  const sun = new THREE.DirectionalLight(0xffc890, 3.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xa9c2ff, 0x5a4630, 1.2); scene.add(hemi);
  const fireLight = new THREE.PointLight(0xff8a3a, 0, 28, 1.6); fireLight.position.set(0, 1.4, 0); scene.add(fireLight);
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0); moon.position.set(-60, 90, -40); scene.add(moon); // luar
  const vagaLight = new THREE.PointLight(0xffb060, 0, 26, 1.4); vagaLight.position.set(0, 3.6, -26.5); scene.add(vagaLight);

  // =====================================================================
  // CHÃO (grama, terra batida dentro do muro, trilhas)
  // =====================================================================
  const WALL_R = 44;
  const PATHS_ALL = [[[0, 70], [0, 0]], [[0, 20], [7, 20]], [[0, 18], [-8, 17]], [[0, 0], [-10, -3]], [[0, 0], [9, -5]], [[0, 0], [-8.5, -11]], [[0, 0], [0, -24]], [[0, 0], [-3, -8]], [[0, 0], [-15, 5]]];
  const PATHS = (script.construido || []).length ? PATHS_ALL : [[[0, 70], [0, 6]]];
  const segDist = (x, z, [a, b]) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const k = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)); return Math.hypot(x - a[0] - dx * k, z - a[1] - dz * k); };
  const pathD = (x, z) => Math.min(...PATHS.map(p => segDist(x, z, p)), Math.abs(Math.hypot(x, z) - 4.5) + 0.8);
  const groundY = (x, z) => { const r = Math.hypot(x, z); return r < WALL_R + 6 ? 0 : (Math.sin(x * 0.03) * Math.cos(z * 0.025) * 4 + Math.sin(x * 0.011 + 2) * 6) * smooth(WALL_R + 6, WALL_R + 60, r); };
  {
    const g = new THREE.PlaneGeometry(900, 900, 220, 220); g.rotateX(-Math.PI / 2);
    const pa = g.attributes.position, cols = [];
    const c = new THREE.Color(), grass = new THREE.Color('#5f7436'), grass2 = new THREE.Color('#857f45'), dry = new THREE.Color('#9a8458'), dirt = new THREE.Color('#8a6b4a'), path = new THREE.Color('#b08f68');
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i), r = Math.hypot(x, z);
      pa.setY(i, groundY(x, z));
      const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.13);
      c.copy(grass).lerp(grass2, n).lerp(dry, 0.25 * Math.max(0, Math.sin(x * 0.05 + z * 0.04)));
      if (has('muro') ? r < WALL_R : r < 9) c.lerp(dirt, (has('muro') ? 0.45 : 0.6 * smooth(9, 5, r)) * (1 - n * 0.6));
      if (!has('muro')) c.lerp(dry, 0.35 * smooth(20, 60, r));
      c.lerp(path, smooth(2.6, 1.0, pathD(x, z)));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); m.receiveShadow = true; scene.add(m);
  }
  // tufos de grama e flores
  function scatter(n, geo, colors, place, sMin, sMax, shadow = false) {
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), n);
    const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    let k = 0, guard = 0;
    while (k < n && guard++ < n * 30) {
      const pt = place(); if (!pt) continue;
      const s = lerp(sMin, sMax, R());
      p.set(pt[0], groundY(pt[0], pt[1]) + (pt[2] || 0), pt[1]); sv.set(s, s * (0.8 + R() * 0.6), s); q.setFromAxisAngle(up, R() * 6.28);
      Mx.compose(p, q, sv); im.setMatrixAt(k, Mx); im.setColorAt(k, c.set(colors[Math.floor(R() * colors.length)])); k++;
    }
    im.count = k; im.castShadow = shadow; im.receiveShadow = true; scene.add(im); return im;
  }
  const grassGeo = new THREE.ConeGeometry(0.12, 0.45, 4); grassGeo.translate(0, 0.2, 0);
  scatter(9000, grassGeo, ['#6b7a35', '#8a8040', '#57682d', '#a08c52'], () => { const r = 3 + R() * 150, a = R() * 6.28, x = Math.cos(a) * r, z = Math.sin(a) * r; return pathD(x, z) > 2.2 && r > 6 && (r > WALL_R + 1 || R() < (has('muro') ? 0.35 : 0.8)) ? [x, z] : null; }, 0.35, 0.75);
  scatter(900, new THREE.IcosahedronGeometry(0.07, 0), ['#f1c40f', '#e74c3c', '#ffffff', '#9b59b6', '#ff8fb1'], () => { const r = 6 + R() * 90, a = R() * 6.28, x = Math.cos(a) * r, z = Math.sin(a) * r; return pathD(x, z) > 2.5 ? [x, z, 0.35] : null; }, 0.8, 1.3);

  // =====================================================================
  // RUÍNAS DA CIDADE ANTIGA (fora do muro) + ÁRVORES + CARROS
  // =====================================================================
  const winTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g = cv.getContext('2d'); const r2 = rng(3);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 128; y += 16) for (let x = 6; x < 64; x += 16) { g.fillStyle = r2() < 0.65 ? '#111111' : r2() < 0.5 ? '#2a2f33' : '#4a5258'; g.fillRect(x, y, 9, 10); }
    g.fillStyle = 'rgba(20,16,12,0.35)'; for (let i = 0; i < 6; i++) g.fillRect(r2() * 64, r2() * 128, 10 + r2() * 20, 20 + r2() * 40); // fuligem
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
  })();
  const ruinCols = ['#7a7166', '#6a6258', '#857a6c', '#5d5650', '#8f8473', '#6f6357'];
  for (let i = 0; i < 60; i++) {
    const a = R() * Math.PI * 2, r = 62 + R() * 190;
    if (Math.abs(Math.atan2(Math.cos(a), Math.sin(a))) < 0.1 && r < 140) continue; // deixa a estrada livre
    const x = Math.cos(a) * r, z = Math.sin(a) * r, w = 10 + R() * 16, d = 10 + R() * 16, h = 10 + R() * 38;
    const g = new THREE.Group(); g.position.set(x, groundY(x, z) - 1, z); g.rotation.y = R() * 6.28;
    const t = winTex.clone(); t.needsUpdate = true; t.repeat.set(w / 4, h / 8);
    const mat = new THREE.MeshLambertMaterial({ color: ruinCols[i % ruinCols.length], map: t, flatShading: true });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.y = h / 2; b.castShadow = false; g.add(b);
    for (let k = 0; k < 4; k++) { const cw = w * (0.2 + R() * 0.4), ch = 2 + R() * 6; const c = new THREE.Mesh(box(1, 1, 1), M(ruinCols[(i + 1) % ruinCols.length])); c.scale.set(cw, ch, d * (0.3 + R() * 0.6)); c.position.set((R() - 0.5) * (w - cw), h + ch / 2 - 1, (R() - 0.5) * d * 0.4); c.rotation.z = (R() - 0.5) * 0.4; g.add(c); }
    for (let k = 0; k < 3; k++) { const v = new THREE.Mesh(box(1, 1, 1), M(['#3f6b2a', '#4f7d32', '#365d24'][k])); v.scale.set(w * (0.2 + R() * 0.4), h * (0.15 + R() * 0.45), 0.6); v.position.set((R() - 0.5) * w * 0.6, h * 0.2 * R() + v.scale.y / 2, d / 2 + 0.2); g.add(v); } // trepadeiras
    for (let k = 0; k < 3; k++) { const hw = 2 + R() * 4, hh = 2 + R() * 5; add(g, box(hw, hh, 0.4), '#0d0b0a', (R() - 0.5) * (w - hw), h * (0.3 + R() * 0.6), d / 2 + 0.05, { shadow: false }); } // rombos na fachada
    if (R() < 0.45) { const cw = w * (0.4 + R() * 0.4); add(g, box(cw, 6 + R() * 6, d * 0.9), ruinCols[(i + 2) % ruinCols.length], (R() - 0.5) * 2, -1, d * 0.6, { rot: [0.5 + R() * 0.4, 0, (R() - 0.5) * 0.3] }); } // pedaço desabado
    if (R() < 0.4) g.rotation.z = (R() - 0.5) * 0.16; // prédio inclinado
    scene.add(g);
  }
  // árvores (tronco + copa low-poly)
  {
    const N = 380, trunk = new THREE.InstancedMesh(cyl(0.18, 0.28, 1, 5, 0.5), M('#6b4a2e'), N), crown = new THREE.InstancedMesh(ico(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), N);
    const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    let k = 0, guard = 0;
    while (k < N && guard++ < 9000) {
      const r = 47 + R() * 160, a = R() * 6.28, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 9 && z > 40) continue;
      const h = 3 + R() * 5, y = groundY(x, z);
      p.set(x, y, z); q.setFromAxisAngle(up, R() * 6.28); s.set(1, h, 1); Mx.compose(p, q, s); trunk.setMatrixAt(k, Mx);
      const cs = 1.8 + R() * 2.4; p.set(x, y + h + cs * 0.5, z); s.set(cs, cs * (0.9 + R() * 0.5), cs); Mx.compose(p, q, s); crown.setMatrixAt(k, Mx);
      const dead = R() < 0.35; if (dead) { s.set(0, 0, 0); Mx.compose(p, q, s); crown.setMatrixAt(k, Mx); }
      crown.setColorAt(k, c.set(['#56702f', '#677d36', '#4a5f28', '#7a7f3c', '#8a7a3a'][Math.floor(R() * 5)])); k++;
    }
    trunk.count = crown.count = k; trunk.castShadow = crown.castShadow = true; scene.add(trunk, crown);
  }
  // estrada antiga com carros enferrujados
  {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 160), M('#5a5650')); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.03, 125); road.receiveShadow = true; scene.add(road);
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group(); const col = ['#8a4b2a', '#6d6a5e', '#7a3326', '#4a5a6a', '#9a7a3a'][i % 5];
      add(g, box(1.9, 0.8, 4.3), col, 0, 0.65, 0); add(g, box(1.7, 0.6, 2.2), col, 0, 1.3, -0.3); add(g, box(1.72, 0.45, 2.0), '#2a3a44', 0, 1.33, -0.3, { scale: [1.01, 1, 0.98] });
      for (const [wx, wz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) add(g, cyl(0.35, 0.35, 0.25, 8), '#1a1a1a', wx, 0.3, wz, { rot: [0, 0, Math.PI / 2] });
      g.position.set((i % 2 ? 2.4 : -2.6) + (R() - 0.5), 0, 58 + i * 16 + R() * 6); g.rotation.set(0, (R() - 0.5) * 0.8, (R() - 0.5) * 0.15); scene.add(g);
    }
  }

  // =====================================================================
  // MURO DE SUCATA + PORTÃO + TORRE DE VIGIA
  // =====================================================================
  ((scene) => {
    const sheetCols = ['#8d4b2b', '#5f7d8c', '#a3623a', '#6e8a5a', '#b5a27a', '#7b3f2c', '#4f6f7f', '#9c8a6a'];
    const n = 120;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = Math.sin(a) * WALL_R, z = Math.cos(a) * WALL_R;
      if (Math.abs(x) < 3.6 && z > 0) continue; // portão
      const h = 3.2 + R() * 1.2;
      const s = new THREE.Mesh(box(2.4, h, 0.12), M(sheetCols[Math.floor(R() * sheetCols.length)]));
      s.position.set(x, h / 2, z); s.rotation.set((R() - 0.5) * 0.06, a, (R() - 0.5) * 0.05); s.castShadow = true; s.receiveShadow = true; scene.add(s);
      if (i % 3 === 0) { const p = new THREE.Mesh(cyl(0.1, 0.12, h + 0.6, 5, (h + 0.6) / 2), M('#5b3e25')); p.position.set(x * 0.995, 0, z * 0.995); p.castShadow = true; scene.add(p); }
    }
    // portão aberto
    for (const sx of [-1, 1]) { const d = new THREE.Mesh(box(3.2, 3.6, 0.15), M('#6a4a2e')); d.geometry = box(3.2, 3.6, 0.15); d.position.set(sx * 4.6, 1.8, WALL_R + 1.4); d.rotation.y = sx * 1.25; d.castShadow = true; scene.add(d); }
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(cyl(0.22, 0.25, 5, 6, 2.5), M('#4a3220')); p.position.set(sx * 3.7, 0, WALL_R); p.castShadow = true; scene.add(p); }
    const sign = (() => { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#f4e7c5'; g.font = '900 64px Montserrat'; g.textAlign = 'center'; g.fillText('A COMUNIDADE', 256, 86); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const sg = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.3, 0.15), [M('#6b4a2e'), M('#6b4a2e'), M('#6b4a2e'), M('#6b4a2e'), new THREE.MeshLambertMaterial({ map: sign }), M('#6b4a2e')]);
    sg.position.set(0, 4.6, WALL_R + 0.1); sg.castShadow = true; scene.add(sg);
    // torre de vigia
    const T = new THREE.Group(); T.position.set(6.5, 0, WALL_R - 1.5);
    for (const [px, pz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) add(T, cyl(0.12, 0.14, 5.6, 5, 2.8), '#5b3e25', px, 0, pz);
    add(T, box(3.2, 0.2, 3.2), '#7a5a3a', 0, 5.6, 0); add(T, box(3.2, 0.5, 0.1), '#7a5a3a', 0, 5.95, 1.55); add(T, box(0.1, 0.5, 3.2), '#7a5a3a', 1.55, 5.95, 0); add(T, box(0.1, 0.5, 3.2), '#7a5a3a', -1.55, 5.95, 0);
    for (const [px, pz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) add(T, cyl(0.07, 0.07, 3.2, 4, 1.6), '#5b3e25', px, 5.7, pz);
    add(T, cyl(0.1, 2.5, 1.0, 4, 0.5), '#8a3b2a', 0, 8.9, 0, { rot: [0, Math.PI / 4, 0] });
    scene.add(T);
  })(at('muro'));

  // =====================================================================
  // CONSTRUÇÕES
  // =====================================================================
  const container = (x, z, ry, col, opts = {}, scene = at(opts.vaga ? 'casas_vagas' : 'casas')) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const ribs = (() => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8; const c = cv.getContext('2d'); for (let i = 0; i < 64; i += 8) { c.fillStyle = '#ffffff'; c.fillRect(i, 0, 5, 8); c.fillStyle = '#c8c8c8'; c.fillRect(i + 5, 0, 3, 8); } const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const mat = new THREE.MeshLambertMaterial({ color: col, map: ribs, flatShading: true });
    const b = new THREE.Mesh(box(6, 2.6, 2.5), mat); b.position.y = 1.3; b.castShadow = b.receiveShadow = true; g.add(b);
    add(g, box(1.0, 2.0, 0.08), '#3a2a1e', 1.2, 1.0, 1.27);
    add(g, box(1.0, 0.7, 0.06), opts.lit ? '#ffcf7a' : '#2a3540', -1.3, 1.5, 1.27, { shadow: false });
    if (opts.solar) { const p = add(g, box(2.6, 0.06, 1.7), '#1d2f5a', 0.6, 2.85, 0, { rot: [0, 0, 0.25] }); p.material = new THREE.MeshLambertMaterial({ color: '#22396b', emissive: '#0b1630', flatShading: true }); }
    if (opts.vaga) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const c = cv.getContext('2d');
      c.fillStyle = '#e9d9b0'; c.fillRect(0, 0, 256, 128); c.strokeStyle = '#6b4a2e'; c.lineWidth = 10; c.strokeRect(5, 5, 246, 118);
      c.fillStyle = '#b3261e'; c.font = '900 52px Montserrat'; c.textAlign = 'center'; c.fillText('VAGA', 128, 66); c.fillStyle = '#2b2b2b'; c.font = '800 26px Montserrat'; c.fillText('casa livre', 128, 104);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshLambertMaterial({ map: t })); s.position.set(1.2, 2.3, 1.3); g.add(s);
    }
    scene.add(g); return g;
  };
  const houses = [
    [-26, 22, 0.9, '#c0392b', { solar: true, lit: true }], [-30, 10, 1.4, '#2980b9', { lit: true }], [26, 26, -0.8, '#27ae60', { solar: true, lit: true }], [33, 4, -1.5, '#d35400', { lit: true }],
    [16, 31, -0.4, '#8e44ad', { solar: true, lit: true }], [-14, 33, 0.35, '#16a085', { lit: true }], [-33, -6, 1.6, '#f39c12', { solar: true, lit: true }],
    // casas vagas (fundo, ao norte)
    [-12, -31, 0, '#7f8c8d', { vaga: true }], [-4, -33, 0, '#95a5a6', { vaga: true }], [4, -33, 0, '#8e9aa0', { vaga: true }], [12, -31, 0, '#7f8c8d', { vaga: true }], [20, -27, -0.4, '#95a5a6', { vaga: true }], [-20, -27, 0.4, '#8e9aa0', { vaga: true }],
  ];
  for (const [x, z, ry, col, o] of houses) container(x, z, ry, col, o);
  const lamps = [];
  for (const x of [-8, 8]) {
    const S = at('casas_vagas');
    add(S, cyl(0.07, 0.09, 3.4, 5, 1.7), '#3a2a1e', x, 0, -26.5);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0x332211 })); l.position.set(x, 3.5, -26.5); S.add(l); lamps.push(l);
  }

  // fogueira + troncos-banco + varal de lâmpadas
  {
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; add(scene, ico(0.28, 0), '#6d6a64', Math.cos(a) * 1.05, 0.12, Math.sin(a) * 1.05); }
    for (let i = 0; i < 4; i++) add(scene, cyl(0.1, 0.1, 1.2, 5), '#4a2e1a', 0, 0.2, 0, { rot: [Math.PI / 2, i * 0.8, 0.3] });
    for (const [a, l] of (has('praca') ? [[0.3, 3.2], [1.9, 3.0], [3.4, 3.4], [4.9, 3.1]] : [[0.3, 3.0], [3.6, 2.9]])) { const lg = add(scene, cyl(0.24, 0.24, 2.6, 7), '#6b4a2e', Math.cos(a) * l, 0.24, Math.sin(a) * l, { rot: [0, -a, Math.PI / 2] }); lg.rotation.order = 'YXZ'; lg.rotation.set(0, -a + Math.PI / 2, Math.PI / 2); }
  }
  const bulbs = [];
  ((scene) => {
    const poles = [[-6, 6], [6, 6], [6, -6], [-6, -6]];
    for (const [x, z] of poles) add(scene, cyl(0.08, 0.1, 4.2, 5, 2.1), '#4a3220', x, 0, z);
    const bulbGeo = new THREE.SphereGeometry(0.09, 6, 4);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = poles[i], [bx, bz] = poles[(i + 1) % 4];
      for (let k = 1; k < 14; k++) { const u = k / 14; const y = 4.1 - Math.sin(u * Math.PI) * 0.9; const m = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0x332211 })); m.position.set(lerp(ax, bx, u), y, lerp(az, bz, u)); scene.add(m); bulbs.push(m); }
      for (const [cx, cz] of [[ax, az]]) for (let k = 0; k < 14; k++) { const u = (k + 0.5) / 14; const wire = add(scene, box(0.015, 0.015, Math.hypot(bx - ax, bz - az) / 14), '#222', lerp(ax, bx, u), 4.1 - Math.sin(u * Math.PI) * 0.9, lerp(az, bz, u), { shadow: false }); wire.rotation.y = Math.atan2(bx - ax, bz - az); }
    }
  })(at('varal_luzes'));
  // horta (leste)
  ((scene) => {
    const N = 340, im = new THREE.InstancedMesh(ico(0.35, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), N), corn = new THREE.InstancedMesh(cyl(0.05, 0.06, 1, 4, 0.5), M('#7a9a3a'), 160);
    const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    let k = 0, kc = 0;
    for (let row = 0; row < 7; row++) for (let i = 0; i < 26; i++) {
      const x = 6.5 + i * 0.55, z = 13 + row * 2.0;
      if (row < 2) { if (kc < 160) { p.set(x, 0, z); s.set(1, 1.8 + R() * 0.6, 1); q.setFromAxisAngle(up, R() * 6); Mx.compose(p, q, s); corn.setMatrixAt(kc++, Mx); } continue; }
      if (k >= N) continue;
      p.set(x, 0.2, z); s.setScalar(0.6 + R() * 0.5); q.setFromAxisAngle(up, R() * 6); Mx.compose(p, q, s); im.setMatrixAt(k, Mx);
      im.setColorAt(k++, c.set(row % 3 === 0 ? '#3f7d2a' : row % 3 === 1 ? '#5a9a35' : '#4c8a2f'));
    }
    im.count = k; corn.count = kc; im.castShadow = corn.castShadow = true; scene.add(im, corn);
    const tom = new THREE.InstancedMesh(ico(0.07, 0), M('#d6331f'), 120); let kt = 0;
    for (let i = 0; i < 120; i++) { p.set(6.5 + R() * 14, 0.35 + R() * 0.2, 17 + Math.floor(R() * 2) * 2 + (R() - 0.5) * 0.4); Mx.makeTranslation(p.x, p.y, p.z); tom.setMatrixAt(kt++, Mx); }
    scene.add(tom);
    for (let row = 0; row < 7; row++) add(scene, box(14.6, 0.12, 0.9), '#5b4128', 13.5, 0.05, 13 + row * 2.0, { shadow: false });
    // espantalho
    const sc = new THREE.Group(); sc.position.set(22.5, 0, 19); add(sc, cyl(0.06, 0.06, 2.4, 4, 1.2), '#6b4a2e'); add(sc, box(1.4, 0.08, 0.08), '#6b4a2e', 0, 1.9, 0); add(sc, box(0.5, 0.6, 0.3), '#3a6aa0', 0, 1.7, 0); add(sc, ico(0.18, 0), '#d9c08a', 0, 2.25, 0); add(sc, cyl(0.3, 0.3, 0.03, 8), '#d9b96a', 0, 2.38, 0); scene.add(sc);
  })(at('horta'));
  // oficina (oeste): galpão, bigorna, faíscas
  const anvil = new THREE.Vector3(-8.4, 0.85, 17.0);
  ((scene) => {
    const g = new THREE.Group(); g.position.set(-10.5, 0, 15.5);
    for (const [px, pz] of [[-2.5, -2], [2.5, -2], [-2.5, 2], [2.5, 2]]) add(g, cyl(0.1, 0.1, 3.2, 5, 1.6), '#5b3e25', px, 0, pz);
    add(g, box(6, 0.1, 5), '#7b3f2c', 0, 3.3, 0, { rot: [0.12, 0, 0] });
    add(g, box(4, 1.0, 1.2), '#6b4a2e', -0.5, 0.5, -1.7); add(g, box(0.5, 0.6, 0.4), '#2f2f2f', -1.2, 1.3, -1.7);
    add(g, box(5.8, 2.2, 0.1), '#5f7d8c', 0, 1.1, -2.45);
    scene.add(g);
    add(scene, box(0.6, 0.25, 0.3), '#2b2d30', anvil.x, 0.7, anvil.z); add(scene, cyl(0.18, 0.22, 0.6, 6, 0.3), '#4a3220', anvil.x, 0, anvil.z);
  })(at('oficina'));
  const SPARKS = 30;
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffb040, size: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.frustumCulled = false; sparks.visible = has('oficina'); scene.add(sparks);
  // cozinha: panelão + mesa
  const pot = new THREE.Vector3(-10, 0, -3);
  ((scene) => {
    add(scene, cyl(0.55, 0.45, 0.7, 10, 0.35), '#3a3a3a', pot.x, 0.35, pot.z);
    for (let i = 0; i < 3; i++) add(scene, cyl(0.05, 0.05, 0.9, 4, 0.45), '#2a2a2a', pot.x + Math.cos(i * 2.1) * 0.5, 0, pot.z + Math.sin(i * 2.1) * 0.5);
    const TX = -12.5, TZ = -6.2;
    add(scene, box(4.5, 0.08, 1.2), '#8b6b43', TX, 0.85, TZ); add(scene, box(4.5, 0.06, 0.35), '#6b4a2e', TX, 0.48, TZ + 0.8); add(scene, box(4.5, 0.06, 0.35), '#6b4a2e', TX, 0.48, TZ - 0.8);
    for (const [lx, lz] of [[-2, 0.5], [2, 0.5], [-2, -0.5], [2, -0.5]]) add(scene, box(0.08, 0.85, 0.08), '#6b4a2e', TX + lx, 0.42, TZ + lz);
    for (let i = 0; i < 6; i++) add(scene, cyl(0.12, 0.1, 0.03, 8), '#e9e4d8', TX - 1.8 + i * 0.75, 0.9, TZ);
    add(scene, box(7, 0.06, 4.6), '#c0392b', -11.5, 2.9, -4.8, { rot: [0.1, 0, 0] }); // toldo
    for (const [px, pz] of [[-15, -2.6], [-8, -2.6], [-15, -7], [-8, -7]]) add(scene, cyl(0.07, 0.07, 3.0, 4, 1.5), '#5b3e25', px, 0, pz);
  })(at('cozinha'));
  // tenda médica
  ((scene) => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const c = cv.getContext('2d'); c.fillStyle = '#f2f2ee'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#d0281f'; c.fillRect(48, 22, 32, 84); c.fillRect(22, 48, 84, 32);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 3.4, 3.2, 4, 1, false), [new THREE.MeshLambertMaterial({ color: '#f2f2ee', flatShading: true })]);
    tent.position.set(11, 1.6, -7.5); tent.rotation.y = Math.PI / 4; tent.castShadow = true; scene.add(tent);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshLambertMaterial({ map: t, transparent: false }));
    cross.position.set(11, 1.6, -5.25); cross.rotation.x = -0.6; scene.add(cross);
    add(scene, box(0.8, 0.45, 2), '#7a8a6a', 7.2, 0.25, -6.5);
  })(at('tenda_medica'));
  // torre de rádio + barraca
  const radioBlink = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  ((scene) => {
    const T = new THREE.Group(); T.position.set(-12, 0, -16);
    for (let i = 0; i < 3; i++) { const a = i * 2.094; add(T, cyl(0.06, 0.1, 16, 4, 8), '#9a9a9a', Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6, { rot: [Math.sin(a) * 0.035, 0, -Math.cos(a) * 0.035] }); }
    for (let y = 1; y < 16; y += 1.4) add(T, cyl(0.63 - y * 0.03, 0.63 - y * 0.03, 0.05, 3), '#8a8a8a', 0, y, 0);
    add(T, cyl(0.03, 0.03, 3, 4, 1.5), '#cfcfcf', 0, 16, 0);
    add(T, cyl(0.9, 0.9, 0.08, 10), '#d9d9d9', 0.8, 11, 0, { rot: [0, 0, 1.2] });
    radioBlink.position.set(0, 19.1, 0); T.add(radioBlink);
    scene.add(T);
    const DX = -8.5, DZ = -11.5;
    add(scene, box(3.4, 0.08, 2.6), '#2c3e50', DX, 2.4, DZ - 0.4, { rot: [0.08, 0, 0] });
    for (const [px, pz] of [[-1.5, 0.8], [1.5, 0.8], [-1.5, -1.6], [1.5, -1.6]]) add(scene, cyl(0.06, 0.06, 2.4, 4, 1.2), '#5b3e25', DX + px, 0, DZ + pz);
    add(scene, box(1.8, 0.08, 0.8), '#8b6b43', DX, 0.8, DZ); add(scene, box(0.6, 0.3, 0.35), '#3a3f44', DX - 0.3, 0.99, DZ - 0.15); add(scene, box(0.1, 0.06, 0.02), '#57e389', DX - 0.3, 1.05, DZ + 0.04, { shadow: false });
    add(scene, box(0.5, 0.45, 0.5), '#6b4a2e', DX, 0.22, DZ - 0.8); // banquinho
  })(at('radio'));
  // moinho, caixa d'água, estufa, mirante
  const windBlades = new THREE.Group();
  ((scene) => {
    const W = new THREE.Group(); W.position.set(31, 0, -24);
    add(W, cyl(0.6, 1.4, 11, 6, 5.5), '#d9cbb0'); add(W, cyl(0.1, 1.1, 1.4, 6, 0.7), '#7b3f2c', 0, 11, 0);
    windBlades.position.set(0, 10, 1.0); W.add(windBlades);
    for (let i = 0; i < 4; i++) { const b = new THREE.Group(); b.rotation.z = i * Math.PI / 2; add(b, box(0.25, 5, 0.06), '#8b6b43', 0, 2.6, 0); add(b, box(0.9, 3.4, 0.03), '#efe6d2', 0.5, 3.0, 0); windBlades.add(b); }
    W.rotation.y = -0.6; scene.add(W);
    const tank = new THREE.Group(); tank.position.set(-33, 0, 2);
    for (const [px, pz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) add(tank, cyl(0.12, 0.12, 6, 4, 3), '#5b3e25', px, 0, pz);
    add(tank, cyl(1.9, 1.9, 2.8, 10, 1.4), '#3b6aa0', 0, 6, 0); add(tank, cyl(2.0, 0.1, 0.7, 10, 0.35), '#2c4f7a', 0, 8.8, 0);
    scene.add(tank);
    const gh = new THREE.Group(); gh.position.set(24, 0, 7);
    add(gh, box(6, 2.4, 3.6), '#bfe3c9', 0, 1.2, 0, { shadow: false }).material = new THREE.MeshLambertMaterial({ color: '#cdeedb', transparent: true, opacity: 0.55, flatShading: true });
    for (let i = -3; i <= 3; i += 1.5) add(gh, box(0.06, 2.5, 3.65), '#f2f2f2', i, 1.25, 0);
    scene.add(gh);
    // mirante
    const P = new THREE.Group(); P.position.set(-3, 0, -9.5);
    for (const [px, pz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) add(P, cyl(0.1, 0.12, 4, 5, 2), '#5b3e25', px, 0, pz);
    add(P, box(3, 0.2, 3), '#7a5a3a', 0, 4, 0);
    for (const [bx, bz, w, d] of [[0, -1.45, 3, 0.08], [1.45, 0, 0.08, 3], [-1.45, 0, 0.08, 3]]) add(P, box(w, 0.08, d), '#7a5a3a', bx, 5.0, bz);
    for (let i = 0; i < 12; i++) add(P, box(1.0, 0.06, 0.25), '#7a5a3a', -0.2, 0.33 * (i + 1), 1.6 + 2.8 * (1 - (i + 1) / 12), { rot: [0, 0, 0] });
    scene.add(P);
  })(at('infra'));
  // varal com roupas
  const clothes = [];
  ((scene) => {
    add(scene, cyl(0.05, 0.05, 2.2, 4, 1.1), '#5b3e25', -20, 0, 3); add(scene, cyl(0.05, 0.05, 2.2, 4, 1.1), '#5b3e25', -12, 0, 5);
    add(scene, box(0.01, 0.01, 8.25), '#ddd', -16, 2.1, 4, { shadow: false }).rotation.y = Math.atan2(8, 2);
    ['#e74c3c', '#f1c40f', '#3498db', '#ecf0f1', '#9b59b6', '#2ecc71'].forEach((c, i) => {
      const u = (i + 0.7) / 6.5; const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, flatShading: true }));
      m.position.set(lerp(-20, -12, u), 1.6, lerp(3, 5, u)); m.rotation.y = Math.atan2(8, 2) - Math.PI / 2; m.castShadow = true; scene.add(m); clothes.push(m);
    });
  })(at('varal_roupa'));


  // =====================================================================
  // ACAMPAMENTO DO FUNDADOR (estágio 0 — sempre existe)
  // =====================================================================
  const signMat = new THREE.MeshLambertMaterial({ emissive: 0xffffff, emissiveIntensity: 0 });
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0x332211 }));
  {
    // barraca (lona laranja, aberta para o fogo)
    const B = new THREE.Group(); B.position.set(-3.6, 0, -2.4); B.rotation.y = 0.75;
    const lona = M('#c8662a'), lona2 = M('#a9521f');
    for (const sx of [-1, 1]) { const w = add(B, box(0.05, 1.75, 2.6), sx < 0 ? lona : lona2, sx * 0.62, 0.68, 0); w.material = sx < 0 ? lona : lona2; w.rotation.z = sx * 0.62; w.receiveShadow = true; }
    add(B, box(1.7, 1.4, 0.04), '#a9521f', 0, 0.55, -1.28, { scale: [0.82, 1, 1] }).rotation.set(0, 0, 0);
    add(B, cyl(0.025, 0.025, 1.45, 4, 0.72), '#5b3e25', 0, 0, 1.32); add(B, cyl(0.025, 0.025, 1.45, 4, 0.72), '#5b3e25', 0, 0, -1.32);
    add(B, box(0.75, 0.12, 1.9), '#2e5a8a', 0, 0.06, -0.1); // saco de dormir
    add(B, box(0.35, 0.5, 0.25), '#556b2f', 0.55, 0.25, 1.55); // mochila
    scene.add(B);
    lantern.position.set(-2.2, 1.55, -0.9); scene.add(lantern);
    add(scene, cyl(0.015, 0.015, 1.6, 4, 0.8), '#3a2a1e', -2.2, 0, -0.9);
    // panela no tripé sobre o fogo
    for (let i = 0; i < 3; i++) { const a = i * 2.094; add(scene, cyl(0.025, 0.025, 1.5, 4, 0.75), '#3a3a3a', Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55, { rot: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] }); }
    add(scene, cyl(0.17, 0.14, 0.22, 8, 0), '#2b2b2b', 0, 0.95, 0);
    // tambor de água da chuva + lona coletora
    add(scene, cyl(0.38, 0.38, 0.95, 10, 0.47), '#2f6aa8', 3.0, 0, -2.6);
    add(scene, box(1.6, 0.03, 1.6), '#4a7a9a', 3.0, 1.35, -2.6, { rot: [0.25, 0.4, 0] });
    for (const [dx, dz] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) add(scene, cyl(0.03, 0.03, 1.5, 4, 0.75), '#5b3e25', 3.0 + dx, 0, -2.6 + dz);
    // caixotes, pneus e sucata
    add(scene, box(0.6, 0.45, 0.45), '#9c7a4f', -1.4, 0.22, -3.6, { rot: [0, 0.3, 0] }); add(scene, box(0.5, 0.4, 0.4), '#8a6a42', -1.3, 0.65, -3.55, { rot: [0, -0.2, 0] });
    for (let i = 0; i < 3; i++) add(scene, cyl(0.38, 0.38, 0.25, 10), '#1c1c1c', 5.2 + (i % 2) * 0.2, 0.13 + i * 0.25, 1.6, { rot: [0, 0, 0] });
    for (let i = 0; i < 6; i++) add(scene, box(1.4 + R(), 0.05, 0.9 + R() * 0.5), ['#8d4b2b', '#5f7d8c', '#a3623a', '#7b3f2c'][i % 4], 5.5 + R() * 1.5, 0.06 + i * 0.07, 3.0 + R(), { rot: [(R() - 0.5) * 0.3, R() * 3, (R() - 0.5) * 0.3] });
    // carro queimado
    const car = new THREE.Group(); car.position.set(-7.5, 0, 4.5); car.rotation.set(0, 1.1, 0.08);
    add(car, box(1.9, 0.75, 4.3), '#4a3a30', 0, 0.55, 0); add(car, box(1.7, 0.55, 2.0), '#3a2e26', 0, 1.2, -0.3); add(car, box(1.72, 0.4, 1.8), '#141414', 0, 1.22, -0.3, { scale: [1.01, 1, 1.02] });
    scene.add(car);
    // placa da comunidade (POP. n)
    const pop = script.populacao ?? 1;
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d');
    g.fillStyle = '#7a5a3a'; g.fillRect(0, 0, 512, 256); g.strokeStyle = '#4a3220'; g.lineWidth = 14; g.strokeRect(7, 7, 498, 242);
    g.fillStyle = '#f4e7c5'; g.textAlign = 'center'; g.font = '900 58px Montserrat'; g.fillText('A COMUNIDADE', 256, 100);
    g.fillStyle = '#ffd400'; g.font = '900 76px Montserrat'; g.fillText(`POP. ${pop}`, 256, 196);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    signMat.map = t; signMat.emissiveMap = t;
    const sg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.06), [M('#7a5a3a'), M('#7a5a3a'), M('#7a5a3a'), M('#7a5a3a'), signMat, M('#7a5a3a')]);
    sg.position.set(3.6, 1.25, 8.0); sg.rotation.y = -0.45; sg.castShadow = true; scene.add(sg);
    add(scene, cyl(0.05, 0.05, 1.3, 4, 0.65), '#4a3220', 3.05, 0, 8.3); add(scene, cyl(0.05, 0.05, 1.3, 4, 0.65), '#4a3220', 4.15, 0, 7.75);
    // entulho de concreto espalhado
    const rub = new THREE.InstancedMesh(box(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), 260);
    const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
    let k = 0;
    while (k < 260) { const r = 11 + R() * 50, a = R() * 6.28, x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.abs(x) < 7 && z > -2) continue; const sz = 0.3 + Math.pow(R(), 2) * 2.2;
      p.set(x, sz * 0.25, z); e.set((R() - 0.5) * 0.8, R() * 6, (R() - 0.5) * 0.8); q.setFromEuler(e); sv.set(sz * (0.6 + R()), sz * 0.5, sz * (0.6 + R())); Mx.compose(p, q, sv); rub.setMatrixAt(k, Mx); rub.setColorAt(k++, c.set(['#8f8a80', '#a39d92', '#77726a', '#6b5a4a'][Math.floor(R() * 4)])); }
    rub.castShadow = true; rub.receiveShadow = true; scene.add(rub);
    const mound = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.9, 7), M('#7f786d')); mound.position.set(0.2, 1.45, 19.5); mound.castShadow = mound.receiveShadow = true; scene.add(mound);
    for (let i = 0; i < 9; i++) add(scene, box(0.6 + R(), 0.4, 0.5 + R()), ['#8f8a80', '#6b5a4a', '#a39d92'][i % 3], 0.2 + (R() - 0.5) * 5, 0.5 + R() * 1.6, 19.5 + (R() - 0.5) * 5, { rot: [R(), R() * 3, R()] });
  }

  // colunas de fumaça ao longe (a cidade ainda queima)
  const SMK = [[-120, -170], [150, -140], [-190, 60]], SMN = 26;
  const smkGeo = new THREE.BufferGeometry(); smkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SMK.length * SMN * 3), 3));
  const smkMap = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const smoke = new THREE.Points(smkGeo, new THREE.PointsMaterial({ size: 34, color: 0x3a342e, transparent: true, opacity: 0.55, depthWrite: false, map: smkMap }));
  smoke.frustumCulled = false; scene.add(smoke);

  // =====================================================================
  // FOGO (partículas) + FUMAÇA
  // =====================================================================
  const FLAMES = 40;
  const flameGeo = new THREE.BufferGeometry();
  flameGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLAMES * 3), 3));
  flameGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FLAMES * 3), 3));
  const flames = new THREE.Points(flameGeo, new THREE.PointsMaterial({ size: 0.42, vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, map: (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })() }));
  flames.frustumCulled = false; scene.add(flames);
  const steam = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(20 * 3), 3)), new THREE.PointsMaterial({ size: 0.9, color: 0xdddddd, transparent: true, opacity: 0.25, depthWrite: false, map: flames.material.map }));
  steam.frustumCulled = false; steam.visible = has('cozinha'); scene.add(steam);

  // =====================================================================
  // MORADORES
  // =====================================================================
  const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
  function randomVisual(seed, kid = false) {
    const r = rng(seed * 9973 + 17);
    const fem = r() < 0.5;
    return {
      height: kid ? 1.15 + r() * 0.2 : (fem ? 1.58 : 1.68) + r() * 0.2, build: 0.85 + r() * 0.4, kid,
      skin: pick(SKINS, r), hair: fem ? pick(['longo', 'coque', 'afro', 'trancas', 'rabo', 'franja', 'curto'], r) : pick(['curto', 'raspado', 'afro', 'moicano', 'curto', 'franja'], r),
      hairColor: pick(HAIR_COLORS, r), top: pick(TOPS, r), topColor: pick(CLOTHES, r), top2: pick(CLOTHES, r), pants: pick(PANTS, r),
      shorts: r() < 0.2, skirt: fem && r() < 0.15, shoes: pick(['#2b2b2b', '#5a3a22', '#e8e8e8', '#7a2a2a'], r), hat: pick(HATS, r), hatColor: pick(CLOTHES, r),
      beard: !fem && !kid && r() < 0.35, glasses: r() < 0.15, backpack: r() < 0.12 ? pick(CLOTHES, r) : false, scarf: r() < 0.15 ? pick(CLOTHES, r) : null,
    };
  }
  const people = [];
  const ROLE = { // ação -> { anim, tool, visual extra }
    capinar: { a: 'capinar', tool: 'enxada', v: { hat: 'chapeu' } },
    martelar: { a: 'martelar', tool: 'martelo', v: { apron: '#5a3a22' } },
    mexer: { a: 'mexer', tool: 'concha', v: { apron: '#f2f2f2', hat: 'bandana', hatColor: '#c0392b' } },
    vigiar: { a: 'binoculo', tool: 'binoculo', v: { hat: 'bone', top: 'jaqueta' } },
    medica: { a: 'prancheta', tool: 'prancheta', v: { coat: true, glasses: true } },
    radio: { a: 'radio', v: { headphones: true, hat: null } },
    violao: { a: 'violao', tool: 'violao' },
    carregar: { a: 'carregar', tool: 'caixa', v: { hat: 'capacete' } },
    plantar: { a: 'plantar', v: { hat: 'chapeu' } },
    estender: { a: 'estender', tool: 'roupa' },
    painel: { a: 'painel', tool: 'painel', v: { hat: 'capacete' } },
    alimentar: { a: 'alimentar', tool: 'milho' },
    acenar: { a: 'acenar' }, dancar: { a: 'dancar' }, sentado: { a: 'sentado' }, parado: { a: 'parado' }, andar: { a: 'andar' }, correr: { a: 'correr' },
    vaga: { a: 'fantasma', v: { ghost: true } },
  };
  for (const c of script.cidadaos || []) {
    const role = ROLE[c.vaga ? 'vaga' : c.acao] || ROLE.parado;
    const vis = { ...randomVisual(c.seed ?? people.length + 1, c.crianca), ...(role.v || {}), ...(c.visual || {}), tool: role.tool };
    if (c.vaga) Object.assign(vis, { ghost: true, tool: null, hat: null, backpack: false, apron: null, coat: false });
    const p = kit.makePerson(vis);
    p.root.position.set(c.pos[0], c.y ?? 0, c.pos[1]);
    p.root.rotation.y = (c.yaw ?? 0) * DEG;
    scene.add(p.root);
    people.push({ c, p, role, ph: R() * 6.28 });
  }
  // cachorro e galinhas
  const dog = new THREE.Group();
  { add(dog, box(0.3, 0.3, 0.7), '#a0703a', 0, 0.5, 0); add(dog, box(0.26, 0.26, 0.3), '#a0703a', 0, 0.72, 0.42); add(dog, box(0.14, 0.1, 0.16), '#7a5028', 0, 0.66, 0.6); for (const x of [-0.1, 0.1]) add(dog, box(0.06, 0.12, 0.04), '#5a3a1e', x, 0.9, 0.38);
    for (const [x, z] of [[-0.1, 0.25], [0.1, 0.25], [-0.1, -0.25], [0.1, -0.25]]) add(dog, box(0.08, 0.38, 0.08), '#a0703a', x, 0.19, z); }
  const dogTail = add(dog, box(0.05, 0.05, 0.3), '#a0703a', 0, 0.62, -0.45, { rot: [0.6, 0, 0] });
  scene.add(dog);
  const hens = [];
  for (let i = 0; i < 9; i++) { const h = new THREE.Group(); add(h, ico(0.16, 0), i % 3 ? '#f2efe6' : '#b5651d', 0, 0.2, 0, { scale: [0.9, 0.85, 1.2] }); add(h, ico(0.08, 0), i % 3 ? '#f2efe6' : '#b5651d', 0, 0.36, 0.13); add(h, box(0.04, 0.05, 0.02), '#d0281f', 0, 0.44, 0.14); add(h, box(0.04, 0.03, 0.06), '#f39c12', 0, 0.35, 0.22); scene.add(h); hens.push({ h, x: -15 + (R() - 0.5) * 5, z: 27 + (R() - 0.5) * 4, ph: R() * 6.28 }); }
  const ball = add(scene, ico(0.13, 1), '#f5f5f5');
  dog.visible = has('animais'); hens.forEach(h => { h.h.visible = has('animais'); }); ball.visible = has('criancas');
  // planta holográfica do que ainda não existe
  const bpMat = new THREE.MeshBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  futuro.traverse(o => { if (o.isMesh) { o.material = bpMat; o.castShadow = false; o.receiveShadow = false; if (o.isInstancedMesh) o.instanceColor = null; } });
  futuro.visible = true; // fica visível até o 1º update para o shader ser pré-compilado (determinismo)

  // =====================================================================
  // update(t)
  // =====================================================================
  const tLuz = t => events.since('luzes', t), tNoite = t => events.since('noite', t), tPOn = t => events.since('planta_on', t), tPOff = t => events.since('planta_off', t);
  const V = new THREE.Vector3(), HEADP = new THREE.Vector3();
  const labelList = [];

  return {
    tension: () => 0,
    labels: () => labelList,
    update(t, { camera: cam }) {
      // ---- sol: hora dourada -> anoitecer ----
      const u = clamp(t / DUR);
      const elev = lerp(15, -5, smooth(0, 0.85, u)) * DEG, az = 205 * DEG;
      sunDir.set(-Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev));
      const dusk = smooth(0.3, 0.85, u);
      skyU.dusk.value = dusk;
      sun.position.copy(sunDir).multiplyScalar(160); sun.target.position.set(0, 0, 5);
      sun.intensity = lerp(3.2, 0.0, smooth(0.25, 0.8, u));
      sun.color.setHSL(0.08 - 0.03 * dusk, 0.85, 0.65);
      hemi.intensity = lerp(1.25, 0.6, dusk);
      hemi.color.setHSL(0.6, 0.5, lerp(0.75, 0.42, dusk));
      scene.fog.color.setHSL(0.075 - 0.02 * dusk, 0.38, lerp(0.56, 0.18, dusk));
      renderer.toneMappingExposure = lerp(1.0, 1.45, dusk);
      moon.intensity = lerp(0, 0.9, smooth(0.45, 0.8, u));
      const lampOn = smooth(0.42, 0.55, u);
      vagaLight.intensity = 22 * lampOn; lamps.forEach(l => l.material.color.setRGB(lerp(0.2, 2.2, lampOn), lerp(0.13, 1.4, lampOn), lerp(0.07, 0.5, lampOn)));

      // ---- fumaça distante ----
      const sm = smkGeo.attributes.position.array;
      SMK.forEach(([x0, z0], j) => { for (let i = 0; i < SMN; i++) { const ph = ((t / 16) + i / SMN + j * 0.3) % 1, n = (j * SMN + i) * 3; sm[n] = x0 + ph * ph * 60 + Math.sin(i * 2.1) * 6; sm[n + 1] = 10 + ph * 120; sm[n + 2] = z0 + Math.cos(i * 1.7) * 6; } });
      smkGeo.attributes.position.needsUpdate = true;
      // ---- fogueira ----
      const fl = 0.85 + 0.1 * Math.sin(t * 13) + 0.06 * Math.sin(t * 29 + 1);
      fireLight.intensity = lerp(6, 34, dusk) * fl;
      const fp = flameGeo.attributes.position.array, fc = flameGeo.attributes.color.array;
      for (let i = 0; i < FLAMES; i++) {
        const life = 0.9, ph = ((t / life) + i / FLAMES * 3.7) % 1, a = i * 2.39;
        const r = 0.35 * (1 - ph);
        fp[i * 3] = Math.cos(a) * r + Math.sin(t * 3 + i) * 0.05; fp[i * 3 + 1] = 0.25 + ph * 1.3; fp[i * 3 + 2] = Math.sin(a) * r;
        fc[i * 3] = 1; fc[i * 3 + 1] = lerp(0.8, 0.25, ph); fc[i * 3 + 2] = lerp(0.3, 0.02, ph);
      }
      flameGeo.attributes.position.needsUpdate = flameGeo.attributes.color.needsUpdate = true;
      const sp = steam.geometry.attributes.position.array;
      for (let i = 0; i < 20; i++) { const ph = ((t / 3) + i / 20) % 1; sp[i * 3] = pot.x + Math.sin(i * 1.7 + t) * 0.2 * ph; sp[i * 3 + 1] = 0.9 + ph * 2.0; sp[i * 3 + 2] = pot.z + Math.cos(i * 2.3) * 0.2 * ph; }
      steam.geometry.attributes.position.needsUpdate = true;

      // ---- faíscas da bigorna (a cada batida em t inteiro) ----
      const sa = sparkGeo.attributes.position.array, since = t % 1;
      for (let i = 0; i < SPARKS; i++) {
        const a = i * 2.4, v = 1.5 + (i % 5) * 0.4;
        if (since > 0.45) { sa[i * 3 + 1] = -10; continue; }
        sa[i * 3] = anvil.x + Math.cos(a) * v * since; sa[i * 3 + 1] = anvil.y + v * since * 1.2 - 4.9 * since * since; sa[i * 3 + 2] = anvil.z + Math.sin(a) * v * since;
      }
      sparkGeo.attributes.position.needsUpdate = true;

      // ---- luzes ----
      const lz = tLuz(t), on = lz > 0 ? smooth(0, 0.8, lz) : 0;
      bulbs.forEach((b, i) => { const k = on * (lz > i * 0.02 ? 1 : 0); b.material.color.setRGB(lerp(0.2, 1.6, k), lerp(0.13, 1.1, k), lerp(0.07, 0.45, k)); });
      radioBlink.visible = Math.sin(t * 4) > 0.2 && has('radio');
      lantern.material.color.setRGB(lerp(0.2, 2.0, smooth(0.3, 0.5, u)), lerp(0.13, 1.3, smooth(0.3, 0.5, u)), lerp(0.07, 0.45, smooth(0.3, 0.5, u)));
      signMat.emissiveIntensity = 0.55 * smooth(0.4, 0.7, u);
      // planta holográfica: sobe do chão, brilha e some
      const pk = tPOn(t) > 0 ? smooth(0, 2.2, tPOn(t)) * (1 - smooth(0, 1.2, tPOff(t))) : 0;
      futuro.visible = pk > 0.001;
      futuro.scale.y = Math.max(0.001, smooth(0, 1, tPOn(t) / 2.2));
      bpMat.opacity = pk * (0.21 + 0.04 * Math.sin(t * 6));
      windBlades.rotation.z = -t * 0.9;
      clothes.forEach((m, i) => { m.rotation.x = 0.15 * Math.sin(t * 2.2 + i); });

      // ---- moradores ----
      labelList.length = 0;
      for (const { c, p, role, ph } of people) {
        const fn = ANIM[role.a] || ANIM.parado;
        let q = fn(t, ph);
        // trajetos de quem anda
        if (c.rota) {
          const [a, b] = c.rota, L = Math.hypot(b[0] - a[0], b[1] - a[1]), sp = c.vel ?? 1.1;
          const per = 2 * L / sp, k = (t * sp / L + (c.fase ?? 0)) % 2, f = k < 1 ? k : 2 - k;
          p.root.position.set(lerp(a[0], b[0], f), 0, lerp(a[1], b[1], f));
          p.root.rotation.y = Math.atan2(k < 1 ? b[0] - a[0] : a[0] - b[0], k < 1 ? b[1] - a[1] : a[1] - b[1]);
          void per;
        }
        // à noite os extras dançam
        if (c.noite && tNoite(t) > 0) q = ANIM[c.noite](t, ph);
        // olhar para a câmera quando ela chega perto (pose deste quadro aplicada antes de medir a cabeça)
        kit.setPose(p, q); p.root.updateMatrixWorld(true);
        p.joints.head.getWorldPosition(HEADP);
        const dx = cam.position.x - HEADP.x, dz = cam.position.z - HEADP.z, dist = Math.hypot(dx, dz);
        const w = smooth(9, 4.5, dist) * (c.olha === false ? 0 : 1);
        if (w > 0) {
          let rel = Math.atan2(dx, dz) - p.root.rotation.y - (q.spineY || 0);
          rel = Math.atan2(Math.sin(rel), Math.cos(rel));
          q.headY = lerp(q.headY || 0, clamp(rel, -1.1, 1.1), w);
          q.headX = lerp(q.headX || 0, clamp(-Math.atan2(cam.position.y - HEADP.y, dist) * 0.7, -0.5, 0.5), w);
        }
        kit.setPose(p, q);
        // fantasmas que aparecem e somem (imaginação / vagas)
        const vis = (c.aparece == null ? 1 : smooth(c.aparece, c.aparece + 1.2, t)) * (c.some == null ? 1 : 1 - smooth(c.some, c.some + 1.0, t));
        p.root.visible = vis > 0.01;
        if (p.ghostMat) p.ghostMat.opacity = 0.62 * vis;
        if (c.nome || c.vaga) {
          V.copy(p.root.position); V.y += (c.labelY ?? p.height + 0.55);
          const show = (c.desde == null ? 1 : smooth(c.desde, c.desde + 0.6, t)) * vis;
          if (show > 0) labelList.push({ id: c.id, pos: [V.x, V.y, V.z], text: c.vaga ? 'VAGA LIVRE' : c.nome, sub: c.funcao, kind: c.vaga ? 'vaga' : '', near: 2.5, far: c.longe ?? 15, alpha: show });
        }
      }
      // etiquetas fixas do cenário (ex.: a barraca do fundador)
      for (const e of script.etiquetas || []) {
        const a = (e.desde == null ? 1 : smooth(e.desde, e.desde + 0.6, t)) * (e.ate == null ? 1 : 1 - smooth(e.ate, e.ate + 0.6, t));
        if (a > 0) labelList.push({ id: e.id, pos: e.pos, text: e.texto, sub: e.sub, kind: e.tipo || '', near: 1.5, far: e.longe ?? 30, alpha: a });
      }
      // cachorro passeando pela praça
      const da = t * 0.35;
      dog.position.set(Math.cos(da) * 5.2, 0, Math.sin(da) * 5.2); dog.rotation.y = -da;
      dogTail.rotation.y = 0.6 * Math.sin(t * 14);
      hens.forEach(({ h, x, z, ph }) => { const peck = Math.max(0, Math.sin(t * 3 + ph)); h.position.set(x + Math.sin(t * 0.3 + ph) * 0.8, 0, z + Math.cos(t * 0.25 + ph) * 0.6); h.rotation.set(peck * 0.6, ph + t * 0.2, 0); });
      // bola das crianças (entre duas crianças, quicando)
      const bk = (t * 0.55) % 2, bf = bk < 1 ? bk : 2 - bk;
      ball.position.set(lerp(4.6, 9.4, bf), 0.13 + Math.abs(Math.sin(bf * Math.PI * 2)) * 0.5, lerp(31, 32.5, bf));
      ball.rotation.set(t * 5, t * 3, 0);
    },
  };
}
