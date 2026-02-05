import { useState, useEffect, useCallback, useRef } from "react";
import { socket } from "../socket";

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

const STORAGE_KEY = "escape_voices";

export function useTTS(voiceName: string = "aria") {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const voiceNameRef = useRef(voiceName);
  voiceNameRef.current = voiceName;

  const matchVoice = useCallback(
    (name: string) =>
      name.trim().toLowerCase().includes(voiceNameRef.current.toLowerCase()),
    []
  );

  // Load saved voice on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const voices = JSON.parse(stored) as { id: string; name: string }[];
        const found = voices.find((v) => matchVoice(v.name));
        if (found) setVoiceId(found.id);
      } catch {
        /* ignore */
      }
    }
  }, [voiceName, matchVoice]);

  const syncVoice = useCallback(async () => {
    const API_KEY = import.meta.env.VITE_ELEVEN_LABS_API_KEY;
    if (!API_KEY) return;
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": API_KEY },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          voices: { voice_id: string; name: string }[];
        };
        // Store all voices for reuse
        const allVoices = data.voices.map((v) => ({
          id: v.voice_id,
          name: v.name,
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allVoices));

        const found = data.voices.find((v) => matchVoice(v.name));
        if (found) {
          setVoiceId(found.voice_id);
        }
      }
    } catch (err) {
      console.error("Voice sync error:", err);
    }
  }, [matchVoice]);

  const playText = useCallback(
    async (text: string) => {
      if (isPlaying || isGenerating) return;
      const API_KEY = import.meta.env.VITE_ELEVEN_LABS_API_KEY;
      if (!API_KEY) return;

      let currentVoiceId = voiceId;
      if (!currentVoiceId) {
        await syncVoice();
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            const voices = JSON.parse(stored) as {
              id: string;
              name: string;
            }[];
            const found = voices.find((v) => matchVoice(v.name));
            if (found) currentVoiceId = found.id;
          } catch {
            /* ignore */
          }
        }
        if (!currentVoiceId) return;
      }

      if (!text.trim()) return;

      setIsGenerating(true);
      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${currentVoiceId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "xi-api-key": API_KEY,
            },
            body: JSON.stringify({
              text,
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                speed: 0.85,
              },
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
          setIsPlaying(true);
          setTimeout(() => setIsPlaying(false), 5000);
        }
      } catch (err) {
        console.error("TTS error:", err);
      } finally {
        setIsGenerating(false);
      }
    },
    [isPlaying, isGenerating, voiceId, syncVoice, matchVoice]
  );

  return {
    playText,
    isGenerating,
    isPlaying,
    isBusy: isGenerating || isPlaying,
  };
}
