--[[
	Vigia a água e controla o monstro.
	Encostou na água (nem que seja um pouquinho)? O Distorcido sai da água e corre atrás de você.
	• Ele atravessa tudo (é das backrooms, né).
	• Se ele te alcançar: jumpscare e você volta pro último gerador que ligou.
	• Se você sobreviver por MONSTER_CHASE_TIME segundos, ele some.
	• Encostar na água de novo durante a perseguição deixa ele mais rápido.
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local MonsterModel = require(script.Parent.MonsterModel)

local Hunt = {}
Hunt.enabled = true

local WL = Config.WATER_LEVEL
local HALF_MAP = Config.MAP_SIZE / 2

type Chase = {
	player: Player,
	model: Model,
	root: BasePart,
	pos: Vector3,
	state: string, -- "emerging" | "chasing" | "caught"
	spawnedAt: number,
	endTime: number,
	emergeFrom: Vector3,
	emergeTo: Vector3,
	boost: number,
	lastBoost: number,
	dead: boolean?,
}

local chases: { [Player]: Chase } = {}
local graceUntil: { [Player]: number } = {}
local lastSplash: { [Player]: number } = {}
local rng = Random.new()

local monsterFolder = Instance.new("Folder")
monsterFolder.Name = "Monstros"
monsterFolder.Parent = workspace

---------------------------------------------------------------------
-- água
---------------------------------------------------------------------
local function getParts(player: Player): (Model?, Humanoid?, BasePart?)
	local char = player.Character
	if not char then
		return nil
	end
	local hum = char:FindFirstChildOfClass("Humanoid")
	local root = char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not hum or not root or hum.Health <= 0 then
		return nil
	end
	return char, hum, root
end

local function feetY(hum: Humanoid, root: BasePart): number
	if hum.RigType == Enum.HumanoidRigType.R6 then
		return root.Position.Y - 3
	end
	return root.Position.Y - root.Size.Y / 2 - hum.HipHeight
end

local function touchingWater(hum: Humanoid, root: BasePart): boolean
	if feetY(hum, root) <= WL + Config.WATER_TOUCH_TOLERANCE then
		return true
	end
	if hum.FloorMaterial == Enum.Material.Water then
		return true
	end
	return hum:GetState() == Enum.HumanoidStateType.Swimming
end

---------------------------------------------------------------------
-- monstro
---------------------------------------------------------------------
local function setEndAttribute(chase: Chase)
	chase.model:SetAttribute("EndTime", workspace:GetServerTimeNow() + (chase.endTime - os.clock()))
end

local function despawn(chase: Chase, reason: string)
	if chase.dead then
		return
	end
	chase.dead = true
	if chases[chase.player] == chase then
		chases[chase.player] = nil
	end
	local model = chase.model
	CollectionService:RemoveTag(model, "Monster")
	model:SetAttribute("Leaving", true)
	for _, s in model:GetDescendants() do
		if s:IsA("Sound") then
			s:Stop()
		end
	end
	if reason == "escaped" and chase.player.Parent then
		Remotes.Escaped:FireClient(chase.player)
	end
	-- some piscando
	task.spawn(function()
		for _ = 1, 8 do
			for _, p in model:GetDescendants() do
				if p:IsA("BasePart") and p.Name ~= "Raiz" then
					p.Transparency = if rng:NextNumber() < 0.5 then 1 else 0
				end
			end
			task.wait(0.07)
		end
		model:Destroy()
	end)
end

local function speedFor(chase: Chase): number
	local gensOn = ReplicatedStorage:GetAttribute("GeneratorsOn") or 0
	return math.min(Config.MONSTER_MAX_SPEED, Config.MONSTER_BASE_SPEED + Config.MONSTER_SPEED_PER_GENERATOR * gensOn + chase.boost)
end

local function spawnMonster(player: Player, root: BasePart)
	local look = Vector3.new(root.CFrame.LookVector.X, 0, root.CFrame.LookVector.Z)
	if look.Magnitude < 0.01 then
		look = Vector3.new(0, 0, 1)
	end
	-- aparece mais ou menos atrás de você
	local dir = CFrame.Angles(0, rng:NextNumber(-1.1, 1.1), 0):VectorToWorldSpace(-look.Unit)
	local flatPos = Vector3.new(root.Position.X, 0, root.Position.Z) + dir * Config.MONSTER_SPAWN_DISTANCE
	local lim = HALF_MAP - 10
	flatPos = Vector3.new(math.clamp(flatPos.X, -lim, lim), 0, math.clamp(flatPos.Z, -lim, lim))

	local emergeTo = Vector3.new(flatPos.X, WL + Config.MONSTER_ROOT_HEIGHT - 1, flatPos.Z)
	local emergeFrom = emergeTo - Vector3.new(0, Config.MONSTER_ROOT_HEIGHT + 8, 0)

	local model = MonsterModel.build()
	local face = Vector3.new(root.Position.X, emergeFrom.Y, root.Position.Z)
	model:PivotTo(CFrame.lookAt(emergeFrom, face))
	model:SetAttribute("Target", player.UserId)

	local now = os.clock()
	local chase: Chase = {
		player = player,
		model = model,
		root = model.PrimaryPart :: BasePart,
		pos = emergeFrom,
		state = "emerging",
		spawnedAt = now,
		endTime = now + Config.MONSTER_EMERGE_TIME + Config.MONSTER_CHASE_TIME,
		emergeFrom = emergeFrom,
		emergeTo = emergeTo,
		boost = 0,
		lastBoost = now,
	}
	chases[player] = chase
	setEndAttribute(chase)
	model.Parent = monsterFolder
	CollectionService:AddTag(model, "Monster")

	for _, s in model:GetDescendants() do
		if s:IsA("Sound") then
			s:Play()
		end
	end

	for _, other in Players:GetPlayers() do
		if other ~= player then
			Remotes.Notify:FireClient(other, player.DisplayName .. " encostou na água...", Color3.fromRGB(255, 80, 80))
		end
	end
end

local function catchPlayer(chase: Chase, hum: Humanoid)
	chase.state = "caught"
	local player = chase.player
	hum.WalkSpeed = 0
	hum.JumpHeight = 0
	Remotes.Jumpscare:FireClient(player)
	task.delay(1.4, function()
		if hum.Parent then
			hum.Health = 0
		end
		despawn(chase, "caught")
	end)
end

local function updateChase(chase: Chase, dt: number)
	if chase.state == "caught" then
		return
	end
	local _, hum, root = getParts(chase.player)
	if not hum or not root or not chase.model.Parent then
		despawn(chase, "gone")
		return
	end

	local now = os.clock()
	local target = root.Position
	local pos

	if chase.state == "emerging" then
		local a = math.clamp((now - chase.spawnedAt) / Config.MONSTER_EMERGE_TIME, 0, 1)
		local eased = 1 - (1 - a) ^ 3
		pos = chase.emergeFrom:Lerp(chase.emergeTo, eased)
		if a >= 1 then
			chase.state = "chasing"
		end
	else
		if now > chase.endTime then
			despawn(chase, "escaped")
			return
		end
		local goalY = math.max(feetY(hum, root), WL) + Config.MONSTER_ROOT_HEIGHT - 1
		local goal = Vector3.new(target.X, goalY, target.Z)
		local delta = goal - chase.pos
		local d = delta.Magnitude
		pos = chase.pos
		if d > 0.01 then
			pos += delta.Unit * math.min(d, speedFor(chase) * dt)
		end

		local flatDist = Vector2.new(target.X - pos.X, target.Z - pos.Z).Magnitude
		if flatDist < Config.MONSTER_CATCH_DISTANCE and math.abs(goalY - pos.Y) < 7 then
			chase.pos = pos
			catchPlayer(chase, hum)
			return
		end
	end

	chase.pos = pos
	local lookAt = Vector3.new(target.X, pos.Y, target.Z)
	if (lookAt - pos).Magnitude > 0.1 then
		chase.root.CFrame = CFrame.lookAt(pos, lookAt)
	else
		chase.root.CFrame = CFrame.new(pos) * chase.root.CFrame.Rotation
	end
end

local function onWater(player: Player, root: BasePart)
	local now = os.clock()
	if not lastSplash[player] or now - lastSplash[player] > 1.5 then
		lastSplash[player] = now
		Remotes.Splash:FireClient(player, chases[player] ~= nil)
	end

	local chase = chases[player]
	if chase then
		if chase.state ~= "caught" and now - chase.lastBoost > 2 then
			chase.lastBoost = now
			chase.boost += Config.MONSTER_REPEAT_BOOST
			chase.endTime = math.max(chase.endTime, now + 12)
			setEndAttribute(chase)
		end
	else
		spawnMonster(player, root)
	end
end

---------------------------------------------------------------------
-- API
---------------------------------------------------------------------
function Hunt.setGrace(player: Player, seconds: number)
	graceUntil[player] = os.clock() + seconds
end

function Hunt.clearAll()
	for _, chase in chases do
		despawn(chase, "cleared")
	end
end

function Hunt.isChased(player: Player): boolean
	return chases[player] ~= nil
end

function Hunt.start()
	Players.PlayerRemoving:Connect(function(player)
		local chase = chases[player]
		if chase then
			despawn(chase, "gone")
		end
		graceUntil[player] = nil
		lastSplash[player] = nil
	end)

	RunService.Heartbeat:Connect(function(dt)
		local now = os.clock()
		if Hunt.enabled then
			for _, player in Players:GetPlayers() do
				local _, hum, root = getParts(player)
				if hum and root and now > (graceUntil[player] or 0) and touchingWater(hum, root) then
					onWater(player, root)
				end
			end
		end
		for _, chase in chases do
			updateChase(chase, dt)
		end
	end)
end

return Hunt
