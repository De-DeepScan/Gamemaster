import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { Server } from "socket.io";
import {
  setupGamemaster,
  getConnectedGames,
  sendCommand,
} from "./socket/gamemaster.js";
import { setupAudioRelay } from "./socket/audio-relay.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
  maxHttpBufferSize: 5e6,
});

app.use(cors());
app.use(express.json());
app.use("/sounds", express.static(path.join(__dirname, "sounds")));
app.use("/presets", express.static(path.join(__dirname, "presets")));

app.get("/player", (_req, res) => {
  res.sendFile(path.join(__dirname, "player", "index.html"));
});

// List connected mini-games
app.get("/api/games", (_req, res) => {
  res.json(getConnectedGames());
});

// Send a command to a mini-game
app.post("/api/games/:gameId/command", (req, res) => {
  const { gameId } = req.params;
  const { action, payload } = req.body as {
    action: string;
    payload?: Record<string, unknown>;
  };
  const sent = sendCommand(io, gameId, action, payload);
  if (!sent) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json({ ok: true });
});

setupGamemaster(io);
setupAudioRelay(io);

function getLocalIP(): string | null {
  const nets = networkInterfaces();
  for (const addrs of Object.values(nets)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return null;
}

const PORT = 3000;
httpServer.listen(PORT, () => {
  const ip = getLocalIP();
  console.log(`[server] Backoffice running on http://localhost:${PORT}`);
  if (ip) {
    console.log(`[server] Réseau local : http://${ip}:${PORT}`);
    console.log(`[server] Player audio : http://${ip}:${PORT}/player`);
  }
});
