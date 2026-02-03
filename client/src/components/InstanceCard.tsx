type GameStatus = "connected" | "reconnecting" | "not_started";

interface ConnectedGame {
  socketId: string | null;
  gameId: string;
  role?: string;
  name: string;
  state: Record<string, unknown>;
  status: GameStatus;
}

interface ExpectedInstance {
  gameId: string;
  name: string;
  role?: string;
}

interface InstanceCardProps {
  instance?: ConnectedGame;
  expected: ExpectedInstance;
}

function getRoleName(game: ConnectedGame): string {
  if (game.role === "explorer") return "Explorateur";
  if (game.role === "protector") return "Protecteur";
  if (game.role) return game.role;
  return game.name;
}

function getSubGameClass(gameId: string): string {
  const base = gameId.split(":")[0];
  if (base === "sidequest") return "sidequest";
  return "";
}

export function InstanceCard({ instance, expected }: InstanceCardProps) {
  const status = instance?.status ?? "not_started";

  // Status configuration
  const statusConfig = {
    connected: { label: "Connecté", className: "connected" },
    reconnecting: { label: "Reconnexion...", className: "reconnecting" },
    not_started: { label: "En attente", className: "not-started" },
  };

  const { label: statusLabel, className: statusClass } = statusConfig[status];

  // Game state - Sidequest-specific display
  let displayState = "En attente";
  if (instance && expected.gameId === "sidequest") {
    const currentScreen = instance.state.currentScreen as string;
    const startScreen = instance.state.startScreen as boolean;
    const phase = instance.state.phase as number;
    const score = instance.state.score as number;
    const inProgress = instance.state.in_progress as boolean;

    if (currentScreen === "lockscreen" && !startScreen) {
      displayState = "Écran noir";
    } else if (currentScreen === "lockscreen" && startScreen) {
      displayState = "Écran de connexion";
    } else if (currentScreen === "home") {
      displayState = "Transition...";
    } else if (currentScreen === "game" && inProgress) {
      displayState = `Phase ${phase}/6 - ${score} pts`;
    }
  } else {
    // Autres jeux
    displayState =
      instance?.state.gameStarted || instance?.state.in_progress
        ? "En jeu"
        : "En attente";
  }

  // Card classes
  const cardClasses = [
    "instance-card-compact",
    expected.role ?? getSubGameClass(expected.gameId),
    statusClass,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClasses}>
      <div className={`instance-status-badge ${statusClass}`}>
        <span className="status-dot" />
        {statusLabel}
      </div>
      <span className="instance-role">
        {instance ? getRoleName(instance) : expected.name}
      </span>
      <span className="instance-state">
        {status === "reconnecting"
          ? "Reconnexion..."
          : status === "not_started"
            ? "Non démarré"
            : displayState}
      </span>
    </div>
  );
}
