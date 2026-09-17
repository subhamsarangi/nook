import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SchemaBuilder from './SchemaBuilder';
import DisplayConfigBuilder from './DisplayConfigBuilder';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
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
  const [deleteError, setDeleteError] = useState('');
  const [displayMode, setDisplayMode] = useState('list'); // 'list' or 'gallery' stub
  const [selectedSubEntityForSchema, setSelectedSubEntityForSchema] = useState(null);
  const [selectedSubEntityIds, setSelectedSubEntityIds] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkCascadeInfo, setBulkCascadeInfo] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedSubEntityForConfig, setSelectedSubEntityForConfig] = useState(null);
  const [configMode, setConfigMode] = useState(null); // null | 'list' | 'detail'
  const [savingConfig, setSavingConfig] = useState(false);

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
    setDeleteError('');
    setDeleteConfirm(id);
    setCascadeInfo(null);
    setDeleting(true);
    try {
      const res = await fetch(`${apiUrl}/api/sub-entities/${id}/cascade-count`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load delete info');
      }
      setCascadeInfo(data);
    } catch (err) {
      setDeleteError('Failed to load delete info: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiUrl}/api/sub-entities/${deleteConfirm}`, {
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
      setDeleteError('');
      await loadData();
    } catch (err) {
      setDeleteError('Delete failed: ' + err.message);
    } finally {
      setDeleting(false);
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

  const handleSaveListConfig = async (config) => {
    setSavingConfig(true);
    try {
      const res = await fetch(
        `${apiUrl}/api/sub-entities/${selectedSubEntityForConfig.id}/list-item-config`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        }
      );

      if (!res.ok) {
        throw new Error('Save failed');
      }

      setSelectedSubEntityForConfig(null);
      setConfigMode(null);
      loadData();
    } catch (err) {
      setError('Config save failed: ' + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveDetailConfig = async (config) => {
    setSavingConfig(true);
    try {
      const res = await fetch(
        `${apiUrl}/api/sub-entities/${selectedSubEntityForConfig.id}/detail-view-config`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        }
      );

      if (!res.ok) {
        throw new Error('Save failed');
      }

      setSelectedSubEntityForConfig(null);
      setConfigMode(null);
      loadData();
    } catch (err) {
      setError('Config save failed: ' + err.message);
    } finally {
      setSavingConfig(false);
    }
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
    setBulkDeleteConfirm(true);
    setDeleting(true);
    try {
      // Load cascade info for all selected
      const cascadePromises = Array.from(selectedSubEntityIds).map((id) =>
        fetch(`${apiUrl}/api/sub-entities/${id}/cascade-count`).then((r) => r.json())
      );
      const cascadeData = await Promise.all(cascadePromises);
      const totalInstances = cascadeData.reduce((sum, c) => sum + (c.instances || 0), 0);
      const totalFiles = cascadeData.reduce((sum, c) => sum + (c.files || 0), 0);

      setBulkCascadeInfo({
        count: selectedSubEntityIds.size,
        instances: totalInstances,
        files: totalFiles,
      });
    } catch (err) {
      setError('Failed to load delete info: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmBulkDeleteSubEntities = async () => {
    setDeleting(true);
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

      if (editingId && selectedSubEntityIds.has(editingId)) {
        setEditingId(null);
        setFormName('');
        setFormDesc('');
      }

      setBulkDeleteConfirm(false);
      setBulkCascadeInfo(null);
      setSelectedSubEntityIds(new Set());
      await loadData();
    } catch (err) {
      setError('Bulk delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!entity) {
    return <div className="error-banner">Entity not found</div>;
  }

  // If configuring display for a sub-entity, show config builder
  if (selectedSubEntityForConfig && configMode) {
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

        <DisplayConfigBuilder
          schema={
            selectedSubEntityForConfig.schema
              ? typeof selectedSubEntityForConfig.schema === 'string'
                ? JSON.parse(selectedSubEntityForConfig.schema)
                : selectedSubEntityForConfig.schema
              : []
          }
          currentConfig={
            configMode === 'list'
              ? selectedSubEntityForConfig.listItemConfig
                ? typeof selectedSubEntityForConfig.listItemConfig === 'string'
                  ? JSON.parse(selectedSubEntityForConfig.listItemConfig)
                  : selectedSubEntityForConfig.listItemConfig
                : null
              : selectedSubEntityForConfig.detailViewConfig
              ? typeof selectedSubEntityForConfig.detailViewConfig === 'string'
                ? JSON.parse(selectedSubEntityForConfig.detailViewConfig)
                : selectedSubEntityForConfig.detailViewConfig
              : null
          }
          title={configMode === 'list' ? 'Configure List Display' : 'Configure Detail View'}
          onSave={configMode === 'list' ? handleSaveListConfig : handleSaveDetailConfig}
          onCancel={() => {
            setSelectedSubEntityForConfig(null);
            setConfigMode(null);
          }}
          isSaving={savingConfig}
        />
      </div>
    );
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
            {!(editingId || showCreateForm) && <a onClick={() => navigate('/')}>← Back to Entities</a>}
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

      {!deleteConfirm && !bulkDeleteConfirm && error && <div className="error-banner">{error}</div>}

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
                  disabled={subEntities.length <= 1}
                  title={subEntities.length <= 1 ? 'An entity must have at least one sub-entity' : 'Delete sub-entity'}
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
        itemType="Sub-Entity"
        count={selectedSubEntityIds.size}
        cascadeInfo={bulkCascadeInfo}
        loading={deleting}
        onConfirm={handleConfirmBulkDeleteSubEntities}
        onCancel={() => {
          setBulkDeleteConfirm(false);
          setBulkCascadeInfo(null);
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        isOpen={!!deleteConfirm}
        itemType="Sub-Entity"
        itemName={subEntities.find((s) => s.id === deleteConfirm)?.name}
        cascadeInfo={cascadeInfo}
        loading={deleting}
        error={deleteError}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirm(null);
          setCascadeInfo(null);
          setDeleteError('');
        }}
      />

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
              <button
                className="btn-danger"
                onClick={handleBulkDeleteSubEntitiesClick}
                disabled={selectedSubEntityIds.size >= subEntities.length}
                title={selectedSubEntityIds.size >= subEntities.length ? 'An entity must have at least one sub-entity' : 'Delete selected sub-entities'}
              >
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
                  {sub.schemaFinalized && (
                    <>
                      <button
                        className="btn-link"
                        onClick={() => {
                          setSelectedSubEntityForConfig(sub);
                          setConfigMode('list');
                        }}
                      >
                        List Config
                      </button>
                      <button
                        className="btn-link"
                        onClick={() => {
                          setSelectedSubEntityForConfig(sub);
                          setConfigMode('detail');
                        }}
                      >
                        Detail Config
                      </button>
                    </>
                  )}
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
