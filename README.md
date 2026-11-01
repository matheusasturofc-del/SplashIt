# SPLASH IT 🌊⚡

Jogo de Roblox de **parkour + terror** num mar enorme e aberto.

- O mapa é um **oceano gigante** (2000 × 2000 studs) cheio de **quadrados**, pilares, cubos flutuantes e plataformas pequenas para pular.
- **Se você encostar na água, nem que seja um pouquinho**, o **Distorcido** (um bicho alto, preto e glitchado das backrooms) sai da água e vem **correndo te pegar**.
- **Objetivo:** ligar os **10 geradores** espalhados pelo mapa. Quando todos estiverem ligados, todo mundo escapa e começa uma nova rodada.

## Como jogar

| | |
|---|---|
| **Andar / pular** | WASD + Espaço |
| **Ligar gerador** | chegue perto e **segure E** |
| **⚡ na tela** | mostra onde estão os geradores desligados (e a distância) |
| **Blocos ROSA** | somem alguns instantes depois que você pisa |
| **Encostou na água?** | corra! Sobreviva o tempo do cronômetro e ele some |
| **Ele te pegou?** | jumpscare 💀 e você renasce no **último gerador que ligou** |

Detalhes:
- Metade dos geradores fica num anel perto do spawn, a outra metade num anel bem longe.
- Alguns geradores ficam **no topo de torres**, com uma **escada em espiral** de blocos (cair = água = monstro).
- Cada gerador ligado deixa o monstro **mais rápido**. Encostar na água de novo durante a perseguição também.
- Se você cair na água, procure as **pedrinhas cinzas baixas** e as **escadinhas** nas bordas das ilhas para subir.
- Os caminhos são gerados para serem **sempre possíveis de pular** (distância entre blocos e altura limitadas).
- O mapa é **diferente a cada servidor** (dá para fixar em `Config.SEED`).
- Funciona com vários jogadores: cada um que encosta na água ganha o seu próprio Distorcido. 😈

## Abrindo no Roblox Studio

### Jeito fácil
1. Baixe o arquivo **`SplashIt.rbxlx`** deste repositório.
2. Abra no **Roblox Studio** (Arquivo → Abrir).
3. Aperte **Play**. O mapa é gerado quando o jogo começa (leva uns segundos).
4. Para publicar: Arquivo → Publicar no Roblox.

### Com Rojo (para quem vai editar o código)
```bash
rojo serve
```
Depois conecte pelo plugin do Rojo no Studio. Ou gere o arquivo do lugar:
```bash
rojo build -o SplashIt.rbxlx
```

### Sem Rojo e sem o arquivo
Crie no Studio exatamente esta estrutura e cole o código de cada arquivo:

```
ReplicatedStorage
└─ Shared (Folder)
   ├─ Config      (ModuleScript)  ← src/shared/Config.luau
   └─ Remotes     (ModuleScript)  ← src/shared/Remotes.luau
ServerScriptService
└─ Server (Folder)
   ├─ Main        (Script)        ← src/server/Main.server.luau
   ├─ MapBuilder  (ModuleScript)  ← src/server/MapBuilder.luau
   ├─ Generators  (ModuleScript)  ← src/server/Generators.luau
   ├─ Hunt        (ModuleScript)  ← src/server/Hunt.luau
   └─ MonsterModel(ModuleScript)  ← src/server/MonsterModel.luau
StarterPlayer
└─ StarterPlayerScripts
   └─ Client (Folder)
      ├─ HUD       (LocalScript)  ← src/client/HUD.client.luau
      └─ MonsterFX (LocalScript)  ← src/client/MonsterFX.client.luau
```
E em **Workspace**, desmarque **StreamingEnabled**.

## Personalizando

Tudo fica em **`src/shared/Config.luau`** (ou no ModuleScript `Config` dentro do Studio):

- Tamanho do mapa, quantidade de blocos, chance de blocos rosa
- Velocidade e tempo de perseguição do monstro, de quão longe ele aparece
- Velocidade e altura do pulo do jogador
- Quantidade de geradores e tempo segurando E
- **Sons** — os sons atuais são os que já vêm com o Roblox. Para ficar MUITO mais assustador,
  pegue sons na Creator Store (Toolbox → Audio), copie o ID e cole em `Config.Sounds`
  no formato `"rbxassetid://123456789"` (ex.: um grito para `Jumpscare`, passos pesados para `MonsterSteps`).

## Arquivos

| Arquivo | O que faz |
|---|---|
| `src/server/Main.server.luau` | Inicia tudo: clima com névoa, mapa, rodadas, checkpoints |
| `src/server/MapBuilder.luau` | Gera o oceano, ilhas, torres, caminhos de blocos e cenário |
| `src/server/Generators.luau` | Os 10 geradores (modelo, luz, fumaça, ProximityPrompt) |
| `src/server/Hunt.luau` | Detecta quem encostou na água e controla a perseguição |
| `src/server/MonsterModel.luau` | Monta o corpo do Distorcido |
| `src/client/HUD.client.luau` | Contador, marcadores, avisos, jumpscare e tela de vitória |
| `src/client/MonsterFX.client.luau` | Animação/glitch do monstro, tremedeira de tela, batimento |
