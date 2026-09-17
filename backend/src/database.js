/**
 * Database abstraction using sql.js + AES-256-GCM encryption.
 * Reads encrypted DB file → decrypts → opens in sql.js → executes queries.
 * On write: modifies in memory → encrypts → writes atomically to disk.
 *
 * Note: This is a Phase 2 prototype using sql.js (pure JS).
 * Production should use better-sqlite3 + SQLCipher for performance.
 */

import fs from 'fs';
import initSqlJs from 'sql.js';
import { encryptAESGCM, decryptAESGCM, AEADError } from './crypto.js';
import { atomicWriteSync } from './atomicWrite.js';

let SQL = null;

/**
 * Initializes the SQL.js library (one-time setup).
 */
async function initSQL() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

/**
 * Reads and decrypts a SQLite database file.
 * Returns a sql.js Database object, or null if file doesn't exist.
 * Throws AEADError if database is corrupted.
 */
export async function readEncryptedDatabase(dbPath, key) {
  await initSQL();

  if (!fs.existsSync(dbPath)) {
    return null;
  }

  try {
    // Read encrypted blob
    const encryptedData = fs.readFileSync(dbPath);

    // Parse encrypted format: { ciphertext, iv, authTag }
    // (stored as JSON blob with base64 encoding)
    const meta = JSON.parse(encryptedData.toString('utf8'));
    const ciphertext = Buffer.from(meta.ciphertext, 'base64');
    const iv = Buffer.from(meta.iv, 'base64');
    const authTag = Buffer.from(meta.authTag, 'base64');

    // Decrypt (may throw AEADError on corruption)
    const plainDBBuffer = decryptAESGCM(ciphertext, iv, authTag, key);

    // Open in sql.js
    return new SQL.Database(plainDBBuffer);
  } catch (err) {
    // Re-throw AEADError as-is (already has clear message)
    if (err instanceof AEADError) {
      throw err;
    }
    throw new Error(`Failed to read encrypted database: ${err.message}`);
  }
}

/**
 * Encrypts and writes a SQLite database to disk.
 * Converts sql.js Database to buffer → encrypts → atomically writes.
 */
export function writeEncryptedDatabase(dbPath, db, key) {
  try {
    // Export sql.js database to buffer
    const plainDBBuffer = db.export();

    // Encrypt
    const { ciphertext, iv, authTag } = encryptAESGCM(plainDBBuffer, key);

    // Store as JSON blob with base64 encoding
    const encrypted = JSON.stringify({
      version: 1,
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    });

    // Atomic write
    atomicWriteSync(dbPath, encrypted, { encoding: 'utf8' });
  } catch (err) {
    throw new Error(`Failed to write encrypted database: ${err.message}`);
  }
}

/**
 * Executes a read query on the database.
 * Returns array of row objects.
 */
export function queryRead(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);

    const rows = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push(row);
    }
    stmt.free();

    return rows;
  } catch (err) {
    throw new Error(`Query failed: ${err.message}`);
  }
}

/**
 * Executes a write query (INSERT/UPDATE/DELETE) on the database.
 * Returns number of rows affected.
 */
export function queryWrite(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();

    return db.getRowsModified();
  } catch (err) {
    throw new Error(`Query failed: ${err.message}`);
  }
}

/**
 * Runs a transaction.
 * If callback throws, transaction is rolled back.
 */
export function runTransaction(db, callback) {
  try {
    db.run('BEGIN TRANSACTION');
    callback();
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

/**
 * Initializes database schema (creates tables if they don't exist).
 */
export function initializeSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sub_entities (
      id TEXT PRIMARY KEY,
      entityId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      schema TEXT,
      schemaFinalized INTEGER DEFAULT 0,
      listItemConfig TEXT,
      detailViewConfig TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (entityId) REFERENCES entities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS instances (
      id TEXT PRIMARY KEY,
      subEntityId TEXT NOT NULL,
      data TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (subEntityId) REFERENCES sub_entities(id) ON DELETE CASCADE
    );
  `);
}

/**
 * Verify database integrity on boot (post-unlock).
 * Runs PRAGMA integrity_check, validates schema, checks foreign keys.
 * Returns { ok: boolean, warnings: string[], errors: string[] }
 */
export function verifyDatabaseIntegrity(db) {
  const warnings = [];
  const errors = [];

  try {
    // Run PRAGMA integrity_check (built-in SQLite check)
    const results = queryRead(db, 'PRAGMA integrity_check');
    if (results.length > 0 && results[0].integrity_check !== 'ok') {
      errors.push('SQLite integrity check failed: ' + results[0].integrity_check);
    }

    // Check for foreign key constraints
    try {
      const fkResults = queryRead(db, 'PRAGMA foreign_key_check');
      if (fkResults && fkResults.length > 0) {
        warnings.push(`Found ${fkResults.length} foreign key constraint violations (can be auto-repaired)`);
      }
    } catch (fkErr) {
      // Some SQLite builds don't support foreign_key_check; that's OK
    }

    // Verify tables exist
    const tables = queryRead(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('entities', 'sub_entities', 'instances')"
    );
    if (tables.length !== 3) {
      errors.push('Database schema incomplete: missing tables');
    }

    // Basic row counts (early warning if something looks very wrong)
    const counts = queryRead(db, 'SELECT COUNT(*) as cnt FROM entities');
    if (!counts || counts.length === 0) {
      warnings.push('Could not read row count (minor issue)');
    }

    return {
      ok: errors.length === 0,
      warnings,
      errors,
      checked: true,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      warnings,
      errors: [err.message],
      checked: true,
      timestamp: new Date().toISOString(),
    };
  }
}
