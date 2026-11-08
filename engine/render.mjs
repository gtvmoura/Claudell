// Renderizador: Playwright (Chrome headless) -> PNGs quadro a quadro -> ffmpeg (vídeo + mixagem de som).
//
// Uso:
//   node engine/render.mjs videos/ep01-cristo/script.json
//   node engine/render.mjs videos/ep01-cristo/script.json --start 0 --duration 4 --out out/teste.mp4
// Opções:
//   --start S        começa no segundo S (padrão 0)
//   --duration D     renderiza D segundos (padrão: duração do roteiro)
//   --out arq.mp4    arquivo de saída (padrão out/<pasta-do-video>.mp4)
//   --workers N      páginas do Chrome em paralelo (padrão 2)
//   --stills a,b,c   também salva PNGs nestes tempos (s) em out/stills/
//   --keep           não apaga a pasta de quadros
//   --png            quadros em PNG sem perdas (mais lento; padrão: JPEG qualidade 95)
//   --so-audio v.mp4 não renderiza imagem: refaz só o som (narração + efeitos) sobre o vídeo v.mp4
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ensureSfx, SFX_DIR } from './sfx.mjs';
import { narrar } from './tts.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- argumentos ----------
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const scriptPath = argv.find(a => a.endsWith('.json'));
if (!scriptPath) { console.error('Informe o script.json'); process.exit(1); }
const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
validate(script);
const FPS = script.fps || 30;
const start = Number(opt('start', 0));
const duration = Number(opt('duration', script.duration - start));
const workers = Number(opt('workers', 2));
const name = path.basename(path.dirname(path.resolve(scriptPath)));
const out = path.resolve(opt('out', path.join('out', name + '.mp4')));
const framesDir = path.join(ROOT, 'frames', path.basename(out, '.mp4'));
const stills = (opt('stills', '') || '').split(',').filter(Boolean).map(Number);
const N = Math.round(duration * FPS);
const PNG = argv.includes('--png');
const REMIX = opt('so-audio', null) && path.resolve(opt('so-audio'));

function validate(s) {
  const err = m => { throw new Error('script.json inválido: ' + m); };
  if (!s.title?.text) err('falta title.text');
  if (!(s.duration >= 61)) console.warn('⚠ duração < 61 s (o formato pede pelo menos 61 s)');
  if (s.width && (s.width !== 1080 || s.height !== 1920)) err('o formato é 1080x1920');
  for (const c of s.captions) {
    if (!(c.end > c.start)) err(`legenda "${c.text}" com tempo inválido`);
    if (!c.camera) err(`legenda "${c.text}" sem movimento de câmera`);
  }
  for (const x of s.sounds || []) if (x.t == null || !x.sfx) err('cada som precisa de { t, sfx }');
}

fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
fs.mkdirSync(path.dirname(out), { recursive: true });
if (!REMIX) {
// ---------- servidor estático local ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/engine/index.html`;

// ---------- quadros ----------
console.log(`▶ ${script.title.text}\n  ${N} quadros (${duration}s @ ${FPS}fps, a partir de ${start}s) com ${workers} página(s)`);

// monta o quadro e só retorna depois que o navegador apresentou TODAS as camadas (WebGL + canvas 2D + DOM).
// Sem isso, com várias páginas em paralelo, a captura pode sair antes de a camada das etiquetas ser composta.
const renderAndPresent = t => new Promise(res => { window.renderFrame(t); requestAnimationFrame(() => requestAnimationFrame(() => res(true))); });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] });
const t0 = Date.now();
let done = 0;
async function worker(w) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('[página]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(s => window.loadScript(s), script);
  for (let i = w; i < N; i += workers) {
    const t = start + i / FPS;
    await page.evaluate(renderAndPresent, t);
    await page.screenshot(PNG ? { path: path.join(framesDir, `f_${String(i).padStart(5, '0')}.png`), type: 'png' } : { path: path.join(framesDir, `f_${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 95 });
    done++;
    if (done % 30 === 0 || done === N) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`\r  ${done}/${N} quadros · ${(el / done).toFixed(2)} s/quadro · faltam ~${Math.round(el / done * (N - done))} s   `);
    }
  }
  if (w === 0 && stills.length) {
    const sd = path.join(path.dirname(out), 'stills'); fs.mkdirSync(sd, { recursive: true });
    for (const t of stills) {
      await page.evaluate(renderAndPresent, t);
      await page.screenshot({ path: path.join(sd, `${path.basename(out, '.mp4')}_t${t.toFixed(2)}.png`) });
    }
  }
  await page.close();
}
await Promise.all(Array.from({ length: workers }, (_, w) => worker(w)));
await browser.close();
server.close();
console.log(`\n  quadros prontos em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} // fim do !REMIX

// ---------- som: efeitos + narração (a música abaixa sob a voz) ----------
const sounds = (script.sounds || []).filter(s => s.t < start + duration && s.t + (s.dur ?? 999) > start);
ensureSfx([...new Set(sounds.map(s => s.sfx))]);
const falas = narrar(script).filter(v => v.t < start + duration && v.t + v.dur > start);
const mix = path.join(framesDir, 'mix.wav');
const ff = (args) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' }); if (r.status !== 0) throw new Error('ffmpeg falhou'); };
{
  const inputs = [], filters = [];
  const place = (rel, dur, fadeOut) => { // corte + atraso relativos ao trecho renderizado
    const chain = [], skip = Math.max(0, -rel);
    if (skip > 0 || dur != null) chain.push(`atrim=start=${skip.toFixed(3)}${dur != null ? `:end=${dur.toFixed(3)}` : ''}`, 'asetpts=PTS-STARTPTS');
    if (fadeOut) chain.push(`afade=t=out:st=${Math.max(0, (dur ?? 10) - skip - fadeOut).toFixed(3)}:d=${fadeOut}`);
    return { chain, delay: rel > 0 ? Math.round(rel * 1000) : 0 };
  };
  sounds.forEach((s, i) => {
    inputs.push('-i', path.join(SFX_DIR, s.sfx + '.wav'));
    const { chain, delay } = place(s.t - start, s.dur, s.fadeOut);
    chain.push(`volume=${s.vol ?? 1}`); if (delay) chain.push(`adelay=${delay}|${delay}`);
    filters.push(`[${i}:a]${chain.join(',')}[s${i}]`);
  });
  falas.forEach((v, k) => {
    const i = sounds.length + k;
    inputs.push('-i', v.file);
    const { chain, delay } = place(v.t - start, null, 0);
    // voz: 48 kHz estéreo, sem graves embolados, comprimida e com leve "presença"
    chain.push('aresample=48000', 'aformat=channel_layouts=stereo');
    if (v.efeito === 'cinema') // voz de trailer: tom mais grave, corpo nos graves, presença, compressão e um pouco de sala
      chain.push(`rubberband=pitch=${v.tom ?? 0.89}:formant=shifted`, 'highpass=f=60', 'equalizer=f=140:t=q:w=1.0:g=4', 'equalizer=f=3200:t=q:w=1.2:g=3', 'acompressor=threshold=0.08:ratio=4:attack=5:release=120:makeup=2', 'aecho=0.8:0.6:45|85:0.14|0.08', `volume=${(v.vol * 2.2).toFixed(2)}`);
    else chain.push('highpass=f=90', 'acompressor=threshold=0.12:ratio=3:attack=5:release=90', 'equalizer=f=3000:t=q:w=1.2:g=3', `volume=${(v.vol * 2.6).toFixed(2)}`);
    if (delay) chain.push(`adelay=${delay}|${delay}`);
    filters.push(`[${i}:a]${chain.join(',')}[v${k}]`);
  });
  const end = `alimiter=limit=0.9,atrim=end=${duration},apad=whole_dur=${duration}[mix]`;
  const bg = sounds.length ? `${sounds.map((_, i) => `[s${i}]`).join('')}amix=inputs=${sounds.length}:normalize=0:dropout_transition=0` : `anullsrc=r=48000:cl=stereo,atrim=end=${duration}`;
  if (falas.length) {
    filters.push(`${bg}[bg]`);
    filters.push(`${falas.map((_, k) => `[v${k}]`).join('')}amix=inputs=${falas.length}:normalize=0:dropout_transition=0,asplit=2[vz][vk]`);
    filters.push(`[bg][vk]sidechaincompress=threshold=0.012:ratio=12:attack=25:release=500:makeup=1[bgd]`); // ducking
    filters.push(`[bgd][vz]amix=inputs=2:normalize=0:dropout_transition=0,${end}`);
  } else filters.push(`${bg},${end}`);
  ff([...inputs, '-filter_complex', filters.join(';'), '-map', '[mix]', '-ar', '48000', '-ac', '2', mix]);
}

// ---------- vídeo final ----------
if (REMIX) ff(['-i', REMIX, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
else ff(['-framerate', String(FPS), '-i', path.join(framesDir, PNG ? 'f_%05d.png' : 'f_%05d.jpg'), '-i', mix,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
if (!argv.includes('--keep')) fs.rmSync(framesDir, { recursive: true, force: true });
console.log(`✔ ${path.relative(process.cwd(), out)}`);
