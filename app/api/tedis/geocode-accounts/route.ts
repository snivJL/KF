import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidAccessTokenFromServer } from "@/lib/auth-server";
import axios from "axios";
import { evaluateGeocodeAccuracy, geocodeAddress } from "@/lib/geocode";

const BASE_URL = process.env.BASE_URL!;

export async function POST() {
  try {
    const accounts = await prisma.account.findMany({
      where: { longitude: null, latitude: null },
      orderBy: { code: "desc" },
    });

    const accessToken = await getValidAccessTokenFromServer();

    for (const acc of accounts) {
      const fullAddress = [
        acc.shippingStreet,
        acc.shippingCity,
        acc.shippingProvince,
        acc.shippingCountry,
      ]
        .filter(Boolean)
        .join(", ");

      console.log(fullAddress);
      try {
        const { result, location } = await geocodeAddress(fullAddress);

        const {
          confidenceScore,
          isAccurate,
          description,
          maxErrorRadiusMeters,
        } = evaluateGeocodeAccuracy(result);

        console.log(
          `[${acc.code}] Accuracy: ${confidenceScore} (${description})`
        );

        const lat = location.lat;
        const lng = location.lng;
        if (!isAccurate) {
          console.warn(
            `Geocode for ${acc.name} (${acc.id}) is not accurate enough: ${description}`
          );
        }
        // Push to CRM
        await axios.put(
          `${BASE_URL}/crm/v6/Accounts/${acc.id}`,
          {
            data: [
              {
                Latitude__C: lat.toFixed(9),
                Longitude__C: lng.toFixed(9),
                Confidence_Score__C: confidenceScore.toFixed(1),
              },
            ],
          },
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        // Update DB
        await prisma.account.update({
          where: { id: acc.id },
          data: {
            latitude: lat,
            longitude: lng,
            geocodeAttempts: { increment: 1 },
            lastGeocodeError: null,
            lastGeocodeAt: new Date(),
            geocodeConfidence: confidenceScore,
            geocodePrecision: description,
            geocodeRadius: maxErrorRadiusMeters,
          },
        });
      } catch (e) {
        console.error(
          `Failed to geocode ${acc.name} (${acc.id}): ${
            e instanceof Error ? e.message : e
          }`
        );
        await prisma.account.update({
          where: { id: acc.id },
          data: {
            geocodeAttempts: { increment: 1 },
            lastGeocodeError: e instanceof Error ? e.message : "Unknown",
            lastGeocodeAt: new Date(),
          },
        });
      }
    }

    return NextResponse.json({ message: "Batch complete" });
  } catch (err) {
    console.error("Batch failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
