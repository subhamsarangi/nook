/**
 * Sub-Entity CRUD operations
 * Scoped to a parent Entity. Enforces: ≥1 sub-entity per entity.
 */
import { deleteFiles } from './fileStorage.js';

/**
 * Generate ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Create sub-entity
 */
export function createSubEntity(db, entityId, name, description = '') {
  const id = generateId();
  const now = new Date().toISOString();

  const sql = `
    INSERT INTO sub_entities (id, entityId, name, description, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [id, entityId, name, description, now, now]);
  return {
    id,
    entityId,
    name,
    description,
    schema: null,
    schemaFinalized: 0,
    listItemConfig: null,
    detailViewConfig: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * List sub-entities for an entity
 */
export function listSubEntities(db, entityId) {
  const sql = `
    SELECT id, entityId, name, description, schema, schemaFinalized, listItemConfig, detailViewConfig, createdAt, updatedAt
    FROM sub_entities
    WHERE entityId = ?
    ORDER BY createdAt DESC
  `;

  const stmt = db.prepare(sql);
  stmt.bind([entityId]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return rows;
}

/**
 * Get sub-entity by ID
 */
export function getSubEntity(db, id) {
  const sql = `
    SELECT id, entityId, name, description, schema, schemaFinalized, listItemConfig, detailViewConfig, createdAt, updatedAt
    FROM sub_entities
    WHERE id = ?
  `;

  const stmt = db.prepare(sql);
  stmt.bind([id]);
  const found = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();

  return found;
}

/**
 * Update sub-entity
 */
export function updateSubEntity(db, id, name, description = '') {
  const now = new Date().toISOString();

  const sql = `
    UPDATE sub_entities
    SET name = ?, description = ?, updatedAt = ?
    WHERE id = ?
  `;

  db.run(sql, [name, description, now, id]);
  return getSubEntity(db, id);
}

/**
 * Count sub-entities for an entity
 */
export function countSubEntitiesForEntity(db, entityId) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM sub_entities WHERE entityId = ?');
  stmt.bind([entityId]);
  stmt.step();
  const count = stmt.getAsObject().count;
  stmt.free();
  return count;
}

/**
 * Count cascade impact (instances) for sub-entity delete
 */
export function countInstancesForSubEntity(db, subEntityId) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM instances WHERE subEntityId = ?');
  stmt.bind([subEntityId]);
  stmt.step();
  const count = stmt.getAsObject().count;
  stmt.free();
  return count;
}

/**
 * Extract all file IDs for instances belonging to a sub-entity
 */
export function getSubEntityFiles(db, subEntityId) {
  const fileIds = [];

  const stmt = db.prepare('SELECT schema FROM sub_entities WHERE id = ?');
  stmt.bind([subEntityId]);
  let schema = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    try {
      schema = typeof row.schema === 'string' ? JSON.parse(row.schema) : row.schema;
    } catch (e) {}
  }
  stmt.free();

  if (!Array.isArray(schema)) return fileIds;

  const instStmt = db.prepare('SELECT data FROM instances WHERE subEntityId = ?');
  instStmt.bind([subEntityId]);
  while (instStmt.step()) {
    const row = instStmt.getAsObject();
    try {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (data && typeof data === 'object') {
        schema.forEach((field) => {
          if ((field.type === 'image' || field.type === 'file') && data[field.name]) {
            fileIds.push(data[field.name]);
          }
        });
      }
    } catch (e) {}
  }
  instStmt.free();

  return fileIds;
}

/**
 * Delete sub-entity (cascades to instances, and deletes associated files)
 */
export function deleteSubEntity(db, id) {
  const fileIds = getSubEntityFiles(db, id);
  const sql = 'DELETE FROM sub_entities WHERE id = ?';
  db.run(sql, [id]);

  if (fileIds.length > 0) {
    deleteFiles(fileIds);
  }
}

/**
 * API: POST /api/entities/:entityId/sub-entities (create)
 */
export async function handleCreateSubEntity(req, res, db, key, dbPath) {
  try {
    const { entityId } = req.params;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Sub-entity name required' });
    }

    // Check entity exists
    const stmt = db.prepare('SELECT id FROM entities WHERE id = ?');
    stmt.bind([entityId]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Entity not found' });
    }
    stmt.free();

    const subEntity = createSubEntity(db, entityId, name.trim(), description || '');
    
    // Persist DB to disk
    if (key && dbPath) {
      const { writeEncryptedDatabase } = await import('./database.js');
      writeEncryptedDatabase(dbPath, db, key);
    }
    
    res.status(201).json(subEntity);
  } catch (err) {
    console.error('[sub-entities] create failed:', err.message);
    res.status(500).json({ error: 'Create failed' });
  }
}

/**
 * API: GET /api/entities/:entityId/sub-entities (list)
 */
export async function handleListSubEntities(req, res, db) {
  try {
    const { entityId } = req.params;

    // Check entity exists
    const stmt = db.prepare('SELECT id FROM entities WHERE id = ?');
    stmt.bind([entityId]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Entity not found' });
    }
    stmt.free();

    const subEntities = listSubEntities(db, entityId);
    res.json(subEntities);
  } catch (err) {
    console.error('[sub-entities] list failed:', err.message);
    res.status(500).json({ error: 'List failed' });
  }
}

/**
 * API: GET /api/sub-entities/:id (get)
 */
export async function handleGetSubEntity(req, res, db) {
  try {
    const { id } = req.params;
    const subEntity = getSubEntity(db, id);

    if (!subEntity) {
      return res.status(404).json({ error: 'Sub-entity not found' });
    }

    res.json(subEntity);
  } catch (err) {
    console.error('[sub-entities] get failed:', err.message);
    res.status(500).json({ error: 'Get failed' });
  }
}

/**
 * API: PUT /api/sub-entities/:id (update)
 */
export async function handleUpdateSubEntity(req, res, db, key, dbPath) {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Sub-entity name required' });
    }

    const subEntity = getSubEntity(db, id);
    if (!subEntity) {
      return res.status(404).json({ error: 'Sub-entity not found' });
    }

    const updated = updateSubEntity(db, id, name.trim(), description || '');
    
    // Persist DB to disk
    if (key && dbPath) {
      const { writeEncryptedDatabase } = await import('./database.js');
      writeEncryptedDatabase(dbPath, db, key);
    }
    
    res.json(updated);
  } catch (err) {
    console.error('[sub-entities] update failed:', err.message);
    res.status(500).json({ error: 'Update failed' });
  }
}

/**
 * API: GET /api/sub-entities/:id/cascade-count (preflight)
 */
export async function handleCascadeCount(req, res, db) {
  try {
    const { id } = req.params;
    const subEntity = getSubEntity(db, id);

    if (!subEntity) {
      return res.status(404).json({ error: 'Sub-entity not found' });
    }

    const instanceCount = countInstancesForSubEntity(db, id);
    const fileIds = getSubEntityFiles(db, id);
    res.json({ instances: instanceCount, files: fileIds.length });
  } catch (err) {
    console.error('[sub-entities] cascade-count failed:', err.message);
    res.status(500).json({ error: 'Count failed' });
  }
}

/**
 * Update schema on sub-entity
 */
export function updateSubEntitySchema(db, id, schema, schemaFinalized) {
  const now = new Date().toISOString();

  const sql = `
    UPDATE sub_entities
    SET schema = ?, schemaFinalized = ?, updatedAt = ?
    WHERE id = ?
  `;

  db.run(sql, [JSON.stringify(schema), schemaFinalized ? 1 : 0, now, id]);
  return getSubEntity(db, id);
}

/**
 * API: DELETE /api/sub-entities/:id (delete)
 * Enforces: must keep ≥1 sub-entity per entity
 */
export async function handleDeleteSubEntity(req, res, db, key, dbPath) {
  try {
    const { id } = req.params;
    const subEntity = getSubEntity(db, id);

    if (!subEntity) {
      return res.status(404).json({ error: 'Sub-entity not found' });
    }

    // Check if this is the last sub-entity for its entity
    const count = countSubEntitiesForEntity(db, subEntity.entityId);
    if (count <= 1) {
      return res.status(400).json({ error: 'Cannot delete last sub-entity. Entity must have at least one.' });
    }

    deleteSubEntity(db, id);
    
    // Persist DB to disk
    if (key && dbPath) {
      const { writeEncryptedDatabase } = await import('./database.js');
      writeEncryptedDatabase(dbPath, db, key);
    }
    
    res.json({ message: 'Sub-entity deleted' });
  } catch (err) {
    console.error('[sub-entities] delete failed:', err.message);
    res.status(500).json({ error: 'Delete failed' });
  }
}

/**
 * API: PUT /api/sub-entities/:id/schema (update schema)
 * Rejects if schema is already finalized
 */
export async function handleUpdateSchema(req, res, db, key, dbPath) {
  try {
    const { id } = req.params;
    const { schema } = req.body;

    if (!Array.isArray(schema)) {
      return res.status(400).json({ error: 'Schema must be an array of field definitions' });
    }

    const subEntity = getSubEntity(db, id);
    if (!subEntity) {
      return res.status(404).json({ error: 'Sub-entity not found' });
    }

    // Reject if already finalized
    if (subEntity.schemaFinalized) {
      return res.status(400).json({ error: 'Schema is finalized and cannot be modified' });
    }

    const updated = updateSubEntitySchema(db, id, schema, false);
    
    // Persist DB to disk
    if (key && dbPath) {
      const { writeEncryptedDatabase } = await import('./database.js');
      writeEncryptedDatabase(dbPath, db, key);
    }
    
    res.json(updated);
  } catch (err) {
    console.error('[sub-entities] schema update failed:', err.message);
    res.status(500).json({ error: 'Schema update failed' });
  }
}

/**
 * API: POST /api/sub-entities/:id/finalize-schema (finalize)
 * Locks the schema; cannot be modified after this
 */
export async function handleFinalizeSchema(req, res, db, key, dbPath) {
  try {
    const { id } = req.params;
    const subEntity = getSubEntity(db, id);

    if (!subEntity) {
      return res.status(404).json({ error: 'Sub-entity not found' });
    }

    // Already finalized?
    if (subEntity.schemaFinalized) {
      return res.status(400).json({ error: 'Schema is already finalized' });
    }

    // Schema must exist
    if (!subEntity.schema) {
      return res.status(400).json({ error: 'Schema is empty; cannot finalize' });
    }

    const schema = typeof subEntity.schema === 'string' ? JSON.parse(subEntity.schema) : subEntity.schema;
    if (!Array.isArray(schema) || schema.length === 0) {
      return res.status(400).json({ error: 'Schema must have at least one field' });
    }

    const updated = updateSubEntitySchema(db, id, schema, true);
    
    // Persist DB to disk
    if (key && dbPath) {
      const { writeEncryptedDatabase } = await import('./database.js');
      writeEncryptedDatabase(dbPath, db, key);
    }
    
    res.json(updated);
  } catch (err) {
    console.error('[sub-entities] finalize failed:', err.message);
    res.status(500).json({ error: 'Finalize failed' });
  }
}
