# Netlify Serverless Functions

This directory contains 9 serverless functions that power the **Mañana Seguro** backend. Together they form a complete user lifecycle: authentication → KYC → deposit → savings goals → order tracking.

- **Runtime:** JavaScript (ES Modules), Netlify Functions v2
- **Database:** Supabase (`usuarios`, `metas`, `ordenes` tables)
- **External services:** Google OAuth, Etherfuse Ramp API, Banxico SIE API, Stellar Testnet

---

## Path Mapping

Every function is routed via `netlify.toml` redirects. The public URL is what the frontend calls:

| Public path | Netlify function file | Handler |
|---|---|---|
| `/api/auth/google` | `auth-google.js` | Google OAuth + Stellar wallet auto-generation |
| `/api/cetes-rate` | `cetes-rate.js` | Real-time CETES interest rate |
| `/api/etherfuse/deposit` | `etherfuse-deposit.js` | Create MXN→CETES deposit order |
| `/api/etherfuse/onboarding` | `etherfuse-onboarding.js` | KYC onboarding link generation |
| `/api/etherfuse/ramp` | `etherfuse-ramp.js` | Universal Etherfuse Ramp API proxy |
| `/api/etherfuse/webhook` | `etherfuse-webhook.js` | Etherfuse event webhook handler |
| `/api/exchange-rate` | `exchange-rate.js` | USD/MXN exchange rate from Banxico |
| `/api/metas` | `metas.js` | Savings goals CRUD |
| `/api/etherfuse/order-status` | `order-status.js` | Query deposit order status |

---

## 1. `auth-google` — Google OAuth + Wallet Creation

**HTTP method:** `POST`  
**Path:** `/api/auth/google`

### Purpose

Authenticates a user via Google OAuth. If the user exists, returns their profile. If new, generates a Stellar keypair (encrypted with AES-256-GCM) and registers them in Supabase.

### Request

**Headers:** `Content-Type: application/json`

**Body:**
```json
{
  "idToken": "<Google ID token>"
}
```

### Response

**201 Created** (new user):
```json
{
  "usuario": {
    "id": "uuid",
    "email": "user@gmail.com",
    "nombre": "Carlos",
    "customerId": "uuid",
    "bankAccountId": "uuid",
    "stellarPublicKey": "G...",
    "kycStatus": "pending",
    "bankAccountStatus": "pending"
  },
  "esNuevo": true
}
```

**200 OK** (existing user) — same shape, `esNuevo: false`

### Error Codes

| Code | Condition |
|---|---|
| 400 | Missing or invalid `idToken` in body |
| 401 | Invalid/expired Google token, audience mismatch, or unverified email |
| 405 | Non-POST HTTP method |
| 500 | Missing `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`, or invalid `WALLET_ENCRYPTION_KEY` (must be 64 hex chars) |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase `service_role` key (bypasses RLS) |
| `WALLET_ENCRYPTION_KEY` | ✅ | AES-256 key in hex (64 chars). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID for audience validation |

---

## 2. `cetes-rate` — Real-Time CETES Rate

**HTTP method:** `GET`  
**Path:** `/api/cetes-rate`

### Purpose

Fetches the real-time CETES interest rate from Banxico SIE API and calculates the user's net rate after the Etherfuse spread.

### Query Parameters

| Param | Required | Description |
|---|---|---|
| `diasPlazo` | Yes | Investment term in days (e.g. `28`, `91`, `182`, `364`) |

### Response

**200 OK:**
```json
{
  "tasaBruta": 10.48,
  "spreadEtherfuse": 0.9,
  "tasaNeta": 9.58,
  "diasPlazo": 28,
  "source": "banxico"
}
```

If Banxico is unavailable, falls back to hardcoded rates (6.5% for 28 days, 5.6% otherwise) with `source: "fallback"`.

### Error Codes

