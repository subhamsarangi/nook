/**
 * Vault initialization flow (first time only).
 * Derives key from password → encrypts verifier → stores in vault.meta.json
 */

import { deriveKeyFromPassword, encryptAESGCM, zeroBuffer } from './crypto.js';
import { initializeMeta, storeVerifier } from './vaultMeta.js';

const VERIFIER_PLAINTEXT = Buffer.from('VAULT_INITIALIZED', 'utf8');

/**
 * Sets up a new vault with the given password.
 * Creates vault.meta.json with salt, KDF params, encrypted verifier.
 *
 * @param {string} password - User's vault password
 * @param {string} metaPath - Path to vault.meta.json
 * @returns {Promise<{ salt, kdfParams }>}
 */
export async function setupVault(password, metaPath) {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  // Derive key + salt from password
  const { key, salt, kdfParams } = await deriveKeyFromPassword(password);

  try {
    // Initialize vault.meta.json with salt and KDF params
    initializeMeta(metaPath, salt, kdfParams);

    // Encrypt a known constant (verifier) with the derived key
    // If we can later decrypt this successfully, we know the password is correct
    const verifierData = encryptAESGCM(VERIFIER_PLAINTEXT, key);

    // Store the encrypted verifier
    storeVerifier(metaPath, verifierData);

    return { salt, kdfParams };
  } finally {
    // Zero the key buffer (security best-practice)
    zeroBuffer(key);
  }
}
