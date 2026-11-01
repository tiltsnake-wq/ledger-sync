# ledger-sync

Personal Ledger Dev sync API (pure Node >=18, no dependencies).

Set env var `LEDGER_SYNC_TOKEN` (secret, not committed). `PORT` optional (default 8787). Listens on 0.0.0.0.

Endpoints: `GET /v1/health`, `/v1/ops`, `POST /v1/upload`.

Start: `npm start`
