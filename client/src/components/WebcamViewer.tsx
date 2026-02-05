import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "../socket";
import { useWebcamPopout } from "../hooks/useWebcamPopout";

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

interface CameraConfig {
  cameraId: string;
  label: string;
}

const CAMERAS: CameraConfig[] = [
  { cameraId: "labyrinthe", label: "Labyrinthe" },
  { cameraId: "infection-map", label: "Carte Infection" },
  { cameraId: "sidequest", label: "Computer Sidequest" },
];

const RETRY_DELAY_MS = 5000;

interface WebcamViewerProps {
  isPopoutMode?: boolean;
}

function CameraFeed({
  cameraId,
  label,
  online,
}: CameraConfig & { online: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState<"waiting" | "connecting" | "connected">(
    "waiting"
  );

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  const requestOffer = useCallback(() => {
    cleanup();
    setStatus("waiting");
    socket.emit("webrtc:request-offer", { cameraId });
  }, [cleanup, cameraId]);

  useEffect(() => {
    function handleOffer(data: {
      cameraId: string;
      sdp: RTCSessionDescriptionInit;
    }) {
      if (data.cameraId !== cameraId) return;

      cleanup();
      setStatus("connecting");

      const pc = new RTCPeerConnection(rtcConfig);
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setStatus("connected");
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc:ice-candidate", {
            cameraId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected" ||
          pc.connectionState === "closed"
        ) {
          setStatus("waiting");
          cleanup();
          setTimeout(requestOffer, 2000);
        }
      };

      pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        .then(() => pc.createAnswer())
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => {
          socket.emit("webrtc:answer", {
            cameraId,
            sdp: pc.localDescription,
          });
        })
        .catch((err) => {
          console.error(
            `[webrtc-viewer:${cameraId}] Failed to handle offer:`,
            err
          );
          setStatus("waiting");
          cleanup();
        });
    }

    function handleIceCandidate(data: {
      cameraId: string;
      candidate: RTCIceCandidateInit;
    }) {
      if (data.cameraId !== cameraId) return;
      if (!pcRef.current) return;
      pcRef.current
        .addIceCandidate(new RTCIceCandidate(data.candidate))
        .catch((err) =>
          console.error(
            `[webrtc-viewer:${cameraId}] Failed to add ICE candidate:`,
            err
          )
        );
    }

    socket.on("webrtc:offer", handleOffer);
    socket.on("webrtc:ice-candidate", handleIceCandidate);

    requestOffer();

    return () => {
      socket.off("webrtc:offer", handleOffer);
      socket.off("webrtc:ice-candidate", handleIceCandidate);
      cleanup();
    };
  }, [cleanup, requestOffer, cameraId]);

  // Retry automatically if online but no stream for too long
  useEffect(() => {
    if (online && status === "waiting") {
      const retryTimer = setTimeout(() => {
        console.log(`[webrtc-viewer:${cameraId}] Auto-retrying request...`);
        requestOffer();
      }, RETRY_DELAY_MS);
      return () => clearTimeout(retryTimer);
    }
  }, [online, status, cameraId, requestOffer]);

  // Listen for stream-available to request offer immediately
  useEffect(() => {
    function handleStreamAvailable(data: { cameraId: string }) {
      if (data.cameraId === cameraId && status === "waiting") {
        console.log(
          `[webrtc-viewer:${cameraId}] Stream available, requesting offer...`
        );
        requestOffer();
      }
    }
    socket.on("webrtc:stream-available", handleStreamAvailable);
    return () => {
      socket.off("webrtc:stream-available", handleStreamAvailable);
    };
  }, [cameraId, status, requestOffer]);

  return (
    <div className="camera-feed">
      <div className="camera-label">
        <span
          className={`camera-status-dot ${online ? "online" : "offline"}`}
        />
        {label}
      </div>
      <div className="camera-viewport">
        {status !== "connected" && (
          <div className="webcam-waiting">
            <div className="webcam-waiting-icon">
              {status === "waiting" ? "◉" : "◎"}
            </div>
            <p className="webcam-waiting-text">
              {status === "waiting"
                ? online
                  ? "En attente du flux..."
                  : "Camera hors ligne"
                : "Connexion en cours..."}
            </p>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`webcam-video ${status === "connected" ? "visible" : ""}`}
        />
      </div>
    </div>
  );
}

export function WebcamViewer({ isPopoutMode = false }: WebcamViewerProps) {
  const [camerasStatus, setCamerasStatus] = useState<Record<string, boolean>>(
    {}
  );
  const { isPopoutActive, openPopout, notifyPopoutClosed } = useWebcamPopout();

  useEffect(() => {
    function handleStatus(data: Record<string, boolean>) {
      setCamerasStatus(data);
    }

    socket.on("webrtc:cameras-status", handleStatus);
    return () => {
      socket.off("webrtc:cameras-status", handleStatus);
    };
  }, []);

  // Notify when popout window closes
  useEffect(() => {
    if (isPopoutMode) {
      const handleBeforeUnload = () => {
        notifyPopoutClosed();
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
        notifyPopoutClosed();
      };
    }
  }, [isPopoutMode, notifyPopoutClosed]);

  // If we're in the main window and popout is active, show placeholder
  if (!isPopoutMode && isPopoutActive) {
    return (
      <div className="webcam-grid">
        <div className="webcam-placeholder">
          <div className="webcam-placeholder-icon">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <p className="webcam-placeholder-text">
            Cameras ouvertes dans fenetre externe
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="webcam-grid">
      {/* Detach button - only show in main window, not in popout */}
      {!isPopoutMode && (
        <button className="webcam-detach-btn" onClick={openPopout}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Detacher
        </button>
      )}
      {CAMERAS.map((cam) => (
        <CameraFeed
          key={cam.cameraId}
          {...cam}
          online={camerasStatus[cam.cameraId] ?? false}
        />
      ))}
    </div>
  );
}
