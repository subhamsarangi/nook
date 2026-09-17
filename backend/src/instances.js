/**
 * Instance CRUD operations
 * Instances are data records created against a finalized SubEntity schema.
 */

import { deleteFiles } from './fileStorage.js';

/**
 * Generate ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Extract file IDs from instance data (for cleanup on delete)
 */
function extractFileIds(data, schema) {
  if (!Array.isArray(schema)) return [];

  const fileIds = [];
  schema.forEach((field) => {
    if ((field.type === 'image' || field.type === 'file') && data[field.name]) {
      fileIds.push(data[field.name]);
    }
  });

  return fileIds;
}

/**
 * Create instance
 */
export function createInstance(db, subEntityId, data) {
  const id = generateId();
  const now = new Date().toISOString();

  // Get schema to validate and extract file IDs
  const stmt = db.prepare('SELECT schema FROM sub_entities WHERE id = ?');
  stmt.bind([subEntityId]);
  let schema = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    schema = typeof row.schema === 'string' ? JSON.parse(row.schema) : row.schema;
  }
  stmt.free();

  const sql = `
    INSERT INTO instances (id, subEntityId, data, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [id, subEntityId, JSON.stringify(data), now, now]);

  return {
    id,
    subEntityId,
    data,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get instance by ID
 */
export function getInstance(db, id) {
  const sql = `
    SELECT id, subEntityId, data, createdAt, updatedAt
    FROM instances
    WHERE id = ?
  `;

  const stmt = db.prepare(sql);
  stmt.bind([id]);
  let found = null;

  if (stmt.step()) {
    const row = stmt.getAsObject();
    found = {
      ...row,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    };
  }

  stmt.free();
  return found;
}

/**
 * List instances for a sub-entity
 */
export function listInstances(db, subEntityId) {
  const sql = `
    SELECT id, subEntityId, data, createdAt, updatedAt
    FROM instances
    WHERE subEntityId = ?
    ORDER BY createdAt DESC
  `;

  const stmt = db.prepare(sql);
  stmt.bind([subEntityId]);
  const rows = [];

  while (stmt.step()) {
    const row = stmt.getAsObject();
    rows.push({
      ...row,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    });
  }

  stmt.free();
  return rows;
}

/**
 * Update instance (with file cleanup for replaced files)
 */
export function updateInstance(db, id, data, key) {
  const now = new Date().toISOString();

  // Get old instance to detect file replacements
  const oldInstance = getInstance(db, id);
  if (oldInstance) {
    // Get schema
    const stmt = db.prepare('SELECT schema FROM sub_entities WHERE id = ?');
    stmt.bind([oldInstance.subEntityId]);
    let schema = null;

    if (stmt.step()) {
      const row = stmt.getAsObject();
      schema = typeof row.schema === 'string' ? JSON.parse(row.schema) : row.schema;
    }
    stmt.free();

    // Find file fields that changed
    if (Array.isArray(schema)) {
      schema.forEach((field) => {
        if ((field.type === 'image' || field.type === 'file')) {
          const oldFileId = oldInstance.data[field.name];
          const newFileId = data[field.name];

          // If file changed and old one exists, delete it
          if (oldFileId && oldFileId !== newFileId) {
            deleteFiles([oldFileId]);
          }
        }
      });
    }
  }

  const sql = `
    UPDATE instances
    SET data = ?, updatedAt = ?
    WHERE id = ?
  `;

  db.run(sql, [JSON.stringify(data), now, id]);
  return getInstance(db, id);
}

/**
 * Delete instance (with file cleanup)
 */
export function deleteInstance(db, id, key) {
  const instance = getInstance(db, id);

  if (!instance) {
    throw new Error('Instance not found');
  }

  // Get schema to extract file IDs for cleanup
  const stmt = db.prepare('SELECT schema FROM sub_entities WHERE id = ?');
  stmt.bind([instance.subEntityId]);
  let schema = null;

  if (stmt.step()) {
    const row = stmt.getAsObject();
    schema = typeof row.schema === 'string' ? JSON.parse(row.schema) : row.schema;
  }
  stmt.free();

  // Extract and delete file IDs
  const fileIds = extractFileIds(instance.data, schema);
  if (fileIds.length > 0) {
    deleteFiles(fileIds);
  }

  // Delete instance
  const sql = 'DELETE FROM instances WHERE id = ?';
  db.run(sql, [id]);
}

/**
 * API: POST /api/sub-entities/:subEntityId/instances (create)
 */
export async function handleCreateInstance(req, res, db, key) {
  try {
    const { subEntityId } = req.params;
    const { data } = req.body;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Instance data required' });
    }

    // Check sub-entity exists
    const stmt = db.prepare('SELECT id, schemaFinalized FROM sub_entities WHERE id = ?');
    stmt.bind([subEntityId]);
    let schemaFinalized = false;

    if (stmt.step()) {
      const row = stmt.getAsObject();
      schemaFinalized = row.schemaFinalized;
    } else {
      stmt.free();
      return res.status(404).json({ error: 'Sub-entity not found' });
    }

    stmt.free();

    // Enforce: schema must be finalized
    if (!schemaFinalized) {
      return res.status(400).json({ error: 'Schema must be finalized before creating instances' });
    }

    const instance = createInstance(db, subEntityId, data);
    
    // Persist database changes
    const { writeEncryptedDatabase } = await import('./database.js');
    const dbPath = process.env.DB_PATH || './vault.db';
    if (key && dbPath) {
      writeEncryptedDatabase(dbPath, db, key);
    }
    
    res.status(201).json(instance);
  } catch (err) {
    console.error('[instances] create failed:', err.message);
    res.status(500).json({ error: 'Create failed' });
  }
}

/**
 * API: GET /api/sub-entities/:subEntityId/instances (list)
 */
export async function handleListInstances(req, res, db) {
  try {
    const { subEntityId } = req.params;

    // Check sub-entity exists
    const stmt = db.prepare('SELECT id FROM sub_entities WHERE id = ?');
    stmt.bind([subEntityId]);

    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Sub-entity not found' });
    }

    stmt.free();

    const instances = listInstances(db, subEntityId);
    res.json(instances);
  } catch (err) {
    console.error('[instances] list failed:', err.message);
    res.status(500).json({ error: 'List failed' });
  }
}

/**
 * API: GET /api/instances/:id (get)
 */
export async function handleGetInstance(req, res, db) {
  try {
    const { id } = req.params;
    const instance = getInstance(db, id);

    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    res.json(instance);
  } catch (err) {
    console.error('[instances] get failed:', err.message);
    res.status(500).json({ error: 'Get failed' });
  }
}

/**
 * API: PUT /api/instances/:id (update)
 */
export async function handleUpdateInstance(req, res, db, key) {
  try {
    const { id } = req.params;
    const { data } = req.body;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Instance data required' });
    }

    const instance = getInstance(db, id);

    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const updated = updateInstance(db, id, data, key);
    
    // Persist database changes
    const { writeEncryptedDatabase } = await import('./database.js');
    const dbPath = process.env.DB_PATH || './vault.db';
    if (key && dbPath) {
      writeEncryptedDatabase(dbPath, db, key);
    }
    
    res.json(updated);
  } catch (err) {
    console.error('[instances] update failed:', err.message);
    res.status(500).json({ error: 'Update failed' });
  }
}

/**
 * API: DELETE /api/instances/:id (delete)
 */
export async function handleDeleteInstance(req, res, db, key) {
  try {
    const { id } = req.params;

    deleteInstance(db, id, key);
    
    // Persist database changes
    const { writeEncryptedDatabase } = await import('./database.js');
    const dbPath = process.env.DB_PATH || './vault.db';
    if (key && dbPath) {
      writeEncryptedDatabase(dbPath, db, key);
    }
    
    res.json({ message: 'Instance deleted' });
  } catch (err) {
    console.error('[instances] delete failed:', err.message);
    res.status(500).json({ error: 'Delete failed' });
  }
}
