# Nook — Local Encrypted Personal Data System

Self-hosted, password-protected vault for organizing personal data into flexible user-defined structures. No cloud, no third-party services, no password recovery.

## Stack

- **Frontend**: React + Vite (dev server on port 3000)
- **Backend**: Node.js + Express (dev server on port 3001)
- **Database**: SQLite + SQLCipher (encrypted at rest)
- **Security**: Argon2id (KDF), AES-256-GCM (file encryption), in-memory session key

## Quick Start

### Install dependencies
```bash
npm install
```

### Run dev servers (both backend + frontend)
```bash
npm run dev
```

Frontend: http://localhost:3000
Backend: http://localhost:3001

## Project Structure

```
nook/
├── backend/          # Express server
│   ├── src/
│   │   └── index.js
│   └── package.json
├── frontend/         # React app
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   └── package.json
├── meta/             # Project docs
│   ├── projectBrief.md
│   └── buildOrder.md
└── package.json      # Root workspace config
```

## Build Phases

See `meta/buildOrder.md` for the full build roadmap.

- **Phase 1**: Project scaffold ✓ (current)
- **Phase 2**: Security core (key derivation, encryption, session management)
- **Phase 3**: Lock screen & session UX
- **Phase 4+**: Data model, UI, bulk ops, customization

## Security Policy

- Single password; no recovery mechanism (forgotten password = permanent data loss)
- All data encrypted at rest (SQLCipher + AEAD file encryption)
- Session auto-locks after 15 minutes
- No plaintext secrets ever written to disk, logs, or crash dumps
- Exponential backoff on failed unlock attempts (persists across restarts)

## Development

Backend uses ES modules (`"type": "module"` in package.json).
Frontend uses Vite with React + JSX.

For details on dependencies and security, see `meta/projectBrief.md`.
