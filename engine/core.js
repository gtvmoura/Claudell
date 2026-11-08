// Núcleo do renderizador "E Se...".
// Regra de ouro: renderFrame(t) monta o quadro INTEIRO a partir do tempo t.
// Nada depende do quadro anterior, nem de relógio, nem de Math.random —
// então renderizar o mesmo t duas vezes produz exatamente a mesma imagem.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const W = 1080, H = 1920;
export const EYE_HEIGHT = 1.6; // metros — a câmera é o espectador

// ---------- utilidades determinísticas ----------
export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const EASE = {
  linear: k => k,
  in: k => k * k * k,
  out: k => 1 - Math.pow(1 - k, 3),
  inOut: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  back: k => { const c = 1.4; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
};
const DEG = Math.PI / 180;

// ---------- estado ----------
let script, renderer, scene, camera, world, camKeys, events, composer, finalPass, bloomPass;
const $ = s => document.querySelector(s);

// ---------- câmera: um movimento por legenda ----------
// Pose: { pos: [x, z] ou [x, y, z], yaw (graus), pitch (graus), fov, roll }
//   ou  { pos, look: [x, y, z] }  -> yaw/pitch calculados para mirar no ponto.
// yaw 0 = olhando para -Z; yaw positivo gira para a esquerda.
function unwrap(a, ref) { while (a - ref > 180) a -= 360; while (a - ref < -180) a += 360; return a; }
function normPose(p, prev) {
  // pose dinâmica: segue um personagem da cena (câmera de drone)
  if (p && p.follow) return { follow: p.follow, offset: p.offset || [0, 6, 8], lookOffset: p.lookOffset || [0, 1.1, 0], fov: p.fov ?? prev?.fov ?? 70, roll: p.roll || 0 };
  const base = prev && !prev.follow ? prev : { pos: [0, EYE_HEIGHT, 0], yaw: prev?.yaw ?? 0, pitch: 0, fov: prev?.fov ?? 70, roll: 0 };
  const out = { ...base, ...p };
  delete out.look;
  if (p && p.pos) out.pos = p.pos.length === 2 ? [p.pos[0], EYE_HEIGHT, p.pos[1]] : p.pos.slice();
  if (p && p.look) {
    const dx = p.look[0] - out.pos[0], dy = p.look[1] - out.pos[1], dz = p.look[2] - out.pos[2];
    out.yaw = Math.atan2(-dx, -dz) / DEG;
    out.pitch = Math.atan2(dy, Math.hypot(dx, dz)) / DEG;
  }
  out.yaw = unwrap(out.yaw, base.yaw); // sempre gira pelo caminho mais curto
  return out;
}
function buildCameraKeys(s) {
  const segs = [];
  let pose = normPose(s.camera?.start);
  const start = pose;
  const moves = [];
  if (s.title?.camera) moves.push({ start: 0, end: s.title.duration, cam: s.title.camera });
  for (const c of s.captions) if (c.camera) moves.push({ start: c.start, end: c.end, cam: c.camera });
  moves.sort((a, b) => a.start - b.start);
  for (const m of moves) {
    const t0 = m.start + (m.cam.delay || 0);
    const t1 = m.cam.duration != null ? t0 + m.cam.duration : m.end;
    const to = normPose(m.cam.to, pose);
    segs.push({ t0, t1, a: pose, b: to, ease: EASE[m.cam.ease || 'inOut'], shake: m.cam.shake ?? 0.15 });
    pose = to;
  }
  return { start, segs };
}
// resolve uma pose (estática ou seguindo um personagem) no instante t
function resolvePose(p, t) {
  if (!p.follow) return p;
  const c = world.track(p.follow, t);
  const pos = [c[0] + p.offset[0], c[1] + p.offset[1], c[2] + p.offset[2]];
  const L = [c[0] + p.lookOffset[0], c[1] + p.lookOffset[1], c[2] + p.lookOffset[2]];
  const dx = L[0] - pos[0], dy = L[1] - pos[1], dz = L[2] - pos[2];
  return { pos, yaw: Math.atan2(-dx, -dz) / DEG, pitch: Math.atan2(dy, Math.hypot(dx, dz)) / DEG, fov: p.fov, roll: p.roll };
}
function cameraAt(t) {
  const { start, segs } = camKeys;
  let pose = resolvePose(start, t), shake = segs.length ? segs[0].shake : 0.15, walked = 0;
  for (const s of segs) {
    if (t >= s.t1) { pose = resolvePose(s.b, t); shake = s.shake; continue; }
    if (t >= s.t0) {
      const k = s.ease(clamp((t - s.t0) / Math.max(1e-6, s.t1 - s.t0)));
      const A = resolvePose(s.a, t), B = resolvePose(s.b, t);
      const by = unwrap(B.yaw, A.yaw);
      pose = {
        pos: [0, 1, 2].map(i => lerp(A.pos[i], B.pos[i], k)),
        yaw: lerp(A.yaw, by, k), pitch: lerp(A.pitch, B.pitch, k),
        fov: lerp(A.fov, B.fov, k), roll: lerp(A.roll || 0, B.roll || 0, k),
      };
      shake = s.shake;
      if (!s.a.follow && !s.b.follow && (script.camera?.bob ?? true)) walked = Math.hypot(B.pos[0] - A.pos[0], B.pos[2] - A.pos[2]) * k;
      break;
    }
    break; // antes do próximo movimento: segura a pose anterior
  }
  // impactos (efeito "shake" no roteiro) somam tremor que decai
  let hit = 0;
  for (const e of script.effects || []) if (e.type === 'shake' && t >= e.t && t < e.t + e.dur) hit += (e.amp ?? 2) * Math.pow(1 - (t - e.t) / e.dur, 2);
  const n = (f, p) => Math.sin(t * f + p);
  const sh = shake + hit;
  const sy = sh * (0.6 * n(1.3, 0.2) + 0.3 * n(2.9, 1.7) + 0.1 * n(7.1, 4.0)) + hit * 0.5 * n(31, 1);
  const sp = sh * (0.6 * n(1.1, 2.1) + 0.3 * n(3.3, 0.4) + 0.1 * n(6.7, 2.2)) + hit * 0.5 * n(37, 2);
  const breath = 0.006 * Math.sin(t * 1.6); // respiração
  const bob = Math.sin(walked * Math.PI / 0.75) * 0.035 * clamp(walked * 4);
  return { ...pose, pos: [pose.pos[0], pose.pos[1] + bob + breath, pose.pos[2]], yaw: pose.yaw + sy, pitch: pose.pitch + sp, roll: (pose.roll || 0) + hit * 0.6 * n(23, 3) };
}

// ---------- eventos do roteiro ----------
function makeEvents(s) {
  const map = {};
  for (const e of s.events || []) map[e.id] = e.t;
  return { at: id => (id in map ? map[id] : Infinity), since: (id, t) => t - (id in map ? map[id] : Infinity) };
}

// ---------- sobreposição 2D ----------
function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function rich(s) { return esc(s).replace(/\*(.+?)\*/g, '<span class="hl">$1</span>'); }
// quebra "texto com *destaque*" em palavras [{w, hl}]
function words(s) {
  const out = []; let hl = false;
  let prevSpace = true; // o texto anterior terminou em espaço?
  for (const part of s.split(/(\*)/)) {
    if (part === '*') { hl = !hl; continue; }
    if (!part) continue;
    part.split(/(\s+)/).forEach((w, i) => {
      if (!w || /^\s+$/.test(w)) return;
      const glue = i === 0 && out.length > 0 && !prevSpace; // ex.: "*Redentor*," -> vírgula colada
      out.push({ w, hl, glue });
    });
    prevSpace = /\s$/.test(part);
  }
  return out;
}
// palavras coladas (ex.: "Comunidade" + ".") ficam no MESMO bloco, para nunca quebrar a linha entre elas
function wordsHTML(s) {
  const groups = [];
  for (const t of words(s)) { if (t.glue && groups.length) groups[groups.length - 1].push(t); else groups.push([t]); }
  return groups.map(g => `<span class="w">${g.map(({ w, hl }) => hl ? `<span class="hl">${esc(w)}</span>` : esc(w)).join('')}</span>`).join(' ');
}

function counterAt(t) {
  const c = script.counter; if (!c) return null;
  const k = c.keys;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const u = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      const a = k[i - 1][1], b = k[i][1];
      return a > 0 && b > 0 && c.curve === 'exp' ? a * Math.pow(b / a, u) : lerp(a, b, u);
    }
  }
  return k[k.length - 1][1];
}
function fmtCounter(v) {
  const n = Math.round(v);
  if (script.counter.format === 'clock') { const h = Math.floor(n / 60), m = n % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
  return n.toLocaleString('pt-BR');
}

let capCache = null;
function updateOverlay(t) {
  const s = script;
  const td = s.title.duration;
  // título com "pancada": E SE... bate na tela, a pergunta entra palavra por palavra
  const tc = $('#titlecard');
  const tout = clamp((td - t) / 0.3);
  tc.style.opacity = tout;
  const kick = clamp(t / 0.22);
  const kEl = $('#titlecard .kicker');
  kEl.style.transform = `scale(${lerp(2.2, 1, EASE.out(kick))}) rotate(${(1 - kick) * -6}deg)`;
  kEl.style.opacity = kick;
  const tw = tc.querySelectorAll('.q .w');
  tw.forEach((el, i) => { const k = clamp((t - 0.25 - i * 0.06) / 0.16); el.style.opacity = k; el.style.transform = `translateY(${(1 - EASE.out(k)) * 30}px) scale(${0.85 + 0.15 * EASE.back(k)})`; });

  const choiceOn = (s.choice && t >= s.choice.start) || (s.endcard && t >= s.endcard.start);
  const hk = clamp((t - td) / 0.4);
  $('#header').style.opacity = choiceOn ? 0 : hk;
  $('#header').style.transform = `translateY(${(1 - EASE.out(hk)) * -20}px)`;
  if (s.counter) {
    const cv = counterAt(t);
    const showAt = s.counter.showAt ?? td;
    const ck = t >= showAt && !choiceOn ? clamp((t - showAt) / 0.3) : 0;
    $('#counter').style.opacity = ck;
    $('#counter .value').textContent = fmtCounter(cv);
    const pulse = t > (s.counter.pulseFrom ?? 1e9) ? 1 + 0.04 * Math.max(0, Math.sin(t * 9)) : 1;
    $('#counter .value').style.transform = `scale(${pulse})`;
    $('#counter .dot').style.opacity = Math.sin(t * Math.PI * 2) > 0 ? 1 : 0.25;
  }
  // card de comentário
  { const cm = (s.comentarios || []).find(c => t >= c.start && t < c.end), el = $('#comment');
    if (cm) { if (el.dataset.k !== String(cm.start)) { el.dataset.k = String(cm.start); el.querySelector('.av').textContent = (cm.user || '?').trim()[0].toUpperCase(); el.querySelector('.av').style.background = cm.cor || '#6c5ce7'; el.querySelector('.user').textContent = cm.user; el.querySelector('.txt').textContent = cm.text; }
      const k = clamp((t - cm.start) / 0.35), o = clamp((cm.end - t) / 0.3); el.style.opacity = Math.min(k, o); el.style.transform = `translateY(${(1 - EASE.out(k)) * -40}px) scale(${0.85 + 0.15 * EASE.back(k)})`;
    } else el.style.opacity = 0; }
  // medidor (ex.: comida acabando)
  if (s.medidor) {
    const m = s.medidor, K = m.keys; let v = K[K.length - 1][1];
    if (t <= K[0][0]) v = K[0][1]; else for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { v = lerp(K[i - 1][1], K[i][1], (t - K[i - 1][0]) / (K[i][0] - K[i - 1][0])); break; }
    let txt = ''; for (const [tt, tx] of m.textos || []) if (t >= tt) txt = tx;
    const show = t >= (m.showAt ?? 0) && !choiceOn ? clamp((t - (m.showAt ?? 0)) / 0.4) : 0;
    $('#meter').style.opacity = show; $('#meter .label').textContent = m.label;
    $('#meter .bar i').style.width = (clamp(v) * 100).toFixed(1) + '%'; $('#meter .txt').textContent = txt;
  }
  // legenda: palavras entram uma a uma (estilo shorts)
  const cap = s.captions.find(c => t >= c.start && t < c.end);
  const el = $('#caption');
  if (cap && !(choiceOn && cap.hideOnChoice !== false)) {
    if (capCache !== cap) {
      capCache = cap;
      el.innerHTML = wordsHTML(cap.text);
    }
    el.style.top = (cap.y ?? 1180) + 'px';
    const out = clamp((cap.end - t) / 0.15);
    el.style.opacity = out;
    const ws = el.querySelectorAll('.w');
    const step = Math.min(0.09, (cap.end - cap.start) * 0.45 / Math.max(1, ws.length));
    ws.forEach((w, i) => {
      const k = clamp((t - cap.start - i * step) / 0.14);
      w.style.opacity = k;
      w.style.transform = `translateY(${(1 - EASE.out(k)) * 18}px) scale(${0.7 + 0.3 * EASE.back(k)})`;
    });
  } else { el.style.opacity = 0; }
  // escolha A/B
  const ch = $('#choice');
  if (s.choice && t >= s.choice.start) {
    const u = t - s.choice.start;
    ch.style.opacity = clamp(u / 0.4);
    const items = [['.ask', 0.0], ['.opt.a', 0.35], ['.opt.b', 0.7], ['.cta', 1.2], ['.sub', 1.5]];
    for (const [sel, d] of items) {
      const k = clamp((u - d) / 0.3);
      const e = ch.querySelector(sel);
      e.style.opacity = k;
      const bump = sel === '.cta' ? 1 + 0.05 * Math.max(0, Math.sin((u - d) * 6)) * clamp(u - d - 0.3) : 1;
      const slide = sel.startsWith('.opt') ? `translateX(${(1 - EASE.out(k)) * (sel === '.opt.a' ? -120 : 120)}px) ` : '';
      e.style.transform = `${slide}scale(${(0.7 + 0.3 * EASE.back(k)) * bump})`;
    }
    // "A" e "B" pulsam alternadamente
    ch.querySelector('.opt.a').style.boxShadow = `0 0 ${20 + 40 * Math.max(0, Math.sin(u * 4))}px rgba(255,60,60,.8)`;
    ch.querySelector('.opt.b').style.boxShadow = `0 0 ${20 + 40 * Math.max(0, Math.sin(u * 4 + Math.PI))}px rgba(60,255,120,.7)`;
  } else ch.style.opacity = 0;
  // cartão final de chamada
  const ec = $('#endcard');
  if (s.endcard && t >= s.endcard.start) {
    const u = t - s.endcard.start;
    ec.style.opacity = clamp(u / 0.4);
    const el1 = ec.querySelector('.t1'), k1 = clamp(u / 0.3);
    el1.style.transform = `scale(${lerp(1.8, 1, EASE.out(k1))})`; el1.style.opacity = k1;
    ec.querySelectorAll('.line').forEach((ln, i) => { const k = clamp((u - 0.5 - i * 0.35) / 0.3); ln.style.opacity = k; ln.style.transform = `translateX(${(1 - EASE.out(k)) * (i % 2 ? 140 : -140)}px)`; });
    for (const [sel, d] of [['.cta', 1.6], ['.sub', 2.0]]) { const k = clamp((u - d) / 0.3); const e = ec.querySelector(sel); e.style.opacity = k; e.style.transform = `scale(${(0.8 + 0.2 * EASE.back(k)) * (sel === '.cta' ? 1 + 0.04 * Math.max(0, Math.sin((u - d) * 6)) * clamp(u - d - 0.3) : 1)})`; }
  } else ec.style.opacity = 0;
  // etiquetas presas aos personagens (posição 3D -> tela)
  // flash
  let f = 0;
  for (const e of s.effects || []) if (e.type === 'flash' && t >= e.t && t < e.t + e.dur) f = Math.max(f, (1 - (t - e.t) / e.dur) * (e.strength ?? 0.6));
  $('#flash').style.opacity = f;
}

// Etiquetas presas aos personagens: desenhadas num canvas 2D (determinístico, sem camadas do compositor)
const _v = new THREE.Vector3();
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function drawTag(g, L) {
  const vaga = L.kind === 'vaga';
  g.font = '900 34px Montserrat'; const wN = g.measureText(L.text).width + 36;
  let wS = 0; if (L.sub) { g.font = '800 24px Montserrat'; wS = g.measureText(L.sub).width + 26; }
  const hN = 48, hS = 32, arrow = 12;
  let y = -arrow;
  // seta
  g.fillStyle = vaga ? '#ffffff' : '#ffd400';
  g.beginPath(); g.moveTo(-10, y - 1); g.lineTo(10, y - 1); g.lineTo(0, 0); g.closePath(); g.fill();
  if (L.sub) {
    y -= hS + 2;
    g.fillStyle = vaga ? '#ffffff' : '#ffd400'; rrect(g, -wS / 2, y, wS, hS, 10); g.fill();
    g.fillStyle = '#111111'; g.font = '800 24px Montserrat'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L.sub, 0, y + hS / 2 + 1);
    y -= 4;
  }
  y -= hN;
  g.fillStyle = vaga ? 'rgba(255,255,255,0.14)' : 'rgba(15,18,24,0.80)'; rrect(g, -wN / 2, y, wN, hN, 14); g.fill();
  g.lineWidth = 3; g.strokeStyle = vaga ? '#ffffff' : '#ffd400';
  if (vaga) g.setLineDash([10, 7]); rrect(g, -wN / 2, y, wN, hN, 14); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#ffffff'; g.font = '900 34px Montserrat'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L.text, 0, y + hN / 2 + 2);
}
// As etiquetas são desenhadas num canvas FORA da página e entram na imagem pelo passe final do WebGL.
// Assim não dependem da composição de camadas do navegador (que às vezes mostrava a camada antiga).
const labelCanvas = document.createElement("canvas"); labelCanvas.width = W; labelCanvas.height = H;
// canvas em memória comum (sem cópia na placa de vídeo): zerar sempre zera de verdade
const labelCtx = labelCanvas.getContext("2d", { willReadFrequently: true });
let labelTex = null;
function updateLabels(t, hideAll) {
  const cap = script.captions.find(c => t >= c.start && t < c.end);
  const capOn = !!cap, capTop = cap ? (cap.y ?? 1180) : 0;
  const cv = labelCanvas;
  const g = labelCtx;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, W, H); // zera o canvas a cada quadro
  const list = (!hideAll && world.labels) ? world.labels(t) : [];
  const items = [];
  for (const L of list) {
    _v.set(L.pos[0], L.pos[1], L.pos[2]);
    const dist = _v.distanceTo(camera.position);
    _v.project(camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.15 || Math.abs(_v.y) > 1.1) continue;
    const near = L.near ?? 3, far = L.far ?? 16;
    const a = Math.min(clamp((dist - near * 0.6) / (near * 0.4)), 1 - clamp((dist - far) / 4)) * (L.alpha ?? 1);
    const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    const edge = Math.min(clamp((x - 170) / 90), clamp((W - 170 - x) / 90), clamp((y - 330) / 80)); // nunca cortada na borda
    const capBand = capOn ? Math.max(clamp((capTop - 60 - y) / 70), clamp((y - capTop - 330) / 60)) : 1; // não briga com a legenda
    if (a * edge * capBand <= 0.01) continue;
    items.push({ L, x, y, dist, alpha: a * edge * capBand, sc: clamp(12 / Math.max(dist, 1), 0.72, 1.05) });
  }
  // sem amontoar: os mais próximos têm prioridade; etiqueta que cobre outra já escolhida não aparece
  items.sort((p, q) => p.dist - q.dist || (p.L.id < q.L.id ? -1 : 1));
  const kept = [], rects = [];
  for (const it of items) {
    const w = (Math.max(it.L.text.length * 21, (it.L.sub || '').length * 15) + 46) * it.sc, h = (it.L.sub ? 104 : 66) * it.sc;
    const r = [it.x - w / 2, it.y - h, it.x + w / 2, it.y];
    if (rects.some(q => Math.max(0, Math.min(r[2], q[2]) - Math.max(r[0], q[0])) * Math.max(0, Math.min(r[3], q[3]) - Math.max(r[1], q[1])) > 0.12 * w * h)) continue;
    rects.push(r); kept.push(it);
    if (kept.length >= (script.maxEtiquetas ?? 12)) break;
  }
  items.length = 0; items.push(...kept);
  items.sort((p, q) => q.dist - p.dist || (p.L.id < q.L.id ? -1 : 1)); // desenha de longe para perto
  for (const it of items) {
    g.setTransform(it.sc, 0, 0, it.sc, Math.round(it.x), Math.round(it.y));
    g.globalAlpha = it.alpha;
    drawTag(g, it.L);
  }
  g.globalAlpha = 1; g.setTransform(1, 0, 0, 1, 0, 0);
}

