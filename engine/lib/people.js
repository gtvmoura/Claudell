// Kit de personagens low-poly com esqueleto articulado e muitas variações de visual.
// Reaproveitável em qualquer cena: makePerson(spec) -> { root, joints, height, spec }
// Convenção: o personagem olha para +Z; a esquerda dele é +X.
// Ângulos: flexão para a frente (ombro/cotovelo/quadril) = X negativo; joelho dobra = X positivo.

export const SKINS = ['#f6d3b5', '#eac09b', '#d9a27a', '#c48a5f', '#a86e47', '#8a5636', '#6b4128', '#4f2e1c'];
export const HAIR_COLORS = ['#141010', '#2b1a10', '#4a2c17', '#7a4a24', '#b07a3c', '#d9b26a', '#9a9a9a', '#e8e1d6', '#7a1f2b', '#2e4b8f'];
export const CLOTHES = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#2c3e50', '#7f8c8d', '#ecf0f1',
  '#a0522d', '#556b2f', '#d35400', '#c2b280', '#5d6d7e', '#b03a2e', '#1f618d', '#239b56', '#f5b7b1', '#273746'];
export const PANTS = ['#2c3e50', '#34495e', '#4a3b2a', '#5d4e37', '#1b2631', '#6e5e48', '#2e4053', '#3b3b3b', '#7b6d5b', '#1a5276'];
export const HAIR_STYLES = ['curto', 'longo', 'coque', 'afro', 'moicano', 'raspado', 'trancas', 'franja', 'rabo'];
export const HATS = [null, null, null, 'bone', 'chapeu', 'gorro', 'bandana', 'capacete'];
export const TOPS = ['camiseta', 'camiseta', 'regata', 'manga_longa', 'moletom', 'colete', 'jaqueta'];

