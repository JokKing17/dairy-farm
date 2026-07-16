# DairyFlow

Private dairy business operations and accounting system built with Next.js, TypeScript and MongoDB. Money is stored as integer paisa and quantities as normalized milli-units/Decimal128. Posted operations produce immutable financial and inventory movements inside MongoDB transactions.

## Architecture

- `src/app`: App Router screens and protected API routes
- `src/lib/domain.ts`: transactional posting services and idempotency enforcement
- `src/lib/db.ts`: reusable MongoDB connection and transaction wrapper
- `src/lib/money.ts`: exact PKR and quantity calculations
- MongoDB ledger entries are authoritative; balances are aggregation-derived
- Cloud storage credentials are optional locally. Production attachments use the R2 variables in `.env.example`; secrets stay server-side.

## Local setup

1. Copy `.env.example` to `.env` and replace the session secret and owner password. Keep `directConnection=true` when connecting from Windows to the local Docker MongoDB replica set.
2. Run `docker compose up -d mongo`.
3. If the replica set is not initialized automatically: `docker compose exec mongo mongosh --eval "rs.initiate()"`.
4. Run `npm install`, `npm run seed`, then `npm run dev`.
5. Open `http://localhost:3000`. Health is available at `/api/health`.

## Validation

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

## Production

Use MongoDB Atlas with backups and point-in-time recovery enabled. Set all `.env.example` variables in the secret manager, use a 32+ byte random session secret, configure R2 least-privilege bucket credentials, run the seed once with a temporary strong password, then deploy with `docker compose up -d --build`. Terminate TLS at a trusted reverse proxy; secure cookies require HTTPS.

## Backup and recovery

For self-hosted MongoDB use `mongodump --uri "$MONGODB_URI" --archive=dairyflow.archive --gzip`. Restore into a new database with `mongorestore --uri "$MONGODB_URI" --archive=dairyflow.archive --gzip --nsFrom='dairyflow.*' --nsTo='dairyflow_restore.*'`; validate record counts and `/api/health` before switching traffic. Never test restoration over production.

## Posting controls

Never edit or delete posted ledger or stock movements. Corrections must create a reversal referencing the original transaction and requiring a reason. Every client retry must reuse its idempotency key. Closed business days are immutable until an owner creates an audited reopen event.

## External credentials

MongoDB Atlas and Cloudflare R2 credentials are deployment-specific. Without R2 the core application remains usable, but attachment uploads are unavailable. WhatsApp phase one uses confirmed `wa.me` deep links and requires no API credential.
