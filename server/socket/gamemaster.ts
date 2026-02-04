import type { Server, Socket } from "socket.io";
import { updateAudioPlayerGameId } from "./audio-relay.js";

interface GameAction {
  id: string;
  label: string;
  params?: string[];
}

type GameStatus = "connected" | "reconnecting" | "not_started";

interface ConnectedGame {
  socketId: string | null;
  gameId: string;
  role?: string | undefined;
  name: string;
  availableActions: GameAction[];
  state: Record<string, unknown>;
  status: GameStatus;
}

// Expected games configuration
interface ExpectedGame {
  gameId: string;
  name: string;
  role?: string;
}

const expectedGames: ExpectedGame[] = [
  { gameId: "aria", name: "ARIA Cat" },
  { gameId: "sidequest", name: "Sidequest" },
  { gameId: "labyrinthe", name: "Labyrinthe - Explorateur", role: "explorer" },
  { gameId: "labyrinthe", name: "Labyrinthe - Protecteur", role: "protector" },
  { gameId: "infection-map", name: "Carte Infection" },
];

// Key = "gameId:role" or "gameId" if no role
const connectedGames = new Map<string, ConnectedGame>();

// Track pending disconnection timeouts for graceful reconnection
const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

// Reconnection grace period in ms
const RECONNECT_GRACE_PERIOD = 10000;

function gameKey(gameId: string, role?: string): string {
  return role ? `${gameId}:${role}` : gameId;
}

// Initialize expected games with not_started status
function initExpectedGames(): void {
  for (const expected of expectedGames) {
    const key = gameKey(expected.gameId, expected.role);
    if (!connectedGames.has(key)) {
      connectedGames.set(key, {
        socketId: null,
        gameId: key,
        role: expected.role,
        name: expected.name,
        availableActions: [],
        state: {},
        status: "not_started",
      });
    }
  }
}

export function getConnectedGames(): ConnectedGame[] {
  return [...connectedGames.values()];
}

export function sendCommand(
  io: Server,
  gameId: string,
  action: string,
  payload: Record<string, unknown> = {}
): boolean {
  const game = connectedGames.get(gameId);
  if (!game || !game.socketId || game.status !== "connected") return false;
  io.to(game.socketId).emit("command", { type: "command", action, payload });
  return true;
}

