/**
 * Boot sequence for the vault server.
 * On first run: prompts for password → sets up vault.
 * On subsequent runs: unlocked via password → restores session.
 *
 * This handles the initialization logic; the actual HTTP endpoints
 * are in a separate routes module.
 */

import { isVaultInitialized } from './vaultMeta.js';
import { setupVault } from './vaultSetup.js';
import { validatePassword } from './vaultUnlock.js';
import { readEncryptedDatabase, initializeSchema } from './database.js';

/**
 * Global state for current session.
 * Not persisted; lost on shutdown or auto-lock.
 */
export const sessionState = {
  initialized: false,
  locked: true,
  encryptionKey: null,
  database: null,
  unlockedAt: null,
  lockTimer: null,
  lockTimeoutMs: 15 * 60 * 1000, // 15 minutes
};

/**
 * Checks if vault exists and is initialized.
 */
export function vaultExists(metaPath) {
  return isVaultInitialized(metaPath);
}

/**
 * First-time vault setup: creates vault.meta.json + encrypts verifier.
 * Does NOT start a session (that happens after).
 *
 * @param {string} password - User's vault password
 * @param {string} metaPath - Path to vault.meta.json
 * @param {string} dbPath - Path to vault.db
 */
export async function setupNewVault(password, metaPath, dbPath) {
  const { salt, kdfParams } = await setupVault(password, metaPath);

  // Create an empty encrypted database
  const { deriveKeyFromPassword } = await import('./crypto.js');
  const keyResult = await deriveKeyFromPassword(password, Buffer.from(salt, 'base64'));
  const key = keyResult.key;
  
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  initializeSchema(db);

  const { writeEncryptedDatabase } = await import('./database.js');
  writeEncryptedDatabase(dbPath, db, key);

  const { zeroBuffer } = await import('./crypto.js');
  zeroBuffer(key);

  return { salt, kdfParams };
}

/**
 * Attempts to unlock the vault with a password.
 *
 * @param {string} password - Password attempt
 * @param {string} metaPath - Path to vault.meta.json
 * @param {string} dbPath - Path to vault.db
 * @returns {Promise<{ success: boolean, error?: string }>}
 *
 * On success: loads DB into memory, sets sessionState.encryptionKey + .database
 * On failure: returns { success: false, error: "..." }
 */
export async function unlockVault(password, metaPath, dbPath) {
  // Validate password
  const { valid, key } = await validatePassword(password, metaPath);

  if (!valid) {
    return { success: false, error: 'Invalid password' };
  }

  try {
    // Read encrypted database
    const { readEncryptedDatabase } = await import('./database.js');
    const db = await readEncryptedDatabase(dbPath, key);

    if (!db) {
      // Database doesn't exist yet; create empty one
      const { initSqlJs } = await import('sql.js').then(m => ({ initSqlJs: m.default }));
      const SQL = await initSqlJs();
      const newDb = new SQL.Database();
      initializeSchema(newDb);

      sessionState.database = newDb;
      sessionState.encryptionKey = key;
      sessionState.locked = false;
      sessionState.unlockedAt = new Date();
      sessionState.initialized = true;

      return { success: true };
    }

    // Store session state
    sessionState.database = db;
    sessionState.encryptionKey = key;
    sessionState.locked = false;
    sessionState.unlockedAt = new Date();
    sessionState.initialized = true;

    // Start auto-lock timer
    await resetAutoLockTimer();

    return { success: true };
  } catch (err) {
    // Zero the key on error
    const { zeroBuffer } = await import('./crypto.js');
    zeroBuffer(key);

    return { success: false, error: `Unlock failed: ${err.message}` };
  }
}

/**
 * Locks the vault: clears encryption key + DB from memory.
 */
export async function lockVault() {
  if (sessionState.encryptionKey) {
    const { zeroBuffer } = await import('./crypto.js');
    zeroBuffer(sessionState.encryptionKey);
  }

  sessionState.locked = true;
  sessionState.encryptionKey = null;
  sessionState.database = null;
  sessionState.unlockedAt = null;

  if (sessionState.lockTimer) {
    clearTimeout(sessionState.lockTimer);
    sessionState.lockTimer = null;
  }
}

/**
 * Starts the auto-lock timer (15 minutes of inactivity).
 * Call this after every API request that accesses the vault.
 */
export async function resetAutoLockTimer() {
  if (sessionState.lockTimer) {
    clearTimeout(sessionState.lockTimer);
  }

  // 15 minutes = 900,000 ms
  const LOCK_TIMEOUT = 15 * 60 * 1000;

  sessionState.lockTimer = setTimeout(() => {
    console.log('[auto-lock] 15min inactivity timeout reached');
    lockVault();
  }, LOCK_TIMEOUT);
}

/**
 * Checks if the vault is currently locked.
 */
export function isLocked() {
  return sessionState.locked;
}

/**
 * Gets the current session key (for internal use by API endpoints).
 * Returns null if locked.
 */
export function getSessionKey() {
  return sessionState.locked ? null : sessionState.encryptionKey;
}

/**
 * Gets the current database instance.
 * Returns null if locked.
 */
export function getDatabase() {
  return sessionState.locked ? null : sessionState.database;
}
