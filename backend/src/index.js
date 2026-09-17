import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import bodyParser from 'body-parser';
import { vaultExists, unlockVault, lockVault, isLocked, sessionState, getDatabase } from './boot.js';
import { saveEncryptedFile } from './fileStorage.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const VAULT_META_PATH = process.env.VAULT_META_PATH || './vault.meta.json';
const DB_PATH = process.env.DB_PATH || './vault.db';

app.use(cors());
app.use(express.json());
app.use(bodyParser.raw({ type: 'application/octet-stream', limit: '100mb' }));

// Middleware: reject all API calls if vault is locked
app.use((req, res, next) => {
  // Allow health check + setup/unlock/session-status/reset endpoints
  if (req.path === '/health' || req.path === '/api/unlock' || req.path === '/api/setup' || req.path === '/api/session/status' || req.path === '/api/unlock/status') {
    return next();
  }

  if (isLocked()) {
    return res.status(401).json({ error: 'Vault is locked' });
  }

  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Setup endpoint (first-time initialization)
app.post('/api/setup', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const vaultInitialized = vaultExists(VAULT_META_PATH);
    console.log(`[setup] vaultExists check returned: ${vaultInitialized}`);

    if (vaultInitialized) {
      return res.status(400).json({ error: 'Vault already initialized' });
    }

    // Setup vault
    console.log('[setup] calling setupNewVault...');
    const { setupNewVault } = await import('./boot.js');
    await setupNewVault(password, VAULT_META_PATH, DB_PATH);
    console.log('[setup] setupNewVault completed');

    // Unlock after setup
    console.log('[setup] calling unlockVault...');
    const { success, error } = await unlockVault(password, VAULT_META_PATH, DB_PATH);

    if (!success) {
      console.error('[setup] unlockVault failed:', error);
      return res.status(500).json({ error });
    }

    console.log('[setup] success');
    return res.json({ message: 'Vault initialized and unlocked' });
  } catch (err) {
    console.error('[setup] error:', err.message, err.stack);
    res.status(500).json({ error: 'Setup failed' });
  }
});

// Unlock endpoint
app.post('/api/unlock', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    if (!vaultExists(VAULT_META_PATH)) {
      return res.status(400).json({ error: 'Vault not initialized' });
    }

    // Validate password (includes backoff check)
    const { validatePassword } = await import('./vaultUnlock.js');
    const validationResult = await validatePassword(password, VAULT_META_PATH);

    if (!validationResult.valid) {
      // Check if we're in a backoff window
      if (validationResult.backoffMs > 0) {
        const backoffSec = Math.ceil(validationResult.backoffMs / 1000);
        return res.status(429).json({
          error: `Too many failed attempts. Try again in ${backoffSec}s.`,
          backoffMs: validationResult.backoffMs,
        });
      }

      return res.status(401).json({ error: 'Invalid password' });
    }

    // Now unlock the vault with the validated key
    const result = await unlockVault(password, VAULT_META_PATH, DB_PATH);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Reset auto-lock timer on successful unlock
    const { resetAutoLockTimer } = await import('./boot.js');
    await resetAutoLockTimer();

    return res.json({ message: 'Unlocked' });
  } catch (err) {
    console.error('[unlock] error:', err.message);
    res.status(500).json({ error: 'Unlock failed' });
  }
});

// Lock endpoint
app.post('/api/lock', (req, res) => {
  lockVault();
  res.json({ message: 'Locked' });
});

