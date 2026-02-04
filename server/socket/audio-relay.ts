import type { Server } from "socket.io";
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

function readFileAsBase64(filePath: string): string | null {
  if (!existsSync(filePath)) {
    console.error(`[audio-relay] File not found: ${filePath}`);
    return null;
  }
  return readFileSync(filePath).toString("base64");
}

export function setupAudioRelay(io: Server) {
  let playerCount = 0;

  io.on("connection", (socket) => {
    socket.on("register-audio-player", () => {
      socket.join("audio-players");
      playerCount++;
      io.emit("audio-players-updated", { count: playerCount });

      socket.on("disconnect", () => {
        playerCount--;
        io.emit("audio-players-updated", { count: playerCount });
      });
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
      if (!audioBase64) return;

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
      if (!audioBase64) return;

      io.to("audio-players").emit("audio:play-preset", {
        ...payload,
        audioBase64,
        mimeType: "audio/mpeg",
      });
    });

    // Relay other events without modification
    for (const event of AUDIO_EVENTS_RELAY) {
      socket.on(event, (payload: unknown) => {
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
