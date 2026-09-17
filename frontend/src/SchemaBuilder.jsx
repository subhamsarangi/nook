import React, { useState, useEffect } from 'react';
import { getAvailableFieldTypes, fieldTypeHasOptions, isAlwaysOptional } from './fieldTypes';
import './SchemaBuilder.css';

export default function SchemaBuilder({ subEntity, onSchemaSaved, onCancel, apiUrl }) {
  const [schema, setSchema] = useState([]);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('short_text');
  const [formRequired, setFormRequired] = useState(false);
  const [formOptions, setFormOptions] = useState(['']);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);

  useEffect(() => {
    // Load existing schema if any
    if (subEntity?.schema) {
      try {
        const parsed = typeof subEntity.schema === 'string' ? JSON.parse(subEntity.schema) : subEntity.schema;
        setSchema(Array.isArray(parsed) ? parsed : []);
      } catch {
        setSchema([]);
      }
    }
  }, [subEntity]);

  const fieldTypes = getAvailableFieldTypes();

  const handleAddField = () => {
    if (!formName.trim()) {
      setError('Field name required');
      return;
    }

    // Check for duplicate names
    if (schema.some((f) => f.name === formName.trim())) {
      setError('Field name already exists');
      return;
    }

    // image/file must be optional
    const actualRequired = isAlwaysOptional(formType) ? false : formRequired;

    const newField = {
      name: formName.trim(),
      type: formType,
      required: actualRequired,
      ...(fieldTypeHasOptions(formType) && { options: formOptions.filter((o) => o.trim()) }),
    };

    setSchema([...schema, newField]);
    setFormName('');
    setFormType('short_text');
    setFormRequired(false);
    setFormOptions(['']);
    setError('');
  };

  const handleRemoveField = (index) => {
    setSchema(schema.filter((_, i) => i !== index));
  };

  const handleMoveField = (index, direction) => {
    const newSchema = [...schema];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newSchema.length) return;

    [newSchema[index], newSchema[targetIndex]] = [newSchema[targetIndex], newSchema[index]];
    setSchema(newSchema);
  };

  const handleOptionChange = (index, value) => {
    const newOptions = [...formOptions];
    newOptions[index] = value;
    setFormOptions(newOptions);
  };

  const handleRemoveOption = (index) => {
    setFormOptions(formOptions.filter((_, i) => i !== index));
  };

  const handleAddOption = () => {
    setFormOptions([...formOptions, '']);
  };

  const handleTypeChange = (type) => {
    setFormType(type);
    if (!fieldTypeHasOptions(type)) {
      setFormOptions(['']);
    }
  };

  const handleSaveSchema = async () => {
    if (schema.length === 0) {
      setError('Schema must have at least one field');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch(`${apiUrl}/api/sub-entities/${subEntity.id}/schema`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      onSchemaSaved();
    } catch (err) {
      setError('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizeSchema = async () => {
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`${apiUrl}/api/sub-entities/${subEntity.id}/finalize-schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      setShowFinalizeConfirm(false);
      onSchemaSaved();
    } catch (err) {
      setError('Finalize failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const showOptionsInput = fieldTypeHasOptions(formType);
  const typeIsAlwaysOptional = isAlwaysOptional(formType);

  return (
    <div className="schema-builder">
      <h3>📋 Schema Builder</h3>

      {subEntity?.schemaFinalized ? (
        <div className="schema-status-banner">✓ Schema finalized — cannot be modified</div>
      ) : (
        <div className="schema-status-banner pending">⚙️ Schema is pending — add fields and finalize</div>
      )}

      {error && <div style={{ background: '#fadbd8', color: '#c0392b', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>{error}</div>}

      {/* Current schema */}
      {schema.length > 0 ? (
        <div className="field-list">
          {schema.map((field, idx) => (
            <div key={idx} className="field-item">
              <div className="field-info">
                <h4 className="field-name">{field.name}</h4>
                <div className="field-meta">
                  <span className="field-type-badge">{field.type}</span>
                  {field.required && <span className="field-required-badge">Required</span>}
                </div>
              </div>

              <div className="field-actions">
                <button
                  className="btn-icon"
                  onClick={() => handleMoveField(idx, 'up')}
                  disabled={idx === 0}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleMoveField(idx, 'down')}
                  disabled={idx === schema.length - 1}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  className="btn-icon danger"
                  onClick={() => handleRemoveField(idx)}
                  title="Delete field"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="schema-empty-message">No fields yet. Add one below.</div>
      )}

      {/* Add field form */}
      {!subEntity?.schemaFinalized && (
        <div className="add-field-form">
          <h4>Add Field</h4>

          <div className="form-row">
            <div className="form-group">
              <label>Field Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Email, Title"
              />
            </div>

            <div className="form-group">
              <label>Type</label>
              <select value={formType} onChange={(e) => handleTypeChange(e.target.value)}>
                {fieldTypes.map((ft) => (
                  <option key={ft.key} value={ft.key}>
                    {ft.icon} {ft.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showOptionsInput && (
            <div className="dropdown-options-container">
              <h5>Options</h5>
              <div className="dropdown-options-list">
                {formOptions.map((opt, idx) => (
                  <div key={idx} className="dropdown-option-item">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder="Option value"
                    />
                    {formOptions.length > 1 && (
                      <button onClick={() => handleRemoveOption(idx)}>Remove</button>
                    )}
                  </div>
                ))}
              </div>
              <button className="add-option-btn" onClick={handleAddOption}>
                + Add Option
              </button>
            </div>
          )}

          <div className="form-row full">
            <div className="form-group checkbox">
              <input
                type="checkbox"
                id="required"
                checked={formRequired}
                onChange={(e) => setFormRequired(e.target.checked)}
                disabled={typeIsAlwaysOptional}
                title={typeIsAlwaysOptional ? 'Image/file fields are always optional' : ''}
              />
              <label htmlFor="required">Required</label>
              {typeIsAlwaysOptional && <span style={{ fontSize: '0.85rem', color: '#999' }}>(always optional)</span>}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn-primary" onClick={handleAddField}>
              Add Field
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!subEntity?.schemaFinalized && (
        <div className="schema-actions">
          <div className="schema-info">
            {schema.length} field{schema.length !== 1 ? 's' : ''} defined
          </div>
          <div className="action-buttons">
            <button className="btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleSaveSchema}
              disabled={schema.length === 0 || saving}
            >
              {saving ? 'Saving...' : 'Save Schema'}
            </button>
            <button
              className="btn-finalize"
              onClick={() => setShowFinalizeConfirm(true)}
              disabled={schema.length === 0 || saving}
            >
              🔒 Finalize Schema
            </button>
          </div>
        </div>
      )}

      {/* Finalize confirmation modal */}
      {showFinalizeConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Finalize Schema?</h2>
            <p>Once finalized, the schema cannot be modified. Instances can then be created against it.</p>
            <p className="warning">This action cannot be undone.</p>

            <div className="modal-actions">
              <button className="btn-finalize" onClick={handleFinalizeSchema} disabled={saving}>
                {saving ? 'Finalizing...' : 'Finalize'}
              </button>
              <button className="btn-secondary" onClick={() => setShowFinalizeConfirm(false)} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