function fillStatic() {
  const s = script;
  $('#titlecard .kicker').textContent = s.title.kicker || 'E SE...';
  $('#titlecard .q').innerHTML = wordsHTML(s.title.text);
  $('#header .ep').textContent = s.episode?.label || '';
  $('#header .short').textContent = s.title.short || '';
  if (s.counter) $('#counter .label span').textContent = s.counter.label;
  if (s.endcard) {
    $('#endcard .t1').innerHTML = rich(s.endcard.title);
    $('#endcard .lines').innerHTML = (s.endcard.lines || []).map((l, i) => `<div class="line"><b>${i + 1}</b><span>${rich(l)}</span></div>`).join('');
    $('#endcard .cta').innerHTML = rich(s.endcard.cta || '');
    $('#endcard .sub').innerHTML = rich(s.endcard.sub || '');
  }
  if (s.choice) {
    $('#choice .ask').textContent = s.choice.ask || 'O QUE VOCÊ FAZ?';
    $('#choice .opt.a .txt').textContent = s.choice.a;
    $('#choice .opt.b .txt').textContent = s.choice.b;
    $('#choice .cta').textContent = s.choice.cta || 'COMENTE A OU B';
    $('#choice .sub').textContent = s.choice.sub || '';
  }
}

// ---------- pós-processamento ----------
// Um único passe final (mais barato no Chrome sem GPU): tone mapping ACES + sRGB + FXAA + cor + vinheta + grão.
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, tLabels: { value: null }, uTime: { value: 0 }, uTension: { value: 0 }, uExposure: { value: 1 }, uTexel: { value: new THREE.Vector2(1 / W, 1 / H) }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse, tLabels; uniform float uTime, uTension, uExposure; uniform vec2 uTexel, uRes; varying vec2 vUv;
    vec3 acesFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
    vec3 toneMap(vec3 c){
      const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
      const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
      c = clamp(O * acesFit(I * (c * uExposure / 0.6)), 0.0, 1.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); // sRGB
    }
    vec3 T(vec2 uv){ return toneMap(texture2D(tDiffuse, uv).rgb); }
    float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      // FXAA simplificado (5 amostras)
      vec3 cM = T(vUv);
      float lM = luma(cM);
      float lNW = luma(T(vUv + uTexel*vec2(-1.,-1.))), lNE = luma(T(vUv + uTexel*vec2(1.,-1.)));
      float lSW = luma(T(vUv + uTexel*vec2(-1.,1.))),  lSE = luma(T(vUv + uTexel*vec2(1.,1.)));
      float lMin = min(lM, min(min(lNW,lNE), min(lSW,lSE))), lMax = max(lM, max(max(lNW,lNE), max(lSW,lSE)));
      vec3 c = cM;
      if (lMax - lMin > max(0.04, lMax * 0.1)) {
        vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
        float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + max((lNW+lNE+lSW+lSE)*0.03125, 0.0078125));
        dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
        c = 0.5 * (T(vUv + dir * (1.0/3.0 - 0.5)) + T(vUv + dir * (2.0/3.0 - 0.5)));
      }
      // cor: contraste + sombras azuladas / altas quentes
      float l = luma(c);
      c = mix(vec3(l), c, 1.12);
      c = (c - 0.5) * 1.08 + 0.5;
      c += vec3(-0.012, 0.0, 0.025) * (1.0 - l) + vec3(0.02, 0.008, -0.015) * l;
      // vinheta (fecha e avermelha com a tensão)
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, length(d * vec2(0.9, 1.1)));
      c *= mix(0.55, 1.0, v);
      c = mix(c, c * vec3(1.15, 0.75, 0.75), (1.0 - v) * uTension * 0.6);
      // grão determinístico (semente = tempo)
      c += (h(vUv * uRes + fract(uTime * 7.123) * 100.0) - 0.5) * 0.035;
      vec4 lab = texture2D(tLabels, vUv); // etiquetas (canvas 2D, sRGB, alfa não pré-multiplicado)
      c = mix(c, lab.rgb, lab.a);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// ---------- API pública chamada pelo Playwright ----------
