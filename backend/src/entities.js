/**
/**
 * Entity CRUD operations
 */

/**
 * Generate ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Create entity
 */
export function createEntity(db, name, description = '') {
  const id = generateId();
  const now = new Date().toISOString();

  const sql = `
    INSERT INTO entities (id, name, description, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [id, name, description, now, now]);
  return { id, name, description, createdAt: now, updatedAt: now };
}

/**
 * List all entities
 */
export function listEntities(db) {
  const sql = `
    SELECT id, name, description, createdAt, updatedAt
    FROM entities
    ORDER BY createdAt DESC
  `;

  const stmt = db.prepare(sql);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();

  return rows;
}

/**
 * Get entity by ID
 */
export function getEntity(db, id) {
  const sql = `
    SELECT id, name, description, createdAt, updatedAt
    FROM entities
    WHERE id = ?
  `;

  const stmt = db.prepare(sql);
  stmt.bind([id]);
  const found = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();

  return found;
}

/**
 * Update entity
 */
export function updateEntity(db, id, name, description = '') {
  const now = new Date().toISOString();

  const sql = `
    UPDATE entities
    SET name = ?, description = ?, updatedAt = ?
    WHERE id = ?
  `;

  db.run(sql, [name, description, now, id]);
  return getEntity(db, id);
}

/**
 * Count cascade impact for entity delete
 * Returns: { subEntities, instances }
 */
export function countCascadeImpact(db, entityId) {
  // Count sub-entities
  let stmt = db.prepare('SELECT COUNT(*) as count FROM sub_entities WHERE entityId = ?');
  stmt.bind([entityId]);
  stmt.step();
  const subEntityCount = stmt.getAsObject().count;
  stmt.free();

  // Count instances across all sub-entities of this entity
  stmt = db.prepare(`
    SELECT COUNT(*) as count FROM instances
    WHERE subEntityId IN (
      SELECT id FROM sub_entities WHERE entityId = ?
    )
  `);
  stmt.bind([entityId]);
  stmt.step();
  const instanceCount = stmt.getAsObject().count;
  stmt.free();

  return {
    subEntities: subEntityCount,
    instances: instanceCount,
  };
}

/**
 * Delete entity (cascades to sub-entities + instances)
 */
export function deleteEntity(db, id) {
  const sql = 'DELETE FROM entities WHERE id = ?';
  db.run(sql, [id]);
}

/**
 * API: POST /api/entities (create)
 */
export async function handleCreateEntity(req, res, db, key, dbPath) {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Entity name required' });
    }

    const entity = createEntity(db, name.trim(), description || '');
    
    // Persist DB to disk
    if (key && dbPath) {
      console.log('[entities] persisting DB after create, key present:', !!key, 'dbPath:', dbPath);
      const { writeEncryptedDatabase } = await import('./database.js');
      writeEncryptedDatabase(dbPath, db, key);
      console.log('[entities] DB persisted successfully');
    } else {
      console.warn('[entities] NOT persisting: key=', !!key, 'dbPath=', dbPath);
    }
    
    res.status(201).json(entity);
  } catch (err) {
    console.error('[entities] create failed:', err.message);
    res.status(500).json({ error: 'Create failed' });
  }
}

/**
 * API: GET /api/entities (list)
 */
export async function handleListEntities(req, res, db) {
  try {
    const entities = listEntities(db);
    res.json(entities);
  } catch (err) {
    console.error('[entities] list failed:', err.message);
    res.status(500).json({ error: 'List failed' });
  }
}

/**
 * API: GET /api/entities/:id (get)
 */
export async function handleGetEntity(req, res, db) {
  try {
    const { id } = req.params;
    const entity = getEntity(db, id);

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json(entity);
  } catch (err) {
    console.error('[entities] get failed:', err.message);
    res.status(500).json({ error: 'Get failed' });
  }
}

/**
 * API: PUT /api/entities/:id (update)
 */
export async function handleUpdateEntity(req, res, db, key, dbPath) {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Entity name required' });
    }

    const entity = getEntity(db, id);
    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const updated = updateEntity(db, id, name.trim(), description || '');
    
    // Persist DB to disk
    if (key && dbPath) {
      const { writeEncryptedDatabase } = await import('./database.js');
      writeEncryptedDatabase(dbPath, db, key);
    }
    
    res.json(updated);
  } catch (err) {
    console.error('[entities] update failed:', err.message);
    res.status(500).json({ error: 'Update failed' });
  }
}

/**
 * API: DELETE /api/entities/:id/cascade-count (preflight)
 */
export async function handleCascadeCount(req, res, db) {
  try {
    const { id } = req.params;
    const entity = getEntity(db, id);

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const impact = countCascadeImpact(db, id);
    res.json(impact);
  } catch (err) {
    console.error('[entities] cascade-count failed:', err.message);
    res.status(500).json({ error: 'Count failed' });
  }
}

/**
 * API: DELETE /api/entities/:id (delete)
 */
export async function handleDeleteEntity(req, res, db, key, dbPath) {
  try {
    const { id } = req.params;
    const entity = getEntity(db, id);

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    deleteEntity(db, id);
    
    // Persist DB to disk
    if (key && dbPath) {
      const { writeEncryptedDatabase } = await import('./database.js');
      writeEncryptedDatabase(dbPath, db, key);
    }
    
    res.json({ message: 'Entity deleted' });
  } catch (err) {
    console.error('[entities] delete failed:', err.message);
    res.status(500).json({ error: 'Delete failed' });
  }
}
