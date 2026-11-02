# Vídeo: Como construir um elevador

Vídeo vertical (1080x1920, 30 fps) no formato "falha → conserto": cada peça entra montando na tela,
algo dá errado, o mestre de obras reage e a próxima peça resolve o problema.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `script.json` | Roteiro: falas, pausas e termo técnico destacado de cada fala |
| `tts.py` | Gera a narração com o Piper (voz `pt_BR-faber-medium`) e monta `build/timeline.json` |
| `scene.html` + `scene.js` | Toda a animação, em Canvas, calculada a partir do tempo da narração |
| `render.js` | Renderiza os quadros no Chromium (Playwright) e cria `build/video_mudo.mp4` |
| `mix.py` | Sintetiza efeitos e trilha, mixa com a narração e gera `elevador.mp4` |

## Como gerar

Requisitos: Python 3 com `numpy` e `piper-tts`, Node 18+, `ffmpeg`, Playwright com Chromium.

```bash
npm install
```

```bash
mkdir -p voices && cd voices && for f in pt_BR-faber-medium.onnx pt_BR-faber-medium.onnx.json; do curl -sSLO "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/$f"; done && cd ..
```

```bash
python3 tts.py && node render.js && python3 mix.py
```

Para conferir quadros soltos sem renderizar tudo: `node render.js stills 10 42.5` (gera `build/still_*.png`).

## Mudar o texto

Edite `script.json` e rode os três comandos de novo. A animação usa as palavras das falas como
marcos de tempo (por exemplo, a corda arrebenta quando o narrador diz "arrebenta"). Se você trocar
uma dessas palavras, o `scene.js` avisa qual fala e qual palavra precisam ser ajustadas.
