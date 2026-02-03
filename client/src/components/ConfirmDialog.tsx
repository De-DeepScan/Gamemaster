interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "warning" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "warning",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const icon = variant === "danger" ? "🔄" : "⚠️";

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div
        className={`dialog-box ${variant}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-icon">{icon}</div>
        <h3 className="dialog-title">{title}</h3>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button className="dialog-btn cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="dialog-btn confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
