import { useEffect, useState, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import "./App.css";

const API_URL = "http://localhost:3000";
const socket = io(API_URL);

type ActionStatus = "idle" | "loading" | "success" | "error";

interface GameAction {
  id: string;
  label: string;
  params?: string[];
}

interface ConnectedGame {
  socketId: string;
  gameId: string;
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
    // Group by base game id (e.g. "labyrinthe-explorer" → "labyrinthe")
    const baseId = game.gameId.replace(/-(explorer|protector)$/, "");
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

function App() {
  const [games, setGames] = useState<ConnectedGame[]>([]);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ActionStatus>>({});

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("games_updated", (data: ConnectedGame[]) => setGames(data));

    fetch(`${API_URL}/api/games`)
      .then((r) => r.json())
      .then(setGames)
      .catch(() => {});

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("games_updated");
    };
  }, []);

  const groups = useMemo(() => groupGames(games), [games]);

  // Auto-select first tab
  useEffect(() => {
    if (
      groups.length > 0 &&
      (!activeTab || !groups.find((g) => g.baseId === activeTab))
    ) {
      setActiveTab(groups[0].baseId);
    }
    if (groups.length === 0) {
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
      </header>

      {/* Tabs */}
      {groups.length > 0 && (
        <nav className="game-tabs">
          {groups.map((group) => (
            <button
              key={group.baseId}
              className={`game-tab ${activeTab === group.baseId ? "active" : ""}`}
              onClick={() => setActiveTab(group.baseId)}
            >
              <span className="tab-dot" />
              <span className="tab-name">
                {group.instances[0]?.name.replace(/\s*\(.*\)$/, "") ??
                  group.baseId}
              </span>
              <span className="tab-count">
                {group.instances.length} instance
                {group.instances.length > 1 ? "s" : ""}
              </span>
            </button>
          ))}
        </nav>
      )}

      <main className="controls">
        {games.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">Aucun mini-jeu connecté</p>
            <p className="empty-hint">
              En attente de connexions sur {API_URL}...
            </p>
          </div>
        ) : activeGroup ? (
          <div className="game-panel">
            {/* Instances status */}
            <div className="instances-bar">
              {activeGroup.instances.map((inst) => {
                const roleName = inst.gameId.includes("-explorer")
                  ? "Explorer"
                  : inst.gameId.includes("-protector")
                    ? "Protecteur"
                    : inst.gameId;
                return (
                  <div key={inst.gameId} className="instance-badge">
                    <span className="instance-dot connected" />
                    <span className="instance-role">{roleName}</span>
                    {inst.state.role && (
                      <span className="instance-state">
                        {inst.state.gameStarted ? "En jeu" : "En attente"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions — send to all */}
            {activeGroup.instances.length > 0 && (
              <div className="button-grid">
                {activeGroup.instances[0].availableActions.map((action) => {
                  // Check if all instances are loading/success/error for this action
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

            {/* Per-instance controls if multiple instances */}
            {activeGroup.instances.length > 1 && (
              <div className="per-instance">
                <p className="section-label"># Par instance</p>
                {activeGroup.instances.map((inst) => {
                  const roleName = inst.gameId.includes("-explorer")
                    ? "Explorer"
                    : inst.gameId.includes("-protector")
                      ? "Protecteur"
                      : inst.gameId;
                  return (
                    <div key={inst.gameId} className="instance-controls">
                      <span className="instance-label">{roleName}</span>
                      <div className="instance-actions">
                        {inst.availableActions.map((action) => {
                          const status = getStatus(inst.gameId, action.id);
                          return (
                            <button
                              key={action.id}
                              className={`instance-btn ${getVariant(action.id)} ${status}`}
                              onClick={() =>
                                sendCommand(inst.gameId, action.id)
                              }
                              disabled={status === "loading"}
                            >
                              {status === "loading" ? "..." : action.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default App;
