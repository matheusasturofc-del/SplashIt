--[[
	Interface: contador de geradores, marcadores no mapa, avisos,
	tela de perseguição, jumpscare e tela de vitória.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local CollectionService = game:GetService("CollectionService")
local SoundService = game:GetService("SoundService")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local Remotes = require(ReplicatedStorage.Shared:WaitForChild("Remotes"))

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local FONT = Enum.Font.GothamBlack
local FONT_SCARY = Enum.Font.Creepster

---------------------------------------------------------------------
-- helpers
---------------------------------------------------------------------
local function new(className: string, props: { [string]: any }, children: { Instance }?): any
	local obj = Instance.new(className)
	for k, v in props do
		if k ~= "Parent" then
			obj[k] = v
		end
	end
	for _, c in children or {} do
		c.Parent = obj
	end
	obj.Parent = props.Parent
	return obj
end

local function corner(r: number): UICorner
	return new("UICorner", { CornerRadius = UDim.new(0, r) })
end

local function stroke(color: Color3, thickness: number): UIStroke
	return new("UIStroke", { Color = color, Thickness = thickness, ApplyStrokeMode = Enum.ApplyStrokeMode.Border })
end

local function textStroke(): UIStroke
	return new("UIStroke", { Color = Color3.new(0, 0, 0), Thickness = 2, Transparency = 0.2 })
end

local function playSound(id: string, speed: number, volume: number, distortion: number?)
	local s = new("Sound", { SoundId = id, PlaybackSpeed = speed, Volume = volume, Parent = SoundService })
	if distortion then
		new("DistortionSoundEffect", { Level = distortion, Parent = s })
	end
	s:Play()
	s.Ended:Once(function()
		s:Destroy()
	end)
	task.delay(8, function()
		if s.Parent then
			s:Destroy()
		end
	end)
end

local gui = new("ScreenGui", {
	Name = "SplashHUD",
	ResetOnSpawn = false,
	IgnoreGuiInset = true,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	Parent = playerGui,
})

---------------------------------------------------------------------
-- contador de geradores (topo)
---------------------------------------------------------------------
local counter = new("Frame", {
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 52),
	Size = UDim2.fromOffset(300, 64),
	BackgroundColor3 = Color3.fromRGB(20, 18, 14),
	BackgroundTransparency = 0.25,
	Parent = gui,
}, { corner(12), stroke(Color3.fromRGB(232, 214, 140), 2) })

local counterLabel = new("TextLabel", {
	BackgroundTransparency = 1,
	Position = UDim2.fromOffset(0, 4),
	Size = UDim2.new(1, 0, 0, 30),
	Font = FONT,
	TextSize = 22,
	TextColor3 = Color3.fromRGB(255, 240, 190),
	Text = "⚡ GERADORES 0/10",
	Parent = counter,
})

local segRow = new("Frame", {
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 14, 0, 38),
	Size = UDim2.new(1, -28, 0, 16),
	Parent = counter,
}, {
	new("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Padding = UDim.new(0, 4),
	}),
})

local segments: { Frame } = {}
local function rebuildSegments(total: number)
	for _, s in segments do
		s:Destroy()
	end
	table.clear(segments)
	local w = math.floor((272 - (total - 1) * 4) / math.max(total, 1))
	for i = 1, total do
		segments[i] = new("Frame", {
			Size = UDim2.fromOffset(w, 16),
			BackgroundColor3 = Color3.fromRGB(70, 30, 30),
			LayoutOrder = i,
			Parent = segRow,
		}, { corner(4) })
	end
end

local function updateCounter()
	local on = ReplicatedStorage:GetAttribute("GeneratorsOn") or 0
	local total = ReplicatedStorage:GetAttribute("GeneratorsTotal") or Config.GENERATOR_COUNT
	if #segments ~= total then
		rebuildSegments(total)
	end
	counterLabel.Text = string.format("⚡ GERADORES %d/%d", on, total)
	for i, s in segments do
		s.BackgroundColor3 = if i <= on then Color3.fromRGB(70, 240, 110) else Color3.fromRGB(70, 30, 30)
	end
end
ReplicatedStorage:GetAttributeChangedSignal("GeneratorsOn"):Connect(updateCounter)
ReplicatedStorage:GetAttributeChangedSignal("GeneratorsTotal"):Connect(updateCounter)
updateCounter()

