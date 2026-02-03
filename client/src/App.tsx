import { useEffect, useState, useCallback, useMemo } from "react";
import "./App.css";
import VoiceCloner from "./VoiceCloner";
import SoundPad from "./SoundPad";
import { socket, API_URL } from "./socket";

type ActionStatus = "idle" | "loading" | "success" | "error";

interface GameAction {
  id: string;
  label: string;
  params?: string[];
}

interface ConnectedGame {
  socketId: string;
  gameId: string;
  role?: string;
  name: string;
  availableActions: GameAction[];
  state: Record<string, unknown>;
}

interface GameGroup {
  baseId: string;
  instances: ConnectedGame[];
}

function groupGames(games: ConnectedGame[]): GameGroup[] {
  const groups = new Map<string, ConnectedGame[]>();
  for (const game of games) {
    const baseId = game.gameId.split(":")[0];
    const list = groups.get(baseId) ?? [];
    list.push(game);
    groups.set(baseId, list);
  }
  return [...groups.entries()].map(([baseId, instances]) => ({
    baseId,
    instances,
  }));
}

function getVariant(actionId: string): string {
  if (actionId === "reset") return "danger";
  if (actionId === "start") return "success";
  if (actionId === "disable_ai") return "warning";
  return "primary";
}

function getRoleName(game: ConnectedGame): string {
  if (game.role === "explorer") return "Explorateur";
  if (game.role === "protector") return "Protecteur";
  if (game.role) return game.role;
  return game.name;
}

