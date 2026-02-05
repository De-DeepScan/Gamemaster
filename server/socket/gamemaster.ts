import type { Server, Socket } from "socket.io";
import { updateAudioPlayerGameId, playDilemmeAudio } from "./audio-relay.js";

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
  { gameId: "messagerie", name: "Messagerie" },
  { gameId: "usb-key", name: "Clé USB" },
];

// Key = "gameId:role" or "gameId" if no role
const connectedGames = new Map<string, ConnectedGame>();

// Track pending disconnection timeouts for graceful reconnection
const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

// Reconnection grace period in ms
const RECONNECT_GRACE_PERIOD = 10000;

// Camera ping tracking: cameraId -> { socketId, lastPing, hasStream }
const connectedCameras = new Map<
  string,
  { socketId: string; lastPing: number; hasStream: boolean }
>();

// Consider a camera offline if no ping for 45s (1.5x the 30s interval)
const CAMERA_TIMEOUT = 45_000;

function getCamerasStatus(): Record<string, boolean> {
  const now = Date.now();
  const status: Record<string, boolean> = {};
  for (const [cameraId, info] of connectedCameras) {
    // Camera is online only if ping is recent AND stream is available
    status[cameraId] = now - info.lastPing < CAMERA_TIMEOUT && info.hasStream;
  }
  return status;
}

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
        // Reject labyrinthe registration without role (defense in depth)
        if (data.gameId === "labyrinthe" && !data.role) {
          console.warn(
            `[register] Rejected labyrinthe registration without role from ${socket.id}`
          );
          return;
        }

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

        // Auto-trigger victory when USB key connects
        if (data.gameId === "usb-key") {
          console.log(
            "[automation] USB key connected, triggering player victory..."
          );
          setTimeout(() => {
            sendCommand(io, "labyrinthe:explorer", "show_identity_card");
            sendCommand(io, "labyrinthe:protector", "show_identity_card");
            sendCommand(io, "infection-map", "player_victory");
          }, 1000);
        }
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
          const explorerSent = sendCommand(
            io,
            "labyrinthe:explorer",
            "sidequest_score",
            payload
          );
          const protectorSent = sendCommand(
            io,
            "labyrinthe:protector",
            "sidequest_score",
            payload
          );
          console.log(
            "[relay] Sidequest score → Labyrinth:",
            payload,
            "explorer:",
            explorerSent,
            "protector:",
            protectorSent
          );
          if (!protectorSent) {
            const protectorGame = connectedGames.get("labyrinthe:protector");
            console.log(
              "[relay] Protector game state:",
              protectorGame
                ? {
                    socketId: !!protectorGame.socketId,
                    status: protectorGame.status,
                  }
                : "NOT FOUND"
            );
          }
        }

        // Relay dilemma_response from ARIA to Labyrinth and Map
        if (data.name === "dilemma_response" && key === "aria") {
          const { dilemmaId, choiceId, choiceDescription } = data.data as {
            dilemmaId: string;
            choiceId: string;
            choiceDescription?: string;
          };

          console.log(
            `[relay] Dilemma choice: dilemma=${dilemmaId}, choice=${choiceId}, desc="${choiceDescription ?? ""}"`
          );

          // Play ARIA voice for this dilemma choice on all speakers (except JT)
          const audioDurationMs = playDilemmeAudio(io, dilemmaId, choiceId);
          if (!audioDurationMs) {
            console.warn(
              `[relay] No audio file matched for dilemma=${dilemmaId} choice=${choiceId}`
            );
          }

          // Resume Labyrinth (choice is made, game can continue)
          sendCommand(io, "labyrinthe:explorer", "dilemma_end", {});
          sendCommand(io, "labyrinthe:protector", "dilemma_end", {});

          // Show video on Map AFTER ARIA voice finishes
          if (audioDurationMs > 0) {
            console.log(
              `[relay] Delaying show_dilemme by ${Math.round(audioDurationMs / 1000)}s (waiting for ARIA voice)`
            );
            setTimeout(() => {
              sendCommand(io, "infection-map", "show_dilemme", {
                dilemme_id: dilemmaId,
                choice_id: choiceId,
              });
              console.log(
                `[relay] show_dilemme sent to infection-map after ARIA voice`
              );
            }, audioDurationMs);
          } else {
            // No audio file — show video immediately
            sendCommand(io, "infection-map", "show_dilemme", {
              dilemme_id: dilemmaId,
              choice_id: choiceId,
            });
          }
        }
      }
    );

    socket.on("game-message", (message: unknown) => {
      socket.broadcast.emit("game-message", message);
    });

    // WebRTC camera ping tracking (hasStream indicates if stream is actually available)
    socket.on(
      "webrtc:camera-ping",
      (data: { cameraId: string; hasStream?: boolean }) => {
        connectedCameras.set(data.cameraId, {
          socketId: socket.id,
          lastPing: Date.now(),
          hasStream: data.hasStream ?? true, // Default true for backwards compatibility
        });
        io.emit("webrtc:cameras-status", getCamerasStatus());
      }
    );

    // Relay stream-available to viewers so they can request an offer immediately
    socket.on("webrtc:stream-available", (data: { cameraId: string }) => {
      socket.broadcast.emit("webrtc:stream-available", data);
    });

    // WebRTC signaling relay for webcam streaming (cameraId identifies each stream)
    socket.on("webrtc:request-offer", (data: { cameraId: string }) => {
      socket.broadcast.emit("webrtc:request-offer", data);
    });

    socket.on("webrtc:offer", (data: { cameraId: string; sdp: unknown }) => {
      socket.broadcast.emit("webrtc:offer", data);
    });

    socket.on("webrtc:answer", (data: { cameraId: string; sdp: unknown }) => {
      socket.broadcast.emit("webrtc:answer", data);
    });

    socket.on(
      "webrtc:ice-candidate",
      (data: { cameraId: string; candidate: unknown }) => {
        socket.broadcast.emit("webrtc:ice-candidate", data);
      }
    );

    socket.on("disconnect", (reason) => {
      // Remove cameras owned by this socket
      for (const [cameraId, info] of connectedCameras) {
        if (info.socketId === socket.id) {
          connectedCameras.delete(cameraId);
        }
      }
      io.emit("webrtc:cameras-status", getCamerasStatus());

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
