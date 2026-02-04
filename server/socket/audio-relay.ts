import type { Server, Socket } from "socket.io";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Events that just relay without modification
const AUDIO_EVENTS_RELAY = [
  "audio:stop-ambient",
  "audio:volume-ambient",
  "audio:pause-preset",
  "audio:seek-preset",
  "audio:stop-preset",
  "audio:play-tts",
  "audio:volume-ia",
  "audio:stop-all",
  "audio:master-volume",
] as const;

interface PlayAmbientPayload {
  soundId: string;
  file: string;
  volume?: number;
}

interface PlayPresetPayload {
  presetIdx: number;
  file: string;
}

interface AudioPlayerInfo {
  socketId: string;
  gameId: string | null;
  registeredAt: Date;
}

// Track audio players by socketId -> gameId
const audioPlayers = new Map<string, AudioPlayerInfo>();

function readFileAsBase64(filePath: string): string | null {
  if (!existsSync(filePath)) {
    console.error(`[audio-relay] File not found: ${filePath}`);
    return null;
  }
  return readFileSync(filePath).toString("base64");
}

// Emit audio status to backoffice
function emitAudioStatus(io: Server): void {
  const players = [...audioPlayers.values()].map((p) => ({
    gameId: p.gameId,
    socketId: p.socketId,
  }));
  io.emit("audio-status-updated", { players, count: players.length });
}

// Emit audio log to backoffice timeline
function emitAudioLog(
  io: Server,
  type: "preset" | "tts" | "ambient" | "system",
  action: "play" | "stop" | "pause" | "error" | "info",
  message: string,
  gameId?: string
): void {
  io.emit("audio:log", {
    type,
    action,
    message,
    gameId,
    timestamp: new Date(),
  });
}

export function setupAudioRelay(io: Server) {
  io.on("connection", (socket: Socket) => {
    socket.on("register-audio-player", () => {
      socket.join("audio-players");

      // Get gameId from socket.data (set by gamemaster.ts during register)
      const gameKey = socket.data.gameKey as string | undefined;

      audioPlayers.set(socket.id, {
        socketId: socket.id,
        gameId: gameKey ?? null,
        registeredAt: new Date(),
      });

      console.log(
        `[audio-relay] Audio player registered: ${gameKey ?? "unknown"} (${socket.id})`
      );

      emitAudioStatus(io);
      emitAudioLog(
        io,
        "system",
        "info",
        `Audio activé: ${gameKey ?? "lecteur inconnu"}`,
        gameKey ?? undefined
      );

      // Handle disconnect only for audio-player unregistration
      const handleAudioDisconnect = () => {
        if (audioPlayers.has(socket.id)) {
          const player = audioPlayers.get(socket.id);
          audioPlayers.delete(socket.id);
          console.log(
            `[audio-relay] Audio player disconnected: ${player?.gameId ?? "unknown"}`
          );
          emitAudioStatus(io);
          emitAudioLog(
            io,
            "system",
            "info",
            `Audio déconnecté: ${player?.gameId ?? "lecteur inconnu"}`,
            player?.gameId ?? undefined
          );
        }
      };
      socket.on("disconnect", handleAudioDisconnect);
    });

    // audio:play-ambient - read file and send base64
    socket.on("audio:play-ambient", (payload: PlayAmbientPayload) => {
      const filePath = path.join(
        __dirname,
        "..",
        "audio",
        "ambient",
        payload.file
      );
      const audioBase64 = readFileAsBase64(filePath);
      if (!audioBase64) {
        emitAudioLog(
          io,
          "ambient",
          "error",
          `Fichier non trouvé: ${payload.file}`
        );
        return;
      }

      const playerCount = audioPlayers.size;
      emitAudioLog(
        io,
        "ambient",
        "play",
        `Ambiance "${payload.soundId}" → ${playerCount} lecteur(s)`
      );

      io.to("audio-players").emit("audio:play-ambient", {
        ...payload,
        audioBase64,
        mimeType: "audio/mpeg",
      });
    });

    // audio:play-preset - read file and send base64
    socket.on("audio:play-preset", (payload: PlayPresetPayload) => {
      const filePath = path.join(
        __dirname,
        "..",
        "audio",
        "presets",
        payload.file
      );
      const audioBase64 = readFileAsBase64(filePath);
      if (!audioBase64) {
        emitAudioLog(
          io,
          "preset",
          "error",
          `Fichier non trouvé: ${payload.file}`
        );
        return;
      }

      const playerCount = audioPlayers.size;
      emitAudioLog(
        io,
        "preset",
        "play",
        `Preset "${payload.file}" → ${playerCount} lecteur(s)`
      );

      io.to("audio-players").emit("audio:play-preset", {
        ...payload,
        audioBase64,
        mimeType: "audio/mpeg",
      });
    });

    // Relay other events without modification (with logging for important ones)
    for (const event of AUDIO_EVENTS_RELAY) {
      socket.on(event, (payload: unknown) => {
        // Log TTS events
        if (event === "audio:play-tts") {
          const playerCount = audioPlayers.size;
          emitAudioLog(
            io,
            "tts",
            "play",
            `Message TTS → ${playerCount} lecteur(s)`
          );
        }
        // Log stop events
        if (event === "audio:stop-ambient") {
          const p = payload as { soundId?: string };
          emitAudioLog(io, "ambient", "stop", `Arrêt ambiance "${p.soundId}"`);
        }
        if (event === "audio:stop-preset") {
          emitAudioLog(io, "preset", "stop", "Arrêt preset");
        }
        if (event === "audio:pause-preset") {
          emitAudioLog(io, "preset", "pause", "Pause preset");
        }

        io.to("audio-players").emit(event, payload);
      });
    }

    // Progress from player → broadcast to backoffice clients
    socket.on("audio:preset-progress", (payload: unknown) => {
      socket.broadcast.emit("audio:preset-progress", payload);
    });

    // Spotify: backoffice → player
    socket.on("spotify:toggle", (payload: unknown) => {
      io.to("audio-players").emit("spotify:toggle", payload);
    });

    // Spotify: player → backoffice
    socket.on("spotify:state", (payload: unknown) => {
      socket.broadcast.emit("spotify:state", payload);
    });
  });
}
