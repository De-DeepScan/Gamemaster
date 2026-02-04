import { useEffect, useRef } from "react";

export interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: "connection" | "action" | "error" | "state_change" | "audio";
  message: string;
  gameId?: string;
  status?: "success" | "error" | "info";
}

interface EventTimelineProps {
  events: TimelineEvent[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new event
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const formatTime = (date: Date) => {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const getStatusIcon = (event: TimelineEvent) => {
    if (event.status === "success") return "✓";
    if (event.status === "error") return "✕";
    return "●";
  };

  const getStatusClass = (event: TimelineEvent) => {
    if (event.status === "success") return "success";
    if (event.status === "error") return "error";
    if (event.type === "connection") return "connection";
    if (event.type === "audio") return "audio";
    return "info";
  };

  return (
    <aside className="event-timeline">
      <header className="timeline-header">
        <h2 className="timeline-title">Timeline / Events</h2>
      </header>
      <div className="timeline-events" ref={scrollRef}>
        {events.length === 0 ? (
          <div className="timeline-empty">
            <span className="empty-message">En attente d'événements...</span>
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className={`timeline-event ${getStatusClass(event)}`}
            >
              <span className="event-time">{formatTime(event.timestamp)}</span>
              <span className="event-icon">{getStatusIcon(event)}</span>
              <span className="event-message">{event.message}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
