--[[
	Gera o mapa ENORME e aberto:
	  • oceano de água (Terrain)
	  • plataforma inicial
	  • 10 ilhas com geradores (algumas em cima de torres com escada em espiral)
	  • caminhos de "quadrados" para pular entre as ilhas (sempre possíveis de pular)
	  • blocos soltos, cubos gigantes e pedrinhas para sair da água
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")
local TweenService = game:GetService("TweenService")
local Players = game:GetService("Players")

local Config = require(ReplicatedStorage.Shared.Config)

local MapBuilder = {}

local WL = Config.WATER_LEVEL
local FLOOR_Y = WL - Config.WATER_DEPTH
local HALF_MAP = Config.MAP_SIZE / 2

local rng: Random
local reserved: { { pos: Vector2, r: number } } = {}

local PALETTE = {
	Color3.fromRGB(232, 214, 140), -- amarelo backrooms
	Color3.fromRGB(205, 190, 125),
	Color3.fromRGB(240, 238, 228),
	Color3.fromRGB(120, 175, 220),
	Color3.fromRGB(150, 205, 150),
	Color3.fromRGB(235, 160, 95),
	Color3.fromRGB(175, 150, 220),
	Color3.fromRGB(225, 110, 110),
}
local FADE_COLOR = Color3.fromRGB(255, 120, 200)
local WALLPAPER = Color3.fromRGB(214, 196, 120)
local CARPET = Color3.fromRGB(176, 158, 92)

---------------------------------------------------------------------
-- helpers
---------------------------------------------------------------------
local function newPart(parent: Instance, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	return p
end

local function randomColor(): Color3
	return PALETTE[rng:NextInteger(1, #PALETTE)]
end

local function flat(v: Vector3): Vector3
	return Vector3.new(v.X, 0, v.Z)
end

local function reserve(x: number, z: number, r: number)
	table.insert(reserved, { pos = Vector2.new(x, z), r = r })
end

local function isReserved(x: number, z: number, margin: number): boolean
	local p = Vector2.new(x, z)
	for _, r in reserved do
		if (p - r.pos).Magnitude < r.r + margin then
			return true
		end
	end
	return false
end

-- plataforma redonda: "top" é o centro da superfície onde o jogador pisa
local function roundPlatform(parent: Instance, top: Vector3, radius: number, color: Color3, material: Enum.Material?): Part
	local height = top.Y - FLOOR_Y
	local p = newPart(
		parent,
		Vector3.new(height, radius * 2, radius * 2),
		CFrame.new(top.X, FLOOR_Y + height / 2, top.Z) * CFrame.Angles(0, 0, math.rad(90)),
		color,
		material
	)
	p.Shape = Enum.PartType.Cylinder
	return p
end

-- bloco quadrado: "top" é o centro da superfície
local function squareBlock(parent: Instance, top: Vector3, half: number, yaw: number, pillar: boolean, color: Color3?): Part
	local size = half * 2
	local part
	if pillar then
		local h = top.Y - FLOOR_Y
		part = newPart(
			parent,
			Vector3.new(size, h, size),
			CFrame.new(top.X, FLOOR_Y + h / 2, top.Z) * CFrame.Angles(0, yaw, 0),
			color or randomColor()
		)
	else
		part = newPart(
			parent,
			Vector3.new(size, size, size),
			CFrame.new(top.X, top.Y - half, top.Z) * CFrame.Angles(0, yaw, 0),
			color or randomColor()
		)
	end
	return part
end

local function makeFade(part: Part)
	part.Color = FADE_COLOR
	part.Material = Enum.Material.Neon
	part.Transparency = 0.25
	CollectionService:AddTag(part, "FadeBlock")
end

-- escadinha descendo da borda de uma plataforma até perto da água (pra quem cair conseguir subir)
local function stairsToWater(parent: Instance, center: Vector3, radius: number, angle: number)
	local dir = Vector3.new(math.cos(angle), 0, math.sin(angle))
	local yaw = math.atan2(dir.X, dir.Z)
	local y = center.Y
	local dist = radius + 2.2
	local color = Color3.fromRGB(110, 105, 95)
	while y > WL + 1.6 do
		y = math.max(y - 1.6, WL + 1.3)
		local pos = flat(center) + dir * dist
		squareBlock(parent, Vector3.new(pos.X, y, pos.Z), 2, yaw, true, color).Material = Enum.Material.Slate
		dist += 4.2
	end
end

-- parede estilo backrooms com luz fluorescente
local function backroomsWall(parent: Instance, base: Vector3, yaw: number, width: number)
	local h = 11
	local cf = CFrame.new(base + Vector3.new(0, h / 2, 0)) * CFrame.Angles(0, yaw, 0)
	local wall = newPart(parent, Vector3.new(width, h, 1), cf, WALLPAPER, Enum.Material.Fabric)
	local lamp = newPart(parent, Vector3.new(width * 0.5, 0.4, 1.6), cf * CFrame.new(0, h / 2 + 0.2, 0), Color3.fromRGB(255, 252, 225), Enum.Material.Neon)
	local light = Instance.new("SurfaceLight")
	light.Face = Enum.NormalId.Bottom
	light.Brightness = 1.2
	light.Range = 14
	light.Color = Color3.fromRGB(255, 245, 200)
	light.Parent = lamp
	return wall
end

---------------------------------------------------------------------
-- água
---------------------------------------------------------------------
local function buildOcean()
	local terrain = workspace.Terrain
	terrain:Clear()
	terrain.WaterColor = Color3.fromRGB(38, 72, 66)
	terrain.WaterTransparency = 0.35
	terrain.WaterReflectance = 0.6
	terrain.WaterWaveSize = 0.12
	terrain.WaterWaveSpeed = 8

	local extent = HALF_MAP + 300
	local chunk = 512
	local x = -extent
	while x < extent do
		local z = -extent
		while z < extent do
			local sx = math.min(chunk, extent - x)
			local sz = math.min(chunk, extent - z)
			local cx, cz = x + sx / 2, z + sz / 2
			terrain:FillBlock(CFrame.new(cx, FLOOR_Y + (WL - FLOOR_Y) / 2, cz), Vector3.new(sx, WL - FLOOR_Y, sz), Enum.Material.Water)
			terrain:FillBlock(CFrame.new(cx, FLOOR_Y - 4, cz), Vector3.new(sx, 8, sz), Enum.Material.Mud)
			z += chunk
		end
		x += chunk
	end
end

local function buildBoundaries(parent: Instance)
	local h = 400
	local t = 4
	local s = Config.MAP_SIZE
	local function wall(size: Vector3, pos: Vector3)
		local w = newPart(parent, size, CFrame.new(pos), Color3.new(0, 0, 0))
		w.Transparency = 1
		w.Name = "Limite"
	end
	wall(Vector3.new(s, h, t), Vector3.new(0, h / 2 + FLOOR_Y, HALF_MAP))
	wall(Vector3.new(s, h, t), Vector3.new(0, h / 2 + FLOOR_Y, -HALF_MAP))
	wall(Vector3.new(t, h, s), Vector3.new(HALF_MAP, h / 2 + FLOOR_Y, 0))
	wall(Vector3.new(t, h, s), Vector3.new(-HALF_MAP, h / 2 + FLOOR_Y, 0))
end

---------------------------------------------------------------------
-- spawn
---------------------------------------------------------------------
local function buildSpawn(parent: Instance): Vector3
	local top = Vector3.new(0, Config.SPAWN_HEIGHT, 0)
	local hub = roundPlatform(parent, top, Config.SPAWN_RADIUS, CARPET, Enum.Material.Fabric)
	hub.Name = "PlataformaInicial"
	reserve(0, 0, Config.SPAWN_RADIUS)

	local spawn = Instance.new("SpawnLocation")
	spawn.Anchored = true
	spawn.Size = Vector3.new(12, 1, 12)
	spawn.CFrame = CFrame.new(top + Vector3.new(0, 0.5, 0))
	spawn.Color = Color3.fromRGB(240, 230, 190)
	spawn.Material = Enum.Material.SmoothPlastic
	spawn.Duration = 0
	spawn.Neutral = true
	spawn.Parent = parent

	-- paredes backrooms em volta (com aberturas)
	for i = 0, 3 do
		local a = i * math.pi / 2 + math.pi / 4
		local pos = top + Vector3.new(math.cos(a), 0, math.sin(a)) * (Config.SPAWN_RADIUS - 5)
		backroomsWall(parent, pos, -a + math.pi / 2, 12)
	end

	-- placa com instruções
	local sign = newPart(parent, Vector3.new(14, 7, 0.6), CFrame.new(top + Vector3.new(0, 6.5, -8)), Color3.fromRGB(30, 28, 25), Enum.Material.Wood)
	sign.Name = "Placa"
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Back
	gui.PixelsPerStud = 40
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.Parent = sign
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.TextColor3 = Color3.fromRGB(255, 240, 200)
	label.Font = Enum.Font.Creepster
	label.TextScaled = true
	label.Text = "LIGUE OS 10 GERADORES\n\nNÃO ENCOSTE NA ÁGUA\n\nnem um pouquinho..."
	label.Parent = gui
	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, 20)
	pad.PaddingBottom = UDim.new(0, 20)
	pad.PaddingLeft = UDim.new(0, 20)
	pad.PaddingRight = UDim.new(0, 20)
	pad.Parent = label

	for i = 0, 3 do
		stairsToWater(parent, top, Config.SPAWN_RADIUS, i * math.pi / 2)
	end

	return top
end

---------------------------------------------------------------------
-- caminhos de blocos
---------------------------------------------------------------------
local function buildPath(parent: Instance, from: Vector3, fromRadius: number, to: Vector3, toRadius: number)
	local folder = Instance.new("Folder")
	folder.Name = "Caminho"
	folder.Parent = parent

	local totalFlat = flat(to - from).Magnitude
	local arc = rng:NextNumber(-1, 24) -- o caminho sobe e desce por cima do mar
	local cur = from
	local curHalf = fromRadius
	local headingOffset = 0
	local lastFade = true
	local edge = HALF_MAP - 15

	for step = 1, 600 do
		local toTarget = Vector3.new(to.X - cur.X, 0, to.Z - cur.Z)
		local dist = toTarget.Magnitude
		local edgeGap = dist - curHalf - toRadius
		local dh = to.Y - cur.Y
		if edgeGap <= Config.PATH_GAP_MAX and dh <= Config.PATH_RISE_MAX then
			break
		end

		local p = math.clamp(1 - dist / totalFlat, 0, 1)
		headingOffset = math.clamp(headingOffset + rng:NextNumber(-0.3, 0.3), -0.7, 0.7)
		local dir = CFrame.Angles(0, headingOffset * (1 - p), 0):VectorToWorldSpace(toTarget.Unit)

		-- tipo do próximo bloco
		local roll = rng:NextNumber()
		local half, pillar
		if roll < 0.1 then
			half, pillar = 1.3, false -- bloquinho minúsculo
		elseif roll < 0.72 then
			half, pillar = rng:NextNumber(2, 3.5), rng:NextNumber() < 0.5
		elseif roll < 0.9 then
			half, pillar = rng:NextNumber(4, 6), true -- plataforma de descanso
		else
			half, pillar = rng:NextNumber(1.8, 2.6), true
		end

		local gap = rng:NextNumber(Config.PATH_GAP_MIN, Config.PATH_GAP_MAX)
		-- perto do fim: um último bloco exatamente no meio, pra não entrar dentro da ilha
		local bridging = edgeGap <= 2 * Config.PATH_GAP_MAX + 8
		if bridging then
			if edgeGap < 4 then
				break
			end
			half = math.clamp((edgeGap - (Config.PATH_GAP_MIN + Config.PATH_GAP_MAX)) / 2, 1.5, 4)
			gap = (edgeGap - 2 * half) / 2
			pillar = true
			dir = toTarget.Unit
		end
		local stepFlat = curHalf + gap + half
		local nextP = math.clamp(1 - (dist - stepFlat) / totalFlat, 0, 1)
		local profileY = from.Y + (to.Y - from.Y) * nextP + arc * math.sin(nextP * math.pi)
		local noise = if nextP < 0.85 then rng:NextNumber(-1.3, 1.3) else 0
		local dy = math.clamp(profileY + noise - cur.Y, -Config.PATH_DROP_MAX, Config.PATH_RISE_MAX)
		if dy > 2 and not bridging then
			gap = math.min(gap, 5)
			stepFlat = curHalf + gap + half
		end
		local y = math.clamp(cur.Y + dy, Config.PATH_MIN_HEIGHT, Config.PATH_MAX_HEIGHT)

		local pos = flat(cur) + dir * stepFlat
		pos = Vector3.new(math.clamp(pos.X, -edge, edge), y, math.clamp(pos.Z, -edge, edge))

		local part = squareBlock(folder, pos, half, math.atan2(dir.X, dir.Z), pillar)
		if not lastFade and step > 1 and half < 4 and rng:NextNumber() < Config.FADE_BLOCK_CHANCE then
			makeFade(part)
			lastFade = true
		else
			lastFade = false
		end

		cur = pos
		curHalf = half
	end
end

---------------------------------------------------------------------
-- ilhas dos geradores
---------------------------------------------------------------------
local function buildTower(parent: Instance, base: Vector3): Vector3
	local pillarHalf = 7
	local height = base.Y + rng:NextNumber(32, 55)
	local top = Vector3.new(base.X, height, base.Z)
	squareBlock(parent, top, pillarHalf, rng:NextNumber(0, math.pi), true, Color3.fromRGB(95, 92, 88)).Material = Enum.Material.Concrete

	local blockHalf = 2.5
	local r = pillarHalf + 3.5 + blockHalf
	local dTheta = 2 * math.asin((blockHalf * 2 + 3.5) / (2 * r))
	local angle = rng:NextNumber(0, math.pi * 2)
	local y = base.Y + 2.4
	local spin = if rng:NextNumber() < 0.5 then 1 else -1
	while y < height - 0.5 do
		local pos = Vector3.new(base.X + math.cos(angle) * r, y, base.Z + math.sin(angle) * r)
		local tangentYaw = -angle
		local part = squareBlock(parent, pos, blockHalf, tangentYaw, false)
		part.Name = "Espiral"
		angle += dTheta * spin
		y += 2.4
	end
	return top
end

local function buildIsland(parent: Instance, index: number, center: Vector3, tower: boolean): Vector3
	local folder = Instance.new("Folder")
	folder.Name = string.format("Ilha%02d", index)
	folder.Parent = parent

	local radius = if tower then 20 else 16
	local island = roundPlatform(folder, center, radius, Color3.fromRGB(150, 140, 110), Enum.Material.Slate)
	island.Name = "Ilha"
	reserve(center.X, center.Z, radius)

	-- decoração backrooms
	for _ = 1, rng:NextInteger(1, 2) do
		local a = rng:NextNumber(0, math.pi * 2)
		local pos = center + Vector3.new(math.cos(a), 0, math.sin(a)) * (radius - 3)
		backroomsWall(folder, pos, -a + math.pi / 2, 8)
	end

	for i = 0, 1 do
		stairsToWater(folder, center, radius, rng:NextNumber(0, math.pi * 2) + i * math.pi)
	end

	if tower then
		return buildTower(folder, center)
	end
	return center
end

---------------------------------------------------------------------
-- coisas espalhadas
---------------------------------------------------------------------
local function randomMapPoint(margin: number): (number, number)
	local lim = HALF_MAP - margin
	return rng:NextNumber(-lim, lim), rng:NextNumber(-lim, lim)
end

local function buildScatter(parent: Instance)
	local folder = Instance.new("Folder")
	folder.Name = "Blocos"
	folder.Parent = parent

	-- cubos gigantes (pontos de referência no horizonte)
	for _ = 1, Config.MONOLITHS do
		local size = rng:NextNumber(30, 70)
		local x, z = randomMapPoint(size)
		if not isReserved(x, z, size) then
			local topY = rng:NextNumber(15, 65)
			local c = if rng:NextNumber() < 0.5 then Color3.fromRGB(60, 58, 62) else WALLPAPER
			local m = squareBlock(folder, Vector3.new(x, topY, z), size / 2, rng:NextNumber(0, math.pi), true, c)
			m.Material = Enum.Material.Concrete
			m.Name = "Monolito"
			reserve(x, z, size * 0.75)
		end
	end

	-- blocos soltos
	for _ = 1, Config.SCATTER_BLOCKS do
		local x, z = randomMapPoint(10)
		if not isReserved(x, z, 6) then
			local roll = rng:NextNumber()
			if roll < 0.6 then
				local half = rng:NextNumber(1.5, 4.5)
				squareBlock(folder, Vector3.new(x, rng:NextNumber(2, 30), z), half, rng:NextNumber(0, math.pi), false)
			elseif roll < 0.85 then
				local half = rng:NextNumber(2, 5)
				squareBlock(folder, Vector3.new(x, rng:NextNumber(2, 25), z), half, rng:NextNumber(0, math.pi), true)
			else
				-- escadinha de cubos
				local y = rng:NextNumber(2, 6)
				local a = rng:NextNumber(0, math.pi * 2)
				local dir = Vector3.new(math.cos(a), 0, math.sin(a))
				local pos = Vector3.new(x, y, z)
				for _ = 1, rng:NextInteger(3, 7) do
					squareBlock(folder, pos, 2, math.atan2(dir.X, dir.Z), false)
					pos += dir * 8.5 + Vector3.new(0, 2.5, 0)
				end
			end
		end
	end

	-- pedrinhas baixas pra sair da água
	for _ = 1, Config.RESCUE_STONES do
		local x, z = randomMapPoint(10)
		if not isReserved(x, z, 4) then
			local s = squareBlock(folder, Vector3.new(x, WL + 1.3, z), rng:NextNumber(2.5, 4), rng:NextNumber(0, math.pi), true, Color3.fromRGB(100, 98, 92))
			s.Material = Enum.Material.Slate
		end
	end
end

---------------------------------------------------------------------
-- blocos rosa que somem
---------------------------------------------------------------------
local function setupFadeBlocks()
	local busy: { [BasePart]: boolean } = {}
	local function hook(part: BasePart)
		local base = part.Transparency
		part.Touched:Connect(function(hit)
			if busy[part] then
				return
			end
			local char = hit:FindFirstAncestorOfClass("Model")
			if not char or not Players:GetPlayerFromCharacter(char) then
				return
			end
			busy[part] = true
			task.wait(0.35)
			local t = TweenService:Create(part, TweenInfo.new(0.5), { Transparency = 0.92 })
			t:Play()
			t.Completed:Wait()
			part.CanCollide = false
			task.wait(3)
			part.CanCollide = true
			TweenService:Create(part, TweenInfo.new(0.4), { Transparency = base }):Play()
			busy[part] = nil
		end)
	end
	for _, p in CollectionService:GetTagged("FadeBlock") do
		hook(p)
	end
	CollectionService:GetInstanceAddedSignal("FadeBlock"):Connect(hook)
end

---------------------------------------------------------------------
-- API
---------------------------------------------------------------------
export type MapInfo = {
	spawn: Vector3,
	generatorSpots: { { position: Vector3, tower: boolean } },
}

function MapBuilder.build(): MapInfo
	rng = Random.new(Config.SEED or os.time())
	table.clear(reserved)

	local old = workspace:FindFirstChild("Mapa")
	if old then
		old:Destroy()
	end
	local map = Instance.new("Folder")
	map.Name = "Mapa"

	buildOcean()
	buildBoundaries(map)
	local spawnTop = buildSpawn(map)

	-- posições das ilhas: anel interno e externo intercalados
	local count = Config.GENERATOR_COUNT
	local islands: { Vector3 } = {}
	local spots = {}
	local angleOffset = rng:NextNumber(0, math.pi * 2)
	for i = 1, count do
		local outer = i % 2 == 0
		local range = if outer then Config.GENERATOR_OUTER_RADIUS else Config.GENERATOR_INNER_RADIUS
		local radius = rng:NextNumber(range[1], range[2])
		local angle = angleOffset + (i - 1) / count * math.pi * 2 + rng:NextNumber(-0.12, 0.12)
		local center = Vector3.new(math.cos(angle) * radius, rng:NextNumber(3, 7), math.sin(angle) * radius)
		local tower = rng:NextNumber() < Config.TOWER_CHANCE
		islands[i] = center
		local genPos = buildIsland(map, i, center, tower)
		spots[i] = { position = genPos, tower = tower }
	end

	local function islandRadius(i: number): number
		return if spots[i].tower then 20 else 16
	end

	-- caminhos: spawn -> cada ilha interna, anel interno, zigue-zague interno/externo
	for i = 1, count do
		if i % 2 == 1 then
			buildPath(map, spawnTop, Config.SPAWN_RADIUS, islands[i], islandRadius(i))
			local nextInner = (i + 1) % count + 1
			if nextInner ~= i then
				buildPath(map, islands[i], islandRadius(i), islands[nextInner], islandRadius(nextInner))
			end
		end
		local nxt = i % count + 1
		buildPath(map, islands[i], islandRadius(i), islands[nxt], islandRadius(nxt))
	end

	buildScatter(map)
	map.Parent = workspace
	setupFadeBlocks()

	return {
		spawn = spawnTop,
		generatorSpots = spots,
	}
end

return MapBuilder
