import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import { vaultExists, unlockVault, lockVault, isLocked, sessionState } from './boot.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const VAULT_META_PATH = process.env.VAULT_META_PATH || './vault.meta.json';
const DB_PATH = process.env.DB_PATH || './vault.db';

app.use(cors());
app.use(express.json());

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

// Start server
app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
  console.log(`[backend] vault metadata: ${VAULT_META_PATH}`);
  console.log(`[backend] vault database: ${DB_PATH}`);

  if (!vaultExists(VAULT_META_PATH)) {
    console.log('[backend] vault not initialized — POST /api/setup with password to begin');
  }
});

