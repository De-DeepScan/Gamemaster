import React from "react";
import { useEffect, useState } from "react";
import { socket } from "../socket";

interface Camera {
  id: string;
  name: string;
  ip: string;
  status: string;
}

export function CameraDashboard() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [feeds, setFeeds] = useState<Record<string, string>>({});

  useEffect(() => {
    const onUpdate = (data: Camera[]) => setCameras(data);
    const onFeed = (data: { id: string; image: string }) => {
      setFeeds((prev) => ({ ...prev, [data.id]: data.image }));
    };

    socket.on("cameras:update", onUpdate);
    socket.on("camera:feed", onFeed);

    return () => {
      socket.off("cameras:update", onUpdate);
      socket.off("camera:feed", onFeed);
    };
  }, []);

  const sendReboot = (id: string) => {
    if (confirm("CONFIRM REMOTE REBOOT?")) {
      socket.emit("dashboard:reboot-camera", id);
    }
  };

  return (
    <div style={{ padding: "2rem", width: "100%" }}>
      <h2
        style={{
          color: "var(--color-primary)",
          borderBottom: "1px solid rgba(0,255,255,0.2)",
          paddingBottom: "1rem",
          marginBottom: "2rem",
          letterSpacing: "4px",
        }}
      >
        SURVEILLANCE GRID
      </h2>

      {cameras.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: "var(--color-text-muted)",
            marginTop: "4rem",
            letterSpacing: "2px",
          }}
        >
          {">> NO SIGNAL DETECTED <<"}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "2rem",
          }}
        >
          {cameras.map((cam) => (
            <div
              key={cam.id}
              style={{
                border: "2px solid rgba(0,255,255,0.3)",
                background: "rgba(0,0,0,0.3)",
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.5rem",
                  background: "rgba(0,255,255,0.1)",
                  borderBottom: "1px solid rgba(0,255,255,0.2)",
                  fontSize: "0.8rem",
                  fontWeight: "bold",
                }}
              >
                <span>{cam.name}</span>
                <span style={{ color: "#22c55e" }}>● LIVE</span>
              </div>
              <div
                style={{
                  aspectRatio: "4/3",
                  background: "#000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {feeds[cam.id] ? (
                  <img
                    src={feeds[cam.id]}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <span style={{ color: "#555" }}>WAITING FOR FEED...</span>
                )}
              </div>
              <div
                style={{
                  padding: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontFamily: "monospace", color: "#666" }}>
                  {cam.ip}
                </span>
                <button
                  onClick={() => sendReboot(cam.id)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--color-danger)",
                    color: "var(--color-danger)",
                    padding: "0.5rem 1rem",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    textTransform: "uppercase",
                  }}
                >
                  REBOOT
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
