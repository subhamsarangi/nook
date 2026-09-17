# Build Order — Local Encrypted Entity System

Dependency-ordered TODO list. Items within the same numbered phase can generally
be built in parallel unless a note says otherwise. Checkboxes are for tracking
progress as you build.

---

## Phase 1 — Foundation

- [x] 1.1 Scaffold project: Node/Express backend + React frontend as separate processes
- [x] 1.2 Set up repo structure, env config, dev scripts (run both processes together)

> Blocks: everything else.

---

## Phase 2 — Security Core (rigid, sequential)

> This whole phase is a strict chain — each step needs the one before it.
> **Policy locked in: single password, no recovery mechanism.** Forgetting the
> password means the vault is permanently unreadable — this is intentional,
> keeps the design simple, and avoids a second key-wrapping path to secure/leak.

- [x] 2.1 Password → key derivation (Argon2id, random salt)
- [x] 2.2 Plaintext `vault.meta.json` to hold salt + KDF params + metadata (non-secret)
- [x] 2.3 Encrypted verifier pattern (encrypt known constant with derived key; store ciphertext)
      → lets you validate a password without ever storing it
- [x] 2.3a Constant-time comparison (`crypto.timingSafeEqual`) for verifier check — never a plain `===`/string compare, to avoid timing side-channels
- [x] 2.4 Atomic-write helper (temp file → fsync → rename) for anything persisted to disk
      *(soft dependency — good to have before Phase 2.5, not a hard blocker)*
- [x] 2.5 Wire up SQLCipher (or chosen DB-encryption approach) for the SQLite DB
- [x] 2.6 End-to-end check: boot → prompt password → verify → unlock → connect to empty DB
- [x] 2.7 In-memory session/key holder on server (key never touches disk)
      - Use `Buffer` (not JS string) for password/key material where possible
      - Explicitly zero (`buffer.fill(0)`) the buffer once no longer needed
- [x] 2.8 15-minute auto-lock timer (server-side, drops key from memory, zeroes buffer)
- [x] 2.9 `/session/status` endpoint (remaining time, locked/unlocked state)
- [x] 2.10 **Persisted failed-attempt tracking**: store failed-unlock count + last-attempt timestamp in `vault.meta.json` (plaintext, non-secret — just a counter)
      → must survive server restarts, so an attacker can't reset backoff by restarting the dev server
- [x] 2.11 Exponential backoff on unlock attempts, driven by 2.10's persisted count (e.g. 1s, 2s, 4s, 8s...), enforced server-side regardless of frontend state
- [x] 2.12 Password reset endpoint (POST /api/reset-vault) — deletes vault files + reinits with new password (only callable when unlocked)

**Depends on:** Phase 1
**Chain:** 2.1 → 2.2 → 2.3 → 2.3a → 2.5 → 2.6 → 2.7 → 2.8 → 2.9 → 2.10 → 2.11 → 2.12 (2.4 parallel-safe)

---

## Phase 3 — Lock Screen & Session UX

- [x] 3.1 Password/unlock screen (frontend), calls verify endpoint from 2.3
      - `autocomplete="new-password"` (or `off`) on the input — don't let the browser's own password store capture it
      - Clear the password from React state immediately after the request is sent
      - Show generic "incorrect password" only — never reveal *which* internal step failed (KDF/verifier/DB open)
