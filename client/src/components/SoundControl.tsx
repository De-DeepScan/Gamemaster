import { useState, useCallback, useEffect, KeyboardEvent } from "react";
import { socket } from "../socket";
import "./SoundControl.css";

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

interface SoundControlProps {
  audioPlayers: AudioPlayerStatus[];
}

// Preset configurations grouped by phase
const PRESETS: PresetConfig[] = [
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
    label: "Avec plaisir",
    file: "phase-1-03-avec-plaisir.mp3",
    phase: 1,
  },
  {
    id: "phase-2",
    label: "Presentation IA",
    file: "phase-2-presentation-ia.mp3",
    phase: 2,
  },
  {
    id: "phase-3-01",
    label: "Ah oui",
    file: "phase-3-01-ah-oui.mp3",
    phase: 3,
  },
  { id: "phase-3-02", label: "Merci", file: "phase-3-02-merci.mp3", phase: 3 },
  {
    id: "phase-3-03",
    label: "Quelques secondes",
    file: "phase-3-03-quelques-secondes.mp3",
    phase: 3,
  },
  { id: "phase-4", label: "Phase 4", file: "phase-4.mp3", phase: 4 },
  { id: "finale", label: "Finale", file: "finale.mp3", phase: 5 },
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
  { id: 1, name: "Accueil", shortName: "P1" },
  { id: 2, name: "Presentation", shortName: "P2" },
  { id: 3, name: "Interactions", shortName: "P3" },
  { id: 4, name: "Autonomie", shortName: "P4" },
  { id: 5, name: "Finale", shortName: "FIN" },
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

export function SoundControl({ audioPlayers }: SoundControlProps) {
  // Phase progression state
  const [currentPhase, setCurrentPhase] = useState(1);
  const [completedPhases, setCompletedPhases] = useState<number[]>([]);
  const [selectedPhase, setSelectedPhase] = useState(1);

  // Volume states
  const [iaVolume, setIaVolume] = useState(1);
  const [ambientVolume, setAmbientVolume] = useState(1);

  // Input states
  const [participantName, setParticipantName] = useState("");
  const [manualMessage, setManualMessage] = useState("");

  // TTS states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApiPlaying, setIsApiPlaying] = useState(false);

  // Preset states
  const [presetStates, setPresetStates] = useState<Record<string, PresetState>>(
    {}
  );

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

  // Listen for preset progress
  useEffect(() => {
    const onProgress = (data: {
      presetIdx: number;
      currentTime: number;
      duration: number;
      ended?: boolean;
    }) => {
      const presetId = `preset-${data.presetIdx}`;
      if (data.ended) {
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
  }, []);

  // Handle volume changes
  const handleIaVolume = useCallback((volume: number) => {
    setIaVolume(volume);
    socket.emit("audio:volume-ia", { volume });
  }, []);

  const handleAmbientVolume = useCallback((volume: number) => {
    setAmbientVolume(volume);
    socket.emit("audio:master-volume", { volume });
  }, []);

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
      } else {
        socket.emit("audio:play-preset", { presetIdx: idx, file });
        setPresetStates((prev) => ({
          ...prev,
          [presetId]: {
            playing: true,
            currentTime: prev[presetId]?.currentTime ?? 0,
            duration: prev[presetId]?.duration ?? 0,
          },
        }));
      }
    },
    [presetStates]
  );

  // Mark phase as complete
  const completePhase = (phaseId: number) => {
    if (!completedPhases.includes(phaseId)) {
      setCompletedPhases((prev) => [...prev, phaseId]);
    }
    // Move to next phase
    const nextPhase = phaseId + 1;
    if (nextPhase <= 5) {
      setCurrentPhase(nextPhase);
      setSelectedPhase(nextPhase);
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

  // Get presets for selected phase
  const selectedPresets = PRESETS.filter((p) => p.phase === selectedPhase);

  return (
    <div className="sound-control">
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
        {/* Left Volume Fader - IA */}
        <div className="sc-fader">
          <span className="sc-fader-label">IA</span>
          <div className="sc-fader-track">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={iaVolume}
              onChange={(e) => handleIaVolume(parseFloat(e.target.value))}
              className="sc-fader-input"
              orient="vertical"
            />
          </div>
          <span className="sc-fader-value">{Math.round(iaVolume * 100)}%</span>
        </div>

        {/* Center Content */}
        <div className="sc-center">
          {/* Protocole d'accueil */}
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
                    onClick={() => setSelectedPhase(phase.id)}
                  >
                    <span className="sc-phase-indicator">
                      {status === "completed"
                        ? "✓"
                        : status === "current"
                          ? "●"
                          : ""}
                    </span>
                    <span className="sc-phase-name">{phase.shortName}</span>
                  </button>
                );
              })}
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

          {/* Presets for selected phase */}
          <div className="sc-presets">
            <label className="sc-input-label">
              PRESETS - {PHASES.find((p) => p.id === selectedPhase)?.name}
            </label>
            <div className="sc-preset-grid">
              {selectedPresets.map((preset, idx) => {
                const presetId = `preset-${idx}`;
                const state = presetStates[presetId];
                const isPlaying = state?.playing ?? false;

                return (
                  <button
                    key={preset.id}
                    className={`sc-preset ${isPlaying ? "playing" : ""} ${state ? "has-state" : ""}`}
                    onClick={() => togglePreset(presetId, preset.file, idx)}
                  >
                    <span className="sc-preset-icon">
                      {isPlaying ? "⏸" : state ? "▶" : "●"}
                    </span>
                    <span className="sc-preset-label">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Responses */}
          <div className="sc-quick">
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
                      {isPlaying ? "⏸" : "🎲"}
                    </span>
                    <span className="sc-preset-label">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Volume Fader - Ambiance */}
        <div className="sc-fader">
          <span className="sc-fader-label">AMB</span>
          <div className="sc-fader-track">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={ambientVolume}
              onChange={(e) => handleAmbientVolume(parseFloat(e.target.value))}
              className="sc-fader-input"
              orient="vertical"
            />
          </div>
          <span className="sc-fader-value">
            {Math.round(ambientVolume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
