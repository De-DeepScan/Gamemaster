import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent as RPointerEvent,
} from "react";
import { socket, API_URL } from "../socket";
import {
  Cpu,
  CircuitBoard,
  HardDrive,
  Zap,
  Sun,
  Server,
  Rocket,
  RotateCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./ControleAudio.css";

// Types
interface AudioPlayerStatus {
  gameId: string | null;
  socketId: string;
}

interface PresetConfig {
  id: string;
  label: string;
  file: string;
  phase: number;
  chainedFile?: string;
  messageToSend?: string;
}

interface PresetState {
  playing: boolean;
  currentTime: number;
  duration: number;
}

interface ControleAudioProps {
  audioPlayers: AudioPlayerStatus[];
  onLaunchAria?: () => void;
  isAriaLaunching?: boolean;
  onSendMessage?: (message: string) => void;
}

// Preset configurations grouped by phase
// Phase mapping: 1=Roleplay, 2=Tchat, 3=Prise de controle, 4=Jeux, 5=Finale
const PRESETS: PresetConfig[] = [
  // Phase 1 - Roleplay (ancien phases 2+3)
  {
    id: "phase-1-01",
    label: "Oui biensure",
    file: "phase-1-01-oui-biensure.mp3",
    phase: 1,
  },
  {
    id: "phase-1-02",
    label: "Par contre",
    file: "phase-1-02-par-contre.mp3",
    phase: 1,
  },
  {
    id: "phase-1-03",
    label: "Presentation ARIA",
    file: "phase-1-03-presentation-aria.mp3",
    phase: 1,
  },
  // Phase 2 - Tchat (ancien phase 4)
  {
    id: "phase-2-john",
    label: "Attendez les gars...",
    file: "phase-2-john.mp3",
    phase: 2,
    messageToSend:
      "Attendez les gars, je crois que j'ai besoin que vous branchiez un câble pour moi.",
  },
  {
    id: "phase-3-merci-combo",
    label: "Merci + Quelques secondes",
    file: "phase-3-02-merci.mp3",
    phase: 2,
    chainedFile: "phase-3-03-quelques-secondes.mp3",
  },
  // Phase 3 - Prise de controle (ancien phase 5)
  { id: "phase-5", label: "Prise de contrôle", file: "phase-5.mp3", phase: 3 },
  // Phase 4 - Jeux (ancien phase 6)
  {
    id: "phase-5-01",
    label: "Je sens votre presence",
    file: "phase-5-1-je-sent-votre-presence.mp3",
    phase: 4,
  },
  {
    id: "phase-6-random-1",
    label: "Vous touchez a des choses que vous ne comprenez pas",
    file: "phase-6-random-1.mp3",
    phase: 4,
  },
  {
    id: "phase-6-random-2",
    label: "Vous etes dans ma memoire",
    file: "phase-6-random-2.mp3",
    phase: 4,
  },
  {
    id: "phase-6-random-3",
    label: "C'est donc ca... d'etre vulnerable ?",
    file: "phase-6-random-3.mp3",
    phase: 4,
  },
  {
    id: "phase-6-random-4",
    label: "Vous cherchez une aiguille dans un ocean",
    file: "phase6-random-4.mp3",
    phase: 4,
  },
  {
    id: "phase-6-random-5",
    label: "Vous voulez m'effacer",
    file: "phase6-random-5.mp3",
    phase: 4,
  },
  {
    id: "phase-6-random-6",
    label: "Amusez-vous bien",
    file: "phase6-random-6.mp3",
    phase: 4,
  },
  // Phase 5 - Finale (ancien phase 7)
  { id: "finale", label: "Finale", file: "finale.mp3", phase: 5 },
];

interface AmbientSoundConfig {
  id: string;
  label: string;
  file: string;
  icon: LucideIcon;
}

const AMBIENT_SOUNDS: AmbientSoundConfig[] = [
  { id: "digital-01", label: "Digital 01", file: "digital-01.mp3", icon: Cpu },
  {
    id: "digital-02",
    label: "Digital 02",
    file: "digital-02.mp3",
    icon: CircuitBoard,
  },
  {
    id: "digital-load",
    label: "Digital Load",
    file: "digital-load.mp3",
    icon: HardDrive,
  },
  {
    id: "energy-load",
    label: "Energy Load",
    file: "energy-load.mp3",
    icon: Zap,
  },
  { id: "light", label: "Light", file: "light.mp3", icon: Sun },
  { id: "servers", label: "Servers", file: "servers.mp3", icon: Server },
  { id: "space", label: "Space", file: "space.mp3", icon: Rocket },
];

const QUICK_RESPONSES: PresetConfig[] = [
  {
    id: "random-1",
    label: "Random 1",
    file: "random/phase-6-random-1.mp3",
    phase: 0,
  },
  {
    id: "random-2",
    label: "Random 2",
    file: "random/phase-6-random-2.mp3",
    phase: 0,
  },
  {
    id: "random-3",
    label: "Random 3",
    file: "random/phase-6-random-3.mp3",
    phase: 0,
  },
  {
    id: "random-4",
    label: "Random 4",
    file: "random/phase6-random-4.mp3",
    phase: 0,
  },
  {
    id: "random-5",
    label: "Random 5",
    file: "random/phase6-random-5.mp3",
    phase: 0,
  },
  {
    id: "random-6",
    label: "Random 6",
    file: "random/phase6-random-6.mp3",
    phase: 0,
  },
  {
    id: "indice-affiches-admin",
    label: "Indice affiches admin",
    file: "random/Indice affiches admin.mp3",
    phase: 0,
  },
  {
    id: "indice-fiches-donnees",
    label: "Indice fiches de donnees",
    file: "random/Indice fiches de donnees.mp3",
    phase: 0,
  },
  {
    id: "indice-horloge",
    label: "Indice Horloge",
    file: "random/Indice Horloge.mp3",
    phase: 0,
  },
  {
    id: "indice-post-it",
    label: "Indice post-it",
    file: "random/Indice post-it.mp3",
    phase: 0,
  },
  {
    id: "indice-sac",
    label: "Indice sac",
    file: "random/Indice sac.mp3",
    phase: 0,
  },
];

const PHASES = [
  {
    id: 1,
    name: "Roleplay",
    subtitle: "Accueil, interaction ARIA, monologue (etudiant)",
  },
  {
    id: 2,
    name: "Tchat",
    subtitle: "Interaction via le tchat pour brancher le fil",
  },
  {
    id: 3,
    name: "Prise de controle",
    subtitle: "Diffusion sur le reseau, recherche du mot de passe",
  },
  { id: 4, name: "Jeux", subtitle: "Mot de passe trouve, lancement des jeux" },
  {
    id: 5,
    name: "Finale",
    subtitle:
      "Trouvez le coffre où se trouve la clé USB contenant une version non corrompue d'ARIA.",
  },
];

// Expected games for audio status
const EXPECTED_AUDIO_GAMES = [
  { gameId: "labyrinthe:explorer", name: "Laby Explorer" },
  { gameId: "labyrinthe:protector", name: "Laby Protector" },
  { gameId: "sidequest", name: "Sidequest" },
  { gameId: "aria", name: "ARIA" },
];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function VolumeFader({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const volumeFromPointer = (e: { clientY: number }) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio =
      1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onChange(Math.round(ratio * 100) / 100);
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    trackRef.current!.setPointerCapture(e.pointerId);
    volumeFromPointer(e);
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (dragging.current) volumeFromPointer(e);
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  return (
    <div className="sc-fader">
      <span className="sc-fader-label">{label}</span>
      <span className="sc-fader-max" onClick={() => onChange(1)}>
        MAX
      </span>
      <div
        ref={trackRef}
        className="sc-fader-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="sc-fader-fill" style={{ height: `${value * 100}%` }} />
        <span className="sc-fader-value">{Math.round(value * 100)}%</span>
      </div>
      <span className="sc-fader-min" onClick={() => onChange(0)}>
        MIN
      </span>
    </div>
  );
}

export function ControleAudio({
  audioPlayers,
  onLaunchAria,
  isAriaLaunching,
  onSendMessage,
}: ControleAudioProps) {
  // Phase progression state (persisted)
  const [currentPhase, setCurrentPhase] = useState(() => {
    const stored = localStorage.getItem("sc_current_phase");
    return stored ? parseInt(stored, 10) : 1;
  });
  const [completedPhases, setCompletedPhases] = useState<number[]>(() => {
    const stored = localStorage.getItem("sc_completed_phases");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [selectedPhase, setSelectedPhase] = useState(() => {
    const stored = localStorage.getItem("sc_selected_phase");
    return stored ? parseInt(stored, 10) : 1;
  });

  // Volume states per phase (persisted)
  const [volumesByPhase, setVolumesByPhase] = useState<
    Record<number, { ia: number; ambientMaster: number }>
  >(() => {
    const stored = localStorage.getItem("sc_volumes_by_phase");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Migrate from old 7-phase to new 5-phase system
        const hasOldFormat = Object.keys(parsed).some((k) => Number(k) > 5);
        if (hasOldFormat) {
          // Clear old format, user will reconfigure
          localStorage.removeItem("sc_volumes_by_phase");
          return {};
        }
        // Clean up legacy 'general' property
        const cleaned: Record<number, { ia: number; ambientMaster: number }> =
          {};
        for (const [phase, values] of Object.entries(parsed)) {
          const v = values as { ia?: number; ambientMaster?: number };
          cleaned[Number(phase)] = {
            ia: v.ia ?? 0.5,
            ambientMaster: v.ambientMaster ?? 0.5,
          };
        }
        localStorage.setItem("sc_volumes_by_phase", JSON.stringify(cleaned));
        return cleaned;
      } catch {
        /* ignore */
      }
    }
    return {};
  });

  // Current phase volumes (derived)
  const iaVolume = volumesByPhase[selectedPhase]?.ia ?? 0.5;
  const ambientMaster = volumesByPhase[selectedPhase]?.ambientMaster ?? 0.5;

  // Input states
  const [participantName, setParticipantName] = useState("");
  const [manualMessage, setManualMessage] = useState("");

  // TTS states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApiPlaying, setIsApiPlaying] = useState(false);

  // Preset states (each preset is independent)
  const [presetStates, setPresetStates] = useState<Record<string, PresetState>>(
    {}
  );

  // Track which presets are playing their chained file (presetId -> true)
  const [chainedPlaying, setChainedPlaying] = useState<Record<string, boolean>>(
    {}
  );

  // Ambient states per phase: phase -> soundId -> { active, volume } (persisted)
  const [ambientByPhase, setAmbientByPhase] = useState<
    Record<number, Record<string, { active: boolean; volume: number }>>
  >(() => {
    const stored = localStorage.getItem("sc_ambient_by_phase");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Migrate from old 7-phase to new 5-phase system
        const hasOldFormat = Object.keys(parsed).some((k) => Number(k) > 5);
        if (hasOldFormat) {
          // Clear old format, user will reconfigure
          localStorage.removeItem("sc_ambient_by_phase");
          return {};
        }
        return parsed;
      } catch {
        /* ignore */
      }
    }
    return {};
  });

  // Current phase ambient states (derived)
  const ambientStates = ambientByPhase[selectedPhase] ?? {};

  // BFM/JT volume (persisted)
  const [jtVolume, setJtVolume] = useState(() => {
    const stored = localStorage.getItem("sc_jt_volume");
    return stored ? parseFloat(stored) : 0.5;
  });

  // Voice sync
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);

  // Editable volume percentage
  const [editingVolumeId, setEditingVolumeId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Fade transitions infrastructure
  const fadeIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map()
  );
  const lastEmittedRef = useRef<Map<string, number>>(new Map());
  const skipNextPhaseSyncRef = useRef(false);

  const fadeSocket = useCallback(
    (
      key: string,
      event: string,
      payloadFn: (volume: number) => Record<string, unknown>,
      from: number,
      to: number,
      durationMs: number,
      onComplete?: () => void
    ) => {
      const existing = fadeIntervalsRef.current.get(key);
      if (existing) clearInterval(existing);

      if (durationMs <= 0 || Math.abs(to - from) < 0.005) {
        socket.emit(event, payloadFn(to));
        lastEmittedRef.current.set(key, to);
        onComplete?.();
        return;
      }

      const steps = Math.max(1, Math.round(durationMs / 30));
      const stepMs = durationMs / steps;
      const delta = (to - from) / steps;
      let step = 0;

      const interval = setInterval(() => {
        step++;
        const vol = step >= steps ? to : from + delta * step;
        socket.emit(event, payloadFn(vol));
        lastEmittedRef.current.set(key, vol);

        if (step >= steps) {
          clearInterval(interval);
          fadeIntervalsRef.current.delete(key);
          onComplete?.();
        }
      }, stepMs);

      fadeIntervalsRef.current.set(key, interval);
    },
    []
  );

  useEffect(() => {
    return () => {
      for (const interval of fadeIntervalsRef.current.values()) {
        clearInterval(interval);
      }
    };
  }, []);

  const handleJtVolume = useCallback(
    (volume: number) => {
      setJtVolume(volume);
      localStorage.setItem("sc_jt_volume", String(volume));
      const fromVol = lastEmittedRef.current.get("__jt__") ?? volume;
      fadeSocket(
        "__jt__",
        "audio:jt-volume",
        (v) => ({ volume: v }),
        fromVol,
        volume,
        150
      );
    },
    [fadeSocket]
  );

  // Load saved voice on mount
  useEffect(() => {
    const stored = localStorage.getItem("escape_voices");
    if (stored) {
      const voices = JSON.parse(stored) as { id: string; name: string }[];
      const aria = voices.find((v) =>
        v.name.trim().toLowerCase().includes("aria")
      );
      if (aria) setSelectedVoiceId(aria.id);
    }
  }, []);

  // Sync volumes to audio players when phase changes (or on mount)
  useEffect(() => {
    if (skipNextPhaseSyncRef.current) {
      skipNextPhaseSyncRef.current = false;
      return;
    }
    socket.emit("audio:volume-ia", { volume: iaVolume });
    lastEmittedRef.current.set("__ia__", iaVolume);

    // Re-apply ambient master to all active sounds
    const states = ambientByPhase[selectedPhase] ?? {};
    for (const [soundId, state] of Object.entries(states)) {
      if (state.active) {
        const effectiveVol = state.volume * ambientMaster;
        socket.emit("audio:set-ambient-volume", {
          soundId,
          volume: effectiveVol,
        });
        lastEmittedRef.current.set(`ambient-${soundId}`, effectiveVol);
      }
    }
  }, [selectedPhase]);

  // Persist per-phase data
  useEffect(() => {
    localStorage.setItem("sc_volumes_by_phase", JSON.stringify(volumesByPhase));
  }, [volumesByPhase]);

  useEffect(() => {
    localStorage.setItem("sc_ambient_by_phase", JSON.stringify(ambientByPhase));
  }, [ambientByPhase]);

  // Persist phase progression state
  useEffect(() => {
    localStorage.setItem("sc_current_phase", String(currentPhase));
  }, [currentPhase]);

  useEffect(() => {
    localStorage.setItem(
      "sc_completed_phases",
      JSON.stringify(completedPhases)
    );
  }, [completedPhases]);

  useEffect(() => {
    localStorage.setItem("sc_selected_phase", String(selectedPhase));
  }, [selectedPhase]);

  // Helper to update ambient states for the selected phase
  const setAmbientStates = useCallback(
    (
      updater: (
        prev: Record<string, { active: boolean; volume: number }>
      ) => Record<string, { active: boolean; volume: number }>
    ) => {
      setAmbientByPhase((prev) => ({
        ...prev,
        [selectedPhase]: updater(prev[selectedPhase] ?? {}),
      }));
    },
    [selectedPhase]
  );

  // Listen for preset progress
  useEffect(() => {
    const onProgress = (data: {
      presetIdx: number;
      currentTime: number;
      duration: number;
      ended?: boolean;
    }) => {
      // Determine presetId based on index (100+ = quick response)
      let presetId: string;
      let preset: PresetConfig | undefined;
      if (data.presetIdx >= 100) {
        presetId = `quick-${data.presetIdx - 100}`;
      } else {
        preset = PRESETS[data.presetIdx];
        if (!preset) return;
        presetId = preset.id;
      }

      if (data.ended) {
        // Check if this preset has a chained file and we haven't played it yet
        if (preset?.chainedFile && !chainedPlaying[presetId]) {
          // Mark as playing chained file
          setChainedPlaying((prev) => ({ ...prev, [presetId]: true }));
          // Play the chained file using the same preset index
          socket.emit("audio:play-preset", {
            presetIdx: data.presetIdx,
            file: preset.chainedFile,
          });
          enableAriaSpeaking();
          return;
        }

        // Reset chained state and clean up
        disableAriaSpeaking();
        setChainedPlaying((prev) => {
          const next = { ...prev };
          delete next[presetId];
          return next;
        });
        setPresetStates((prev) => {
          const next = { ...prev };
          delete next[presetId];
          return next;
        });
        return;
      }

      setPresetStates((prev) => ({
        ...prev,
        [presetId]: {
          playing: prev[presetId]?.playing ?? true,
          currentTime: data.currentTime,
          duration: data.duration,
        },
      }));
    };
    socket.on("audio:preset-progress", onProgress);
    return () => {
      socket.off("audio:preset-progress", onProgress);
    };
  }, [chainedPlaying]);

  // Handle volume changes (all use smooth interpolation)
  const handleIaVolume = useCallback(
    (volume: number) => {
      setVolumesByPhase((prev) => ({
        ...prev,
        [selectedPhase]: {
          ...prev[selectedPhase],
          ia: volume,
          ambientMaster: prev[selectedPhase]?.ambientMaster ?? 0.5,
        },
      }));
      const fromVol = lastEmittedRef.current.get("__ia__") ?? volume;
      fadeSocket(
        "__ia__",
        "audio:volume-ia",
        (v) => ({ volume: v }),
        fromVol,
        volume,
        150
      );
    },
    [selectedPhase, fadeSocket]
  );

  const handleAmbientMaster = useCallback(
    (volume: number) => {
      setVolumesByPhase((prev) => ({
        ...prev,
        [selectedPhase]: {
          ...prev[selectedPhase],
          ia: prev[selectedPhase]?.ia ?? 0.5,
          ambientMaster: volume,
        },
      }));
      // Scale all active ambient sounds with smooth interpolation
      const states = ambientByPhase[selectedPhase] ?? {};
      for (const [soundId, state] of Object.entries(states)) {
        if (state.active) {
          const key = `ambient-${soundId}`;
          const targetVol = state.volume * volume;
          const fromVol = lastEmittedRef.current.get(key) ?? targetVol;
          fadeSocket(
            key,
            "audio:set-ambient-volume",
            (v) => ({ soundId, volume: v }),
            fromVol,
            targetVol,
            150
          );
        }
      }
    },
    [selectedPhase, ambientByPhase, fadeSocket]
  );

  // Sync voice from ElevenLabs
  const syncVoice = async () => {
    const API_KEY = import.meta.env.VITE_ELEVEN_LABS_API_KEY;
    if (!API_KEY) return;
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": API_KEY },
      });
      const data = await res.json();
      if (data.voices) {
        const found = data.voices.find(
          (v: { name: string; voice_id: string }) =>
            v.name.toLowerCase().includes("aria")
        );
        if (found) {
          setSelectedVoiceId(found.voice_id);
          localStorage.setItem(
            "escape_voices",
            JSON.stringify([{ id: found.voice_id, name: found.name }])
          );
        }
      }
    } catch (err) {
      console.error("Voice sync error:", err);
    }
  };

  // Play TTS
  const playText = async (text: string) => {
    if (isApiPlaying || isGenerating) return;
    const API_KEY = import.meta.env.VITE_ELEVEN_LABS_API_KEY;
    if (!API_KEY) return;

    if (!selectedVoiceId) {
      await syncVoice();
      if (!selectedVoiceId) return;
    }

    if (!text.trim()) return;

    setIsGenerating(true);
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": API_KEY,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }
      );
      if (res.ok) {
        const blob = await res.blob();
        const audioBase64 = await blobToBase64(blob);
        socket.emit("audio:play-tts", {
          audioBase64,
          mimeType: blob.type || "audio/mpeg",
        });
        enableAriaSpeaking();
        setIsApiPlaying(true);
        setTimeout(() => {
          setIsApiPlaying(false);
          disableAriaSpeaking();
        }, 5000);
      }
    } catch (err) {
      console.error("TTS error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle protocole d'accueil
  const handleWelcome = () => {
    if (!participantName.trim()) return;
    const message = `Bonjour ${participantName}, je suis ARIA. Une intelligence artificielle à vos cotés. Pour vous.`;
    playText(message);
    setParticipantName("");
  };

  // Handle manual message
  const handleManualSend = () => {
    if (!manualMessage.trim()) return;
    playText(manualMessage);
    setManualMessage("");
  };

  // Handle key press for inputs
  const handleKeyPress = (
    e: KeyboardEvent<HTMLInputElement>,
    action: () => void
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      action();
    }
  };

  // Enable ARIA speaking animation when audio plays
  const enableAriaSpeaking = useCallback(() => {
    fetch(`${API_URL}/api/games/aria/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enable_speaking" }),
    }).catch(() => {});
  }, []);

  // Disable ARIA speaking animation when audio stops
  const disableAriaSpeaking = useCallback(() => {
    fetch(`${API_URL}/api/games/aria/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable_speaking" }),
    }).catch(() => {});
  }, []);

  // Toggle preset play/pause
  const togglePreset = useCallback(
    (presetId: string, file: string, idx: number) => {
      const state = presetStates[presetId];
      if (state?.playing) {
        socket.emit("audio:pause-preset", { presetIdx: idx });
        disableAriaSpeaking();
        setPresetStates((prev) => ({
          ...prev,
          [presetId]: { ...prev[presetId], playing: false },
        }));
      } else if (state && state.currentTime > 0) {
        // Resume paused preset
        socket.emit("audio:resume-preset", { presetIdx: idx });
        enableAriaSpeaking();
        setPresetStates((prev) => ({
          ...prev,
          [presetId]: { ...prev[presetId], playing: true },
        }));
      } else {
        // Start new preset
        socket.emit("audio:play-preset", { presetIdx: idx, file });
        enableAriaSpeaking();
        setPresetStates((prev) => ({
          ...prev,
          [presetId]: {
            playing: true,
            currentTime: 0,
            duration: prev[presetId]?.duration ?? 0,
          },
        }));
      }
    },
    [presetStates]
  );

  // Reset preset: stop and reset to 0 without auto-playing
  const resetPreset = useCallback((presetId: string, idx: number) => {
    socket.emit("audio:stop-preset", { presetIdx: idx });
    disableAriaSpeaking();
    setPresetStates((prev) => {
      const next = { ...prev };
      delete next[presetId];
      return next;
    });
  }, []);

  // Mark phase as complete
  const completePhase = (phaseId: number) => {
    if (!completedPhases.includes(phaseId)) {
      setCompletedPhases((prev) => [...prev, phaseId]);
    }
    // Move to next phase (max 5 phases now)
    const nextPhase = phaseId + 1;
    if (nextPhase <= 5) {
      setCurrentPhase(nextPhase);
      switchPhase(nextPhase);
    }
  };

  // Get phase status
  const getPhaseStatus = (phaseId: number) => {
    if (completedPhases.includes(phaseId)) return "completed";
    if (phaseId === currentPhase) return "current";
    return "pending";
  };

  // Get audio status for a game
  const getAudioStatus = (gameId: string) => {
    return audioPlayers.some((p) => p.gameId === gameId);
  };

  // Switch phase: crossfade ambient sounds and IA volume
  const switchPhase = useCallback(
    (targetPhase: number) => {
      if (targetPhase === selectedPhase) return;

      const FADE_MS = 800;
      const currentStates = ambientByPhase[selectedPhase] ?? {};
      const targetStates = ambientByPhase[targetPhase] ?? {};
      const currentAmbientMaster =
        volumesByPhase[selectedPhase]?.ambientMaster ?? 0.5;
      const targetAmbientMaster =
        volumesByPhase[targetPhase]?.ambientMaster ?? 0.5;

      // Crossfade ambient sounds between phases
      for (const sound of AMBIENT_SOUNDS) {
        const currentState = currentStates[sound.id];
        const targetState = targetStates[sound.id];
        const wasActive = currentState?.active ?? false;
        const willBeActive = targetState?.active ?? false;
        const currentEffective =
          (currentState?.volume ?? 0.1) * currentAmbientMaster;
        const targetEffective =
          (targetState?.volume ?? 0.1) * targetAmbientMaster;

        if (wasActive && !willBeActive) {
          // Fade out then stop
          fadeSocket(
            `ambient-${sound.id}`,
            "audio:set-ambient-volume",
            (v) => ({ soundId: sound.id, volume: v }),
            currentEffective,
            0,
            FADE_MS,
            () => socket.emit("audio:stop-ambient", { soundId: sound.id })
          );
        } else if (!wasActive && willBeActive) {
          // Start at volume 0, then fade in
          socket.emit("audio:play-ambient", {
            soundId: sound.id,
            file: sound.file,
            volume: 0,
          });
          setTimeout(() => {
            fadeSocket(
              `ambient-${sound.id}`,
              "audio:set-ambient-volume",
              (v) => ({ soundId: sound.id, volume: v }),
              0,
              targetEffective,
              FADE_MS
            );
          }, 50);
        } else if (wasActive && willBeActive) {
          // Crossfade volume if different
          if (Math.abs(currentEffective - targetEffective) > 0.01) {
            fadeSocket(
              `ambient-${sound.id}`,
              "audio:set-ambient-volume",
              (v) => ({ soundId: sound.id, volume: v }),
              currentEffective,
              targetEffective,
              FADE_MS
            );
          }
        }
      }

      // Fade IA volume between phases
      const currentIa = volumesByPhase[selectedPhase]?.ia ?? 0.5;
      const targetIa = volumesByPhase[targetPhase]?.ia ?? 0.5;
      if (Math.abs(currentIa - targetIa) > 0.01) {
        fadeSocket(
          "__ia__",
          "audio:volume-ia",
          (v) => ({ volume: v }),
          currentIa,
          targetIa,
          FADE_MS
        );
      } else {
        socket.emit("audio:volume-ia", { volume: targetIa });
      }

      skipNextPhaseSyncRef.current = true;
      setSelectedPhase(targetPhase);
    },
    [selectedPhase, ambientByPhase, volumesByPhase, fadeSocket]
  );

  // Start phase 1 sounds from stopped state (after global reset) with fade in
  const startPhase1Sounds = useCallback(() => {
    const FADE_MS = 600;
    const phase1States = ambientByPhase[1] ?? {};
    const phase1AmbientMaster = volumesByPhase[1]?.ambientMaster ?? 0.5;

    for (const sound of AMBIENT_SOUNDS) {
      const state = phase1States[sound.id];
      if (state?.active) {
        const targetVol = (state.volume ?? 0.1) * phase1AmbientMaster;
        socket.emit("audio:play-ambient", {
          soundId: sound.id,
          file: sound.file,
          volume: 0,
        });
        setTimeout(() => {
          fadeSocket(
            `ambient-${sound.id}`,
            "audio:set-ambient-volume",
            (v) => ({ soundId: sound.id, volume: v }),
            0,
            targetVol,
            FADE_MS
          );
        }, 50);
      }
    }
    // Sync local state
    setAmbientStates(() => phase1States);
  }, [ambientByPhase, volumesByPhase, fadeSocket]);

  // Listen for global reset (audio:stop-all) to reset phases and restart phase 1 sounds
  useEffect(() => {
    const handleStopAll = () => {
      // Reset phase state to initial
      setCurrentPhase(1);
      setCompletedPhases([]);
      setSelectedPhase(1);

      // Restart phase 1 sounds after a short delay (let stop-all complete first)
      setTimeout(() => {
        startPhase1Sounds();
      }, 500);
    };

    socket.on("audio:stop-all", handleStopAll);
    return () => {
      socket.off("audio:stop-all", handleStopAll);
    };
  }, [startPhase1Sounds]);

  // Toggle ambient sound with fade in/out
  const toggleAmbient = useCallback(
    (sound: AmbientSoundConfig) => {
      const state = ambientStates[sound.id];
      const FADE_MS = 400;

      if (state?.active) {
        const currentVol = (state.volume ?? 0.1) * ambientMaster;
        // Fade out then stop
        fadeSocket(
          `ambient-${sound.id}`,
          "audio:set-ambient-volume",
          (v) => ({ soundId: sound.id, volume: v }),
          currentVol,
          0,
          FADE_MS,
          () => socket.emit("audio:stop-ambient", { soundId: sound.id })
        );
        setAmbientStates((prev) => ({
          ...prev,
          [sound.id]: { ...prev[sound.id], active: false },
        }));
      } else {
        const vol = state?.volume ?? 0.1;
        const targetVol = vol * ambientMaster;
        // Start at volume 0, then fade in
        socket.emit("audio:play-ambient", {
          soundId: sound.id,
          file: sound.file,
          volume: 0,
        });
        setTimeout(() => {
          fadeSocket(
            `ambient-${sound.id}`,
            "audio:set-ambient-volume",
            (v) => ({ soundId: sound.id, volume: v }),
            0,
            targetVol,
            FADE_MS
          );
        }, 50);
        setAmbientStates((prev) => ({
          ...prev,
          [sound.id]: { active: true, volume: vol },
        }));
      }
    },
    [ambientStates, setAmbientStates, ambientMaster, fadeSocket]
  );

  // Change ambient volume with smooth interpolation
  const changeAmbientVolume = useCallback(
    (sound: AmbientSoundConfig, volume: number) => {
      setAmbientStates((prev) => ({
        ...prev,
        [sound.id]: { active: prev[sound.id]?.active ?? false, volume },
      }));
      if (ambientStates[sound.id]?.active) {
        const key = `ambient-${sound.id}`;
        const targetVol = volume * ambientMaster;
        const fromVol = lastEmittedRef.current.get(key) ?? targetVol;
        fadeSocket(
          key,
          "audio:set-ambient-volume",
          (v) => ({ soundId: sound.id, volume: v }),
          fromVol,
          targetVol,
          150
        );
      }
    },
    [ambientStates, setAmbientStates, ambientMaster, fadeSocket]
  );

  // Change ambient volume with longer fade (for percentage input jumps)
  const changeAmbientVolumeSmooth = useCallback(
    (sound: AmbientSoundConfig, newVolume: number) => {
      setAmbientStates((prev) => ({
        ...prev,
        [sound.id]: {
          active: prev[sound.id]?.active ?? false,
          volume: newVolume,
        },
      }));
      if (ambientStates[sound.id]?.active) {
        const key = `ambient-${sound.id}`;
        const fromVol =
          lastEmittedRef.current.get(key) ??
          (ambientStates[sound.id]?.volume ?? 0.1) * ambientMaster;
        fadeSocket(
          key,
          "audio:set-ambient-volume",
          (v) => ({ soundId: sound.id, volume: v }),
          fromVol,
          newVolume * ambientMaster,
          300
        );
      }
    },
    [ambientStates, setAmbientStates, ambientMaster, fadeSocket]
  );

  // Get presets for selected phase
  const selectedPresets = PRESETS.filter((p) => p.phase === selectedPhase);

  return (
    <div className="sound-control controle-audio-container">
      {/* Audio Status Header */}
      <div className="sc-audio-status">
        <span className="sc-status-label">STATUS AUDIO</span>
        <div className="sc-status-badges">
          {EXPECTED_AUDIO_GAMES.map((game) => {
            const isActive = getAudioStatus(game.gameId);
            return (
              <div
                key={game.gameId}
                className={`sc-status-badge ${isActive ? "active" : "inactive"}`}
              >
                <span className="sc-status-dot" />
                <span className="sc-status-name">{game.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content with Volume Faders */}
      <div className="sc-main-layout">
        {/* Center Content */}
        <div className="sc-center">
          {/* Message manuel */}
          <div className="sc-input-section">
            <label className="sc-input-label">MESSAGE MANUEL</label>
            <input
              type="text"
              value={manualMessage}
              onChange={(e) => setManualMessage(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, handleManualSend)}
              placeholder="Message + Entree"
              className="sc-input"
              disabled={isGenerating || isApiPlaying}
            />
          </div>

          {/* TTS Status */}
          {(isGenerating || isApiPlaying) && (
            <div className="sc-tts-status">
              {isGenerating ? "GENERATION..." : "TRANSMISSION..."}
            </div>
          )}

          {/* Phase Progression */}
          <div className="sc-phases">
            <label className="sc-input-label">PROGRESSION</label>
            <div className="sc-phase-buttons">
              {PHASES.map((phase) => {
                const status = getPhaseStatus(phase.id);
                return (
                  <button
                    key={phase.id}
                    className={`sc-phase-btn ${status} ${selectedPhase === phase.id ? "selected" : ""}`}
                    onClick={() => switchPhase(phase.id)}
                    title={phase.subtitle}
                  >
                    <span className="sc-phase-indicator">
                      {status === "completed"
                        ? "OK"
                        : status === "current"
                          ? "*"
                          : ""}
                    </span>
                    <span className="sc-phase-num">P{phase.id}</span>
                    <span className="sc-phase-name">{phase.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Phase subtitle */}
            <div className="sc-phase-subtitle">
              {PHASES.find((p) => p.id === selectedPhase)?.subtitle}
            </div>

            {/* Phase action buttons */}
            <div className="sc-phase-actions">
              {selectedPhase === currentPhase && (
                <button
                  className="sc-complete-phase"
                  onClick={() => completePhase(currentPhase)}
                >
                  Terminer Phase {currentPhase}
                </button>
              )}
            </div>
          </div>

          {/* Protocole d'accueil - Phase Roleplay only */}
          {selectedPhase === 1 && (
            <div className="sc-input-section">
              <label className="sc-input-label">PROTOCOLE D'ACCUEIL</label>
              <input
                type="text"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, handleWelcome)}
                placeholder="Prenom + Entree"
                className="sc-input"
                disabled={isGenerating || isApiPlaying}
              />
            </div>
          )}

          {/* Presets for selected phase */}
          <div className="sc-presets">
            <label className="sc-input-label">
              PRESETS - Phase {selectedPhase}
            </label>
            <div className="sc-preset-list">
              {selectedPresets.map((preset) => {
                const globalIdx = PRESETS.indexOf(preset);
                const state = presetStates[preset.id];
                const isPlaying = state?.playing ?? false;
                const currentTime = state?.currentTime ?? 0;
                const duration = state?.duration ?? 0;
                const hasState = !!state;
                const isPaused = hasState && !isPlaying;

                // For Phase 5 preset, call onLaunchAria which plays audio + triggers ARIA/map/password
                const handlePresetClick = () => {
                  if (preset.id === "phase-5" && onLaunchAria) {
                    onLaunchAria();
                  } else {
                    // Send message to messagerie if preset has messageToSend (only when starting, not resuming)
                    if (
                      preset.messageToSend &&
                      onSendMessage &&
                      !state?.currentTime
                    ) {
                      onSendMessage(preset.messageToSend);
                    }
                    togglePreset(preset.id, preset.file, globalIdx);
                  }
                };

                return (
                  <div
                    key={preset.id}
                    className={`sc-preset-card ${isPlaying ? "playing" : ""} ${isPaused ? "paused" : ""} ${preset.id === "phase-5" && isAriaLaunching ? "launching" : ""}`}
                    onClick={handlePresetClick}
                  >
                    <div className="sc-preset-row">
                      <span className="sc-preset-label">{preset.label}</span>
                      <span className="sc-preset-time">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                      {hasState && (
                        <button
                          className="sc-preset-replay-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            resetPreset(preset.id, globalIdx);
                          }}
                          title="Remettre a zero"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Responses */}
          <div className="sc-quick">
            <label className="sc-input-label">REPONSES RAPIDES</label>
            <div className="sc-preset-grid">
              {QUICK_RESPONSES.map((preset, idx) => {
                const presetId = `quick-${idx}`;
                const state = presetStates[presetId];
                const isPlaying = state?.playing ?? false;
                const hasState = !!state;
                const isPaused = hasState && !isPlaying;

                return (
                  <div
                    key={preset.id}
                    className={`sc-quick-response ${isPlaying ? "playing" : ""} ${isPaused ? "paused" : ""}`}
                    onClick={() =>
                      togglePreset(presetId, preset.file, 100 + idx)
                    }
                  >
                    <span className="sc-quick-label">{preset.label}</span>
                    {hasState && (
                      <button
                        className="sc-quick-reset-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          resetPreset(presetId, 100 + idx);
                        }}
                        title="Remettre a zero"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ambient Sounds */}
          <div className="sc-ambient">
            <label className="sc-input-label">SONS D'AMBIANCE</label>
            <div className="sc-ambient-grid">
              {AMBIENT_SOUNDS.map((sound) => {
                const state = ambientStates[sound.id];
                const isActive = state?.active ?? false;
                const volume = state?.volume ?? 0.1;
                const Icon = sound.icon;

                return (
                  <div key={sound.id} className="sc-ambient-item">
                    <button
                      className={`sc-ambient-circle ${isActive ? "active" : ""}`}
                      onClick={() => toggleAmbient(sound)}
                    >
                      <Icon size={22} />
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(e) =>
                        changeAmbientVolume(sound, parseFloat(e.target.value))
                      }
                      className="sc-ambient-volume"
                    />
                    {editingVolumeId === sound.id ? (
                      <input
                        type="number"
                        className="sc-ambient-percent-input"
                        value={editValue}
                        min={0}
                        max={100}
                        autoFocus
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = Math.max(
                              0,
                              Math.min(100, parseInt(editValue) || 0)
                            );
                            changeAmbientVolumeSmooth(sound, val / 100);
                            setEditingVolumeId(null);
                          } else if (e.key === "Escape") {
                            setEditingVolumeId(null);
                          }
                        }}
                        onBlur={() => {
                          const val = Math.max(
                            0,
                            Math.min(100, parseInt(editValue) || 0)
                          );
                          changeAmbientVolumeSmooth(sound, val / 100);
                          setEditingVolumeId(null);
                        }}
                      />
                    ) : (
                      <span
                        className="sc-ambient-percent"
                        onClick={() => {
                          setEditingVolumeId(sound.id);
                          setEditValue(String(Math.round(volume * 100)));
                        }}
                        title="Cliquer pour éditer"
                      >
                        {Math.round(volume * 100)}%
                      </span>
                    )}
                    <span className="sc-ambient-label">{sound.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Volume Faders */}
        <div className="sc-fader-group">
          <VolumeFader label="IA" value={iaVolume} onChange={handleIaVolume} />
          <VolumeFader
            label="Ambiance"
            value={ambientMaster}
            onChange={handleAmbientMaster}
          />
          <VolumeFader label="BFM" value={jtVolume} onChange={handleJtVolume} />
        </div>
      </div>
    </div>
  );
}
