--[[
	SPLASH IT — script principal do servidor
	Monta o mapa, os geradores, liga o vigia da água e controla as rodadas.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Lighting = game:GetService("Lighting")
local StarterPlayer = game:GetService("StarterPlayer")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local MapBuilder = require(script.Parent.MapBuilder)
local Generators = require(script.Parent.Generators)
local Hunt = require(script.Parent.Hunt)

-- ninguém nasce antes do mapa ficar pronto
Players.CharacterAutoLoads = false
Players.RespawnTime = Config.RESPAWN_TIME
StarterPlayer.CharacterWalkSpeed = Config.WALK_SPEED
StarterPlayer.CharacterUseJumpPower = false
StarterPlayer.CharacterJumpHeight = Config.JUMP_HEIGHT

---------------------------------------------------------------------
-- clima: névoa amarelada, estilo backrooms em mar aberto
---------------------------------------------------------------------
local function getOrCreate(className: string, parent: Instance): any
	local obj = parent:FindFirstChildOfClass(className)
	if not obj then
		obj = Instance.new(className)
		obj.Parent = parent
	end
	return obj
end

local atmosphere = getOrCreate("Atmosphere", Lighting) :: Atmosphere
local colorCorrection = getOrCreate("ColorCorrectionEffect", Lighting) :: ColorCorrectionEffect
local bloom = getOrCreate("BloomEffect", Lighting) :: BloomEffect

local CREEPY = {
	lighting = { ClockTime = 17.3, Brightness = 1.6 },
	atmosphere = { Density = 0.42, Haze = 2.2 },
}
local HAPPY = {
	lighting = { ClockTime = 13, Brightness = 3 },
	atmosphere = { Density = 0.18, Haze = 0.5 },
}

local function applyMood(mood, time: number)
	local info = TweenInfo.new(time, Enum.EasingStyle.Sine)
	TweenService:Create(Lighting, info, mood.lighting):Play()
	TweenService:Create(atmosphere, info, mood.atmosphere):Play()
end

Lighting.Ambient = Color3.fromRGB(60, 58, 52)
Lighting.OutdoorAmbient = Color3.fromRGB(110, 105, 90)
Lighting.GlobalShadows = true
Lighting.EnvironmentDiffuseScale = 0.4
atmosphere.Offset = 0.15
atmosphere.Color = Color3.fromRGB(185, 180, 145)
atmosphere.Decay = Color3.fromRGB(95, 90, 70)
atmosphere.Glare = 0
colorCorrection.Saturation = -0.2
colorCorrection.Contrast = 0.12
colorCorrection.TintColor = Color3.fromRGB(255, 247, 225)
bloom.Intensity = 0.6
bloom.Size = 24
bloom.Threshold = 1.6
applyMood(CREEPY, 0)

---------------------------------------------------------------------
-- monta o mundo
---------------------------------------------------------------------
local mapInfo = MapBuilder.build()
Generators.init(mapInfo.generatorSpots)
ReplicatedStorage:SetAttribute("Won", false)
Hunt.start()

---------------------------------------------------------------------
-- checkpoints: você renasce no último gerador que ligou
---------------------------------------------------------------------
local checkpoints: { [Player]: Vector3 } = {}

local function checkpointFor(index: number): Vector3?
	local pos = Generators.position(index)
	if not pos then
		return nil
	end
	local toCenter = Vector3.new(-pos.X, 0, -pos.Z)
	local offset = if toCenter.Magnitude > 1 then toCenter.Unit * 5.5 else Vector3.new(0, 0, 5.5)
	return pos + offset + Vector3.new(0, 4, 0)
end

local function onCharacter(player: Player, char: Model)
	Hunt.setGrace(player, Config.SPAWN_GRACE)
	local hum = char:WaitForChild("Humanoid") :: Humanoid
	hum.UseJumpPower = false
	hum.WalkSpeed = Config.WALK_SPEED
	hum.JumpHeight = Config.JUMP_HEIGHT

	-- CharacterAutoLoads está desligado, então nós mesmos renascemos o jogador
	hum.Died:Connect(function()
		task.wait(Config.RESPAWN_TIME)
		if player.Parent and player.Character == char then
			player:LoadCharacter()
		end
	end)

	local cp = checkpoints[player]
	if cp then
		char:WaitForChild("HumanoidRootPart")
		task.wait()
		char:PivotTo(CFrame.new(cp))
	end
end

local function onPlayer(player: Player)
	player.CharacterAdded:Connect(function(char)
		onCharacter(player, char)
	end)
	player:LoadCharacter()
end

Players.PlayerAdded:Connect(onPlayer)
for _, p in Players:GetPlayers() do
	task.spawn(onPlayer, p)
end
Players.PlayerRemoving:Connect(function(player)
	checkpoints[player] = nil
end)

---------------------------------------------------------------------
-- rodada
---------------------------------------------------------------------
local function newRound()
	Generators.resetAll()
	table.clear(checkpoints)
	applyMood(CREEPY, 3)
	ReplicatedStorage:SetAttribute("Won", false)
	ReplicatedStorage:SetAttribute("ResetAt", nil)
	Hunt.enabled = true
	for _, player in Players:GetPlayers() do
		task.spawn(function()
			player:LoadCharacter()
		end)
	end
	Remotes.Notify:FireAllClients("Nova rodada! Ligue os 10 geradores.", Color3.fromRGB(255, 230, 150))
end

local function win()
	ReplicatedStorage:SetAttribute("Won", true)
	ReplicatedStorage:SetAttribute("ResetAt", workspace:GetServerTimeNow() + Config.ROUND_RESET_TIME)
	Hunt.enabled = false
	Hunt.clearAll()
	applyMood(HAPPY, 4)
	task.delay(Config.ROUND_RESET_TIME, newRound)
end

Generators.Activated:Connect(function(player: Player, index: number, countOn: number)
	checkpoints[player] = checkpointFor(index)
	local total = Generators.total()
	Remotes.Notify:FireAllClients(
		string.format("%s ligou o Gerador %d  (%d/%d)", player.DisplayName, index, countOn, total),
		Color3.fromRGB(110, 255, 140)
	)
	if countOn >= total then
		win()
	end
end)
