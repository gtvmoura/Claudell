// Cena: clareira no meio da floresta, durante um apocalipse zumbi. Visão aérea (drone).
// Unidades em metros. Clareira centrada em (0, 0), raio ~20 m. Trilha de chegada vindo do sul (+Z).
//
// script.json:
//   construido: []                 -> o que já existe de verdade (o resto pode aparecer como holograma)
//   fundador: { nome, funcao, trajeto: [[t, x, z], ...], acoes: [[t, "andar"|"olhar"|...], ...], yaws: [[t, graus], ...] }
//   cidadaos: [...]                -> moradores / vagas-fantasma (mesmo formato da cena "comunidade")
//   zumbis: { n, aparece, raioIni, raioFim, setor: [grausIni, grausFim] }
//   events: bandeira, fogo, planta_on, planta_off
import { makePeopleKit, ANIM, SKINS, HAIR_COLORS, CLOTHES, PANTS, HATS, TOPS } from '../lib/people.js';

export async function build({ THREE, renderer, scene, camera, script, events, helpers }) {
  const { rng, clamp, lerp, smooth } = helpers;
  const R = rng(script.seed ?? 99);
  const kit = makePeopleKit(THREE);
  const { add, box, cyl, ico, M } = kit;
  const DUR = script.duration, DEG = Math.PI / 180;
  const BUILT = new Set(script.construido || []);
  const has = k => BUILT.has(k);
  const futuro = new THREE.Group(); scene.add(futuro);
  const at = k => (has(k) ? scene : futuro);
  const CLEAR_R = 20;

  // ---------------- céu + luz ----------------
  const sunDir = new THREE.Vector3();
  const skyU = { sunDir: { value: sunDir }, dusk: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 40, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: skyU,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir; uniform float dusk;
      void main(){ float h = vDir.y;
        vec3 zen = mix(vec3(0.2,0.38,0.66), vec3(0.02,0.03,0.1), dusk);
        vec3 mid = mix(vec3(0.62,0.7,0.78), vec3(0.18,0.1,0.24), dusk);
        vec3 hor = mix(vec3(1.0,0.75,0.45), vec3(0.8,0.25,0.14), dusk);
        vec3 col = h > 0.0 ? mix(mid, zen, smoothstep(0.0, 0.5, h)) : mid * 0.5;
        col = mix(col, hor, (1.0 - smoothstep(0.0, 0.2, abs(h))) * 0.85);
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += vec3(1.0,0.65,0.3) * pow(s, 10.0) * 0.45 + vec3(1.0,0.9,0.6) * pow(s, 700.0) * 6.0 * (1.0 - dusk);
        vec3 q = floor(vDir * 360.0); float st = fract(sin(dot(q, vec3(12.9898,78.233,37.719))) * 43758.5453);
        col += vec3(step(0.998, st)) * smoothstep(0.55, 1.0, dusk) * smoothstep(0.05, 0.3, h);
        gl_FragColor = vec4(col, 1.0); }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  scene.fog = new THREE.Fog(0x9fb7a8, 70, 260);
  const sun = new THREE.DirectionalLight(0xffd6a0, 3.0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 400 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xb8d4ff, 0x3d4a2a, 1.2); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8aa4ff, 0); moon.position.set(-50, 90, -30); scene.add(moon);
  const fireLight = new THREE.PointLight(0xff8a3a, 0, 22, 1.5); scene.add(fireLight);

  // ---------------- chão ----------------
  const FIRE = new THREE.Vector3(-1.6, 0, 0.6);
  const trail = (x, z) => { if (z < 0) return Math.hypot(x, z); const cx = Math.sin(z * 0.06) * 2.5 * smooth(8, 25, z); return Math.abs(x - cx); }; // trilha do sul até o centro
  const groundY = (x, z) => { const r = Math.hypot(x, z); return (Math.sin(x * 0.07) * Math.cos(z * 0.06) * 1.2 + Math.sin(x * 0.02 + 1) * 2.5) * smooth(CLEAR_R - 2, CLEAR_R + 30, r); };
  {
    const g = new THREE.PlaneGeometry(600, 600, 200, 200); g.rotateX(-Math.PI / 2);
    const pa = g.attributes.position, cols = [];
    const c = new THREE.Color(), lush = new THREE.Color('#5fa83a'), lush2 = new THREE.Color('#7cc04a'), forest = new THREE.Color('#2f4a22'), forest2 = new THREE.Color('#45602a'), dirt = new THREE.Color('#8a6a45');
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i), r = Math.hypot(x, z);
      pa.setY(i, groundY(x, z));
      const n = 0.5 + 0.5 * Math.sin(x * 0.23 + Math.cos(z * 0.19) * 2) * Math.cos(z * 0.15);
      c.copy(lush).lerp(lush2, n);
      c.lerp(forest, smooth(CLEAR_R - 3, CLEAR_R + 6, r)).lerp(forest2, smooth(CLEAR_R + 4, CLEAR_R + 30, r) * n * 0.6);
      c.lerp(dirt, smooth(1.6, 0.6, trail(x, z)) * 0.85 * (r > 3 ? 1 : smooth(0, 3, r)));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); m.receiveShadow = true; scene.add(m);
  }
  function scatter(n, geo, colors, place, sMin, sMax, shadow = false, mat) {
    const im = new THREE.InstancedMesh(geo, mat || new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), n);
    const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
    let k = 0, guard = 0;
    while (k < n && guard++ < n * 40) {
      const pt = place(); if (!pt) continue;
      const s = lerp(sMin, sMax, R());
      p.set(pt[0], groundY(pt[0], pt[1]) + (pt[2] || 0), pt[1]); sv.set(s, s * (0.8 + R() * 0.5), s); e.set(pt[3] || 0, R() * 6.28, 0); q.setFromEuler(e);
      Mx.compose(p, q, sv); im.setMatrixAt(k, Mx); if (colors) im.setColorAt(k, c.set(colors[Math.floor(R() * colors.length)])); k++;
    }
    im.count = k; im.castShadow = shadow; im.receiveShadow = true; scene.add(im); return im;
  }
  const grassGeo = new THREE.ConeGeometry(0.1, 0.4, 4); grassGeo.translate(0, 0.18, 0);
  scatter(6000, grassGeo, ['#6bb33f', '#86c94e', '#5a9a34', '#9bd45c'], () => { const r = Math.sqrt(R()) * (CLEAR_R + 4), a = R() * 6.28, x = Math.cos(a) * r, z = Math.sin(a) * r; return trail(x, z) > 1.3 && Math.hypot(x - FIRE.x, z - FIRE.z) > 1.6 ? [x, z] : null; }, 0.6, 1.3);
  scatter(700, new THREE.IcosahedronGeometry(0.08, 0), ['#f1c40f', '#ffffff', '#e74c3c', '#c39bd3', '#ff9ff3'], () => { const r = Math.sqrt(R()) * CLEAR_R, a = R() * 6.28, x = Math.cos(a) * r, z = Math.sin(a) * r; return trail(x, z) > 1.5 && r > 3 ? [x, z, 0.3] : null; }, 0.8, 1.4);
  scatter(60, new THREE.DodecahedronGeometry(0.5, 0), ['#8a8a84', '#9b978e', '#6f6d68'], () => { const r = 6 + R() * (CLEAR_R + 8), a = R() * 6.28, x = Math.cos(a) * r, z = Math.sin(a) * r; return trail(x, z) > 2 ? [x, z, 0.1] : null; }, 0.4, 1.5, true);

  // ---------------- floresta densa ----------------
  {
    const N = 2600;
    const pineGeo = (() => { const parts = []; for (let i = 0; i < 3; i++) { const c = new THREE.ConeGeometry(1.6 - i * 0.4, 2.4, 7); c.translate(0, 2.2 + i * 1.5, 0); parts.push(c); } const tr = new THREE.CylinderGeometry(0.18, 0.25, 2.2, 5); tr.translate(0, 1.1, 0); parts.push(tr); return parts; })();
    // pinheiro = 3 cones + tronco (instâncias separadas, mesma matriz)
    const cones = pineGeo.slice(0, 3).map((g, i) => new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), N));
    const trunks = new THREE.InstancedMesh(pineGeo[3], M('#5b3e25'), N);
    const broadT = new THREE.InstancedMesh(cyl(0.22, 0.3, 1, 5, 0.5), M('#6b4a2e'), N), broadC = new THREE.InstancedMesh(ico(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), N);
    const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    let kp = 0, kb = 0, guard = 0;
    while (kp + kb < N && guard++ < N * 20) {
      const r = CLEAR_R + 1.5 + Math.pow(R(), 1.3) * 150, a = R() * 6.28, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (trail(x, z) < (z > CLEAR_R ? 9 : 4.8) && z > 0) continue; // corredor livre para o drone
      const y = groundY(x, z), sc = 0.8 + R() * 0.9;
      q.setFromAxisAngle(up, R() * 6.28);
      if (R() < 0.6) { // pinheiro
        p.set(x, y, z); s.set(sc, sc * (0.9 + R() * 0.4), sc); Mx.compose(p, q, s);
        cones.forEach(cm => cm.setMatrixAt(kp, Mx)); trunks.setMatrixAt(kp, Mx);
        const col = c.set(['#2f5d2a', '#3a6b2f', '#285224', '#46793a'][Math.floor(R() * 4)]); cones.forEach(cm => cm.setColorAt(kp, col)); kp++;
      } else { // árvore de copa redonda
        const h = 3 + R() * 4; p.set(x, y, z); s.set(1, h, 1); Mx.compose(p, q, s); broadT.setMatrixAt(kb, Mx);
        const cs = 2 + R() * 2.2; p.set(x, y + h + cs * 0.45, z); s.set(cs, cs * (0.85 + R() * 0.4), cs); Mx.compose(p, q, s); broadC.setMatrixAt(kb, Mx);
        broadC.setColorAt(kb, c.set(['#4f8a35', '#5f9a3e', '#3f7a2c', '#6aa244'][Math.floor(R() * 4)])); kb++;
      }
    }
    cones.forEach(cm => { cm.count = kp; cm.castShadow = true; }); trunks.count = kp; broadT.count = broadC.count = kb; broadC.castShadow = trunks.castShadow = true;
    scene.add(...cones, trunks, broadT, broadC);
  }
  // riacho a leste + tronco caído
  {
    const pts = []; for (let i = 0; i <= 60; i++) { const z = -60 + i * 2; pts.push(new THREE.Vector3(14 + Math.sin(z * 0.08) * 3 + Math.max(0, (z + 10) * 0.12), 0.06, z)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, 120, 1.1, 6, false); g.scale(1, 0.05, 1);
    const water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x3a7bb0, roughness: 0.15, metalness: 0.1, flatShading: true })); water.position.y = 0.04; scene.add(water);
    add(scene, cyl(0.35, 0.4, 6, 7), '#6b4a2e', -9, 0.35, -8, { rot: [0, 0.6, Math.PI / 2] });
  }

  // ---------------- bandeira + fogueira ----------------
  const flag = new THREE.Group(); flag.position.set(1.4, 0, 1.2); scene.add(flag);
  const flagCloth = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160; const g = cv.getContext('2d');
    g.fillStyle = '#ffd400'; g.fillRect(0, 0, 256, 160); g.fillStyle = '#111'; g.font = '900 27px Montserrat'; g.textAlign = 'center';
    g.fillText('A COMUNIDADE', 128, 66); g.font = '900 44px Montserrat'; g.fillText(`POP. ${script.populacao ?? 1}`, 128, 122);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(1.5, 0.95, 10, 4); geo.translate(0.75, 0, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide })); m.castShadow = true; return m;
  })();
  add(flag, cyl(0.04, 0.05, 3.2, 6, 1.6), '#6b4a2e');
  flagCloth.position.set(0.04, 2.7, 0); flag.add(flagCloth);
  const flagBase = flagCloth.geometry.attributes.position.array.slice();
  const fireGroup = new THREE.Group(); fireGroup.position.copy(FIRE); scene.add(fireGroup);
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; add(fireGroup, ico(0.22, 0), '#6d6a64', Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75); }
  for (let i = 0; i < 4; i++) add(fireGroup, cyl(0.08, 0.08, 1.0, 5), '#4a2e1a', 0, 0.15, 0, { rot: [Math.PI / 2, i * 0.8, 0.3] });
  const flameMap = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const FL = 34, flameGeo = new THREE.BufferGeometry();
  flameGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FL * 3), 3));
  flameGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FL * 3), 3));
  const flames = new THREE.Points(flameGeo, new THREE.PointsMaterial({ size: 0.34, vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, map: flameMap }));
  flames.frustumCulled = false; fireGroup.add(flames);
  // mochila e saco de dormir do fundador (aparecem quando ele monta o acampamento)
  const gear = new THREE.Group(); scene.add(gear);
  add(gear, box(0.35, 0.5, 0.25), '#556b2f', -0.2, 0.25, -1.4, { rot: [0.2, 0.5, 0] });
  add(gear, box(0.8, 0.12, 1.9), '#2e5a8a', -3.6, 0.06, -0.2, { rot: [0, 0.4, 0] });

  // ---------------- planta holográfica da comunidade futura (só madeira, na floresta) ----------------
  ((scene) => { // paliçada de troncos com portão ao sul
    const n = 150;
    for (let i = 0; i < n; i++) { const a = i / n * 6.28, x = Math.sin(a) * 16, z = Math.cos(a) * 16; if (Math.abs(x) < 2 && z > 0) continue; add(scene, cyl(0.17, 0.2, 3.0 + (i % 3) * 0.25, 6, 1.5), '#7a5233', x, 0, z); add(scene, cyl(0.001, 0.17, 0.4, 6, 0.2), '#7a5233', x, 3.0 + (i % 3) * 0.25, z); }
  })(at('palicada'));
  ((scene) => { // torre de vigia
    const T = new THREE.Group(); T.position.set(3.5, 0, 15.2);
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(T, cyl(0.12, 0.14, 6, 5, 3), '#6b4a2e', px, 0, pz);
    add(T, box(2.6, 0.2, 2.6), '#7a5a3a', 0, 6, 0); add(T, cyl(0.1, 2.0, 1.1, 4, 0.55), '#5a3a22', 0, 7.6, 0, { rot: [0, Math.PI / 4, 0] });
    for (const [px, pz] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) add(T, cyl(0.06, 0.06, 1.6, 4, 0.8), '#6b4a2e', px, 6, pz);
    scene.add(T);
  })(at('torre'));
  ((scene) => { // cabanas em A
    for (const [x, z, ry] of [[-9, -6, 0.9], [-4, -11, 0.3], [4, -11, -0.3], [9, -6, -0.9], [-11, 2, 1.5]]) {
      const H = new THREE.Group(); H.position.set(x, 0, z); H.rotation.y = ry;
      for (const sx of [-1, 1]) add(H, box(0.12, 3.2, 3.6), '#8a6a42', sx * 0.95, 1.25, 0, { rot: [0, 0, sx * 0.62] });
      add(H, box(2.6, 2.2, 0.1), '#6b4a2e', 0, 1.0, -1.75, { scale: [0.85, 1, 1] }); scene.add(H);
    }
  })(at('cabanas'));
  ((scene) => { // horta e poço
    for (let row = 0; row < 5; row++) add(scene, box(5, 0.25, 0.8), '#5b4128', 9, 0.12, 4 + row * 1.3);
    for (let i = 0; i < 40; i++) add(scene, ico(0.22, 0), '#4c8a2f', 6.8 + (i % 8) * 0.62, 0.35, 4 + Math.floor(i / 8) * 1.3);
    add(scene, cyl(0.8, 0.8, 0.8, 10, 0.4), '#8f8a80', -6.5, 0, 7); add(scene, box(0.1, 1.6, 0.1), '#6b4a2e', -7.2, 0.8, 7); add(scene, box(0.1, 1.6, 0.1), '#6b4a2e', -5.8, 0.8, 7); add(scene, box(1.6, 0.1, 0.1), '#6b4a2e', -6.5, 1.6, 7);
  })(at('horta'));
  const bpMat = new THREE.MeshBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  futuro.traverse(o => { if (o.isMesh) { o.material = bpMat; o.castShadow = false; o.receiveShadow = false; } });
  futuro.visible = true; // visível até o 1º update (pré-compilação = determinismo)

  // ---------------- pessoas ----------------
  const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
  function randomVisual(seed) {
    const r = rng(seed * 9973 + 17); const fem = r() < 0.5;
    return { height: (fem ? 1.6 : 1.7) + r() * 0.18, build: 0.85 + r() * 0.4, skin: pick(SKINS, r),
      hair: fem ? pick(['longo', 'coque', 'afro', 'trancas', 'rabo', 'curto'], r) : pick(['curto', 'raspado', 'afro', 'moicano'], r),
      hairColor: pick(HAIR_COLORS, r), top: pick(TOPS, r), topColor: pick(CLOTHES, r), top2: pick(CLOTHES, r), pants: pick(PANTS, r), hat: pick(HATS, r), hatColor: pick(CLOTHES, r), beard: !fem && r() < 0.35 };
  }
  // fundador
  const F = script.fundador || {};
  const founder = kit.makePerson({ height: 1.78, build: 1.05, skin: '#c48a5f', hair: 'curto', hairColor: '#2b1a10', top: 'jaqueta', topColor: '#2c3e50', pants: '#4a3b2a', shoes: '#3a2a1a', backpack: '#556b2f', scarf: '#c0392b', beard: true, ...(F.visual || {}) });
  scene.add(founder.root);
  const keyAt = (keys, t) => { if (!keys || !keys.length) return null; let a = keys[0]; for (const k of keys) if (t >= k[0]) a = k; return a; };
  function founderPos(t) {
    const K = F.trajeto || [[0, 0, 0]];
    if (t <= K[0][0]) return [K[0][1], K[0][2], 0];
    for (let i = 1; i < K.length; i++) if (t <= K[i][0]) {
      const u = (t - K[i - 1][0]) / (K[i][0] - K[i - 1][0]);
      const dist = Math.hypot(K[i][1] - K[i - 1][1], K[i][2] - K[i - 1][2]);
      const speed = dist / Math.max(1e-6, K[i][0] - K[i - 1][0]);
      return [lerp(K[i - 1][1], K[i][1], u), lerp(K[i - 1][2], K[i][2], u), dist > 0.05 ? speed : 0]; // 3º valor = velocidade (0 = parado)
    }
    const L = K[K.length - 1]; return [L[1], L[2], 0];
  }
  const people = [];
  for (const c of script.cidadaos || []) {
    const vis = { ...randomVisual(c.seed ?? people.length + 1), ...(c.visual || {}) };
    if (c.vaga) Object.assign(vis, { ghost: true, hat: null, backpack: false });
    const p = kit.makePerson(vis); p.root.position.set(c.pos[0], 0, c.pos[1]); p.root.rotation.y = (c.yaw ?? 0) * DEG; scene.add(p.root);
    people.push({ c, p, ph: R() * 6.28 });
  }
  // zumbis saindo da mata
  const Z = script.zumbis || { n: 0 };
  const zombies = [];
  for (let i = 0; i < (Z.n || 0); i++) {
    const r2 = rng(500 + i);
    const a = lerp(Z.setor?.[0] ?? 0, Z.setor?.[1] ?? 360, (i + r2() * 0.8) / Z.n) * DEG;
    const p = kit.makePerson({ zombie: true, height: 1.6 + r2() * 0.25, build: 0.85 + r2() * 0.3, skin: pick(['#8fa07a', '#9aa88a', '#7f9070', '#a3a58c'], r2), hair: pick(['curto', 'longo', 'raspado', 'afro'], r2), hairColor: pick(['#2a2a22', '#3b3226', '#555048'], r2),
      top: pick(['camiseta', 'manga_longa', 'regata'], r2), topColor: pick(['#5a1f1f', '#3d3b36', '#4a4438', '#2e3a46', '#6b5b45'], r2), pants: pick(['#22252b', '#3a3026', '#2c2c2c'], r2), shoes: '#1a1a1a' });
    scene.add(p.root);
    zombies.push({ p, a, r0: (Z.raioIni ?? 34) + r2() * 6, r1: (Z.raioFim ?? 17) + r2() * 3, t0: (Z.aparece ?? 0) + r2() * 3, sp: (Z.vel ?? 0.7) * (0.75 + r2() * 0.6), ph: r2() * 6.28 });
  }

  // ---------------- update ----------------
  const since = id => t => events.since(id, t);
  const tFlag = since('bandeira'), tFire = since('fogo'), tPOn = since('planta_on'), tPOff = since('planta_off');
  const V = new THREE.Vector3(), HEADP = new THREE.Vector3();
  const labels = [];
  const fpos = t => { const [x, z] = founderPos(t); return [x, groundY(x, z), z]; };

  return {
    tension: t => smooth(44, 56, t) * 0.7,
    labels: () => labels,
    track: (id, t) => fpos(t),
    update(t, { camera: cam }) {
      // ---- tarde -> noite ----
      const u = clamp(t / DUR);
      const elev = lerp(22, -6, smooth(0.15, 0.8, u)) * DEG, az = 220 * DEG;
      sunDir.set(-Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev));
      const dusk = smooth(0.45, 0.8, u);
      skyU.dusk.value = dusk;
      sun.position.copy(sunDir).multiplyScalar(160); sun.target.position.set(0, 0, 0);
      sun.intensity = lerp(3.0, 0, smooth(0.4, 0.78, u)); sun.color.setHSL(0.09 - 0.04 * smooth(0.3, 0.7, u), 0.8, 0.68);
      hemi.intensity = lerp(1.2, 0.5, dusk); hemi.color.setHSL(0.6, 0.45, lerp(0.75, 0.42, dusk));
      moon.intensity = lerp(0, 0.95, smooth(0.6, 0.85, u));
      scene.fog.color.setHSL(lerp(0.4, 0.66, dusk), lerp(0.2, 0.35, dusk), lerp(0.66, 0.12, dusk));
      renderer.toneMappingExposure = lerp(1.0, 1.4, dusk);

      // ---- fundador ----
      const [fx, fz, moving] = founderPos(t), fy = groundY(fx, fz);
      founder.root.position.set(fx, fy, fz);
      const nx = founderPos(t + 0.2);
      let yaw = (keyAt(F.yaws, t)?.[1] ?? 0) * DEG;
      if (moving && Math.hypot(nx[0] - fx, nx[1] - fz) > 1e-4) yaw = Math.atan2(nx[0] - fx, nx[1] - fz);
      founder.root.rotation.y = yaw;
      const act = moving ? 'andar' : (keyAt(F.acoes, t)?.[1] ?? 'parado');
      const q = moving ? ANIM.andar(t, 0.3, moving / 1.45) : (ANIM[act] || ANIM.parado)(t, 0.3); // ~0,72 m por passo
      kit.setPose(founder, q);
      labels.length = 0;
      if (F.nome) { labels.push({ id: 'fundador', pos: [fx, fy + 2.35, fz], text: F.nome, sub: F.funcao, near: 1, far: 70, alpha: F.etiquetaAte ? 1 - smooth(F.etiquetaAte, F.etiquetaAte + 0.6, t) : 1 }); }

      // ---- bandeira sobe ----
      const fk = tFlag(t) > 0 ? smooth(0, 1.6, tFlag(t)) : 0;
      flag.visible = tFlag(t) > -0.6; flagCloth.position.y = lerp(0.55, 2.7, fk); flagCloth.visible = fk > 0.001;
      const fa = flagCloth.geometry.attributes.position;
      for (let i = 0; i < fa.count; i++) { const x0 = flagBase[i * 3]; fa.setZ(i, Math.sin(x0 * 3.2 - t * 5) * 0.12 * x0); }
      fa.needsUpdate = true; flagCloth.geometry.computeVertexNormals();

      // ---- fogueira ----
      const fo = tFire(t) > 0 ? smooth(0, 1.2, tFire(t)) : 0;
      fireGroup.visible = tFire(t) > -1.5; // lenha aparece um pouco antes de acender
      gear.visible = tFire(t) > -6;
      fireLight.position.set(FIRE.x, 1.2, FIRE.z);
      fireLight.intensity = fo * (24 + 4 * Math.sin(t * 13)) * lerp(0.4, 1, dusk);
      flames.visible = fo > 0.01;
      const fp = flameGeo.attributes.position.array, fc = flameGeo.attributes.color.array;
      for (let i = 0; i < FL; i++) { const ph = ((t / 0.9) + i / FL * 3.7) % 1, a = i * 2.39, r = 0.3 * (1 - ph) * fo;
        fp[i * 3] = Math.cos(a) * r + Math.sin(t * 3 + i) * 0.04; fp[i * 3 + 1] = 0.2 + ph * 1.1 * fo; fp[i * 3 + 2] = Math.sin(a) * r;
        fc[i * 3] = 1; fc[i * 3 + 1] = lerp(0.8, 0.25, ph); fc[i * 3 + 2] = lerp(0.3, 0.02, ph); }
      flameGeo.attributes.position.needsUpdate = flameGeo.attributes.color.needsUpdate = true;

      // ---- planta holográfica ----
      const pk = tPOn(t) > 0 ? smooth(0, 2.0, tPOn(t)) * (1 - smooth(0, 1.2, tPOff(t))) : 0;
      futuro.visible = pk > 0.001;
      futuro.scale.y = Math.max(0.001, smooth(0, 1, tPOn(t) / 2.0));
      bpMat.opacity = pk * (0.32 + 0.05 * Math.sin(t * 6));

      // ---- moradores / vagas-fantasma ----
      for (const { c, p, ph } of people) {
        const vis = (c.aparece == null ? 1 : smooth(c.aparece, c.aparece + 1.0, t)) * (c.some == null ? 1 : 1 - smooth(c.some, c.some + 0.8, t));
        p.root.visible = vis > 0.01;
        const qq = (c.vaga ? ANIM.fantasma : (ANIM[c.acao] || ANIM.parado))(t, ph);
        kit.setPose(p, qq);
        if (p.ghostMat) p.ghostMat.opacity = 0.62 * vis;
        if (vis > 0.01) labels.push({ id: c.id, pos: [c.pos[0], 2.3, c.pos[1]], text: c.vaga ? 'VAGA LIVRE' : c.nome, sub: c.funcao, kind: c.vaga ? 'vaga' : '', near: 1, far: c.longe ?? 60, alpha: vis });
      }
      // ---- zumbis: saem da mata e cercam a clareira ----
      for (const z of zombies) {
        const k = t - z.t0;
        z.p.root.visible = k > 0;
        if (k <= 0) continue;
        const r = Math.max(z.r1, z.r0 - k * z.sp);
        const wob = Math.sin(t * 0.4 + z.ph) * 0.12;
        const x = Math.sin(z.a + wob) * r, zz = Math.cos(z.a + wob) * r;
        z.p.root.position.set(x, groundY(x, zz), zz);
        z.p.root.rotation.y = Math.atan2(-x, -zz) + Math.sin(t * 0.8 + z.ph) * 0.2; // olham para o centro
        const qz = ANIM.zumbi(t, z.ph, r > z.r1 + 0.01 ? z.sp / 1.1 : 0.18);
        kit.setPose(z.p, qz);
      }
      void cam; void V; void HEADP;
    },
  };
}
