import { useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";
import "./App.css";

const SERVER_URL = "http://localhost:3000";
const socket = io(SERVER_URL);

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

function App() {
  const [games, setGames] = useState<ConnectedGame[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("games_updated", (data: ConnectedGame[]) => setGames(data));

    fetch(`${SERVER_URL}/api/games`)
      .then((r) => r.json())
      .then(setGames)
      .catch(() => {});

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("games_updated");
    };
  }, []);

  const sendCommand = useCallback(async (gameId: string, action: string) => {
    await fetch(`${SERVER_URL}/api/games/${gameId}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload: {} }),
    });
  }, []);

  return (
    <div className="app">
      <div className="crt-overlay" />

      <header className="header">
        <h1 className="title">Gamemaster</h1>
        <div className={`status-badge ${connected ? "online" : "offline"}`}>
          <span className="status-dot" />
          {connected ? "Connecté" : "Déconnecté"}
        </div>
      </header>

      <main className="main">
        {games.length === 0 ? (
          <div className="empty-state">
            <p>Aucun mini-jeu connecté</p>
            <p className="empty-hint">
              En attente de connexions sur {SERVER_URL}...
            </p>
          </div>
        ) : (
          <div className="games-grid">
            {games.map((game) => (
              <div key={game.gameId} className="game-card">
                <div className="game-header">
                  <span className="game-dot" />
                  <h2 className="game-name">{game.name}</h2>
                  <span className="game-id">{game.gameId}</span>
                </div>

                {Object.keys(game.state).length > 0 && (
                  <div className="game-state">
                    <span className="state-label"># State</span>
                    <div className="state-grid">
                      {Object.entries(game.state).map(([key, value]) => (
                        <div key={key} className="state-item">
                          <span className="state-key">{key}</span>
                          <span
                            className={`state-value ${
                              value === true
                                ? "true"
                                : value === false
                                  ? "false"
                                  : ""
                            }`}
                          >
                            {String(value ?? "null")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="game-actions">
                  {game.availableActions.map((action) => (
                    <button
                      key={action.id}
                      className={`btn-action ${action.id === "reset" ? "danger" : ""}`}
                      onClick={() => sendCommand(game.gameId, action.id)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
