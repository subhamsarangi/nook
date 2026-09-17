/**
 * Encrypted file storage manager.
 * Saves uploads as encrypted blobs (AES-256-GCM), decrypt-on-demand when served.
 * Files stored in: ./vault-files/ directory (encrypted at rest).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { atomicWriteSync } from './atomicWrite.js';

const VAULT_FILES_DIR = process.env.VAULT_FILES_DIR || './vault-files';

/**
 * Ensure vault files directory exists
 */
export function ensureFilesDir() {
  if (!fs.existsSync(VAULT_FILES_DIR)) {
    fs.mkdirSync(VAULT_FILES_DIR, { recursive: true });
  }
}

/**
 * Generate a unique file ID
 */
function generateFileId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Encrypt file buffer with AES-256-GCM
 * Returns { iv, authTag, encrypted } as base64-encoded strings
 */
export function encryptFileBuffer(buffer, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(buffer);
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encrypted: encrypted.toString('base64'),
  };
}

/**
 * Decrypt file buffer with AES-256-GCM
 * iv, authTag, encrypted are base64-encoded strings
 */
export function decryptFileBuffer(encrypted, iv, authTag, key) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  let decrypted = decipher.update(Buffer.from(encrypted, 'base64'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted;
}

/**
 * Save encrypted file to disk
 * Returns fileId
 */
export function saveEncryptedFile(buffer, key, filename = '') {
  ensureFilesDir();

  const fileId = generateFileId();
  const { iv, authTag, encrypted } = encryptFileBuffer(buffer, key);

  const fileData = {
    fileId,
    filename,
    createdAt: new Date().toISOString(),
    iv,
    authTag,
    encrypted,
  };

  const filePath = path.join(VAULT_FILES_DIR, `${fileId}.json`);
  atomicWriteSync(filePath, JSON.stringify(fileData, null, 2));

  return fileId;
}

/**
 * Load encrypted file from disk
 * Returns { filename, createdAt, buffer }
 */
export function loadEncryptedFile(fileId, key) {
  ensureFilesDir();

  const filePath = path.join(VAULT_FILES_DIR, `${fileId}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${fileId}`);
  }

  const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const buffer = decryptFileBuffer(fileData.encrypted, fileData.iv, fileData.authTag, key);

  return {
    filename: fileData.filename,
    createdAt: fileData.createdAt,
    buffer,
  };
}

/**
 * Delete encrypted file from disk
 */
export function deleteEncryptedFile(fileId) {
  ensureFilesDir();

  const filePath = path.join(VAULT_FILES_DIR, `${fileId}.json`);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * List all file IDs in vault-files directory
 */
export function listFileIds() {
  ensureFilesDir();

  if (!fs.existsSync(VAULT_FILES_DIR)) {
    return [];
  }

  return fs
    .readdirSync(VAULT_FILES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''));
}

/**
 * Get file metadata without decrypting content
 */
export function getFileMetadata(fileId) {
  ensureFilesDir();

  const filePath = path.join(VAULT_FILES_DIR, `${fileId}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${fileId}`);
  }

  const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  return {
    fileId: fileData.fileId,
    filename: fileData.filename,
    createdAt: fileData.createdAt,
    // Do NOT return iv, authTag, or encrypted here
  };
}

/**
 * Clean up orphaned files (files not referenced by any instance)
 */
export function getOrphanedFileIds(usedFileIds) {
  const allFileIds = listFileIds();
  const usedSet = new Set(usedFileIds);

  return allFileIds.filter((id) => !usedSet.has(id));
}

/**
 * Delete multiple files
 */
export function deleteFiles(fileIds) {
  fileIds.forEach((id) => deleteEncryptedFile(id));
}
