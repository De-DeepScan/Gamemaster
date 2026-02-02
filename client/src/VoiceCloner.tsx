import { useState, useRef, useEffect, type ChangeEvent } from "react";
import "./VoiceCloner.css";

// Force API URL for this component
const API_URL = "http://localhost:3000";

interface SavedVoice {
  id: string;
  name: string;
}

const PRESET_TEXTS = [
  {
    label: "Indice 1",
    content:
      "Regardez bien sous la table, il y a peut-être quelque chose de caché.",
  },
  {
    label: "Alerte Sécurité",
    content: "Attention. Violation du protocole de sécurité détectée.",
  },
  {
    label: "Temps Faible",
    content: "Il ne vous reste que cinq minutes. Faites vite.",
  },
  { label: "Erreur Code", content: "Code incorrect. Veuillez réessayer." },
  { label: "Succès", content: "Accès autorisé. Bienvenue dans le système." },
  {
    label: "Bonjour",
    content:
      "Bonjour humains. Je suis l'intelligence artificielle qui contrôle cette pièce.",
  },
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
  const [file, setFile] = useState<File | null>(null);
  const [newVoiceName, setNewVoiceName] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [customText, setCustomText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const ariaVoice = savedVoices.find((v) =>
    v.name.trim().toLowerCase().includes("aria")
  );
  const otherVoices = savedVoices.filter(
    (v) => !v.name.trim().toLowerCase().includes("aria")
  );

  useEffect(() => {
    const stored = localStorage.getItem("escape_voices");
    if (stored) setSavedVoices(JSON.parse(stored));
  }, []);

  const saveVoicesToStorage = (voices: SavedVoice[]) => {
    setSavedVoices(voices);
    localStorage.setItem("escape_voices", JSON.stringify(voices));
  };

  const deleteVoice = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedList = savedVoices.filter((v) => v.id !== id);
    saveVoicesToStorage(updatedList);
    if (selectedVoiceId === id) setSelectedVoiceId(null);
  };

  const syncVoices = async () => {
    setIsSyncing(true);
    setStatus("Recherche du système ARIA...");
    try {
      const res = await fetch(`${API_URL}/api/voices`);
      const data = await res.json();
      if (data.voices) {
        let foundAria = data.voices.find(
          (v: SavedVoice) => v.name.trim().toLowerCase() === "aria"
        );
        if (!foundAria)
          foundAria = data.voices.find((v: SavedVoice) =>
            v.name.toLowerCase().includes("aria")
          );

        if (foundAria) {
          const current = savedVoices.filter(
            (v) => !v.name.toLowerCase().includes("aria")
          );
          const newList = [...current, foundAria];
          saveVoicesToStorage(newList);
          setSelectedVoiceId(foundAria.id);
          setStatus(`Succès : Système connectée à "${foundAria.name}"`);
        } else {
          setStatus("Erreur : Aucune voix nommée 'Aria' trouvée.");
        }
      } else {
        setStatus("Erreur lors de la récupération.");
      }
    } catch (err) {
      console.error(err);
      setStatus("Erreur connexion serveur.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const recordedFile = new File([blob], "mic-record.webm", {
          type: "audio/webm",
        });
        setFile(recordedFile);
        setStatus("Enregistrement terminé !");
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setStatus("Erreur Microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleClone = async () => {
    if (!file || !newVoiceName.trim()) return alert("Fichier et Nom requis !");
    setIsCloning(true);
    setStatus("Clonage en cours...");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", newVoiceName);

    try {
      const res = await fetch(`${API_URL}/api/clone`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.voiceId) {
        setStatus(`Succès ! Voix "${newVoiceName}" ajoutée.`);
        const newVoice = { id: data.voiceId, name: newVoiceName };
        saveVoicesToStorage([...savedVoices, newVoice]);
        setSelectedVoiceId(data.voiceId);
        setNewVoiceName("");
        setFile(null);
      } else {
        setStatus("Erreur: " + data.error);
      }
    } catch (err) {
      console.error(err);
      setStatus("Erreur connexion serveur");
    } finally {
      setIsCloning(false);
    }
  };

  const playText = async (textToSpeak: string) => {
    if (!selectedVoiceId) return alert("Sélectionnez une voix !");
    if (!textToSpeak.trim()) return;
    setAudioUrl(null);
    setIsGenerating(true);
    try {
      const res = await fetch(`${API_URL}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSpeak, voiceId: selectedVoiceId }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="voice-cloner-container">
      <div className="crt-overlay"></div>
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
        <div className="panel">
          <div className="panel-header">BASE DE DONNÉES VOCALE</div>
          <div className="scrollable-content">
            {ariaVoice ? (
              <div
                onClick={() => setSelectedVoiceId(ariaVoice.id)}
                className={`voice-item ${selectedVoiceId === ariaVoice.id ? "active" : ""}`}
                style={{
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                  textAlign: "center",
                }}
              >
                <div style={{ width: "50px", height: "40px" }}>
                  <AriaMascot />
                </div>
                <div style={{ fontWeight: "bold", letterSpacing: "2px" }}>
                  {ariaVoice.name}
                </div>
                <div style={{ fontSize: "0.6rem", opacity: 0.7 }}>
                  SYSTÈME PRINCIPAL
                </div>
              </div>
            ) : (
              <div
                style={{
                  border: "1px dashed var(--color-aria-primary)",
                  padding: "15px",
                  textAlign: "center",
                  opacity: 0.6,
                  fontSize: "0.8rem",
                }}
              >
                Aria introuvable.
                <br />
                Cliquez sur Réinitialiser.
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
            {otherVoices.map((voice) => (
              <div
                key={voice.id}
                onClick={() => setSelectedVoiceId(voice.id)}
                className={`voice-item ${selectedVoiceId === voice.id ? "active" : ""}`}
              >
                <span>{voice.name}</span>
                <button
                  onClick={(e) => deleteVoice(voice.id, e)}
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

        <div className="panel" style={{ borderRight: "none" }}>
          <div className="panel-header">INTERFACE DE COMMANDE</div>
          <div
            className="scrollable-content"
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.7rem",
                  marginBottom: "5px",
                  letterSpacing: "2px",
                }}
              >
                MESSAGE PRIORITAIRE
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <textarea
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="Entrez votre message ici..."
                  className="message-box"
                />
                <button
                  onClick={() => playText(customText)}
                  disabled={isGenerating || !selectedVoiceId || !customText}
                  className="aria-btn"
                  style={{ height: "auto" }}
                >
                  {isGenerating ? "..." : "▶"}
                </button>
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.7rem",
                  marginBottom: "10px",
                  letterSpacing: "2px",
                }}
              >
                PROTOCOLES RAPIDES
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
                    onClick={() => playText(preset.content)}
                    disabled={isGenerating || !selectedVoiceId}
                    className="voice-item"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      background: "rgba(0,0,0,0.4)",
                      margin: 0,
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
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        width: "100%",
                      }}
                    >
                      "{preset.content}"
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div
              style={{
                borderTop: "1px solid var(--color-aria-primary)",
                paddingTop: "15px",
                minHeight: "40px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {isGenerating ? (
                <span style={{ animation: "blink 0.5s infinite" }}>
                  TRANSMISSION EN COURS...
                </span>
              ) : audioUrl ? (
                <audio controls src={audioUrl} autoPlay />
              ) : null}
            </div>
          </div>
        </div>
      </div>

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
              placeholder="Identifiant..."
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
                style={{
                  background: "var(--color-aria-primary)",
                  color: "#000",
                  animation: "pulse 1s infinite",
                }}
              >
                ⏹ STOP
              </button>
            )}
          </div>
          <div style={{ flexGrow: 1 }}>
            <input
              type="file"
              onChange={handleFileChange}
              accept="audio/*"
              style={{ fontSize: "0.8rem" }}
            />
          </div>
          <button
            onClick={handleClone}
            disabled={!file || isCloning}
            className="aria-btn"
          >
            INITIALISER
          </button>
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: "0.7rem",
            marginTop: "5px",
            height: "15px",
            color: "#ffff00",
          }}
        >
          {status}
        </div>
      </section>
    </div>
  );
}
