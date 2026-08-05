# LinkDrop

A link-in-bio app. Sign in, claim a username, and publish one public page for all your links.

## Stack

- **Frontend:** React 18 + Vite 5 (builds to `dist/`)
- **Backend:** Node.js (Express 4) serving the API and the built frontend
- **Database:** SQLite via better-sqlite3 (file-based, stored at `DATABASE_PATH`)

## Requirements

- Node.js 20+

## Environment variables

Copy `.env.example` to `.env` and fill in the values.

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | **yes** | Random string used to sign session cookies. Generate with `openssl rand -hex 32`. The server refuses to start without it. |
| `DATABASE_PATH` | no | Path to the SQLite file. Defaults to `./data/linkdrop.db`. |
| `PORT` | no | HTTP port. Defaults to `3000`. |

## Running locally

```bash
npm install
cp .env.example .env   # set SESSION_SECRET
npm run build
npm start              # serves API + frontend on :3000
```

For development with hot reload: `npm run dev` (Vite dev server proxies `/api` to :3000).

## Features

- Email + password accounts (scrypt-hashed)
- Claim a unique username
- Publish up to 10 links on your public page at `/u/<username>`
- Health endpoint with counters at `/api/health`
