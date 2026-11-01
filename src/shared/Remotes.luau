-- Cria (no servidor) ou encontra (no cliente) os RemoteEvents do jogo.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local NAMES = {
	"Notify", -- (texto, cor) mensagem na tela
	"Splash", -- você tocou na água
	"Jumpscare", -- o monstro te pegou
	"Escaped", -- o monstro perdeu seu rastro
}

local folder
if RunService:IsServer() then
	folder = ReplicatedStorage:FindFirstChild("Remotes")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "Remotes"
		folder.Parent = ReplicatedStorage
	end
	for _, name in NAMES do
		if not folder:FindFirstChild(name) then
			local ev = Instance.new("RemoteEvent")
			ev.Name = name
			ev.Parent = folder
		end
	end
else
	folder = ReplicatedStorage:WaitForChild("Remotes")
end

local Remotes = {}
for _, name in NAMES do
	Remotes[name] = folder:WaitForChild(name) :: RemoteEvent
end

return Remotes
