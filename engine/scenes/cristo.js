// Cena: topo do Corcovado, aos pés do Cristo Redentor, ao entardecer.
// Unidades em metros. Piso do mirante em y = 0; a cidade fica 701 m abaixo.
// O Cristo fica na origem e olha para +Z (para a orla). yaw 0 da câmera = olhando para o Cristo.
//
// Eventos (script.json -> events):
//   sirenes, incendios, explosao, celular_on, celular_off, trem, zumbis_escada,
//   helicoptero, holofote, panico, portao_trancado, portao_cede, apagao
// Mãos em 1ª pessoa: script.json -> hands: [{ start, end, at: [x, y, z] }]

export async function build({ THREE, renderer, scene, camera, script, events, helpers }) {
  const { rng, clamp, lerp, smooth, H: SCREEN_H } = helpers;
  const R = rng(script.seed ?? 1234);
  const since = id => t => events.since(id, t);
  const GROUND = -701;

  // trechos de GLSL comuns (profundidade logarítmica)
  const LOGV = { pars: '\n#include <common>\n#include <logdepthbuf_pars_vertex>\n', main: '\n#include <logdepthbuf_vertex>\n' };
  const LOGF = { pars: '\n#include <logdepthbuf_pars_fragment>\n', main: '\n#include <logdepthbuf_fragment>\n' };

  // =====================================================================
  // GEOGRAFIA (a mesma em JS e no shader do chão)
  // =====================================================================
  const coastZ = x => x < -1600 ? 4030 : x <= 2000 ? 3650 + 380 * ((x - 200) / 1800) ** 2 : 4030 + 0.04 * (x - 2000);
  function isWater(x, z) {
    if (((x + 2300) / 520) ** 2 + ((z - 4950) / 420) ** 2 < 1) return false; // Urca
    if (z > coastZ(x)) return true;                                          // oceano
    if (x < -3000 + 400 * Math.sin(z / 1500) && z > -9000) return true;     // Baía de Guanabara
    if (((x + 2600) / 700) ** 2 + ((z - 3000) / 480) ** 2 < 1) return true; // enseada de Botafogo
    if (((x - 1500) / 950) ** 2 + ((z - 2300) / 600) ** 2 < 1) return true; // Lagoa
    return false;
  }
  const isPark = (x, z) => Math.sin(x / 700 + 1.3) * Math.sin(z / 830 + 0.7) + 0.5 * Math.sin(x / 310 - z / 270) > 1.15;
  function gridAng(x, z) { // cada bairro (célula de 1,6 km) tem sua orientação de ruas
    const cx = Math.floor(x / 1600), cz = Math.floor(z / 1600);
    const a = 0.7 * Math.sin(cx * 12.9898 + cz * 78.233);
    const d = coastZ(x) - z;
    return x > -1700 ? a * smooth(250, 700, d) : a;
  }
  const BLOCK = 110, STREET = 14;

  // morros: { x, z, r, h, kind }
  const HILLS = [
    { x: -2100, z: 5200, r: 260, h: 396, kind: 'pao' },          // Pão de Açúcar
    { x: -2450, z: 4880, r: 280, h: 220, kind: 'mata' },         // Morro da Urca
    { x: 4600, z: 3650, r: 560, h: 533, kind: 'pedra' },         // Dois Irmãos
    { x: 6900, z: 2500, r: 760, h: 844, kind: 'pedra' },         // Pedra da Gávea
    { x: 3900, z: 3050, r: 520, h: 260, kind: 'favela' },        // Rocinha / Vidigal
    { x: 700, z: 3350, r: 330, h: 190, kind: 'favela' },         // Cantagalo / Pavão
    { x: -1150, z: 2150, r: 380, h: 240, kind: 'favela' },       // Dona Marta
    { x: -3700, z: 4250, r: 260, h: 170, kind: 'mata' },
    { x: -1500, z: -6500, r: 3200, h: 1050, kind: 'mata' },      // Maciço da Tijuca (atrás)
    { x: 6000, z: -3200, r: 2200, h: 560, kind: 'mata' },
    { x: -6500, z: -1500, r: 1600, h: 380, kind: 'mata' },
  ];
  function hillY(hh, x, z) {
    const dx = x - hh.x, dz = z - hh.z, d = Math.hypot(dx, dz) / hh.r;
    if (d >= 1) return -Infinity;
    const th = Math.atan2(dz, dx);
    const n = 1 + 0.07 * Math.sin(th * 5 + hh.x) + 0.05 * Math.sin(th * 11 + d * 7);
    const prof = hh.kind === 'pao' ? Math.pow(1 - d, 0.5) : Math.pow(1 - d * d, 0.8);
    return GROUND - 3 + hh.h * prof * n;
  }
  const onHill = (x, z, pad = 1) => HILLS.some(hh => Math.hypot(x - hh.x, z - hh.z) < hh.r * pad);

  // =====================================================================
  // CÉU
  // =====================================================================
  const sunDir = new THREE.Vector3();
  const skyU = { sunDir: { value: sunDir }, dusk: { value: 0 } };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms: skyU,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 sunDir; uniform float dusk;
      void main(){
        float h = vDir.y;
        vec3 zen = mix(vec3(0.09,0.2,0.5), vec3(0.03,0.04,0.14), dusk);
        vec3 mid = mix(vec3(0.5,0.42,0.62), vec3(0.24,0.13,0.3), dusk);
        vec3 hor = mix(vec3(1.0,0.52,0.22), vec3(0.85,0.26,0.12), dusk);
        vec3 col = h > 0.0 ? mix(mid, zen, smoothstep(0.0, 0.55, h)) : mix(mid, vec3(0.2,0.15,0.2), smoothstep(0.0,-0.2,h));
        col = mix(col, hor, (1.0 - smoothstep(0.0, 0.16, abs(h))) * 0.9);
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += vec3(1.0,0.5,0.2) * pow(s, 8.0) * 0.55 * (1.0 - dusk*0.6);
        col += vec3(1.0,0.75,0.45) * pow(s, 60.0) * 0.6 + vec3(1.0,0.85,0.6) * pow(s, 900.0) * 8.0 * (1.0 - dusk*0.5);
        vec3 q = floor(vDir * 420.0); float st = fract(sin(dot(q, vec3(12.9898,78.233,37.719))) * 43758.5453);
        col += vec3(step(0.9985, st)) * smoothstep(0.5, 1.0, dusk) * smoothstep(0.15, 0.4, h) * 0.8; // estrelas
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60000, 48, 24), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  scene.fog = new THREE.FogExp2(0xd9a07e, 0.00005);

  // =====================================================================
  // LUZES
  // =====================================================================
  const sun = new THREE.DirectionalLight(0xffc48a, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 300 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x8fa6d8, 0x4a3a2c, 1.1);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x9fb4ff, 1.1); // preenchimento frio (contra o sol)
  fill.position.set(-40, 25, -30); scene.add(fill);

  // =====================================================================
  // CHÃO DA CIDADE — shader procedural (ruas, quadras, praças, praia, espuma, mar)
  // =====================================================================
  const groundU = {
    uSunDir: { value: sunDir }, uSunCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uGnd: { value: new THREE.Color() },
    uFogCol: { value: new THREE.Color() }, uFogD: { value: 0.00005 }, uNight: { value: 0 }, uOut: { value: 0 }, uTime: { value: 0 },
    uHor: { value: new THREE.Color() }, uZen: { value: new THREE.Color() },
  };
  const groundMat = new THREE.ShaderMaterial({
    uniforms: groundU,
    vertexShader: `${LOGV.pars}
      varying vec3 vW; varying float vDist;
      void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vec4 mv = viewMatrix*w; vDist = -mv.z; gl_Position = projectionMatrix*mv; ${LOGV.main} }`,
    fragmentShader: `${LOGF.pars}
      uniform vec3 uSunDir, uSunCol, uSky, uGnd, uFogCol, uHor, uZen; uniform float uFogD, uNight, uOut, uTime;
      varying vec3 vW; varying float vDist;
      float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float coastZ(float x){ return x < -1600. ? 4030. : (x <= 2000. ? 3650. + 380.*pow((x-200.)/1800., 2.) : 4030. + 0.04*(x-2000.)); }
      bool isWater(vec2 p){
        if (pow((p.x+2300.)/520.,2.) + pow((p.y-4950.)/420.,2.) < 1.) return false;
        if (p.y > coastZ(p.x)) return true;
        if (p.x < -3000. + 400.*sin(p.y/1500.) && p.y > -9000.) return true;
        if (pow((p.x+2600.)/700.,2.) + pow((p.y-3000.)/480.,2.) < 1.) return true;
        if (pow((p.x-1500.)/950.,2.) + pow((p.y-2300.)/600.,2.) < 1.) return true;
        return false;
      }
      float gridAng(vec2 p){ vec2 c = floor(p / 1600.); float a = 0.7*sin(c.x*12.9898 + c.y*78.233); float d = coastZ(p.x) - p.y; return p.x > -1700. ? a*smoothstep(250.,700.,d) : a; }
      void main(){
        ${LOGF.main}
        vec2 p = vW.xz;
        vec3 col; vec3 emis = vec3(0.);
        float fw = max(length(fwidth(p)), 0.001);
        if (isWater(p)) {
          vec3 N = normalize(vec3(0.04*sin(p.x*0.05 + uTime*0.9) + 0.03*sin(p.y*0.08 - uTime*1.3), 1.0, 0.04*cos(p.y*0.06 + uTime*0.7)));
          vec3 V = normalize(cameraPosition - vW);
          vec3 Rf = reflect(-V, N);
          float fres = 0.03 + 0.97*pow(1. - max(dot(N, V), 0.), 5.);
          vec3 skyC = mix(uHor, uZen, smoothstep(0.0, 0.5, Rf.y));
          col = mix(vec3(0.012, 0.04, 0.07) * (uSky + uGnd), skyC * 0.55, min(fres, 0.55));
          col += uSunCol * pow(max(dot(Rf, uSunDir), 0.), 220.) * 6.;
          float dz = p.y - coastZ(p.x);
          if (p.x > -1700. && dz < 25.) { float f = smoothstep(25., 4., dz + 6.*sin(p.x*0.02 + uTime*1.5)); col = mix(col, vec3(0.85,0.85,0.8)*(uSky*0.6+uSunCol*0.3), f*0.8); }
        } else {
          float d = coastZ(p.x) - p.y;
          bool beach = p.x > -1700. && d < 75.;
          float a = gridAng(p);
          vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
          vec2 cell = floor(q / ${BLOCK}.);
          vec2 g = abs(fract(q / ${BLOCK}.) - 0.5) * ${BLOCK}.;
          float avn = (mod(cell.x, 4.) == 0. || mod(cell.y, 5.) == 0.) ? 1.0 : 0.0;
          float half_ = ${BLOCK}. * 0.5 - (${STREET}. + 10.*avn) * 0.5;
          float aa = fw * 1.2;
          float street = max(smoothstep(half_ - aa, half_ + aa, g.x), smoothstep(half_ - aa, half_ + aa, g.y));
          float park = step(1.15, sin(p.x/700.+1.3)*sin(p.y/830.+0.7) + 0.5*sin(p.x/310. - p.y/270.));
          float h = hash(cell + 7.);
          vec3 blockC = mix(vec3(0.46,0.44,0.41), vec3(0.62,0.58,0.52), h);
          blockC = mix(blockC, vec3(0.55,0.36,0.28), step(0.82, h) * 0.6);
          blockC = mix(blockC, vec3(0.16,0.27,0.13) + 0.06*hash(floor(p/14.)), park);
          vec3 asphalt = vec3(0.17, 0.17, 0.18);
          col = mix(blockC, asphalt, street * (1. - park*0.7));
          bool orla = p.x > -1700. && d < 115. && d >= 75.;
          if (orla) { col = asphalt; street = 1.; }
          if (beach) { col = vec3(0.86, 0.78, 0.6); street = 0.; }
          col *= 0.9 + 0.2*hash(floor(p/9.));
          col = col / 3.14159 * (uSunCol * max(uSunDir.y, 0.05) * 2.2 + uSky * 1.2);
          float sector = hash(floor(p / 1400.) + 3.);
          float lit = uNight * step(uOut, sector);
          float lamp = street * (0.55 + 0.45 * smoothstep(0.7, 1.0, fract(dot(q, vec2(1.,1.)) / 45.)));
          emis += vec3(1.0, 0.55, 0.2) * lamp * lit * 0.9;
          emis += vec3(1.0, 0.8, 0.5) * (1.-street) * (1.-park) * step(0.93, hash(floor(p/18.))) * lit * 0.5;
          if (orla) emis += vec3(1.,0.85,0.6) * lit * 1.3;
        }
        col += emis;
        float f = 1.0 - exp(-pow(vDist*uFogD, 2.));
        col = mix(col, uFogCol, f);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120000, 120000), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND; ground.renderOrder = -5;
  scene.add(ground);

  // =====================================================================
  // MORRO DO CORCOVADO
  // =====================================================================
  const ridgeW = th => Math.exp(-Math.pow(Math.atan2(Math.sin(th), Math.cos(th)), 2) / 0.06); // crista em +X
  function terrainY(x, z) {
    const r = Math.hypot(x, z), th = Math.atan2(z, x);
    const n = Math.sin(th * 7 + r * 0.004) * 0.5 + Math.sin(th * 13 - r * 0.009) * 0.3 + Math.sin(r * 0.02 + th * 3) * 0.2;
    const cliff = -0.8 - 700 * (1 - Math.exp(-Math.max(0, r - 24) / (230 + 60 * n)));
    const ridge = -0.8 - 700 * (1 - Math.exp(-Math.max(0, r - 18) * 0.55 / 700));
    let y = lerp(cliff, ridge, ridgeW(th)) + n * Math.min(40, r * 0.04) * smooth(30, 70, r);
    if (x > 16) { // corredor da escada: o morro nunca fica acima dos degraus/trilha
      const path = x < 38 ? -0.5 - (x - 17) * 0.543 : ridge - 0.3;
      y = Math.min(y, lerp(path - 0.4, y, smooth(4, 16, Math.abs(z - 7.5))));
    }
    y = Math.max(-700, y);
    return lerp(y, GROUND - 8, smooth(1250, 1700, r)); // afunda sob a cidade na base
  }
  {
    const rings = 120, segs = 180, rMax = 1750;
    const pos = [], col = [], idx = [];
    const cRock = new THREE.Color(0x77726a), cRock2 = new THREE.Color(0x56524c), cF1 = new THREE.Color(0x1f3a1b), cF2 = new THREE.Color(0x335a27), cBase = new THREE.Color(0x3c4a30);
    const tmp = new THREE.Color();
    for (let i = 0; i <= rings; i++) {
      const r = i === 0 ? 0 : 10 * Math.pow(rMax / 10, (i - 1) / (rings - 1));
      for (let j = 0; j < segs; j++) {
        const th = (j / segs) * Math.PI * 2;
        const x = Math.cos(th) * r, z = Math.sin(th) * r, y = terrainY(x, z);
        pos.push(x, y, z);
        const yIn = terrainY(Math.cos(th) * (r + 6), Math.sin(th) * (r + 6));
        const steep = clamp((y - yIn) / 6 / 2.2);
        const v = 0.5 + 0.5 * Math.sin(x * 0.05) * Math.cos(z * 0.043);
        tmp.copy(cF1).lerp(cF2, v);
        tmp.lerp(v > 0.5 ? cRock : cRock2, Math.max(steep * (r < 400 ? 1 : 0.35), 1 - ridgeW(th) > 0.5 && r < 70 ? 0.85 : 0));
        tmp.lerp(cBase, smooth(900, 1300, r));
        col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = i * segs + j, b = i * segs + (j + 1) % segs, c = (i + 1) * segs + j, d = (i + 1) * segs + (j + 1) % segs;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true; scene.add(m);
  }
  function forest(n, place) {
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    let k = 0, guard = 0;
    while (k < n && guard++ < n * 20) {
      const r = place(); if (!r) continue;
      const [x, y, z, sc] = r;
      p.set(x, y + sc * 0.5, z); s.set(sc, sc * (0.75 + R() * 0.4), sc); q.setFromAxisAngle(up, R() * 6.28);
      M.compose(p, q, s); im.setMatrixAt(k, M);
      c.setHSL(0.25 + R() * 0.08, 0.45, 0.1 + R() * 0.1); im.setColorAt(k, c); k++;
    }
    im.count = k; scene.add(im); return im;
  }
  forest(6500, () => {
    const r = 45 + Math.pow(R(), 1.5) * 1250, th = R() * Math.PI * 2;
    if (ridgeW(th) > 0.4 && r < 160) return null;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    return [x, terrainY(x, z), z, (4 + R() * 5) * (1 + r / 600)];
  });

  // =====================================================================
  // MORROS + FAVELAS
  // =====================================================================
  const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const hh of HILLS) {
    const rings = 28, segs = 64, pos = [], col = [], idx = [];
    const c = new THREE.Color();
    for (let i = 0; i <= rings; i++) for (let j = 0; j < segs; j++) {
      const d = Math.min(i / rings, 0.999), th = j / segs * Math.PI * 2;
      const x = hh.x + Math.cos(th) * d * hh.r, z = hh.z + Math.sin(th) * d * hh.r;
      const y = i === rings ? GROUND - 6 : hillY(hh, x, z);
      pos.push(x, y, z);
      const v = 0.5 + 0.5 * Math.sin(th * 7 + d * 9);
      if (hh.kind === 'pao' || (hh.kind === 'pedra' && d < 0.55)) c.setRGB(0.36 + v * 0.08, 0.34 + v * 0.07, 0.31 + v * 0.06);
      else c.setRGB(0.12 + v * 0.06, 0.2 + v * 0.08, 0.1 + v * 0.04);
      col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = i * segs + j, b = i * segs + (j + 1) % segs, cc = (i + 1) * segs + j, d = (i + 1) * segs + (j + 1) % segs;
      idx.push(a, b, cc, b, d, cc);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, rockMat));
  }
  const windowPts = [];
  {
    const N = 2600;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const pal = [0xb5532e, 0xc96a3a, 0xd9c7a3, 0x8fb4c9, 0xe0a35a, 0xc94f5a, 0xe8e2d0, 0x9a6b4a, 0x7fa36a];
    const fav = HILLS.filter(h => h.kind === 'favela');
    for (let k = 0; k < N; k++) {
      const hh = fav[k % fav.length];
      const toC = Math.atan2(-hh.z, -hh.x); // lado virado para o Corcovado (visível do mirante)
      const th = toC + (R() - 0.5) * 2.6, d = 0.2 + R() * 0.72;
      const x = hh.x + Math.cos(th) * d * hh.r, z = hh.z + Math.sin(th) * d * hh.r;
      const y = hillY(hh, x, z);
      const w = 5 + R() * 5, h = 3 + R() * 7;
      p.set(x, y - 1, z); s.set(w, h, w * (0.7 + R() * 0.5)); q.setFromAxisAngle(up, R() * 0.6);
      M.compose(p, q, s); im.setMatrixAt(k, M); im.setColorAt(k, c.set(pal[Math.floor(R() * pal.length)]));
      if (R() < 0.5) windowPts.push([x + (R() - 0.5) * w, y + h * R(), z + (R() - 0.5) * w]);
    }
    scene.add(im);
  }

  // =====================================================================
  // CIDADE — prédios alinhados às quadras
  // =====================================================================
  const cityPts = [];
  {
    const N = 10000;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    {
      const pa = geo.attributes.position, nm = geo.attributes.normal, cols = [];
      for (let i = 0; i < pa.count; i++) { const v = nm.getY(i) > 0.5 ? 0.55 : 0.75 + 0.25 * pa.getY(i); cols.push(v, v, v); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    }
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), N);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    let k = 0, guard = 0;
    while (k < N && guard++ < 400000) {
      let x, z;
      if (k < 1800) { x = -1600 + R() * 6200; z = coastZ(x) - 120 - R() * 380; } // orla: Leme, Copacabana, Ipanema, Leblon
      else { const r = 1350 + Math.pow(R(), 1.25) * 9000, th = R() * Math.PI * 2; x = Math.cos(th) * r; z = Math.sin(th) * r; }
      const a = gridAng(x, z), ca = Math.cos(a), sa = Math.sin(a);
      let qx = ca * x + sa * z, qz = -sa * x + ca * z;
      const lim = BLOCK / 2 - STREET / 2 - 6;
      qx = (Math.floor(qx / BLOCK) + 0.5) * BLOCK + (R() - 0.5) * 2 * lim * 0.7;
      qz = (Math.floor(qz / BLOCK) + 0.5) * BLOCK + (R() - 0.5) * 2 * lim * 0.7;
      x = ca * qx - sa * qz; z = sa * qx + ca * qz;
      const d = coastZ(x) - z;
      if (isWater(x, z) || isPark(x, z) || onHill(x, z, 1.02) || Math.hypot(x, z) < 1300 || (x > -1700 && d < 118)) continue;
      const orla = x > -1700 && d < 520, centro = x < -1500 && z < 2600;
      let h = orla ? 28 + R() * 30 : centro ? 15 + Math.pow(R(), 2.5) * 110 : 6 + Math.pow(R(), 2.2) * 38;
      h *= 1 - 0.5 * smooth(5000, 11000, Math.hypot(x, z));
      const w = 16 + R() * 18, dd = 16 + R() * 18;
      p.set(x, GROUND, z); s.set(w, h, dd); q.setFromAxisAngle(up, -a);
      M.compose(p, q, s); im.setMatrixAt(k, M);
      const l = 0.62 + R() * 0.3, tint = R();
      if (tint < 0.12) c.setRGB(l * 0.95, l * 0.85, l * 0.7); else if (tint < 0.2) c.setRGB(l * 0.8, l * 0.86, l * 0.9); else c.setRGB(l, l * 0.97, l * 0.92);
      im.setColorAt(k, c);
      cityPts.push([x, GROUND + h, z, h]);
      for (let wv = 0, nw = Math.min(6, 1 + Math.floor(h / 12)); wv < nw; wv++) {
        const sd = Math.floor(R() * 4), ox = sd < 2 ? (sd ? 1 : -1) * w / 2 : (R() - 0.5) * w, oz = sd >= 2 ? (sd === 2 ? 1 : -1) * dd / 2 : (R() - 0.5) * dd;
        windowPts.push([x + ca * ox - sa * oz, GROUND + 3 + R() * (h - 3), z + sa * ox + ca * oz]);
      }
      k++;
    }
    im.count = k; scene.add(im);
  }
  const lightsN = windowPts.length;
  const lightsGeo = new THREE.BufferGeometry();
  const lp = new Float32Array(lightsN * 3), lc = new Float32Array(lightsN * 3), lPhase = new Float32Array(lightsN), lSector = new Float32Array(lightsN);
  windowPts.forEach((w, i) => { lp.set(w, i * 3); lPhase[i] = R(); lSector[i] = R(); });
  lightsGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  lightsGeo.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  const cityLights = new THREE.Points(lightsGeo, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  cityLights.frustumCulled = false; scene.add(cityLights);

  // =====================================================================
  // PARTÍCULAS COM TAMANHO EM METROS (fogo, fumaça, nuvens, sirenes)
  // =====================================================================
  const puffMat = (additive, fogK = 0.85) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uScale: { value: 1 }, fogCol: { value: new THREE.Color(0xd9a07e) }, fogD: { value: 0.00005 } },
    vertexShader: `${LOGV.pars}
      attribute float size; attribute float alpha; attribute vec3 color; uniform float uScale; uniform float fogD;
      varying float vA; varying vec3 vC; varying float vF;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv;
        gl_PointSize = clamp(size*uScale/-mv.z, 0.0, 1024.0); vA = alpha; vC = color;
        float d = -mv.z; vF = 1.0 - exp(-d*d*fogD*fogD); ${LOGV.main} }`,
    fragmentShader: `${LOGF.pars}
      varying float vA; varying vec3 vC; varying float vF; uniform vec3 fogCol;
      void main(){ ${LOGF.main} vec2 q = gl_PointCoord-0.5; float d = length(q)*2.0; float a = smoothstep(1.0,0.0,d); a*=a;
        vec3 c = mix(vC, fogCol, vF*${fogK.toFixed(2)}); gl_FragColor = vec4(c, a*vA*${additive ? '(1.0-vF*0.6)' : '1.0'}); }`,
  });
  const mkPts = (n, additive, fogK) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const p = new THREE.Points(g, puffMat(additive, fogK)); p.frustumCulled = false; scene.add(p); return p;
  };
  const dirty = pts => { for (const a of ['position', 'size', 'alpha', 'color']) pts.geometry.attributes[a].needsUpdate = true; };

  const CLOUDS = 60;
  const clouds = mkPts(CLOUDS, false, 0.6);
  const cloudData = [];
  for (let i = 0; i < CLOUDS; i++) {
    const r = 600 + R() * 2200, th = R() * Math.PI * 2;
    cloudData.push({ x: Math.cos(th) * r, z: Math.sin(th) * r, y: -420 + R() * 200, s: 250 + R() * 450, a: 0.08 + R() * 0.14, v: 1.5 + R() * 2 });
  }

  const FIRES = 20, PUFFS = 46;
  const fires = [];
  {
    let g = 0;
    while (fires.length < FIRES && g++ < 8000) {
      const b = cityPts[Math.floor(R() * cityPts.length)];
      const d = Math.hypot(b[0], b[2]);
      if (d < 1800 || d > 7000) continue;
      if (Math.abs(Math.atan2(b[0], b[2]) * 180 / Math.PI) > 75) continue;
      const i = fires.length;
      fires.push({ x: b[0], y: b[1], z: b[2], t0: i < 3 ? i * 1.2 : 3 + i * 1.5, big: 0.7 + R() * 0.8, wind: 0.6 + R() * 0.5, kind: 'fogo' });
    }
    const ex = cityPts.find(b => b[2] > 3200 && b[2] < 3700 && Math.abs(b[0] - 600) < 500) || cityPts[0];
    fires.push({ x: ex[0], y: ex[1], z: ex[2], t0: events.at('explosao') - events.at('incendios'), big: 2.2, wind: 0.9, kind: 'explosao' });
  }
  const NF = fires.length;
  const smoke = mkPts(NF * PUFFS, false), glow = mkPts(NF * 3, true);
  const SIR = 50;
  const sirens = mkPts(SIR, true);
  const sirenPos = [];
  for (let i = 0; i < SIR; i++) { const b = cityPts[Math.floor(R() * cityPts.length)]; sirenPos.push([b[0] + 12, GROUND + 2, b[2] + 12, R()]); }

  // =====================================================================
  // MIRANTE
  // =====================================================================
  const floorTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
    const g = cv.getContext('2d'); const r2 = rng(77);
    g.fillStyle = '#7b766d'; g.fillRect(0, 0, 1024, 1024);
    const T = 128; // placas de granito (1 m)
    for (let y = 0; y < 1024; y += T) for (let x = 0; x < 1024; x += T) {
      const l = 168 + r2() * 26; g.fillStyle = `rgb(${l},${l - 4},${l - 12})`; g.fillRect(x + 3, y + 3, T - 6, T - 6);
      g.globalAlpha = 0.25; for (let i = 0; i < 120; i++) { const v = r2() < 0.5 ? 70 : 230; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + 3 + r2() * (T - 8), y + 3 + r2() * (T - 8), 2, 2); } g.globalAlpha = 1;
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(34 / 8, 43 / 8); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  })();
  const X0 = -17, X1 = 17, Z0 = -14, Z1 = 29;
  const side = new THREE.MeshLambertMaterial({ color: 0x8d877b });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 1.2, Z1 - Z0), [side, side, new THREE.MeshLambertMaterial({ map: floorTex }), side, side, side]);
  floor.position.set(0, -0.6, (Z0 + Z1) / 2); floor.receiveShadow = true; scene.add(floor);
  { // faixa de pedra portuguesa em ondas ao redor do pedestal
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128; const g = cv.getContext('2d');
    g.fillStyle = '#e4ddcf'; g.fillRect(0, 0, 1024, 128); g.fillStyle = '#2a2724';
    g.beginPath(); g.moveTo(0, 64); for (let x = 0; x <= 1024; x += 8) g.lineTo(x, 64 + Math.sin(x / 1024 * Math.PI * 8) * 34); g.lineTo(1024, 128); g.lineTo(0, 128); g.fill();
    const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    const ring = new THREE.Mesh(new THREE.RingGeometry(7.6, 9.4, 96, 1), new THREE.MeshLambertMaterial({ map: t }));
    const uv = ring.geometry.attributes.uv, pa = ring.geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) { const x = pa.getX(i), y = pa.getY(i); uv.setXY(i, (Math.atan2(y, x) / Math.PI + 1) * 6, (Math.hypot(x, y) - 7.6) / 1.8); }
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; ring.receiveShadow = true; scene.add(ring);
  }
  const railMat = new THREE.MeshLambertMaterial({ color: 0xe9e4d8 });
  const GATE_Z0 = 4.5, GATE_Z1 = 10.5;
  function railLine(ax, az, bx, bz, skip) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 0.45);
    const post = new THREE.CylinderGeometry(0.06, 0.08, 0.95, 6); post.translate(0, 0.475, 0);
    const im = new THREE.InstancedMesh(post, railMat, n + 1); let k = 0; const M = new THREE.Matrix4();
    for (let i = 0; i <= n; i++) { const x = lerp(ax, bx, i / n), z = lerp(az, bz, i / n); if (skip && skip(x, z)) continue; M.makeTranslation(x, 0, z); im.setMatrixAt(k++, M); }
    im.count = k; im.castShadow = true; scene.add(im);
    const top = (x0, z0, x1, z1) => { const b = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.25, 0.14, Math.abs(z1 - z0) + 0.25), railMat); b.position.set((x0 + x1) / 2, 1.0, (z0 + z1) / 2); b.castShadow = true; scene.add(b); };
    if (skip && ax === bx) { top(ax, az, bx, GATE_Z0); top(ax, GATE_Z1, bx, bz); } else top(ax, az, bx, bz);
  }
  railLine(X0, Z1, X1, Z1); railLine(X0, Z0, X0, Z1); railLine(X0, Z0, X1, Z0);
  railLine(X1, Z0, X1, Z1, (x, z) => z > GATE_Z0 - 0.1 && z < GATE_Z1 + 0.1);
  const lampGlow = [];
  for (const [x, z] of [[-14, 26], [14, 26], [-14, 12], [14, 15], [-14, -2], [14, -2], [-8, -12], [8, -12]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.6, 8), new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
    pole.position.set(x, 1.8, z); pole.castShadow = true; scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0x332211 }));
    bulb.position.set(x, 3.7, z); scene.add(bulb); lampGlow.push(bulb);
  }
  { // bancos, binóculos de moeda e um quiosque
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2e }), metal = new THREE.MeshLambertMaterial({ color: 0x2f3a40 });
    for (const [x, z, ry] of [[-11, 20, 0], [11, 20, 0], [-12, 6, Math.PI / 2], [-12, -6, Math.PI / 2], [11.5, -6, Math.PI / 2]]) {
      const b = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.5), wood); seat.position.y = 0.45; b.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.45, 0.06), wood); back.position.set(0, 0.75, -0.24); b.add(back);
      for (const sx of [-0.85, 0.85]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.45), metal); l.position.set(sx, 0.22, 0); b.add(l); }
      b.position.set(x, 0, z); b.rotation.y = ry; b.traverse(o => { o.castShadow = true; }); scene.add(b);
    }
    for (const x of [-5.5, 5.5]) {
      const g = new THREE.Group();
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.15, 8), metal); ped.position.y = 0.58; g.add(ped);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.5), new THREE.MeshLambertMaterial({ color: 0xd8b020 })); head.position.y = 1.28; g.add(head);
      for (const sx of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10), metal); e.rotation.x = Math.PI / 2; e.position.set(sx, 1.3, -0.28); g.add(e); }
      g.position.set(x, 0, 28.1); g.rotation.y = Math.PI; g.traverse(o => { o.castShadow = true; }); scene.add(g);
    }
    const kiosk = new THREE.Group();
    const kb = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2), new THREE.MeshLambertMaterial({ color: 0xf2efe6 })); kb.position.y = 1.2; kiosk.add(kb);
    const aw = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.2), new THREE.MeshLambertMaterial({ color: 0x1b7f3a })); aw.position.set(0, 2.3, 1.4); aw.rotation.x = 0.25; kiosk.add(aw);
    kiosk.position.set(-13.5, 0, -10); kiosk.rotation.y = Math.PI / 2; kiosk.traverse(o => { o.castShadow = true; o.receiveShadow = true; }); scene.add(kiosk);
  }

  // =====================================================================
  // ESCADARIA + PORTÃO
  // =====================================================================
  const STEP_RUN = 0.35, STEP_RISE = 0.19, STEPS = 60, SX0 = X1;
  const stairY = x => x <= SX0 ? 0 : x <= SX0 + STEPS * STEP_RUN ? -Math.ceil((x - SX0) / STEP_RUN) * STEP_RISE : terrainY(x, 7.5);
  {
    const stepMat = new THREE.MeshLambertMaterial({ color: 0xb9b2a4 });
    const g = new THREE.BoxGeometry(STEP_RUN, 2, GATE_Z1 - GATE_Z0); g.translate(0, -1, 0);
    { const nm = g.attributes.normal, cols = []; for (let i = 0; i < nm.count; i++) { const v = nm.getY(i) > 0.5 ? 1 : 0.55; cols.push(v, v, v); } g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); }
    stepMat.vertexColors = true;
    const im = new THREE.InstancedMesh(g, stepMat, STEPS); const M = new THREE.Matrix4();
    const sc = new THREE.Color();
    for (let i = 0; i < STEPS; i++) { M.makeTranslation(SX0 + (i + 0.5) * STEP_RUN, -(i + 1) * STEP_RISE, (GATE_Z0 + GATE_Z1) / 2); im.setMatrixAt(i, M); im.setColorAt(i, sc.setScalar(i % 2 ? 0.78 : 1.0)); }
    im.receiveShadow = true; im.castShadow = true; scene.add(im);
    for (const z of [GATE_Z0 - 0.15, GATE_Z1 + 0.15]) {
      const L = STEPS * STEP_RUN, ang = Math.atan2(STEPS * STEP_RISE, L);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(L, STEPS * STEP_RISE), 0.12, 0.12), railMat);
      rail.position.set(SX0 + L / 2, -STEPS * STEP_RISE / 2 + 0.9, z); rail.rotation.z = -ang; scene.add(rail);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(L, STEPS * STEP_RISE), 1.2, 0.3), stepMat);
      wall.position.set(SX0 + L / 2, -STEPS * STEP_RISE / 2 - 0.2, z + (z < 7 ? -0.15 : 0.15)); wall.rotation.z = -ang; scene.add(wall);
    }
    const pg = new THREE.BufferGeometry(); const pp = [], pi = [];
    let i = 0;
    for (let x = SX0 + STEPS * STEP_RUN; x < 420; x += 4, i++) { const y = terrainY(x, 7.5) + 0.15; pp.push(x, y, GATE_Z0 - 1, x, y, GATE_Z1 + 1); if (i) { const a = (i - 1) * 2; pi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); pg.setIndex(pi); pg.computeVertexNormals();
    const path = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: 0x8a8274, side: THREE.DoubleSide })); path.receiveShadow = true; scene.add(path);
  }
  const gate = new THREE.Group();
  const gateBars = [];
  {
    const barMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
    const W = GATE_Z1 - GATE_Z0;
    for (let i = 0; i <= 24; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.1, 0.04), barMat); b.position.set(0, 1.05, (i / 24) * W); b.castShadow = true; gate.add(b); gateBars.push(b); }
    for (const y of [0.15, 1.0, 2.05]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, W), barMat); b.position.set(0, y, W / 2); gate.add(b); }
    gate.position.set(SX0 + 0.05, 0, GATE_Z0); scene.add(gate);
    for (const z of [GATE_Z0 - 0.2, GATE_Z1 + 0.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.4, 0.35), railMat); p.position.set(SX0, 1.2, z); p.castShadow = true; scene.add(p); }
  }

  // =====================================================================
  // O CRISTO REDENTOR (pedestal 8 m + estátua 30 m, braços 28 m)
  // =====================================================================
  const soapTex = (() => { // mosaico de pedra-sabão (triângulos)
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); const r2 = rng(5);
    g.fillStyle = '#b9bcb2'; g.fillRect(0, 0, 256, 256);
    const s = 16;
    for (let y = 0; y < 256; y += s) for (let x = 0; x < 256; x += s) for (const tri of [0, 1]) {
      const l = 196 + r2() * 30; g.fillStyle = `rgb(${l},${l + 2},${l - 6})`; g.beginPath();
      if (tri) { g.moveTo(x + 1, y + 1); g.lineTo(x + s - 1, y + 1); g.lineTo(x + 1, y + s - 1); } else { g.moveTo(x + s - 1, y + 2); g.lineTo(x + s - 1, y + s - 1); g.lineTo(x + 2, y + s - 1); }
      g.fill();
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 26); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const stone = new THREE.MeshStandardMaterial({ color: 0xffffff, map: soapTex, roughness: 0.85, metalness: 0 });
  const stoneB = new THREE.MeshStandardMaterial({ color: 0xd5d6cc, roughness: 0.85 });
  const statue = new THREE.Group(); scene.add(statue);
  {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(9.5, 8, 9.5), new THREE.MeshStandardMaterial({ color: 0xb4b0a4, roughness: 0.95 }));
    ped.position.y = 4; ped.castShadow = ped.receiveShadow = true; statue.add(ped);
    const base = new THREE.Mesh(new THREE.BoxGeometry(14, 0.9, 14), new THREE.MeshLambertMaterial({ color: 0xa29d91 })); base.position.y = 0.45; base.receiveShadow = base.castShadow = true; statue.add(base);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.6, 10.2), new THREE.MeshLambertMaterial({ color: 0xa8a397 })); cap.position.y = 8; cap.castShadow = true; statue.add(cap);
    for (const [px, pz] of [[-4.75, 4.75], [4.75, 4.75], [-4.75, -4.75], [4.75, -4.75]]) { const pil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8, 0.7), new THREE.MeshLambertMaterial({ color: 0xa8a397 })); pil.position.set(px, 4, pz); statue.add(pil); }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 0.12), new THREE.MeshLambertMaterial({ color: 0x3b2a1e }));
    door.position.set(2.2, 2.05, 4.78); statue.add(door);
    const doorLamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb35a }));
    doorLamp.position.set(2.2, 3.45, 4.85); statue.add(doorLamp);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ color: 0xc8a020 })); sign.position.set(2.2, 3.15, 4.86); statue.add(sign);
    const prof = [[3.3, 0], [3.5, 0.4], [3.1, 2], [2.9, 6], [2.75, 10], [2.7, 14], [2.85, 18], [2.9, 20.5], [2.5, 21.6], [1.5, 22.3], [0.8, 22.6], [0.01, 22.7]];
    const lg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 72);
    const pa = lg.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const th = Math.atan2(z, x);
      const fold = 1 + 0.05 * Math.sin(th * 11 + y * 0.15) * clamp(1 - y / 22) + (Math.abs(Math.cos(th)) > 0.6 ? 0.02 : 0);
      pa.setXYZ(i, x * 1.32 * fold, y, z * 0.82 * fold);
    }
    lg.computeVertexNormals();
    const robe = new THREE.Mesh(lg, stone); robe.position.y = 8.3; robe.castShadow = robe.receiveShadow = true; statue.add(robe);
    const SH = 8.3 + 21.3;
    for (const sgn of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(12.6, 1.5, 1.6), stoneB); arm.position.set(sgn * 7.9, SH, 0.1); arm.castShadow = true; statue.add(arm);
      const sg = new THREE.BoxGeometry(11.5, 3.2, 1.3, 12, 1, 1); const sp = sg.attributes.position;
      for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i); const u = (x + 5.75) / 11.5; const nx = sgn > 0 ? u : 1 - u; if (y < 0) sp.setY(i, -1.6 - 1.6 * (1 - nx) + 1.2 * nx); }
      sg.computeVertexNormals();
      const sleeve = new THREE.Mesh(sg, stoneB); sleeve.position.set(sgn * 7.6, SH - 1.4, 0.15); sleeve.castShadow = true; statue.add(sleeve);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 1.0), stoneB); hand.position.set(sgn * 14.3, SH - 0.2, 0.2); hand.castShadow = true; statue.add(hand);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 1.6, 16), stoneB); neck.position.y = 8.3 + 23.1; statue.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.55, 28, 20), stoneB); head.scale.set(0.95, 1.25, 1.0); head.position.set(0, 8.3 + 25.2, 0.2); head.castShadow = true; statue.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(1.7, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), stoneB); hair.position.set(0, 8.3 + 25.6, -0.15); hair.scale.set(1, 1.15, 1.05); statue.add(hair);
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), stoneB); heart.position.set(0.9, 8.3 + 18.6, 2.35); heart.scale.set(1, 1, 0.4); statue.add(heart);
  }

  // =====================================================================
  // PESSOAS (partes instanciadas)
  // =====================================================================
  function makeCrowd(n, palette) {
    const parts = {
      torso: (() => { const g = new THREE.BoxGeometry(0.42, 0.62, 0.24); g.translate(0, 0.31, 0); return g; })(),
      head: (() => { const g = new THREE.SphereGeometry(0.125, 10, 8); g.translate(0, 0.14, 0); return g; })(),
      hair: (() => { const g = new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55); g.translate(0, 0.16, -0.01); return g; })(),
      arm: (() => { const g = new THREE.BoxGeometry(0.11, 0.68, 0.11); g.translate(0, -0.34, 0); return g; })(),
      leg: (() => { const g = new THREE.BoxGeometry(0.15, 0.88, 0.17); g.translate(0, -0.44, 0); return g; })(),
    };
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mk = (g, count) => { const m = new THREE.InstancedMesh(g, mat, count); m.castShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
    const crowd = { torso: mk(parts.torso, n), head: mk(parts.head, n), hair: mk(parts.hair, n), arms: mk(parts.arm, n * 2), legs: mk(parts.leg, n * 2), n };
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p = palette(i);
      crowd.torso.setColorAt(i, c.set(p.shirt)); crowd.head.setColorAt(i, c.set(p.skin)); crowd.hair.setColorAt(i, c.set(p.hair));
      crowd.arms.setColorAt(i * 2, c.set(p.arm || p.skin)); crowd.arms.setColorAt(i * 2 + 1, c.set(p.arm || p.skin));
      crowd.legs.setColorAt(i * 2, c.set(p.pants)); crowd.legs.setColorAt(i * 2 + 1, c.set(p.pants));
    }
    return crowd;
  }
  const M0 = new THREE.Matrix4(), MT = new THREE.Matrix4(), MP = new THREE.Matrix4(), TMP = new THREE.Matrix4();
  const HID = new THREE.Matrix4().makeScale(0, 0, 0);
  function setPose(cr, i, p) {
    if (!p) { for (const k of ['torso', 'head', 'hair']) cr[k].setMatrixAt(i, HID); for (const k of [0, 1]) { cr.arms.setMatrixAt(i * 2 + k, HID); cr.legs.setMatrixAt(i * 2 + k, HID); } return; }
    const s = p.scale || 1;
    M0.makeRotationY(p.yaw).setPosition(p.x, p.y, p.z); if (s !== 1) M0.multiply(TMP.makeScale(s, s, s));
    const sw = Math.sin(p.phase) * p.walk;
    for (const k of [0, 1]) {
      const sg = k ? 1 : -1, amp = p.legAmp ? p.legAmp[k] : 0.55;
      MP.copy(M0).multiply(TMP.makeTranslation(sg * 0.1, 0.9, 0)).multiply(TMP.makeRotationX(sw * amp * sg + (p.legBase || 0)));
      cr.legs.setMatrixAt(i * 2 + k, MP);
    }
    MT.copy(M0).multiply(TMP.makeTranslation(0, 0.88 + Math.abs(Math.cos(p.phase)) * 0.04 * p.walk + (p.dy || 0), 0))
      .multiply(TMP.makeRotationX(p.lean || 0)).multiply(TMP.makeRotationZ(p.sway || 0));
    cr.torso.setMatrixAt(i, MT);
    MP.copy(MT).multiply(TMP.makeTranslation(0, 0.62, 0.0)).multiply(TMP.makeRotationX(p.headTilt || 0)).multiply(TMP.makeRotationZ(p.headRoll || 0));
    cr.head.setMatrixAt(i, MP); cr.hair.setMatrixAt(i, MP);
    for (const k of [0, 1]) {
      const sg = k ? 1 : -1;
      const base = Array.isArray(p.armPitch) ? p.armPitch[k] : (p.armPitch || 0);
      const ap = base + (p.armSwing ?? 0.4) * -sw * sg + (p.armJitter ? Math.sin(p.phase * 1.7 + k * 2) * p.armJitter : 0);
      MP.copy(MT).multiply(TMP.makeTranslation(sg * 0.27, 0.58, 0)).multiply(TMP.makeRotationX(ap)).multiply(TMP.makeRotationZ(sg * (p.armSpread || 0.06)));
      cr.arms.setMatrixAt(i * 2 + k, MP);
    }
  }
  const flush = cr => { for (const k of ['torso', 'head', 'hair', 'arms', 'legs']) cr[k].instanceMatrix.needsUpdate = true; };

  // ---- turistas ----
  const shirts = ['#e23b3b', '#f2c12e', '#2f7de1', '#ffffff', '#23a35a', '#ff7a1a', '#7b3fe4', '#111111', '#13b5c8', '#f25ca8', '#ffe14d', '#1d4ed8'];
  const skins = ['#f1c7a3', '#d9a27a', '#b57a52', '#8a5636', '#5e3a24'];
  const hairs = ['#1a1410', '#3b2414', '#6b4a2a', '#c9a35c', '#0d0d0d', '#7a7a7a'];
  const TN = 160;
  const tourists = makeCrowd(TN, i => ({ shirt: shirts[i % shirts.length], skin: skins[(i * 7) % skins.length], hair: hairs[(i * 5) % hairs.length], pants: ['#2b3a55', '#3a3a3a', '#d8cfb8', '#4a5a3a', '#1f2937'][i % 5] }));
  const tData = [];
  const free = (x, z) => !((Math.abs(x) < 7.8 && Math.abs(z) < 7.8) || (x > 9 && z > 2 && z < 13) || (Math.abs(x + 13.5) < 2.5 && Math.abs(z + 10) < 3));
  for (let i = 0; i < TN; i++) {
    let x, z;
    const atRail = i < 26; // grupo na grade da frente, olhando a vista
    for (;;) {
      if (atRail) { x = lerp(-15.5, 15.5, R()); z = 27.6 + R() * 0.7; if (Math.abs(x) < 3.2) continue; }
      else { x = lerp(X0 + 1.5, X1 - 1.5, R()); z = lerp(Z0 + 1.5, Z1 - 2.5, R()); }
      if (free(x, z)) break;
    }
    const ang = R() * Math.PI * 2, rr = 7.9 + R() * 4.2;
    const kind = atRail ? (R() < 0.4 ? 'foto' : 'vista') : (R() < 0.45 ? 'passeio' : R() < 0.5 ? 'foto' : 'parado');
    tData.push({ x, z, hx: Math.cos(ang) * rr, hz: Math.sin(ang) * rr * 0.9 - 2.5, yaw: atRail ? 0 : R() * 6.28, ph: R() * 6.28, sp: 0.8 + R() * 0.5,
      kind, loopR: 1 + R() * 2.5, loopW: (R() < 0.5 ? -1 : 1) * (0.18 + R() * 0.15), delay: R() * 2.2, react: R() * 1.5,
      after: R() < 0.3 ? 'cabeca' : R() < 0.55 ? 'agacha' : 'olha', run: 3.2 + R() * 1.6, scale: 0.92 + R() * 0.14 });
  }
  // ---- zumbis ----
  const ZN = 250;
  const zombies = makeCrowd(ZN, i => ({ shirt: ['#3d3b36', '#5a1f1f', '#2e3a46', '#6b5b45', '#432b2b', '#7a7468'][i % 6], skin: ['#9aab84', '#a7ad92', '#8c9a78'][i % 3], hair: ['#1a1a14', '#2c2a22', '#4a4a40', '#9aab84'][i % 4], pants: ['#22252b', '#3a3026', '#2c2c2c'][i % 3] }));
  const zData = [];
  for (let i = 0; i < ZN; i++) {
    const lane = i % 5, row = Math.floor(i / 5);
    zData.push({
      lane, row,
      x0: SX0 + STEPS * STEP_RUN + 8 + row * 0.9 + R() * 0.8,
      z: lerp(GATE_Z0 + 0.6, GATE_Z1 - 0.6, (lane + 0.2 + R() * 0.6) / 5),
      sp: 1.7 + R() * 0.5, ph: R() * 6.28, lean: 0.15 + R() * 0.35, roll: (R() - 0.5) * 0.6,
      limp: R() < 0.5 ? 0 : 1, crawl: R() < 0.07, jerk: R() * 10, scale: 0.9 + R() * 0.2,
    });
  }

  // =====================================================================
  // HELICÓPTERO (com holofote)
  // =====================================================================
  const heli = new THREE.Group();
  const heliRotor = new THREE.Group(), heliTail = new THREE.Group();
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  const navW = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 4.5, 1, 24, 1, true), beamMat);
  // círculo de luz do holofote no chão (mais barato que um SpotLight)
  const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  {
    const body = new THREE.MeshStandardMaterial({ color: 0x1f3b73, roughness: 0.5, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.6 });
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), body); cab.scale.set(1.3, 1.2, 2.4); heli.add(cab);
    const win = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), glass); win.scale.set(1.25, 1.0, 1.4); win.position.set(0, 0.1, 1.2); win.rotation.x = Math.PI / 2.4; heli.add(win);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.45, 6, 10), body); boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.3, -4.6); heli.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 1.0), body); fin.position.set(0, 1.0, -7.4); heli.add(fin);
    heliTail.position.set(0.2, 1.0, -7.5); heli.add(heliTail);
    heliTail.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 0.14), dark));
    for (const sx of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4), dark); sk.position.set(sx * 1.0, -1.4, 0.2); heli.add(sk); }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.6, 8), dark); mast.position.y = 1.4; heli.add(mast);
    heliRotor.position.y = 1.7; heli.add(heliRotor);
    for (let b = 0; b < 4; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 11), dark); bl.rotation.y = b * Math.PI / 4; heliRotor.add(bl); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.6, 32), new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; heliRotor.add(disc);
    navR.position.set(0, -1.1, 0); heli.add(navR);
    navW.position.set(0, 1.9, -7.6); heli.add(navW);
    heli.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(heli, beam, pool);
  }
  const H_ARR = events.at('helicoptero'), H_CIRC = H_ARR + 26;
  // órbita: passa atrás do Cristo por volta de t=51
  const circ = t => { const a = 2.16 + (t - H_CIRC) * 0.21; return new THREE.Vector3(Math.cos(a) * 72, 46 + 4 * Math.sin(t * 0.45), Math.sin(a) * 72 + 6); };
  const heliCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3200, -420, 4600), new THREE.Vector3(-1800, -330, 3600), new THREE.Vector3(-700, -230, 2400),
    new THREE.Vector3(100, -120, 1100), new THREE.Vector3(300, 10, 350), circ(H_CIRC),
  ]);
  const heliAt = t => t >= H_CIRC ? circ(t) : heliCurve.getPoint(clamp((t - H_ARR) / (H_CIRC - H_ARR)));

  // =====================================================================
  // CELULAR NA MÃO + MÃOS NA GRADE (1ª pessoa)
  // =====================================================================
  const phone = new THREE.Group();
  function roundRect(g, x, y, w, h, r) {
    if (typeof r === 'number') r = { tl: r, tr: r, bl: r, br: r };
    g.beginPath(); g.moveTo(x + r.tl, y); g.lineTo(x + w - r.tr, y); g.quadraticCurveTo(x + w, y, x + w, y + r.tr);
    g.lineTo(x + w, y + h - r.br); g.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h); g.lineTo(x + r.bl, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r.bl); g.lineTo(x, y + r.tl); g.quadraticCurveTo(x, y, x + r.tl, y); g.closePath();
  }
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc58f6a });
  const sleeveMat = new THREE.MeshLambertMaterial({ color: 0x24324a });
  {
    const cv = document.createElement('canvas'); cv.width = 540; cv.height = 1100; const g = cv.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 1100); grd.addColorStop(0, '#1a1f2e'); grd.addColorStop(1, '#090b12'); g.fillStyle = grd; g.fillRect(0, 0, 540, 1100);
    g.fillStyle = '#fff'; g.font = '800 64px Montserrat'; g.textAlign = 'center'; g.fillText('17:41', 270, 140);
    g.fillStyle = 'rgba(255,255,255,0.92)'; roundRect(g, 30, 260, 480, 520, 36); g.fill();
    g.fillStyle = '#d71920'; roundRect(g, 30, 260, 480, 96, { tl: 36, tr: 36, bl: 0, br: 0 }); g.fill();
    g.fillStyle = '#fff'; g.font = '900 34px Montserrat'; g.fillText('ALERTA DE EMERGÊNCIA', 270, 322);
    g.fillStyle = '#111'; g.font = '900 52px Montserrat';
    ['NÃO SAIA', 'DE CASA.'].forEach((l, i) => g.fillText(l, 270, 450 + i * 64));
    g.fillStyle = '#d71920'; g.font = '900 60px Montserrat'; g.fillText('ELES MORDEM.', 270, 610);
    g.fillStyle = '#555'; g.font = '800 26px Montserrat'; g.fillText('Procure um local alto e trancado.', 270, 700);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.16, 0.009), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.071, 0.15), new THREE.MeshBasicMaterial({ map: t, color: 0x9a9a9a }));
    screen.position.z = 0.0047; body.add(screen);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.09, 0.03), skinMat); hand.position.set(0.006, -0.06, -0.012); body.add(hand);
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), skinMat); thumb.position.set(-0.045, -0.03, 0.006); thumb.rotation.z = -0.4; body.add(thumb);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), sleeveMat); arm.position.set(0.02, -0.25, -0.04); body.add(arm);
    phone.add(body); phone.visible = true; camera.add(phone); // visível até o 1º update: shader pré-compilado
  }
  const hands = [0, 1].map(() => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.1), skinMat));
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.06, 0.03), skinMat); fingers.position.set(0, -0.03, 0.06); g.add(fingers);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 1), sleeveMat); scene.add(arm);
    g.userData.arm = arm; scene.add(g); return g;
  });
  const handSegs = script.hands || [];
  const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0), OFF = new THREE.Vector3(0, -1.4, 0);

  // =====================================================================
  // update(t): TUDO derivado de t
  // =====================================================================
  const tSir = since('sirenes'), tFire = since('incendios'), tZ = since('zumbis_escada');
  const tPanic = since('panico'), tLock = since('portao_trancado'), tGive = since('portao_cede'), tOut = since('apagao');
  const tPhOn = since('celular_on'), tPhOff = since('celular_off'), tBeam = since('holofote');
  const fovScale = () => SCREEN_H / (2 * Math.tan(camera.fov * Math.PI / 360));
  const DUR = script.duration;
  const fogC = new THREE.Color(), hor = new THREE.Color(), zen = new THREE.Color();

  return {
    tension: t => smooth(30, 52, t),
    update(t) {
      // ---------- entardecer ----------
      const u = clamp(t / DUR);
      const elev = lerp(6.5, -2, u) * Math.PI / 180, az = 132 * Math.PI / 180;
      sunDir.set(-Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev));
      const dusk = smooth(0.12, 1.0, u);
      skyU.dusk.value = dusk;
      sun.position.copy(sunDir).multiplyScalar(140); sun.target.position.set(0, 0, 8);
      sun.intensity = lerp(3.0, 0.2, smooth(0.1, 0.95, u));
      sun.color.setHSL(0.07 - 0.03 * dusk, 0.9, 0.62 - 0.1 * dusk);
      hemi.intensity = lerp(1.15, 0.5, dusk);
      hemi.color.setHSL(0.62, 0.45, lerp(0.7, 0.45, dusk));
      fogC.setHSL(0.06 - 0.02 * dusk, 0.5, lerp(0.52, 0.2, dusk));
      scene.fog.color.copy(fogC);
      for (const p of [smoke, clouds]) p.material.uniforms.fogCol.value.copy(fogC);
      const fl = smooth(0.35, 0.6, u); // holofotes do Cristo (emissivo frio)
      stone.emissive.setRGB(0.2, 0.23, 0.3).multiplyScalar(fl); stoneB.emissive.setRGB(0.2, 0.23, 0.3).multiplyScalar(fl);
      renderer.toneMappingExposure = lerp(1.0, 1.2, dusk);
      for (const b of lampGlow) b.material.color.setHSL(0.09, 1, lerp(0.1, 0.7, smooth(0.3, 0.5, u)));
      const night = smooth(0.25, 0.65, u);
      groundU.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
      groundU.uSky.value.copy(hemi.color).multiplyScalar(hemi.intensity);
      groundU.uGnd.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity);
      groundU.uFogCol.value.copy(fogC);
      groundU.uNight.value = night;
      groundU.uOut.value = tOut(t) > 0 ? clamp(tOut(t) / 10) * 0.85 : 0;
      groundU.uTime.value = t;
      hor.setRGB(lerp(1.0, 0.85, dusk), lerp(0.52, 0.26, dusk), lerp(0.22, 0.12, dusk)).multiplyScalar(0.5);
      zen.setRGB(lerp(0.09, 0.03, dusk), lerp(0.2, 0.04, dusk), lerp(0.5, 0.14, dusk));
      groundU.uHor.value.copy(hor); groundU.uZen.value.copy(zen);

      // ---------- janelas acesas ----------
      const outK = groundU.uOut.value;
      const lcA = lightsGeo.attributes.color.array;
      for (let i = 0; i < lightsN; i++) {
        let k = lPhase[i] < night * 1.1 ? night : 0;
        if (lSector[i] < outK) k = 0;
        const w = 0.85 + 0.15 * Math.sin(t * 2 + i);
        lcA[i * 3] = k * w; lcA[i * 3 + 1] = k * w * 0.75; lcA[i * 3 + 2] = k * w * 0.45;
      }
      lightsGeo.attributes.color.needsUpdate = true;

      // ---------- nuvens ----------
      const cA = clouds.geometry.attributes;
      for (let i = 0; i < CLOUDS; i++) {
        const c = cloudData[i];
        const x = c.x + t * c.v * 3, z = c.z;
        cA.position.setXYZ(i, x, c.y, z);
        cA.size.setX(i, c.s); cA.alpha.setX(i, c.a);
        V1.set(x, c.y, z).normalize();
        const lit = Math.max(0, V1.dot(sunDir)) * (1 - dusk * 0.7);
        cA.color.setXYZ(i, lerp(0.42, 1.0, lit) * lerp(1, 0.45, dusk), lerp(0.36, 0.62, lit) * lerp(1, 0.4, dusk), lerp(0.42, 0.45, lit) * lerp(1, 0.55, dusk));
      }
      dirty(clouds);

      // ---------- fogo, fumaça, explosão ----------
      const fs = tFire(t);
      const sA = smoke.geometry.attributes, gA = glow.geometry.attributes;
      for (let f = 0; f < NF; f++) {
        const F = fires[f]; const age = fs - F.t0;
        const ex = F.kind === 'explosao';
        const grow = ex ? 1 : clamp(age / 6);
        const boom = ex && age > 0 ? Math.exp(-age * 1.6) : 0;
        for (let k = 0; k < 3; k++) {
          const i = f * 3 + k, fl = 0.75 + 0.25 * Math.sin(t * (9 + k * 3) + f);
          gA.position.setXYZ(i, F.x + (k - 1) * 18, F.y + 8 + k * 6 + boom * 120, F.z);
          gA.size.setX(i, age > 0 ? ((200 + 140 * k) * F.big * grow * fl + boom * 900) : 0);
          gA.alpha.setX(i, age > 0 ? (ex ? 0.55 : 0.9) : 0);
          gA.color.setXYZ(i, 1.0, ex ? 0.32 + 0.1 * k : 0.42 + 0.15 * k, ex ? 0.06 : 0.1);
        }
        for (let p = 0; p < PUFFS; p++) {
          const i = f * PUFFS + p;
          const life = 14, ph = ((age / life) + p / PUFFS) % 1;
          if (age <= 0 || age - ph * life < 0) { sA.alpha.setX(i, 0); sA.size.setX(i, 0); continue; }
          const hgt = ph * 1100 * F.big;
          sA.position.setXYZ(i, F.x + ph * ph * 700 * F.wind + Math.sin(p * 2.3) * 40, F.y + hgt, F.z - ph * 220 + Math.cos(p * 1.7) * 40);
          sA.size.setX(i, (180 + ph * 700) * F.big);
          sA.alpha.setX(i, Math.min(ph * 8, 1) * (1 - ph) * 0.75);
          const lit = Math.max(0, 1 - ph * 5);
          const gr = lerp(0.16, 0.26, Math.sin(p) * 0.5 + 0.5) * lerp(1, 0.6, dusk);
          sA.color.setXYZ(i, gr + lit * 0.6, gr + lit * 0.25, gr + lit * 0.05);
        }
      }
      dirty(smoke); dirty(glow);
      const sc = fovScale();
      for (const p of [smoke, glow, sirens, clouds]) p.material.uniforms.uScale.value = sc;

      // ---------- sirenes ----------
      const ss = tSir(t), siA = sirens.geometry.attributes;
      for (let i = 0; i < SIR; i++) {
        const [x, y, z, ph] = sirenPos[i];
        const active = ss > ph * 6;
        const blink = Math.sin((t + ph * 3) * 14) > 0;
        siA.position.setXYZ(i, x + Math.sin(t * 0.3 + ph * 9) * 60 * (active ? 1 : 0), y, z);
        siA.size.setX(i, active ? 30 : 0); siA.alpha.setX(i, active ? 1 : 0);
        if (blink) siA.color.setXYZ(i, 1, 0.1, 0.1); else siA.color.setXYZ(i, 0.15, 0.3, 1);
      }
      dirty(sirens);

      // ---------- portão: aberto -> trancado -> cedendo ----------
      const lockK = smooth(0, 1.4, tLock(t));
      const giveS = tGive(t), give = giveS > 0 ? clamp(giveS / 6) : 0;
      const rattle = giveS > 0 ? (0.03 + 0.06 * give) * (Math.sin(t * 31) * 0.6 + Math.sin(t * 47 + 1) * 0.4) : 0;
      const zPress = tZ(t) > 0 ? clamp((tZ(t) - 11) / 3) * 0.02 * Math.sin(t * 23) : 0;
      gate.rotation.y = lerp(-Math.PI / 2 + 0.15, 0, lockK) + rattle + zPress;
      gate.rotation.z = give * 0.18;
      gate.position.x = SX0 + 0.05 - give * 0.2;
      gateBars.forEach((b, i) => { b.rotation.x = give * 0.25 * Math.sin(i * 1.7 + t * 9) * (i % 3 === 0 ? 1 : 0.3); });

      // ---------- turistas ----------
      const pk = tPanic(t), sk = tSir(t), tSirAt = events.at('sirenes');
      const cx = camera.position.x, cz = camera.position.z;
      for (let i = 0; i < TN; i++) {
        const d = tData[i];
        let x = d.x, z = d.z, yaw = d.yaw, walk = 0, phase = t * 6 * d.sp + d.ph, lean = 0, armP = 0, armSw = 0.08, headT = -0.05, spread = 0.06, dy = 0, legBase = 0;
        if (d.kind === 'passeio') {
          const tt = sk > d.react ? tSirAt + d.react : t; // param de andar quando ouvem as sirenes
          const a = d.ph + tt * d.loopW;
          x = d.x + Math.cos(a) * d.loopR; z = d.z + Math.sin(a) * d.loopR;
          yaw = Math.atan2(-Math.sin(a) * d.loopW, Math.cos(a) * d.loopW);
          if (sk <= d.react) { walk = 1; armSw = 0.4; phase = t * 5.5 + d.ph; }
        } else if (d.kind === 'foto') { armP = [-2.3, -2.3]; headT = 0.15; yaw = d.yaw + 0.2 * Math.sin(t * 0.4 + d.ph); }
        else if (d.kind === 'vista') { yaw = 0.15 * Math.sin(t * 0.25 + d.ph); }
        else { yaw = d.yaw + 0.3 * Math.sin(t * 0.3 + d.ph); }
        if (sk > d.react && pk < d.delay) { // sirenes: viram para a cidade, alguns apontam
          yaw = lerp(yaw, 0, smooth(0, 1.2, sk - d.react));
          if (i % 5 === 0) armP = [-0.3, -1.55];
        }
        if (pk > d.delay) { // pânico: correm para junto do pedestal
          const sx = x, sz = z, dist = Math.hypot(d.hx - sx, d.hz - sz);
          const k = clamp((pk - d.delay) * d.run / Math.max(dist, 0.1));
          x = lerp(sx, d.hx, k); z = lerp(sz, d.hz, k);
          if (k < 1) { yaw = Math.atan2(d.hx - sx, d.hz - sz); walk = 1.3; phase = t * 11 + d.ph; lean = 0.32; armSw = 1.0; armP = -0.3; headT = 0.1; }
          else {
            yaw = Math.atan2(SX0 - x, 7.5 - z); walk = 0;
            if (d.after === 'cabeca') { armP = [-2.9, -2.9]; spread = 0.45; lean = 0.15 + 0.05 * Math.sin(t * 3 + i); }
            else if (d.after === 'agacha') { dy = -0.35; lean = 0.55; legBase = -0.9; armP = -0.9; headT = -0.2; }
            else { armP = i % 4 === 0 ? -2.6 + 0.25 * Math.sin(t * 5 + i) : 0; }
          }
        }
        const dx = x - cx, dz = z - cz, dd = Math.hypot(dx, dz); // ninguém atravessa a câmera
        if (dd < 2.8) { const f = 2.8 / Math.max(dd, 1e-3); x = cx + dx * f; z = cz + dz * f; }
        setPose(tourists, i, { x, y: 0, z, yaw, phase, walk, lean, armPitch: armP, armSwing: armSw, headTilt: headT, armSpread: spread, sway: 0.02 * Math.sin(t * 1.3 + d.ph), dy, legBase, scale: d.scale });
      }
      flush(tourists);

      // ---------- zumbis ----------
      const zs = tZ(t);
      for (let i = 0; i < ZN; i++) {
        const d = zData[i];
        if (zs < 0) { setPose(zombies, i, null); continue; }
        const front = SX0 + 0.45 + d.row * 0.6 + (d.lane % 2) * 0.2 - give * 0.35;
        const x = Math.max(front, d.x0 - zs * d.sp);
        const atGate = x <= front + 0.01;
        const tGate = atGate ? Math.max(0, zs - (d.x0 - front) / d.sp) : 0;
        const pile = atGate && d.row > 0 ? Math.min(d.row * 0.11, 1.3) * clamp(tGate / 5) * (0.6 + 0.4 * give) : 0; // sobem uns nos outros
        const y = stairY(x) + pile;
        const ph = t * 3.0 * d.sp + d.ph;
        const jerk = Math.pow(Math.max(0, Math.sin(t * 1.3 + d.jerk)), 14) * 0.9 * (d.jerk > 5 ? 1 : -1);
        if (d.crawl && !atGate) {
          setPose(zombies, i, { x, y: y - 0.62, z: d.z, yaw: -Math.PI / 2, phase: ph * 0.7, walk: 0.4, lean: 1.45,
            armPitch: [-1.7 + 0.5 * Math.sin(ph * 0.7), -1.7 - 0.5 * Math.sin(ph * 0.7)], armSwing: 0,
            headTilt: -0.9, headRoll: jerk * 0.5, legBase: 1.3, legAmp: [0.15, 0.15], scale: d.scale });
          continue;
        }
        setPose(zombies, i, {
          x, y, z: d.z + Math.sin(ph * 0.5) * 0.08, yaw: -Math.PI / 2 + d.roll * 0.3 + (atGate ? 0.15 * Math.sin(t * 2 + i) : 0), phase: ph,
          walk: atGate ? 0.25 : 1, legAmp: d.limp ? [0.65, 0.18] : [0.2, 0.62],
          lean: d.lean + (atGate ? 0.3 + 0.1 * Math.sin(t * 5 + i) : 0), sway: d.roll * 0.4 + Math.sin(ph * 0.5) * (d.limp ? 0.2 : 0.1),
          armPitch: atGate ? [-1.85 + 0.3 * Math.sin(t * 6 + i), -1.6 + 0.3 * Math.sin(t * 5.3 + i * 2)] : -1.45, armSwing: 0.12, armJitter: atGate ? 0.3 : 0.08,
          headTilt: 0.35 + 0.15 * Math.sin(ph * 0.7) + (atGate ? -0.5 : 0), headRoll: d.roll + jerk, armSpread: 0.12, scale: d.scale,
        });
      }
      flush(zombies);

      // ---------- helicóptero ----------
      const hp = heliAt(t), hn = heliAt(t + 0.1);
      heli.position.copy(hp);
      V1.subVectors(hn, hp);
      heli.rotation.set(0.12, Math.atan2(V1.x, V1.z), t >= H_CIRC ? -0.22 : -0.05, 'YXZ');
      heliRotor.rotation.y = t * 17.3;
      heliTail.rotation.x = t * 41.7;
      navR.visible = Math.sin(t * 6) > 0.4; navW.visible = Math.sin(t * 4 + 1) > 0.7;
      const bk = tBeam(t) > 0 ? smooth(0, 1, tBeam(t)) : 0;
      const tgt = V2.set(9 * Math.sin(t * 0.7), 0, -6 + 7 * Math.cos(t * 0.5)); // varre a multidão atrás/ao lado do pedestal
      const src = V3.copy(hp).add(OFF);
      beam.position.copy(src).lerp(tgt, 0.5);
      beam.scale.set(1, src.distanceTo(tgt), 1);
      beam.quaternion.setFromUnitVectors(DOWN, V1.subVectors(tgt, src).normalize());
      beamMat.opacity = 0.035 * bk;
      beam.visible = bk > 0;
      pool.position.set(tgt.x, 0.02, tgt.z); pool.material.opacity = 0.35 * bk; pool.visible = bk > 0;

      // ---------- celular ----------
      const on1 = tPhOn(t), off1 = tPhOff(t);
      const up = on1 > 0 ? (off1 > 0 ? 1 - smooth(0, 0.5, off1) : smooth(0, 0.6, on1)) : 0;
      phone.visible = up > 0.001;
      phone.position.set(0.05, lerp(-0.42, -0.1, up), -0.27);
      phone.rotation.set(lerp(-0.9, -0.12, up) + 0.01 * Math.sin(t * 2.1), -0.08, 0.05 + 0.01 * Math.sin(t * 1.7));

      // ---------- mãos na grade ----------
      const seg = handSegs.find(s => t >= s.start - 0.5 && t < s.end + 0.5);
      const hk = seg ? Math.min(smooth(seg.start - 0.5, seg.start + 0.2, t), 1 - smooth(seg.end - 0.2, seg.end + 0.5, t)) : 0;
      const cy = camera.rotation.y, rx = Math.cos(cy), rz = -Math.sin(cy);
      hands.forEach((h, k) => {
        const vis = hk > 0.001; h.visible = vis; h.userData.arm.visible = vis;
        if (!vis) return;
        const sg = k ? 1 : -1;
        const grip = V1.set(seg.at[0] + rx * sg * 0.3, seg.at[1] + 0.04 - (1 - hk) * 0.5 + 0.004 * Math.sin(t * 3 + k), seg.at[2] + rz * sg * 0.3);
        h.position.copy(grip); h.rotation.set(0, cy, 0);
        const sh = V2.set(0.22 * sg, -0.55, 0.1).applyMatrix4(camera.matrixWorld); // ombro
        const elbow = V3.copy(sh).sub(grip).normalize().multiplyScalar(0.42).add(grip); // antebraço de 42 cm
        const arm = h.userData.arm;
        arm.position.copy(elbow).lerp(grip, 0.5); arm.scale.set(1, 1, 0.42);
        arm.lookAt(grip);
      });
    },
  };
}
