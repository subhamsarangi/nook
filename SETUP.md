# Development Setup — Nook

## Environment Files

Two `.env` files are required before running the dev servers. These are **NOT checked into git** (see `.gitignore`).

### Backend — `backend/.env`

```
PORT=3001
NODE_ENV=development
DB_PATH=./vault.db
VAULT_META_PATH=./vault.meta.json
```

### Frontend — `frontend/.env`

```
VITE_API_URL=http://localhost:3001
```

## Running Locally

### Both servers at once (recommended)
```bash
npm run dev
```

Starts backend (port 3001) + frontend dev server (port 3000) concurrently.

### Individual servers
```bash
npm run dev:backend   # Backend only (port 3001)
npm run dev:frontend  # Frontend only (port 3000, with hot reload)
```

## Directory Structure

```
nook/
├── backend/
│   ├── src/
│   │   └── index.js           # Express entry point
│   ├── .env                   # Backend config (not in git)
│   ├── .env.example           # Template
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx           # React entry point
│   │   ├── App.jsx            # Root component
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── .env                   # Frontend config (not in git)
│   ├── .env.example           # Template
│   └── package.json
├── meta/
│   ├── projectBrief.md        # Project requirements
│   └── buildOrder.md          # Phase-by-phase build plan
├── .gitignore
├── package.json               # Root workspace config
├── README.md
└── SETUP.md                   # This file
```

## First Run Checklist

- [ ] Node.js 18+ installed
- [ ] `npm install` run from project root
- [ ] `.env` files created in both `backend/` and `frontend/`
- [ ] Run `npm run dev` or start individual servers as needed
