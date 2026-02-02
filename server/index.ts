import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  setupGamemaster,
  getConnectedGames,
  sendCommand,
} from "./socket/gamemaster.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());

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

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`[server] Backoffice running on http://localhost:${PORT}`);
});
