import { useEffect, useState, useCallback, useMemo } from "react";
import { toast, Toaster } from "sonner";
import { Navbar } from "./components/Navbar";
import { EventTimeline } from "./components/EventTimeline";
import type { TimelineEvent } from "./components/EventTimeline";
import { InstanceCard } from "./components/InstanceCard";
import { ActionButton } from "./components/ActionButton";
import { ConfirmDialog } from "./components/ConfirmDialog";
import type { AriaState } from "./types/aria";
import "./App.css";
import { ControleAudio } from "./components/ControleAudio";
import { socket, API_URL } from "./socket";

type ActionStatus = "idle" | "loading" | "success" | "error";

interface GameAction {
  id: string;
  label: string;
  params?: string[];
  disabled?: boolean;
}

interface AudioPlayerStatus {
  gameId: string | null;
  socketId: string;
}

interface AudioLogPayload {
  type: "preset" | "tts" | "ambient" | "system";
  action: "play" | "stop" | "pause" | "error" | "info";
  message: string;
  gameId?: string;
  timestamp: string;
}

type GameStatus = "connected" | "reconnecting" | "not_started";

interface ConnectedGame {
  socketId: string | null;
  gameId: string;
  role?: string;
  name: string;
  availableActions: GameAction[];
  state: Record<string, unknown>;
  status: GameStatus;
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
  groupStatus: GameStatus;
}

// ARIA state interface imported from types/aria.ts

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
    expectedInstances: [{ gameId: "sidequest", name: "Sidequest" }],
  },
  {
    baseId: "aria",
    displayName: "ARIA",
    expectedInstances: [{ gameId: "aria", name: "ARIA Cat" }],
  },
  {
    baseId: "infection-map",
    displayName: "Carte Infection",
    expectedInstances: [{ gameId: "infection-map", name: "Carte Infection" }],
  },
  {
    baseId: "messagerie",
    displayName: "Messagerie",
    expectedInstances: [{ gameId: "messagerie", name: "Messagerie" }],
  },
];

function groupConnectedGames(
  games: ConnectedGame[]
): Map<string, ConnectedGame[]> {
  const groups = new Map<string, ConnectedGame[]>();
  for (const game of games) {
    const baseId = game.gameId.split(":")[0];
    const list = groups.get(baseId) ?? [];
    list.push(game);
    groups.set(baseId, list);
  }
  return groups;
}

function mergeWithPredefined(games: ConnectedGame[]): GameGroup[] {
  const connectedMap = groupConnectedGames(games);

  return PREDEFINED_GAMES.map((def) => {
    const instances = connectedMap.get(def.baseId) ?? [];

    let groupStatus: GameStatus = "not_started";
    if (instances.some((i) => i.status === "connected")) {
      groupStatus = "connected";
    } else if (instances.some((i) => i.status === "reconnecting")) {
      groupStatus = "reconnecting";
    }

    return {
      baseId: def.baseId,
      displayName: def.displayName,
      instances,
      expectedInstances: def.expectedInstances,
      groupStatus,
    };
  });
}

