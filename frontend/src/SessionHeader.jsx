import React, { useState, useEffect } from 'react';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import './SessionHeader.css';

export default function SessionHeader({ onLock, onSessionExpired }) {
  const [remainingMs, setRemainingMs] = useState(null);
  const [locked, setLocked] = useState(false);
  const [showSweepConfirm, setShowSweepConfirm] = useState(false);
  const [orphanCount, setOrphanCount] = useState(0);
  const [sweeping, setSweeping] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Poll session status every 5 seconds
  useEffect(() => {
    const pollSession = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/session/status`);
        const data = await res.json();

        setLocked(data.locked);

        if (data.locked) {
          onSessionExpired?.();
          return;
        }

        if (data.remainingMs !== null) {
          setRemainingMs(data.remainingMs);

          // If less than 30 seconds left, emit warning
          if (data.remainingMs < 30000) {
            console.warn('[session] Less than 30s remaining');
          }

          // If expired, notify
          if (data.remainingMs <= 0) {
            onSessionExpired?.();
          }
        }
      } catch (err) {
        console.error('[session-header] poll failed:', err);
      }
    };

    const interval = setInterval(pollSession, 5000);
    pollSession(); // Poll immediately on mount

    return () => clearInterval(interval);
  }, [apiUrl, onSessionExpired]);

  // Local countdown while polling
  useEffect(() => {
    if (remainingMs === null || remainingMs <= 0) return;

    const timer = setTimeout(() => {
      setRemainingMs(Math.max(0, remainingMs - 1000));
    }, 1000);

    return () => clearTimeout(timer);
  }, [remainingMs]);

  const formatTime = (ms) => {
    if (ms <= 0) return '0:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3500);
  };

  const handleCheckOrphans = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/files/orphans`);
      if (!res.ok) {
        throw new Error('Failed to check orphan files');
      }
      const data = await res.json();
      if (data.orphanCount === 0) {
        showToast('✨ Vault storage is clean! No orphaned files found.');
      } else {
        setOrphanCount(data.orphanCount);
        setShowSweepConfirm(true);
      }
    } catch (err) {
      console.error('[orphan check] failed:', err);
      showToast('❌ Failed to check orphan files: ' + err.message);
    }
  };

  const handleConfirmSweep = async () => {
    setSweeping(true);
    try {
      const res = await fetch(`${apiUrl}/api/files/sweep-orphans`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to sweep files');
      }
      const data = await res.json();
      setShowSweepConfirm(false);
      showToast(`🧹 ${data.message || `Cleaned up ${orphanCount} orphaned file(s)`}`);
    } catch (err) {
      console.error('[sweep] failed:', err);
      showToast('❌ Sweep failed: ' + err.message);
    } finally {
      setSweeping(false);
    }
  };

  const handleLock = async () => {
    try {
      await fetch(`${apiUrl}/api/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      onLock?.();
    } catch (err) {
      console.error('[session-header] lock failed:', err);
    }
  };

  if (locked) return null;

  const isWarning = remainingMs && remainingMs < 180000; // 3 minutes
  const isCritical = remainingMs && remainingMs < 60000; // 1 minute
  const timerClass = isCritical ? 'critical' : isWarning ? 'warning' : '';

  return (
    <div className="session-header">
      <h1>🔐 Nook</h1>

      <div className="session-info">
        <div className={`session-timer ${timerClass}`}>
          <span className="icon">⏱️</span>
          <span className="time-text">
            {remainingMs !== null ? formatTime(remainingMs) : '--:--'}
          </span>
        </div>

        <div className="session-actions">
          <button
            className="sweep-btn"
            onClick={handleCheckOrphans}
            title="Check and purge unreferenced encrypted files"
          >
            🧹 Sweep Orphans
          </button>
          <button className="lock-btn" onClick={handleLock}>
            Lock
          </button>
        </div>
      </div>

      <ConfirmDeleteDialog
        isOpen={showSweepConfirm}
        title={`Purge ${orphanCount} Orphaned File${orphanCount === 1 ? '' : 's'}?`}
        itemType="Orphan File"
        count={orphanCount}
        warningText="These files have no references in your database and will be permanently deleted from disk."
        confirmText={`Sweep ${orphanCount} File${orphanCount === 1 ? '' : 's'}`}
        loading={sweeping}
        onConfirm={handleConfirmSweep}
        onCancel={() => setShowSweepConfirm(false)}
      />

      {toastMessage && <div className="status-toast">{toastMessage}</div>}
    </div>
  );
}
