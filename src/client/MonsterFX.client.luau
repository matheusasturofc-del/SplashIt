--[[
	Efeitos do Distorcido no cliente:
	  • braços e pernas balançando enquanto ele corre
	  • cabeça tremendo/glitchando, corpo "piscando"
	  • se ele estiver atrás de VOCÊ: contorno vermelho através das paredes,
	    tela tremendo, batimento cardíaco e cores drenadas
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))

local player = Players.LocalPlayer
local rng = Random.new()

type Tracked = {
	welds: { Weld },
	parts: { BasePart },
	phase: number,
	blinkUntil: number,
}
local tracked: { [Model]: Tracked } = {}

local function track(model: Instance)
	if not model:IsA("Model") or tracked[model] then
		return
	end
	local data: Tracked = { welds = {}, parts = {}, phase = rng:NextNumber(0, 10), blinkUntil = 0 }
	for _, d in model:GetDescendants() do
		if d:IsA("Weld") and d:GetAttribute("BaseC0") then
			table.insert(data.welds, d)
		elseif d:IsA("BasePart") and d.Name ~= "Raiz" then
			table.insert(data.parts, d)
		end
	end
	tracked[model] = data

	if model:GetAttribute("Target") == player.UserId then
		local h = Instance.new("Highlight")
		h.Name = "ContornoPerseguicao"
		h.Adornee = model
		h.FillColor = Color3.new(0, 0, 0)
		h.FillTransparency = 0.6
		h.OutlineColor = Color3.fromRGB(255, 30, 30)
		h.OutlineTransparency = 0
		h.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
		h.Parent = model
	end
end

for _, m in CollectionService:GetTagged("Monster") do
	track(m)
end
CollectionService:GetInstanceAddedSignal("Monster"):Connect(track)

---------------------------------------------------------------------
-- animação de todos os monstros
---------------------------------------------------------------------
RunService.RenderStepped:Connect(function()
	local t = os.clock()
	for model, data in tracked do
		if not model.Parent then
			tracked[model] = nil
			continue
		end
		local leaving = model:GetAttribute("Leaving") == true
		local speed = if leaving then 30 else 11

		for _, weld in data.welds do
			local part1 = weld.Part1
			if not part1 then
				continue
			end
			local base: CFrame = weld:GetAttribute("BaseC0")
			local swing = weld:GetAttribute("Swing")
			local cf = base
			if swing and swing ~= 0 then
				local half = part1.Size.Y / 2
				local angle = math.sin(t * speed + data.phase) * swing * 0.8
				cf = base * CFrame.new(0, half, 0) * CFrame.Angles(angle, 0, 0) * CFrame.new(0, -half, 0)
			end
			if part1:GetAttribute("IsHead") then
				if rng:NextNumber() < 0.14 then
					cf = base
						* CFrame.new(rng:NextNumber(-0.4, 0.4), rng:NextNumber(-0.3, 0.3), rng:NextNumber(-0.3, 0.3))
						* CFrame.Angles(rng:NextNumber(-0.5, 0.5), rng:NextNumber(-0.6, 0.6), rng:NextNumber(-0.7, 0.7))
				else
					cf = base * CFrame.Angles(0, math.sin(t * 3) * 0.15, math.sin(t * 23) * 0.06)
				end
			end
			weld.C0 = cf
		end

		-- piscadas de glitch
		if t > data.blinkUntil and rng:NextNumber() < 0.02 then
			data.blinkUntil = t + rng:NextNumber(0.04, 0.12)
		end
		local hidden = t < data.blinkUntil
		for _, p in data.parts do
			p.LocalTransparencyModifier = if hidden then 1 else 0
		end
	end
end)

---------------------------------------------------------------------
-- efeitos quando VOCÊ está sendo perseguido
---------------------------------------------------------------------
local camera = workspace.CurrentCamera
local cc = Instance.new("ColorCorrectionEffect")
cc.Name = "Perseguicao"
cc.Parent = camera

local heartbeat = Instance.new("Sound")
heartbeat.SoundId = Config.Sounds.Heartbeat
heartbeat.PlaybackSpeed = 0.45
heartbeat.Volume = 2.5
heartbeat.Parent = SoundService

local BASE_FOV = 70
local intensity = 0 -- 0..1, suavizado
local nextBeat = 0

local function myMonster(): Model?
	for model in tracked do
		if model.Parent and model:GetAttribute("Target") == player.UserId and not model:GetAttribute("Leaving") then
			return model
		end
	end
	return nil
end

RunService:BindToRenderStep("SplashMonsterFX", Enum.RenderPriority.Camera.Value + 1, function(dt)
	if camera ~= workspace.CurrentCamera then
		camera = workspace.CurrentCamera
		cc.Parent = camera
	end

	local target = 0
	local monster = myMonster()
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if monster and monster.PrimaryPart and root then
		local d = (monster.PrimaryPart.Position - root.Position).Magnitude
		target = math.clamp(1 - d / 160, 0.15, 1)
	end
	intensity += (target - intensity) * math.min(1, dt * 4)

	cc.Saturation = -0.75 * intensity
	cc.Contrast = 0.25 * intensity
	cc.TintColor = Color3.new(1, 1, 1):Lerp(Color3.fromRGB(255, 165, 165), intensity)

	if intensity > 0.02 then
		camera.FieldOfView = BASE_FOV + 12 * intensity * intensity
		-- tremedeira (mais forte quanto mais perto)
		local shake = (intensity ^ 2) * 0.012
		camera.CFrame = camera.CFrame
			* CFrame.Angles(rng:NextNumber(-shake, shake), rng:NextNumber(-shake, shake), rng:NextNumber(-shake, shake) * 0.5)
		-- batimento cardíaco
		local now = os.clock()
		if target > 0 and now >= nextBeat then
			heartbeat:Play()
			nextBeat = now + (1.1 - 0.8 * intensity)
		end
	elseif camera.FieldOfView ~= BASE_FOV then
		camera.FieldOfView = BASE_FOV
	end
end)
