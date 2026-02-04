import { useState, useEffect, useCallback } from "react";
import { socket } from "../socket";
import "./SpotifyWidget.css";

export function SpotifyWidget() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const onState = (data: { isPaused: boolean }) => {
      setIsPlaying(!data.isPaused);
    };
    socket.on("spotify:state", onState);
    return () => {
      socket.off("spotify:state", onState);
    };
  }, []);

  const toggleSpotify = useCallback(() => {
    socket.emit("spotify:toggle", {});
  }, []);

  // Show opposite icon on hover (preview of action)
  const showPlayIcon = isHovered ? isPlaying : !isPlaying;

  return (
    <button
      className={`spotify-widget ${isPlaying ? "playing" : "paused"}`}
      onClick={toggleSpotify}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={isPlaying ? "Pause Spotify" : "Play Spotify"}
    >
      {showPlayIcon ? (
        // Play icon
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      ) : (
        // Pause icon
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
        </svg>
      )}
    </button>
  );
}
