import React, { useState } from 'react';
import LockScreen from './LockScreen';
import SessionHeader from './SessionHeader';
import HomePage from './HomePage';

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
      <HomePage />
    </>
  );
}

export default App;
