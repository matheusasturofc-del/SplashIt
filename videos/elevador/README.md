# Vídeo: Como construir um elevador (3D)

Vídeo vertical (1080x1920, 30 fps) do canal **Obra Entregue**, no formato "falha → conserto":
cada peça voa girando até o lugar, algo dá errado, o mestre de obras reage, e a próxima peça
resolve o problema.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `script.json` | Roteiro: falas, pausas, termo técnico destacado e motor de voz |
| `tts.py` | Gera a narração e monta `build/timeline.json` (com o tempo de cada palavra) |
| `tts_chatterbox.py` | Voz neural Chatterbox (MIT), conferida fala a fala com o Whisper |
| `scene.html` + `scene.js` | Animação 3D em Three.js + camada 2D (legendas, etiquetas, balões) |
| `render.js` | Renderiza os quadros no Chromium (Playwright) e cria `build/video_mudo.mp4` |
| `music.py` | Trilha original de 118 BPM, sintetizada (sem direitos de terceiros) |
| `mix.py` | Efeitos sonoros, mixagem com narração e trilha, e o `elevador.mp4` final |

## Como gerar

Requisitos: Node 18+, `ffmpeg`, Playwright com Chromium, Python 3 com `numpy` e `scipy`.
Para a voz neural, um segundo ambiente Python com `chatterbox-tts`, `setuptools<80` e `faster-whisper`.

```bash
npm install
```

```bash
python3 -m venv cbx && cbx/bin/pip install chatterbox-tts "setuptools<80" faster-whisper
```

Coloque em `voices/` um áudio de referência de 10 a 20 s com a voz desejada (`ref_faber.wav`
no `script.json`). Pode ser a sua própria voz gravada no celular: o vídeo passa a ter a sua voz.

```bash
CHATTERBOX_PY=cbx/bin/python python3 tts.py && Q='?rs=0.85' node render.js && python3 mix.py
```

- `Q` ajusta a qualidade do 3D: `rs` é a escala da resolução (1 = 1080x1920), `aa=0` desliga o antisserrilhado.
- Para conferir quadros soltos: `node render.js stills 10 42.5` (gera `build/still_*.png`).
- Sem GPU (como num servidor), cada quadro leva por volta de 1 s.

## Mudar o texto

Edite `script.json` e rode os comandos de novo. A animação usa palavras das falas como marcos
(por exemplo, a corda arrebenta quando o narrador diz "arrebenta"). Se você trocar uma dessas
palavras, o `scene.js` avisa qual fala e qual palavra precisam ser ajustadas.
