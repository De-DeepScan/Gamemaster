import React from "react";
import { useEffect, useRef, useState } from "react";
import { socket } from "../socket"; //

export function CameraTransmitter() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("INITIALIZING");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isRebooting, setIsRebooting] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        // 1. Permissions
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        stream.getTracks().forEach((t) => t.stop());

        // 2. List Devices
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "videoinput"));
        setStatus("READY - WAITING FOR CONNECTION");

        // 3. Identification
        const params = new URLSearchParams(window.location.search);
        const name = params.get("name") || "Unknown Cam";

        // Register this client as a camera
        socket.io.opts.query = { type: "camera", name };
        socket.connect();

        socket.on("connect", () => setStatus("CONNECTED"));
        socket.on("disconnect", () => setStatus("DISCONNECTED"));

        socket.on("cmd:reboot", () => {
          setStatus("⚠️ REBOOTING SYSTEM ⚠️");
          setIsRebooting(true);
          setTimeout(() => window.location.reload(), 2000);
        });
      } catch (err) {
        console.error(err);
        setStatus("PERMISSION DENIED");
      }
    }
    init();

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("cmd:reboot");
    };
  }, []);

  const startStream = async (deviceId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: 320, height: 240 },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus("BROADCASTING LIVE");

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const interval = setInterval(() => {
        if (!isRebooting && videoRef.current && ctx && socket.connected) {
          canvas.width = 320;
          canvas.height = 240;
          ctx.drawImage(videoRef.current, 0, 0, 320, 240);
          const base64 = canvas.toDataURL("image/jpeg", 0.4);
          socket.emit("cam:frame", base64);
        }
      }, 150); // ~6 FPS

      return () => clearInterval(interval);

      // FIX IS HERE: We removed the (e) entirely so the linter stops complaining
    } catch {
      setStatus("ERROR STARTING STREAM");
    }
  };

  if (isRebooting) {
    return (
      <div
        style={{
          height: "100vh",
          background: "red",
          color: "black",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "2rem",
          fontWeight: "bold",
        }}
      >
        SYSTEM REBOOTING...
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "2rem",
        height: "100vh",
        background: "black",
        color: "#00ffff",
        fontFamily: "monospace",
      }}
    >
      <h1 style={{ borderBottom: "1px solid #00ffff", paddingBottom: "1rem" }}>
        /// DEEPSCAN TRANSMITTER ///
      </h1>
      <h3>STATUS: {status}</h3>

      <select
        onChange={(e) => startStream(e.target.value)}
        style={{
          padding: "10px",
          background: "#111",
          color: "#00ffff",
          border: "1px solid #00ffff",
          width: "100%",
          marginBottom: "20px",
        }}
      >
        <option value="">-- SELECT SOURCE --</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || d.deviceId.slice(0, 8)}
          </option>
        ))}
      </select>

      <div style={{ border: "2px solid #00ffff", display: "inline-block" }}>
        <video ref={videoRef} autoPlay playsInline muted width="320" />
      </div>
    </div>
  );
}
