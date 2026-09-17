import React, { useState } from 'react';
import './BulkCreateUI.css';

export default function BulkCreateUI({ subEntityId, schema, onSuccess, onCancel }) {
  const [jsonInput, setJsonInput] = useState('');
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);

  /**
   * Parse and validate JSON
   */
  const handleParse = () => {
    setErrors([]);
    setPreview(null);

    if (!jsonInput.trim()) {
      setErrors(['JSON input is empty']);
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonInput);
    } catch (err) {
      setErrors([`JSON parse error: ${err.message}`]);
      return;
    }

    if (!Array.isArray(parsed)) {
      setErrors(['JSON must be an array of instances']);
      return;
    }

    if (parsed.length === 0) {
      setErrors(['Array is empty']);
      return;
    }

    // Validate each row
    const validationErrors = [];
    parsed.forEach((row, idx) => {
      if (typeof row !== 'object' || row === null) {
        validationErrors.push(`Row ${idx}: must be an object`);
        return;
      }

      schema.forEach((field) => {
        const value = row[field.name];

        // Check required
        if (field.required && (value === null || value === undefined || value === '')) {
          validationErrors.push(`Row ${idx}, ${field.name}: required`);
        }

        // Type check if present
        if (value !== null && value !== undefined && value !== '') {
          if (field.type === 'checkbox' && typeof value !== 'boolean') {
            validationErrors.push(`Row ${idx}, ${field.name}: must be true/false`);
          } else if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            validationErrors.push(`Row ${idx}, ${field.name}: must be YYYY-MM-DD`);
          } else if (field.type === 'color' && !/^#[0-9A-Fa-f]{6}$/.test(value)) {
            validationErrors.push(`Row ${idx}, ${field.name}: must be hex color`);
          }
        }
      });
    });

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setPreview(parsed);
  };

  /**
   * File upload handler
   */
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setJsonInput(event.target.result);
    };
    reader.readAsText(file);
  };

  /**
   * Submit bulk create
   */
  const handleSubmit = async () => {
    if (!preview || preview.length === 0) {
      setErrors(['No data to create']);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/sub-entities/${subEntityId}/bulk-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: preview }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrors(data.errors || ['Create failed']);
        setLoading(false);
        return;
      }

      // Success
      setLoading(false);
      onSuccess(data);
    } catch (err) {
      setErrors([`Request failed: ${err.message}`]);
      setLoading(false);
    }
  };

  return (
    <div className="bulk-create-ui">
      <div className="bulk-header">
        <h2>Bulk Create Instances</h2>
        <p>Upload or paste JSON array of instance data</p>
      </div>

      <div className="bulk-controls">
        <label>
          Upload JSON file:
          <input type="file" accept=".json" onChange={handleFileUpload} />
        </label>

        <div className="or">— or —</div>

        <textarea
          placeholder="Paste JSON array here..."
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          rows="8"
        />

        <button onClick={handleParse} disabled={loading || !jsonInput.trim()}>
          Parse & Validate
        </button>
      </div>

      {errors.length > 0 && (
        <div className="bulk-errors">
          <h3>Errors ({errors.length})</h3>
          <ul>
            {errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {preview && errors.length === 0 && (
        <div className="bulk-preview">
          <h3>Preview ({preview.length} instances)</h3>
          <div className="preview-table">
            <table>
              <thead>
                <tr>
                  {schema.map((field) => (
                    <th key={field.name}>{field.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, idx) => (
                  <tr key={idx}>
                    {schema.map((field) => (
                      <td key={field.name}>
                        {row[field.name] === null || row[field.name] === undefined
                          ? '—'
                          : String(row[field.name]).substring(0, 30)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bulk-actions">
            <button
              className="btn-submit"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Creating...' : `Create ${preview.length} Instance(s)`}
            </button>
            <button className="btn-cancel" onClick={onCancel} disabled={loading}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
