import type { Server, Socket } from "socket.io";
import { existsSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Game ID that only receives ambient/spotify (BFM/JT on mappemonde)
const JT_GAME_ID = "infection-map";

// Voice events: ARIA presets, TTS — routed to audio-players:voice (excludes JT)
const AUDIO_EVENTS_VOICE = [
  "audio:pause-preset",
  "audio:resume-preset",
  "audio:seek-preset",
  "audio:stop-preset",
  "audio:play-tts",
  "audio:volume-ia",
] as const;

// General events: ambient, master — routed to all audio-players
const AUDIO_EVENTS_ALL = [
  "audio:stop-ambient",
  "audio:volume-ambient",
  "audio:set-ambient-volume",
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

// Export function to update gameId after game registration (fixes timing issue)
export function updateAudioPlayerGameId(
  io: Server,
  socketId: string,
  gameId: string
): void {
  const player = audioPlayers.get(socketId);
  if (player && player.gameId === null) {
    player.gameId = gameId;
    console.log(
      `[audio-relay] Updated audio player gameId: ${socketId} -> ${gameId}`
    );

    // Join voice room if not JT
    if (gameId !== JT_GAME_ID) {
      const sock = io.sockets.sockets.get(socketId);
      sock?.join("audio-players:voice");
    }

    emitAudioStatus(io);
  }
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

// Scan Dilemmes directory for available audio files
const dilemmeDir = path.join(__dirname, "..", "audio", "presets", "Dilemmes");
const dilemmeFiles = existsSync(dilemmeDir)
  ? readdirSync(dilemmeDir).filter((f: string) => f.endsWith(".mp3"))
  : [];

if (dilemmeFiles.length > 0) {
  console.log(
    `[audio-relay] Dilemme audio files: ${dilemmeFiles.map((f: string) => f.replace(".mp3", "")).join(", ")}`
  );
}

// Play a dilemme audio file on all voice speakers (server-initiated)
export function playDilemmeAudio(io: Server, choiceId: string): boolean {
  // Try to find a matching file by choiceId
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const normalizedChoice = normalize(choiceId);

  let matchedFile: string | null = null;
  for (const file of dilemmeFiles) {
    const name = file.replace(".mp3", "");
    if (name === choiceId || normalize(name) === normalizedChoice) {
      matchedFile = file;
      break;
    }
  }

  // Partial match fallback
  if (!matchedFile) {
    for (const file of dilemmeFiles) {
      const name = normalize(file.replace(".mp3", ""));
      if (name.includes(normalizedChoice) || normalizedChoice.includes(name)) {
        matchedFile = file;
        break;
      }
    }
  }

  if (!matchedFile) {
    console.warn(
      `[audio-relay] No dilemme audio for choiceId="${choiceId}". Available: ${dilemmeFiles.map((f: string) => f.replace(".mp3", "")).join(", ")}`
    );
    return false;
  }

  const relativePath = `Dilemmes/${matchedFile}`;
  const fullPath = path.join(__dirname, "..", "audio", "presets", relativePath);

  if (!existsSync(fullPath)) {
    console.error(`[audio-relay] Dilemme file missing: ${fullPath}`);
    return false;
  }

  const fileSizeKB = Math.round(statSync(fullPath).size / 1024);
  console.log(
    `[audio-relay] Playing dilemme: "${matchedFile}" (${fileSizeKB}KB) for choiceId="${choiceId}"`
  );

  io.to("audio-players:voice").emit("audio:play-preset", {
    presetIdx: -1,
    file: relativePath,
  });

  io.emit("audio:log", {
    type: "preset",
    action: "play",
    message: `Dilemme "${matchedFile}" → voix`,
    timestamp: new Date(),
  });

  return true;
}

export function setupAudioRelay(io: Server) {
  io.on("connection", (socket: Socket) => {
    socket.on("register-audio-player", () => {
      socket.join("audio-players");

      // Get gameId from socket.data (set by gamemaster.ts during register)
      const gameKey = socket.data.gameKey as string | undefined;

      // Join voice room (ARIA presets/TTS) unless this is the JT display
      if (gameKey !== JT_GAME_ID) {
        socket.join("audio-players:voice");
      }

      audioPlayers.set(socket.id, {
        socketId: socket.id,
        gameId: gameKey ?? null,
        registeredAt: new Date(),
      });

      console.log(
        `[audio-relay] Audio player registered: ${gameKey ?? "unknown"} (${socket.id}) [voice: ${gameKey !== JT_GAME_ID}]`
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

    // audio:play-ambient - validate file exists, relay lightweight payload
    socket.on("audio:play-ambient", (payload: PlayAmbientPayload) => {
      const filePath = path.join(
        __dirname,
        "..",
        "audio",
        "ambient",
        payload.file
      );
      if (!existsSync(filePath)) {
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

      io.to("audio-players").emit("audio:play-ambient", payload);
    });

    // audio:play-preset - validate file exists, relay lightweight payload
    socket.on("audio:play-preset", (payload: PlayPresetPayload) => {
      const filePath = path.join(
        __dirname,
        "..",
        "audio",
        "presets",
        payload.file
      );

      console.log(`[audio-relay] Preset request: ${payload.file}`);

      if (!existsSync(filePath)) {
        console.error(
          `[audio-relay] PRESET ERROR: File not found at ${filePath}`
        );
        emitAudioLog(
          io,
          "preset",
          "error",
          `Fichier non trouve: ${payload.file} (path: ${filePath})`
        );
        return;
      }

      const fileSizeKB = Math.round(statSync(filePath).size / 1024);
      const playerCount = audioPlayers.size;
      const playerList = [...audioPlayers.values()]
        .map((p) => p.gameId ?? "unknown")
        .join(", ");

      console.log(
        `[audio-relay] Preset OK: ${payload.file} (${fileSizeKB}KB) -> ${playerCount} player(s): [${playerList}]`
      );

      emitAudioLog(
        io,
        "preset",
        "play",
        `Preset "${payload.file}" (${fileSizeKB}KB) -> ${playerCount} lecteur(s)`
      );

      io.to("audio-players:voice").emit("audio:play-preset", payload);
    });

    // Voice events → audio-players:voice (excludes JT/mappemonde)
    for (const event of AUDIO_EVENTS_VOICE) {
      socket.on(event, (payload: unknown) => {
        if (event === "audio:play-tts") {
          const playerCount = audioPlayers.size;
          emitAudioLog(
            io,
            "tts",
            "play",
            `Message TTS → ${playerCount} lecteur(s)`
          );
        }
        if (event === "audio:stop-preset") {
          emitAudioLog(io, "preset", "stop", "Arrêt preset");
        }
        if (event === "audio:pause-preset") {
          emitAudioLog(io, "preset", "pause", "Pause preset");
        }
        if (event === "audio:resume-preset") {
          emitAudioLog(io, "preset", "play", "Resume preset");
        }

        io.to("audio-players:voice").emit(event, payload);
      });
    }

    // General events → all audio-players (including JT)
    for (const event of AUDIO_EVENTS_ALL) {
      socket.on(event, (payload: unknown) => {
        if (event === "audio:stop-ambient") {
          const p = payload as { soundId?: string };
          emitAudioLog(io, "ambient", "stop", `Arrêt ambiance "${p.soundId}"`);
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
