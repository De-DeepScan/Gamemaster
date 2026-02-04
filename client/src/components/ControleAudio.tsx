import {
  useState,
  useCallback,
  useEffect,
  useRef,
  KeyboardEvent,
  PointerEvent as RPointerEvent,
} from "react";
import { socket } from "../socket";
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
}

interface PresetState {
  playing: boolean;
  currentTime: number;
  duration: number;
}

interface ControleAudioProps {
  audioPlayers: AudioPlayerStatus[];
}

// Preset configurations grouped by phase
const PRESETS: PresetConfig[] = [
  {
    id: "phase-1-01",
    label: "Oui biensure",
    file: "phase-1-01-oui-biensure.mp3",
    phase: 2,
  },
  {
    id: "phase-1-02",
    label: "Par contre",
    file: "phase-1-02-par-contre.mp3",
    phase: 2,
  },
  {
    id: "phase-1-03",
    label: "Avec plaisir",
    file: "phase-1-03-avec-plaisir.mp3",
    phase: 2,
  },
  {
    id: "phase-2",
    label: "Presentation IA",
    file: "phase-2-presentation-ia.mp3",
    phase: 3,
  },
  {
    id: "phase-3-01",
    label: "Ah oui",
    file: "phase-3-01-ah-oui.mp3",
    phase: 4,
  },
  { id: "phase-3-02", label: "Merci", file: "phase-3-02-merci.mp3", phase: 4 },
  {
    id: "phase-3-03",
    label: "Quelques secondes",
    file: "phase-3-03-quelques-secondes.mp3",
    phase: 4,
  },
  { id: "phase-5", label: "Phase 5", file: "phase-5.mp3", phase: 5 },
  { id: "finale", label: "Finale", file: "finale.mp3", phase: 7 },
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
    id: "stupid",
    label: "Questions idiotes",
    file: "stupid-questions.mp3",
    phase: 0,
  },
];

