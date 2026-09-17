import React, { useState, useEffect } from 'react';
import { getFieldType, validateFieldValue } from './fieldTypes';
import './InstanceForm.css';

export default function InstanceForm({
  subEntity,
  instance = null,
  onSubmit,
  onCancel,
  onDelete,
  apiUrl,
}) {
  const [formData, setFormData] = useState({});
  const [fileUploads, setFileUploads] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const schema = subEntity?.schema
    ? typeof subEntity.schema === 'string'
      ? JSON.parse(subEntity.schema)
      : subEntity.schema
    : [];

  // Initialize form with instance data if editing
  useEffect(() => {
    if (instance?.data) {
      setFormData(instance.data);
    } else {
      // Initialize with empty values
      const initial = {};
      schema.forEach((field) => {
        initial[field.name] = '';
      });
      setFormData(initial);
    }
  }, [instance, schema]);

  const handleFieldChange = (fieldName, value) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
    // Clear error for this field
    setErrors((prev) => ({
      ...prev,
      [fieldName]: '',
    }));
  };

  const handleFileSelect = async (fieldName, field, file) => {
    if (!file) {
      setFileUploads((prev) => ({
        ...prev,
        [fieldName]: null,
      }));
      return;
    }

    // For now, store file locally. In a real implementation, upload immediately
    setFileUploads((prev) => ({
      ...prev,
      [fieldName]: {
        file,
        preview: field.type === 'image' ? URL.createObjectURL(file) : null,
      },
    }));
  };

  const handleRemoveFile = (fieldName) => {
    setFileUploads((prev) => ({
      ...prev,
      [fieldName]: null,
    }));
    handleFieldChange(fieldName, '');
  };

  const validateForm = () => {
    const newErrors = {};

    schema.forEach((field) => {
      const value = formData[field.name];

      // Check required
      if (field.required && (!value || value.toString().trim() === '')) {
        newErrors[field.name] = `${field.name} is required`;
        return;
      }

      // Skip validation if empty and not required
      if (!value) return;

      // Validate type
      if (!validateFieldValue(value, field.type, field.options)) {
        newErrors[field.name] = `Invalid ${field.type} format`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    try {
      // Upload files first
      const dataToSubmit = { ...formData };

      for (const fieldName in fileUploads) {
        const upload = fileUploads[fieldName];
        if (upload?.file) {
          const formDataUpload = new FormData();
          formDataUpload.append('file', upload.file);

          const res = await fetch(`${apiUrl}/api/files/upload?filename=${upload.file.name}`, {
            method: 'POST',
            body: upload.file.stream(), // raw binary
          });

          if (!res.ok) {
            throw new Error('File upload failed');
          }

          const { fileId } = await res.json();
          dataToSubmit[fieldName] = fileId;
        }
      }

      onSubmit(dataToSubmit);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        _form: 'Submission failed: ' + err.message,
      }));
    } finally {
      setSubmitting(false);
    }
  };

  if (!schema || schema.length === 0) {
    return <div className="instance-form">Schema not finalized yet.</div>;
  }

  return (
    <form className="instance-form" onSubmit={handleSubmit}>
      <h2>{instance ? 'Edit Instance' : 'Create Instance'}</h2>

      {errors._form && (
        <div style={{ background: '#fadbd8', color: '#c0392b', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
          {errors._form}
        </div>
      )}

      <div className="form-section">
        {schema.map((field) => {
          const fieldType = getFieldType(field.type);
          const value = formData[field.name] || '';
          const error = errors[field.name];

          return (
            <div key={field.name} className="form-group">
              <label>
                <span className="field-type-icon">{fieldType?.icon}</span>
                {field.name}
                {field.required ? (
                  <span className="required">*</span>
                ) : (
                  <span className="optional">(optional)</span>
                )}
              </label>

              {field.type === 'short_text' && (
                <input
                  type="text"
                  maxLength={fieldType.maxLength}
                  value={value}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  placeholder={`Enter ${field.name}`}
                />
              )}

              {field.type === 'long_text' && (
                <textarea
                  maxLength={fieldType.maxLength}
                  value={value}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  placeholder={`Enter ${field.name}`}
                />
              )}

              {field.type === 'date' && (
                <input
                  type="date"
                  value={value}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                />
              )}

              {field.type === 'time' && (
                <input
                  type="time"
                  value={value}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                />
              )}

              {field.type === 'datetime' && (
                <input
                  type="datetime-local"
                  value={value}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                />
              )}

              {field.type === 'url' && (
                <input
                  type="url"
                  value={value}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  placeholder="https://example.com"
                />
              )}

              {field.type === 'dropdown' && (
                <select value={value} onChange={(e) => handleFieldChange(field.name, e.target.value)}>
                  <option value="">-- Select --</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}

              {field.type === 'checkbox' && (
                <div className="form-group checkbox">
                  <input
                    type="checkbox"
                    id={field.name}
                    checked={value === 'true' || value === true}
                    onChange={(e) => handleFieldChange(field.name, e.target.checked ? 'true' : 'false')}
                  />
                  <label htmlFor={field.name}>{field.name}</label>
                </div>
              )}

              {field.type === 'color' && (
                <input
                  type="color"
                  value={value || '#000000'}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                />
              )}

              {field.type === 'image' && (
                <div className="file-input-wrapper">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileSelect(field.name, field, e.target.files?.[0] || null)}
                  />
                </div>
              )}

              {field.type === 'image' && fileUploads[field.name]?.preview && (
                <div className="file-preview image">
                  <img src={fileUploads[field.name].preview} alt="Preview" />
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => handleRemoveFile(field.name)}
                  >
                    Remove
                  </button>
                </div>
              )}

              {field.type === 'file' && (
                <input
                  type="file"
                  onChange={(e) => handleFileSelect(field.name, field, e.target.files?.[0] || null)}
                />
              )}

              {field.type === 'file' && fileUploads[field.name] && (
                <div className="file-preview file">
                  <div className="file-info">
                    <div className="filename">{fileUploads[field.name].file.name}</div>
                    <div className="filesize">{(fileUploads[field.name].file.size / 1024).toFixed(2)} KB</div>
                  </div>
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => handleRemoveFile(field.name)}
                  >
                    Remove
                  </button>
                </div>
              )}

              {error && <div className="form-error">{error}</div>}
            </div>
          );
        })}
      </div>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Submitting...' : instance ? 'Update Instance' : 'Create Instance'}
        </button>
        {instance && onDelete && (
          <button
            type="button"
            className="btn-danger"
            onClick={onDelete}
            disabled={submitting}
          >
            🗑️ Delete
          </button>
        )}
      </div>
    </form>
  );
}
