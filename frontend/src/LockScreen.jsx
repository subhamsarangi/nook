import React, { useState, useEffect } from 'react';
import './LockScreen.css';

export default function LockScreen({ onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [backoffMs, setBackoffMs] = useState(0);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Poll backoff status every 500ms
  useEffect(() => {
    const pollBackoff = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/unlock/status`);
        const data = await res.json();
        if (data.backoffActive) {
          setBackoffMs(data.backoffRemainingSec * 1000);
        } else {
          setBackoffMs(0);
        }
      } catch (err) {
        // Silent fail on poll
      }
    };

    const interval = setInterval(pollBackoff, 500);
    return () => clearInterval(interval);
  }, [apiUrl]);

  // Decrement backoff timer
  useEffect(() => {
    if (backoffMs <= 0) return;
    const timer = setTimeout(() => {
      setBackoffMs(Math.max(0, backoffMs - 1000));
    }, 1000);
    return () => clearTimeout(timer);
  }, [backoffMs]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (backoffMs > 0) {
        setError(`Too many failed attempts. Try again in ${Math.ceil(backoffMs / 1000)}s.`);
        setLoading(false);
        return;
      }

      const res = await fetch(`${apiUrl}/api/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          // Backoff error
          setBackoffMs(data.backoffMs);
          setError(data.error);
        } else {
          setError(data.error || 'Unlock failed');
        }
        setLoading(false);
        return;
      }

      // Success - clear password from state
      setPassword('');
      onUnlock();
    } catch (err) {
      setError('Network error: ' + err.message);
      setLoading(false);
    }
  };

  return (
    <div className="lock-screen">
      <div className="lock-container">
        <h1>🔐 Nook Vault</h1>
        <p className="subtitle">Enter your password to unlock</p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            disabled={loading || backoffMs > 0}
            autoFocus
            autoComplete="off"
          />

          <button
            type="submit"
            disabled={loading || backoffMs > 0}
            className={loading ? 'loading' : ''}
          >
            {loading ? 'Unlocking...' : 'Unlock'}
          </button>
        </form>

        {error && <div className="error-message">{error}</div>}
        {backoffMs > 0 && (
          <div className="backoff-message">
            Try again in {Math.ceil(backoffMs / 1000)}s
          </div>
        )}
      </div>
    </div>
  );
}
