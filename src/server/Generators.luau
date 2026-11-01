--[[
	Os 10 geradores. Segure E (ProximityPrompt) para ligar.
	As posições também são publicadas em ReplicatedStorage.GeneratorInfo
	para o cliente desenhar os marcadores na tela.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")

local Config = require(ReplicatedStorage.Shared.Config)

local Generators = {}

type Gen = {
	index: number,
	model: Model,
	on: boolean,
	lamp: BasePart,
	panel: BasePart,
	light: PointLight,
	smoke: ParticleEmitter,
	prompt: ProximityPrompt,
	sound: Sound,
	hum: Sound,
	info: Vector3Value,
	position: Vector3,
}

local gens: { Gen } = {}
local activatedEvent = Instance.new("BindableEvent")
Generators.Activated = activatedEvent.Event -- (player, index, countOn)

local RED = Color3.fromRGB(255, 50, 40)
local GREEN = Color3.fromRGB(60, 255, 110)

local infoFolder = Instance.new("Folder")
infoFolder.Name = "GeneratorInfo"
infoFolder.Parent = ReplicatedStorage

local function part(parent: Instance, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = material
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	return p
end

local function setVisual(g: Gen, on: boolean)
	local c = if on then GREEN else RED
	g.lamp.Color = c
	g.panel.Color = c
	g.light.Color = c
	g.light.Range = if on then 28 else 14
	g.smoke.Enabled = on
	g.prompt.Enabled = not on
	g.model:SetAttribute("On", on)
	g.info:SetAttribute("On", on)
	if on then
		g.hum:Play()
	else
		g.hum:Stop()
	end
end

local function build(index: number, top: Vector3, parent: Instance): Gen
	local model = Instance.new("Model")
	model.Name = string.format("Gerador%02d", index)

	-- vira de frente para o centro do mapa
	local look = Vector3.new(0, top.Y, 0)
	if (look - top).Magnitude < 1 then
		look = top + Vector3.new(0, 0, -1)
	end
	local base = CFrame.lookAt(top, look)

	local metal = Color3.fromRGB(70, 72, 78)
	part(model, Vector3.new(8, 1, 6), base * CFrame.new(0, 0.5, 0), Color3.fromRGB(40, 40, 44), Enum.Material.DiamondPlate)
	local body = part(model, Vector3.new(6, 4.5, 4), base * CFrame.new(0, 3.25, 0), metal, Enum.Material.Metal)
	body.Name = "Corpo"
	part(model, Vector3.new(6.2, 0.6, 4.2), base * CFrame.new(0, 4.6, 0), Color3.fromRGB(245, 200, 40), Enum.Material.SmoothPlastic)
	local panel = part(model, Vector3.new(2.2, 1.4, 0.2), base * CFrame.new(-1.2, 3.2, -2.05), RED, Enum.Material.Neon)
	panel.Name = "Painel"
	for k = 0, 2 do
		part(model, Vector3.new(0.4, 2.6, 0.2), base * CFrame.new(1.2 + k * 0.7, 3.2, -2.05), Color3.fromRGB(30, 30, 30), Enum.Material.Metal)
	end
	local pipe = part(model, Vector3.new(3, 0.8, 0.8), base * CFrame.new(2, 6, 1) * CFrame.Angles(0, 0, math.rad(90)), Color3.fromRGB(50, 50, 50), Enum.Material.Metal)
	pipe.Shape = Enum.PartType.Cylinder
	local lamp = part(model, Vector3.new(1.4, 1.4, 1.4), base * CFrame.new(-2, 5.6, 0), RED, Enum.Material.Neon)
	lamp.Shape = Enum.PartType.Ball
	lamp.Name = "Lampada"

	local light = Instance.new("PointLight")
	light.Brightness = 2
	light.Range = 14
	light.Color = RED
	light.Shadows = false
	light.Parent = lamp

	local smokeAtt = Instance.new("Attachment")
	smokeAtt.Position = Vector3.new(0, 1.6, 0)
	smokeAtt.Parent = pipe
	local smoke = Instance.new("ParticleEmitter")
	smoke.Texture = "rbxasset://textures/particles/smoke_main.dds"
	smoke.Color = ColorSequence.new(Color3.fromRGB(90, 90, 90))
	smoke.Size = NumberSequence.new(1, 4)
	smoke.Transparency = NumberSequence.new(0.4, 1)
	smoke.Lifetime = NumberRange.new(1.5, 2.5)
	smoke.Rate = 6
	smoke.Speed = NumberRange.new(4, 6)
	smoke.EmissionDirection = Enum.NormalId.Top
	smoke.Enabled = false
	smoke.Parent = smokeAtt

	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Ligar"
	prompt.ObjectText = string.format("Gerador %d", index)
	prompt.HoldDuration = Config.GENERATOR_HOLD_TIME
	prompt.MaxActivationDistance = 11
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.Parent = body

	local sound = Instance.new("Sound")
	sound.SoundId = Config.Sounds.Generator
	sound.Volume = 1
	sound.PlaybackSpeed = 0.8
	sound.RollOffMaxDistance = 200
	sound.Parent = body

	local hum = Instance.new("Sound")
	hum.SoundId = Config.Sounds.MonsterDrone
	hum.Volume = 0.25
	hum.PlaybackSpeed = 1.8
	hum.Looped = true
	hum.RollOffMaxDistance = 60
	hum.Parent = body

	model.PrimaryPart = body
	model:SetAttribute("Index", index)
	model.Parent = parent
	CollectionService:AddTag(model, "Generator")

	local info = Instance.new("Vector3Value")
	info.Name = string.format("%02d", index)
	info.Value = top + Vector3.new(0, 9, 0)
	info:SetAttribute("Index", index)
	info.Parent = infoFolder

	local g: Gen = {
		index = index,
		model = model,
		on = false,
		lamp = lamp,
		panel = panel,
		light = light,
		smoke = smoke,
		prompt = prompt,
		sound = sound,
		hum = hum,
		info = info,
		position = top,
	}
	setVisual(g, false)

	prompt.Triggered:Connect(function(player)
		if g.on or ReplicatedStorage:GetAttribute("Won") then
			return
		end
		g.on = true
		setVisual(g, true)
		sound:Play()
		local n = Generators.countOn()
		ReplicatedStorage:SetAttribute("GeneratorsOn", n)
		activatedEvent:Fire(player, index, n)
	end)

	return g
end

function Generators.init(spots: { { position: Vector3, tower: boolean } })
	local folder = Instance.new("Folder")
	folder.Name = "Geradores"
	folder.Parent = workspace
	for i, spot in spots do
		gens[i] = build(i, spot.position, folder)
	end
	ReplicatedStorage:SetAttribute("GeneratorsTotal", #gens)
	ReplicatedStorage:SetAttribute("GeneratorsOn", 0)
end

function Generators.countOn(): number
	local n = 0
	for _, g in gens do
		if g.on then
			n += 1
		end
	end
	return n
end

function Generators.total(): number
	return #gens
end

function Generators.position(index: number): Vector3?
	local g = gens[index]
	return g and g.position
end

function Generators.resetAll()
	for _, g in gens do
		g.on = false
		setVisual(g, false)
	end
	ReplicatedStorage:SetAttribute("GeneratorsOn", 0)
end

return Generators
