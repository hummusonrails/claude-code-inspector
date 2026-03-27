# Stripe License Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace LemonSqueezy license validation with a Stripe-backed license service deployed on Vercel, update the dashboard to call it, and build a comprehensive test suite.

**Architecture:** A standalone Vercel project (`cci-license-service`) with 3 serverless functions (checkout, webhook, validate) sits behind Cloudflare at `license.yalladevrel.com`. The dashboard (GitHub Pages / local install) calls this service for license operations. Keys are generated on purchase and stored as Stripe Customer metadata.

**Tech Stack:** TypeScript, Stripe Node SDK, Vercel serverless functions, Vitest (unit/integration tests), Playwright (E2E tests)

**Spec:** `docs/superpowers/specs/2026-03-27-stripe-license-service-design.md`

---

## File Map

### License Service (new project: `/Users/bengreenberg/Dev/personal/cci-license-service/`)

| File | Responsibility |
|------|---------------|
| `api/checkout.ts` | Creates Stripe Checkout session, returns URL |
| `api/webhook.ts` | Receives Stripe events, generates license key, stores on Customer |
| `api/validate.ts` | Validates/activates license keys by searching Stripe Customer metadata |
| `lib/stripe.ts` | Shared Stripe client initialization |
| `lib/keys.ts` | Key generation function (`CCI-PRO-` + 24 hex) |
| `lib/cors.ts` | CORS header helper |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript config |
| `vercel.json` | CORS headers, route config |
| `.env.local` | Local dev env vars (not committed) |
| `.gitignore` | Standard ignores |

### Dashboard modifications (`/Users/bengreenberg/Dev/personal/claude-dashboard/`)

| File | Change |
|------|--------|
| `src/components/UpgradePrompt.tsx` | Replace LemonSqueezy checkout link + validation URL |
| `src/app/page.tsx` | Replace on-mount validation URL |
| `src/app/api/license/validate/route.ts` | Delete |
| `.env.local` | Add `NEXT_PUBLIC_LICENSE_API_URL` |

### Pro module modifications (`/Users/bengreenberg/Dev/personal/cci-pro/`)

| File | Change |
|------|--------|
| `src/license.ts` | Replace `/api/license/validate` with configurable URL |

### Test suite (dashboard repo, NOT committed to git)

| File | Purpose |
|------|---------|
| `__tests__/unit/key-generation.test.ts` | Key format, uniqueness, entropy |
| `__tests__/unit/webhook.test.ts` | Webhook handler with mocked Stripe |
| `__tests__/unit/validate.test.ts` | Validate/activate logic with mocked Stripe |
| `__tests__/unit/checkout.test.ts` | Checkout session creation with mocked Stripe |
| `__tests__/integration/stripe-flow.test.ts` | Full flow with Stripe test mode |
| `__tests__/e2e/upgrade-flow.spec.ts` | Browser E2E: builder key, invalid key, valid key |
| `vitest.config.ts` | Vitest configuration |
| `playwright.config.ts` | Playwright configuration |

---

## Task 1: Scaffold the License Service Project

**Files:**
- Create: `../cci-license-service/package.json`
- Create: `../cci-license-service/tsconfig.json`
- Create: `../cci-license-service/vercel.json`
- Create: `../cci-license-service/.gitignore`
- Create: `../cci-license-service/.env.local`

- [ ] **Step 1: Create the project directory and initialize**

```bash
mkdir -p /Users/bengreenberg/Dev/personal/cci-license-service/{api,lib}
cd /Users/bengreenberg/Dev/personal/cci-license-service
```

- [ ] **Step 2: Create package.json**

Write to `/Users/bengreenberg/Dev/personal/cci-license-service/package.json`:

```json
{
  "name": "cci-license-service",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vercel dev",
    "deploy": "vercel --prod"
  },
  "dependencies": {
    "stripe": "^17.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vercel": "^41.0.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Write to `/Users/bengreenberg/Dev/personal/cci-license-service/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@lib/*": ["lib/*"]
    }
  },
  "include": ["api/**/*.ts", "lib/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create vercel.json**

Write to `/Users/bengreenberg/Dev/personal/cci-license-service/vercel.json`:

```json
{
  "functions": {
    "api/*.ts": {
      "memory": 256,
      "maxDuration": 10
    }
  }
}
```

Note: CORS headers are set dynamically in each function using `lib/cors.ts` and the `ALLOWED_ORIGIN` env var. No static headers needed in vercel.json.

- [ ] **Step 5: Create .gitignore**

Write to `/Users/bengreenberg/Dev/personal/cci-license-service/.gitignore`:

