# Project Brief — Nook

## Metadata

| | |
|---|---|
| **Project name** | Nook |
| **Type** | Local, password-protected personal data management system |
| **Platform** | Local dev server (React frontend + Node/Express backend, two processes) |
| **Status** | Planning / pre-build |
| **Owner** | — |
| **Last updated** | 2026-09-17 |

---

## Project Goal

Nook is a general-purpose, self-hosted, encrypted local system for organizing personal data into flexible, user-defined structures — without relying on any
third-party service, cloud storage, or account system.

The core idea: the user defines their own categories (**Entities**), each category has one or more sub-categories (**Sub-Entities**) with a user-designed record structure (**schema**), and each sub-category holds actual records (**Instances**) conforming to that structure. Think of it as a lightweight, self-built Airtable/Notion-style database — but fully local, encrypted at rest, and with no data ever leaving the machine.

The secondary and equally important goal is **security by construction**: the SQLite database and all uploaded files are encrypted, a single password
(never stored anywhere) is the only way to unlock them, the session auto-locks after inactivity, and there is deliberately **no password recovery mechanism** — forgetting the password means permanent data loss, by design, in exchange for a smaller attack surface and no secondary recovery-key system to secure.

---

## Dependencies / Stack

**Frontend**
- React (dev server)
- Component-level state for forms; no third-party state management assumed unless complexity demands it

**Backend**
- Node.js + Express — acts as the trust boundary; holds the decryption key in memory, serves decrypted data to the frontend over localhost
- SQLite as the database engine
- **SQLCipher** for transparent full-database encryption
- **Argon2id** for password → key derivation
- AEAD file encryption — **AES-256-GCM** or **XChaCha20-Poly1305** — for image/file blob storage
- Node's built-in `crypto` module for constant-time comparison (`timingSafeEqual`) and buffer handling

**Storage**
- Encrypted SQLite DB file on disk (via SQLCipher)
- Encrypted file/image blobs in a dedicated local folder, decrypted on-demand per request (never bulk-decrypted to disk)
- One plaintext metadata file (`vault.meta.json`) holding only non-secret data: salt, KDF params, verifier ciphertext, failed-attempt counter

**Notable exclusions**
- No cloud sync, no external API calls for core functionality
- No password recovery system (single password, no recovery key)
- No image/file support in bulk-created instances (URL fields only in bulk JSON)

---

## User Flow

1. **Boot** — user starts the backend + frontend dev servers.
2. **Lock screen** — app immediately shows a password prompt; no data or navigation is accessible yet.
3. **Unlock** — user enters password → backend derives key via Argon2id → validates against stored verifier (constant-time compare) → on success, opens the SQLCipher DB and starts an in-memory session.
   - Wrong password → generic "incorrect password" message, with a growing backoff delay on repeated failures (persisted across restarts).
4. **Home page** — list of all Entities. User can create, edit, or delete Entities here (delete requires confirmation, with a cascade-impact count shown first).
5. **Entity detail page** — list of Sub-Entities within that Entity (must have ≥1). User can create/edit/delete Sub-Entities, and toggle whether the entity page shows sub-entities *inline with their instances* or *just as links* to each sub-entity's detail page.
6. **Sub-entity: schema setup** (first time only) — user builds the Instance structure field-by-field (short text, long text, date, time, datetime, URL, dropdown, checkbox, color, image, file), then explicitly **finalizes** it — after which the structure can never change.
7. **Sub-entity detail page** — list of Instances belonging to that Sub-Entity, rendered according to the user's custom list-item display config (which fields show, title field, color-as-title-paint, order). User can create instances one at a time, or **bulk-create via JSON** (image/file fields excluded from bulk; URLs allowed).
8. **Instance detail page** — full record view, rendered according to the user's custom detail-view display config (ordered field blocks, fully user-controlled).
9. **Editing / deleting** — available at every level (Entity, Sub-Entity, Instance), individually or in bulk (multi-select), always behind a confirmation dialog that shows exactly what will be affected (including cascade counts for parent-level deletes).
10. **Session countdown** — visible in the header on every page. After 15 minutes (or manual lock), the session key is dropped from memory, the DB connection closes, and the user is returned to the lock screen — requiring the password again to resume.

---

## Main Features

### Structure & data model
- Three-level hierarchy: **Entity → Sub-Entity → Instance**
- Entities and Sub-Entities: simple name + description
- Sub-Entities: house a user-defined, one-time-finalized Instance schema
- Instances: actual records conforming to that frozen schema

### Field types (Instance schema)
- Short text, long text, date, time, datetime, URL, dropdown, checkbox, color picker (paints the instance's title text), image, file

### Customization
- Full user control over **list-item rendering** (which fields, order, title field, color application) for the Sub-Entity's instance list
- Full user control over **detail-page rendering** (ordered field layout) for each Instance
- Per-Entity toggle: show Sub-Entities inline (with their instances) vs. as links only
- Manual reordering of instances in list views

### Bulk operations
- Bulk instance creation via JSON (schema-validated, all-or-nothing; excludes image/file fields, URL fields allowed)
- Bulk delete at every level: Instances, Sub-Entities, Entities (multi-select)

### Safety & confirmation
- Every delete action — single or bulk, at any level — requires confirmation
- Cascade-aware confirmation messaging (shows exact counts of what will be removed)
- Orphaned file cleanup on delete, plus a periodic orphan-file sweep as a safety net

### Security
- Password-derived encryption key (Argon2id); password itself is never stored anywhere
- Encrypted verifier pattern to validate password correctness without storing it
- Full database encryption via SQLCipher
- Encrypted file/image storage, decrypted on-demand, never bulk-decrypted to disk
- In-memory-only session key, auto-dropped after 15 minutes of inactivity (visible live countdown across all pages)
- No recovery mechanism — a deliberate trade-off for a smaller, simpler attack surface
- Persisted, exponential backoff on failed unlock attempts (survives server restarts)
- Constant-time comparisons, buffer zeroing, no-log policy on secrets, generic error messaging — hardened against leak side-channels

### Data integrity
- Atomic writes (temp file → fsync → rename) to prevent corruption from interrupted writes
- Rolling backups before write/re-encryption cycles
- AEAD auth-tag verification to detect (not silently ignore) corrupted encrypted data
- DB integrity check on every boot/unlock