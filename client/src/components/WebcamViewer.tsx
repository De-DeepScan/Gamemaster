import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "../socket";

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

function CameraFeed({ cameraId, label }: CameraConfig) {
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

  return (
    <div className="camera-feed">
      <div className="camera-label">{label}</div>
      <div className="camera-viewport">
        {status !== "connected" && (
          <div className="webcam-waiting">
            <div className="webcam-waiting-icon">
              {status === "waiting" ? "◉" : "◎"}
            </div>
            <p className="webcam-waiting-text">
              {status === "waiting"
                ? "En attente de connexion..."
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

export function WebcamViewer() {
  return (
    <div className="webcam-grid">
      {CAMERAS.map((cam) => (
        <CameraFeed key={cam.cameraId} {...cam} />
      ))}
    </div>
  );
}