function App() {
  const [games, setGames] = useState<ConnectedGame[]>([]);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ActionStatus>>({});
  const [audioPlayerCount, setAudioPlayerCount] = useState(0);

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("games_updated", (data: ConnectedGame[]) => setGames(data));
    socket.on("audio-players-updated", (data: { count: number }) =>
      setAudioPlayerCount(data.count)
    );

    fetch(`${API_URL}/api/games`)
      .then((r) => r.json())
      .then(setGames)
      .catch(() => {});

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("games_updated");
      socket.off("audio-players-updated");
    };
  }, []);

  const groups = useMemo(() => groupGames(games), [games]);

  useEffect(() => {
    if (activeTab === "voice_cloner") return;

    if (
      groups.length > 0 &&
      (!activeTab || !groups.find((g) => g.baseId === activeTab))
    ) {
      setActiveTab(groups[0].baseId);
    }
    if (groups.length === 0 && activeTab !== "voice_cloner") {
      setActiveTab(null);
    }
  }, [groups, activeTab]);

  const activeGroup = groups.find((g) => g.baseId === activeTab) ?? null;

  const sendCommand = useCallback(async (gameId: string, actionId: string) => {
    const key = `${gameId}:${actionId}`;
    setStatuses((prev) => ({ ...prev, [key]: "loading" }));

    try {
      const response = await fetch(`${API_URL}/api/games/${gameId}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionId, payload: {} }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      setStatuses((prev) => ({ ...prev, [key]: "success" }));
      setTimeout(() => {
        setStatuses((prev) => ({ ...prev, [key]: "idle" }));
      }, 1500);
    } catch {
      setStatuses((prev) => ({ ...prev, [key]: "error" }));
      setTimeout(() => {
        setStatuses((prev) => ({ ...prev, [key]: "idle" }));
      }, 2500);
    }
  }, []);

  const sendToAll = useCallback(
    async (instances: ConnectedGame[], actionId: string) => {
      await Promise.all(
        instances.map((inst) => sendCommand(inst.gameId, actionId))
      );
    },
    [sendCommand]
  );

  const getStatus = (gameId: string, actionId: string): ActionStatus => {
    return statuses[`${gameId}:${actionId}`] ?? "idle";
  };

  return (
    <div className="dashboard">
      <header className="header">
        <h1>Gamemaster</h1>
        <div className={`connection-badge ${connected ? "online" : "offline"}`}>
          <span className="connection-dot" />
          {connected ? "Serveur connecté" : "Serveur déconnecté"}
        </div>
        <div
          className={`connection-badge ${audioPlayerCount > 0 ? "online" : "offline"}`}
        >
          <span className="connection-dot" />
          {audioPlayerCount} player{audioPlayerCount !== 1 ? "s" : ""} audio
        </div>
      </header>

      {/* Tabs */}
      <nav className="game-tabs">
        {groups.map((group) => (
          <button
            key={group.baseId}
            className={`game-tab ${activeTab === group.baseId ? "active" : ""}`}
            onClick={() => setActiveTab(group.baseId)}
          >
            <span className="tab-dot" />
            <span className="tab-name">
              {group.instances[0]?.name.replace(/\s*-\s.*$/, "") ??
                group.baseId}
            </span>
            <span className="tab-count">
              {group.instances.length} instance
              {group.instances.length > 1 ? "s" : ""}
            </span>
          </button>
        ))}

        <button
          className={`game-tab ${activeTab === "voice_cloner" ? "active" : ""}`}
          onClick={() => setActiveTab("voice_cloner")}
        >
          <span
            className="tab-dot"
            style={{ background: "#00ffff", boxShadow: "0 0 6px cyan" }}
          />
          <span className="tab-name">Sound Control</span>
        </button>
      </nav>

      <main
        className={`controls ${activeTab === "voice_cloner" ? "controls-full" : ""}`}
      >
        {activeTab === "voice_cloner" ? (
          <div className="sound-control-layout">
            <div className="sound-control-col">
              <div className="col-header">IA</div>
              <VoiceCloner />
            </div>
            <div className="sound-control-col">
              <div className="col-header">AMBIANCE SONORE</div>
              <SoundPad />
            </div>
          </div>
        ) : games.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">Aucun mini-jeu connecté</p>
            <p className="empty-hint">En attente des connexions...</p>
          </div>
        ) : activeGroup ? (
          <div className="game-panel">
            <div className="instances-bar">
              {activeGroup.instances.map((inst) => (
                <div key={inst.gameId} className="instance-badge">
                  <span className="instance-dot connected" />
                  <span className="instance-role">{getRoleName(inst)}</span>
                  {inst.state.role ? (
                    <span className="instance-state">
                      {inst.state.gameStarted ? "En jeu" : "En attente"}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            {activeGroup.instances.length > 0 && (
              <div className="button-grid">
                {activeGroup.instances[0].availableActions.map((action) => {
                  const allStatuses = activeGroup.instances.map((inst) =>
                    getStatus(inst.gameId, action.id)
                  );
                  const isLoading = allStatuses.some((s) => s === "loading");
                  const isSuccess = allStatuses.every((s) => s === "success");
                  const isError = allStatuses.some((s) => s === "error");

                  let btnStatus: ActionStatus = "idle";
                  if (isLoading) btnStatus = "loading";
                  else if (isSuccess) btnStatus = "success";
                  else if (isError) btnStatus = "error";

                  return (
                    <button
                      key={action.id}
                      className={`control-btn ${getVariant(action.id)} ${btnStatus}`}
                      onClick={() =>
                        sendToAll(activeGroup.instances, action.id)
                      }
                      disabled={isLoading}
                    >
                      <span className="btn-label">
                        {isLoading ? "Envoi..." : action.label}
                      </span>
                      <span className="btn-description">
                        {activeGroup.instances.length > 1
                          ? "Toutes les instances"
                          : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {activeGroup.instances.length > 1 && (
              <div className="per-instance">
                <p className="section-label"># Par instance</p>
                {activeGroup.instances.map((inst) => (
                  <div key={inst.gameId} className="instance-controls">
                    <span className="instance-label">{getRoleName(inst)}</span>
                    <div className="instance-actions">
                      {inst.availableActions.map((action) => {
                        const status = getStatus(inst.gameId, action.id);
                        return (
                          <button
                            key={action.id}
                            className={`instance-btn ${getVariant(action.id)} ${status}`}
                            onClick={() => sendCommand(inst.gameId, action.id)}
                            disabled={status === "loading"}
                          >
                            {status === "loading" ? "..." : action.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default App;
