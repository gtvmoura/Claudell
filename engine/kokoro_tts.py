# Narração com Kokoro (ONNX, Apache-2.0). Uso: python3 engine/kokoro_tts.py <voz> <velocidade> <saida.wav>  (texto pela entrada padrão)
import sys, os, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'kokoro')
voz, vel, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
npz = os.path.join(D, 'voices.npz')
bins = sorted(f[:-4] for f in os.listdir(D) if f.endswith('.bin'))
if not os.path.exists(npz) or os.path.getmtime(npz) < max(os.path.getmtime(os.path.join(D, b + '.bin')) for b in bins):
    np.savez(npz, **{b: np.fromfile(os.path.join(D, b + '.bin'), dtype=np.float32).reshape(-1, 1, 256) for b in bins})
k = Kokoro(os.path.join(D, 'model.onnx'), npz)
a, sr = k.create(sys.stdin.read(), voice=voz, speed=vel, lang='pt-br')
sf.write(out, a, sr)
