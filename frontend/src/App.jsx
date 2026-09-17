import React, { useState } from 'react';
import LockScreen from './LockScreen';
import SessionHeader from './SessionHeader';

function App() {
  const [unlocked, setUnlocked] = useState(false);

  const handleUnlock = () => {
    setUnlocked(true);
  };

  const handleSessionExpired = () => {
    setUnlocked(false);
  };

  if (!unlocked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <>
      <SessionHeader onLock={() => setUnlocked(false)} onSessionExpired={handleSessionExpired} />
      <div className="app">
        <h2>Welcome to Nook</h2>
        <p>Vault unlocked. Ready to work.</p>
      </div>
    </>
  );
}

export default App;