export function setupGamemaster(io: Server): void {
  // Initialize expected games on startup
  initExpectedGames();

  io.on("connection", (socket: Socket) => {
    console.log(`[socket] New connection: ${socket.id}`);

    socket.on(
      "register",
      (data: {
        gameId: string;
        name: string;
        availableActions?: GameAction[];
        role?: string;
      }) => {
        const key = gameKey(data.gameId, data.role);

        // Store key on socket for later lookup
        socket.data.gameKey = key;

        // Update audio player gameId if this socket is already registered as audio player
        updateAudioPlayerGameId(io, socket.id, key);

        // Cancel any pending removal for this game
        const existingTimeout = disconnectTimeouts.get(key);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          disconnectTimeouts.delete(key);
        }

        // Check if this is a reconnection (game already exists)
        const existingGame = connectedGames.get(key);
        const isReconnection =
          existingGame && existingGame.status !== "not_started";

        const game: ConnectedGame = {
          socketId: socket.id,
          gameId: key,
          role: data.role,
          name: data.name,
          availableActions: data.availableActions ?? [],
          // Preserve state on reconnection
          state: existingGame?.state ?? {},
          status: "connected",
        };

        connectedGames.set(key, game);

        console.log(
          `[register] ${data.name} (${key}) — ${isReconnection ? "reconnected" : "new"} — actions: ${game.availableActions.map((a) => a.id).join(", ")}`
        );

        io.emit("games_updated", getConnectedGames());
      }
    );

    socket.on("state_update", (data: { state: Record<string, unknown> }) => {
      // Use stored gameKey instead of searching by socketId
      const key = socket.data.gameKey as string | undefined;
      if (!key) {
        console.warn(`[state] No gameKey for socket ${socket.id}`);
        return;
      }

      const game = connectedGames.get(key);
      if (!game) {
        console.warn(`[state] Game not found for key ${key}`);
        return;
      }

      // Update socketId in case this is after a reconnection
      game.socketId = socket.id;
      game.status = "connected";
      game.state = data.state;

      console.log(`[state] ${game.name}: ${JSON.stringify(data.state)}`);
      io.emit("games_updated", getConnectedGames());
    });

    socket.on(
      "event",
      (data: { name: string; data?: Record<string, unknown> }) => {
        const key = socket.data.gameKey as string | undefined;
        const game = key ? connectedGames.get(key) : undefined;

        console.log(
          `[event] ${game?.name ?? socket.id} → ${data.name}`,
          data.data ?? ""
        );

        // Auto-trigger Labyrinth when Sidequest password is correct
        if (data.name === "password_correct" && key === "sidequest") {
          console.log(
            "[automation] Password correct detected, launching Labyrinth..."
          );

          // Check if Labyrinth instances are already started
          const labyrintheExplorer = connectedGames.get("labyrinthe:explorer");
          const labyrintheProtector = connectedGames.get(
            "labyrinthe:protector"
          );

          const explorerStarted = labyrintheExplorer?.state
            .gameStarted as boolean;
          const protectorStarted = labyrintheProtector?.state
            .gameStarted as boolean;

          if (explorerStarted && protectorStarted) {
            console.log("[automation] Labyrinth already started, skipping");
            return;
          }

          // Send start command to both Labyrinth instances
          const explorerSent = sendCommand(io, "labyrinthe:explorer", "start");
          const protectorSent = sendCommand(
            io,
            "labyrinthe:protector",
            "start"
          );

          if (explorerSent) {
            console.log(
              "[automation] Sent start command to Labyrinth Explorer"
            );
          } else {
            console.warn(
              "[automation] Labyrinth Explorer not connected or not ready"
            );
          }

          if (protectorSent) {
            console.log(
              "[automation] Sent start command to Labyrinth Protector"
            );
          } else {
            console.warn(
              "[automation] Labyrinth Protector not connected or not ready"
            );
          }
        }

        // Relay Sidequest score to Labyrinth
        if (data.name === "point_earned" && key === "sidequest") {
          const payload = { points: data.data?.points };
          sendCommand(io, "labyrinthe:explorer", "sidequest_score", payload);
          sendCommand(io, "labyrinthe:protector", "sidequest_score", payload);
          console.log("[relay] Sidequest score → Labyrinth:", payload);
        }

        // Relay dilemma_response from ARIA to Labyrinth and Map
        if (data.name === "dilemma_response" && key === "aria") {
          const { dilemmaId, choiceId } = data.data as {
            dilemmaId: string;
            choiceId: string;
          };

          console.log(
            `[relay] Dilemma choice: dilemma=${dilemmaId}, choice=${choiceId}`
          );

          // Resume Labyrinth (choice is made, game can continue)
          sendCommand(io, "labyrinthe:explorer", "dilemma_end", {});
          sendCommand(io, "labyrinthe:protector", "dilemma_end", {});

          // Show video on Map
          sendCommand(io, "infection-map", "show_dilemme", {
            dilemme_id: dilemmaId,
            choice_id: choiceId,
          });
        }
      }
    );

    socket.on("game-message", (message: unknown) => {
      socket.broadcast.emit("game-message", message);
    });

    socket.on("disconnect", (reason) => {
      const key = socket.data.gameKey as string | undefined;
      if (!key) return;

      const game = connectedGames.get(key);
      if (!game) return;

      // Only process if this socket was the active one for this game
      if (game.socketId !== socket.id) {
        console.log(
          `[disconnect] Ignoring stale disconnect for ${key} (socket ${socket.id})`
        );
        return;
      }

      // Mark as reconnecting (grace period)
      game.status = "reconnecting";
      io.emit("games_updated", getConnectedGames());

      console.log(
        `[disconnect] ${game.name} (${key}) — reason: ${reason} — waiting for reconnection...`
      );

      // Schedule status change after grace period
      const timeout = setTimeout(() => {
        const currentGame = connectedGames.get(key);
        // Only update if still in reconnecting state with same socketId
        if (
          currentGame &&
          currentGame.socketId === socket.id &&
          currentGame.status === "reconnecting"
        ) {
          // Check if this was an expected game
          const isExpected = expectedGames.some(
            (e) => gameKey(e.gameId, e.role) === key
          );

          if (isExpected) {
            // Keep in list but mark as not started
            currentGame.status = "not_started";
            currentGame.socketId = null;
            currentGame.state = {};
            console.log(
              `[offline] ${currentGame.name} (${key}) — marked as not started`
            );
          } else {
            // Remove unexpected games entirely
            connectedGames.delete(key);
            console.log(`[removed] ${game.name} (${key})`);
          }

          io.emit("games_updated", getConnectedGames());
        }
        disconnectTimeouts.delete(key);
      }, RECONNECT_GRACE_PERIOD);

      disconnectTimeouts.set(key, timeout);
    });
  });
}