// Reset vault endpoint (delete + reinit with new password)
// Only callable when unlocked (extra safety)
app.post('/api/reset-vault', async (req, res) => {
  try {
    if (isLocked()) {
      return res.status(401).json({ error: 'Must be unlocked to reset vault' });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'New password required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Lock current session
    await lockVault();

    // Delete vault files
    try {
      fs.unlinkSync(VAULT_META_PATH);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    try {
      fs.unlinkSync(DB_PATH);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    // Setup new vault with new password
    const { setupNewVault } = await import('./boot.js');
    await setupNewVault(password, VAULT_META_PATH, DB_PATH);

    // Unlock with new password
    const { success, error } = await unlockVault(password, VAULT_META_PATH, DB_PATH);
    if (!success) {
      return res.status(500).json({ error });
    }

    // Reset auto-lock timer
    const { resetAutoLockTimer } = await import('./boot.js');
    await resetAutoLockTimer();

    return res.json({ message: 'Vault reset with new password' });
  } catch (err) {
    console.error('[reset-vault] error:', err.message);
    res.status(500).json({ error: 'Reset failed' });
  }
});

// Unlock status endpoint (check backoff without attempting unlock)
app.get('/api/unlock/status', async (req, res) => {
  try {
    const { getFailedAttempts } = await import('./vaultMeta.js');
    const { checkBackoffWindow } = await import('./backoff.js');

    if (!vaultExists(VAULT_META_PATH)) {
      return res.json({ initialized: false });
    }

    const failedData = getFailedAttempts(VAULT_META_PATH);
    const backoffCheck = checkBackoffWindow(failedData);

    res.json({
      initialized: true,
      failedAttempts: failedData.count,
      backoffActive: !backoffCheck.allowed,
      backoffRemainingMs: backoffCheck.remainingMs,
      backoffRemainingSec: Math.ceil(backoffCheck.remainingMs / 1000),
    });
  } catch (err) {
    console.error('[unlock/status] error:', err.message);
    res.status(500).json({ error: 'Status check failed' });
  }
});

// Session status endpoint
app.get('/api/session/status', (req, res) => {
  const locked = isLocked();
  const now = new Date();
  let remainingMs = null;

  if (!locked && sessionState.unlockedAt && sessionState.lockTimer) {
    const elapsedMs = now - sessionState.unlockedAt;
    remainingMs = Math.max(0, sessionState.lockTimeoutMs - elapsedMs);
  }

  res.json({
    locked,
    initialized: sessionState.initialized,
    unlockedAt: sessionState.unlockedAt ? sessionState.unlockedAt.toISOString() : null,
    remainingMs,
    lockTimeoutMs: sessionState.lockTimeoutMs,
  });
});

// Entity CRUD endpoints
app.post('/api/entities', async (req, res) => {
  const { handleCreateEntity } = await import('./entities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  const DB_PATH = process.env.DB_PATH || './vault.db';
  handleCreateEntity(req, res, db, key, DB_PATH);
});

app.get('/api/entities', async (req, res) => {
  const { handleListEntities } = await import('./entities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  handleListEntities(req, res, db);
});

app.get('/api/entities/:id', async (req, res) => {
  const { handleGetEntity } = await import('./entities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  handleGetEntity(req, res, db);
});

app.put('/api/entities/:id', async (req, res) => {
  const { handleUpdateEntity } = await import('./entities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  const DB_PATH = process.env.DB_PATH || './vault.db';
  handleUpdateEntity(req, res, db, key, DB_PATH);
});

app.get('/api/entities/:id/cascade-count', async (req, res) => {
  const { handleCascadeCount } = await import('./entities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  handleCascadeCount(req, res, db);
});

app.delete('/api/entities/:id', async (req, res) => {
  const { handleDeleteEntity } = await import('./entities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  const DB_PATH = process.env.DB_PATH || './vault.db';
  handleDeleteEntity(req, res, db, key, DB_PATH);
});

// Sub-Entity CRUD endpoints
app.post('/api/entities/:entityId/sub-entities', async (req, res) => {
  const { handleCreateSubEntity } = await import('./subEntities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  const DB_PATH = process.env.DB_PATH || './vault.db';
  handleCreateSubEntity(req, res, db, key, DB_PATH);
});

app.get('/api/entities/:entityId/sub-entities', async (req, res) => {
  const { handleListSubEntities } = await import('./subEntities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  handleListSubEntities(req, res, db);
});

app.get('/api/sub-entities/:id', async (req, res) => {
  const { handleGetSubEntity } = await import('./subEntities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  handleGetSubEntity(req, res, db);
});

app.get('/api/sub-entities/:id/cascade-count', async (req, res) => {
  const { handleCascadeCount } = await import('./subEntities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  handleCascadeCount(req, res, db);
});

app.put('/api/sub-entities/:id', async (req, res) => {
  const { handleUpdateSubEntity } = await import('./subEntities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  const DB_PATH = process.env.DB_PATH || './vault.db';
  handleUpdateSubEntity(req, res, db, key, DB_PATH);
});

app.delete('/api/sub-entities/:id', async (req, res) => {
  const { handleDeleteSubEntity } = await import('./subEntities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  const DB_PATH = process.env.DB_PATH || './vault.db';
  handleDeleteSubEntity(req, res, db, key, DB_PATH);
});

// Schema endpoints
app.put('/api/sub-entities/:id/schema', async (req, res) => {
  const { handleUpdateSchema } = await import('./subEntities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  const DB_PATH = process.env.DB_PATH || './vault.db';
  handleUpdateSchema(req, res, db, key, DB_PATH);
});

app.post('/api/sub-entities/:id/finalize-schema', async (req, res) => {
  const { handleFinalizeSchema } = await import('./subEntities.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  const DB_PATH = process.env.DB_PATH || './vault.db';
  handleFinalizeSchema(req, res, db, key, DB_PATH);
});

// Instance endpoints
app.post('/api/sub-entities/:subEntityId/instances', async (req, res) => {
  const { handleCreateInstance } = await import('./instances.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  handleCreateInstance(req, res, db, key);
});

app.get('/api/sub-entities/:subEntityId/instances', async (req, res) => {
  const { handleListInstances } = await import('./instances.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  handleListInstances(req, res, db);
});

app.get('/api/instances/:id', async (req, res) => {
  const { handleGetInstance } = await import('./instances.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  handleGetInstance(req, res, db);
});

app.put('/api/instances/:id', async (req, res) => {
  const { handleUpdateInstance } = await import('./instances.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  handleUpdateInstance(req, res, db, key);
});

app.delete('/api/instances/:id', async (req, res) => {
  const { handleDeleteInstance } = await import('./instances.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  handleDeleteInstance(req, res, db, key);
});

// Bulk operations endpoints
app.post('/api/sub-entities/:subEntityId/bulk-create', async (req, res) => {
  const { handleBulkCreateInstances } = await import('./bulkOps.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  const DB_PATH = process.env.DB_PATH || './vault.db';
  handleBulkCreateInstances(req, res, db, key, DB_PATH);
});

app.post('/api/bulk-delete-instances', async (req, res) => {
  const { handleBulkDeleteInstances } = await import('./bulkOps.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  const DB_PATH = process.env.DB_PATH || './vault.db';
  handleBulkDeleteInstances(req, res, db, key, DB_PATH);
});

app.post('/api/bulk-delete-sub-entities', async (req, res) => {
  const { handleBulkDeleteSubEntities } = await import('./bulkOps.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  const DB_PATH = process.env.DB_PATH || './vault.db';
  handleBulkDeleteSubEntities(req, res, db, key, DB_PATH);
});

app.post('/api/bulk-delete-entities', async (req, res) => {
  const { handleBulkDeleteEntities } = await import('./bulkOps.js');
  const db = getDatabase();
  if (!db) {
    return res.status(401).json({ error: 'Vault is locked' });
  }
  const { sessionState } = await import('./boot.js');
  const key = sessionState.encryptionKey;
  const DB_PATH = process.env.DB_PATH || './vault.db';
  handleBulkDeleteEntities(req, res, db, key, DB_PATH);
});

// File upload endpoint: POST /api/files/upload
// Expects: multipart/form-data with file field
app.post('/api/files/upload', async (req, res) => {
  try {
    const { ensureFilesDir } = await import('./fileStorage.js');
    ensureFilesDir();

    // For now, accept raw binary post as the file content
    // In production, use multer for multipart handling
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: 'File content required' });
    }

    const { sessionState } = await import('./boot.js');
    const key = sessionState.encryptionKey;

    const fileId = await saveEncryptedFile(req.body, key, req.query.filename || 'unnamed');
    res.status(201).json({ fileId });
  } catch (err) {
    console.error('[file upload] failed:', err.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// File download endpoint: GET /api/files/:fileId
app.get('/api/files/:fileId', async (req, res) => {
  try {
    const { loadEncryptedFile } = await import('./fileStorage.js');
    const { sessionState } = await import('./boot.js');
    const key = sessionState.encryptionKey;

    const { filename, buffer } = loadEncryptedFile(req.params.fileId, key);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('[file download] failed:', err.message);
    res.status(404).json({ error: 'File not found' });
  }
});

// Check orphan files endpoint: GET /api/files/orphans
app.get('/api/files/orphans', async (req, res) => {
  try {
    const { getOrphanStatus } = await import('./fileStorage.js');
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }
    const status = getOrphanStatus(db);
    res.json(status);
  } catch (err) {
    console.error('[orphan status] failed:', err.message);
    res.status(500).json({ error: 'Failed to get orphan status: ' + err.message });
  }
});

// Sweep orphan files endpoint: POST /api/files/sweep-orphans
app.post('/api/files/sweep-orphans', async (req, res) => {
  try {
    const { sweepOrphanFiles } = await import('./fileStorage.js');
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }
    const result = sweepOrphanFiles(db);
    res.json({
      deletedCount: result.deletedCount,
      deletedFileIds: result.deletedFileIds,
      message: `Cleaned up ${result.deletedCount} orphaned file(s)`,
    });
  } catch (err) {
    console.error('[sweep orphans] failed:', err.message);
    res.status(500).json({ error: 'Failed to sweep orphan files: ' + err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
  console.log(`[backend] vault metadata: ${VAULT_META_PATH}`);
  console.log(`[backend] vault database: ${DB_PATH}`);

  if (!vaultExists(VAULT_META_PATH)) {
    console.log('[backend] vault not initialized — POST /api/setup with password to begin');
  }
});