export function makePeopleKit(THREE) {
  const gCache = new Map(), mCache = new Map();
  const G = (key, f) => { if (!gCache.has(key)) gCache.set(key, f()); return gCache.get(key); };
  const M = (color, extra = {}) => {
    const key = color + JSON.stringify(extra);
    if (!mCache.has(key)) mCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
    return mCache.get(key);
  };
  const box = (w, h, d) => G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  const cyl = (rt, rb, h, s = 6, oy = 0) => G(`c${rt},${rb},${h},${s},${oy}`, () => { const g = new THREE.CylinderGeometry(rt, rb, h, s); g.translate(0, oy, 0); return g; });
  const ico = (r, d = 1) => G(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
  const sph = (r, ws = 8, hs = 6, phiLen = Math.PI) => G(`s${r},${ws},${hs},${phiLen}`, () => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, phiLen));

  function add(parent, geo, color, x = 0, y = 0, z = 0, opts = {}) {
    const m = new THREE.Mesh(geo, opts.mat || M(color));
    m.position.set(x, y, z);
    if (opts.rot) m.rotation.set(...opts.rot);
    if (opts.scale) m.scale.set(...opts.scale);
    m.castShadow = opts.shadow !== false;
    parent.add(m);
    return m;
  }
  const J = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

  // ---------------- ferramentas (origem = mão; "para baixo" = -Y da mão) ----------------
  const TOOLS = {
    enxada(h) { const g = new THREE.Group(); add(g, cyl(0.018, 0.018, 1.25, 5), '#8b6b43', 0, -0.25, 0); add(g, box(0.2, 0.12, 0.02), '#8a8f93', 0, -0.86, 0.06, { rot: [0.6, 0, 0] }); h.add(g); return g; },
    martelo(h) { const g = new THREE.Group(); add(g, cyl(0.016, 0.016, 0.34, 5), '#8b6b43', 0, -0.08, 0, { rot: [Math.PI / 2, 0, 0] }); add(g, box(0.06, 0.06, 0.13), '#5d6166', 0, -0.06, 0.18); h.add(g); return g; },
    concha(h) { const g = new THREE.Group(); add(g, cyl(0.012, 0.012, 0.6, 5), '#b9b9b9', 0, -0.25, 0.05); add(g, sph(0.05, 8, 4, Math.PI / 2), '#b9b9b9', 0, -0.55, 0.05, { rot: [Math.PI, 0, 0] }); h.add(g); return g; },
    binoculo(h) { const g = new THREE.Group(); for (const x of [-0.035, 0.035]) add(g, cyl(0.025, 0.028, 0.12, 8), '#1d1f22', x, -0.05, 0.06, { rot: [Math.PI / 2, 0, 0] }); h.add(g); return g; },
    prancheta(h) { const g = new THREE.Group(); add(g, box(0.22, 0.3, 0.015), '#a8763e', 0, -0.06, 0.05, { rot: [-0.5, 0, 0] }); add(g, box(0.18, 0.22, 0.004), '#f4f4f4', 0, -0.05, 0.06, { rot: [-0.5, 0, 0] }); h.add(g); return g; },
    caixa(h) { const g = new THREE.Group(); add(g, box(0.45, 0.32, 0.35), '#9c7a4f', 0.21, -0.02, 0.12); h.add(g); return g; },
    balde(h) { const g = new THREE.Group(); add(g, cyl(0.13, 0.1, 0.24, 8), '#4a6fa5', 0, -0.17, 0); h.add(g); return g; },
    painel(h) { const g = new THREE.Group(); add(g, box(0.05, 0.02, 0.25), '#c0c0c0', 0, -0.06, 0.08); h.add(g); return g; },
    roupa(h) { const g = new THREE.Group(); add(g, box(0.35, 0.4, 0.01), '#e0a4b8', 0.1, -0.15, 0.04); h.add(g); return g; },
    milho(h) { const g = new THREE.Group(); add(g, box(0.05, 0.05, 0.05), '#f1c40f', 0, -0.06, 0.04); h.add(g); return g; },
    // ---- equipamento das funções (mão direita, cabo apontando para a frente) ----
    machado(h) { const g = new THREE.Group(); add(g, cyl(0.02, 0.022, 0.78, 5), '#7a5233', 0, -0.06, 0.28, { rot: [Math.PI / 2, 0, 0] }); add(g, box(0.03, 0.2, 0.13), '#8f969c', 0, -0.13, 0.62); add(g, box(0.035, 0.05, 0.05), '#5d6166', 0, -0.02, 0.62); h.add(g); return g; },
    picareta(h) { const g = new THREE.Group(); add(g, cyl(0.02, 0.022, 0.8, 5), '#7a5233', 0, -0.06, 0.3, { rot: [Math.PI / 2, 0, 0] }); add(g, box(0.035, 0.5, 0.05), '#6c7278', 0, -0.06, 0.66, { rot: [0, 0, 0] }); add(g, box(0.03, 0.06, 0.08), '#6c7278', 0, 0.2, 0.69); add(g, box(0.03, 0.06, 0.08), '#6c7278', 0, -0.32, 0.69); h.add(g); return g; },
    espada(h) { const g = new THREE.Group(); add(g, box(0.035, 0.035, 0.18), '#3b2a1a', 0, -0.06, 0.02); add(g, box(0.2, 0.03, 0.03), '#b08d3c', 0, -0.06, 0.12); add(g, box(0.05, 0.012, 0.85), '#d7dde2', 0, -0.06, 0.55); h.add(g); return g; },
    facao(h) { const g = new THREE.Group(); add(g, box(0.035, 0.035, 0.14), '#2b2b2b', 0, -0.06, 0.02); add(g, box(0.07, 0.012, 0.5), '#c3c9ce', 0, -0.06, 0.34); h.add(g); return g; },
    lanca(h) { const g = new THREE.Group(); add(g, cyl(0.02, 0.022, 2.0, 5), '#7a5233', 0, -0.05, 0.1, { rot: [0.1, 0, 0] }); add(g, cyl(0.001, 0.045, 0.22, 4), '#c3c9ce', 0, 1.05, 0.2, { rot: [0.1, 0, 0] }); h.add(g); return g; },
    rifle(h) { const g = new THREE.Group(); add(g, box(0.06, 0.1, 0.32), '#4a3322', 0, -0.06, -0.12); add(g, box(0.05, 0.07, 0.42), '#2a2d30', 0, -0.03, 0.22); add(g, cyl(0.016, 0.016, 0.42, 6), '#1c1e20', 0, -0.0, 0.62, { rot: [Math.PI / 2, 0, 0] }); add(g, box(0.03, 0.12, 0.04), '#1c1e20', 0, -0.11, 0.12); h.add(g); return g; },
    maleta(h) { const g = new THREE.Group(); add(g, box(0.32, 0.22, 0.12), '#f2f2f2', 0, -0.14, 0); add(g, box(0.06, 0.16, 0.13), '#d0281f', 0, -0.14, 0); add(g, box(0.16, 0.06, 0.13), '#d0281f', 0, -0.14, 0); h.add(g); return g; },
    tora(h) { const g = new THREE.Group(); add(g, cyl(0.12, 0.13, 1.9, 7), '#7a5233', 0.05, 0.25, 0.1, { rot: [0, 0, Math.PI / 2] }); h.add(g); return g; },
    // ---- mão esquerda ----
    arco(h) { const g = new THREE.Group(); for (const sg of [1, -1]) add(g, cyl(0.014, 0.018, 0.62, 5), '#6b4a2e', 0, -0.05 + sg * 0.3, 0.06 + 0.07, { rot: [-sg * 0.32, 0, 0] }); add(g, cyl(0.004, 0.004, 1.1, 3), '#e8e1d6', 0, -0.05, 0.02); h.add(g); return g; },
    escudo(h) { const g = new THREE.Group(); add(g, cyl(0.3, 0.3, 0.05, 10), '#6b4a2e', -0.06, -0.08, 0.04, { rot: [0, 0, Math.PI / 2] }); add(g, cyl(0.08, 0.08, 0.07, 8), '#8f969c', -0.09, -0.08, 0.04, { rot: [0, 0, Math.PI / 2] }); h.add(g); return g; },
  };
  function guitar(chest) {
    const g = new THREE.Group();
    add(g, cyl(0.17, 0.17, 0.08, 10), '#b5651d', 0, 0, 0, { rot: [Math.PI / 2, 0, 0], scale: [1, 1, 1.25] });
    add(g, cyl(0.04, 0.04, 0.09, 8), '#2b1a0e', 0, 0.02, 0.0, { rot: [Math.PI / 2, 0, 0] });
    add(g, box(0.05, 0.5, 0.03), '#3b2a1a', 0, 0.36, 0);
    g.position.set(-0.05, 0.12, 0.2); g.rotation.set(0, 0, 1.1);
    chest.add(g); return g;
  }

  // ---------------- personagem ----------------
  function makePerson(spec) {
    const s = { height: 1.75, build: 1, skin: SKINS[2], hair: 'curto', hairColor: HAIR_COLORS[0], top: 'camiseta', topColor: CLOTHES[0], top2: CLOTHES[9],
      pants: PANTS[0], shorts: false, skirt: false, shoes: '#2b2b2b', hat: null, hatColor: '#c0392b', beard: false, glasses: false, backpack: false,
      scarf: null, apron: null, coat: false, headphones: false, kid: false, ghost: false, ...spec };
    const ghostMat = s.ghost ? new THREE.MeshLambertMaterial({ color: '#dfe9f5', transparent: true, opacity: 0.6, emissive: '#7fa6d6', emissiveIntensity: 0.9, depthWrite: false, flatShading: true }) : null;
    const C = c => (ghostMat ? { mat: ghostMat, shadow: false } : {});
    const col = c => c;
    const eyeMat = s.zombie ? new THREE.MeshBasicMaterial({ color: new THREE.Color(7.0, 0.5, 0.15) }) : null; // olhos que brilham (bloom)
    const root = new THREE.Group();
    const sc = s.height / 1.75;
    const body = J(root); body.scale.setScalar(sc);
    const bw = s.build; // largura (0.85 magro .. 1.25 forte)
    const hips = J(body, 0, 0.92, 0);
    add(hips, box(0.34 * bw, 0.16, 0.2 * bw), s.skirt ? s.pants : s.pants, 0, 0, 0, C());
    if (s.skirt) add(hips, cyl(0.17 * bw, 0.27 * bw, 0.42, 8, -0.2), s.pants, 0, 0, 0, C());
    const spine = J(hips, 0, 0.06, 0);
    // tronco
    const torsoCol = s.coat ? '#f2f2f2' : s.topColor;
    add(spine, cyl(0.205 * bw, 0.165 * bw, 0.5, 6, 0.25), torsoCol, 0, 0, 0, { ...C(), scale: [1.12, 1, 0.62] });
    if (s.top === 'colete') add(spine, cyl(0.215 * bw, 0.175 * bw, 0.42, 6, 0.27), s.top2, 0, 0, 0, { ...C(), scale: [1.12, 1, 0.64] });
    if (s.top === 'jaqueta') add(spine, box(0.03, 0.46, 0.02), '#222', 0, 0.25, 0.115 * bw, C());
    if (s.coat) add(spine, cyl(0.2 * bw, 0.25 * bw, 0.55, 6, -0.12), '#f2f2f2', 0, 0, 0, { ...C(), scale: [1.12, 1, 0.66] });
    if (s.apron) add(spine, box(0.3 * bw, 0.62, 0.02), s.apron, 0, 0.12, 0.112 * bw, C());
    if (s.top === 'moletom') add(spine, box(0.24, 0.14, 0.1), s.topColor, 0, 0.46, -0.12, C());
    if (s.backpack) { add(spine, box(0.3, 0.38, 0.14), s.backpack, 0, 0.25, -0.17, C()); }
    if (s.colete) { add(spine, cyl(0.218 * bw, 0.18 * bw, 0.4, 6, 0.27), s.colete, 0, 0, 0, { ...C(), scale: [1.12, 1, 0.66] }); for (const x of [-0.09, 0.09]) add(spine, box(0.08, 0.1, 0.04), s.colete, x, 0.18, 0.13 * bw, C()); }
    if (s.aljava) { const q = add(spine, cyl(0.07, 0.06, 0.55, 7), '#6b4a2e', 0.08, 0.3, -0.17, { ...C(), rot: [0.25, 0, -0.35] }); for (let i = 0; i < 4; i++) add(q, cyl(0.006, 0.006, 0.18, 3), '#e8e1d6', (i - 1.5) * 0.025, 0.33, 0); }
    if (s.cinto) { add(hips, box(0.38 * bw, 0.07, 0.24 * bw), '#5a3a22', 0, 0.05, 0, C()); add(hips, box(0.09, 0.1, 0.06), '#7a5233', 0.13, -0.02, 0.1, C()); }
    if (s.scarf) add(spine, cyl(0.1, 0.12, 0.08, 8, 0), s.scarf, 0, 0.5, 0, C());
    // cabeça
    const neck = J(spine, 0, 0.5, 0);
    add(neck, cyl(0.05, 0.055, 0.08, 6, 0.03), s.skin, 0, 0, 0, C());
    const head = J(neck, 0, 0.07, 0);
    const hs = s.kid ? 1.22 : 1;
    head.scale.setScalar(hs);
    add(head, ico(0.115, 1), s.skin, 0, 0.11, 0, { ...C(), scale: [0.92, 1.08, 1] });
    if (!s.ghost) {
      for (const x of [-0.04, 0.04]) { add(head, s.zombie ? box(0.045, 0.036, 0.012) : box(0.026, 0.024, 0.01), s.zombie ? '#ff2a1a' : '#1a1a1a', x, 0.125, 0.1, { shadow: false, mat: s.zombie ? eyeMat : undefined }); add(head, box(0.04, 0.012, 0.01), s.hairColor, x, 0.155, 0.1, { shadow: false }); }
      add(head, box(0.022, 0.035, 0.03), s.skin, 0, 0.1, 0.11, { shadow: false });
      add(head, box(0.045, 0.01, 0.01), '#6b2e2e', 0, 0.065, 0.105, { shadow: false });
      if (s.glasses) { for (const x of [-0.042, 0.042]) add(head, box(0.045, 0.035, 0.008), '#111', x, 0.125, 0.112, { shadow: false }); add(head, box(0.03, 0.008, 0.008), '#111', 0, 0.13, 0.113, { shadow: false }); }
      if (s.beard) add(head, box(0.17, 0.08, 0.07), s.hairColor, 0, 0.045, 0.06);
      const hc = s.hairColor;
      const cap = () => add(head, ico(0.123, 1), hc, 0, 0.145, -0.012, { scale: [1, 0.66, 1.06] });
      switch (s.hair) {
        case 'curto': cap(); break;
        case 'longo': cap(); add(head, box(0.22, 0.3, 0.08), hc, 0, 0.04, -0.075); break;
        case 'coque': cap(); add(head, ico(0.06, 0), hc, 0, 0.25, -0.07); break;
        case 'afro': add(head, ico(0.17, 1), hc, 0, 0.16, -0.025); break;
        case 'moicano': add(head, box(0.045, 0.08, 0.24), hc, 0, 0.23, -0.01); break;
        case 'trancas': cap(); for (const x of [-0.095, 0.095]) add(head, cyl(0.025, 0.02, 0.28, 5), hc, x, -0.02, -0.05); break;
        case 'franja': cap(); add(head, box(0.2, 0.05, 0.04), hc, 0, 0.19, 0.085); break;
        case 'rabo': cap(); add(head, cyl(0.035, 0.015, 0.22, 5), hc, 0, 0.08, -0.13, { rot: [0.5, 0, 0] }); break;
        default: break; // raspado
      }
      const hat = s.hat, hcol = s.hatColor;
      if (hat === 'bone') { add(head, cyl(0.125, 0.125, 0.07, 10), hcol, 0, 0.2, -0.005); add(head, box(0.15, 0.012, 0.1), hcol, 0, 0.17, 0.12); }
      if (hat === 'chapeu') { add(head, cyl(0.27, 0.27, 0.015, 12), '#d9b96a', 0, 0.19, 0); add(head, cyl(0.11, 0.125, 0.1, 10), '#d9b96a', 0, 0.24, 0); add(head, cyl(0.126, 0.126, 0.025, 10), '#7a3b1e', 0, 0.21, 0); }
      if (hat === 'gorro') add(head, sph(0.13, 10, 6, Math.PI * 0.55), hcol, 0, 0.13, -0.01, { scale: [1, 1.15, 1.05] });
      if (hat === 'bandana') add(head, cyl(0.124, 0.124, 0.05, 10), hcol, 0, 0.18, 0);
      if (hat === 'capacete') add(head, sph(0.14, 10, 6, Math.PI * 0.5), '#e1b12c', 0, 0.15, 0);
      if (hat === 'chef') { add(head, cyl(0.12, 0.115, 0.16, 10), '#f4f4f4', 0, 0.24, 0); add(head, ico(0.15, 1), '#ffffff', 0, 0.36, 0, { scale: [1, 0.6, 1] }); }
      if (hat === 'mineiro') { add(head, sph(0.142, 10, 6, Math.PI * 0.5), '#e1b12c', 0, 0.15, 0); add(head, cyl(0.035, 0.035, 0.04, 8), '#222', 0, 0.22, 0.125, { rot: [Math.PI / 2, 0, 0] }); add(head, cyl(0.026, 0.026, 0.012, 8), '#fff6c0', 0, 0.22, 0.147, { rot: [Math.PI / 2, 0, 0], mat: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2) }) }); }
      if (hat === 'militar') { add(head, sph(0.145, 10, 6, Math.PI * 0.5), '#4b5d3a', 0, 0.14, 0, { scale: [1.05, 0.95, 1.1] }); add(head, cyl(0.17, 0.17, 0.012, 10), '#4b5d3a', 0, 0.15, 0.01); }
      if (s.headphones) { add(head, box(0.26, 0.025, 0.04), '#222', 0, 0.245, 0); for (const x of [-0.125, 0.125]) add(head, cyl(0.045, 0.045, 0.04, 8), '#333', x, 0.12, 0, { rot: [0, 0, Math.PI / 2] }); }
    }
    // braços
    const longSleeve = ['manga_longa', 'moletom', 'jaqueta'].includes(s.top) || s.coat;
    const sleeve = s.top === 'regata' ? s.skin : (s.coat ? '#f2f2f2' : s.topColor);
    const arms = {};
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const sh = J(spine, sx * 0.215 * bw, 0.45, 0);
      add(sh, ico(0.07 * bw, 0), sleeve, 0, 0, 0, C());
      add(sh, cyl(0.058 * bw, 0.05 * bw, 0.29, 6, -0.145), sleeve, 0, 0, 0, C());
      const el = J(sh, 0, -0.29, 0);
      add(el, cyl(0.05 * bw, 0.042 * bw, 0.26, 6, -0.13), longSleeve ? sleeve : s.skin, 0, 0, 0, C());
      const hand = J(el, 0, -0.27, 0);
      add(hand, box(0.075, 0.1, 0.045), s.skin, 0, -0.04, 0, C());
      arms[side] = { sh, el, hand };
    }
    // pernas
    const legs = {};
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const hp = J(hips, sx * 0.095 * bw, -0.02, 0);
      add(hp, cyl(0.085 * bw, 0.065 * bw, 0.44, 6, -0.22), s.skirt ? s.skin : s.pants, 0, 0, 0, C());
      const kn = J(hp, 0, -0.44, 0);
      add(kn, cyl(0.062 * bw, 0.05 * bw, 0.4, 6, -0.2), s.shorts || s.skirt ? s.skin : s.pants, 0, 0, 0, C());
      const an = J(kn, 0, -0.41, 0);
      add(an, box(0.11, 0.08, 0.25), s.shoes, 0, -0.03, 0.05, C());
      legs[side] = { hp, kn };
    }
    // ferramenta
    let tool = null, toolL = null;
    if (s.toolL && TOOLS[s.toolL]) toolL = TOOLS[s.toolL](arms.L.hand);
    if (s.tool === 'violao') tool = guitar(spine);
    else if (s.tool && TOOLS[s.tool]) tool = TOOLS[s.tool](arms.R.hand);
    const joints = { root, body, hips, spine, neck, head, ...Object.fromEntries(Object.entries(arms).flatMap(([k, v]) => [[`sh${k}`, v.sh], [`el${k}`, v.el], [`hand${k}`, v.hand]])), ...Object.fromEntries(Object.entries(legs).flatMap(([k, v]) => [[`hip${k}`, v.hp], [`kn${k}`, v.kn]])) };
    return { root, joints, height: s.height, spec: s, tool, ghostMat };
  }

  // aplica uma pose (todos os campos opcionais)
  function setPose(p, q) {
    const j = p.joints;
    j.body.position.y = q.rootY || 0;
    j.hips.rotation.set(q.hipsX || 0, q.hipsY || 0, q.hipsZ || 0);
    j.spine.rotation.set(q.spineX || 0, q.spineY || 0, q.spineZ || 0);
    j.neck.rotation.set(q.neckX || 0, 0, 0);
    j.head.rotation.set(q.headX || 0, q.headY || 0, q.headZ || 0, 'YXZ');
    j.shL.rotation.set(q.shLx || 0, q.shLy || 0, q.shLz ?? 0.1);
    j.shR.rotation.set(q.shRx || 0, q.shRy || 0, q.shRz ?? -0.1);
    j.elL.rotation.set(q.elL ?? -0.15, 0, 0);
    j.elR.rotation.set(q.elR ?? -0.15, 0, 0);
    j.hipL.rotation.set(q.hipL || 0, 0, q.hipLz || 0);
    j.hipR.rotation.set(q.hipR || 0, 0, q.hipRz || 0);
    j.knL.rotation.set(q.knL || 0, 0, 0);
    j.knR.rotation.set(q.knR || 0, 0, 0);
  }

  return { makePerson, setPose, M, add, box, cyl, ico, sph };
}