| Code | Condition |
|---|---|
| 400 | Missing `diasPlazo` parameter |
| 500 | Missing `BANXICO_TOKEN` |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BANXICO_TOKEN` | ✅ | Banxico SIE API token |

---

## 3. `etherfuse-deposit` — Create Deposit Order

**HTTP method:** `POST`  
**Path:** `/api/etherfuse/deposit`

### Purpose

Creates an MXN→CETES deposit order via Etherfuse. Returns a unique CLABE for the user to transfer funds via SPEI.

**Business rule:** Amount must be between $40 and $100,000 MXN.

### Request

**Headers:** `Content-Type: application/json`

**Body:**
```json
{
  "usuarioId": "uuid",
  "montoMxn": 1000
}
```

### Response

**200 OK:**
```json
{
  "orderId": "uuid",
  "depositClabe": "646180123456789012",
  "depositBankName": "STP",
  "depositAccountHolder": "Etherfuse MX",
  "montoExactoMxn": 1000,
  "targetAmount": "98.50",
  "feeAmount": "1.50",
  "status": "created",
  "instruccion": "Transfiere exactamente $1,000 MXN desde tu banco a la CLABE indicada."
}
```

### Error Codes

| Code | Condition |
|---|---|
| 400 | Missing/invalid `usuarioId` or `montoMxn`, amount out of range |
| 403 | KYC not approved or bank account not active |
| 404 | User not found in Supabase |
| 405 | Non-POST HTTP method |
| 500 | Missing env vars, Etherfuse API error, or internal error |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase `service_role` key |
| `ETHERFUSE_API_KEY` | ✅ | Etherfuse API key |
| `ETHERFUSE_ENV` | Optional | `sandbox` (default) or `production` — determines API base URL |

---

## 4. `etherfuse-onboarding` — KYC Onboarding Link

**HTTP method:** `POST`  
**Path:** `/api/etherfuse/onboarding`

### Purpose

Generates a presigned Etherfuse KYC onboarding URL for the user. The URL expires in 15 minutes.

### Request

**Headers:** `Content-Type: application/json`

**Body:**
```json
{
  "usuarioId": "uuid"
}
```

### Response

**200 OK:**
```json
{
  "onboardingUrl": "https://...",
  "expiraEn": "2026-05-26T12:15:00.000Z",
  "kycStatus": "pending"
}
```

If the user already has `kyc_status === 'approved'` and `bank_account_status === 'active'`, returns `yaCompletado: true` instead of a new URL.

### Error Codes

| Code | Condition |
|---|---|
| 400 | Missing/invalid `usuarioId` |
| 404 | User not found |
| 405 | Non-POST HTTP method |
| 500 | Missing env vars or Etherfuse API error |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase `service_role` key |
| `ETHERFUSE_API_KEY` | ✅ | Etherfuse API key |
| `ETHERFUSE_ENV` | Optional | `sandbox` or `production` |
| `WEBHOOK_URL` | Optional | Redirect URL after KYC completion (default: `${process.env.URL}/dashboard`) |

---

## 5. `etherfuse-ramp` — Universal Etherfuse Ramp Proxy

**HTTP method:** `GET` or `POST` (dispatched via `action` query parameter)  
**Path:** `/api/etherfuse/ramp`

### Purpose

Generic proxy for the Etherfuse Ramp API. Routes to 6 different operations based on the `action` query parameter.

### Actions

#### `GET` actions

| Action | Query params | Description |
|---|---|---|
| `assets` | — | List available Stellar assets |
| `order-status` | `orderId` | Check order status by ID |
| `kyc-status` | `customerId`, `walletAddress` | Check KYC status |

#### `POST` actions

| Action | Body fields | Description |
|---|---|---|
| `quote` | `walletAddress`, `amountMxn`, `targetAsset`, `customerId` | Get a quote for MXN→asset conversion |
| `order` | `quoteId`, `bankAccountId`, `cryptoWalletId` | Create an order and get CLABE |
| `kyc-url` | `walletAddress`, `email` | Generate hosted KYC URL |

### Response

Varies by action — returns the raw Etherfuse API response on success.

### Error Codes

| Code | Condition |
|---|---|
| 400 | Missing required fields for the action, or invalid action |
| 500 | Missing `ETHERFUSE_API_KEY` or Etherfuse API error |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ETHERFUSE_API_KEY` | ✅ | Etherfuse API key |
| `ETHERFUSE_ENV` | Optional | `sandbox` (default) or `production` |

---

## 6. `etherfuse-webhook` — Etherfuse Event Webhook

**HTTP method:** `POST`  
**Path:** `/api/etherfuse/webhook`

### Purpose

Receives and processes webhook events from Etherfuse. Verifies HMAC-SHA256 signatures, then updates Supabase records.

### Signature Verification

Etherfuse signs the raw request body with HMAC-SHA256. The signature is sent in the `X-Signature` header (hex-encoded). The function verifies against `WEBHOOK_SECRET` (and optionally `WEBHOOK_SECRET_2`) using `timingSafeEqual` to prevent timing attacks.

