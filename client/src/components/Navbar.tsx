interface GameGroup {
  baseId: string;
  displayName: string;
  instances: { status: string }[];
  expectedInstances: unknown[];
  groupStatus: "connected" | "reconnecting" | "not_started";
}

interface NavbarProps {
  groups: GameGroup[];
  connected: boolean;
  activeTab: string | null;
  onTabChange: (baseId: string) => void;
}

export function Navbar({
  groups,
  connected,
  activeTab,
  onTabChange,
}: NavbarProps) {
  return (
    <nav className="navbar">
      <div className="navbar-left">
        {/* Logo ARIA - SVG mini */}
        <svg viewBox="0 0 200 180" className="aria-logo-mini">
          {/* Tête simplifiée */}
          <path
            d="M 35 110 L 30 35 L 65 75 Q 100 55, 135 75 L 170 35 L 165 110 C 175 140, 145 175, 100 175 C 55 175, 25 140, 35 110 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Œil simplifié */}
          <path
            d="M 55 115 Q 65 100, 100 85 Q 135 100, 145 115 Q 135 130, 100 145 Q 65 130, 55 115 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Pupille */}
          <line
            x1="100"
            y1="95"
            x2="100"
            y2="135"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="logo-pupil"
          />
          {/* Moustaches gauche */}
          <line
            x1="0"
            y1="100"
            x2="45"
            y2="115"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="-5"
            y1="120"
            x2="45"
            y2="125"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="0"
            y1="140"
            x2="45"
            y2="135"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Moustaches droite */}
          <line
            x1="155"
            y1="115"
            x2="200"
            y2="100"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="155"
            y1="125"
            x2="205"
            y2="120"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="155"
            y1="135"
            x2="200"
            y2="140"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        <h1 className="navbar-title">Game Control</h1>
      </div>

      {/* Game status blocks - now clickable */}
      <div className="navbar-center">
        {groups.map((group) => {
          const connectedCount = group.instances.filter(
            (i) => i.status === "connected"
          ).length;
          const isActive = activeTab === group.baseId;
          return (
            <button
              key={group.baseId}
              className={`game-status-block ${group.groupStatus} ${isActive ? "active" : ""}`}
              onClick={() => onTabChange(group.baseId)}
            >
              <span className={`status-dot ${group.groupStatus}`} />
              <span className="game-name">{group.displayName}</span>
              <span className="game-count">
                {connectedCount}/{group.expectedInstances.length}
              </span>
            </button>
          );
        })}

        {/* Controle Audio Tab */}
        <button
          className={`game-status-block sound-tab ${activeTab === "sound_control" ? "active" : ""}`}
          onClick={() => onTabChange("sound_control")}
        >
          <span className="status-dot sound-dot" />
          <span className="game-name">Controle Audio</span>
        </button>

        {/* Webcam Tab */}
        <button
          className={`game-status-block webcam-tab ${activeTab === "webcam" ? "active" : ""}`}
          onClick={() => onTabChange("webcam")}
        >
          <span className="status-dot webcam-dot" />
          <span className="game-name">Webcam</span>
        </button>
      </div>

      {/* Server connection badge */}
      <div className="navbar-right">
        <div className={`server-badge ${connected ? "online" : "offline"}`}>
          <span className="server-dot" />
          {connected ? "Serveur" : "Déconnecté"}
        </div>
      </div>
    </nav>
  );
}