---------------------------------------------------------------------
-- avisos (canto direito)
---------------------------------------------------------------------
local toastHolder = new("Frame", {
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -16, 0, 130),
	Size = UDim2.fromOffset(340, 400),
	BackgroundTransparency = 1,
	Parent = gui,
}, {
	new("UIListLayout", {
		Padding = UDim.new(0, 6),
		HorizontalAlignment = Enum.HorizontalAlignment.Right,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}),
})
local toastOrder = 0

local function toast(text: string, color: Color3?)
	toastOrder += 1
	local f = new("TextLabel", {
		Size = UDim2.fromOffset(340, 36),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Color3.fromRGB(15, 14, 12),
		BackgroundTransparency = 0.2,
		Font = Enum.Font.GothamBold,
		TextSize = 16,
		TextWrapped = true,
		TextColor3 = color or Color3.new(1, 1, 1),
		Text = text,
		LayoutOrder = toastOrder,
		Parent = toastHolder,
	}, { corner(8), new("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10), PaddingTop = UDim.new(0, 8), PaddingBottom = UDim.new(0, 8) }) })
	task.delay(5, function()
		local t = TweenService:Create(f, TweenInfo.new(0.6), { TextTransparency = 1, BackgroundTransparency = 1 })
		t:Play()
		t.Completed:Wait()
		f:Destroy()
	end)
end
Remotes.Notify.OnClientEvent:Connect(toast)

---------------------------------------------------------------------
-- texto grande no meio
---------------------------------------------------------------------
local bigText = new("TextLabel", {
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.36),
	Size = UDim2.new(0.9, 0, 0, 70),
	BackgroundTransparency = 1,
	Font = FONT_SCARY,
	TextScaled = true,
	TextColor3 = Color3.fromRGB(255, 60, 60),
	TextTransparency = 1,
	Text = "",
	ZIndex = 5,
	Parent = gui,
}, { textStroke() })
local bigToken = 0

local function shout(text: string, color: Color3, duration: number)
	bigToken += 1
	local my = bigToken
	bigText.Text = text
	bigText.TextColor3 = color
	bigText.TextTransparency = 0
	bigText.Size = UDim2.new(0.9, 0, 0, 90)
	TweenService:Create(bigText, TweenInfo.new(0.35, Enum.EasingStyle.Back), { Size = UDim2.new(0.9, 0, 0, 70) }):Play()
	task.delay(duration, function()
		if bigToken == my then
			TweenService:Create(bigText, TweenInfo.new(0.8), { TextTransparency = 1 }):Play()
		end
	end)
end

---------------------------------------------------------------------
-- introdução
---------------------------------------------------------------------
do
	local intro = new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.35,
		ZIndex = 20,
		Parent = gui,
	})
	local title = new("TextLabel", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.38),
		Size = UDim2.new(0.9, 0, 0, 110),
		BackgroundTransparency = 1,
		Font = FONT_SCARY,
		TextScaled = true,
		TextColor3 = Color3.fromRGB(232, 214, 140),
		Text = "SPLASH IT",
		ZIndex = 21,
		Parent = intro,
	}, { textStroke() })
	local sub = new("TextLabel", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0.9, 0, 0, 120),
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold,
		TextSize = 22,
		TextWrapped = true,
		TextColor3 = Color3.new(1, 1, 1),
		Text = "Ligue os 10 geradores espalhados pelo mapa.\nNÃO ENCOSTE NA ÁGUA — nem um pouquinho.\nSe encostar... ele vem correndo.\n\nBlocos ROSA somem quando você pisa!",
		ZIndex = 21,
		Parent = intro,
	}, { textStroke() })
	task.delay(7, function()
		local info = TweenInfo.new(1.2)
		TweenService:Create(intro, info, { BackgroundTransparency = 1 }):Play()
		TweenService:Create(title, info, { TextTransparency = 1 }):Play()
		TweenService:Create(sub, info, { TextTransparency = 1 }):Play()
		task.wait(1.3)
		intro:Destroy()
	end)
end

