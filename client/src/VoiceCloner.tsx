import { useState, useEffect, useRef, useCallback } from "react";
import { socket } from "./socket";
import "./VoiceCloner.css";

interface Preset {
  label: string;
  content: string;
  file: string;
}

interface SavedVoice {
  id: string;
  name: string;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
}

interface VoiceResponse {
  voices: ElevenLabsVoice[];
}

interface AddVoiceResponse {
  voice_id: string;
}

const PRESET_TEXTS: Preset[] = [
  {
    label: "Question Idiot",
    content: "questions idiot, reponse idiot",
    file: "Stupid questions.mp3",
  },
  {
    label: "Phase 1",
    content: "oui biensure",
    file: "phase-1-01-oui-biensure.mp3",
  },
  {
    label: "par contre",
    content: "par contre",
    file: "phase-1-02-par-contre.mp3",
  },
  {
    label: "avec plaisir",
    content: "avec plaisir",
    file: "phase-1-03-oui-avec-plaisir.mp3",
  },
  {
    label: "presentation",
    content: "presentation de l'ia",
    file: "phase-2-presentation-ia.mp3",
  },
  { label: "ah oui", content: "ah oui", file: "phase-3-01-ah-oui.mp3" },
  { label: "merci", content: "merci", file: "phase-3-02-merci.mp3" },
  {
    label: "quelques secondes",
    content: "quelques secondes",
    file: "phase-3-03-encore-quelqueseconde.mp3",
  },
  { label: "phase 4", content: "phase4", file: "phase-4.mp3" },
  { label: "Finale", content: "finale", file: "finale.mp3" },
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
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VoiceCloner() {
  const [savedVoices, setSavedVoices] = useState<SavedVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);

  const [customText, setCustomText] = useState("");
  const [participantName, setParticipantName] = useState("");

  const [status, setStatus] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApiPlaying, setIsApiPlaying] = useState(false);

  const [iaVolume, setIaVolume] = useState(1);
  const [presetStates, setPresetStates] = useState<
    Record<number, { playing: boolean; currentTime: number; duration: number }>
  >({});

  const [file, setFile] = useState<File | null>(null);
  const [newVoiceName, setNewVoiceName] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("escape_voices");
    if (stored) {
      const voices = JSON.parse(stored) as SavedVoice[];
      setSavedVoices(voices);
      const aria = voices.find((v) =>
        v.name.trim().toLowerCase().includes("aria")
      );
      if (aria) setSelectedVoiceId(aria.id);
    }
  }, []);

  useEffect(() => {
    const onProgress = (data: {
      presetIdx: number;
      currentTime: number;
      duration: number;
      ended?: boolean;
    }) => {
      if (data.ended) {
        setPresetStates((prev) => {
          const next = { ...prev };
          delete next[data.presetIdx];
          return next;
        });
        return;
      }
      setPresetStates((prev) => ({
        ...prev,
        [data.presetIdx]: {
          playing: prev[data.presetIdx]?.playing ?? true,
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

  const syncVoices = async () => {
    const API_KEY = import.meta.env.VITE_ELEVEN_LABS_API_KEY;
    if (!API_KEY) return setStatus("Erreur: API Key manquante");
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": API_KEY },
      });
      const data = (await res.json()) as VoiceResponse;
      if (data.voices) {
        const found = data.voices.find((v) =>
          v.name.toLowerCase().includes("aria")
        );
        if (found) {
          const simple: SavedVoice = { id: found.voice_id, name: found.name };
          const others = savedVoices.filter(
            (v) => !v.name.toLowerCase().includes("aria")
          );
          const newList = [...others, simple];
          setSavedVoices(newList);
          localStorage.setItem("escape_voices", JSON.stringify(newList));
          setSelectedVoiceId(simple.id);
          setStatus("ARIA connecté");
        }
      }
    } catch (err) {
      console.error(err);
      setStatus("Erreur Sync");
    }
  };

  const togglePreset = useCallback(
    (idx: number, filename: string) => {
      const state = presetStates[idx];
      if (state?.playing) {
        socket.emit("audio:pause-preset", { presetIdx: idx });
        setPresetStates((prev) => ({
          ...prev,
          [idx]: { ...prev[idx], playing: false },
        }));
      } else {
        socket.emit("audio:play-preset", { presetIdx: idx, file: filename });
        setPresetStates((prev) => ({
          ...prev,
          [idx]: {
            playing: true,
            currentTime: prev[idx]?.currentTime ?? 0,
            duration: prev[idx]?.duration ?? 0,
          },
        }));
      }
    },
    [presetStates]
  );

  const seekPreset = useCallback((idx: number, time: number) => {
    socket.emit("audio:seek-preset", { presetIdx: idx, time });
    setPresetStates((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], currentTime: time },
    }));
  }, []);

  const playText = async (text: string) => {
    if (isApiPlaying) return;
    const API_KEY = import.meta.env.VITE_ELEVEN_LABS_API_KEY;
    if (!API_KEY) return alert("API Key manquante");
    if (!selectedVoiceId) {
      await syncVoices();
      if (!selectedVoiceId) return alert("Sélectionnez une voix");
    }
    if (!text) return;

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
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) =>
        chunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setFile(new File([blob], "rec.webm", { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setStatus("Erreur Mic");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleClone = async () => {
    const API_KEY = import.meta.env.VITE_ELEVEN_LABS_API_KEY;
    if (!API_KEY || !file || !newVoiceName) return alert("Info manquante");
    setIsCloning(true);
    const fd = new FormData();
    fd.append("name", newVoiceName);
    fd.append("files", file);
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: { "xi-api-key": API_KEY },
        body: fd,
      });
      const d = (await res.json()) as AddVoiceResponse;
      if (res.ok) {
        const nv = { id: d.voice_id, name: newVoiceName };
        const nl = [...savedVoices, nv];
        setSavedVoices(nl);
        localStorage.setItem("escape_voices", JSON.stringify(nl));
        setFile(null);
        setNewVoiceName("");
        setStatus("Voix clonée");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCloning(false);
    }
  };

  const handleIaVolume = useCallback((volume: number) => {
    setIaVolume(volume);
    socket.emit("audio:volume-ia", { volume });
  }, []);

  return (
    <div className="sound-control">
      {/* VOLUME IA */}
      <section className="sc-section">
        <label className="sc-label">VOLUME IA</label>
        <div className="sc-volume-row">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={iaVolume}
            onChange={(e) => handleIaVolume(parseFloat(e.target.value))}
            className="sc-ia-volume"
          />
          <span className="sc-volume-value">{Math.round(iaVolume * 100)}%</span>
        </div>
      </section>

      {/* PRÉNOM */}
      <section className="sc-section">
        <label className="sc-label">PROTOCOLE D'ACCUEIL (API)</label>
        <div className="sc-row">
          <input
            type="text"
            value={participantName}
            onChange={(e) => setParticipantName(e.target.value)}
            placeholder="Prénom..."
            className="sc-input"
          />
          <button
            onClick={() =>
              playText(
                `Bonjour ${participantName}, je suis ARIA. Une intelligence artificielle à vos cotés. Pour vous.`
              )
            }
            disabled={isGenerating || isApiPlaying || !participantName}
            className="sc-btn"
          >
            {isGenerating ? "..." : "DIRE"}
          </button>
        </div>
      </section>

      {/* MESSAGE MANUEL */}
      <section className="sc-section">
        <label className="sc-label">MESSAGE MANUEL (API)</label>
        <div className="sc-row">
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            className="sc-textarea"
            placeholder="Message..."
          />
          <button
            onClick={() => playText(customText)}
            disabled={isGenerating || isApiPlaying || !customText}
            className="sc-btn sc-btn-tall"
          >
            {isGenerating ? "..." : "DIRE"}
          </button>
        </div>
      </section>

      {/* PROTOCOLES RAPIDES */}
      <section className="sc-section">
        <label className="sc-label">PROTOCOLES RAPIDES (OFFLINE READY)</label>
        <div className="sc-preset-grid">
          {PRESET_TEXTS.map((preset, idx) => {
            const state = presetStates[idx];
            const hasState = !!state;
            const isPlaying = state?.playing ?? false;

            return (
              <div
                key={idx}
                className={`sc-preset-wrap ${hasState ? "has-state" : ""}`}
              >
                <button
                  onClick={() => togglePreset(idx, preset.file)}
                  className={`sc-preset ${isPlaying ? "active" : ""} ${hasState && !isPlaying ? "paused" : ""}`}
                >
                  <span className="sc-preset-label">
                    {isPlaying ? "⏸" : hasState ? "▶" : ""} {preset.label}
                  </span>
                  <span className="sc-preset-content">"{preset.content}"</span>
                </button>
                {hasState && (
                  <div className="sc-timeline-wrap">
                    <input
                      type="range"
                      min="0"
                      max={state.duration || 1}
                      step="0.1"
                      value={state.currentTime}
                      onChange={(e) =>
                        seekPreset(idx, parseFloat(e.target.value))
                      }
                      className="sc-timeline"
                    />
                    <span className="sc-timeline-time">
                      {formatTime(state.currentTime)}/
                      {formatTime(state.duration)}
                    </span>
                    <button
                      className="sc-restart-btn"
                      onClick={() => {
                        seekPreset(idx, 0);
                        if (!isPlaying) {
                          socket.emit("audio:play-preset", {
                            presetIdx: idx,
                            file: preset.file,
                          });
                          setPresetStates((prev) => ({
                            ...prev,
                            [idx]: {
                              ...prev[idx],
                              playing: true,
                              currentTime: 0,
                            },
                          }));
                        }
                      }}
                      title="Rejouer depuis le début"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 2v12l10-6z" />
                        <line x1="1" y1="2" x2="1" y2="14" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* TTS STATUS */}
      {isGenerating && (
        <section className="sc-section sc-player">
          <span className="sc-transmitting">TRANSMISSION...</span>
        </section>
      )}

      {/* NOUVELLE ENTRÉE VOCALE */}
      <section className="sc-section sc-clone">
        <label className="sc-label">NOUVELLE ENTRÉE VOCALE</label>
        <div className="sc-row sc-clone-row">
          <input
            type="text"
            value={newVoiceName}
            onChange={(e) => setNewVoiceName(e.target.value)}
            className="sc-input"
            placeholder="Nom..."
          />
          {!isRecording ? (
            <button onClick={startRecording} className="sc-btn">
              REC
            </button>
          ) : (
            <button onClick={stopRecording} className="sc-btn sc-btn-recording">
              STOP
            </button>
          )}
          <input
            type="file"
            onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
            className="sc-file"
          />
          <button onClick={handleClone} disabled={isCloning} className="sc-btn">
            CLONER
          </button>
        </div>
        {status && <div className="sc-status">{status}</div>}
      </section>
    </div>
  );
}
