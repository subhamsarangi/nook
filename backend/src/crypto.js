import crypto from 'crypto';
import argon2 from 'argon2';

/**
 * Derives an encryption key from a password using Argon2id.
 * Returns: { key (Buffer), salt (Buffer), kdfParams (object) }
 */
export async function deriveKeyFromPassword(password, salt = null) {
  // Generate random salt if not provided (first-time setup)
  const usedSalt = salt || crypto.randomBytes(16);

  // Argon2id params (memory-intensive, slow to resist brute-force)
  const kdfParams = {
    type: argon2.argon2id,
    memoryCost: 65536,     // 64 MB
    timeCost: 3,           // 3 iterations
    parallelism: 4,        // 4 threads
    saltLength: usedSalt.length,
  };

  try {
    // argon2.hash() returns base64-encoded hash string
    // We'll use argon2.hash with raw output to get the key material
    const hashBuffer = await argon2.hash(password, {
      ...kdfParams,
      raw: true,
      salt: usedSalt,
    });

    // Ensure we have exactly 32 bytes for AES-256
    const key = hashBuffer.slice(0, 32);

    return {
      key,
      salt: usedSalt,
      kdfParams: {
        algorithm: 'argon2id',
        ...kdfParams,
      },
    };
  } catch (err) {
    throw new Error(`Argon2id derivation failed: ${err.message}`);
  }
}

/**
 * Encrypts a plaintext buffer using AES-256-GCM.
 * Returns: { ciphertext, iv, authTag } (all Buffers)
 */
export function encryptAESGCM(plaintext, key) {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv,
    authTag,
  };
}

/**
 * Decrypts AES-256-GCM ciphertext.
 */
export function decryptAESGCM(ciphertext, iv, authTag, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext;
  } catch (err) {
    throw new Error(`AES-256-GCM decryption failed (corrupted data?): ${err.message}`);
  }
}

/**
 * Timing-safe buffer comparison (prevents timing side-channels).
 * Returns true if buffers match, false otherwise.
 */
export function timingSafeCompare(a, b) {
  if (a.length !== b.length) {
    // Prevent timing leak on length mismatch by comparing dummy buffers same length
    return crypto.timingSafeEqual(a, Buffer.alloc(a.length));
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Zeros out a Buffer in-place (security best-practice).
 */
export function zeroBuffer(buf) {
  if (Buffer.isBuffer(buf)) {
    buf.fill(0);
  }
}
