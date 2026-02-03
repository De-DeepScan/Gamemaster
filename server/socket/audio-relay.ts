import type { Server } from "socket.io";

const AUDIO_EVENTS_TO_PLAYER = [
  "audio:play-ambient",
  "audio:stop-ambient",
  "audio:volume-ambient",
  "audio:play-preset",
  "audio:pause-preset",
  "audio:seek-preset",
  "audio:stop-preset",
  "audio:play-tts",
  "audio:volume-ia",
  "audio:stop-all",
  "audio:master-volume",
] as const;

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

    for (const event of AUDIO_EVENTS_TO_PLAYER) {
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
