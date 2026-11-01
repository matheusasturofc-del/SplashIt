--[[
	SPLASH IT — Configurações do jogo
	Mude os valores aqui para deixar o jogo mais fácil, mais difícil, maior ou menor.
]]

local Config = {}

---------------------------------------------------------------------
-- MAPA
---------------------------------------------------------------------
Config.SEED = nil -- número fixo (ex: 1337) = sempre o mesmo mapa | nil = mapa novo a cada servidor
Config.MAP_SIZE = 2000 -- tamanho do mapa em studs (é um quadrado de MAP_SIZE x MAP_SIZE)
Config.WATER_LEVEL = 0 -- altura da superfície da água
Config.WATER_DEPTH = 16 -- profundidade da água

Config.SPAWN_RADIUS = 24 -- raio da plataforma inicial
Config.SPAWN_HEIGHT = 6 -- altura da plataforma inicial

Config.SCATTER_BLOCKS = 650 -- blocos soltos espalhados pelo mapa
Config.MONOLITHS = 18 -- cubos gigantes espalhados (pontos de referência)
Config.RESCUE_STONES = 260 -- pedrinhas baixas pra sair da água
Config.FADE_BLOCK_CHANCE = 0.1 -- chance de um bloco do caminho ser ROSA (some quando você pisa)

-- Pulo / caminhos (os caminhos são gerados para serem SEMPRE possíveis de pular)
Config.WALK_SPEED = 20
Config.JUMP_HEIGHT = 8
Config.PATH_GAP_MIN = 3 -- distância mínima entre blocos
Config.PATH_GAP_MAX = 6.5 -- distância máxima entre blocos
Config.PATH_RISE_MAX = 3 -- quanto um bloco pode ser mais alto que o anterior
Config.PATH_DROP_MAX = 4 -- quanto um bloco pode ser mais baixo que o anterior
Config.PATH_MIN_HEIGHT = 2.5
Config.PATH_MAX_HEIGHT = 45

---------------------------------------------------------------------
-- GERADORES
---------------------------------------------------------------------
Config.GENERATOR_COUNT = 10
Config.GENERATOR_INNER_RADIUS = { 250, 420 } -- anel de dentro (perto do spawn)
Config.GENERATOR_OUTER_RADIUS = { 620, 880 } -- anel de fora (longe)
Config.GENERATOR_HOLD_TIME = 2.5 -- segundos segurando E para ligar
Config.TOWER_CHANCE = 0.4 -- chance do gerador ficar em cima de uma torre com escada em espiral

---------------------------------------------------------------------
-- ÁGUA / MONSTRO
---------------------------------------------------------------------
Config.WATER_TOUCH_TOLERANCE = 0.35 -- "até um pouquinho" — distância do pé até a água que já conta
Config.SPAWN_GRACE = 4 -- segundos de proteção depois de nascer

Config.MONSTER_SPAWN_DISTANCE = 120 -- de quão longe ele aparece
Config.MONSTER_EMERGE_TIME = 1.4 -- tempo que ele leva saindo da água
Config.MONSTER_BASE_SPEED = 24 -- velocidade (jogador anda a WALK_SPEED)
Config.MONSTER_SPEED_PER_GENERATOR = 0.7 -- fica mais rápido a cada gerador ligado
Config.MONSTER_REPEAT_BOOST = 3 -- tocou na água de novo durante a perseguição? fica mais rápido
Config.MONSTER_MAX_SPEED = 40
Config.MONSTER_CHASE_TIME = 25 -- segundos que ele te persegue antes de sumir
Config.MONSTER_CATCH_DISTANCE = 6
Config.MONSTER_ROOT_HEIGHT = 12 -- altura do "peito" do monstro em relação ao pé

---------------------------------------------------------------------
-- RODADA
---------------------------------------------------------------------
Config.ROUND_RESET_TIME = 20 -- segundos depois de vencer até a próxima rodada
Config.RESPAWN_TIME = 3

---------------------------------------------------------------------
-- SONS
-- Os sons "rbxasset://" já vêm com o Roblox. Para sons melhores, pegue IDs na
-- Creator Store (Toolbox > Audio) e cole aqui no formato "rbxassetid://123456".
---------------------------------------------------------------------
Config.Sounds = {
	Splash = "rbxasset://sounds/impact_water.mp3",
	Generator = "rbxasset://sounds/electronicpingshort.wav",
	MonsterDrone = "rbxasset://sounds/action_falling.mp3",
	MonsterSteps = "rbxasset://sounds/action_footsteps_plastic.mp3",
	Jumpscare = "rbxasset://sounds/impact_water.mp3",
	Heartbeat = "rbxasset://sounds/action_jump_land.mp3",
}

return Config
