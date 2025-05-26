import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const takeParam = searchParams.get("take");
    const take = takeParam ? parseInt(takeParam, 10) : undefined;

    const accounts = await prisma.account.findMany({
      orderBy: { updatedAt: "desc" },
      ...(take !== undefined ? { take } : {}), // Only include 'take' if it's defined
    });

    return NextResponse.json(accounts);
  } catch (err) {
    console.error("Failed to fetch accounts:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const formBody = await req.text();
    const data = Object.fromEntries(new URLSearchParams(formBody));

    const {
      id,
      name,
      code,
      street,
      province,
      city,
      country,
      latitude,
      longitude,
    } = data;

    if (!id || !name || !code) {
      return NextResponse.json(
        { error: "Missing required fields: id and name" },
        { status: 400 }
      );
    }

    await prisma.account.upsert({
      where: { id },
      update: {
        name,
        code,
        shippingStreet: street,
        shippingProvince: province,
        shippingCity: city,
        shippingCountry: country,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        updatedAt: new Date(),
      },
      create: {
        id,
        name,
        code,
        shippingStreet: street,
        shippingProvince: province,
        shippingCity: city,
        shippingCountry: country,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook account sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    await prisma.account.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
