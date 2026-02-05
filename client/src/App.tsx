import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
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
import { WebcamViewer } from "./components/WebcamViewer";
import { socket, API_URL } from "./socket";
import { useTTS } from "./hooks/useTTS";

// Preset index for "Presentation IA" audio
const PRESENTATION_IA_PRESET_IDX = 3; // phase-2-presentation-ia.mp3

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
  {
    baseId: "usb-key",
    displayName: "Clé USB",
    expectedInstances: [{ gameId: "usb-key", name: "Clé USB" }],
  },
];

// Predefined messages for Messagerie, grouped by category
const MESSAGERIE_PRESETS: { category: string; messages: string[] }[] = [
  {
    category: "ARIA qui devient méchante",
    messages: [
      "Je ne comprends pas, ARIA prend le contrôle.",
      "Les portes sont verrouillées, je ne peux pas entrer.",
      "Vous devrez réinstaller une version plus ancienne d'ARIA.",
    ],
  },
  {
    category: "Post-its (Mot de passe)",
    messages: [
      "Le mot de passe est écrit quelque part.",
      "Un petit papier jaune détient la clé.",
    ],
  },
  {
    category: "Carnet sur bureau",
    messages: ["Le carnet contient un indice vital."],
  },
  {
    category: "Écrans",
    messages: [
      "L'écran s'allume, regarde bien !",
      "Les instructions changent, dépêche-toi.",
      "Regardez ARIA, il y a un dilemme à résoudre !",
    ],
  },
  {
    category: "Posters",
    messages: [
      "Regarde les posters sur le mur.",
      "Il y a des lettres cachées sur les affiches…",
    ],
  },
  {
    category: "Sac",
    messages: [
      "Où est mon sac? Il y a quelque chose d'important à l'intérieur ",
    ],
  },
  {
    category: "Indices MDP 209",
    messages: ["Quelle heure est-il ?", "Où sont nos fichiers de données ?"],
  },
];

