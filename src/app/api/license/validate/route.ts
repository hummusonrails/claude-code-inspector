import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// lemonsqueezy license validation endpoint
// this is a public api that does not require authentication
const LS_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
const LS_ACTIVATE_URL = "https://api.lemonsqueezy.com/v1/licenses/activate";

interface LicenseResponse {
  valid: boolean;
  error: string | null;
  license_key: {
    id: number;
    status: string;
    key: string;
    activation_limit: number;
    activation_usage: number;
    created_at: string;
    expires_at: string | null;
  } | null;
  instance: {
    id: string;
    name: string;
    created_at: string;
  } | null;
  meta: {
    store_id: number;
    order_id: number;
    product_id: number;
    product_name: string;
    variant_id: number;
    variant_name: string;
    customer_id: number;
    customer_name: string;
    customer_email: string;
  } | null;
}

// validate or activate a license key
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { license_key, instance_id, action } = body as {
      license_key?: string;
      instance_id?: string;
      action?: "validate" | "activate";
    };

    if (!license_key) {
      return NextResponse.json(
        { valid: false, error: "license key is required" },
        { status: 400 }
      );
    }

    const url = action === "activate" ? LS_ACTIVATE_URL : LS_VALIDATE_URL;

    // build form data for lemonsqueezy
    const formData = new URLSearchParams();
    formData.append("license_key", license_key);

    if (action === "activate") {
      formData.append("instance_name", "Claude Code Inspector");
    } else if (instance_id) {
      formData.append("instance_id", instance_id);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const data: LicenseResponse = await response.json();

    // return a simplified response to the client
    return NextResponse.json({
      valid: data.valid === true,
      error: data.error,
      status: data.license_key?.status || null,
      activation_usage: data.license_key?.activation_usage || 0,
      activation_limit: data.license_key?.activation_limit || 0,
      instance_id: data.instance?.id || null,
      customer_name: data.meta?.customer_name || null,
      product_name: data.meta?.product_name || null,
    });
  } catch {
    return NextResponse.json(
      { valid: false, error: "failed to validate license" },
      { status: 500 }
    );
  }
}
