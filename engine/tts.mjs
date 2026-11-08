// Narração com Piper (voz neural local, sem custo). Gera um .wav por fala, com cache.
//
// script.json:
//   "narracao": {
//     "voz": "faber",            // arquivo assets/vozes/pt_BR-<voz>-medium.onnx
//     "velocidade": 1.0,         // >1 fala mais rápido
//     "vol": 1.0,
//     "atraso": 0.15,            // segundos depois do início da legenda
//     "efeito": "cinema",        // voz de trailer: mais grave, encorpada, com ambiente
//     "tom": 0.89,               // fator de tom (0,89 ≈ 2 semitons mais grave)
//     "pronuncia": { "@esefossevoceai": "É se fosse você aí" }
//   }
//   Em cada legenda: "fala": "texto falado" (opcional; padrão = o texto da legenda) ou "fala": false (sem narração).
//   Legendas entre aspas (“…”) são falas de PERSONAGEM: não são narradas, a não ser que tenham "fala".
//   Extras: "title": { "fala": ... } e "narracao": { "extras": [{ "t": 62, "fala": "...", "ate": 68 }] }
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TTS_DIR = path.join(ROOT, 'assets', 'tts');
const VOZES = path.join(ROOT, 'assets', 'vozes');

export function textoFalado(cap, cfg) {
  const personagem = /^\s*[“"]/.test(cap.text || '');
  let s = cap.fala === undefined ? (personagem ? null : cap.text) : cap.fala;
  if (!s) return null;
  s = s.replace(/\*/g, '').replace(/[“”"]/g, '').replace(/…/g, '...').trim();
  for (const [de, para] of Object.entries(cfg.pronuncia || {})) s = s.split(de).join(para);
  return s;
}

function duracao(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return parseFloat(r.stdout);
}

// devolve [{ t, file, dur, vol, text }]
export function narrar(script) {
  const cfg = script.narracao;
  if (!cfg) return [];
  const model = path.join(VOZES, `pt_BR-${cfg.voz || 'faber'}-medium.onnx`);
  if (!fs.existsSync(model)) throw new Error(`Voz não encontrada: ${model} (baixe em huggingface.co/rhasspy/piper-voices)`);
  fs.mkdirSync(TTS_DIR, { recursive: true });
  const out = [];
  const linhas = [];
  if (script.title?.fala) linhas.push({ text: script.title.fala, fala: script.title.fala, start: 0, end: script.title.duration, atraso: 0.2 });
  linhas.push(...script.captions);
  for (const x of cfg.extras || []) linhas.push({ text: x.fala, fala: x.fala, start: x.t, end: x.ate ?? x.t + 6, atraso: 0 });
  for (const cap of linhas) {
    const text = textoFalado(cap, cfg);
    if (!text) continue;
    const vel = cap.velocidade ?? cfg.velocidade ?? 1;
    const key = crypto.createHash('sha1').update(JSON.stringify([cfg.voz, vel, text])).digest('hex').slice(0, 16);
    const file = path.join(TTS_DIR, `${key}.wav`);
    if (!fs.existsSync(file)) {
      const r = spawnSync('python3', ['-m', 'piper', '-m', model, '-f', file, '--length-scale', String(1 / vel), '--sentence-silence', String(cfg.pausa ?? 0.25)], { input: text, encoding: 'utf8' });
      if (r.status !== 0 || !fs.existsSync(file)) throw new Error('Piper falhou: ' + (r.stderr || '').slice(-400));
      console.log(`  voz -> ${text}`);
    }
    const dur = duracao(file);
    const t = cap.start + (cap.atraso ?? cfg.atraso ?? 0.15);
    if (t + dur > cap.end + 0.4) console.warn(`  ⚠ fala mais longa que a legenda (${dur.toFixed(1)} s em ${(cap.end - cap.start).toFixed(1)} s): "${text}"`);
    out.push({ t, file, dur, vol: cap.vol ?? cfg.vol ?? 1, text, efeito: cfg.efeito, tom: cfg.tom, formante: cfg.formante });
  }
  return out;
}
