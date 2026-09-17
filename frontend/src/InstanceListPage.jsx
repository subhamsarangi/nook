import React, { useState, useEffect } from 'react';
import InstanceForm from './InstanceForm';
import './InstanceListPage.css';

export default function InstanceListPage({ subEntity, onBack, apiUrl }) {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingInstance, setEditingInstance] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    loadInstances();
  }, [subEntity?.id]);

  const loadInstances = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiUrl}/api/sub-entities/${subEntity.id}/instances`);

      if (!res.ok) {
        throw new Error('Failed to load instances');
      }

      const data = await res.json();
      setInstances(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Load failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (data) => {
    try {
      const res = await fetch(`${apiUrl}/api/sub-entities/${subEntity.id}/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error);
      }

      setShowCreateForm(false);
      await loadInstances();
    } catch (err) {
      setError('Create failed: ' + err.message);
    }
  };

  const handleUpdateSubmit = async (data) => {
    try {
      const res = await fetch(`${apiUrl}/api/instances/${editingInstance.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error);
      }

      setEditingInstance(null);
      await loadInstances();
    } catch (err) {
      setError('Update failed: ' + err.message);
    }
  };

  const handleDeleteClick = (instance) => {
    setDeleteConfirm(instance);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      const res = await fetch(`${apiUrl}/api/instances/${deleteConfirm.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error);
      }

      setDeleteConfirm(null);
      await loadInstances();
    } catch (err) {
      setError('Delete failed: ' + err.message);
    }
  };

  const renderFieldValue = (value, fieldName) => {
    if (value === null || value === undefined) {
      return <span style={{ color: '#ccc' }}>—</span>;
    }

    if (typeof value === 'boolean') {
      return value ? '✓' : '✗';
    }

    if (typeof value === 'object') {
      return '[Object]';
    }

    const str = String(value);
    return str.length > 50 ? str.substring(0, 50) + '...' : str;
  };

  if (loading) {
    return <div className="loading">Loading instances...</div>;
  }

  if (showCreateForm) {
    return (
      <div className="instance-list-page">
        <div className="page-header">
          <div>
            <h1>📝 New Instance</h1>
            <p className="breadcrumb">
              <a onClick={onBack}>← Back to Entities</a> / {subEntity.name}
            </p>
          </div>
        </div>

        <InstanceForm
          subEntity={subEntity}
          onSubmit={handleCreateSubmit}
          onCancel={() => setShowCreateForm(false)}
          apiUrl={apiUrl}
        />
      </div>
    );
  }

  if (editingInstance) {
    return (
      <div className="instance-list-page">
        <div className="page-header">
          <div>
            <h1>✏️ Edit Instance</h1>
            <p className="breadcrumb">
              <a onClick={onBack}>← Back to Entities</a> / {subEntity.name}
            </p>
          </div>
        </div>

        <InstanceForm
          subEntity={subEntity}
          instance={editingInstance}
          onSubmit={handleUpdateSubmit}
          onCancel={() => setEditingInstance(null)}
          apiUrl={apiUrl}
        />
      </div>
    );
  }

  return (
    <div className="instance-list-page">
      <div className="page-header">
        <div>
          <h1>📋 Instances</h1>
          <p className="breadcrumb">
            <a onClick={onBack}>← Back to Entities</a> / {subEntity.name}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => setShowCreateForm(true)}>
            + New Instance
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Delete Instance?</h2>
            <p>This action cannot be undone.</p>
            <p className="warning">If this instance contains files, they will be deleted.</p>

            <div className="modal-actions">
              <button className="btn-danger" onClick={handleConfirmDelete}>
                Delete
              </button>
              <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instances table */}
      {instances.length === 0 ? (
        <div className="empty-state">
          <p>No instances yet. Create one to get started.</p>
        </div>
      ) : (
        <table className="instance-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Data</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((instance) => (
              <tr key={instance.id}>
                <td className="cell-id" title={instance.id}>
                  {instance.id}
                </td>
                <td className="cell-data">
                  {Object.entries(instance.data)
                    .slice(0, 2)
                    .map(([key, val]) => `${key}: ${renderFieldValue(val, key)}`)
                    .join(' • ')}
                </td>
                <td className="cell-timestamp">
                  {new Date(instance.createdAt).toLocaleDateString()}
                </td>
                <td className="cell-actions">
                  <button
                    className="btn-link"
                    onClick={() => setEditingInstance(instance)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-link btn-danger"
                    onClick={() => handleDeleteClick(instance)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
