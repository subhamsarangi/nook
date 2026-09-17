/**
 * Bulk operations: create instances from JSON, validate against schema, transaction.
 */

import { getSubEntity } from './subEntities.js';
import { createInstance } from './instances.js';

/**
 * Validate instance data against schema
 * Returns { valid: boolean, errors: [string] }
 */
function validateInstanceAgainstSchema(data, schema) {
  const errors = [];

  schema.forEach((field) => {
    const value = data[field.name];

    // Check required fields
    if (field.required && (value === null || value === undefined || value === '')) {
      errors.push(`${field.name} is required`);
      return;
    }

    // Skip if empty and not required
    if (!value) return;

    // Basic type validation (avoid import, use simple checks)
    if (field.type === 'short_text' || field.type === 'long_text') {
      if (typeof value !== 'string') {
        errors.push(`${field.name} must be text`);
      }
    } else if (field.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        errors.push(`${field.name} must be YYYY-MM-DD format`);
      }
    } else if (field.type === 'time') {
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
        errors.push(`${field.name} must be HH:MM or HH:MM:SS format`);
      }
    } else if (field.type === 'datetime') {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(value)) {
        errors.push(`${field.name} must be ISO 8601 datetime`);
      }
    } else if (field.type === 'url') {
      try {
        new URL(value);
      } catch {
        errors.push(`${field.name} must be valid URL`);
      }
    } else if (field.type === 'dropdown') {
      if (field.options && !field.options.includes(value)) {
        errors.push(`${field.name} must be one of: ${field.options.join(', ')}`);
      }
    } else if (field.type === 'checkbox') {
      if (typeof value !== 'boolean') {
        errors.push(`${field.name} must be true or false`);
      }
    } else if (field.type === 'color') {
      if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
        errors.push(`${field.name} must be hex color (#RRGGBB)`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Bulk-create instances from JSON data
 * Validates all rows first, then creates in transaction (all-or-nothing)
 *
 * @param {object} db - sql.js database
 * @param {string} subEntityId - SubEntity ID
 * @param {array} instances - Array of instance data objects
 * @returns { success: boolean, created?: number, errors?: [string] }
 */
export function bulkCreateInstances(db, subEntityId, instances) {
  if (!Array.isArray(instances)) {
    return { success: false, errors: ['Data must be an array of instances'] };
  }

  if (instances.length === 0) {
    return { success: false, errors: ['No instances to create'] };
  }

  // Get sub-entity + schema
  const subEntity = getSubEntity(db, subEntityId);
  if (!subEntity) {
    return { success: false, errors: ['Sub-entity not found'] };
  }

  if (!subEntity.schemaFinalized) {
    return { success: false, errors: ['Schema must be finalized before bulk create'] };
  }

  let schema;
  try {
    schema = typeof subEntity.schema === 'string' ? JSON.parse(subEntity.schema) : subEntity.schema;
  } catch {
    return { success: false, errors: ['Schema parse error'] };
  }

  // Validate all instances first
  const allErrors = [];
  instances.forEach((instance, idx) => {
    const validation = validateInstanceAgainstSchema(instance, schema);
    if (!validation.valid) {
      validation.errors.forEach((err) => {
        allErrors.push(`Row ${idx}: ${err}`);
      });
    }
  });

  if (allErrors.length > 0) {
    return { success: false, errors: allErrors };
  }

  // All valid — create in transaction
  try {
    db.run('BEGIN TRANSACTION');

    let createdCount = 0;
    instances.forEach((instanceData) => {
      createInstance(db, subEntityId, instanceData);
      createdCount++;
    });

    db.run('COMMIT');

    return { success: true, created: createdCount };
  } catch (err) {
    db.run('ROLLBACK');
    return { success: false, errors: [`Transaction failed: ${err.message}`] };
  }
}

/**
 * API: POST /api/sub-entities/:subEntityId/bulk-create
 */
export async function handleBulkCreateInstances(req, res, db, key, dbPath) {
  try {
    const { subEntityId } = req.params;
    const { instances } = req.body;

    const result = bulkCreateInstances(db, subEntityId, instances);

    if (!result.success) {
      return res.status(400).json({ errors: result.errors });
    }

    // Persist DB to disk
    if (key && dbPath) {
      const { writeEncryptedDatabase } = await import('./database.js');
      writeEncryptedDatabase(dbPath, db, key);
    }

    res.status(201).json({ created: result.created, message: `Created ${result.created} instance(s)` });
  } catch (err) {
    console.error('[bulk-ops] create failed:', err.message);
    res.status(500).json({ errors: [`Create failed: ${err.message}`] });
  }
}

/**
 * Bulk-delete instances (multi-select)
 * Returns { deleted: number }
 */
export async function bulkDeleteInstances(db, instanceIds, key) {
  if (!Array.isArray(instanceIds) || instanceIds.length === 0) {
    throw new Error('No instance IDs provided');
  }

  const { deleteEncryptedFile } = await import('./fileStorage.js');
  let deletedCount = 0;
  const fileIdsToDelete = [];

  try {
    db.run('BEGIN TRANSACTION');

    instanceIds.forEach((id) => {
      // Get instance to extract file IDs
      const stmt = db.prepare('SELECT data, subEntityId FROM instances WHERE id = ?');
      stmt.bind([id]);

      if (stmt.step()) {
        const row = stmt.getAsObject();
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;

        // Get schema to identify file fields
        const stmt2 = db.prepare('SELECT schema FROM sub_entities WHERE id = ?');
        stmt2.bind([row.subEntityId]);

        if (stmt2.step()) {
          const subRow = stmt2.getAsObject();
          const schema = typeof subRow.schema === 'string' ? JSON.parse(subRow.schema) : subRow.schema;

          // Extract file IDs
          schema.forEach((field) => {
            if ((field.type === 'image' || field.type === 'file') && data[field.name]) {
              fileIdsToDelete.push(data[field.name]);
            }
          });
        }
        stmt2.free();
      }
      stmt.free();

      // Delete instance
      db.run('DELETE FROM instances WHERE id = ?', [id]);
      deletedCount++;
    });

    db.run('COMMIT');

    // Delete files after transaction
    if (fileIdsToDelete.length > 0) {
      fileIdsToDelete.forEach((fileId) => {
        try {
          deleteEncryptedFile(fileId);
        } catch (err) {
          console.warn(`[bulk-delete] failed to delete file ${fileId}:`, err.message);
        }
      });
    }

    return { deleted: deletedCount };
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

/**
 * API: POST /api/bulk-delete-instances
 */
export async function handleBulkDeleteInstances(req, res, db, key, dbPath) {
  try {
    const { instanceIds } = req.body;

    const result = bulkDeleteInstances(db, instanceIds, key);

    // Persist DB to disk
    if (key && dbPath) {
      const { writeEncryptedDatabase } = await import('./database.js');
      writeEncryptedDatabase(dbPath, db, key);
    }

    res.json({ deleted: result.deleted, message: `Deleted ${result.deleted} instance(s)` });
  } catch (err) {
    console.error('[bulk-ops] delete failed:', err.message);
    res.status(500).json({ error: 'Delete failed: ' + err.message });
  }
}

/**
 * Bulk-delete sub-entities (with cascade count)
 */
export async function bulkDeleteSubEntities(db, subEntityIds, key) {
  if (!Array.isArray(subEntityIds) || subEntityIds.length === 0) {
    throw new Error('No sub-entity IDs provided');
  }

  const { deleteEncryptedFile } = await import('./fileStorage.js');
  let deletedCount = 0;
  const fileIdsToDelete = [];

  try {
    db.run('BEGIN TRANSACTION');

    subEntityIds.forEach((id) => {
      // Get all instances to extract file IDs (before cascade delete)
      const stmt = db.prepare('SELECT data, subEntityId FROM instances WHERE subEntityId = ?');
      stmt.bind([id]);

      while (stmt.step()) {
        const row = stmt.getAsObject();
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;

        // Get schema
        const stmt2 = db.prepare('SELECT schema FROM sub_entities WHERE id = ?');
        stmt2.bind([id]);

        if (stmt2.step()) {
          const subRow = stmt2.getAsObject();
          const schema = typeof subRow.schema === 'string' ? JSON.parse(subRow.schema) : subRow.schema;

          schema.forEach((field) => {
            if ((field.type === 'image' || field.type === 'file') && data[field.name]) {
              fileIdsToDelete.push(data[field.name]);
            }
          });
        }
        stmt2.free();
      }
      stmt.free();

      // Delete sub-entity (cascades to instances)
      db.run('DELETE FROM sub_entities WHERE id = ?', [id]);
      deletedCount++;
    });

    db.run('COMMIT');

    // Delete files after transaction
    if (fileIdsToDelete.length > 0) {
      fileIdsToDelete.forEach((fileId) => {
        try {
          deleteEncryptedFile(fileId);
        } catch (err) {
          console.warn(`[bulk-delete] failed to delete file ${fileId}:`, err.message);
        }
      });
    }

    return { deleted: deletedCount };
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

/**
 * API: POST /api/bulk-delete-sub-entities
 */
export async function handleBulkDeleteSubEntities(req, res, db, key, dbPath) {
  try {
    const { subEntityIds } = req.body;

    const result = bulkDeleteSubEntities(db, subEntityIds, key);

    // Persist DB to disk
    if (key && dbPath) {
      const { writeEncryptedDatabase } = await import('./database.js');
      writeEncryptedDatabase(dbPath, db, key);
    }

    res.json({ deleted: result.deleted, message: `Deleted ${result.deleted} sub-entity(ies)` });
  } catch (err) {
    console.error('[bulk-ops] sub-delete failed:', err.message);
    res.status(500).json({ error: 'Delete failed: ' + err.message });
  }
}

/**
 * Bulk-delete entities (with cascade count)
 */
export async function bulkDeleteEntities(db, entityIds, key) {
  if (!Array.isArray(entityIds) || entityIds.length === 0) {
    throw new Error('No entity IDs provided');
  }

  const { deleteEncryptedFile } = await import('./fileStorage.js');
  let deletedCount = 0;
  const fileIdsToDelete = [];

  try {
    db.run('BEGIN TRANSACTION');

    entityIds.forEach((id) => {
      // Get all instances to extract file IDs (before cascade delete)
      const stmt = db.prepare(`
        SELECT i.data, s.schema FROM instances i
        JOIN sub_entities s ON i.subEntityId = s.id
        WHERE s.entityId = ?
      `);
      stmt.bind([id]);

      while (stmt.step()) {
        const row = stmt.getAsObject();
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        const schema = typeof row.schema === 'string' ? JSON.parse(row.schema) : row.schema;

        schema.forEach((field) => {
          if ((field.type === 'image' || field.type === 'file') && data[field.name]) {
            fileIdsToDelete.push(data[field.name]);
          }
        });
      }
      stmt.free();

      // Delete entity (cascades to sub-entities + instances)
      db.run('DELETE FROM entities WHERE id = ?', [id]);
      deletedCount++;
    });

    db.run('COMMIT');

    // Delete files after transaction
    if (fileIdsToDelete.length > 0) {
      fileIdsToDelete.forEach((fileId) => {
        try {
          deleteEncryptedFile(fileId);
        } catch (err) {
          console.warn(`[bulk-delete] failed to delete file ${fileId}:`, err.message);
        }
      });
    }

    return { deleted: deletedCount };
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

/**
 * API: POST /api/bulk-delete-entities
 */
export async function handleBulkDeleteEntities(req, res, db, key, dbPath) {
  try {
    const { entityIds } = req.body;

    const result = bulkDeleteEntities(db, entityIds, key);

    // Persist DB to disk
    if (key && dbPath) {
      const { writeEncryptedDatabase } = await import('./database.js');
      writeEncryptedDatabase(dbPath, db, key);
    }

    res.json({ deleted: result.deleted, message: `Deleted ${result.deleted} entity(ies)` });
  } catch (err) {
    console.error('[bulk-ops] entity delete failed:', err.message);
    res.status(500).json({ error: 'Delete failed: ' + err.message });
  }
}
