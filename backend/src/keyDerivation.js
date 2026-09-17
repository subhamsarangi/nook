/**
 * Re-export crypto utilities for cleaner import paths.
 * This module is the public API for key derivation and encryption.
 */

export {
  deriveKeyFromPassword,
  encryptAESGCM,
  decryptAESGCM,
  timingSafeCompare,
  zeroBuffer,
} from './crypto.js';