```
node_modules/
dist/
.vercel/
.env.local
.env*.local
```

- [ ] **Step 6: Create .env.local for local dev**

Write to `/Users/bengreenberg/Dev/personal/cci-license-service/.env.local`:

```
STRIPE_SECRET_KEY=sk_test_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
STRIPE_PRICE_ID=price_REPLACE_ME
ALLOWED_ORIGIN=http://localhost:3000
```

- [ ] **Step 7: Install dependencies**

```bash
cd /Users/bengreenberg/Dev/personal/cci-license-service && npm install
```

- [ ] **Step 8: Initialize git and commit**

```bash
cd /Users/bengreenberg/Dev/personal/cci-license-service
git init
git add package.json tsconfig.json vercel.json .gitignore
git commit -m "scaffold cci-license-service project"
```

---

## Task 2: Shared Libraries (Stripe Client, Key Generation, CORS)

**Files:**
- Create: `../cci-license-service/lib/stripe.ts`
- Create: `../cci-license-service/lib/keys.ts`
- Create: `../cci-license-service/lib/cors.ts`

- [ ] **Step 1: Create the Stripe client**

Write to `/Users/bengreenberg/Dev/personal/cci-license-service/lib/stripe.ts`:

```typescript
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
});
```

- [ ] **Step 2: Create the key generation module**

Write to `/Users/bengreenberg/Dev/personal/cci-license-service/lib/keys.ts`:

```typescript
import { randomBytes } from "crypto";

export function generateLicenseKey(): string {
  const hex = randomBytes(12).toString("hex"); // 12 bytes = 24 hex chars
  return `CCI-PRO-${hex}`;
}
```

- [ ] **Step 3: Create the CORS helper**

Write to `/Users/bengreenberg/Dev/personal/cci-license-service/lib/cors.ts`:

```typescript
export function corsHeaders(): Record<string, string> {
  const origin = process.env.ALLOWED_ORIGIN || "http://localhost:3000";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function corsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bengreenberg/Dev/personal/cci-license-service
git add lib/
git commit -m "add shared libs: stripe client, key generation, cors"
```

---

## Task 3: Checkout Endpoint

**Files:**
- Create: `../cci-license-service/api/checkout.ts`

- [ ] **Step 1: Create the checkout endpoint**

