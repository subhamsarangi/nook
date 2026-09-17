import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './InstanceListPage.css';

export default function SubEntityInlineDisplay({
  entity,
  entityId,
  subEntity,
  apiUrl,
  onInstancesChange,
}) {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    loadInstances();
  }, [subEntity?.id]);

  const loadInstances = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/sub-entities/${subEntity.id}/instances`);
      if (!res.ok) throw new Error('Failed to load instances');
      const data = await res.json();
      setInstances(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Load failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const schema = subEntity?.schema
    ? typeof subEntity.schema === 'string'
      ? JSON.parse(subEntity.schema)
      : subEntity.schema
    : [];

  const getFieldValue = (instance, fieldName) => {
    return instance?.data?.[fieldName];
  };

  const renderField = (field, value) => {
    if (!value) return '—';

    switch (field.type) {
      case 'short_text':
      case 'long_text':
      case 'url':
        return String(value).slice(0, 50);
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'time':
        return value;
      case 'datetime':
        return new Date(value).toLocaleString();
      case 'dropdown':
      case 'checkbox':
      case 'color':
        return String(value);
      case 'image':
      case 'file':
        return '📎 ' + (typeof value === 'string' ? value.split('/').pop() : 'file');
      default:
        return String(value);
    }
  };

  const renderInstanceRow = (instance) => {
    const config = subEntity?.listItemConfig
      ? typeof subEntity.listItemConfig === 'string'
        ? JSON.parse(subEntity.listItemConfig)
        : subEntity.listItemConfig
      : null;

    if (!config || !config.fields || config.fields.length === 0) {
      // Fallback: show first 3 fields
      const fieldsToShow = schema.slice(0, 3);
      return (
        <div className="instance-row-inline">
          {fieldsToShow.map((field) => (
            <div key={field.name} className="field-cell">
              {renderField(field, getFieldValue(instance, field.name))}
            </div>
          ))}
        </div>
      );
    }

    // Use configured fields
    return (
      <div className="instance-row-inline">
        {config.fields.map((fieldName) => {
          const field = schema.find((f) => f.name === fieldName);
          if (!field) return null;
          return (
            <div key={fieldName} className="field-cell">
              {renderField(field, getFieldValue(instance, fieldName))}
            </div>
          );
        })}
      </div>
    );
  };

  const toggleSelectInstance = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
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
      setDeleteConfirm(null);
      await loadInstances();
      if (onInstancesChange) onInstancesChange();
    } catch (err) {
      setError('Delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="inline-loading">Loading {subEntity.name} instances...</div>;

  return (
    <div className="sub-entity-inline-display">
      <div className="inline-header">
        <h3>{subEntity.name}</h3>
        {subEntity.description && <p className="inline-description">{subEntity.description}</p>}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {instances.length === 0 ? (
        <div className="inline-empty">
          <p>No instances yet.</p>
          <button
            className="btn-link"
            onClick={() => navigate(`/entities/${entityId}/sub-entities/${subEntity.id}`)}
          >
            Create one →
          </button>
        </div>
      ) : (
        <>
          <div className="inline-instances-table">
            <div className="table-header">
              <input
                type="checkbox"
                checked={selectedIds.size === instances.length && instances.length > 0}
                onChange={() => {
                  if (selectedIds.size === instances.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(instances.map((i) => i.id)));
                  }
                }}
              />
              {schema.slice(0, 3).map((field) => (
                <div key={field.name} className="header-cell">
                  {field.name}
                </div>
              ))}
              <div className="header-cell actions-header">Actions</div>
            </div>

            {instances.map((instance) => (
              <div key={instance.id} className="table-row">
                <input
                  type="checkbox"
                  checked={selectedIds.has(instance.id)}
                  onChange={() => toggleSelectInstance(instance.id)}
                />
                {renderInstanceRow(instance)}
                <div className="instance-actions">
                  <button
                    className="btn-link"
                    onClick={() =>
                      navigate(
                        `/entities/${entityId}/sub-entities/${subEntity.id}/instances/${instance.id}`
                      )
                    }
                  >
                    View
                  </button>
                  <button
                    className="btn-link btn-danger"
                    onClick={() => handleDeleteClick(instance)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="inline-actions">
            <button
              className="btn-link"
              onClick={() => navigate(`/entities/${entityId}/sub-entities/${subEntity.id}`)}
            >
              View All {instances.length} instances →
            </button>
          </div>
        </>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Delete Instance?</h3>
            <p className="warning">This cannot be undone.</p>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
