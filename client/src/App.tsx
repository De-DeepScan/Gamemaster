import { useEffect, useState, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import { toast, Toaster } from "sonner";
import { ConfirmDialog } from "./components/ConfirmDialog";
import "./App.css";

const API_URL = "http://localhost:3000";
const socket = io(API_URL);

type ActionStatus = "idle" | "loading" | "success" | "error";

interface GameAction {
  id: string;
  label: string;
  params?: string[];
}

interface ConnectedGame {
  socketId: string;
  gameId: string;
  role?: string;
  name: string;
  availableActions: GameAction[];
  state: Record<string, unknown>;
}

interface ExpectedInstance {
  gameId: string;
  name: string;
  role?: string;
}

interface PredefinedGame {
  baseId: string;
  displayName: string;
  expectedInstances: ExpectedInstance[];
}

interface GameGroup {
  baseId: string;
  displayName: string;
  instances: ConnectedGame[];
  expectedInstances: ExpectedInstance[];
  isConnected: boolean;
}

// ARIA state interface for preview
interface AriaState {
  isEvil: boolean;
  isSpeaking: boolean;
  isDilemmaOpen: boolean;
  currentDilemmaIndex: number;
  totalDilemmas: number;
}

// Predefined games that should always be visible
const PREDEFINED_GAMES: PredefinedGame[] = [
  {
    baseId: "labyrinthe",
    displayName: "Labyrinthe",
    expectedInstances: [
      { gameId: "labyrinthe:explorer", name: "Explorateur", role: "explorer" },
      { gameId: "labyrinthe:protector", name: "Protecteur", role: "protector" },
    ],
  },
  {
    baseId: "sidequest",
    displayName: "Sidequest",
    expectedInstances: [
      { gameId: "sidequest-computer", name: "Computer" },
      { gameId: "sidequest-uplink", name: "Uplink" },
    ],
  },
  {
    baseId: "aria",
    displayName: "ARIA",
    expectedInstances: [{ gameId: "aria", name: "ARIA Cat" }],
  },
];

// Map of gameId prefixes that should be grouped under a single tab
const GAME_GROUP_PREFIXES: Record<string, string> = {
  "sidequest-computer": "sidequest",
  "sidequest-uplink": "sidequest",
};

function groupConnectedGames(
  games: ConnectedGame[]
): Map<string, ConnectedGame[]> {
  const groups = new Map<string, ConnectedGame[]>();
  for (const game of games) {
    // gameId is "labyrinthe:explorer" or "labyrinthe" — group by base
    const rawBase = game.gameId.split(":")[0];
    const baseId = GAME_GROUP_PREFIXES[rawBase] ?? rawBase;
    const list = groups.get(baseId) ?? [];
    list.push(game);
    groups.set(baseId, list);
  }
  return groups;
}

function mergeWithPredefined(games: ConnectedGame[]): GameGroup[] {
  const connectedMap = groupConnectedGames(games);

  return PREDEFINED_GAMES.map((def) => {
    const connected = connectedMap.get(def.baseId) ?? [];
    return {
      baseId: def.baseId,
      displayName: def.displayName,
      instances: connected,
      expectedInstances: def.expectedInstances,
      isConnected: connected.length > 0,
    };
  });
}

function getVariant(actionId: string): string {
  if (actionId === "reset") return "danger";
  if (
    actionId === "start" ||
    actionId === "start_screen" ||
    actionId === "add_points"
  )
    return "success";
  if (actionId === "disable_ai" || actionId === "skip_phase") return "warning";
  if (actionId === "remove_points") return "danger";
  // ARIA-specific variants
  if (actionId === "enable_evil" || actionId === "enable_dilemma")
    return "danger";
  if (actionId === "disable_evil" || actionId === "disable_dilemma")
    return "success";
  if (actionId === "enable_speaking") return "success";
  if (actionId === "disable_speaking") return "warning";
  return "primary";
}

// Extract ARIA state from connected games
function getAriaState(games: ConnectedGame[]): AriaState | null {
  const ariaGame = games.find((g) => g.gameId === "aria");
  if (!ariaGame) return null;
  return {
    isEvil: (ariaGame.state.isEvil as boolean) ?? false,
    isSpeaking: (ariaGame.state.isSpeaking as boolean) ?? false,
    isDilemmaOpen: (ariaGame.state.isDilemmaOpen as boolean) ?? false,
    currentDilemmaIndex: (ariaGame.state.currentDilemmaIndex as number) ?? 0,
    totalDilemmas: (ariaGame.state.totalDilemmas as number) ?? 0,
  };
}

// Filter ARIA actions based on current state (show only relevant toggle)
function getFilteredAriaActions(
  actions: GameAction[],
  ariaState: AriaState | null
): GameAction[] {
  if (!ariaState) return actions;

  return actions.filter((action) => {
    // Show enable_evil only when NOT evil, disable_evil only when evil
    if (action.id === "enable_evil") return !ariaState.isEvil;
    if (action.id === "disable_evil") return ariaState.isEvil;
    // Show enable_speaking only when NOT speaking, disable_speaking when speaking
    if (action.id === "enable_speaking") return !ariaState.isSpeaking;
    if (action.id === "disable_speaking") return ariaState.isSpeaking;
    // Show enable_dilemma only when dilemma NOT open, disable_dilemma when open
    if (action.id === "enable_dilemma") return !ariaState.isDilemmaOpen;
    if (action.id === "disable_dilemma") return ariaState.isDilemmaOpen;
    return true; // Keep other actions like reset
  });
}

// ARIA Preview component - SVG conforme au Design System
function AriaPreview({ state }: { state: AriaState }) {
  return (
    <div className={`aria-preview ${state.isEvil ? "evil" : "good"}`}>
      <div className="aria-preview-header">
        <span className="preview-title">ARIA Status</span>
      </div>
      <div className="aria-preview-content">
        {/* Cat Avatar - Design System compliant */}
        <div className={`aria-avatar ${state.isEvil ? "evil" : ""}`}>
          <svg viewBox="0 0 200 180" className="aria-cat-mini">
            {/* Tête - forme différente selon le mode */}
            <path
              d={
                state.isEvil
                  ? "M 35 110 L 15 55 L 55 80 Q 100 60, 145 80 L 185 55 L 165 110 C 175 140, 145 175, 100 175 C 55 175, 25 140, 35 110 Z"
                  : "M 35 110 L 30 35 L 65 75 Q 100 55, 135 75 L 170 35 L 165 110 C 175 140, 145 175, 100 175 C 55 175, 25 140, 35 110 Z"
              }
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="cat-line"
            />

            {/* Œil unique central */}
            <g className="eye-group">
              <path
                d={
                  state.isEvil
                    ? "M 50 115 Q 65 105, 100 100 Q 135 105, 150 115 Q 135 125, 100 130 Q 65 125, 50 115 Z"
                    : "M 55 115 Q 65 100, 100 85 Q 135 100, 145 115 Q 135 130, 100 145 Q 65 130, 55 115 Z"
                }
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Pupille verticale animée */}
              <line
                x1="100"
                y1={state.isEvil ? 103 : 95}
                x2="100"
                y2={state.isEvil ? 127 : 135}
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="eye-pupil"
              />
            </g>

            {/* Moustaches gauche */}
            <line
              x1={state.isEvil ? -10 : 0}
              y1={state.isEvil ? 95 : 100}
              x2="45"
              y2="115"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="whisker"
            />
            <line
              x1={state.isEvil ? -15 : -5}
              y1="120"
              x2="45"
              y2={state.isEvil ? 120 : 125}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="whisker"
            />
            <line
              x1={state.isEvil ? -10 : 0}
              y1={state.isEvil ? 145 : 140}
              x2="45"
              y2="135"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="whisker"
            />

            {/* Moustaches droite */}
            <line
              x1="155"
              y1="115"
              x2={state.isEvil ? 210 : 200}
              y2={state.isEvil ? 95 : 100}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="whisker"
            />
            <line
              x1="155"
              y1={state.isEvil ? 120 : 125}
              x2={state.isEvil ? 215 : 205}
              y2="120"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="whisker"
            />
            <line
              x1="155"
              y1="135"
              x2={state.isEvil ? 210 : 200}
              y2={state.isEvil ? 145 : 140}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="whisker"
            />
          </svg>
          {state.isSpeaking && (
            <div className="speaking-indicator">
              <span className="sound-wave"></span>
              <span className="sound-wave"></span>
              <span className="sound-wave"></span>
            </div>
          )}
        </div>

        {/* Status Tags */}
        <div className="aria-status-tags">
          <span className={`aria-tag ${state.isEvil ? "active evil" : ""}`}>
            {state.isEvil ? "EVIL" : "GOOD"}
          </span>
          <span className={`aria-tag ${state.isSpeaking ? "active" : ""}`}>
            {state.isSpeaking ? "SPEAKING" : "SILENT"}
          </span>
          {state.isDilemmaOpen && (
            <span className="aria-tag active warning">
              DILEMME {state.currentDilemmaIndex + 1}/{state.totalDilemmas}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function getRoleName(game: ConnectedGame): string {
  if (game.role === "explorer") return "Explorateur";
  if (game.role === "protector") return "Protecteur";
  if (game.role) return game.role;
  return game.name;
}

function getSubGameClass(gameId: string): string {
  const base = gameId.split(":")[0];
  if (base === "sidequest-computer") return "sidequest-computer";
  if (base === "sidequest-uplink") return "sidequest-uplink";
  return "";
}

function formatState(
  state: Record<string, unknown>
): { label: string; value: string }[] {
  const entries: { label: string; value: string }[] = [];
  for (const [key, val] of Object.entries(state)) {
    if (key === "startScreen")
      entries.push({ label: "Écran", value: val ? "Actif" : "Inactif" });
    else if (key === "isPasswordCorrect")
      entries.push({ label: "Code", value: val ? "✓ Correct" : "En attente" });
    else if (key === "passwordEntered")
      entries.push({ label: "Saisie", value: val ? String(val) : "-" });
    else if (key === "score")
      entries.push({ label: "Score", value: String(val) });
    else if (key === "phase")
      entries.push({ label: "Phase", value: `${val}/6` });
    else if (key === "in_progress")
      entries.push({ label: "État", value: val ? "En cours" : "En attente" });
    else if (key === "aiEnabled")
      entries.push({ label: "IA", value: val ? "Activée" : "Désactivée" });
    else if (key === "gameStarted")
      continue; // handled elsewhere
    else if (key === "role")
      continue; // handled by card styling
    else if (key === "isGameOver")
      continue; // handled elsewhere
    else if (key === "isVictory") continue; // handled elsewhere
  }
  return entries;
}

interface ConfirmDialogState {
  isOpen: boolean;
  action: GameAction | null;
  instances: ConnectedGame[];
  params: Record<string, unknown>;
}

function App() {
  const [games, setGames] = useState<ConnectedGame[]>([]);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ActionStatus>>({});
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    action: null,
    instances: [],
    params: {},
  });

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("games_updated", (data: ConnectedGame[]) => setGames(data));

    fetch(`${API_URL}/api/games`)
      .then((r) => r.json())
      .then(setGames)
      .catch(() => {});

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("games_updated");
    };
  }, []);

  const groups = useMemo(() => mergeWithPredefined(games), [games]);

  // Auto-select first tab (always have predefined games)
  useEffect(() => {
    if (groups.length > 0 && !activeTab) {
      setActiveTab(groups[0].baseId);
    }
  }, [groups, activeTab]);

  const activeGroup = groups.find((g) => g.baseId === activeTab) ?? null;

  const sendCommand = useCallback(
    async (
      gameId: string,
      actionId: string,
      payload: Record<string, unknown> = {}
    ) => {
      const key = `${gameId}:${actionId}`;
      setStatuses((prev) => ({ ...prev, [key]: "loading" }));

      try {
        const response = await fetch(`${API_URL}/api/games/${gameId}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: actionId, payload }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        setStatuses((prev) => ({ ...prev, [key]: "success" }));
        setTimeout(() => {
          setStatuses((prev) => ({ ...prev, [key]: "idle" }));
        }, 1500);
      } catch {
        setStatuses((prev) => ({ ...prev, [key]: "error" }));
        setTimeout(() => {
          setStatuses((prev) => ({ ...prev, [key]: "idle" }));
        }, 2500);
      }
    },
    []
  );

  const collectParams = useCallback(
    (params: string[]): Record<string, unknown> | null => {
      const payload: Record<string, unknown> = {};
      for (const param of params) {
        const value = window.prompt(`Valeur pour "${param}" :`);
        if (value === null) return null; // cancelled
        payload[param] = value;
      }
      return payload;
    },
    []
  );

  const sendToAll = useCallback(
    async (
      instances: ConnectedGame[],
      action: GameAction,
      payload: Record<string, unknown> = {}
    ) => {
      await Promise.all(
        instances.map((inst) => sendCommand(inst.gameId, action.id, payload))
      );
    },
    [sendCommand]
  );

  const handleActionClick = useCallback(
    async (instances: ConnectedGame[], action: GameAction) => {
      // Collect params first if needed
      let payload: Record<string, unknown> = {};
      if (action.params && action.params.length > 0) {
        const collected = collectParams(action.params);
        if (!collected) return; // cancelled
        payload = collected;
      }

      // Special handling for set_code action
      if (action.id === "set_code") {
        // Check if user is still on computer screen
        const computerGame = games.find(
          (g) => g.gameId === "sidequest-computer"
        );
        if (computerGame?.state.isPasswordCorrect === true) {
          toast.warning(
            "Impossible d'entrer le code car l'utilisateur n'est plus sur l'écran du computer"
          );
          return;
        }

        // Show confirmation dialog
        setConfirmDialog({
          isOpen: true,
          action,
          instances,
          params: payload,
        });
        return;
      }

      // Normal execution
      await sendToAll(instances, action, payload);
    },
    [collectParams, sendToAll, games]
  );

  const handleConfirmAction = useCallback(async () => {
    if (confirmDialog.action && confirmDialog.instances.length > 0) {
      await sendToAll(
        confirmDialog.instances,
        confirmDialog.action,
        confirmDialog.params
      );
    }
    setConfirmDialog({
      isOpen: false,
      action: null,
      instances: [],
      params: {},
    });
  }, [confirmDialog, sendToAll]);

  const handleCancelAction = useCallback(() => {
    setConfirmDialog({
      isOpen: false,
      action: null,
      instances: [],
      params: {},
    });
  }, []);

  const getStatus = (gameId: string, actionId: string): ActionStatus => {
    return statuses[`${gameId}:${actionId}`] ?? "idle";
  };

  return (
    <div className="dashboard">
      <header className="header">
        <h1>Gamemaster</h1>
        <div className={`connection-badge ${connected ? "online" : "offline"}`}>
          <span className="connection-dot" />
          {connected ? "Serveur connecté" : "Serveur déconnecté"}
        </div>
      </header>

      {/* Tabs - Always show all predefined games */}
      <nav className="game-tabs">
        {groups.map((group) => (
          <button
            key={group.baseId}
            className={`game-tab ${activeTab === group.baseId ? "active" : ""} ${!group.isConnected ? "disconnected" : ""}`}
            onClick={() => setActiveTab(group.baseId)}
          >
            <span
              className={`tab-dot ${group.isConnected ? "connected" : "disconnected"}`}
            />
            <span className="tab-name">{group.displayName}</span>
            <span className="tab-count">
              {group.instances.length}/{group.expectedInstances.length}
            </span>
          </button>
        ))}
      </nav>

      <main className="controls">
        {activeGroup ? (
          <div className="game-panel">
            {/* Instances status - show all expected instances */}
            <div className="instances-bar">
              {activeGroup.expectedInstances.map((expected) => {
                const connectedInst = activeGroup.instances.find(
                  (inst) => inst.gameId === expected.gameId
                );
                const isConnected = !!connectedInst;

                if (isConnected && connectedInst) {
                  // Connected instance
                  const stateEntries = formatState(connectedInst.state);
                  const resetStatus = getStatus(connectedInst.gameId, "reset");
                  const hasReset = connectedInst.availableActions.some(
                    (a) => a.id === "reset"
                  );
                  return (
                    <div
                      key={expected.gameId}
                      className={`instance-card ${expected.role ?? getSubGameClass(expected.gameId)}`}
                    >
                      <div className="instance-status-badge connected">
                        <span className="status-dot" />
                        Connecté
                      </div>
                      <span className="instance-role">
                        {expected.role
                          ? getRoleName(connectedInst)
                          : connectedInst.name}
                      </span>
                      <span className="instance-state">
                        {connectedInst.state.gameStarted ||
                        connectedInst.state.in_progress
                          ? "En jeu"
                          : "En attente"}
                      </span>
                      {stateEntries.length > 0 && (
                        <div className="instance-state-details">
                          {stateEntries.map((entry) => (
                            <span key={entry.label} className="state-tag">
                              <span className="state-tag-label">
                                {entry.label}
                              </span>
                              <span className="state-tag-value">
                                {entry.value}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                      {hasReset && (
                        <button
                          className={`instance-reset-btn ${resetStatus}`}
                          onClick={() =>
                            sendCommand(connectedInst.gameId, "reset")
                          }
                          disabled={resetStatus === "loading"}
                        >
                          {resetStatus === "loading"
                            ? "..."
                            : resetStatus === "success"
                              ? "✓"
                              : resetStatus === "error"
                                ? "✕"
                                : "Reset"}
                        </button>
                      )}
                    </div>
                  );
                }

                // Disconnected instance
                return (
                  <div
                    key={expected.gameId}
                    className={`instance-card ${expected.role ?? getSubGameClass(expected.gameId)} disconnected`}
                  >
                    <div className="instance-status-badge disconnected">
                      <span className="status-dot" />
                      Déconnecté
                    </div>
                    <span className="instance-role">{expected.name}</span>
                    <span className="instance-state">
                      En attente de connexion
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ARIA Preview - show when ARIA tab is active and connected */}
            {activeGroup.baseId === "aria" &&
              (() => {
                const ariaState = getAriaState(games);
                return ariaState ? <AriaPreview state={ariaState} /> : null;
              })()}

            {/* Actions — per-instance sections when instances have different actions */}
            {activeGroup.instances.length > 0 &&
              (() => {
                const allSameActions =
                  activeGroup.instances.length <= 1 ||
                  activeGroup.instances.every(
                    (inst) =>
                      JSON.stringify(inst.availableActions.map((a) => a.id)) ===
                      JSON.stringify(
                        activeGroup.instances[0].availableActions.map(
                          (a) => a.id
                        )
                      )
                  );

                // Get filtered actions for ARIA (toggle based on state)
                const ariaState =
                  activeGroup.baseId === "aria" ? getAriaState(games) : null;
                const actionsToRender =
                  activeGroup.baseId === "aria"
                    ? getFilteredAriaActions(
                        activeGroup.instances[0].availableActions,
                        ariaState
                      )
                    : activeGroup.instances[0].availableActions;

                if (allSameActions) {
                  return (
                    <div className="button-grid">
                      {actionsToRender.map((action) => {
                        const allStatuses = activeGroup.instances.map((inst) =>
                          getStatus(inst.gameId, action.id)
                        );
                        const isLoading = allStatuses.some(
                          (s) => s === "loading"
                        );
                        const isSuccess = allStatuses.every(
                          (s) => s === "success"
                        );
                        const isError = allStatuses.some((s) => s === "error");

                        let feedbackStatus: ActionStatus = "idle";
                        if (isLoading) feedbackStatus = "loading";
                        else if (isSuccess) feedbackStatus = "success";
                        else if (isError) feedbackStatus = "error";

                        return (
                          <button
                            key={action.id}
                            className={`control-btn ${getVariant(action.id)}`}
                            onClick={() =>
                              handleActionClick(activeGroup.instances, action)
                            }
                            disabled={isLoading}
                          >
                            <span className="btn-label">{action.label}</span>
                            {feedbackStatus !== "idle" && (
                              <span
                                className={`btn-feedback ${feedbackStatus}`}
                              >
                                {feedbackStatus === "loading"
                                  ? "..."
                                  : feedbackStatus === "success"
                                    ? "✓"
                                    : "✕"}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                }

                return activeGroup.instances.map((inst) => (
                  <div key={inst.gameId} className="per-instance">
                    <p className="section-label">{inst.name}</p>
                    <div className="button-grid">
                      {inst.availableActions.map((action) => {
                        const status = getStatus(inst.gameId, action.id);
                        return (
                          <button
                            key={action.id}
                            className={`control-btn ${getVariant(action.id)}`}
                            onClick={() => handleActionClick([inst], action)}
                            disabled={status === "loading"}
                          >
                            <span className="btn-label">{action.label}</span>
                            {status !== "idle" && (
                              <span className={`btn-feedback ${status}`}>
                                {status === "loading"
                                  ? "..."
                                  : status === "success"
                                    ? "✓"
                                    : "✕"}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
          </div>
        ) : null}
      </main>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Attention"
        message="Cette action va entrer la solution directement dans le jeu. Êtes-vous sûr de vouloir continuer ?"
        confirmLabel="Confirmer"
        cancelLabel="Annuler"
        onConfirm={handleConfirmAction}
        onCancel={handleCancelAction}
      />

      {/* Toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "rgba(15, 23, 42, 0.95)",
            border: "1px solid rgba(245, 158, 11, 0.5)",
            color: "#f59e0b",
            fontFamily: "'Courier New', monospace",
            textTransform: "uppercase",
            letterSpacing: "1px",
            fontSize: "12px",
          },
        }}
      />
    </div>
  );
}

export default App;
