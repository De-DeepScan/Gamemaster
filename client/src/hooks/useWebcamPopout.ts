import { useState, useEffect, useRef, useCallback } from "react";

const CHANNEL_NAME = "webcam-popout-state";

interface PopoutMessage {
  type: "popout-opened" | "popout-closed";
}

export function useWebcamPopout() {
  const [isPopoutActive, setIsPopoutActive] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const popoutWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<PopoutMessage>) => {
      if (event.data.type === "popout-opened") {
        setIsPopoutActive(true);
      } else if (event.data.type === "popout-closed") {
        setIsPopoutActive(false);
      }
    };

    return () => channel.close();
  }, []);

  const openPopout = useCallback(() => {
    const popup = window.open(
      window.location.origin + "?popout=webcams",
      "webcam-popout",
      "width=400,height=900,resizable=yes"
    );
    popoutWindowRef.current = popup;
    channelRef.current?.postMessage({ type: "popout-opened" });
    setIsPopoutActive(true);
  }, []);

  const notifyPopoutClosed = useCallback(() => {
    channelRef.current?.postMessage({ type: "popout-closed" });
  }, []);

  return { isPopoutActive, openPopout, notifyPopoutClosed };
}