window.loadScript = async (s) => {
  script = s;
  events = makeEvents(s);
  camKeys = buildCameraKeys(s);
  renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: s.post_fx?.logDepth ?? false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, W / H, 0.1, 80000);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  await document.fonts.load('900 60px Montserrat');
  await document.fonts.load('800 60px Montserrat');
  await document.fonts.load('60px Anton');
  await document.fonts.ready;
  const mod = await import(`./scenes/${s.scene}.js`);
  window.__three = { scene: null, renderer: null };
  world = await mod.build({ THREE, renderer, scene, camera, script: s, events, helpers: { rng, clamp, lerp, smooth, W, H } });
  fillStatic();
  { // aquece o canvas das etiquetas (fontes/glifos) para o 1º quadro sair igual aos demais
    const g = labelCtx;
    for (const kind of ['', 'vaga']) for (const sc of [0.72, 1.05]) { g.setTransform(sc, 0, 0, sc, 540, 960); g.globalAlpha = 0.5; drawTag(g, { text: '@ÁÉÍÓÚÃÕÇ áéíóúãõç 0123456789', sub: 'Função · ÂÊÔ nº', kind }); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, W, H);
  }
  window.__three = { scene, renderer }; // depuração

  const post = s.post_fx || {};
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: post.msaa ?? 0 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  if ((post.bloom ?? 0.55) > 0) composer.addPass(bloomPass = new UnrealBloomPass(new THREE.Vector2(W / 3, H / 3), post.bloom ?? 0.55, 0.6, post.bloomThreshold ?? 0.82));
  finalPass = new ShaderPass(FinalShader);
  labelTex = new THREE.CanvasTexture(labelCanvas); labelTex.colorSpace = THREE.NoColorSpace; labelTex.generateMipmaps = false; labelTex.minFilter = labelTex.magFilter = THREE.LinearFilter;
  finalPass.uniforms.tLabels.value = labelTex;
  composer.addPass(finalPass);

  // pré-compila todos os shaders (com tudo visível) para que nenhum quadro dependa de outro
  renderer.compile(scene, camera);
  composer.render();
  return { duration: s.duration, fps: s.fps };
};

window.renderFrame = (t) => {
  const c = cameraAt(t);
  camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
  camera.rotation.set(c.pitch * DEG, c.yaw * DEG, (c.roll || 0) * DEG);
  if (camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld(true);
  world.update(t, { camera, pose: c });
  // zera todos os buffers intermediários: nada do quadro anterior pode vazar para este
  const rts = [composer.renderTarget1, composer.renderTarget2];
  if (bloomPass) rts.push(bloomPass.renderTargetBright, ...bloomPass.renderTargetsHorizontal, ...bloomPass.renderTargetsVertical);
  for (const r of rts) { renderer.setRenderTarget(r); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, true); }
  renderer.setRenderTarget(null);
  finalPass.uniforms.uTime.value = t;
  finalPass.uniforms.uTension.value = world.tension ? world.tension(t) : 0;
  finalPass.uniforms.uExposure.value = renderer.toneMappingExposure;
  const choiceOn = (script.choice && t >= script.choice.start) || (script.endcard && t >= script.endcard.start);
  updateLabels(t, choiceOn); labelTex.needsUpdate = true;
  composer.render();
  updateOverlay(t);
  return true;
};

window.__ready = true;