### Events

#### `kyc_updated`

Updates `kyc_status` and `bank_account_status` in the `usuarios` table.

**Payload:**
```json
{
  "type": "kyc_updated",
  "data": {
    "customerId": "uuid",
    "kycStatus": "approved",
    "bankAccountId": "uuid",
    "bankAccountStatus": "active"
  }
}
```

#### `order_updated`

Updates `status` and optionally `stellar_claim_transaction` in the `ordenes` table.

**Payload:**
```json
{
  "type": "order_updated",
  "data": {
    "orderId": "uuid",
    "status": "completed",
    "stellarClaimTransaction": "..."
  }
}
```

### Response

**200 OK** (always, even on internal errors — prevents Etherfuse retries):
```json
{ "received": true }
```

### Error Codes

| Code | Condition |
|---|---|
| 400 | Invalid JSON body, or missing `type` field |
| 401 | Invalid or missing HMAC signature |
| 405 | Non-POST HTTP method |
| 500 | Missing `WEBHOOK_SECRET` |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase `service_role` key |
| `WEBHOOK_SECRET` | ✅ | HMAC secret from Etherfuse webhook creation |
| `WEBHOOK_SECRET_2` | Optional | Second HMAC secret for a different event type |

---

## 7. `exchange-rate` — USD/MXN Exchange Rate

**HTTP method:** `GET`  
**Path:** `/api/exchange-rate`

### Purpose

Fetches the current USD/MXN exchange rate from Banxico SIE API (series SF43186).

### Response

**200 OK:**
```json
{
  "usdMxn": 17.2534,
  "fecha": "2026-05-24",
  "source": "banxico"
}
```

If Banxico is unavailable, falls back to `usdMxn: 17.50` with `source: "fallback"`.

### Error Codes

