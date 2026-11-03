# Vídeo: Como construir um PC gamer (3D)

Segundo vídeo do canal **Obra Entregue**, no mesmo formato do elevador: cada peça entra montando,
algo dá errado, o vídeo rebobina como fita e a próxima peça resolve o problema.

O pipeline é o mesmo do `../elevador` (veja o README de lá para requisitos e instalação):

```bash
npm ci
```

```bash
CHATTERBOX_PY=<python-do-chatterbox> VOICES=<pasta-das-vozes> python3 tts.py && node render.js && python3 mix.py
```

O vídeo final sai em `pcgamer.mp4`.

## O que muda em relação ao elevador

- `script.json`: roteiro do PC (as falas usam `say` com grafia fonética, como "pecê gêimer", para a voz pronunciar certo).
- `scene.js`: cenário novo (quarto gamer, mesa, monitor, gabinete e peças) e a tela do monitor desenhada
  em tempo real (boot, carregando, jogo a 8 FPS e a 144 FPS). Mestre de obras, legendas, setas,
  rebobinar e verificador de sobreposição são os mesmos do elevador.
- `mix.py`: o nome do arquivo final segue o nome da pasta.
