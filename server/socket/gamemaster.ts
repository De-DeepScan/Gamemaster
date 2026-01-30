import type { Server, Socket } from "socket.io";

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

const connectedGames = new Map<string, ConnectedGame>();

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
  if (!game) return false;
  io.to(game.socketId).emit("command", { type: "command", action, payload });
  return true;
}

export function setupGamemaster(io: Server): void {
  io.on("connection", (socket: Socket) => {
    console.log(`[socket] New connection: ${socket.id}`);

    socket.on(
      "register",
      (data: {
        gameId: string;
        name: string;
        availableActions?: GameAction[];
      }) => {
        const game: ConnectedGame = {
          socketId: socket.id,
          gameId: data.gameId,
          name: data.name,
          availableActions: data.availableActions ?? [],
          state: {},
        };
        connectedGames.set(data.gameId, game);
        console.log(
          `[register] ${data.name} (${data.gameId}) — actions: ${game.availableActions.map((a) => a.id).join(", ")}`
        );
      }
    );

    socket.on("state_update", (data: { state: Record<string, unknown> }) => {
      const game = [...connectedGames.values()].find(
        (g) => g.socketId === socket.id
      );
      if (!game) return;
      game.state = data.state;
      console.log(`[state] ${game.name}: ${JSON.stringify(data.state)}`);
    });

    socket.on(
      "event",
      (data: { name: string; data?: Record<string, unknown> }) => {
        const game = [...connectedGames.values()].find(
          (g) => g.socketId === socket.id
        );
        console.log(
          `[event] ${game?.name ?? socket.id} → ${data.name}`,
          data.data ?? ""
        );
      }
    );

    socket.on("disconnect", () => {
      const game = [...connectedGames.values()].find(
        (g) => g.socketId === socket.id
      );
      if (game) {
        connectedGames.delete(game.gameId);
        console.log(`[disconnect] ${game.name} (${game.gameId})`);
      }
    });
  });
}
