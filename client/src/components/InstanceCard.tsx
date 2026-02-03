import type { AriaState } from "../types/aria";
import { AriaCatAvatar } from "./AriaCatAvatar";
import { PasswordAdminView } from "./PasswordAdminView";
import "./PasswordAdminView.css";

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
  ariaState?: AriaState;
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

export function InstanceCard({
  instance,
  expected,
  ariaState,
}: InstanceCardProps) {
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
    expected.gameId === "aria" && ariaState ? "aria-layout" : "",
    expected.role ?? getSubGameClass(expected.gameId),
    statusClass,
  ]
    .filter(Boolean)
    .join(" ");

  // ARIA-specific layout
  if (expected.gameId === "aria" && ariaState) {
    return (
      <div className={cardClasses}>
        <div className={`instance-status-badge ${statusClass}`}>
          <span className="status-dot" />
          {statusLabel}
        </div>

        <div className="aria-info-section">
          <span className="instance-role">
            {instance ? getRoleName(instance) : expected.name}
          </span>

          <div className="aria-mini-status-grid">
            <div
              className={`aria-mini-status-block ${ariaState.isEvil ? "mode-evil" : "mode-good"}`}
            >
              <span className="mini-status-label">Mode</span>
              <span className="mini-status-value">
                {ariaState.isEvil ? "Evil" : "Good"}
              </span>
            </div>

            <div
              className={`aria-mini-status-block ${ariaState.isSpeaking ? "voice-active" : "voice-inactive"}`}
            >
              <span className="mini-status-label">Voix</span>
              <span className="mini-status-value">
                {ariaState.isSpeaking ? "Active" : "Off"}
              </span>
            </div>

            {ariaState.isDilemmaOpen && (
              <div className="aria-mini-status-block dilemma">
                <span className="mini-status-label">Dilemme</span>
                <span className="mini-status-value">
                  {ariaState.currentDilemmaIndex + 1}/{ariaState.totalDilemmas}
                </span>
              </div>
            )}
          </div>
        </div>

        <div
          className={`aria-avatar-container ${ariaState.isEvil ? "evil" : "good"}`}
        >
          <AriaCatAvatar
            isEvil={ariaState.isEvil}
            isSpeaking={ariaState.isSpeaking}
          />
        </div>
      </div>
    );
  }

  // Default layout for other games
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

      {/* Vue admin du mot de passe pour Sidequest */}
      {expected.gameId === "sidequest" &&
        instance &&
        instance.state.currentScreen === "lockscreen" &&
        instance.state.startScreen === true && (
          <PasswordAdminView
            passwordEntered={(instance.state.passwordEntered as string) || ""}
            isPasswordCorrect={
              (instance.state.isPasswordCorrect as boolean) || false
            }
          />
        )}
    </div>
  );
}
