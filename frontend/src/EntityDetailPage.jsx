import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SchemaBuilder from './SchemaBuilder';
import './EntityDetailPage.css';

export default function EntityDetailPage({ entityId, onBack }) {
  const [entity, setEntity] = useState(null);
  const [subEntities, setSubEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [cascadeInfo, setCascadeInfo] = useState(null);
  const [displayMode, setDisplayMode] = useState('list'); // 'list' or 'gallery' stub
  const [selectedSubEntityForSchema, setSelectedSubEntityForSchema] = useState(null);
  const [selectedSubEntityIds, setSelectedSubEntityIds] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkCascadeInfo, setBulkCascadeInfo] = useState(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, [entityId]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      // Load entity
      const entityRes = await fetch(`${apiUrl}/api/entities/${entityId}`);
      const entityData = await entityRes.json();
      setEntity(entityData);

      // Load sub-entities
      const subRes = await fetch(`${apiUrl}/api/entities/${entityId}/sub-entities`);
      const subData = await subRes.json();
      setSubEntities(Array.isArray(subData) ? subData : []);
    } catch (err) {
      setError('Failed to load data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('Sub-entity name required');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/entities/${entityId}/sub-entities`, {
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
      await loadData();
    } catch (err) {
      setError('Create failed: ' + err.message);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('Sub-entity name required');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/sub-entities/${editingId}`, {
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
      await loadData();
    } catch (err) {
      setError('Update failed: ' + err.message);
    }
  };

  const handleDeleteClick = async (id) => {
    try {
      const res = await fetch(`${apiUrl}/api/sub-entities/${id}/cascade-count`);
      const data = await res.json();
      setCascadeInfo(data);
      setDeleteConfirm(id);
    } catch (err) {
      setError('Failed to load delete info: ' + err.message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      const res = await fetch(`${apiUrl}/api/sub-entities/${deleteConfirm}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setDeleteConfirm(null);
      setCascadeInfo(null);
      await loadData();
    } catch (err) {
      setError('Delete failed: ' + err.message);
    }
  };

  const handleEdit = (subEntity) => {
    setEditingId(subEntity.id);
    setFormName(subEntity.name);
    setFormDesc(subEntity.description || '');
    setShowCreateForm(false);
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowCreateForm(false);
    setFormName('');
    setFormDesc('');
    setError('');
  };

  const handleEditSchema = (subEntity) => {
    setSelectedSubEntityForSchema(subEntity);
  };

  const handleSchemaSaved = () => {
    setSelectedSubEntityForSchema(null);
    loadData();
  };

  const toggleSelectSubEntity = (subEntityId) => {
    const newSelected = new Set(selectedSubEntityIds);
    if (newSelected.has(subEntityId)) {
      newSelected.delete(subEntityId);
    } else {
      newSelected.add(subEntityId);
    }
    setSelectedSubEntityIds(newSelected);
  };

  const toggleSelectAllSubEntities = () => {
    if (selectedSubEntityIds.size === subEntities.length) {
      setSelectedSubEntityIds(new Set());
    } else {
      setSelectedSubEntityIds(new Set(subEntities.map((s) => s.id)));
    }
  };

  const handleBulkDeleteSubEntitiesClick = async () => {
    if (selectedSubEntityIds.size === 0) return;

    try {
      // Load cascade info for all selected
      const cascadePromises = Array.from(selectedSubEntityIds).map((id) =>
        fetch(`${apiUrl}/api/sub-entities/${id}/cascade-count`).then((r) => r.json())
      );
      const cascadeData = await Promise.all(cascadePromises);
      const totalInstances = cascadeData.reduce((sum, c) => sum + (c.instances || 0), 0);

      setBulkCascadeInfo({ count: selectedSubEntityIds.size, instances: totalInstances });
      setBulkDeleteConfirm(true);
    } catch (err) {
      setError('Failed to load delete info: ' + err.message);
    }
  };

  const handleConfirmBulkDeleteSubEntities = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/bulk-delete-sub-entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subEntityIds: Array.from(selectedSubEntityIds) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }

      setBulkDeleteConfirm(false);
      setBulkCascadeInfo(null);
      setSelectedSubEntityIds(new Set());
      await loadData();
    } catch (err) {
      setError('Bulk delete failed: ' + err.message);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!entity) {
    return <div className="error-banner">Entity not found</div>;
  }

  // If editing schema for a sub-entity, show schema builder
  if (selectedSubEntityForSchema) {
    return (
      <div className="entity-detail-page">
        <div className="page-header">
          <div>
            <h1>{entity.name}</h1>
            <p className="breadcrumb">
              <a onClick={() => navigate(`/entities/${entityId}`)}>← Back to {entity.name}</a>
            </p>
          </div>
        </div>

        <SchemaBuilder
          subEntity={selectedSubEntityForSchema}
          onSchemaSaved={handleSchemaSaved}
          onCancel={() => setSelectedSubEntityForSchema(null)}
          apiUrl={apiUrl}
        />
      </div>
    );
  }

  return (
    <div className="entity-detail-page">
      <div className="page-header">
        <div>
          <h1>{entity.name}</h1>
          <p className="breadcrumb">
            <a onClick={() => navigate('/')}>← Back to Entities</a>
          </p>
        </div>
        {!showCreateForm && !editingId && (
          <div className="header-actions">
            <button className="btn-primary" onClick={() => setShowCreateForm(true)}>
              + New Sub-Entity
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Create/Edit Form */}
      {(showCreateForm || editingId) && (
        <div className="form-container">
          <form onSubmit={editingId ? handleUpdate : handleCreate}>
            <h2>{editingId ? 'Edit Sub-Entity' : 'Create Sub-Entity'}</h2>

            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Sub-entity name"
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
      {bulkDeleteConfirm && bulkCascadeInfo && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Delete {bulkCascadeInfo.count} Sub-Entity(ies)?</h2>
            <p>This will also delete {bulkCascadeInfo.instances} instance(s) and all associated files.</p>
            <p className="warning">This action cannot be undone.</p>

            <div className="modal-actions">
              <button className="btn-danger" onClick={handleConfirmBulkDeleteSubEntities}>
                Delete {bulkCascadeInfo.count} Sub-Entity(ies)
              </button>
              <button className="btn-secondary" onClick={() => setBulkDeleteConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Delete Sub-Entity?</h2>
            <p>This will also delete {cascadeInfo?.instances || 0} instance(s).</p>
            <p className="warning">This action cannot be undone.</p>

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

      {/* Sub-Entity List */}
      {subEntities.length === 0 ? (
        <div className="empty-state">
          <p>No sub-entities yet. Create one to get started.</p>
        </div>
      ) : (
        <>
          {selectedSubEntityIds.size > 0 && (
            <div className="bulk-action-bar">
              <p>{selectedSubEntityIds.size} selected</p>
              <button className="btn-danger" onClick={handleBulkDeleteSubEntitiesClick}>
                🗑️ Delete Selected
              </button>
            </div>
          )}

          <div className="sub-entity-list">
            {subEntities.map((sub) => (
              <div key={sub.id} className={`sub-entity-card ${selectedSubEntityIds.has(sub.id) ? 'card-selected' : ''}`}>
                <input
                  type="checkbox"
                  className="sub-entity-checkbox"
                  checked={selectedSubEntityIds.has(sub.id)}
                  onChange={() => toggleSelectSubEntity(sub.id)}
                />

                <div className="sub-entity-info">
                  <h3>{sub.name}</h3>
                  {sub.description && <p className="description">{sub.description}</p>}
                  <div className="meta">
                    <span className={`schema-status ${sub.schemaFinalized ? 'finalized' : ''}`}>
                      {sub.schemaFinalized ? '✓ Schema Finalized' : '⚙️ Schema Pending'}
                    </span>
                    <span>
                      {new Date(sub.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="sub-entity-actions">
                  <button className="btn-link" onClick={() => navigate(`/entities/${entityId}/sub-entities/${sub.id}`)}>
                    Instances
                  </button>
                  <button className="btn-link" onClick={() => handleEditSchema(sub)}>
                    Schema
                  </button>
                  <button className="btn-link" onClick={() => handleEdit(sub)}>
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
