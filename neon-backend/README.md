# Renta backend for Neon Functions

Node.js 24 backend for the existing rental UI. The Python/SQLite local application is retained separately.
This version uses node-postgres pooling, durable PostgreSQL records and a Telegram webhook (no polling process).

## Existing behavior preserved

- Catalogue and server-calculated started-24-hour pricing.
- 30-minute holds, per-car PostgreSQL row lock, overlap prevention across isolates.
- Private Telegram claim, 20-minute form link, status/cancel/delete commands.
- Validated application, separate consent, AES-256-GCM encryption and hashed single-use form tokens.
- Signed HttpOnly/Secure/SameSite sessions, CSRF and same-origin checks.
- Admin review/confirmation/cancel/delete, DOCX with two copies and Excel report.
- Car/tariff snapshot at booking time so later catalogue edits cannot change an existing contract.
- PostgreSQL webhook deduplication and durable retry of failed delivery.
- Dedicated migration; the HTTP handler does not modify the schema.

## Setup and test

Node 24 and PostgreSQL 17 are required. From this directory:
npm install
DATABASE_URL=postgres://... npm test
npm run build

Test against a disposable database: the tests truncate their rental tables.
The prepare script embeds the existing templates and catalogue, porting only their Python-specific template expressions.

## Neon deployment

Use the existing renta-car project, in a development branch first.
Supply a direct DATABASE_URL_UNPOOLED to npm run migrate. Application traffic uses the pooled DATABASE_URL injected by Neon.
The function entry is dist/index.mjs. ZIP that file at the archive root, then deploy using the Neon CLI or MCP.
The build workflow retains a base64 ZIP in a separate build branch for connector-based deployment.
No database credentials, bot tokens or admin passwords are included in that output.

Required private variables: PUBLIC_URL, APP_SECRET (32+ characters), DATA_KEY (32 random bytes as base64), ADMIN_PASSWORD (16+ characters), DEMO_MODE=true.
Set BOT_USERNAME to the username belonging to the bot.
To enable Telegram, additionally set TELEGRAM_BOT_TOKEN and a random TELEGRAM_WEBHOOK_SECRET of 32+ URL-safe characters.
After deployment, sign in at /admin and use the Telegram webhook button. Alternatively run: node --env-file=.env setup-webhook.mjs
This validates getMe against BOT_USERNAME and installs the secret-protected webhook without dropping pending messages.
Stop the old Python polling bot before enabling the webhook. Do not put its token into the repository or chat.

## Frontend and deployment limits

Dynamic pages and forms are served by the function. Existing public CSS, JS and images are loaded from the existing GitHub Pages static directory.
This keeps cookies, CSRF, booking and forms on one HTTPS origin; the static GitHub Pages demonstration is unchanged.
The public native function URL is not a WAF. Shared session/global login budgets limit application work, not volumetric attacks.
This development deployment is for fictional data; production ingress/rate protection and legal requirements must be resolved before accepting real documents.
The configured region is Frankfurt. Real Russian document processing requires a separate localization/legal review; do not disable demo mode by accident.

## Compatibility and operations

Existing Python .env DATA_KEY and encrypted SQLite records are not automatically migrated. Keep the original data and key.
The new Node backend uses its own AES-256-GCM key and PostgreSQL schema (rental_* tables).
Persist APP_SECRET and DATA_KEY across redeployments. Changing DATA_KEY without migration makes records unreadable.
Webhook side effects in PostgreSQL are deduplicated. A Telegram API timeout after delivery can still result in a duplicate reply; Telegram does not offer exactly-once sendMessage.
Admin dashboard shows the latest 100 records; older records can be reached with ?page=2, etc. Excel caps one export at 10,000 records.
For retention, execute the documented purge script using the unpooled URL; confirmed/submitted records require a separate operator policy.
No scheduled deletion, photo editor, payment system or SEO analytics was added by this migration.