function getVariant(
  actionId: string
): "primary" | "success" | "danger" | "warning" {
  if (
    actionId === "reset" ||
    actionId === "enable_evil" ||
    actionId === "remove_points" ||
    actionId === "disable_speaking"
  )
    return "danger";
  if (
    actionId === "start" ||
    actionId === "start_screen" ||
    actionId === "add_points" ||
    actionId === "disable_evil" ||
    actionId === "enable_speaking" ||
    actionId === "hide_dilemme"
  )
    return "success";
  if (
    actionId === "disable_ai" ||
    actionId === "skip_phase" ||
    actionId === "enable_dilemma" ||
    actionId === "disable_dilemma" ||
    actionId === "show_dilemme"
  )
    return "warning";
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

// Filter ARIA actions based on current state
function getFilteredAriaActions(
  actions: GameAction[],
  ariaState: AriaState | null
): GameAction[] {
  if (!ariaState) return actions;

  return actions.filter((action) => {
    if (action.id === "enable_evil") return !ariaState.isEvil;
    if (action.id === "disable_evil") return ariaState.isEvil;
    if (action.id === "enable_speaking") return !ariaState.isSpeaking;
    if (action.id === "disable_speaking") return ariaState.isSpeaking;
    if (action.id === "enable_dilemma") return !ariaState.isDilemmaOpen;
    if (action.id === "disable_dilemma") return ariaState.isDilemmaOpen;
    return true;
  });
}

// Filter Sidequest actions based on workflow state
function getFilteredSidequestActions(
  actions: GameAction[],
  sidequestState: Record<string, unknown> | null
): GameAction[] {
  if (!sidequestState) return actions;

  const currentScreen = sidequestState.currentScreen as string;
  const startScreen = sidequestState.startScreen as boolean;
  const inProgress = sidequestState.in_progress as boolean;

  return actions.filter((action) => {
    // Reset toujours disponible
    if (action.id === "reset") return true;

    // LockScreen - écran noir
    if (currentScreen === "lockscreen" && !startScreen) {
      return action.id === "start_screen";
    }

    // LockScreen - formulaire
    if (currentScreen === "lockscreen" && startScreen) {
      return action.id === "enter_solution";
    }

    // Home - transition
    if (currentScreen === "home") {
      return false; // Seulement reset (déjà géré)
    }

    // Game - en cours
    if (currentScreen === "game" && inProgress) {
      return ["skip_phase", "add_points", "remove_points"].includes(action.id);
    }

    return false;
  });
}

// Filter Labyrinthe actions based on game state
function getFilteredLabyrintheActions(
  actions: GameAction[],
  labyrintheState: Record<string, unknown> | null
): GameAction[] {
  if (!labyrintheState) return actions;

  const gameStarted = labyrintheState.gameStarted as boolean;

  return actions.map((action) => {
    if (action.id === "start" && gameStarted) {
      return { ...action, disabled: true };
    }
    return action;
  });
}

// Filter Map actions based on game state
function getFilteredMapActions(
  actions: GameAction[],
  mapState: Record<string, unknown> | null
): GameAction[] {
  if (!mapState) return actions;

  const isDilemmeShowing = mapState.isDilemmeShowing as boolean;

  return actions.filter((action) => {
    if (action.id === "restart") return false;
    if (action.id === "hide_dilemme") return isDilemmeShowing;
    if (action.id === "show_dilemme") return !isDilemmeShowing;
    return true;
  });
}

interface ConfirmDialogState {
  isOpen: boolean;
  action: GameAction | null;
  instances: ConnectedGame[];
  params: Record<string, unknown>;
  variant?: "warning" | "danger";
}

function App() {
  const [games, setGames] = useState<ConnectedGame[]>([]);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ActionStatus>>({});
  const [audioPlayers, setAudioPlayers] = useState<AudioPlayerStatus[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    action: null,
    instances: [],
    params: {},
  });

  // Add event to timeline
  const addEvent = useCallback(
    (
      type: TimelineEvent["type"],
      message: string,
      gameId?: string,
      status?: TimelineEvent["status"]
    ) => {
      const event: TimelineEvent = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        type,
        message,
        gameId,
        status,
      };
      setEvents((prev) => [...prev.slice(-49), event]); // Keep last 50 events
    },
    []
  );

  useEffect(() => {
    socket.on("connect", () => {
      setConnected(true);
      addEvent(
        "connection",
        "Connexion au serveur établie",
        undefined,
        "success"
      );
    });

    socket.on("disconnect", () => {
      setConnected(false);
      addEvent("connection", "Déconnexion du serveur", undefined, "error");
    });

    socket.on("games_updated", (data: ConnectedGame[]) => {
      // Log new connections/disconnections
      const prevGames = games;
      data.forEach((game) => {
        const prevGame = prevGames.find((g) => g.gameId === game.gameId);
        if (!prevGame && game.status === "connected") {
          addEvent(
            "connection",
            `${game.name} connecté`,
            game.gameId,
            "success"
          );
        } else if (
          prevGame &&
          prevGame.status === "connected" &&
          game.status !== "connected"
        ) {
          addEvent(
            "connection",
            `${game.name} déconnecté`,
            game.gameId,
            "error"
          );
        } else if (
          prevGame &&
          prevGame.status !== "connected" &&
          game.status === "connected"
        ) {
          addEvent(
            "connection",
            `${game.name} reconnecté`,
            game.gameId,
            "success"
          );
        }
      });
      setGames(data);
    });

    // Audio status updates (with per-game tracking)
    socket.on(
      "audio-status-updated",
      (data: { players: AudioPlayerStatus[]; count: number }) => {
        setAudioPlayers(data.players);
      }
    );

    // Audio logs for timeline
    socket.on("audio:log", (data: AudioLogPayload) => {
      const status =
        data.action === "error"
          ? "error"
          : data.action === "play"
            ? "success"
            : "info";
      addEvent("audio", data.message, data.gameId, status);
    });

    fetch(`${API_URL}/api/games`)
      .then((r) => r.json())
      .then(setGames)
      .catch(() => {});

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("games_updated");
      socket.off("audio-status-updated");
      socket.off("audio:log");
    };
  }, [addEvent, games]);

  const groups = useMemo(() => mergeWithPredefined(games), [games]);

  useEffect(() => {
    // Don't auto-switch if we're on sound_control tab
    if (activeTab === "sound_control") return;

    // Auto-select first game tab if no valid game tab is active
    if (
      groups.length > 0 &&
      (!activeTab || !groups.find((g) => g.baseId === activeTab))
    ) {
      setActiveTab(groups[0].baseId);
    }

    // Clear tab if no games available and not on sound_control
    if (groups.length === 0 && activeTab !== "sound_control") {
      setActiveTab(null);
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

      const game = games.find((g) => g.gameId === gameId);
      const actionName =
        game?.availableActions.find((a) => a.id === actionId)?.label ??
        actionId;

      addEvent(
        "action",
        `${game?.name}: ${actionName} en cours...`,
        gameId,
        "info"
      );

      try {
        const response = await fetch(`${API_URL}/api/games/${gameId}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: actionId, payload }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        setStatuses((prev) => ({ ...prev, [key]: "success" }));
        addEvent(
          "action",
          `${game?.name}: ${actionName} réussi`,
          gameId,
          "success"
        );
        setTimeout(() => {
          setStatuses((prev) => ({ ...prev, [key]: "idle" }));
        }, 1500);
      } catch {
        setStatuses((prev) => ({ ...prev, [key]: "error" }));
        addEvent(
          "action",
          `${game?.name}: ${actionName} échoué`,
          gameId,
          "error"
        );
        setTimeout(() => {
          setStatuses((prev) => ({ ...prev, [key]: "idle" }));
        }, 2500);
      }
    },
    [games, addEvent]
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
    async (
      instances: ConnectedGame[],
      action: GameAction,
      payload?: Record<string, unknown>
    ) => {
      // Special handling for set_code action
      if (action.id === "set_code") {
        const sidequestGame = games.find((g) => g.gameId === "sidequest");
        if (sidequestGame?.state.isPasswordCorrect === true) {
          toast.warning(
            "Impossible d'entrer le code car l'utilisateur n'est plus sur l'écran du computer"
          );
          return;
        }

        setConfirmDialog({
          isOpen: true,
          action,
          instances,
          params: payload ?? {},
          variant: "warning",
        });
        return;
      }

      // Special handling for reset action
      if (action.id === "reset") {
        setConfirmDialog({
          isOpen: true,
          action,
          instances,
          params: payload ?? {},
          variant: "danger",
        });
        return;
      }

      // Normal execution
      await sendToAll(instances, action, payload);
    },
    [sendToAll, games]
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
      <Navbar
        groups={groups}
        connected={connected}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <EventTimeline events={events} />

      <main className="controls">
        {activeTab === "sound_control" ? (
          <ControleAudio audioPlayers={audioPlayers} />
        ) : activeGroup ? (
          <div className="game-panel">
            {/* Instance cards */}
            <div className="instances-bar-compact">
              {activeGroup.expectedInstances.map((expected) => {
                const inst = activeGroup.instances.find(
                  (i) => i.gameId === expected.gameId
                );
                const ariaState =
                  expected.gameId === "aria"
                    ? (getAriaState(games) ?? undefined)
                    : undefined;
                return (
                  <InstanceCard
                    key={expected.gameId}
                    instance={inst}
                    expected={expected}
                    ariaState={ariaState}
                  />
                );
              })}
            </div>

            {/* Actions */}
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

                const ariaState =
                  activeGroup.baseId === "aria" ? getAriaState(games) : null;
                const actionsToRender =
                  activeGroup.baseId === "aria"
                    ? getFilteredAriaActions(
                        activeGroup.instances[0].availableActions,
                        ariaState
                      )
                    : activeGroup.baseId === "sidequest"
                      ? getFilteredSidequestActions(
                          activeGroup.instances[0].availableActions,
                          activeGroup.instances[0].state
                        )
                      : activeGroup.baseId === "labyrinthe"
                        ? getFilteredLabyrintheActions(
                            activeGroup.instances[0].availableActions,
                            activeGroup.instances[0].state
                          )
                        : activeGroup.baseId === "infection-map"
                          ? getFilteredMapActions(
                              activeGroup.instances[0].availableActions,
                              activeGroup.instances[0].state
                            )
                          : activeGroup.instances[0].availableActions;

                if (allSameActions) {
                  const regularActions = actionsToRender.filter(
                    (a) => a.id !== "reset"
                  );
                  const resetActions = actionsToRender.filter(
                    (a) => a.id === "reset"
                  );

                  return (
                    <>
                      <div className="action-grid">
                        {regularActions.map((action) => {
                          const allStatuses = activeGroup.instances.map(
                            (inst) => getStatus(inst.gameId, action.id)
                          );
                          const isLoading = allStatuses.some(
                            (s) => s === "loading"
                          );
                          const isSuccess = allStatuses.every(
                            (s) => s === "success"
                          );
                          const isError = allStatuses.some(
                            (s) => s === "error"
                          );

                          let feedbackStatus: ActionStatus = "idle";
                          if (isLoading) feedbackStatus = "loading";
                          else if (isSuccess) feedbackStatus = "success";
                          else if (isError) feedbackStatus = "error";

                          return (
                            <ActionButton
                              key={action.id}
                              action={action}
                              variant={getVariant(action.id)}
                              status={feedbackStatus}
                              onClick={(payload) =>
                                handleActionClick(
                                  activeGroup.instances,
                                  action,
                                  payload
                                )
                              }
                              disabled={isLoading}
                            />
                          );
                        })}
                      </div>

                      {resetActions.length > 0 && (
                        <div className="reset-actions-bar">
                          {resetActions.map((action) => {
                            const allStatuses = activeGroup.instances.map(
                              (inst) => getStatus(inst.gameId, action.id)
                            );
                            const isLoading = allStatuses.some(
                              (s) => s === "loading"
                            );
                            const isSuccess = allStatuses.every(
                              (s) => s === "success"
                            );
                            const isError = allStatuses.some(
                              (s) => s === "error"
                            );

                            let feedbackStatus: ActionStatus = "idle";
                            if (isLoading) feedbackStatus = "loading";
                            else if (isSuccess) feedbackStatus = "success";
                            else if (isError) feedbackStatus = "error";

                            return (
                              <ActionButton
                                key={action.id}
                                action={{
                                  ...action,
                                  label: "Réinitialiser",
                                }}
                                variant={getVariant(action.id)}
                                status={feedbackStatus}
                                onClick={(payload) =>
                                  handleActionClick(
                                    activeGroup.instances,
                                    action,
                                    payload
                                  )
                                }
                                disabled={isLoading}
                              />
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                }

                const allResetActions: Array<{
                  inst: ConnectedGame;
                  action: GameAction;
                }> = [];

                const perInstanceElements = activeGroup.instances.map(
                  (inst) => {
                    const regularActions = inst.availableActions.filter(
                      (a) => a.id !== "reset"
                    );
                    const resetActions = inst.availableActions.filter(
                      (a) => a.id === "reset"
                    );

                    // Collect reset actions for the fixed bar
                    resetActions.forEach((action) => {
                      allResetActions.push({ inst, action });
                    });

                    return (
                      <div key={inst.gameId} className="per-instance">
                        <p className="section-label">{inst.name}</p>
                        <div className="action-grid">
                          {regularActions.map((action) => {
                            const status = getStatus(inst.gameId, action.id);
                            return (
                              <ActionButton
                                key={action.id}
                                action={action}
                                variant={getVariant(action.id)}
                                status={status}
                                onClick={(payload) =>
                                  handleActionClick([inst], action, payload)
                                }
                                disabled={status === "loading"}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                );

                return (
                  <>
                    {perInstanceElements}

                    {allResetActions.length > 0 && (
                      <div className="reset-actions-bar">
                        {allResetActions.map(({ inst, action }) => {
                          const status = getStatus(inst.gameId, action.id);
                          return (
                            <ActionButton
                              key={`${inst.gameId}-${action.id}`}
                              action={{
                                ...action,
                                label: `Réinitialiser - ${inst.name}`,
                              }}
                              variant={getVariant(action.id)}
                              status={status}
                              onClick={(payload) =>
                                handleActionClick([inst], action, payload)
                              }
                              disabled={status === "loading"}
                            />
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
          </div>
        ) : null}
      </main>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={
          confirmDialog.variant === "danger" ? "Réinitialiser ?" : "Attention"
        }
        message={
          confirmDialog.variant === "danger"
            ? "Êtes-vous sûr ?"
            : "Cette action va entrer la solution directement dans le jeu. Êtes-vous sûr de vouloir continuer ?"
        }
        confirmLabel={
          confirmDialog.variant === "danger" ? "Réinitialiser" : "Confirmer"
        }
        cancelLabel="Annuler"
        variant={confirmDialog.variant}
        onConfirm={handleConfirmAction}
        onCancel={handleCancelAction}
      />

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