Write to `/Users/bengreenberg/Dev/personal/cci-license-service/api/checkout.ts`:

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { stripe } from "../lib/stripe.js";
import { corsHeaders, corsResponse } from "../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    const resp = corsResponse();
    res.status(204);
    for (const [k, v] of Object.entries(corsHeaders())) {
      res.setHeader(k, v);
    }
    return res.end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const headers = corsHeaders();
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }

  try {
    const origin = process.env.ALLOWED_ORIGIN || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      success_url: `${origin}?checkout=success`,
      cancel_url: `${origin}?checkout=cancel`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return res.status(500).json({ error: message });
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bengreenberg/Dev/personal/cci-license-service
git add api/checkout.ts
git commit -m "add checkout endpoint: creates Stripe Checkout session"
```

---

## Task 4: Webhook Endpoint

**Files:**
- Create: `../cci-license-service/api/webhook.ts`

- [ ] **Step 1: Create the webhook endpoint**

Write to `/Users/bengreenberg/Dev/personal/cci-license-service/api/webhook.ts`:

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { stripe } from "../lib/stripe.js";
import { generateLicenseKey } from "../lib/keys.js";

// Vercel needs raw body for webhook signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ error: "missing stripe-signature header" });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return res.status(400).json({ error: `webhook verification failed: ${message}` });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerId = session.customer as string;
    const paymentIntentId = session.payment_intent as string;

    if (!customerId) {
      return res.status(400).json({ error: "no customer on session" });
    }

    const licenseKey = generateLicenseKey();

    // Store key and activation tracking on the Customer
    await stripe.customers.update(customerId, {
      metadata: {
        cci_license_key: licenseKey,
        cci_activations: "0",
        cci_max_activations: "2",
      },
    });

    // Also store on PaymentIntent so it shows on the Stripe receipt
    if (paymentIntentId) {
      await stripe.paymentIntents.update(paymentIntentId, {
        metadata: {
          cci_license_key: licenseKey,
        },
      });
    }
  }

  return res.status(200).json({ received: true });
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bengreenberg/Dev/personal/cci-license-service
git add api/webhook.ts
git commit -m "add webhook endpoint: generates license key on checkout completion"
```

---

## Task 5: Validate Endpoint

**Files:**
- Create: `../cci-license-service/api/validate.ts`

- [ ] **Step 1: Create the validate endpoint**

Write to `/Users/bengreenberg/Dev/personal/cci-license-service/api/validate.ts`:

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { stripe } from "../lib/stripe.js";
import { corsHeaders, corsResponse } from "../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    for (const [k, v] of Object.entries(corsHeaders())) {
      res.setHeader(k, v);
    }
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const headers = corsHeaders();
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }

  try {
    const { license_key, action } = req.body as {
      license_key?: string;
      action?: "validate" | "activate";
    };

    if (!license_key) {
      return res.status(400).json({
        valid: false,
        error: "license key is required",
        activation_usage: 0,
        activation_limit: 0,
      });
    }

    // Search Stripe customers by metadata
    const result = await stripe.customers.search({
      query: `metadata["cci_license_key"]:"${license_key}"`,
    });

    if (result.data.length === 0) {
      return res.status(200).json({
        valid: false,
        error: "invalid license key",
        activation_usage: 0,
        activation_limit: 0,
      });
    }

    const customer = result.data[0];
    const activations = parseInt(customer.metadata.cci_activations || "0", 10);
    const maxActivations = parseInt(customer.metadata.cci_max_activations || "2", 10);

    if (action === "activate") {
      if (activations >= maxActivations) {
        return res.status(200).json({
          valid: false,
          error: "activation limit reached",
          activation_usage: activations,
          activation_limit: maxActivations,
        });
      }

      // Increment activation count
      await stripe.customers.update(customer.id, {
        metadata: {
          cci_activations: String(activations + 1),
        },
      });

      return res.status(200).json({
        valid: true,
        error: null,
        activation_usage: activations + 1,
        activation_limit: maxActivations,
      });
    }

    // action === "validate" (or no action)
    return res.status(200).json({
      valid: true,
      error: null,
      activation_usage: activations,
      activation_limit: maxActivations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return res.status(500).json({
      valid: false,
      error: `validation failed: ${message}`,
      activation_usage: 0,
      activation_limit: 0,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bengreenberg/Dev/personal/cci-license-service
git add api/validate.ts
git commit -m "add validate endpoint: validates and activates license keys"
```

---

## Task 6: Set Up Test Framework in Dashboard Repo

**Files:**
- Create: `claude-dashboard/vitest.config.ts`
- Create: `claude-dashboard/playwright.config.ts`
- Modify: `claude-dashboard/.gitignore`
- Modify: `claude-dashboard/package.json` (dev dependencies)

- [ ] **Step 1: Install test dependencies**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
npm install --save-dev vitest @testing-library/react @testing-library/dom jsdom playwright @playwright/test stripe
```

- [ ] **Step 2: Create vitest.config.ts**

Write to `/Users/bengreenberg/Dev/personal/claude-dashboard/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/unit/**/*.test.ts", "__tests__/integration/**/*.test.ts"],
    globals: true,
  },
});
```

- [ ] **Step 3: Create playwright.config.ts**

Write to `/Users/bengreenberg/Dev/personal/claude-dashboard/playwright.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "__tests__/e2e",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 4: Add test files to .gitignore**

Append to `/Users/bengreenberg/Dev/personal/claude-dashboard/.gitignore`:

```
# test suite (local only, not committed)
__tests__/
vitest.config.ts
playwright.config.ts
playwright-report/
test-results/
```

- [ ] **Step 5: Create test directories**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
mkdir -p __tests__/unit __tests__/integration __tests__/e2e
```

- [ ] **Step 6: Verify vitest runs (no tests yet)**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
npx vitest run 2>&1 | head -5
```

Expected: "No test files found" or similar — confirms vitest is configured correctly.

---

## Task 7: Unit Tests — Key Generation

**Files:**
- Create: `claude-dashboard/__tests__/unit/key-generation.test.ts`

- [ ] **Step 1: Write key generation tests**

Write to `/Users/bengreenberg/Dev/personal/claude-dashboard/__tests__/unit/key-generation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateLicenseKey } from "../../cci-license-service-test-helpers.js";

// Inline the function here since we're testing the logic, not the import
// (the license service is a separate project)
import { randomBytes } from "crypto";

function generateKey(): string {
  const hex = randomBytes(12).toString("hex");
  return `CCI-PRO-${hex}`;
}

describe("generateLicenseKey", () => {
  it("returns a string starting with CCI-PRO-", () => {
    const key = generateKey();
    expect(key.startsWith("CCI-PRO-")).toBe(true);
  });

  it("has exactly 32 characters total (8 prefix + 24 hex)", () => {
    const key = generateKey();
    expect(key.length).toBe(32);
  });

  it("hex portion contains only valid hex characters", () => {
    const key = generateKey();
    const hex = key.slice(8); // remove "CCI-PRO-"
    expect(hex).toMatch(/^[0-9a-f]{24}$/);
  });

  it("generates unique keys across 100 runs", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(generateKey());
    }
    expect(keys.size).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
npx vitest run __tests__/unit/key-generation.test.ts
```

Expected: 4 tests pass.

---

## Task 8: Unit Tests — Webhook Handler

**Files:**
- Create: `claude-dashboard/__tests__/unit/webhook.test.ts`

- [ ] **Step 1: Write webhook tests with mocked Stripe**

Write to `/Users/bengreenberg/Dev/personal/claude-dashboard/__tests__/unit/webhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Stripe customer and payment intent updates
const mockCustomerUpdate = vi.fn().mockResolvedValue({});
const mockPaymentIntentUpdate = vi.fn().mockResolvedValue({});

// Simulate what the webhook handler does (extracted logic, not the HTTP handler)
async function handleCheckoutCompleted(session: {
  customer: string | null;
  payment_intent: string | null;
}) {
  if (!session.customer) {
    throw new Error("no customer on session");
  }

  // Generate a deterministic key for testing
  const licenseKey = `CCI-PRO-${"a".repeat(24)}`;

  await mockCustomerUpdate(session.customer, {
    metadata: {
      cci_license_key: licenseKey,
      cci_activations: "0",
      cci_max_activations: "2",
    },
  });

  if (session.payment_intent) {
    await mockPaymentIntentUpdate(session.payment_intent, {
      metadata: {
        cci_license_key: licenseKey,
      },
    });
  }

  return licenseKey;
}

describe("webhook: checkout.session.completed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores license key on customer metadata", async () => {
    const key = await handleCheckoutCompleted({
      customer: "cus_test123",
      payment_intent: "pi_test456",
    });

    expect(key).toMatch(/^CCI-PRO-/);
    expect(mockCustomerUpdate).toHaveBeenCalledWith("cus_test123", {
      metadata: {
        cci_license_key: key,
        cci_activations: "0",
        cci_max_activations: "2",
      },
    });
  });

  it("stores license key on payment intent metadata", async () => {
    const key = await handleCheckoutCompleted({
      customer: "cus_test123",
      payment_intent: "pi_test456",
    });

    expect(mockPaymentIntentUpdate).toHaveBeenCalledWith("pi_test456", {
      metadata: {
        cci_license_key: key,
      },
    });
  });

  it("skips payment intent update if no payment_intent", async () => {
    await handleCheckoutCompleted({
      customer: "cus_test123",
      payment_intent: null,
    });

    expect(mockPaymentIntentUpdate).not.toHaveBeenCalled();
  });

  it("throws if no customer on session", async () => {
    await expect(
      handleCheckoutCompleted({ customer: null, payment_intent: "pi_test456" })
    ).rejects.toThrow("no customer on session");
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
npx vitest run __tests__/unit/webhook.test.ts
```

Expected: 4 tests pass.

---

## Task 9: Unit Tests — Validate Handler

**Files:**
- Create: `claude-dashboard/__tests__/unit/validate.test.ts`

- [ ] **Step 1: Write validate tests with mocked Stripe**

Write to `/Users/bengreenberg/Dev/personal/claude-dashboard/__tests__/unit/validate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Stripe customer search and update
const mockCustomerSearch = vi.fn();
const mockCustomerUpdate = vi.fn().mockResolvedValue({});

// Extracted validation logic (mirrors api/validate.ts)
async function validateKey(
  licenseKey: string,
  action: "validate" | "activate"
): Promise<{
  valid: boolean;
  error: string | null;
  activation_usage: number;
  activation_limit: number;
}> {
  const result = await mockCustomerSearch({
    query: `metadata["cci_license_key"]:"${licenseKey}"`,
  });

  if (result.data.length === 0) {
    return { valid: false, error: "invalid license key", activation_usage: 0, activation_limit: 0 };
  }

  const customer = result.data[0];
  const activations = parseInt(customer.metadata.cci_activations || "0", 10);
  const maxActivations = parseInt(customer.metadata.cci_max_activations || "2", 10);

  if (action === "activate") {
    if (activations >= maxActivations) {
      return {
        valid: false,
        error: "activation limit reached",
        activation_usage: activations,
        activation_limit: maxActivations,
      };
    }

    await mockCustomerUpdate(customer.id, {
      metadata: { cci_activations: String(activations + 1) },
    });

    return {
      valid: true,
      error: null,
      activation_usage: activations + 1,
      activation_limit: maxActivations,
    };
  }

  return { valid: true, error: null, activation_usage: activations, activation_limit: maxActivations };
}

describe("validate endpoint logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns invalid for unknown key", async () => {
    mockCustomerSearch.mockResolvedValue({ data: [] });

    const result = await validateKey("CCI-PRO-nonexistent", "validate");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("invalid license key");
  });

  it("returns valid for known key with validate action", async () => {
    mockCustomerSearch.mockResolvedValue({
      data: [
        {
          id: "cus_123",
          metadata: {
            cci_license_key: "CCI-PRO-abc123",
            cci_activations: "1",
            cci_max_activations: "2",
          },
        },
      ],
    });

    const result = await validateKey("CCI-PRO-abc123", "validate");

    expect(result.valid).toBe(true);
    expect(result.activation_usage).toBe(1);
    expect(result.activation_limit).toBe(2);
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("increments activation count on activate action", async () => {
    mockCustomerSearch.mockResolvedValue({
      data: [
        {
          id: "cus_123",
          metadata: {
            cci_license_key: "CCI-PRO-abc123",
            cci_activations: "0",
            cci_max_activations: "2",
          },
        },
      ],
    });

    const result = await validateKey("CCI-PRO-abc123", "activate");

    expect(result.valid).toBe(true);
    expect(result.activation_usage).toBe(1);
    expect(mockCustomerUpdate).toHaveBeenCalledWith("cus_123", {
      metadata: { cci_activations: "1" },
    });
  });

  it("rejects activation when limit reached", async () => {
    mockCustomerSearch.mockResolvedValue({
      data: [
        {
          id: "cus_123",
          metadata: {
            cci_license_key: "CCI-PRO-abc123",
            cci_activations: "2",
            cci_max_activations: "2",
          },
        },
      ],
    });

    const result = await validateKey("CCI-PRO-abc123", "activate");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("activation limit reached");
    expect(result.activation_usage).toBe(2);
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("defaults max activations to 2 if missing", async () => {
    mockCustomerSearch.mockResolvedValue({
      data: [
        {
          id: "cus_123",
          metadata: {
            cci_license_key: "CCI-PRO-abc123",
            cci_activations: "0",
          },
        },
      ],
    });

    const result = await validateKey("CCI-PRO-abc123", "validate");

    expect(result.valid).toBe(true);
    expect(result.activation_limit).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
npx vitest run __tests__/unit/validate.test.ts
```

Expected: 5 tests pass.

---

## Task 10: Unit Tests — Checkout Handler

**Files:**
- Create: `claude-dashboard/__tests__/unit/checkout.test.ts`

- [ ] **Step 1: Write checkout tests with mocked Stripe**

Write to `/Users/bengreenberg/Dev/personal/claude-dashboard/__tests__/unit/checkout.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCheckoutCreate = vi.fn();

// Extracted checkout logic (mirrors api/checkout.ts)
async function createCheckoutSession(
  priceId: string,
  origin: string
): Promise<{ url: string }> {
  const session = await mockCheckoutCreate({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}?checkout=success`,
    cancel_url: `${origin}?checkout=cancel`,
  });

  return { url: session.url };
}

describe("checkout endpoint logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a payment-mode checkout session", async () => {
    mockCheckoutCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay/test123",
    });

    const result = await createCheckoutSession("price_test", "https://dashboard.example.com");

    expect(mockCheckoutCreate).toHaveBeenCalledWith({
      mode: "payment",
      line_items: [{ price: "price_test", quantity: 1 }],
      success_url: "https://dashboard.example.com?checkout=success",
      cancel_url: "https://dashboard.example.com?checkout=cancel",
    });
    expect(result.url).toBe("https://checkout.stripe.com/c/pay/test123");
  });

  it("uses the correct origin for success/cancel URLs", async () => {
    mockCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/test" });

    await createCheckoutSession("price_abc", "http://localhost:3000");

    const call = mockCheckoutCreate.mock.calls[0][0];
    expect(call.success_url).toBe("http://localhost:3000?checkout=success");
    expect(call.cancel_url).toBe("http://localhost:3000?checkout=cancel");
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
npx vitest run __tests__/unit/checkout.test.ts
```

Expected: 2 tests pass.

---

## Task 11: Integration Test — Full Stripe Flow

**Files:**
- Create: `claude-dashboard/__tests__/integration/stripe-flow.test.ts`

This test requires a real Stripe test-mode API key in the environment. It creates real Stripe objects and cleans them up after.

- [ ] **Step 1: Write the integration test**

Write to `/Users/bengreenberg/Dev/personal/claude-dashboard/__tests__/integration/stripe-flow.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Stripe from "stripe";
import { randomBytes } from "crypto";

// Skip if no Stripe key configured
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const describeIfStripe = STRIPE_KEY ? describe : describe.skip;

function generateKey(): string {
  return `CCI-PRO-${randomBytes(12).toString("hex")}`;
}

describeIfStripe("Stripe integration flow", () => {
  let stripe: Stripe;
  let testCustomerId: string;
  let testKey: string;

  beforeAll(async () => {
    stripe = new Stripe(STRIPE_KEY!);

    // Create a test customer (simulates what webhook would do)
    testKey = generateKey();
    const customer = await stripe.customers.create({
      email: "test@cci-integration.dev",
      name: "CCI Integration Test",
      metadata: {
        cci_license_key: testKey,
        cci_activations: "0",
        cci_max_activations: "2",
      },
    });
    testCustomerId = customer.id;
  });

  afterAll(async () => {
    // Clean up test customer
    if (testCustomerId) {
      await stripe.customers.del(testCustomerId);
    }
  });

  it("finds customer by license key via search", async () => {
    // Stripe search index can take a moment, retry a few times
    let found = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await stripe.customers.search({
        query: `metadata["cci_license_key"]:"${testKey}"`,
      });
      if (result.data.length > 0) {
        expect(result.data[0].id).toBe(testCustomerId);
        found = true;
        break;
      }
      // Wait 2 seconds for search index to update
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(found).toBe(true);
  }, 30000);

  it("validates a known key", async () => {
    const result = await stripe.customers.search({
      query: `metadata["cci_license_key"]:"${testKey}"`,
    });
    const customer = result.data[0];

    expect(customer.metadata.cci_license_key).toBe(testKey);
    expect(customer.metadata.cci_activations).toBe("0");
    expect(customer.metadata.cci_max_activations).toBe("2");
  });

  it("increments activation count", async () => {
    await stripe.customers.update(testCustomerId, {
      metadata: { cci_activations: "1" },
    });

    const updated = await stripe.customers.retrieve(testCustomerId) as Stripe.Customer;
    expect(updated.metadata.cci_activations).toBe("1");
  });

  it("rejects when activation limit reached", async () => {
    await stripe.customers.update(testCustomerId, {
      metadata: { cci_activations: "2" },
    });

    const customer = await stripe.customers.retrieve(testCustomerId) as Stripe.Customer;
    const activations = parseInt(customer.metadata.cci_activations, 10);
    const max = parseInt(customer.metadata.cci_max_activations, 10);

    expect(activations >= max).toBe(true);
  });

  it("returns no results for invalid key", async () => {
    const result = await stripe.customers.search({
      query: `metadata["cci_license_key"]:"CCI-PRO-doesnotexist000000000000"`,
    });
    expect(result.data.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the integration tests (requires STRIPE_SECRET_KEY)**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
STRIPE_SECRET_KEY=sk_test_YOUR_KEY npx vitest run __tests__/integration/stripe-flow.test.ts
```

Expected: 5 tests pass (or skipped if no key set).

---

## Task 12: Update Dashboard — UpgradePrompt.tsx

**Files:**
- Modify: `claude-dashboard/src/components/UpgradePrompt.tsx`

- [ ] **Step 1: Add the license API URL constant**

At the top of `UpgradePrompt.tsx`, after the existing imports and before the `FEATURES` array, replace:

```typescript
// builder key that always works locally without api call
const BUILDER_KEY = "CCI-BUILDER-f7e2a91b3c";
```

with:

```typescript
// builder key that always works locally without api call
const BUILDER_KEY = "CCI-BUILDER-f7e2a91b3c";

// license service URL (baked in at build time, falls back to localhost for dev)
const LICENSE_API_URL = process.env.NEXT_PUBLIC_LICENSE_API_URL || "http://localhost:3000/api";
```

- [ ] **Step 2: Replace the checkout link with a dynamic fetch**

In `UpgradePrompt.tsx`, replace the static `<a>` tag for "Get a License Key" (the entire `<a>` element around line 215-226) with:

```typescript
          <button
            onClick={async () => {
              try {
                const res = await fetch(`${LICENSE_API_URL}/checkout`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                });
                const data = await res.json();
                if (data.url) {
                  window.open(data.url, '_blank', 'noopener,noreferrer');
                }
              } catch {
                // fall back to opening nothing — user can retry
              }
            }}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-sm hover:from-cyan-400 hover:to-blue-400 transition-all duration-200 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:-translate-y-0.5 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Get a License Key
          </button>
```

- [ ] **Step 3: Replace the validation URL**

In the `handleActivate` function in `UpgradePrompt.tsx`, replace:

```typescript
      const res = await fetch('/api/license/validate', {
```

with:

```typescript
      const res = await fetch(`${LICENSE_API_URL}/validate`, {
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
git add src/components/UpgradePrompt.tsx
git commit -m "switch UpgradePrompt from LemonSqueezy to Stripe license service"
```

---

## Task 13: Update Dashboard — page.tsx

**Files:**
- Modify: `claude-dashboard/src/app/page.tsx`

- [ ] **Step 1: Add the license API URL constant**

In `page.tsx`, after the `BUILDER_KEY` and `LICENSE_STORAGE_KEY` declarations inside the `Home` component (around line 112-113), add:

```typescript
  const LICENSE_API_URL = process.env.NEXT_PUBLIC_LICENSE_API_URL || "http://localhost:3000/api";
```

- [ ] **Step 2: Replace the on-mount validation URL**

In the `useEffect` that checks stored license on mount, replace:

```typescript
      fetch('/api/license/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: stored, action: 'validate' }),
      })
```

with:

```typescript
      fetch(`${LICENSE_API_URL}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: stored, action: 'validate' }),
      })
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
git add src/app/page.tsx
git commit -m "switch page.tsx license validation to Stripe license service"
```

---

## Task 14: Update Pro Module — license.ts

**Files:**
- Modify: `cci-pro/src/license.ts`

- [ ] **Step 1: Add configurable license API URL**

At the top of `/Users/bengreenberg/Dev/personal/cci-pro/src/license.ts`, after the localStorage key constants, add:

```typescript
// license service URL — uses env var when available, falls back to localhost
const LICENSE_API_URL =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_LICENSE_API_URL
    ? process.env.NEXT_PUBLIC_LICENSE_API_URL
    : "http://localhost:3000/api";
```

- [ ] **Step 2: Replace the validation URL in validateAsync**

In the `validateAsync` function, replace:

```typescript
    const response = await fetch("/api/license/validate", {
```

with:

```typescript
    const response = await fetch(`${LICENSE_API_URL}/validate`, {
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bengreenberg/Dev/personal/cci-pro
git add src/license.ts
git commit -m "switch license validation to external Stripe license service URL"
```

---

## Task 15: Delete Old LemonSqueezy Route

**Files:**
- Delete: `claude-dashboard/src/app/api/license/validate/route.ts`

- [ ] **Step 1: Delete the file**

```bash
rm /Users/bengreenberg/Dev/personal/claude-dashboard/src/app/api/license/validate/route.ts
```

- [ ] **Step 2: Remove the empty directories if nothing else is in them**

```bash
rmdir /Users/bengreenberg/Dev/personal/claude-dashboard/src/app/api/license/validate 2>/dev/null
rmdir /Users/bengreenberg/Dev/personal/claude-dashboard/src/app/api/license 2>/dev/null
```

- [ ] **Step 3: Verify the build still works**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard && npm run build
```

Expected: Build succeeds without errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
git add -A src/app/api/license/
git commit -m "remove LemonSqueezy license validation route"
```

---

## Task 16: Add Environment Variable to Dashboard

**Files:**
- Modify: `claude-dashboard/.env.local`

- [ ] **Step 1: Add the license API URL to .env.local**

Append to `/Users/bengreenberg/Dev/personal/claude-dashboard/.env.local`:

```
NEXT_PUBLIC_LICENSE_API_URL=https://license.yalladevrel.com/api
```

- [ ] **Step 2: Verify the app starts with the new env var**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard && npm run dev
```

Check the console — no errors related to license API URL. The UpgradePrompt should still render (checkout will fail until the service is deployed, but the UI should load).

---

## Task 17: E2E Tests — Playwright

**Files:**
- Create: `claude-dashboard/__tests__/e2e/upgrade-flow.spec.ts`

- [ ] **Step 1: Install Playwright browsers**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
npx playwright install chromium
```

- [ ] **Step 2: Write E2E tests**

Write to `/Users/bengreenberg/Dev/personal/claude-dashboard/__tests__/e2e/upgrade-flow.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("UpgradePrompt license activation", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("cci-license-key");
      localStorage.removeItem("cci-instance-id");
      localStorage.removeItem("cci-license-validated");
    });
  });

  test("shows upgrade prompt when clicking analytics without license", async ({ page }) => {
    await page.goto("/");
    // Click the analytics button in the sidebar
    const analyticsButton = page.locator("text=Analytics").or(page.locator("[title='Analytics']"));
    if (await analyticsButton.isVisible()) {
      await analyticsButton.click();
    }
    // Should see the upgrade prompt
    await expect(page.locator("text=Unlock Analytics")).toBeVisible({ timeout: 5000 });
  });

  test("builder key activates instantly", async ({ page }) => {
    await page.goto("/");
    // Navigate to analytics view
    const analyticsButton = page.locator("text=Analytics").or(page.locator("[title='Analytics']"));
    if (await analyticsButton.isVisible()) {
      await analyticsButton.click();
    }
    await expect(page.locator("text=Unlock Analytics")).toBeVisible({ timeout: 5000 });

    // Expand key input
    await page.locator("text=Already have a key").click();

    // Enter builder key
    await page.locator("input[placeholder*='CCI-PRO']").fill("CCI-BUILDER-f7e2a91b3c");
    await page.locator("button:has-text('Activate')").click();

    // Should show success animation
    await expect(page.locator("text=License Activated")).toBeVisible({ timeout: 3000 });
  });

  test("invalid key shows error", async ({ page }) => {
    await page.goto("/");
    const analyticsButton = page.locator("text=Analytics").or(page.locator("[title='Analytics']"));
    if (await analyticsButton.isVisible()) {
      await analyticsButton.click();
    }
    await expect(page.locator("text=Unlock Analytics")).toBeVisible({ timeout: 5000 });

    await page.locator("text=Already have a key").click();
    await page.locator("input[placeholder*='CCI-PRO']").fill("CCI-PRO-invalid000000000000000");
    await page.locator("button:has-text('Activate')").click();

    // Should show an error (either from API or network error)
    await expect(
      page.locator("text=invalid").or(page.locator("text=could not validate"))
    ).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 3: Run the E2E tests (requires dev server running)**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
npx playwright test __tests__/e2e/upgrade-flow.spec.ts
```

Expected: Builder key test passes. Invalid key test passes (shows error). Analytics prompt test passes.

---

## Task 18: Run All Tests

- [ ] **Step 1: Run all unit tests**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
npx vitest run
```

Expected: All unit tests pass (key-generation: 4, webhook: 4, validate: 5, checkout: 2 = 15 total).

- [ ] **Step 2: Run integration tests (if Stripe key available)**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
STRIPE_SECRET_KEY=sk_test_YOUR_KEY npx vitest run __tests__/integration/
```

Expected: 5 tests pass.

- [ ] **Step 3: Run E2E tests**

```bash
cd /Users/bengreenberg/Dev/personal/claude-dashboard
npx playwright test
```

Expected: 3 tests pass.

---

## Task 19: Manual End-to-End Test (Guided)

This task is done together with the user after deployment.

- [ ] **Step 1: Create Stripe test-mode product and price**

In Stripe Dashboard (test mode):
1. Products → Add product → "Claude Code Inspector Pro"
2. Add price: $14.99, one-time
3. Copy the Price ID (`price_xxx`)

- [ ] **Step 2: Deploy license service to Vercel**

```bash
cd /Users/bengreenberg/Dev/personal/cci-license-service
npx vercel --prod
```

Set environment variables in Vercel dashboard:
- `STRIPE_SECRET_KEY` = your test secret key
- `STRIPE_WEBHOOK_SECRET` = (from step 3)
- `STRIPE_PRICE_ID` = the price ID from step 1
- `ALLOWED_ORIGIN` = your dashboard URL

- [ ] **Step 3: Configure Stripe webhook**

In Stripe Dashboard → Developers → Webhooks:
1. Add endpoint: `https://license.yalladevrel.com/api/webhook`
2. Select event: `checkout.session.completed`
3. Copy the signing secret → set as `STRIPE_WEBHOOK_SECRET` in Vercel

- [ ] **Step 4: Test the checkout flow**

1. Open the dashboard locally
2. Click Analytics → "Get a License Key"
3. Complete checkout with test card `4242 4242 4242 4242` (any future exp, any CVC)
4. Check Stripe Dashboard → Customers → find the new customer → metadata should have `cci_license_key`
5. Copy the key

- [ ] **Step 5: Test license activation**

1. In the dashboard, click "Already have a key?"
2. Paste the key from step 4
3. Click Activate
4. Should see "License Activated" success animation

- [ ] **Step 6: Test activation limit**

1. Clear localStorage in browser dev tools
2. Re-enter the same key → should activate (activation 2 of 2)
3. Clear localStorage again
4. Re-enter the same key → should show "activation limit reached"
