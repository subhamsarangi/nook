import fs from 'fs';
import path from 'path';

/**
 * Manages vault.meta.json — plaintext metadata for the vault.
 * Contains: salt, KDF params, verifier ciphertext, failed-attempt counter.
 * Never contains the password or plaintext key.
 */

const DEFAULT_META = {
  version: 1,
  salt: null,
  kdfParams: null,
  verifierCiphertext: null, // base64-encoded { ciphertext, iv, authTag }
  failedAttempts: 0,
  lastFailedAttempt: null,
  createdAt: null,
  updatedAt: null,
};

/**
 * Reads vault.meta.json from disk. Returns null if file doesn't exist or is invalid.
 */
export function readMeta(metaPath) {
  try {
    if (!fs.existsSync(metaPath)) {
      return null;
    }
    const content = fs.readFileSync(metaPath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    // Could be file read error or JSON parse error — treat as not initialized
    if (err.code === 'ENOENT') {
      return null;
    }
    // For other errors, let them propagate (actual I/O issues)
    // But for JSON parse errors, treat as corrupted/invalid
    if (err instanceof SyntaxError) {
      return null;
    }
    throw new Error(`Failed to read vault.meta.json: ${err.message}`);
  }
}

/**
 * Initializes vault.meta.json on first setup.
 * Stores: salt (base64), kdfParams, empty verifier placeholder.
 */
export function initializeMeta(metaPath, salt, kdfParams) {
  const meta = {
    ...DEFAULT_META,
    salt: salt.toString('base64'),
    kdfParams,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  writeMetaSync(metaPath, meta);
  return meta;
}

/**
 * Stores the encrypted verifier in vault.meta.json.
 * verifierData: { ciphertext (Buffer), iv (Buffer), authTag (Buffer) }
 */
export function storeVerifier(metaPath, verifierData) {
  const meta = readMeta(metaPath);
  if (!meta) {
    throw new Error('vault.meta.json does not exist');
  }

  meta.verifierCiphertext = JSON.stringify({
    ciphertext: verifierData.ciphertext.toString('base64'),
    iv: verifierData.iv.toString('base64'),
    authTag: verifierData.authTag.toString('base64'),
  });

  meta.updatedAt = new Date().toISOString();
  writeMetaSync(metaPath, meta);
}

/**
 * Retrieves the encrypted verifier from vault.meta.json.
 * Returns: { ciphertext (Buffer), iv (Buffer), authTag (Buffer) }
 */
export function getVerifier(metaPath) {
  const meta = readMeta(metaPath);
  if (!meta || !meta.verifierCiphertext) {
    throw new Error('Verifier not found in vault.meta.json');
  }

  const parsed = JSON.parse(meta.verifierCiphertext);
  return {
    ciphertext: Buffer.from(parsed.ciphertext, 'base64'),
    iv: Buffer.from(parsed.iv, 'base64'),
    authTag: Buffer.from(parsed.authTag, 'base64'),
  };
}

/**
 * Increments failed-attempt counter and updates timestamp.
 */
export function incrementFailedAttempts(metaPath) {
  const meta = readMeta(metaPath);
  if (!meta) {
    throw new Error('vault.meta.json does not exist');
  }

  meta.failedAttempts = (meta.failedAttempts || 0) + 1;
  meta.lastFailedAttempt = new Date().toISOString();
  meta.updatedAt = new Date().toISOString();

  writeMetaSync(metaPath, meta);
  return meta.failedAttempts;
}

/**
 * Resets failed-attempt counter on successful unlock.
 */
export function resetFailedAttempts(metaPath) {
  const meta = readMeta(metaPath);
  if (!meta) {
    throw new Error('vault.meta.json does not exist');
  }

  meta.failedAttempts = 0;
  meta.lastFailedAttempt = null;
  meta.updatedAt = new Date().toISOString();

  writeMetaSync(metaPath, meta);
}

/**
 * Gets the current failed-attempt count and last-attempt timestamp.
 */
export function getFailedAttempts(metaPath) {
  const meta = readMeta(metaPath);
  if (!meta) {
    return { count: 0, lastAttempt: null };
  }

  return {
    count: meta.failedAttempts || 0,
    lastAttempt: meta.lastFailedAttempt || null,
  };
}

/**
 * Synchronously writes vault.meta.json to disk.
 * (Atomic writes via temp file + rename handled elsewhere; this is the basic write.)
 */
function writeMetaSync(metaPath, meta) {
  const content = JSON.stringify(meta, null, 2);
  fs.writeFileSync(metaPath, content, 'utf8');
}

/**
 * Checks if vault has been initialized (meta file exists and has a verifier).
 */
export function isVaultInitialized(metaPath) {
  const meta = readMeta(metaPath);
  return meta && meta.verifierCiphertext !== null;
}
