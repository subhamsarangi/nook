import React, { useState, useEffect } from 'react';
import './DisplayConfigBuilder.css';

export default function DisplayConfigBuilder({
  schema,
  currentConfig,
  title,
  onSave,
  onCancel,
  isSaving,
}) {
  const [fields, setFields] = useState([]);
  const [dragSource, setDragSource] = useState(null);

  useEffect(() => {
    // Initialize from currentConfig or create default: all fields in order
    if (currentConfig?.fields) {
      setFields(currentConfig.fields);
    } else if (schema) {
      setFields(schema.map((f) => f.name));
    }
  }, [currentConfig, schema]);

  const handleDragStart = (index) => {
    setDragSource(index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (targetIndex) => {
    if (dragSource === null || dragSource === targetIndex) return;

    const newFields = [...fields];
    const [removed] = newFields.splice(dragSource, 1);
    newFields.splice(targetIndex, 0, removed);
    setFields(newFields);
    setDragSource(null);
  };

  const handleRemoveField = (index) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddField = (fieldName) => {
    if (!fields.includes(fieldName)) {
      setFields((prev) => [...prev, fieldName]);
    }
  };

  const handleSave = () => {
    onSave({ fields });
  };

  const availableFields = schema?.filter((f) => !fields.includes(f.name)) || [];

  return (
    <div className="config-builder">
      <h3>{title}</h3>

      <div className="config-section">
        <h4>Selected Fields (drag to reorder)</h4>
        <div className="field-list">
          {fields.length === 0 ? (
            <div className="empty-list">No fields selected</div>
          ) : (
            fields.map((fieldName, index) => {
              const field = schema?.find((f) => f.name === fieldName);
              return (
                <div
                  key={fieldName}
                  className="field-item"
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(index)}
                >
                  <span className="drag-handle">⋮⋮</span>
                  <span className="field-name">{fieldName}</span>
                  <span className="field-type">{field?.type || '?'}</span>
                  <button
                    className="remove-btn"
                    onClick={() => handleRemoveField(index)}
                    title="Remove field"
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {availableFields.length > 0 && (
        <div className="config-section">
          <h4>Available Fields</h4>
          <div className="available-fields">
            {availableFields.map((field) => (
              <button
                key={field.name}
                className="add-field-btn"
                onClick={() => handleAddField(field.name)}
                title={`Add ${field.name} to selected`}
              >
                + {field.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="config-actions">
        <button
          className="btn-secondary"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={isSaving || fields.length === 0}
        >
          {isSaving ? 'Saving...' : 'Save Config'}
        </button>
      </div>
    </div>
  );
}
