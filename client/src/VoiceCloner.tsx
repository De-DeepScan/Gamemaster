import { useState, useEffect, useRef } from "react";
import "./VoiceCloner.css";

// --- STRICT INTERFACES (No 'any' allowed) ---
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
  // We don't need other properties, but this avoids strict errors
}

interface VoiceResponse {
  voices: ElevenLabsVoice[];
}

interface AddVoiceResponse {
  voice_id: string;
}

// --- CONFIGURATION ---
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
];

function AriaMascot() {
  return (
    <svg
      viewBox="0 0 200 180"
      className="aria-cat-svg"
      style={{ width: "100%", height: "100%" }}
    >
      <path
        d="M 35 110 L 30 35 L 65 75 Q 100 55, 135 75 L 170 35 L 165 110 C 175 140, 145 175, 100 175 C 55 175, 25 140, 35 110 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g className="eye-group">
        <path
          d="M 55 115 Q 65 100, 100 85 Q 135 100, 145 115 Q 135 130, 100 145 Q 65 130, 55 115 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <line
          x1="100"
          y1="95"
          x2="100"
          y2="135"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="eye-pupil"
        />
      </g>
      <line
        x1="0"
        y1="100"
        x2="45"
        y2="115"
        stroke="currentColor"
        strokeWidth="2"
        className="whisker"
      />
      <line
        x1="-5"
        y1="120"
        x2="45"
        y2="125"
        stroke="currentColor"
        strokeWidth="2"
        className="whisker"
      />
      <line
        x1="0"
        y1="140"
        x2="45"
        y2="135"
        stroke="currentColor"
        strokeWidth="2"
        className="whisker"
      />
      <line
        x1="155"
        y1="115"
        x2="200"
        y2="100"
        stroke="currentColor"
        strokeWidth="2"
        className="whisker"
      />
      <line
        x1="155"
        y1="125"
        x2="205"
        y2="120"
        stroke="currentColor"
        strokeWidth="2"
        className="whisker"
      />
      <line
        x1="155"
        y1="135"
        x2="200"
        y2="140"
        stroke="currentColor"
        strokeWidth="2"
        className="whisker"
      />
    </svg>
  );
}

