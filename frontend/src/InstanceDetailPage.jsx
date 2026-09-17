import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import './InstanceDetailPage.css';

export default function InstanceDetailPage({ instance, subEntity, entity, entityId, subEntityId, onBack, apiUrl }) {
  const [instanceData, setInstanceData] = useState(instance || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingFile, setDownloadingFile] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!instanceData) {
      loadInstance();
    }
  }, [subEntity?.detailViewConfig]);

  const loadInstance = async () => {
    if (instanceData) return; // Already loaded from props
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiUrl}/api/instances/${instance?.id}`);

      if (!res.ok) {
        throw new Error('Failed to load instance');
      }

      const data = await res.json();
      setInstanceData(data);
    } catch (err) {
      setError('Load failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = async (fileId, fieldName) => {
    setDownloadingFile(fileId);

    try {
      const res = await fetch(`${apiUrl}/api/files/${fileId}`);

      if (!res.ok) {
        throw new Error('Download failed');
      }

      const blob = await res.blob();
      const filename =
        res.headers.get('content-disposition')?.split('filename="')[1]?.split('"')[0] ||
        `${fieldName}-${fileId}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Download failed: ' + err.message);
    } finally {
      setDownloadingFile(null);
    }
  };

  const renderFieldValue = (value, field) => {
    if (value === null || value === undefined) {
      return <span className="value-empty">—</span>;
    }

    if (typeof value === 'boolean') {
      return (
        <span className={`value-boolean ${value ? 'true' : 'false'}`}>
          {value ? '✓ True' : '✗ False'}
        </span>
      );
    }

    if (field.type === 'color') {
      return (
        <div className="value-color">
          <div
            className="color-swatch"
            style={{ backgroundColor: value }}
            title={value}
          />
          <code>{value}</code>
        </div>
      );
    }

    if (field.type === 'url') {
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="value-url">
          {value}
        </a>
      );
    }

    if (field.type === 'image') {
      return (
        <div className="value-image">
          <img src={`${apiUrl}/api/files/${value}`} alt="Preview" onError={() => {}} />
          <button
            className="download-btn"
            onClick={() => handleDownloadFile(value, field.name)}
            disabled={downloadingFile === value}
          >
            {downloadingFile === value ? 'Downloading...' : 'Download'}
          </button>
        </div>
      );
    }

    if (field.type === 'file') {
      return (
        <button
          className="file-link"
          onClick={() => handleDownloadFile(value, field.name)}
          disabled={downloadingFile === value}
        >
          {downloadingFile === value ? 'Downloading...' : `📎 Download File`}
        </button>
      );
    }

    const str = String(value);
    if (field.type === 'long_text' && str.length > 200) {
      return (
        <pre className="value-long-text">
          {str.substring(0, 500)}
          {str.length > 500 ? '...' : ''}
        </pre>
      );
    }

    return <span className="value-text">{str}</span>;
  };

  if (loading) {
    return <div className="loading">Loading instance...</div>;
  }

  if (!instanceData) {
    return <div className="error-banner">Instance not found</div>;
  }

  const schema = subEntity?.schema
    ? typeof subEntity.schema === 'string'
      ? JSON.parse(subEntity.schema)
      : subEntity.schema
    : [];

  const fieldMap = {};
  schema.forEach((f) => {
    fieldMap[f.name] = f;
  });

  const getOrderedFields = () => {
    if (subEntity?.detailViewConfig) {
      const config = typeof subEntity.detailViewConfig === 'string' 
        ? JSON.parse(subEntity.detailViewConfig) 
        : subEntity.detailViewConfig;
      if (config.fields && Array.isArray(config.fields)) {
        return config.fields.map((name) => fieldMap[name]).filter(Boolean);
      }
    }
    return schema;
  };

  const getFileCount = () => {
    if (!instanceData || !instanceData.data || !Array.isArray(schema)) return 0;
    let count = 0;
    schema.forEach((field) => {
      if ((field.type === 'image' || field.type === 'file') && instanceData.data[field.name]) {
        count++;
      }
    });
    return count;
  };

  const handleDeleteInstance = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${apiUrl}/api/instances/${instanceData.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Delete failed');
      }

      setDeleteConfirm(false);
      navigate(`/entities/${entityId}/sub-entities/${subEntityId}`);
    } catch (err) {
      setError('Delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="instance-detail-page">
      <div className="page-header">
        <div>
          <h1>🔍 Instance Details</h1>
          <p className="breadcrumb">
            <a onClick={() => navigate('/')}>← Entities</a> / <a onClick={() => navigate(`/entities/${entityId}`)}>{entity?.name || 'Entity'}</a> / <a onClick={() => navigate(`/entities/${entityId}/sub-entities/${subEntityId}`)}>{subEntity?.name || 'Sub-Entity'}</a> / ID: {instanceData?.id}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-danger" onClick={() => setDeleteConfirm(true)}>
            🗑️ Delete Instance
          </button>
        </div>
      </div>

      <ConfirmDeleteDialog
        isOpen={deleteConfirm}
        itemType="Instance"
        itemName={`ID: ${instanceData.id.substring(0, 8)}...`}
        cascadeInfo={{ files: getFileCount() }}
        loading={deleting}
        onConfirm={handleDeleteInstance}
        onCancel={() => setDeleteConfirm(false)}
      />

      {!deleteConfirm && error && <div className="error-banner">{error}</div>}

      <div className="detail-container">
        <div className="metadata">
          <div className="metadata-item">
            <span className="label">ID:</span>
            <code className="mono">{instanceData.id}</code>
          </div>
          <div className="metadata-item">
            <span className="label">Created:</span>
            <span>{new Date(instanceData.createdAt).toLocaleString()}</span>
          </div>
          <div className="metadata-item">
            <span className="label">Updated:</span>
            <span>{new Date(instanceData.updatedAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="fields-container">
          {getOrderedFields().map((field) => (
            <div key={field.name} className="field-block">
              <div className="field-header">
                <h3>
                  {field.icon || '📄'} {field.name}
                </h3>
                <div className="field-meta">
                  <span className="field-type">{field.type}</span>
                  {field.required && <span className="required">Required</span>}
                </div>
              </div>

              <div className="field-value">
                {renderFieldValue(instanceData.data[field.name], field)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