const PHASES = [
  { id: 1, name: "Accueil", subtitle: "Accueil des invites par l'etudiant" },
  {
    id: 2,
    name: "Interaction",
    subtitle: "Premiere interaction avec ARIA + depart etudiant",
  },
  { id: 3, name: "Monologue", subtitle: "ARIA se presente en monologue" },
  {
    id: 4,
    name: "Tchat",
    subtitle: "Interaction via le tchat pour brancher le fil",
  },
  {
    id: 5,
    name: "Prise de controle",
    subtitle: "Diffusion sur le reseau, recherche du mot de passe",
  },
  { id: 6, name: "Jeux", subtitle: "Mot de passe trouve, lancement des jeux" },
  {
    id: 7,
    name: "Finale",
    subtitle: "Jeux termines, code cadenas, branchement cle USB",
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

export function ControleAudio({ audioPlayers }: ControleAudioProps) {
  // Phase progression state
  const [currentPhase, setCurrentPhase] = useState(1);
  const [completedPhases, setCompletedPhases] = useState<number[]>([]);
  const [selectedPhase, setSelectedPhase] = useState(1);

  // Volume states per phase (persisted)
  const [volumesByPhase, setVolumesByPhase] = useState<
    Record<number, { ia: number; ambient: number }>
  >(() => {
    const stored = localStorage.getItem("sc_volumes_by_phase");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        /* ignore */
      }
    }
    return {};
  });

  // Current phase volumes (derived)
  const iaVolume = volumesByPhase[selectedPhase]?.ia ?? 0.5;
  const ambientVolume = volumesByPhase[selectedPhase]?.ambient ?? 0.5;

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

  // Ambient states per phase: phase -> soundId -> { active, volume } (persisted)
  const [ambientByPhase, setAmbientByPhase] = useState<
    Record<number, Record<string, { active: boolean; volume: number }>>
  >(() => {
    const stored = localStorage.getItem("sc_ambient_by_phase");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        /* ignore */
      }
    }
    return {};
  });

  // Current phase ambient states (derived)
  const ambientStates = ambientByPhase[selectedPhase] ?? {};

  // Voice sync
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);

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
    socket.emit("audio:volume-ia", { volume: iaVolume });
    socket.emit("audio:master-volume", { volume: ambientVolume });
  }, [selectedPhase]);

  // Persist per-phase data
  useEffect(() => {
    localStorage.setItem("sc_volumes_by_phase", JSON.stringify(volumesByPhase));
  }, [volumesByPhase]);

  useEffect(() => {
    localStorage.setItem("sc_ambient_by_phase", JSON.stringify(ambientByPhase));
  }, [ambientByPhase]);

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
      const preset = PRESETS[data.presetIdx];
      if (!preset) return;

      if (data.ended) {
        setPresetStates((prev) => {
          const next = { ...prev };
          delete next[preset.id];
          return next;
        });
        return;
      }

      setPresetStates((prev) => ({
        ...prev,
        [preset.id]: {
          playing: prev[preset.id]?.playing ?? true,
          currentTime: data.currentTime,
          duration: data.duration,
        },
      }));
    };
    socket.on("audio:preset-progress", onProgress);
    return () => {
      socket.off("audio:preset-progress", onProgress);
    };
  }, []);

  // Handle volume changes
  const handleIaVolume = useCallback(
    (volume: number) => {
      setVolumesByPhase((prev) => ({
        ...prev,
        [selectedPhase]: {
          ...prev[selectedPhase],
          ia: volume,
          ambient: prev[selectedPhase]?.ambient ?? 0.5,
        },
      }));
      socket.emit("audio:volume-ia", { volume });
    },
    [selectedPhase]
  );

  const handleAmbientVolume = useCallback(
    (volume: number) => {
      setVolumesByPhase((prev) => ({
        ...prev,
        [selectedPhase]: {
          ia: prev[selectedPhase]?.ia ?? 0.5,
          ...prev[selectedPhase],
          ambient: volume,
        },
      }));
      socket.emit("audio:master-volume", { volume });
    },
    [selectedPhase]
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
        setIsApiPlaying(true);
        setTimeout(() => setIsApiPlaying(false), 5000);
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

  // Toggle preset play/pause
  const togglePreset = useCallback(
    (presetId: string, file: string, idx: number) => {
      const state = presetStates[presetId];
      if (state?.playing) {
        socket.emit("audio:pause-preset", { presetIdx: idx });
        setPresetStates((prev) => ({
          ...prev,
          [presetId]: { ...prev[presetId], playing: false },
        }));
      } else if (state && state.currentTime > 0) {
        // Resume paused preset
        socket.emit("audio:resume-preset", { presetIdx: idx });
        setPresetStates((prev) => ({
          ...prev,
          [presetId]: { ...prev[presetId], playing: true },
        }));
      } else {
        // Start new preset
        socket.emit("audio:play-preset", { presetIdx: idx, file });
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

  // Seek preset to a specific time
  const seekPreset = useCallback((presetIdx: number, time: number) => {
    socket.emit("audio:seek-preset", { presetIdx, currentTime: time });
  }, []);

  // Replay preset from the beginning
  const replayPreset = useCallback(
    (presetId: string, file: string, idx: number) => {
      socket.emit("audio:play-preset", { presetIdx: idx, file });
      setPresetStates((prev) => ({
        ...prev,
        [presetId]: {
          playing: true,
          currentTime: 0,
          duration: prev[presetId]?.duration ?? 0,
        },
      }));
    },
    []
  );

  // Mark phase as complete
  const completePhase = (phaseId: number) => {
    if (!completedPhases.includes(phaseId)) {
      setCompletedPhases((prev) => [...prev, phaseId]);
    }
    // Move to next phase
    const nextPhase = phaseId + 1;
    if (nextPhase <= 7) {
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

  // Switch phase: stop current ambients, start saved ones for target phase
  const switchPhase = useCallback(
    (targetPhase: number) => {
      if (targetPhase === selectedPhase) return;

      // Stop all currently active ambient sounds
      const currentStates = ambientByPhase[selectedPhase] ?? {};
      for (const [soundId, state] of Object.entries(currentStates)) {
        if (state.active) {
          socket.emit("audio:stop-ambient", { soundId });
        }
      }

      setSelectedPhase(targetPhase);

      // Start ambient sounds saved for the target phase
      const targetStates = ambientByPhase[targetPhase] ?? {};
      for (const [soundId, state] of Object.entries(targetStates)) {
        if (state.active) {
          const sound = AMBIENT_SOUNDS.find((s) => s.id === soundId);
          if (sound) {
            socket.emit("audio:play-ambient", {
              soundId,
              file: sound.file,
              volume: state.volume,
            });
          }
        }
      }
    },
    [selectedPhase, ambientByPhase]
  );

  // Toggle ambient sound
  const toggleAmbient = useCallback(
    (sound: AmbientSoundConfig) => {
      const state = ambientStates[sound.id];
      if (state?.active) {
        socket.emit("audio:stop-ambient", { soundId: sound.id });
        setAmbientStates((prev) => ({
          ...prev,
          [sound.id]: { ...prev[sound.id], active: false },
        }));
      } else {
        const vol = state?.volume ?? 0.1;
        socket.emit("audio:play-ambient", {
          soundId: sound.id,
          file: sound.file,
          volume: vol,
        });
        setAmbientStates((prev) => ({
          ...prev,
          [sound.id]: { active: true, volume: vol },
        }));
      }
    },
    [ambientStates, setAmbientStates]
  );

  // Change ambient volume
  const changeAmbientVolume = useCallback(
    (sound: AmbientSoundConfig, volume: number) => {
      setAmbientStates((prev) => ({
        ...prev,
        [sound.id]: { active: prev[sound.id]?.active ?? false, volume },
      }));
      if (ambientStates[sound.id]?.active) {
        socket.emit("audio:set-ambient-volume", {
          soundId: sound.id,
          volume,
        });
      }
    },
    [ambientStates, setAmbientStates]
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
        {/* Left Volume Fader - Voix IA */}
        <VolumeFader
          label="Voix IA"
          value={iaVolume}
          onChange={handleIaVolume}
        />

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

            {/* Complete Phase Button */}
            {selectedPhase === currentPhase && (
              <button
                className="sc-complete-phase"
                onClick={() => completePhase(currentPhase)}
              >
                Terminer Phase {currentPhase}
              </button>
            )}
          </div>

          {/* Protocole d'accueil - Phase 1 only */}
          {selectedPhase === 2 && (
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
                const progress =
                  duration > 0 ? (currentTime / duration) * 100 : 0;

                return (
                  <div
                    key={preset.id}
                    className={`sc-preset-card ${isPlaying ? "playing" : ""} ${state ? "has-state" : ""}`}
                  >
                    <div className="sc-preset-row">
                      <button
                        className="sc-preset-play-btn"
                        onClick={() =>
                          togglePreset(preset.id, preset.file, globalIdx)
                        }
                      >
                        {isPlaying ? "||" : "\u25B6"}
                      </button>
                      <span className="sc-preset-label">{preset.label}</span>
                      <span className="sc-preset-time">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                    </div>
                    <div className="sc-preset-timeline-row">
                      <input
                        type="range"
                        min="0"
                        max={duration || 1}
                        step="0.1"
                        value={currentTime}
                        onChange={(e) =>
                          seekPreset(globalIdx, parseFloat(e.target.value))
                        }
                        className="sc-preset-timeline"
                        style={
                          {
                            "--progress": `${progress}%`,
                          } as React.CSSProperties
                        }
                      />
                      <button
                        className="sc-preset-replay-btn"
                        onClick={() =>
                          replayPreset(preset.id, preset.file, globalIdx)
                        }
                        title="Rejouer depuis le debut"
                      >
                        <RotateCcw size={13} />
                      </button>
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

                return (
                  <button
                    key={preset.id}
                    className={`sc-preset sc-preset-quick ${isPlaying ? "playing" : ""}`}
                    onClick={() =>
                      togglePreset(presetId, preset.file, 100 + idx)
                    }
                  >
                    <span className="sc-preset-icon">
                      {isPlaying ? "||" : ">"}
                    </span>
                    <span className="sc-preset-label">{preset.label}</span>
                  </button>
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
                    <span className="sc-ambient-percent">
                      {Math.round(volume * 100)}%
                    </span>
                    <span className="sc-ambient-label">{sound.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Volume Fader - Ambiance */}
        <VolumeFader
          label="Ambiance"
          value={ambientVolume}
          onChange={handleAmbientVolume}
        />
      </div>
    </div>
  );
}
