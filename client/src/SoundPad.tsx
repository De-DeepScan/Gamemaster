import { useState, useCallback, useEffect } from "react";
import { socket } from "./socket";
import "./SoundPad.css";

interface SoundItem {
  id: string;
  label: string;
  file: string;
  icon: string;
}

const SOUNDS: SoundItem[] = [
  {
    id: "digital-1",
    label: "Digital 1",
    file: "digital-sound-1.mp3",
    icon: "waveform",
  },
  {
    id: "digital-2",
    label: "Digital 2",
    file: "digital-sound-2.mp3",
    icon: "circuit",
  },
  { id: "light", label: "Light", file: "light.mp3", icon: "light" },
  { id: "servers", label: "Servers", file: "servers.mp3", icon: "server" },
  { id: "space", label: "Space", file: "space.mp3", icon: "space" },
  {
    id: "energy-load",
    label: "Energy Load",
    file: "energy-load.mp3",
    icon: "energy",
  },
  {
    id: "digital-load",
    label: "Digital Load",
    file: "digital-load.mp3",
    icon: "circuit",
  },
];

function SoundIcon({ type }: { type: string }) {
  switch (type) {
    case "waveform":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <line x1="4" y1="8" x2="4" y2="16" />
          <line x1="8" y1="5" x2="8" y2="19" />
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="16" y1="5" x2="16" y2="19" />
          <line x1="20" y1="8" x2="20" y2="16" />
        </svg>
      );
    case "circuit":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <rect x="8" y="8" width="8" height="8" rx="1" />
          <line x1="12" y1="2" x2="12" y2="8" />
          <line x1="12" y1="16" x2="12" y2="22" />
          <line x1="2" y1="12" x2="8" y2="12" />
          <line x1="16" y1="12" x2="22" y2="12" />
        </svg>
      );
    case "light":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      );
    case "server":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <rect x="3" y="3" width="18" height="6" rx="1" />
          <rect x="3" y="15" width="18" height="6" rx="1" />
          <line x1="12" y1="9" x2="12" y2="15" />
          <circle cx="7" cy="6" r="0.5" fill="currentColor" />
          <circle cx="7" cy="18" r="0.5" fill="currentColor" />
        </svg>
      );
    case "space":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="9" />
          <circle cx="5" cy="5" r="0.5" fill="currentColor" />
          <circle cx="19" cy="8" r="0.5" fill="currentColor" />
          <circle cx="7" cy="18" r="0.5" fill="currentColor" />
          <circle cx="17" cy="16" r="0.5" fill="currentColor" />
        </svg>
      );
    case "energy":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    default:
      return null;
  }
}

interface ActiveSound {
  volume: number;
}

export default function SoundPad() {
  const [activeSounds, setActiveSounds] = useState<Record<string, ActiveSound>>(
    {}
  );
  const [spotifyPlaying, setSpotifyPlaying] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1);

  useEffect(() => {
    const onState = (data: { isPaused: boolean }) => {
      setSpotifyPlaying(!data.isPaused);
    };
    socket.on("spotify:state", onState);
    return () => {
      socket.off("spotify:state", onState);
    };
  }, []);

  const toggleSpotify = useCallback(() => {
    socket.emit("spotify:toggle", {});
  }, []);

  const changeMasterVolume = useCallback((vol: number) => {
    setMasterVolume(vol);
    socket.emit("audio:master-volume", { volume: vol });
  }, []);

  const toggleSound = useCallback(
    (sound: SoundItem) => {
      if (sound.id in activeSounds) {
        socket.emit("audio:stop-ambient", { soundId: sound.id });
        setActiveSounds((prev) => {
          const next = { ...prev };
          delete next[sound.id];
          return next;
        });
      } else {
        const volume = 0.5;
        socket.emit("audio:play-ambient", {
          soundId: sound.id,
          file: sound.file,
          volume,
        });
        setActiveSounds((prev) => ({
          ...prev,
          [sound.id]: { volume },
        }));
      }
    },
    [activeSounds]
  );

  const setVolume = useCallback((id: string, volume: number) => {
    socket.emit("audio:volume-ambient", { soundId: id, volume });
    setActiveSounds((prev) => ({
      ...prev,
      [id]: { ...prev[id], volume },
    }));
  }, []);

  const isActive = (id: string) => id in activeSounds;

  return (
    <div className="sound-pad">
      <div className="sp-master">
        <span className="sp-master-label">Volume general</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={masterVolume}
          onChange={(e) => changeMasterVolume(parseFloat(e.target.value))}
          className="sp-master-slider"
        />
        <span className="sp-master-value">
          {Math.round(masterVolume * 100)}%
        </span>
      </div>

      <div className="sp-grid">
        {SOUNDS.map((sound) => {
          const active = isActive(sound.id);
          const volume = activeSounds[sound.id]?.volume ?? 0.5;

          return (
            <div key={sound.id} className="sp-item">
              <button
                className={`sp-circle ${active ? "active" : ""}`}
                onClick={() => toggleSound(sound)}
              >
                <SoundIcon type={sound.icon} />
              </button>
              <span className="sp-name">{sound.label}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) =>
                  setVolume(sound.id, parseFloat(e.target.value))
                }
                className={`sp-volume ${active ? "active" : ""}`}
                disabled={!active}
              />
            </div>
          );
        })}
      </div>

      <div className="sp-spotify">
        <button
          className={`sp-circle sp-spotify-btn ${spotifyPlaying ? "active" : ""}`}
          onClick={toggleSpotify}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.24.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-.99-.12-1.11-.6-.12-.48.12-.99.6-1.11 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.21 1.17zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-.96 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.3z" />
          </svg>
        </button>
        <span className="sp-name">Spotify</span>
        <span className="sp-spotify-status">
          {spotifyPlaying ? "En lecture" : "Pause"}
        </span>
      </div>
    </div>
  );
}