export default function VoiceCloner() {
  const [savedVoices, setSavedVoices] = useState<SavedVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);

  // Custom Text State
  const [customText, setCustomText] = useState("");
  const [participantName, setParticipantName] = useState("");

  // Status State
  const [status, setStatus] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Lock State
  const [isPlaying, setIsPlaying] = useState(false);

  // File Upload State
  const [file, setFile] = useState<File | null>(null);
  const [newVoiceName, setNewVoiceName] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Init
  useEffect(() => {
    const stored = localStorage.getItem("escape_voices");
    if (stored) setSavedVoices(JSON.parse(stored));
  }, []);

  const ariaVoice = savedVoices.find((v) =>
    v.name.trim().toLowerCase().includes("aria")
  );
  const otherVoices = savedVoices.filter(
    (v) => !v.name.trim().toLowerCase().includes("aria")
  );

  // --- LOCAL AUDIO PLAYER ---
  const playLocalPreset = (filename: string) => {
    if (isPlaying) return;

    setAudioUrl(null);
    setIsPlaying(true);

    const path = `/presets/${filename}`;
    const audio = new Audio(path);

    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => {
      console.error("Local play error");
      setIsPlaying(false);
      alert(`Fichier introuvable: ${path}`);
    };

    audio.play().catch((err) => {
      console.error("Play prevented:", err);
      setIsPlaying(false);
    });
  };

  // --- API FUNCTIONS ---
  const syncVoices = async () => {
    const API_KEY = import.meta.env.VITE_ELEVEN_LABS_API_KEY;
    if (!API_KEY) return setStatus("Erreur: API Key manquante");
    setIsSyncing(true);
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": API_KEY },
      });

      // STRICT TYPING HERE: We tell TS exactly what 'data' is
      const data = (await res.json()) as VoiceResponse;

      if (data.voices) {
        // No explicit type needed for 'v' now, TS knows it is ElevenLabsVoice
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
          setStatus("Système ARIA connecté.");
        }
      }
    } catch (err) {
      console.error(err);
      setStatus("Erreur Sync.");
    } finally {
      setIsSyncing(false);
    }
  };

  const playText = async (text: string) => {
    if (isPlaying) return;

    const API_KEY = import.meta.env.VITE_ELEVEN_LABS_API_KEY;
    if (!API_KEY) return alert("API Key manquante");
    if (!selectedVoiceId) return alert("Sélectionnez une voix");
    if (!text) return;

    setAudioUrl(null);
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
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setIsPlaying(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- CLONING LOGIC ---
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

      // STRICT TYPING HERE TOO
      const d = (await res.json()) as AddVoiceResponse;

      if (res.ok) {
        const nv = { id: d.voice_id, name: newVoiceName };
        const nl = [...savedVoices, nv];
        setSavedVoices(nl);
        localStorage.setItem("escape_voices", JSON.stringify(nl));
        setFile(null);
        setNewVoiceName("");
        setStatus("Voix clonée !");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <div className="voice-cloner-container">
      <div className="crt-overlay"></div>

      {/* HEADER */}
      <header className="aria-header">
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ width: "60px", height: "50px" }}>
            <AriaMascot />
          </div>
          <div>
            <div className="header-title">AUDIO CONTROL</div>
            <div
              style={{ fontSize: "0.7rem", opacity: 0.7, letterSpacing: "2px" }}
            >
              SYSTEM: ONLINE
            </div>
          </div>
        </div>
        <button onClick={syncVoices} disabled={isSyncing} className="aria-btn">
          {isSyncing ? "..." : "↻ RÉINITIALISER VOIX ARIA"}
        </button>
      </header>

      <div className="cloner-grid">
        {/* LEFT PANEL: VOICES */}
        <div className="panel">
          <div className="panel-header">BASE DE DONNÉES VOCALE</div>
          <div className="scrollable-content">
            {ariaVoice ? (
              <div
                onClick={() => setSelectedVoiceId(ariaVoice.id)}
                className={`voice-item ${selectedVoiceId === ariaVoice.id ? "active" : ""}`}
                style={{
                  flexDirection: "column",
                  textAlign: "center",
                  alignItems: "center",
                }}
              >
                <div style={{ width: "50px", height: "40px" }}>
                  <AriaMascot />
                </div>
                <div style={{ fontWeight: "bold" }}>{ariaVoice.name}</div>
                <div style={{ fontSize: "0.6rem" }}>PRINCIPAL</div>
              </div>
            ) : (
              <div
                style={{ padding: "20px", textAlign: "center", opacity: 0.5 }}
              >
                Aria non trouvée
              </div>
            )}

            <div
              style={{
                height: "1px",
                background: "var(--color-aria-primary)",
                margin: "20px 0",
                opacity: 0.3,
              }}
            ></div>

            {otherVoices.map((v) => (
              <div
                key={v.id}
                onClick={() => setSelectedVoiceId(v.id)}
                className={`voice-item ${selectedVoiceId === v.id ? "active" : ""}`}
              >
                <span>{v.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const nl = savedVoices.filter((i) => i.id !== v.id);
                    setSavedVoices(nl);
                    localStorage.setItem("escape_voices", JSON.stringify(nl));
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT PANEL: CONTROLS */}
        <div className="panel" style={{ borderRight: "none" }}>
          <div className="panel-header">INTERFACE DE COMMANDE</div>
          <div
            className="scrollable-content"
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            {/* DYNAMIC NAME (Still API) */}
            <div>
              <div
                style={{
                  fontSize: "0.7rem",
                  marginBottom: "5px",
                  letterSpacing: "2px",
                }}
              >
                PROTOCOLE D'ACCUEIL (API)
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  type="text"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  placeholder="Prénom..."
                  className="input-line"
                  style={{ flexGrow: 1 }}
                />
                <button
                  onClick={() =>
                    playText(
                      `Bonjour ${participantName}, je suis ARIA. Une intelligence artificielle à vos cotés. Pour vous.`
                    )
                  }
                  disabled={isGenerating || isPlaying || !participantName}
                  className="aria-btn"
                  style={{ whiteSpace: "nowrap", opacity: isPlaying ? 0.5 : 1 }}
                >
                  {isGenerating ? "..." : "► DIRE"}
                </button>
              </div>
            </div>

            {/* MANUAL (Still API) */}
            <div>
              <div
                style={{
                  fontSize: "0.7rem",
                  marginBottom: "5px",
                  letterSpacing: "2px",
                }}
              >
                MESSAGE MANUEL (API)
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <textarea
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="message-box"
                  placeholder="Message..."
                />
                <button
                  onClick={() => playText(customText)}
                  disabled={isGenerating || isPlaying || !customText}
                  className="aria-btn"
                  style={{ height: "auto", opacity: isPlaying ? 0.5 : 1 }}
                >
                  {isGenerating ? "..." : "▶"}
                </button>
              </div>
            </div>

            {/* PRESETS (LOCAL FILE FAILSAFE) */}
            <div>
              <div
                style={{
                  fontSize: "0.7rem",
                  marginBottom: "10px",
                  letterSpacing: "2px",
                }}
              >
                PROTOCOLES RAPIDES (OFFLINE READY)
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                {PRESET_TEXTS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => playLocalPreset(preset.file)}
                    disabled={isPlaying}
                    className="voice-item"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      background: "rgba(0,0,0,0.4)",
                      margin: 0,
                      opacity: isPlaying ? 0.5 : 1,
                      cursor: isPlaying ? "not-allowed" : "pointer",
                    }}
                  >
                    <span style={{ fontWeight: "bold", color: "#fff" }}>
                      {preset.label}
                    </span>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        opacity: 0.6,
                        marginTop: "5px",
                        fontStyle: "italic",
                      }}
                    >
                      "{preset.content}"
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* PLAYER (For API Audio) */}
            <div
              style={{
                borderTop: "1px solid var(--color-aria-primary)",
                paddingTop: "15px",
                minHeight: "40px",
                display: "flex",
                justifyContent: "center",
              }}
            >
              {isGenerating ? (
                <span style={{ animation: "blink 0.5s infinite" }}>
                  TRANSMISSION...
                </span>
              ) : audioUrl ? (
                <audio
                  controls
                  src={audioUrl}
                  autoPlay
                  onEnded={() => setIsPlaying(false)}
                  onError={() => setIsPlaying(false)}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER: CLONER */}
      <section className="creator-section">
        <div style={{ fontSize: "0.7rem", opacity: 0.7, marginBottom: "10px" }}>
          NOUVELLE ENTRÉE VOCALE
        </div>
        <div style={{ display: "flex", gap: "20px", alignItems: "end" }}>
          <div style={{ flexGrow: 1 }}>
            <input
              type="text"
              value={newVoiceName}
              onChange={(e) => setNewVoiceName(e.target.value)}
              className="input-line"
              placeholder="Nom..."
            />
          </div>
          <div>
            {!isRecording ? (
              <button onClick={startRecording} className="aria-btn">
                🎤 REC
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="aria-btn"
                style={{ background: "cyan", color: "black" }}
              >
                ⏹ STOP
              </button>
            )}
          </div>
          <div style={{ flexGrow: 1 }}>
            <input
              type="file"
              onChange={(e) =>
                setFile(e.target.files ? e.target.files[0] : null)
              }
              style={{ fontSize: "0.8rem" }}
            />
          </div>
          <button
            onClick={handleClone}
            disabled={isCloning}
            className="aria-btn"
          >
            CLONER
          </button>
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: "0.7rem",
            color: "yellow",
            marginTop: "5px",
            height: "15px",
          }}
        >
          {status}
        </div>
      </section>
    </div>
  );
}
