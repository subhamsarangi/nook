import React, { useEffect } from 'react';
import './ConfirmDeleteDialog.css';

export default function ConfirmDeleteDialog({
  isOpen,
  title,
  itemType = 'Item',
  itemName,
  count = 1,
  cascadeInfo = null,
  loading = false,
  error = '',
  warningText = 'This action cannot be undone.',
  confirmText,
  onConfirm,
  onCancel,
}) {
  // Close on Escape key press if not loading
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) {
        onCancel?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  const isBulk = count > 1;
  const displayTitle =
    title ||
    (isBulk
      ? `Delete ${count} ${itemType}s?`
      : `Delete ${itemType}${itemName ? ` "${itemName}"` : ''}?`);

  const defaultButtonLabel = isBulk ? `Delete ${count} ${itemType}s` : 'Delete';
  const buttonLabel = confirmText || defaultButtonLabel;

  // Check if there are cascade items
  const hasCascadeImpact =
    cascadeInfo &&
    ((cascadeInfo.subEntities && cascadeInfo.subEntities > 0) ||
      (cascadeInfo.instances && cascadeInfo.instances > 0) ||
      (cascadeInfo.files && cascadeInfo.files > 0));

  return (
    <div
      className="confirm-dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onCancel?.();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="confirm-dialog-card">
        <div className="confirm-dialog-header">
          <span className="dialog-icon" role="img" aria-label="warning">
            ⚠️
          </span>
          <h2 id="confirm-dialog-title">{displayTitle}</h2>
        </div>

        <div className="confirm-dialog-body">
          <p>
            Are you sure you want to delete{' '}
            {isBulk ? (
              <span className="target-highlight">
                these {count} {itemType.toLowerCase()}s
              </span>
            ) : itemName ? (
              <span className="target-highlight">"{itemName}"</span>
            ) : (
              <span className="target-highlight">this {itemType.toLowerCase()}</span>
            )}
            ?
          </p>

          {/* Loading cascade details */}
          {loading && !cascadeInfo && (
            <div className="confirm-dialog-loading">
              <div className="confirm-dialog-spinner" />
              <span>Calculating cascade impact...</span>
            </div>
          )}

          {/* Cascade impact details */}
          {hasCascadeImpact && (
            <div className="confirm-dialog-cascade">
              <p>This will also permanently delete:</p>
              <ul>
                {cascadeInfo.subEntities > 0 && (
                  <li>
                    <strong>{cascadeInfo.subEntities}</strong> sub-entit{cascadeInfo.subEntities === 1 ? 'y' : 'ies'}
                  </li>
                )}
                {cascadeInfo.instances > 0 && (
                  <li>
                    <strong>{cascadeInfo.instances}</strong> instance{cascadeInfo.instances === 1 ? '' : 's'}
                  </li>
                )}
                {cascadeInfo.files > 0 && (
                  <li>
                    <strong>{cascadeInfo.files}</strong> associated encrypted file{cascadeInfo.files === 1 ? '' : 's'}
                  </li>
                )}
              </ul>
            </div>
          )}

          {error && <div className="confirm-dialog-error">{error}</div>}

          <div className="confirm-dialog-warning">
            <span>🚨</span>
            <span>{warningText}</span>
          </div>
        </div>

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="confirm-dialog-btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-dialog-btn-danger"
            onClick={onConfirm}
            disabled={loading || Boolean(error && error.toLowerCase().includes('cannot delete'))}
          >
            {loading ? 'Deleting...' : buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
