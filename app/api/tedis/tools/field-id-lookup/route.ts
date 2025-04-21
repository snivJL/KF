import { NextRequest, NextResponse } from "next/server";
import { getAccessTokenFromServer } from "@/lib/auth-server";
import axios from "axios";

const BASE_URL = process.env.BASE_URL || "https://kf.zohoplatform.com";

export async function POST(req: NextRequest) {
  try {
    const { fieldId } = await req.json();

    if (!fieldId) {
      return NextResponse.json(
        { error: "Missing fieldId or module" },
        { status: 400 }
      );
    }

    const accessToken = await getAccessTokenFromServer();
    const headers = { Authorization: `Bearer ${accessToken}` };

    const response = await axios.get(
      `${BASE_URL}/crm/v6/settings/related_lists?module=Invoices`,
      {
        headers,
      }
    );

    console.log(response.data);
    const fields = response.data?.fields || [];
    console.log(fields);
    const field = fields.find(
      (f: any) => f.id?.toString() === fieldId.toString()
    );

    if (!field) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }

    return NextResponse.json({
      api_name: field.api_name,
      label: field.field_label,
      module,
      type: field.data_type,
      field_id: field.id,
    });
  } catch (err) {
    console.error("Field lookup failed:", err);
    return NextResponse.json(
      { error: "Failed to lookup field." },
      { status: 500 }
    );
  }
}
