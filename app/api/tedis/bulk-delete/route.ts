import { NextResponse } from "next/server";
import axios from "axios";
import { z } from "zod";
import { getValidAccessTokenFromServer } from "@/lib/auth-server";
import { parseAxiosError } from "@/lib/errors";

// 1. Validate incoming payload
const BulkDeleteSchema = z.object({
  moduleApiName: z.string().min(1),
  cvid: z.string().min(1),
  territory: z
    .object({
      id: z.string().min(1),
      include_child: z.boolean().optional(),
    })
    .optional(),
});

type BulkDeleteInput = z.infer<typeof BulkDeleteSchema>;

// 2. Load base URL from env
const BASE_URL = process.env.BASE_URL!;

// 3. Route Handler
export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { moduleApiName, cvid, territory }: BulkDeleteInput =
      BulkDeleteSchema.parse(json);

    // construct Zoho endpoint URL
    const url = `${BASE_URL}/crm/v2/${moduleApiName}/actions/mass_delete`;

    // build payload
    const payload: Record<string, unknown> = { cvid };
    if (territory) {
      payload.territory = {
        id: territory.id,
        include_child: territory.include_child ?? false,
      };
    }

    const accessToken = await getValidAccessTokenFromServer();

    const zohoRes = await axios.post(url, payload, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    return NextResponse.json(zohoRes.data, { status: zohoRes.status });
  } catch (err) {
    // Zod validation errors
    if (err instanceof z.ZodError) {
      return NextResponse.json({ errors: err.issues }, { status: 400 });
    }
    // Axios HTTP errors
    if (axios.isAxiosError(err)) {
      const { message, status } = parseAxiosError(err);

      return NextResponse.json({ error: message }, { status });
    }
    // fallback
    console.error("[Bulk Delete Error]", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
