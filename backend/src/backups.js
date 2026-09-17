/**
 * Rolling backup manager.
 * Creates encrypted backups before major DB/file operations.
 * Keeps last N backups, deletes old ones.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { atomicWriteSync } from './atomicWrite.js';

const BACKUPS_DIR = process.env.BACKUPS_DIR || './backups';
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '5', 10);

/**
 * Ensure backups directory exists
 */
export function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

/**
 * Generate backup filename with timestamp
 */
function generateBackupFilename(reason = 'manual') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const id = crypto.randomBytes(4).toString('hex');
  return `backup_${timestamp}_${reason}_${id}.json`;
}

/**
 * Create encrypted backup of DB file before an operation.
 * Returns backup filename on success.
 */
export function createDBBackup(dbPath, key, reason = 'write') {
  ensureBackupsDir();

  if (!fs.existsSync(dbPath)) {
    return null; // No DB to backup yet
  }

  try {
    // Read current encrypted DB
    const encryptedData = fs.readFileSync(dbPath);
    const dbMeta = JSON.parse(encryptedData.toString('utf8'));

    // Create backup metadata
    const backupFilename = generateBackupFilename(reason);
    const backupPath = path.join(BACKUPS_DIR, backupFilename);

    // Store backup (encrypted blob + metadata)
    const backup = {
      version: 1,
      reason,
      timestamp: new Date().toISOString(),
      originalDbPath: dbPath,
      // Copy encrypted data (no re-encryption needed—already encrypted)
      ciphertext: dbMeta.ciphertext,
      iv: dbMeta.iv,
      authTag: dbMeta.authTag,
    };

    atomicWriteSync(backupPath, JSON.stringify(backup, null, 2), { encoding: 'utf8' });

    // Cleanup old backups (keep last N)
    cleanupOldBackups();

    return backupFilename;
  } catch (err) {
    console.error('[backup] failed to create DB backup:', err.message);
    throw new Error(`Failed to create backup: ${err.message}`);
  }
}

/**
 * Restore DB from backup file.
 * Writes backup data back to original DB path.
 */
export function restoreDBBackup(backupFilename, dbPath) {
  ensureBackupsDir();

  try {
    const backupPath = path.join(BACKUPS_DIR, backupFilename);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupFilename}`);
    }

    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

    // Restore encrypted DB
    const restored = {
      version: backup.version,
      ciphertext: backup.ciphertext,
      iv: backup.iv,
      authTag: backup.authTag,
    };

    atomicWriteSync(dbPath, JSON.stringify(restored), { encoding: 'utf8' });

    console.log(`[backup] restored DB from ${backupFilename}`);
    return true;
  } catch (err) {
    console.error('[backup] restore failed:', err.message);
    throw new Error(`Failed to restore backup: ${err.message}`);
  }
}

/**
 * List all backup files (sorted by creation time, newest first)
 */
export function listBackups() {
  ensureBackupsDir();

  try {
    const files = fs.readdirSync(BACKUPS_DIR).filter((f) => f.startsWith('backup_') && f.endsWith('.json'));

    // Sort by filename (timestamp embedded in name)
    files.sort().reverse();

    return files.map((filename) => {
      const filePath = path.join(BACKUPS_DIR, filename);
      const stat = fs.statSync(filePath);
      const meta = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      return {
        filename,
        timestamp: meta.timestamp,
        reason: meta.reason,
        size: stat.size,
      };
    });
  } catch (err) {
    console.error('[backup] list failed:', err.message);
    return [];
  }
}

/**
 * Delete backup by filename
 */
export function deleteBackup(backupFilename) {
  ensureBackupsDir();

  try {
    const backupPath = path.join(BACKUPS_DIR, backupFilename);

    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
      console.log(`[backup] deleted ${backupFilename}`);
    }
  } catch (err) {
    console.error('[backup] delete failed:', err.message);
  }
}

/**
 * Clean up old backups, keeping only last N
 */
export function cleanupOldBackups() {
  ensureBackupsDir();

  try {
    const backups = listBackups(); // Already sorted, newest first

    if (backups.length > MAX_BACKUPS) {
      const toDelete = backups.slice(MAX_BACKUPS);
      toDelete.forEach((backup) => deleteBackup(backup.filename));
      console.log(`[backup] cleaned up ${toDelete.length} old backup(s), keeping last ${MAX_BACKUPS}`);
    }
  } catch (err) {
    console.error('[backup] cleanup failed:', err.message);
    // Don't throw—cleanup failure shouldn't break the app
  }
}

/**
 * Get backup status (count and disk usage)
 */
export function getBackupStatus() {
  ensureBackupsDir();

  try {
    const backups = listBackups();
    let totalSize = 0;

    backups.forEach((b) => {
      totalSize += b.size;
    });

    return {
      backupCount: backups.length,
      maxBackups: MAX_BACKUPS,
      totalSizeBytes: totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      backups,
    };
  } catch (err) {
    console.error('[backup] status failed:', err.message);
    return {
      backupCount: 0,
      maxBackups: MAX_BACKUPS,
      totalSizeBytes: 0,
      totalSizeMB: 0,
      backups: [],
      error: err.message,
    };
  }
}