---------------------------------------------------------------------
-- marcadores dos geradores (aparecem através da névoa)
---------------------------------------------------------------------
local markerFolder = new("Folder", { Name = "MarcadoresGeradores", Parent = workspace.Terrain })
type Marker = { info: Vector3Value, att: Attachment, icon: TextLabel, dist: TextLabel, gui: BillboardGui }
local markers: { Marker } = {}

local function refreshMarker(m: Marker)
	local on = m.info:GetAttribute("On") == true
	m.icon.Text = if on then "✔" else "⚡"
	m.icon.TextColor3 = if on then Color3.fromRGB(80, 255, 120) else Color3.fromRGB(255, 220, 60)
	m.dist.Visible = not on
	m.gui.Size = if on then UDim2.fromOffset(34, 34) else UDim2.fromOffset(70, 56)
end

local function addMarker(info: Instance)
	if not info:IsA("Vector3Value") then
		return
	end
	local att = new("Attachment", { WorldPosition = info.Value, Parent = markerFolder })
	local bb = new("BillboardGui", {
		Adornee = att,
		AlwaysOnTop = true,
		Size = UDim2.fromOffset(70, 56),
		LightInfluence = 0,
		MaxDistance = math.huge,
		ResetOnSpawn = false,
		Parent = playerGui,
	})
	local icon = new("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 34),
		Font = FONT,
		TextScaled = true,
		Text = "⚡",
		Parent = bb,
	}, { textStroke() })
	local dist = new("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.fromOffset(0, 34),
		Size = UDim2.new(1, 0, 0, 20),
		Font = Enum.Font.GothamBold,
		TextSize = 14,
		TextColor3 = Color3.new(1, 1, 1),
		Text = "",
		Parent = bb,
	}, { textStroke() })
	local m: Marker = { info = info, att = att, icon = icon, dist = dist, gui = bb }
	table.insert(markers, m)
	info:GetAttributeChangedSignal("On"):Connect(function()
		refreshMarker(m)
	end)
	refreshMarker(m)
end

task.spawn(function()
	local folder = ReplicatedStorage:WaitForChild("GeneratorInfo")
	folder.ChildAdded:Connect(addMarker)
	for _, c in folder:GetChildren() do
		addMarker(c)
	end
end)

---------------------------------------------------------------------
-- perseguição: borda vermelha, aviso e cronômetro
---------------------------------------------------------------------
local vignette = new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Visible = false, Parent = gui })
local function edge(rotation: number, size: UDim2, pos: UDim2, anchor: Vector2)
	new("Frame", {
		AnchorPoint = anchor,
		Position = pos,
		Size = size,
		BorderSizePixel = 0,
		BackgroundColor3 = Color3.fromRGB(150, 0, 0),
		Parent = vignette,
	}, {
		new("UIGradient", {
			Rotation = rotation,
			Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.1), NumberSequenceKeypoint.new(1, 1) }),
		}),
	})
end
edge(90, UDim2.fromScale(1, 0.3), UDim2.fromScale(0, 0), Vector2.new(0, 0))
edge(-90, UDim2.fromScale(1, 0.3), UDim2.fromScale(0, 1), Vector2.new(0, 1))
edge(0, UDim2.fromScale(0.22, 1), UDim2.fromScale(0, 0), Vector2.new(0, 0))
edge(180, UDim2.fromScale(0.22, 1), UDim2.fromScale(1, 0), Vector2.new(1, 0))

local chaseLabel = new("TextLabel", {
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -110),
	Size = UDim2.new(0.8, 0, 0, 56),
	BackgroundTransparency = 1,
	Font = FONT_SCARY,
	TextScaled = true,
	TextColor3 = Color3.fromRGB(255, 50, 50),
	Text = "ELE ESTÁ VINDO",
	Visible = false,
	Parent = gui,
}, { textStroke() })
local chaseInfo = new("TextLabel", {
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -80),
	Size = UDim2.new(0.8, 0, 0, 26),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamBold,
	TextSize = 20,
	TextColor3 = Color3.new(1, 1, 1),
	Text = "",
	Visible = false,
	Parent = gui,
}, { textStroke() })

local function myMonster(): Model?
	for _, m in CollectionService:GetTagged("Monster") do
		if m:GetAttribute("Target") == player.UserId then
			return m
		end
	end
	return nil
