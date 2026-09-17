import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import LockScreen from './LockScreen';
import SessionHeader from './SessionHeader';
import HomePage from './HomePage';
import EntityDetailPage from './EntityDetailPage';
import InstanceListPage from './InstanceListPage';
import InstanceDetailPage from './InstanceDetailPage';

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
    <BrowserRouter>
      <SessionHeader onLock={() => setUnlocked(false)} onSessionExpired={handleSessionExpired} />
      <Routes>
        <Route path="/" element={<HomePage apiUrl={apiUrl} />} />
        <Route path="/entities/:entityId" element={<EntityDetailPageWrapper apiUrl={apiUrl} />} />
        <Route path="/entities/:entityId/sub-entities/:subEntityId" element={<InstanceListPageWrapper apiUrl={apiUrl} />} />
        <Route path="/entities/:entityId/sub-entities/:subEntityId/instances/:instanceId" element={<InstanceDetailPageWrapper apiUrl={apiUrl} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

// Wrapper to fetch entity and pass to EntityDetailPage
function EntityDetailPageWrapper({ apiUrl }) {
  const { entityId } = useParams();
  const navigate = useNavigate();

  return (
    <EntityDetailPage
      entityId={entityId}
      onBack={() => navigate('/')}
      apiUrl={apiUrl}
    />
  );
}

// Wrapper to fetch sub-entity and entity, pass to InstanceListPage
function InstanceListPageWrapper({ apiUrl }) {
  const { entityId, subEntityId } = useParams();
  const navigate = useNavigate();
  const [subEntity, setSubEntity] = useState(null);
  const [entity, setEntity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const subRes = await fetch(`${apiUrl}/api/sub-entities/${subEntityId}`);
        const subData = await subRes.json();
        setSubEntity(subData);

        const entRes = await fetch(`${apiUrl}/api/entities/${entityId}`);
        const entData = await entRes.json();
        setEntity(entData);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [subEntityId, entityId, apiUrl]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (!subEntity) return <div style={{ padding: '2rem', textAlign: 'center', color: '#c0392b' }}>Sub-entity not found</div>;

  return (
    <InstanceListPage
      subEntity={subEntity}
      entity={entity}
      entityId={entityId}
      onBack={() => navigate(`/entities/${entityId}`)}
      apiUrl={apiUrl}
    />
  );
}

// Wrapper to fetch instance, sub-entity, and entity for InstanceDetailPage
function InstanceDetailPageWrapper({ apiUrl }) {
  const { entityId, subEntityId, instanceId } = useParams();
  const navigate = useNavigate();
  const [instance, setInstance] = useState(null);
  const [subEntity, setSubEntity] = useState(null);
  const [entity, setEntity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const instRes = await fetch(`${apiUrl}/api/instances/${instanceId}`);
        const instData = await instRes.json();
        setInstance(instData);

        const subRes = await fetch(`${apiUrl}/api/sub-entities/${subEntityId}`);
        const subData = await subRes.json();
        setSubEntity(subData);

        const entRes = await fetch(`${apiUrl}/api/entities/${entityId}`);
        const entData = await entRes.json();
        setEntity(entData);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [instanceId, subEntityId, entityId, apiUrl]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (!instance) return <div style={{ padding: '2rem', textAlign: 'center', color: '#c0392b' }}>Instance not found</div>;

  return (
    <InstanceDetailPage
      instance={instance}
      subEntity={subEntity}
      entity={entity}
      entityId={entityId}
      subEntityId={subEntityId}
      onBack={() => navigate(`/entities/${entityId}/sub-entities/${subEntityId}`)}
      apiUrl={apiUrl}
    />
  );
}

export default App;
