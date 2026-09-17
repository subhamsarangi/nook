/**
 * Vault unlock flow.
 * Reads salt from vault.meta.json → derives key from password → decrypts + validates verifier
 */

import { deriveKeyFromPassword, decryptAESGCM, timingSafeCompare, zeroBuffer } from './crypto.js';
import { readMeta, getVerifier, incrementFailedAttempts, resetFailedAttempts, getFailedAttempts } from './vaultMeta.js';
import { checkBackoffWindow } from './backoff.js';

const VERIFIER_PLAINTEXT = Buffer.from('VAULT_INITIALIZED', 'utf8');

/**
 * Validates a password against the vault.
 * Reads salt from meta → derives key → attempts to decrypt verifier.
 *
 * @param {string} password - User's password attempt
 * @param {string} metaPath - Path to vault.meta.json
 * @returns {Promise<{ valid: boolean, key: Buffer | null, backoffMs: number }>}
 *
 * On success: { valid: true, key: Buffer (32-byte), backoffMs: 0 }
 * On backoff: { valid: false, key: null, backoffMs: N }
 * On failure: { valid: false, key: null, backoffMs: 0 }
 *
 * Caller MUST zero the returned key when done (if not null).
 */
export async function validatePassword(password, metaPath) {
  try {
    // Check backoff window first
    const failedData = getFailedAttempts(metaPath);
    const backoffCheck = checkBackoffWindow(failedData);

    if (!backoffCheck.allowed) {
      return { valid: false, key: null, backoffMs: backoffCheck.remainingMs };
    }

    const meta = readMeta(metaPath);
    if (!meta || !meta.salt) {
      return { valid: false, key: null, backoffMs: 0 };
    }

    // Reconstruct salt from base64
    const salt = Buffer.from(meta.salt, 'base64');

    // Derive key using the same KDF params stored in meta
    const { key } = await deriveKeyFromPassword(password, salt);

    try {
      // Retrieve encrypted verifier
      const verifierData = getVerifier(metaPath);

      // Attempt decryption
      const decrypted = decryptAESGCM(
        verifierData.ciphertext,
        verifierData.iv,
        verifierData.authTag,
        key
      );

      // Timing-safe comparison of decrypted vs. expected
      const isValid = timingSafeCompare(decrypted, VERIFIER_PLAINTEXT);

      if (isValid) {
        // Password is correct; reset failed-attempt counter
        resetFailedAttempts(metaPath);
        return { valid: true, key, backoffMs: 0 };
      } else {
        // Decryption succeeded but verifier doesn't match (shouldn't happen)
        incrementFailedAttempts(metaPath);
        zeroBuffer(key);
        return { valid: false, key: null, backoffMs: 0 };
      }
    } catch (err) {
      // Decryption failed (corrupted data, wrong key, etc.)
      incrementFailedAttempts(metaPath);
      zeroBuffer(key);
      return { valid: false, key: null, backoffMs: 0 };
    }
  } catch (err) {
    // Generic error; treat as validation failure
    return { valid: false, key: null, backoffMs: 0 };
  }
}