end

local lastMarkerUpdate = 0
RunService.RenderStepped:Connect(function()
	local now = os.clock()
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?

	-- marcadores (4x por segundo)
	if now - lastMarkerUpdate > 0.25 then
		lastMarkerUpdate = now
		for _, m in markers do
			if root then
				m.dist.Text = string.format("%dm", math.floor((m.att.WorldPosition - root.Position).Magnitude / 3.57))
			end
		end
	end

	-- perseguição
	local monster = myMonster()
	local chased = monster ~= nil and not ReplicatedStorage:GetAttribute("Won")
	vignette.Visible = chased
	chaseLabel.Visible = chased
	chaseInfo.Visible = chased
	if chased and monster then
		local pulse = (math.sin(now * 8) + 1) / 2
		chaseLabel.TextTransparency = pulse * 0.5
		for _, e: any in vignette:GetChildren() do
			e.BackgroundTransparency = 0.15 + pulse * 0.35
		end
		local left = math.max(0, (monster:GetAttribute("EndTime") or 0) - workspace:GetServerTimeNow())
		local mroot = monster.PrimaryPart
		local d = if mroot and root then (mroot.Position - root.Position).Magnitude / 3.57 else 0
		chaseInfo.Text = string.format("Sobreviva por %ds   •   ele está a %dm", math.ceil(left), math.floor(d))
	end
end)

---------------------------------------------------------------------
-- encostou na água
---------------------------------------------------------------------
local flash = new("Frame", {
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = Color3.fromRGB(40, 120, 140),
	BackgroundTransparency = 1,
	ZIndex = 8,
	Parent = gui,
})

Remotes.Splash.OnClientEvent:Connect(function(alreadyChased: boolean)
	flash.BackgroundTransparency = 0.3
	TweenService:Create(flash, TweenInfo.new(0.8), { BackgroundTransparency = 1 }):Play()
	playSound(Config.Sounds.Splash, 0.7, 1.5)
	if alreadyChased then
		shout("ELE FICOU MAIS RÁPIDO!", Color3.fromRGB(255, 70, 70), 1.6)
	else
		shout("VOCÊ ENCOSTOU NA ÁGUA...", Color3.fromRGB(255, 70, 70), 2.2)
		task.delay(0.6, function()
			playSound(Config.Sounds.MonsterDrone, 0.25, 3, 0.9)
		end)
	end
end)

Remotes.Escaped.OnClientEvent:Connect(function()
	shout("ele perdeu seu rastro... por enquanto", Color3.fromRGB(255, 230, 160), 2.5)
end)

---------------------------------------------------------------------
-- JUMPSCARE
---------------------------------------------------------------------
local scare = new("Frame", {
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = Color3.new(0, 0, 0),
	Visible = false,
	ZIndex = 50,
	Parent = gui,
})
local face = new("Frame", {
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.5),
	Size = UDim2.fromScale(0.7, 0.95),
	BackgroundColor3 = Color3.fromRGB(14, 12, 14),
	ZIndex = 51,
	Parent = scare,
}, { corner(400), new("UIAspectRatioConstraint", { AspectRatio = 0.7 }) })
local function faceBit(pos: UDim2, size: UDim2, color: Color3, round: boolean, rot: number?)
	return new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = pos,
		Size = size,
		Rotation = rot or 0,
		BackgroundColor3 = color,
		BorderSizePixel = 0,
		ZIndex = 52,
		Parent = face,
	}, if round then { corner(400) } else {})
end
local eye1 = faceBit(UDim2.fromScale(0.3, 0.33), UDim2.fromScale(0.26, 0.17), Color3.new(1, 1, 1), true)
local eye2 = faceBit(UDim2.fromScale(0.72, 0.36), UDim2.fromScale(0.15, 0.1), Color3.new(1, 1, 1), true)
faceBit(UDim2.fromScale(0.3, 0.33), UDim2.fromScale(0.04, 0.03), Color3.new(0, 0, 0), true).ZIndex = 53
faceBit(UDim2.fromScale(0.72, 0.36), UDim2.fromScale(0.03, 0.02), Color3.new(0, 0, 0), true).ZIndex = 53
local mouth = faceBit(UDim2.fromScale(0.5, 0.72), UDim2.fromScale(0.75, 0.24), Color3.fromRGB(110, 0, 0), true, -6)
for i = 0, 9 do
	local x = 0.18 + i * 0.07
	faceBit(UDim2.fromScale(x, 0.63 + (i % 2) * 0.02), UDim2.fromScale(0.035, 0.07), Color3.fromRGB(235, 228, 205), false, (i % 3 - 1) * 12).ZIndex = 53
	faceBit(UDim2.fromScale(x + 0.035, 0.81 - (i % 2) * 0.02), UDim2.fromScale(0.035, 0.06), Color3.fromRGB(235, 228, 205), false, (i % 3 - 1) * -12).ZIndex = 53