| Code | Condition |
|---|---|
| 500 | Missing `BANXICO_TOKEN` (falls back silently if Banxico API fails) |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BANXICO_TOKEN` | ✅ | Banxico SIE API token |

---

## 8. `metas` — Savings Goals CRUD

**HTTP methods:** `GET`, `POST`, `PATCH`, `DELETE`  
**Path:** `/api/metas`

### Purpose

Manages user savings goals (metas). Business rules: the first goal is auto-marked as primary (`es_principal`); deleting the only goal is blocked; deleting the primary reassigns it to the next oldest goal.

### GET — List goals

**Query:** `?usuarioId=uuid`

**Response 200:**
```json
{
  "metas": [
    {
      "id": "uuid",
      "nombre": "Retiro",
      "descripcion": "Ahorro para jubilación",
      "monto_objetivo_mxn": 500000,
      "ahorro_mensual_mxn": 5000,
      "anos_al_retiro": 20,
      "es_principal": true,
      "created_at": "2026-05-20T...",
      "updated_at": "2026-05-20T..."
    }
  ]
}
```

### POST — Create goal

**Body:**
```json
{
  "usuarioId": "uuid",
  "nombre": "Retiro",
  "descripcion": "Ahorro para jubilación",
  "monto_objetivo_mxn": 500000,
  "ahorro_mensual_mxn": 5000,
  "anos_al_retiro": 20
}
```

**Validation ranges:**
- `monto_objetivo_mxn`: $1,000 – $50,000,000 MXN
- `ahorro_mensual_mxn`: $40 – $100,000 MXN
- `anos_al_retiro`: 1 – 40 years

### PATCH — Update goal

**Query:** `?id=uuid`  
**Body:** Any subset of fields (`nombre`, `descripcion`, `monto_objetivo_mxn`, `ahorro_mensual_mxn`, `anos_al_retiro`) plus `usuarioId` for ownership verification.

### DELETE — Delete goal

**Query:** `?id=uuid`  
**Body:** `{ "usuarioId": "uuid" }`

### Error Codes

| Code | Condition |
|---|---|
| 400 | Missing `usuarioId`, invalid fields, or no fields to update (PATCH) |
| 404 | Goal not found (PATCH/DELETE) |
| 405 | Unsupported HTTP method |
| 409 | Unique constraint violation (POST) or only goal cannot be deleted |
| 500 | Missing Supabase env vars or internal error |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase `service_role` key |

---

## 9. `order-status` — Query Deposit Order Status

**HTTP method:** `GET`  
**Path:** `/api/etherfuse/order-status`

### Purpose

Queries deposit order status from Supabase. Supports two modes: single order lookup (for polling) or all-user orders (for dashboard).

### Query Parameters

| Param | Required | Description |
|---|---|---|
| `orderId` | Either | Specific order ID |
| `usuarioId` | Either | All orders for a user |

### Response — Single order

**200 OK:**
```json
{
  "orderId": "uuid",
  "status": "created",
  "montoMxn": 1000,
  "updatedAt": "2026-05-24T..."
}
```

### Response — All user orders

**200 OK:**
```json
{
  "ordenes": [
    {
      "order_id": "uuid",
      "status": "completed",
      "monto_mxn": 1000,
      "deposit_clabe": "646180123456789012",
      "created_at": "2026-05-24T...",
      "updated_at": "2026-05-24T..."
    }
  ],
  "totalMxn": 5000,
  "totalCompletadas": 5
}
```

### Error Codes

| Code | Condition |
|---|---|
| 400 | Neither `orderId` nor `usuarioId` provided |
| 404 | Order not found (single mode) |
| 405 | Non-GET HTTP method |
| 500 | Supabase query error |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase `service_role` key |

---

## Data Models

### `usuarios` table

| Column | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Primary key |
| `email` | text | User email |
| `nombre` | text | Display name |
| `customer_id` | uuid | Etherfuse customer ID |
| `bank_account_id` | uuid | Etherfuse bank account ID |
| `stellar_public_key` | text | Stellar public key |
| `stellar_secret_key_encrypted` | text | Encrypted secret key (AES-256-GCM) |
| `kyc_status` | text | `pending`, `approved`, `rejected` |
| `bank_account_status` | text | `pending`, `active` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `metas` table

| Column | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Primary key |
| `usuario_id` | uuid (FK) | References `usuarios` |
| `nombre` | text | Goal name |
| `descripcion` | text | Optional description |
| `monto_objetivo_mxn` | numeric | Target amount |
| `ahorro_mensual_mxn` | numeric | Monthly savings |
| `anos_al_retiro` | integer | Years to retirement |
| `es_principal` | boolean | Primary goal flag |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `ordenes` table

| Column | Type | Description |
|---|---|---|
| `order_id` | uuid (PK) | Etherfuse order ID |
| `usuario_id` | uuid (FK) | References `usuarios` |
| `monto_mxn` | numeric | Deposit amount in MXN |
| `deposit_clabe` | text | CLABE for SPEI transfer |
| `status` | text | `created`, `funded`, `completed`, etc. |
| `etherfuse_quote_id` | uuid | Associated quote ID |
| `stellar_claim_transaction` | text | Unsigned claim XDR |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

## Security Notes

- **AES-256-GCM encryption** — Stellar secret keys are encrypted before storage. Each encryption uses a random IV.
- **HMAC-SHA256 webhook verification** — Uses `timingSafeEqual` to prevent timing attacks. Supports dual secrets for different event types.
- **KYC gating** — Deposits are blocked if `kyc_status !== 'approved'`.
- **Service role key** — Supabase `service_role` bypasses RLS; only used server-side in Netlify Functions.
- **CORS** — All functions set `Access-Control-Allow-Origin: *` for development. Restrict in production.
- **External timeouts** — All Etherfuse API calls use a 10-second `AbortController` timeout.

---

## Running Locally

### Prerequisites

- Node.js 18+
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) — `npm install -g netlify-cli`

### Setup

1. **Create a `.env` file** in the project root (never commit):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
WALLET_ENCRYPTION_KEY=<generate with node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
GOOGLE_CLIENT_ID=your_google_oauth_client_id
ETHERFUSE_API_KEY=your_etherfuse_api_key
ETHERFUSE_ENV=sandbox
BANXICO_TOKEN=your_banxico_sie_token
WEBHOOK_SECRET=your_etherfuse_webhook_secret
WEBHOOK_URL=http://localhost:8888
```

2. **Install dependencies:**

```bash
npm install
```

3. **Start the dev server:**

```bash
netlify dev
```

This runs the Vite dev server for the frontend (port 5173) and proxies API calls to the local Netlify Functions (port 8888). Functions are hot-reloaded on file changes.

4. **Test a function directly:**

```bash
curl -X POST http://localhost:8888/.netlify/functions/cetes-rate
```

5. **For webhook testing:** use [ngrok](https://ngrok.com/) to expose port 8888:

```bash
ngrok http 8888
```

Then set `WEBHOOK_URL` to the ngrok URL in Etherfuse's webhook dashboard.