- [x] 3.2 Global session countdown component (header/nav, visible on all pages), polls 2.9
- [x] 3.3 Auto-redirect to lock screen on expiry
- [x] 3.4 Backend rejects API calls on expired session (don't trust frontend alone)
- [x] 3.5 Surface backoff delay from 2.11 on the lock screen (e.g. "try again in 4s") so failed attempts are legible, not just silently rejected

**Depends on:** 2.3 (for 3.1), 2.8–2.9 (for 3.2–3.4), 2.10–2.11 (for 3.5)

---

## Phase 4 — Entities & Sub-Entities (core data model)

- [x] 4.1 DB schema/migrations: `entities`, `sub_entities`, `instances` tables
- [x] 4.2 Entity CRUD API (create/list/get/update/delete + cascade-count preflight)
- [x] 4.3 SubEntity CRUD API (scoped to an Entity; enforce "≥1 sub-entity per entity")
- [x] 4.4 Home page: Entity list (create/edit/delete)
- [x] 4.5 Entity detail page: Sub-Entity list (create/edit/delete) + display-mode toggle (UI stub only — logic comes in Phase 9)

**Depends on:** Phase 2 (needs unlocked DB to read/write)
**Chain:** 4.1 → 4.2 → 4.3 → (4.4, 4.5 parallel)
Note: 4.2 before 4.3 — sub-entities reference entities.

---

## Phase 5 — Instance Schema Builder

- [x] 5.1 Field-type registry: short_text, long_text, date, time, datetime, url, dropdown, checkbox, color, image, file — with per-type validation rules
      *(pure logic/types — no DB or auth dependency; can be built anytime, even in Phase 1 if convenient)*
- [x] 5.2 Schema builder UI on SubEntity detail page (add/reorder/remove fields, dropdown options, required flags — enforce image/file always-optional)
- [x] 5.3 "Finalize schema" action — explicit lock; enforce immutability at API layer after finalize

**Depends on:** 4.3 (needs a sub-entity to attach a schema to)
**Chain:** 5.1 → 5.2 → 5.3

---

## Phase 6 — Instances: CRUD

- [x] 6.1 Encrypted file storage: save uploads as encrypted blobs (AES-256-GCM or XChaCha20-Poly1305), decrypt-on-demand when served
- [x] 6.2 Instance create/edit form, dynamically rendered from finalized schema (incl. image/file fields)
- [x] 6.3 Instance API (create/get/update/delete), with file cleanup on delete/replace
- [x] 6.4 Instance list page — default rendering (no custom layout yet)
- [x] 6.5 Instance detail page — default rendering

**Depends on:** 5.3 (schema must be finalized before instances can be created against it)
**Chain:** 6.1 → 6.2 → 6.3 → (6.4, 6.5 parallel)
Note: 6.1 must exist (even stubbed) before 6.2, since the form needs somewhere to send uploads.

---

## Phase 7 — Bulk Operations

- [x] 7.1 Bulk-create via JSON: validate against finalized schema, **excluding image/file fields** (URL fields allowed), all-or-nothing transaction
- [x] 7.2 Bulk-create UI (paste/upload JSON, preview, validation errors before commit)
- [x] 7.3 Bulk delete — instances (multi-select + confirm)
- [x] 7.4 Bulk delete — sub-entities and entities (multi-select + cascade-aware confirm)

**Depends on:** 5.3 (for 7.1), 6.3 (for 7.3), 4.2–4.3 (for 7.4)
**Chain:** 7.1 → 7.2 (independent of 7.3/7.4)

---

## Phase 8 — Confirmation & Delete Safety

- [x] 8.1 Shared `<ConfirmDeleteDialog>` component with cascade-count preflight (counts entities/sub-entities/instances affected)
- [x] 8.2 Wire dialog into every delete action — single + bulk, all levels (replace any ad-hoc confirms used earlier)
- [x] 8.3 File cleanup as part of cascade deletes (transactional or immediately-following step)
- [x] 8.4 Orphan file sweep (on-demand button first; automate later if desired)

**Depends on:** at least one deletable thing existing (6.3, 7.3, or 7.4 started) for 8.1; needs 8.1 before 8.2
**Chain:** 8.1 → 8.2; 6.1 → 8.3 → 8.4 (separate sub-chain)
Note: 8.1 can technically be stubbed/built in parallel with Phase 6–7, then wired in after.

---

## Phase 9 — Custom Display Control

- [x] 9.1 List-item display config builder (fields shown in row, title field, color-as-title-paint, order) — backend routes added, UI component created (DisplayConfigBuilder.jsx), wired into EntityDetailPage
- [x] 9.2 Detail-view display config builder (ordered field blocks for instance detail page)
- [x] 9.3 Wire instance list page to use `list_item_config` (replaces 6.4 default rendering)
- [x] 9.4 Wire instance detail page to use `detail_view_config` (replaces 6.5 default rendering)
- [x] 9.5 Drag-to-reorder for both configs (built into DisplayConfigBuilder component)

**Depends on:** 6.4 → 9.1 → 9.3; 6.5 → 9.2 → 9.4; (9.1, 9.2, 9.3, 9.4) → 9.5
Note: this phase is the most parallelizable relative to Phase 6–8 — it just needs *some* default rendering to exist first (from Phase 6), so it can build alongside Phase 7–8 rather than strictly after.

---

## Phase 10 — Entity-Level Display Modes

- [x] 10.1 Implement "inline" vs "links-only" rendering on Entity detail page, using configs from Phase 9

**Depends on:** 4.5 (toggle UI stub) + 9.1–9.4 (real configs to render against)

---

## Phase 11 — Corruption Resistance & Backups

- [ ] 11.1 Rolling backups before each write/re-encryption cycle (keep last N versions)
- [ ] 11.2 Verify AEAD auth-tag failure handling (corrupted file → clear error, not silent data loss)
- [ ] 11.3 DB integrity check on boot (post-unlock), surfaced to user if something looks wrong

**Depends on:** 2.4 (atomic writes) → 11.1; 6.1 (encryption) → 11.2; 2.6 (boot/unlock flow) → 11.3
Note: all three are independent of each other — can build in any order once their respective dependency is ready.

---

## Phase 12 — Polish & Hardening

- [ ] 12.1 ~~Rate-limit / delay failed password attempts~~ → done in 2.10–2.11 (moved earlier since it needed to be persisted, not bolted on)
- [ ] 12.2 Empty / loading / error states across all pages
- [ ] 12.3 Audit all logging (request logging middleware, error handlers, console.log calls) — confirm the password/key is never written to any log, especially the unlock endpoint. Log outcomes only ("unlock succeeded/failed"), never payloads.
- [ ] 12.4 Confirm unlock endpoint only ever accepts password via POST body — never query string/URL (avoids it landing in access logs or browser history)
- [ ] 12.5 Disable core dumps for the server process (or otherwise confirm crash dumps won't persist key/password material to disk)
- [ ] 12.6 Final security review: confirm no plaintext secrets ever hit disk, logs, or crash dumps; walk through the full key lifecycle end-to-end (creation → derivation → in-memory use → zeroing → drop)

**Depends on:** 2.7 (for 12.5–12.6, key lifecycle must exist); 12.2 can be layered in incrementally at any point, anytime after a page exists; 12.3–12.4 can be done as soon as 3.1's unlock endpoint exists; 12.6 is inherently last — a review pass over everything

---

## Quick Reference — The Only Truly Rigid Spine

1. **Security core**: 2.1 → 2.2 → 2.3 → 2.3a → 2.5 → 2.6 → 2.7 → 2.8 → 2.9 → 2.10 → 2.11
2. **Schema before instances**: 5.1 → 5.2 → 5.3 → 6.2

**Locked policy:** no password recovery. Forgetting the password = permanent
data loss by design. Failed-attempt backoff (2.10–2.11) persists across
server restarts via a plaintext counter in `vault.meta.json` — only the
*count*, never the password, so this doesn't reopen the no-leak requirement.

Everything else (display customization, bulk ops, confirmations, backups) can flex
around this spine and be parallelized once its immediate prerequisite is in place.