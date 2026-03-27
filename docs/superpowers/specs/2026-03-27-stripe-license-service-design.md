# Stripe License Service — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Replaces:** LemonSqueezy integration (pending store review)

## Context

Claude Code Inspector Pro uses license keys to gate analytics features. The current integration targets LemonSqueezy, which requires a store review process that has stalled (2+ days). Stripe is an immediate alternative — no approval wait, and the user already has an account.

The dashboard is deployed on GitHub Pages (static only), so payment/validation logic cannot run as Next.js API routes inside the dashboard. A separate hosted service is needed.

## Architecture

Two deployments:

1. **Dashboard** (GitHub Pages) — the Next.js app customers install and run locally. Static only, no server-side routes for licensing.
2. **License Service** (Vercel) — a standalone project with 3 serverless functions behind Cloudflare for rate limiting.

```
Customer's Browser
    │
    ├── Dashboard (local / GitHub Pages)
    │     ├── UpgradePrompt.tsx  →  calls License Service
    │     ├── page.tsx           →  calls License Service on mount
    │     └── cci-pro/license.ts →  calls License Service for async validation
    │
    └── License Service (Vercel, behind Cloudflare)
          ├── POST /api/checkout  →  creates Stripe Checkout session
          ├── POST /api/webhook   →  receives Stripe event, generates key
          └── POST /api/validate  →  validates/activates keys against Stripe
```

**Domain:** `license.yalladevrel.com` — CNAME through Cloudflare to Vercel deployment.

## License Service Project

### Structure

```
cci-license-service/
├── api/
│   ├── checkout.ts
│   ├── validate.ts
│   └── webhook.ts
├── lib/
│   └── stripe.ts
├── package.json
├── vercel.json
└── tsconfig.json
```

### Dependencies

- `stripe` (Node SDK)

### Environment Variables (Vercel)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe API calls |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_PRICE_ID` | The $14.99 one-time price |
| `ALLOWED_ORIGIN` | Dashboard GitHub Pages URL (CORS) |

### CORS

All endpoints return `Access-Control-Allow-Origin` for the dashboard domain only. The webhook endpoint skips CORS (Stripe calls it server-to-server).

## Endpoints

### POST /api/checkout

Creates a Stripe Checkout session in `payment` mode.

**Request:** `{}` (no body needed)

**Behavior:**
1. Creates a Checkout session with the configured `STRIPE_PRICE_ID`
2. Sets `success_url` to the dashboard URL with a success indicator
3. Sets `cancel_url` to the dashboard URL
4. Returns `{ url: "https://checkout.stripe.com/..." }`

**Response:** `{ url: string }`

### POST /api/webhook

Receives Stripe webhook events. Only processes `checkout.session.completed`.

**Behavior:**
1. Verifies webhook signature using `STRIPE_WEBHOOK_SECRET`
2. On `checkout.session.completed`:
   - Generates key: `CCI-PRO-` + 24 random hex chars (e.g., `CCI-PRO-a1b2c3d4e5f6a1b2c3d4e5f6`)
   - Updates the Stripe Customer metadata:
     ```json
     {
       "cci_license_key": "CCI-PRO-a1b2c3d4e5f6a1b2c3d4e5f6",
       "cci_activations": "0",
       "cci_max_activations": "2"
     }
     ```
   - Updates the PaymentIntent metadata with the key (appears on Stripe receipt)
3. Returns 200

**Key format:** `CCI-PRO-` prefix + 24 hex characters = 10^28 possible combinations. Brute-force infeasible.

### POST /api/validate

Validates or activates a license key.

**Request:**
```json
{
  "license_key": "CCI-PRO-...",
  "action": "validate" | "activate"
}
```

**Behavior:**
1. Searches Stripe customers where `metadata.cci_license_key` matches the provided key
2. If no match: `{ valid: false, error: "invalid license key" }`
3. If match found:
   - **action = "validate"**: returns `{ valid: true }` with activation counts
   - **action = "activate"**: checks `cci_activations` against `cci_max_activations` (default 2). If under limit, increments `cci_activations` on the Customer metadata and returns valid. If at/over limit, returns `{ valid: false, error: "activation limit reached" }`

**Response:**
```json
{
  "valid": boolean,
  "error": string | null,
  "activation_usage": number,
  "activation_limit": number
}
```

## Rate Limiting (Cloudflare)

