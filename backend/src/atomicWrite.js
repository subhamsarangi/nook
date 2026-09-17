/**
 * Atomic file write helper.
 * Prevents corruption from interrupted writes by using temp file + fsync + rename.
 * Pattern: write to temp file → fsync → rename to target (atomic on NTFS/ext4)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Atomically writes content to a file (sync).
 * Crash-safe on Windows + Unix.
 *
 * Pattern: write to temp file → fsync → rename to target (atomic operation)
 *
 * @param {string} filePath - Target file path
 * @param {string | Buffer} content - Content to write
 * @param {object} options - { encoding: 'utf8' (default) }
 */
export function atomicWriteSync(filePath, content, options = {}) {
  const encoding = options.encoding || 'utf8';
  const dir = path.dirname(filePath);
  const fileName = path.basename(filePath);
  
  // Generate unique temp filename to avoid collisions
  const tempFileName = `.${fileName}.tmp.${crypto.randomBytes(4).toString('hex')}`;
  const tempPath = path.join(dir, tempFileName);

  try {
    // Write to temp file with fd, fsync immediately, then close
    // This ensures data is flushed before we rename
    const fd = fs.openSync(tempPath, 'w');
    try {
      // Write content to the open file
      if (typeof content === 'string') {
        fs.writeSync(fd, content, 0, encoding);
      } else {
        fs.writeSync(fd, content);
      }
      // Flush to disk (works on Windows + Unix)
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    // Atomic rename (overwrites target if it exists)
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    // Clean up temp file if it still exists
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(`Atomic write failed: ${err.message}`);
  }
}
