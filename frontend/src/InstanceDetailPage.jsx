import React, { useState, useEffect } from 'react';
import './InstanceDetailPage.css';

export default function InstanceDetailPage({ instanceId, subEntity, onBack, apiUrl }) {
  const [instance, setInstance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingFile, setDownloadingFile] = useState(null);

  useEffect(() => {
    loadInstance();
  }, [instanceId]);

  const loadInstance = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiUrl}/api/instances/${instanceId}`);

      if (!res.ok) {
        throw new Error('Failed to load instance');
      }

      const data = await res.json();
      setInstance(data);
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

  if (!instance) {
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

  return (
    <div className="instance-detail-page">
      <div className="page-header">
        <div>
          <h1>🔍 Instance Details</h1>
          <p className="breadcrumb">
            <a onClick={onBack}>← Back</a> / {subEntity.name} / {instanceId}
          </p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="detail-container">
        <div className="metadata">
          <div className="metadata-item">
            <span className="label">ID:</span>
            <code className="mono">{instance.id}</code>
          </div>
          <div className="metadata-item">
            <span className="label">Created:</span>
            <span>{new Date(instance.createdAt).toLocaleString()}</span>
          </div>
          <div className="metadata-item">
            <span className="label">Updated:</span>
            <span>{new Date(instance.updatedAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="fields-container">
          {schema.map((field) => (
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
                {renderFieldValue(instance.data[field.name], field)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