// ---------------- animações (pose = f(t)) ----------------
const S = Math.sin, PI2 = Math.PI * 2;
const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const SIT = { rootY: -0.47, hipL: -1.5, hipR: -1.5, knL: 1.5, knR: 1.5 };

export const ANIM = {
  parado: (t, ph) => ({ spineX: 0.02 * S(t * 1.4 + ph), headX: 0.03 * S(t * 0.7 + ph), shLz: 0.1, shRz: -0.1 }),
  andar(t, ph, f = 0.9) {
    const p = t * f * PI2 + ph;
    return { hipL: -0.45 * S(p), hipR: 0.45 * S(p), knL: 0.7 * Math.max(0, S(p + 1.3)), knR: 0.7 * Math.max(0, S(p + 1.3 + Math.PI)),
      shLx: 0.4 * S(p), shRx: -0.4 * S(p), elL: -0.35, elR: -0.35, rootY: 0.03 * Math.abs(Math.cos(p)), spineX: 0.06 };
  },
  correr(t, ph) { const q = ANIM.andar(t, ph, 1.5); return { ...q, hipL: q.hipL * 1.6, hipR: q.hipR * 1.6, knL: q.knL * 1.6, knR: q.knR * 1.6, shLx: q.shLx * 1.8, shRx: q.shRx * 1.8, elL: -1.4, elR: -1.4, spineX: 0.2 }; },
  capinar(t, ph) {
    const c = (t * 0.6 + ph) % 1, a = c < 0.6 ? sm(0, 0.6, c) : 1 - sm(0.6, 0.72, c);
    return { spineX: 0.35 + 0.2 * (1 - a), shLx: -0.5 - 1.7 * a, shRx: -0.5 - 1.7 * a, shLz: -0.25, shRz: 0.15, elL: -0.5, elR: -0.3, hipL: -0.25, hipR: 0.15, knL: 0.3, knR: 0.1, headX: 0.25 };
  },
  martelar(t) { // a batida cai exatamente em t inteiro (sincronizada com o som "martelo")
    const c = (t + 0.15) % 1, a = c < 0.75 ? sm(0, 0.75, c) : 1 - sm(0.75, 0.85, c);
    return { spineX: 0.25, shRx: -0.6 - 2.0 * a, shRz: -0.15, elR: -0.9 + 0.5 * a, shLx: -1.0, shLz: -0.15, elL: -0.7, headX: 0.35 };
  },
  mexer: (t) => ({ spineX: 0.15, shRx: -1.0 + 0.18 * S(t * 5), shRy: 0.35 * Math.cos(t * 5), elR: -0.9, shLz: 0.55, elL: -1.4, headX: 0.3, hipL: 0, hipR: 0 }),
  binoculo: (t) => ({ shLx: -1.55, shRx: -1.55, shLz: -0.45, shRz: 0.45, elL: -1.9, elR: -1.9, headY: 0.45 * S(t * 0.35), spineY: 0.2 * S(t * 0.35), headX: -0.05 }),
  violao: (t) => ({ ...SIT, shLx: -0.8, shLy: -0.2, shLz: -0.3, elL: -1.5, shRx: -0.4 + 0.15 * S(t * PI2 * 2.2), shRz: -0.25, elR: -1.2, headX: 0.3, headZ: 0.08 * S(t * 1.1), spineX: 0.12 }),
  sentado: (t, ph) => ({ ...SIT, shLx: -0.35, shRx: -0.35, elL: -0.9, elR: -0.9, spineX: 0.1 + 0.02 * S(t + ph), headX: 0.05 * S(t * 0.6 + ph) }),
  radio: (t) => ({ ...SIT, shLx: -0.9, shRx: -0.75 + 0.05 * S(t * 3), elL: -0.8, elR: -0.9, spineX: 0.22, headX: 0.15 + 0.06 * S(t * 1.7), shLz: S(t * 0.4) > 0.6 ? 1.0 : 0.1 }),
  prancheta: (t) => ({ shLx: -0.85, elL: -1.3, shLz: -0.2, shRx: -0.7, elR: -1.2 + 0.08 * S(t * 9), shRz: 0.15, headX: 0.35 + 0.05 * S(t * 0.5) }),
  carregar: (t, ph) => ({ ...ANIM.andar(t, ph, 0.8), shLx: -1.0, shRx: -1.0, shLz: -0.1, shRz: 0.1, elL: -0.6, elR: -0.6, spineX: -0.05 }),
  acenar: (t, ph) => ({ ...ANIM.parado(t, ph), shRz: -2.65 + 0.25 * S(t * 8), shRx: -0.2, elR: -0.35 + 0.3 * S(t * 8 + 1) }),
  dancar: (t, ph) => { const b = t * PI2 * 1.33 + ph; return { rootY: 0.05 * Math.abs(S(b)), spineZ: 0.15 * S(b / 2), hipsY: 0.2 * S(b / 2), shLz: 2.0 + 0.5 * S(b), shRz: -2.0 - 0.5 * S(b + 1), elL: -0.6, elR: -0.6, knL: 0.3 * Math.max(0, S(b)), knR: 0.3 * Math.max(0, -S(b)), headZ: 0.12 * S(b / 2) }; },
  plantar: (t, ph) => ({ rootY: -0.45, hipL: -1.7, hipR: -0.4, knL: 2.3, knR: 1.5, spineX: 0.55, shLx: -1.2 + 0.25 * S(t * 2.5 + ph), shRx: -1.0 - 0.25 * S(t * 2.5 + ph), elL: -0.3, elR: -0.3, headX: 0.4 }),
  estender: (t, ph) => { const c = (t * 0.35 + ph) % 1, up = c < 0.6; return { shLx: up ? -2.7 : -0.8, shRx: up ? -2.7 : -0.8, elL: up ? -0.2 : -1.0, elR: up ? -0.2 : -1.0, headX: up ? -0.45 : 0.3, spineX: up ? -0.08 : 0.2 }; },
  painel: (t) => ({ rootY: -0.45, hipL: -1.7, hipR: -1.7, knL: 2.4, knR: 2.4, spineX: 0.5, shLx: -1.3, shRx: -1.2 + 0.2 * S(t * 4), elL: -0.4, elR: -0.5, headX: 0.45 }),
  alimentar: (t) => { const c = (t * 0.7) % 1, th = c > 0.7; return { shLx: -1.0, elL: -1.4, shLz: -0.2, shRx: th ? -1.6 : -0.6, shRz: th ? -0.5 : -0.15, elR: th ? -0.2 : -0.9, headX: 0.3, spineX: 0.1 }; },
  fantasma: (t, ph) => ({ ...ANIM.parado(t, ph), shLz: 0.18, shRz: -0.18 }),
  machadar(t, ph) { const c = (t * 0.85 + ph) % 1, a = c < 0.65 ? sm(0, 0.65, c) : 1 - sm(0.65, 0.78, c);
    return { spineY: -0.5 + 0.9 * (1 - a), spineX: 0.15, shRx: -0.9 - 1.0 * a, shRz: -0.6 * a, elR: -0.6, shLx: -1.1 - 0.6 * a, shLz: -0.2, elL: -0.5, hipL: -0.2, hipR: 0.15, knL: 0.2, headY: 0.2 }; },
  picaretar(t, ph) { const c = (t * 0.7 + ph) % 1, a = c < 0.7 ? sm(0, 0.7, c) : 1 - sm(0.7, 0.8, c);
    return { spineX: 0.3 + 0.25 * (1 - a), shRx: -0.6 - 2.1 * a, shLx: -0.7 - 2.0 * a, shRz: 0.1, shLz: -0.1, elR: -0.4, elL: -0.4, hipL: -0.25, knL: 0.25, headX: 0.25 }; },
  guarda: (t, ph) => ({ spineX: 0.08, shRx: -0.75, elR: -0.9, shRz: -0.1, shLx: -0.6, shLz: -0.15, elL: -1.4, hipL: -0.3, knL: 0.35, hipR: 0.2, knR: 0.15, headY: 0.35 * Math.sin(t * 0.6 + ph), rootY: -0.04 + 0.01 * Math.sin(t * 1.5 + ph) }),
  lanca: (t, ph) => ({ spineX: 0.05, shRx: -0.35, elR: -1.0, shRz: -0.12, shLz: 0.15, hipL: -0.2, knL: 0.2, headY: 0.3 * Math.sin(t * 0.5 + ph) }),
  lutar: (t, ph) => { const b = Math.sin(t * 6 + ph); return { spineX: 0.15, shRx: -1.3 + 0.15 * b, elR: -1.9, shLx: -1.4 - 0.15 * b, elL: -1.9, shLz: -0.2, shRz: 0.2, hipL: -0.35, knL: 0.4, hipR: 0.25, rootY: 0.02 * Math.abs(b) - 0.03, headX: 0.1 }; },
  mirar: (t, ph) => ({ spineY: -0.5, shLx: -1.55, shLz: -0.15, elL: -0.05, shRx: -1.45, shRz: 0.65, elR: -2.1, headY: 0.45, headX: -0.05 + 0.02 * Math.sin(t * 3 + ph), hipL: -0.2, hipR: 0.2 }),
  fuzil: (t, ph) => ({ spineX: 0.05, shRx: -1.0, elR: -1.3, shRz: 0.1, shLx: -1.25, shLz: -0.45, elL: -0.9, headY: 0.4 * Math.sin(t * 0.5 + ph), hipL: -0.2, knL: 0.2 }),
  carregarTora: (t, ph, f = 0.85) => ({ ...ANIM.andar(t, ph, f), shRx: -2.6, shRz: -0.1, elR: -1.9, shLx: -0.35, spineX: 0.1, spineZ: 0.08 }),
  olhar: (t, ph) => ({ ...ANIM.parado(t, ph), headY: 0.9 * Math.sin(t * 0.9), spineY: 0.25 * Math.sin(t * 0.9), headX: -0.1, shLz: 0.25, shRz: -0.25, elL: -1.6, elR: -1.6, shLx: -0.3, shRx: -0.3 }),
  assustado: (t, ph) => ({ spineX: -0.15, shLx: -1.2, shRx: -1.2, shLz: -0.3, shRz: 0.3, elL: -1.2, elR: -1.2, hipL: -0.35, knL: 0.4, hipR: 0.25, headX: -0.15 + 0.04 * Math.sin(t * 9), headY: 0.35 * Math.sin(t * 1.3) }),
  apontar: (t, ph) => ({ ...ANIM.parado(t, ph), shRx: -1.5, shRz: -0.1, elR: -0.05, headY: -0.15 }),
  zumbi(t, ph, f = 0.55) { const p = t * f * PI2 + ph; const jerk = Math.pow(Math.max(0, Math.sin(t * 1.3 + ph * 3)), 12) * 0.8;
    return { hipL: -0.35 * S(p), hipR: 0.18 * S(p), knL: 0.5 * Math.max(0, S(p + 1.3)), knR: 0.25 * Math.max(0, S(p + 1.3 + Math.PI)), spineX: 0.3, spineZ: 0.15 * S(p * 0.5),
      shLx: -1.45 + 0.15 * S(p * 1.7), shRx: -1.5 + 0.15 * S(p * 1.3 + 1), shLz: -0.1, shRz: 0.1, elL: -0.2, elR: -0.3, headX: 0.35, headZ: 0.3 * S(ph) + jerk, rootY: 0.03 * Math.abs(Math.cos(p)) }; },
};

