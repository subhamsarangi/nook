import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import './HomePage.css';

export default function HomePage() {
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [cascadeInfo, setCascadeInfo] = useState(null);
  const [selectedEntityIds, setSelectedEntityIds] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkCascadeInfo, setBulkCascadeInfo] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const navigate = useNavigate();

  // Load entities on mount
  useEffect(() => {
    loadEntities();
  }, []);

  const loadEntities = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/entities`);
      const data = await res.json();
      setEntities(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Failed to load entities: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('Entity name required');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setFormName('');
      setFormDesc('');
      setShowCreateForm(false);
      await loadEntities();
    } catch (err) {
      setError('Create failed: ' + err.message);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('Entity name required');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/entities/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setEditingId(null);
      setFormName('');
      setFormDesc('');
      await loadEntities();
    } catch (err) {
      setError('Update failed: ' + err.message);
    }
  };

  const handleDeleteClick = async (id) => {
    setDeleteConfirm(id);
    setDeleting(true);
    try {
      const res = await fetch(`${apiUrl}/api/entities/${id}/cascade-count`);
      const data = await res.json();
      setCascadeInfo(data);
    } catch (err) {
      setError('Failed to load delete info: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiUrl}/api/entities/${deleteConfirm}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      if (editingId === deleteConfirm) {
        setEditingId(null);
        setFormName('');
        setFormDesc('');
      }

      setDeleteConfirm(null);
      setCascadeInfo(null);
      await loadEntities();
    } catch (err) {
      setError('Delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = (entity) => {
    setEditingId(entity.id);
    setFormName(entity.name);
    setFormDesc(entity.description || '');
    setShowCreateForm(false);
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowCreateForm(false);
    setFormName('');
    setFormDesc('');
    setError('');
  };

  const toggleSelectEntity = (entityId) => {
    const newSelected = new Set(selectedEntityIds);
    if (newSelected.has(entityId)) {
      newSelected.delete(entityId);
    } else {
      newSelected.add(entityId);
    }
    setSelectedEntityIds(newSelected);
  };

  const toggleSelectAllEntities = () => {
    if (selectedEntityIds.size === entities.length) {
      setSelectedEntityIds(new Set());
    } else {
      setSelectedEntityIds(new Set(entities.map((e) => e.id)));
    }
  };

  const handleBulkDeleteEntitiesClick = async () => {
    if (selectedEntityIds.size === 0) return;
    setBulkDeleteConfirm(true);
    setDeleting(true);
    try {
      // Load cascade info for all selected
      const cascadePromises = Array.from(selectedEntityIds).map((id) =>
        fetch(`${apiUrl}/api/entities/${id}/cascade-count`).then((r) => r.json())
      );
      const cascadeData = await Promise.all(cascadePromises);
      const totalSubEntities = cascadeData.reduce((sum, c) => sum + (c.subEntities || 0), 0);
      const totalInstances = cascadeData.reduce((sum, c) => sum + (c.instances || 0), 0);
      const totalFiles = cascadeData.reduce((sum, c) => sum + (c.files || 0), 0);

      setBulkCascadeInfo({
        count: selectedEntityIds.size,
        subEntities: totalSubEntities,
        instances: totalInstances,
        files: totalFiles,
      });
    } catch (err) {
      setError('Failed to load delete info: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmBulkDeleteEntities = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${apiUrl}/api/bulk-delete-entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityIds: Array.from(selectedEntityIds) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }

      if (editingId && selectedEntityIds.has(editingId)) {
        setEditingId(null);
        setFormName('');
        setFormDesc('');
      }

      setBulkDeleteConfirm(false);
      setBulkCascadeInfo(null);
      setSelectedEntityIds(new Set());
      await loadEntities();
    } catch (err) {
      setError('Bulk delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="home-page">
      <div className="page-header">
        <h1>📚 Entities</h1>
        {!showCreateForm && !editingId && (
          <div className="header-actions">
            <button className="btn-primary" onClick={() => setShowCreateForm(true)}>
              + New Entity
            </button>
          </div>
        )}
      </div>

      {!deleteConfirm && !bulkDeleteConfirm && error && <div className="error-banner">{error}</div>}

      {/* Create/Edit Form */}
      {(showCreateForm || editingId) && (
        <div className="form-container">
          <form onSubmit={editingId ? handleUpdate : handleCreate}>
            <h2>{editingId ? 'Edit Entity' : 'Create Entity'}</h2>

            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Entity name"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Description (optional)</label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Description"
                rows={3}
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingId ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
              {editingId && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => handleDeleteClick(editingId)}
                >
                  🗑️ Delete
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Bulk delete confirmation */}
      <ConfirmDeleteDialog
        isOpen={bulkDeleteConfirm}
        itemType="Entity"
        count={selectedEntityIds.size}
        cascadeInfo={bulkCascadeInfo}
        loading={deleting}
        onConfirm={handleConfirmBulkDeleteEntities}
        onCancel={() => {
          setBulkDeleteConfirm(false);
          setBulkCascadeInfo(null);
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        isOpen={!!deleteConfirm}
        itemType="Entity"
        itemName={entities.find((e) => e.id === deleteConfirm)?.name}
        cascadeInfo={cascadeInfo}
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirm(null);
          setCascadeInfo(null);
        }}
      />

      {/* Entity List */}
      {loading ? (
        <div className="loading">Loading entities...</div>
      ) : entities.length === 0 ? (
        <div className="empty-state">
          <p>No entities yet. Create one to get started.</p>
        </div>
      ) : (
        <>
          {selectedEntityIds.size > 0 && (
            <div className="bulk-action-bar">
              <p>{selectedEntityIds.size} selected</p>
              <button className="btn-danger" onClick={handleBulkDeleteEntitiesClick}>
                🗑️ Delete Selected
              </button>
            </div>
          )}

          <div className="entity-list">
            {entities.map((entity) => (
              <div key={entity.id} className={`entity-card ${selectedEntityIds.has(entity.id) ? 'card-selected' : ''}`}>
                <input
                  type="checkbox"
                  className="entity-checkbox"
                  checked={selectedEntityIds.has(entity.id)}
                  onChange={() => toggleSelectEntity(entity.id)}
                />

                <div className="entity-info">
                  <h3>{entity.name}</h3>
                  {entity.description && <p className="description">{entity.description}</p>}
                  <small className="timestamp">Created {new Date(entity.createdAt).toLocaleDateString()}</small>
                </div>

                <div className="entity-actions">
                  <button className="btn-link" onClick={() => navigate(`/entities/${entity.id}`)}>
                    View
                  </button>
                  <button className="btn-link" onClick={() => handleEdit(entity)}>
                    Edit
                  </button>

                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