function groupConnectedGames(
  games: ConnectedGame[]
): Map<string, ConnectedGame[]> {
  const groups = new Map<string, ConnectedGame[]>();
  for (const game of games) {
    const baseId = game.gameId.split(":")[0];

    // Filter out labyrinthe entries without a valid role (ghost entries)
    if (baseId === "labyrinthe" && !game.role) continue;

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

  return actions
    .filter((action) => {
      // Hide enable_ai, disable_ai, and set_ai - we use a toggle instead
      if (
        action.id === "enable_ai" ||
        action.id === "disable_ai" ||
        action.id === "set_ai"
      ) {
        return false;
      }
      return true;
    })
    .map((action) => {
      if (action.id === "start" && gameStarted) {
        return { ...action, disabled: true };
      }
      return action;
    });
}

// Check if both labyrinthe instances are connected
function areLabyrintheInstancesConnected(instances: ConnectedGame[]): boolean {
  const explorer = instances.find((i) => i.role === "explorer");
  const protector = instances.find((i) => i.role === "protector");
  return explorer?.status === "connected" && protector?.status === "connected";
}

// Get labyrinthe AI state from any connected instance
function getLabyrintheAIState(instances: ConnectedGame[]): boolean | null {
  const connectedInstance = instances.find((i) => i.status === "connected");
  if (!connectedInstance) return null;
  return (connectedInstance.state.aiEnabled as boolean) ?? false;
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

// Filter Messagerie actions - hide send_custom, send_predefined and start_sequence
function getFilteredMessagerieActions(actions: GameAction[]): GameAction[] {
  return actions.filter((action) => {
    if (action.id === "send_custom") return false;
    if (action.id === "send_predefined") return false;
    if (action.id === "start_sequence") return false;
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
  const [customMessage, setCustomMessage] = useState("");
  const [isMessageSending, setIsMessageSending] = useState(false);
  const [messageTimeRemaining, setMessageTimeRemaining] = useState(0);
  const [isAriaLaunching, setIsAriaLaunching] = useState(false);
  const { playText, isGenerating: ttsGenerating } = useTTS("john");

  // Global reset dialog
  const [showGlobalResetDialog, setShowGlobalResetDialog] = useState(false);

  // Game timer (synchronized with Map infection start)
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const TOTAL_GAME_TIME = 15 * 60; // 15 minutes in seconds

  // Calculate message display duration (matches Messagerie timing)
  const getMessageDuration = (content: string) => {
    const initialDelay = 200;
    const typingTime = content.length * 50;
    const displayTime = 5000;
    const fadeOut = 800;
    const finalDelay = 300;
    return initialDelay + typingTime + displayTime + fadeOut + finalDelay;
  };

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

      // Auto-switch to infection-map tab when USB key connects
      const usbKey = data.find((g) => g.gameId === "usb-key");
      const prevUsbKey = prevGames.find((g) => g.gameId === "usb-key");
      if (
        usbKey?.status === "connected" &&
        prevUsbKey?.status !== "connected"
      ) {
        setActiveTab("infection-map");
        toast.success("Clé USB connectée");
      }

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
  const usbKeyConnected = games.some(
    (g) => g.gameId === "usb-key" && g.status === "connected"
  );

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

  // Countdown timer for message sending
  useEffect(() => {
    if (messageTimeRemaining <= 0) return;

    const interval = setInterval(() => {
      setMessageTimeRemaining((prev: number) => {
        const newValue = prev - 100;
        if (newValue <= 0) {
          return 0;
        }
        return newValue;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [messageTimeRemaining > 0]);

  // Detect Map infection start to sync timer
  useEffect(() => {
    const mapGame = games.find((g) => g.gameId === "infection-map");
    const mapStatus = mapGame?.state?.status as string | undefined;

    if (mapStatus === "infection_running" && !gameStartTime) {
      setGameStartTime(Date.now());
    }
    // Reset timer if Map is reset
    if (mapStatus === "idle" || mapStatus === "reset") {
      setGameStartTime(null);
      setElapsedTime(0);
    }
  }, [games, gameStartTime]);

  // Timer update effect
  useEffect(() => {
    if (!gameStartTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [gameStartTime]);

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

  // Launch ARIA: triggers audio, animation, password display, and map infection
  const handleLaunchAria = useCallback(async () => {
    setIsAriaLaunching(true);
    addEvent("action", "Lancement ARIA en cours...", undefined, "info");

    try {
      // 1. Play presentation IA audio
      socket.emit("audio:play-preset", {
        presetIdx: PRESENTATION_IA_PRESET_IDX,
        file: "phase-2-presentation-ia.mp3",
      });

      // 2. Send commands to all games in parallel
      const commands = [
        // ARIA: start intro animation
        fetch(`${API_URL}/api/games/aria/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start_intro", payload: {} }),
        }),
        // Sidequest: show password screen
        fetch(`${API_URL}/api/games/sidequest/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start_screen", payload: {} }),
        }),
        // Infection Map: start infection
        fetch(`${API_URL}/api/games/infection-map/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start_infection", payload: {} }),
        }),
      ];

      await Promise.allSettled(commands);
      addEvent("action", "Lancement ARIA réussi", undefined, "success");
    } catch (error) {
      console.error("Launch ARIA error:", error);
      addEvent("action", "Erreur lors du lancement ARIA", undefined, "error");
    } finally {
      setTimeout(() => setIsAriaLaunching(false), 2000);
    }
  }, [addEvent]);

  // Global reset: reset all games and audio
  const handleGlobalReset = useCallback(async () => {
    // Reset all connected games that have a reset action
    for (const group of groups) {
      for (const instance of group.instances) {
        if (instance.status === "connected") {
          const resetAction = instance.availableActions.find(
            (a) => a.id === "reset"
          );
          if (resetAction) {
            await sendCommand(instance.gameId, "reset", {});
          }
        }
      }
    }

    // Stop all audio
    socket.emit("audio:stop-all");

    // Reset timer
    setGameStartTime(null);
    setElapsedTime(0);

    setShowGlobalResetDialog(false);
    addEvent("action", "Reset global de l'escape game", undefined, "success");
  }, [groups, sendCommand, addEvent]);

  // Timer formatting helpers
  const formatTimer = (seconds: number) => {
    const remaining = Math.max(0, TOTAL_GAME_TIME - seconds);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isTimeCritical = elapsedTime > TOTAL_GAME_TIME - 60; // Last minute
  const isTimeOver = elapsedTime >= TOTAL_GAME_TIME;

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
        usbKeyConnected={usbKeyConnected}
        onLaunchAria={handleLaunchAria}
        isAriaLaunching={isAriaLaunching}
        onLaunchAria={handleLaunchAria}
        isAriaLaunching={isAriaLaunching}
      />
      <aside className="webcam-sidebar">
        <WebcamViewer />
        <EventTimeline events={events} />
      </aside>

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
                          : activeGroup.baseId === "messagerie"
                            ? getFilteredMessagerieActions(
                                activeGroup.instances[0].availableActions
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
                      {/* Custom message input for Messagerie - placed above action buttons */}
                      {activeGroup.baseId === "messagerie" && (
                        <div className="messagerie-input-section">
                          <div className="messagerie-label-row">
                            <label className="messagerie-input-label">
                              MESSAGE PERSONNALISÉ
                            </label>
                            {ttsGenerating && (
                              <span className="messagerie-tts-badge">
                                GÉNÉRATION AUDIO...
                              </span>
                            )}
                            {messageTimeRemaining > 0 && (
                              <span className="messagerie-countdown">
                                {Math.ceil(messageTimeRemaining / 1000)}s
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            className="messagerie-input"
                            value={customMessage}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setCustomMessage(e.target.value)
                            }
                            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                              if (
                                e.key === "Enter" &&
                                customMessage.trim() &&
                                !isMessageSending
                              ) {
                                e.preventDefault();
                                const content = customMessage.trim();
                                const duration = getMessageDuration(content);
                                sendToAll(
                                  activeGroup.instances,
                                  { id: "send_custom", label: "Envoyer" },
                                  { content }
                                );
                                playText(content);
                                setCustomMessage("");
                                setIsMessageSending(true);
                                setMessageTimeRemaining(duration);
                                setTimeout(() => {
                                  setIsMessageSending(false);
                                }, getMessageDuration(content));
                              }
                            }}
                            placeholder={
                              isMessageSending
                                ? "Message en cours..."
                                : "Message + Entrée"
                            }
                          />
                        </div>
                      )}

                      {/* Predefined message presets for Messagerie */}
                      {activeGroup.baseId === "messagerie" && (
                        <div className="messagerie-presets">
                          {MESSAGERIE_PRESETS.map((group) => (
                            <div
                              key={group.category}
                              className="preset-category"
                            >
                              <div className="preset-category-label">
                                {group.category}
                              </div>
                              <div className="preset-buttons">
                                {group.messages.map((msg) => (
                                  <button
                                    key={msg}
                                    className="preset-button"
                                    onClick={() => {
                                      const duration = getMessageDuration(msg);
                                      sendToAll(
                                        activeGroup.instances,
                                        { id: "send_custom", label: "Envoyer" },
                                        { content: msg }
                                      );
                                      playText(msg);
                                      setCustomMessage("");
                                      setIsMessageSending(true);
                                      setMessageTimeRemaining(duration);
                                      setTimeout(() => {
                                        setIsMessageSending(false);
                                      }, duration);
                                    }}
                                    disabled={isMessageSending}
                                  >
                                    {msg}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="action-grid">
                        {regularActions.flatMap((action) => {
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

                          // For Messagerie, also disable buttons when a message is being displayed
                          const isMessagerieBlocked =
                            activeGroup.baseId === "messagerie" &&
                            isMessageSending;

                          // For Labyrinthe, block all actions if either instance is disconnected
                          const isLabyrintheBlocked =
                            activeGroup.baseId === "labyrinthe" &&
                            !areLabyrintheInstancesConnected(
                              activeGroup.instances
                            );

                          const actionButton = (
                            <ActionButton
                              key={action.id}
                              action={action}
                              variant={getVariant(action.id)}
                              status={feedbackStatus}
                              onClick={(payload) => {
                                // For Messagerie predefined messages, start the timer
                                if (
                                  activeGroup.baseId === "messagerie" &&
                                  action.id.startsWith("msg_")
                                ) {
                                  // Estimate duration based on label length (approximation)
                                  const estimatedContent = action.label || "";
                                  const duration =
                                    getMessageDuration(estimatedContent);
                                  setIsMessageSending(true);
                                  setMessageTimeRemaining(duration);
                                  setTimeout(() => {
                                    setIsMessageSending(false);
                                  }, duration);
                                }
                                handleActionClick(
                                  activeGroup.instances,
                                  action,
                                  payload
                                );
                              }}
                              disabled={
                                isLoading ||
                                isMessagerieBlocked ||
                                isLabyrintheBlocked ||
                                action.disabled
                              }
                            />
                          );

                          // Insert AI toggle button right after "start" for Labyrinthe
                          if (
                            action.id === "start" &&
                            activeGroup.baseId === "labyrinthe"
                          ) {
                            const aiEnabled = getLabyrintheAIState(
                              activeGroup.instances
                            );
                            return [
                              actionButton,
                              <ActionButton
                                key="ai-toggle"
                                action={{
                                  id: aiEnabled ? "disable_ai" : "enable_ai",
                                  label: aiEnabled
                                    ? "Désactiver l'IA"
                                    : "Activer l'IA",
                                }}
                                variant={aiEnabled ? "danger" : "success"}
                                status="idle"
                                onClick={() => {
                                  sendToAll(
                                    activeGroup.instances,
                                    { id: "set_ai", label: "Toggle IA" },
                                    { enabled: !aiEnabled }
                                  );
                                }}
                                disabled={isLabyrintheBlocked}
                              />,
                            ];
                          }

                          return [actionButton];
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

                            // For Labyrinthe, block reset if either instance is disconnected
                            const isLabyrintheBlocked =
                              activeGroup.baseId === "labyrinthe" &&
                              !areLabyrintheInstancesConnected(
                                activeGroup.instances
                              );

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
                                disabled={isLoading || isLabyrintheBlocked}
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

      {/* Global Controls Bar (bottom-left) */}
      <div className="global-controls-bar">
        <button
          className="global-reset-btn"
          onClick={() => setShowGlobalResetDialog(true)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Reset Global
        </button>

        {gameStartTime && (
          <div
            className={`game-timer ${isTimeCritical ? "critical" : ""} ${isTimeOver ? "over" : ""}`}
          >
            <span className="timer-label">TEMPS</span>
            <span className="timer-value">{formatTimer(elapsedTime)}</span>
          </div>
        )}
      </div>

      {/* Global Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showGlobalResetDialog}
        title="Reset Global ?"
        message="Cela va reinitialiser TOUS les jeux et arreter tous les sons. Etes-vous sur ?"
        confirmLabel="Reset Tout"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={handleGlobalReset}
        onCancel={() => setShowGlobalResetDialog(false)}
      />

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
