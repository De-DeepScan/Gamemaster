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
  usbKeyConnected: boolean;
  onLaunchAria?: () => void;
  isAriaLaunching?: boolean;
}

export function Navbar({
  groups,
  connected,
  activeTab,
  onTabChange,
  usbKeyConnected,
  onLaunchAria,
  isAriaLaunching,
}: NavbarProps) {
  return (
    <nav className="navbar">
      {/* Launch ARIA button */}
      <div className="navbar-left">
        <button
          className={`launch-aria-btn ${isAriaLaunching ? "launching" : ""}`}
          onClick={onLaunchAria}
          disabled={isAriaLaunching}
          title="Lance l'audio ARIA, l'animation, l'affichage du mot de passe et l'infection"
        >
          <span className="launch-icon">▶</span>
          <span className="launch-text">
            {isAriaLaunching ? "Lancement..." : "Lancer ARIA"}
          </span>
        </button>
      </div>

      {/* Game status blocks - now clickable */}
      <div className="navbar-center">
        {groups
          .filter((g) => g.baseId !== "usb-key")
          .map((group) => {
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
      </div>

      {/* USB key + Server connection badges */}
      <div className="navbar-right">
        <div
          className={`server-badge ${usbKeyConnected ? "online" : "offline"}`}
          title={usbKeyConnected ? "Clé USB connectée" : "Clé USB déconnectée"}
        >
          <span className="server-dot" />
          USB
        </div>
        <div className={`server-badge ${connected ? "online" : "offline"}`}>
          <span className="server-dot" />
          {connected ? "Serveur" : "Déconnecté"}
        </div>
      </div>
    </nav>
  );
}