end
local redFlash = new("Frame", {
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = Color3.fromRGB(200, 0, 0),
	BackgroundTransparency = 1,
	ZIndex = 60,
	Parent = scare,
})

Remotes.Jumpscare.OnClientEvent:Connect(function()
	scare.Visible = true
	playSound(Config.Sounds.Jumpscare, 0.35, 6, 1)
	playSound(Config.Sounds.MonsterDrone, 0.6, 6, 1)
	playSound(Config.Sounds.MonsterSteps, 0.3, 5, 1)
	local start = os.clock()
	local rnd = Random.new()
	while os.clock() - start < 1.5 do
		local k = 1 + (os.clock() - start) * 0.6
		face.Size = UDim2.fromScale(0.7 * k, 0.95 * k)
		face.Position = UDim2.fromScale(0.5 + rnd:NextNumber(-0.02, 0.02), 0.5 + rnd:NextNumber(-0.02, 0.02))
		face.Rotation = rnd:NextNumber(-6, 6)
		eye1.Size = UDim2.fromScale(0.26 + rnd:NextNumber(-0.03, 0.03), 0.17)
		eye2.Visible = rnd:NextNumber() > 0.1
		mouth.Size = UDim2.fromScale(0.75, 0.24 + rnd:NextNumber(0, 0.06))
		redFlash.BackgroundTransparency = if rnd:NextNumber() < 0.25 then 0.4 else 1
		task.wait()
	end
	face.Size = UDim2.fromScale(0.7, 0.95)
	scare.Visible = false
	shout("ELE TE PEGOU", Color3.fromRGB(255, 50, 50), 2.5)
end)

---------------------------------------------------------------------
-- vitória
---------------------------------------------------------------------
local winFrame = new("Frame", {
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = Color3.fromRGB(255, 250, 220),
	BackgroundTransparency = 1,
	Visible = false,
	ZIndex = 30,
	Parent = gui,
})
new("TextLabel", {
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.4),
	Size = UDim2.new(0.9, 0, 0, 110),
	BackgroundTransparency = 1,
	Font = FONT,
	TextScaled = true,
	TextColor3 = Color3.fromRGB(90, 255, 130),
	Text = "VOCÊS ESCAPARAM!",
	ZIndex = 31,
	Parent = winFrame,
}, { textStroke() })
local winSub = new("TextLabel", {
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.fromScale(0.5, 0.52),
	Size = UDim2.new(0.9, 0, 0, 60),
	BackgroundTransparency = 1,
	Font = Enum.Font.GothamBold,
	TextSize = 24,
	TextColor3 = Color3.new(1, 1, 1),
	Text = "",
	ZIndex = 31,
	Parent = winFrame,
}, { textStroke() })

local function onWonChanged()
	local won = ReplicatedStorage:GetAttribute("Won") == true
	winFrame.Visible = won
	if won then
		winFrame.BackgroundTransparency = 0
		TweenService:Create(winFrame, TweenInfo.new(2), { BackgroundTransparency = 1 }):Play()
		task.spawn(function()
			while ReplicatedStorage:GetAttribute("Won") do
				local left = (ReplicatedStorage:GetAttribute("ResetAt") or 0) - workspace:GetServerTimeNow()
				winSub.Text = string.format("Todos os geradores foram ligados!\nNova rodada em %ds", math.max(0, math.ceil(left)))
				task.wait(0.25)
			end
		end)
	end
end
ReplicatedStorage:GetAttributeChangedSignal("Won"):Connect(onWonChanged)
onWonChanged()
