--[[
	Monta o "Distorcido": uma criatura das backrooms, alta, magra, preta,
	com braços compridos demais, cabeça torta, olhos brancos e boca vermelha.
	O servidor só move a raiz; o cliente (MonsterFX) anima as juntas e faz o efeito de glitch.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage.Shared.Config)

local MonsterModel = {}

local SKIN = Color3.fromRGB(12, 11, 13)
local SKIN2 = Color3.fromRGB(28, 24, 26)

local function limb(model: Model, attachTo: BasePart, name: string, size: Vector3, c0: CFrame, color: Color3, material: Enum.Material?, swing: number?): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.Anchored = false
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.Massless = true
	p.CastShadow = true
	p.CFrame = attachTo.CFrame * c0
	p.Parent = model

	local w = Instance.new("Weld")
	w.Name = "Junta"
	w.Part0 = attachTo
	w.Part1 = p
	w.C0 = c0
	w:SetAttribute("BaseC0", c0)
	if swing then
		w:SetAttribute("Swing", swing)
	end
	w.Parent = p
	return p
end

function MonsterModel.build(): Model
	local model = Instance.new("Model")
	model.Name = "Distorcido"

	local root = Instance.new("Part")
	root.Name = "Raiz"
	root.Size = Vector3.new(2, 2, 1)
	root.Transparency = 1
	root.Anchored = true
	root.CanCollide = false
	root.CanTouch = false
	root.CanQuery = false
	root.Parent = model
	model.PrimaryPart = root

	-- tronco torto
	local torso = limb(model, root, "Tronco", Vector3.new(2.4, 6.5, 1.1), CFrame.new(0, 0, 0) * CFrame.Angles(math.rad(12), 0, math.rad(-4)), SKIN)
	-- costelas aparecendo
	for i = 0, 3 do
		limb(model, torso, "Costela", Vector3.new(2.6, 0.18, 1.2), CFrame.new(0, 1.8 - i * 0.7, -0.02), SKIN2)
	end
	-- pescoço comprido e cabeça caída pro lado
	local neck = limb(model, torso, "Pescoco", Vector3.new(0.55, 3, 0.55), CFrame.new(0.2, 4.4, -0.3) * CFrame.Angles(math.rad(-20), 0, math.rad(-18)), SKIN, nil, 0)
	local head = limb(model, neck, "Cabeca", Vector3.new(2, 3.2, 1.8), CFrame.new(0.3, 2.4, -0.2) * CFrame.Angles(0, 0, math.rad(32)), SKIN)
	head:SetAttribute("IsHead", true)

	-- olhos (tamanhos diferentes = mais assustador)
	local eyeColor = Color3.fromRGB(255, 255, 245)
	local eyeL = limb(model, head, "Olho", Vector3.new(0.75, 0.75, 0.75), CFrame.new(-0.5, 0.55, -0.9), eyeColor, Enum.Material.Neon)
	eyeL.Shape = Enum.PartType.Ball
	local eyeR = limb(model, head, "Olho", Vector3.new(0.45, 0.45, 0.45), CFrame.new(0.55, 0.35, -0.92), eyeColor, Enum.Material.Neon)
	eyeR.Shape = Enum.PartType.Ball
	-- boca rasgada
	limb(model, head, "Boca", Vector3.new(1.5, 0.9, 0.12), CFrame.new(0.05, -0.75, -0.92) * CFrame.Angles(0, 0, math.rad(-9)), Color3.fromRGB(120, 0, 0), Enum.Material.Neon)
	for i = 0, 5 do
		limb(model, head, "Dente", Vector3.new(0.12, 0.35, 0.12), CFrame.new(-0.6 + i * 0.24, -0.45 - (i % 2) * 0.15, -0.98), Color3.fromRGB(230, 225, 200))
	end
	local eyeLight = Instance.new("PointLight")
	eyeLight.Color = Color3.fromRGB(255, 230, 230)
	eyeLight.Brightness = 3
	eyeLight.Range = 10
	eyeLight.Parent = head

	-- braços compridos demais (balançam correndo)
	for _, side in { -1, 1 } do
		local shoulder = CFrame.new(side * 1.5, 2.8, 0)
		local upper = limb(
			model,
			torso,
			"Braco",
			Vector3.new(0.5, 6, 0.5),
			shoulder * CFrame.Angles(0, 0, math.rad(side * 12)) * CFrame.new(0, -3, 0),
			SKIN,
			nil,
			side * 0.9
		)
		local fore = limb(model, upper, "Antebraco", Vector3.new(0.42, 6, 0.42), CFrame.new(0, -3, 0) * CFrame.Angles(math.rad(-25), 0, 0) * CFrame.new(0, -3, 0), SKIN, nil, side * 0.4)
		-- dedos-garra
		for f = -1, 1 do
			limb(model, fore, "Garra", Vector3.new(0.12, 2, 0.12), CFrame.new(f * 0.18, -3.6, 0) * CFrame.Angles(math.rad(f * 10 - 15), 0, math.rad(f * 12)) * CFrame.new(0, -0.6, 0), SKIN2)
		end
	end

	-- pernas finas
	for _, side in { -1, 1 } do
		local hip = CFrame.new(side * 0.7, -3.1, 0)
		local thigh = limb(model, torso, "Coxa", Vector3.new(0.6, 4.5, 0.6), hip * CFrame.new(0, -2.25, 0), SKIN, nil, -side * 1.0)
		limb(model, thigh, "Canela", Vector3.new(0.45, 4.8, 0.45), CFrame.new(0, -2.25, 0) * CFrame.Angles(math.rad(15), 0, 0) * CFrame.new(0, -2.4, 0), SKIN, nil, -side * 0.5)
	end

	-- fumaça preta
	local att = Instance.new("Attachment")
	att.Parent = torso
	local smoke = Instance.new("ParticleEmitter")
	smoke.Texture = "rbxasset://textures/particles/smoke_main.dds"
	smoke.Color = ColorSequence.new(Color3.new(0, 0, 0))
	smoke.LightInfluence = 0
	smoke.Size = NumberSequence.new(3, 7)
	smoke.Transparency = NumberSequence.new(0.35, 1)
	smoke.Lifetime = NumberRange.new(0.8, 1.6)
	smoke.Rate = 25
	smoke.Speed = NumberRange.new(1, 3)
	smoke.SpreadAngle = Vector2.new(180, 180)
	smoke.Parent = att

	-- sons
	local drone = Instance.new("Sound")
	drone.Name = "Drone"
	drone.SoundId = Config.Sounds.MonsterDrone
	drone.Looped = true
	drone.Volume = 2
	drone.PlaybackSpeed = 0.35
	drone.RollOffMaxDistance = 220
	drone.RollOffMinDistance = 15
	local dist = Instance.new("DistortionSoundEffect")
	dist.Level = 0.85
	dist.Parent = drone
	drone.Parent = root

	local steps = Instance.new("Sound")
	steps.Name = "Passos"
	steps.SoundId = Config.Sounds.MonsterSteps
	steps.Looped = true
	steps.Volume = 2.5
	steps.PlaybackSpeed = 1.6
	steps.RollOffMaxDistance = 160
	steps.RollOffMinDistance = 10
	local dist2 = Instance.new("DistortionSoundEffect")
	dist2.Level = 0.6
	dist2.Parent = steps
	steps.Parent = root

	return model
end

return MonsterModel