Cloudflare sits in front of the Vercel deployment via `license.yalladevrel.com`.

**Rule:** Rate limit `/api/validate` to 10 requests per IP per minute. Returns 429 on exceeded.

## Dashboard Changes

### Files Modified

**`src/components/UpgradePrompt.tsx`:**
- "Get a License Key" button: instead of hardcoded LemonSqueezy `<a>` link, calls `${NEXT_PUBLIC_LICENSE_API_URL}/checkout` to get a fresh Stripe Checkout URL, opens in new tab
- License validation: calls `${NEXT_PUBLIC_LICENSE_API_URL}/validate` instead of `/api/license/validate`

**`src/app/page.tsx`:**
- On-mount validation: calls `${NEXT_PUBLIC_LICENSE_API_URL}/validate` instead of `/api/license/validate`

**`cci-pro/src/license.ts`:**
- `validateAsync()`: calls `${LICENSE_API_URL}/validate` instead of `/api/license/validate`
- The URL needs to be configurable — use a constant at the top of the file since this is a separately-built module

### Files Deleted

- `src/app/api/license/validate/route.ts` — no longer needed

### New Environment Variable

- `NEXT_PUBLIC_LICENSE_API_URL` = `https://license.yalladevrel.com/api` (baked in at build time)

### What Stays the Same

- Builder key flow (`CCI-BUILDER-f7e2a91b3c`) — client-side, no API call
- localStorage caching (24h offline support) in cci-pro
- The `onActivate` / `storeLicense` / `clearLicense` plumbing
- UpgradePrompt UI layout and features grid
- ProModule interface and loader pattern

## Security

### What's Exposed

The `NEXT_PUBLIC_LICENSE_API_URL` is visible in client-side JS. This is acceptable because:
- The endpoint only validates keys — does not expose customer data, key lists, or Stripe secrets
- Stripe API keys live server-side in Vercel env vars
- Knowing the URL does not help generate valid keys

### Attack Vectors & Mitigations

| Vector | Mitigation |
|--------|-----------|
| Key brute-forcing | 10^28 key space + Cloudflare rate limiting (10/min/IP) |
| Key sharing/reuse | Activation limit (2 per key) tracked on Stripe Customer metadata |
| Client-side bypass | Inherent to all client-side-gated software; accepted tradeoff |
| DDoS on endpoint | Cloudflare DDoS protection |
| Webhook spoofing | Stripe webhook signature verification |

## Test Suite

**Not committed to git.** All test files/dirs added to `.gitignore`.

### Vitest (Unit/Integration)

| Test File | What It Tests |
|-----------|--------------|
| `__tests__/unit/key-generation.test.ts` | Key format (`CCI-PRO-` + 24 hex), uniqueness across runs, entropy |
| `__tests__/unit/webhook.test.ts` | Mock Stripe event → key generated → stored on Customer metadata |
| `__tests__/unit/validate.test.ts` | Valid key, invalid key, activation counting, over-limit rejection |
| `__tests__/unit/checkout.test.ts` | Creates session with correct price, metadata, success URL |
| `__tests__/integration/stripe-flow.test.ts` | End-to-end with Stripe test mode: create checkout → simulate webhook → validate → activate → hit limit |

### Playwright (E2E Browser)

| Test File | What It Tests |
|-----------|--------------|
| `__tests__/e2e/upgrade-flow.spec.ts` | Builder key works, invalid key shows error, valid key activates with success animation |

### Manual Test (Guided)

After automated tests pass:
1. Create a Stripe test-mode product + price ($14.99 one-time)
2. Deploy the license service to Vercel
3. Complete a test checkout using Stripe's test card (`4242 4242 4242 4242`)
4. Retrieve the generated key from Stripe dashboard
5. Enter the key in the dashboard's UpgradePrompt
6. Verify activation succeeds and analytics loads

## Stripe Setup Required

Before implementation:
1. Create a Product in Stripe dashboard: "Claude Code Inspector Pro"
2. Create a Price: $14.99 one-time
3. Note the Price ID (`price_xxx`) for `STRIPE_PRICE_ID` env var
4. Set up webhook endpoint in Stripe dashboard pointing to `https://license.yalladevrel.com/api/webhook`
5. Subscribe to `checkout.session.completed` event
6. Note the webhook signing secret for `STRIPE_WEBHOOK_SECRET` env var