// ---------------- papéis (função comentada -> visual + equipamento + animação) ----------------
export const PAPEIS = {
  cacador:     { rotulo: 'Caçador',     v: { hat: 'bandana', hatColor: '#556b2f', topColor: '#556b2f', top2: '#4a3b2a', pants: '#4a3b2a', aljava: true, toolL: 'arco' }, anim: 'parado', noite: 'mirar' },
  arqueiro:    { rotulo: 'Arqueiro',    v: { hat: 'bone', hatColor: '#2c3e50', topColor: '#2e4053', aljava: true, toolL: 'arco' }, anim: 'parado', noite: 'mirar' },
  construtor:  { rotulo: 'Construtor',  v: { hat: 'capacete', colete: '#e67e22', cinto: true, tool: 'martelo' }, anim: 'martelar', noite: 'parado' },
  lenhador:    { rotulo: 'Lenhador',    v: { hat: 'gorro', hatColor: '#b03a2e', topColor: '#b03a2e', top: 'manga_longa', beard: true, tool: 'machado' }, anim: 'machadar', noite: 'parado' },
  guardiao:    { rotulo: 'Guardião',    v: { colete: '#2c3e50', topColor: '#34495e', tool: 'lanca', toolL: 'escudo' }, anim: 'lanca', noite: 'lanca' },
  espadachim:  { rotulo: 'Espadachim',  v: { hat: 'bandana', hatColor: '#1b2631', colete: '#5d4e37', tool: 'espada', toolL: 'escudo' }, anim: 'guarda', noite: 'guarda' },
  lutador:     { rotulo: 'Lutador',     v: { hat: 'bandana', hatColor: '#c0392b', top: 'regata', topColor: '#1b2631' }, anim: 'lutar', noite: 'lutar' },
  militar:     { rotulo: 'Militar',     v: { hat: 'militar', colete: '#4b5d3a', topColor: '#556b2f', pants: '#4b5d3a', shoes: '#1a1a1a', tool: 'rifle' }, anim: 'fuzil', noite: 'fuzil' },
  cozinheiro:  { rotulo: 'Cozinheiro',  v: { hat: 'chef', apron: '#f2f2f2', tool: 'concha' }, anim: 'mexer', noite: 'mexer' },
  agricultor:  { rotulo: 'Agricultor',  v: { hat: 'chapeu', tool: 'enxada' }, anim: 'capinar', noite: 'parado' },
  minerador:   { rotulo: 'Minerador',   v: { hat: 'mineiro', colete: '#7f8c8d', tool: 'picareta' }, anim: 'picaretar', noite: 'parado' },
  medico:      { rotulo: 'Médico',      v: { coat: true, tool: 'maleta' }, anim: 'parado', noite: 'parado' },
  ajudante:    { rotulo: 'Ajudante',    v: { hat: 'bone', tool: 'tora' }, anim: 'carregarTora', noite: 'parado' },
  criador:     { rotulo: 'Criador',     v: { hat: 'chapeu', tool: 'milho' }, anim: 'alimentar', noite: 'parado' },
  morador:     { rotulo: 'Morador',     v: {}, anim: 'parado', noite: 'sentado' },
};
// traduz o que a pessoa escreveu ("quero ser o matador de zumbis") para um papel
export function funcaoParaPapel(txt = '') {
  const t = txt.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const regras = [
    [/arque/, 'arqueiro'], [/caca|caçad/, 'cacador'], [/lenha/, 'lenhador'], [/constru|contru/, 'construtor'],
    [/espad/, 'espadachim'], [/luta|atacant/, 'lutador'], [/atirad|militar|armeir|soldad|selva/, 'militar'],
    [/guard|protet|proteg|matador|mata de zumbi|guardi/, 'guardiao'], [/cozin|chef|comida/, 'cozinheiro'],
    [/plant|cultiv|agric|horta|jardin/, 'agricultor'], [/miner/, 'minerador'], [/medic/, 'medico'],
    [/ajudan/, 'ajudante'], [/criad/, 'criador'],
  ];
  for (const [re, p] of regras) if (re.test(t)) return p;
  return 'morador';
}
