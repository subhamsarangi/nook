import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import InstanceForm from './InstanceForm';
import BulkCreateUI from './BulkCreateUI';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import './InstanceListPage.css';

export default function InstanceListPage({ subEntity, entity, entityId, subEntityId, onBack, apiUrl }) {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [editingInstance, setEditingInstance] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    loadInstances();
  }, [subEntity?.id, subEntity?.listItemConfig]);

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
      setError('');
      await loadInstances();
    } catch (err) {
      setError('Create failed: ' + err.message);
      throw err;
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
      setError('');
      await loadInstances();
    } catch (err) {
      setError('Update failed: ' + err.message);
      throw err;
    }
  };

  const schema = subEntity?.schema
    ? typeof subEntity.schema === 'string'
      ? JSON.parse(subEntity.schema)
      : subEntity.schema
    : [];

  const getInstanceFileCount = (inst) => {
    if (!inst || !inst.data || !Array.isArray(schema)) return 0;
    let count = 0;
    schema.forEach((field) => {
      if ((field.type === 'image' || field.type === 'file') && inst.data[field.name]) {
        count++;
      }
    });
    return count;
  };

  const getBulkInstancesFileCount = () => {
    if (!instances || !Array.isArray(schema)) return 0;
    let count = 0;
    instances.forEach((inst) => {
      if (selectedIds.has(inst.id) && inst.data) {
        schema.forEach((field) => {
          if ((field.type === 'image' || field.type === 'file') && inst.data[field.name]) {
            count++;
          }
        });
      }
    });
    return count;
  };

  const handleDeleteClick = (instance) => {
    setDeleteConfirm(instance);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);

    try {
      const res = await fetch(`${apiUrl}/api/instances/${deleteConfirm.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error);
      }

      if (editingInstance && editingInstance.id === deleteConfirm.id) {
        setEditingInstance(null);
      }

      setDeleteConfirm(null);
      await loadInstances();
    } catch (err) {
      setError('Delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelectInstance = (instanceId) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(instanceId)) {
      newSelected.delete(instanceId);
    } else {
      newSelected.add(instanceId);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === instances.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(instances.map((i) => i.id)));
    }
  };

  const handleBulkDeleteClick = () => {
    if (selectedIds.size > 0) {
      setBulkDeleteConfirm(true);
    }
  };

  const handleConfirmBulkDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${apiUrl}/api/bulk-delete-instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceIds: Array.from(selectedIds) }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Delete failed');
      }

      if (editingInstance && selectedIds.has(editingInstance.id)) {
        setEditingInstance(null);
      }

      setBulkDeleteConfirm(false);
      setSelectedIds(new Set());
      await loadInstances();
    } catch (err) {
      setError('Bulk delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const renderFieldValue = (value, fieldName) => {
    if (value === null || value === undefined) {
      return <span style={{ color: '#ccc' }}>—</span>;
    }

    // Find field type in schema
    const field = schema?.find((f) => f.name === fieldName);

    if (field?.type === 'image') {
      return (
        <img
          src={`${apiUrl}/api/files/${value}`}
          alt={fieldName}
          style={{ maxWidth: '100px', maxHeight: '50px', borderRadius: '4px' }}
        />
      );
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

  const getConfiguredFields = () => {
    if (subEntity?.listItemConfig) {
      const config = typeof subEntity.listItemConfig === 'string' 
        ? JSON.parse(subEntity.listItemConfig) 
        : subEntity.listItemConfig;
      return config.fields || [];
    }
    // Default: show first 2 fields from schema
    return schema.slice(0, 2).map((f) => f.name);
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
              <a onClick={() => navigate('/')}>← Entities</a> / <a onClick={() => navigate(`/entities/${entityId}`)}>{entity?.name || 'Entity'}</a> / {subEntity.name}
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

  if (showBulkCreate) {
    return (
      <div className="instance-list-page">
        <div className="page-header">
          <div>
            <h1>📦 Bulk Create Instances</h1>
            <p className="breadcrumb">
              <a onClick={() => navigate('/')}>← Entities</a> / <a onClick={() => navigate(`/entities/${entityId}`)}>{entity?.name || 'Entity'}</a> / {subEntity.name}
            </p>
          </div>
        </div>

        <BulkCreateUI
          subEntityId={subEntity.id}
          schema={subEntity.schema ? JSON.parse(subEntity.schema) : []}
          onSuccess={(result) => {
            setShowBulkCreate(false);
            setError('');
            loadInstances();
          }}
          onCancel={() => setShowBulkCreate(false)}
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
              <a onClick={() => navigate('/')}>← Entities</a> / <a onClick={() => navigate(`/entities/${entityId}`)}>{entity?.name || 'Entity'}</a> / {subEntity.name}
            </p>
          </div>
        </div>

        <InstanceForm
          subEntity={subEntity}
          instance={editingInstance}
          onSubmit={handleUpdateSubmit}
          onCancel={() => setEditingInstance(null)}
          onDelete={() => handleDeleteClick(editingInstance)}
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
            <a onClick={() => navigate('/')}>← Entities</a> / <a onClick={() => navigate(`/entities/${entityId}`)}>{entity?.name || 'Entity'}</a> / {subEntity.name}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => setShowCreateForm(true)}>
            + New Instance
          </button>
          <button className="btn-secondary" onClick={() => setShowBulkCreate(true)}>
            📦 Bulk Create
          </button>
        </div>
      </div>

      {!deleteConfirm && !bulkDeleteConfirm && error && <div className="error-banner">{error}</div>}

      {/* Bulk delete confirmation modal */}
      <ConfirmDeleteDialog
        isOpen={bulkDeleteConfirm}
        itemType="Instance"
        count={selectedIds.size}
        cascadeInfo={{ files: getBulkInstancesFileCount() }}
        loading={deleting}
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setBulkDeleteConfirm(false)}
      />

      {/* Delete confirmation modal */}
      <ConfirmDeleteDialog
        isOpen={!!deleteConfirm}
        itemType="Instance"
        itemName={deleteConfirm?.id ? `ID: ${deleteConfirm.id.substring(0, 8)}...` : undefined}
        cascadeInfo={{ files: getInstanceFileCount(deleteConfirm) }}
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Instances table */}
      {instances.length === 0 ? (
        <div className="empty-state">
          <p>No instances yet. Create one to get started.</p>
        </div>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="bulk-action-bar">
              <p>{selectedIds.size} selected</p>
              <button className="btn-danger" onClick={handleBulkDeleteClick}>
                🗑️ Delete Selected
              </button>
            </div>
          )}

          <table className="instance-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === instances.length && instances.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>ID</th>
                {getConfiguredFields().map((fieldName) => (
                  <th key={fieldName}>{fieldName}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((instance) => (
                <tr key={instance.id} className={selectedIds.has(instance.id) ? 'row-selected' : ''}>
                  <td style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(instance.id)}
                      onChange={() => toggleSelectInstance(instance.id)}
                    />
                  </td>
                  <td className="cell-id" title={instance.id}>
                    <Link
                      to={`/entities/${entityId}/sub-entities/${subEntityId}/instances/${instance.id}`}
                      className="btn-link-id"
                    >
                      {instance.id.substring(0, 8)}...
                    </Link>
                  </td>
                  {getConfiguredFields().map((fieldName) => (
                    <td key={fieldName} className="cell-data">
                      {renderFieldValue(instance.data[fieldName], fieldName)}
                    </td>
                  ))}
                  <td className="cell-actions">
                    <button
                      className="btn-link"
                      onClick={() => setEditingInstance(instance)}
                    >
                      Edit
                    </button>

                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
