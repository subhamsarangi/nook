import React, { useState, useEffect } from 'react';
import LockScreen from './LockScreen';
import SessionHeader from './SessionHeader';
import HomePage from './HomePage';

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // On mount, check if backend session is still active
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/session/status`);
        const data = await res.json();
        if (!data.locked) {
          setUnlocked(true);
        }
      } catch (err) {
        // Backend unreachable, stay locked
        console.warn('Could not check session status:', err.message);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, [apiUrl]);

  const handleUnlock = () => {
    setUnlocked(true);
  };

  const handleSessionExpired = () => {
    setUnlocked(false);
  };

  // Show loading while checking session status
  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#999' }}>Restoring session...</div>;
  }

  if (!unlocked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <>
      <SessionHeader onLock={() => setUnlocked(false)} onSessionExpired={handleSessionExpired} />
      <HomePage />
    </>
  );
}

export default App;
