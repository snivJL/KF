import { getValidAccessTokenFromServer } from "@/lib/auth-server";
import { evaluateGeocodeAccuracy, geocodeAddress } from "../helpers";
import { prisma } from "@/lib/prisma";
import axios from "axios";
const BASE_URL = process.env.BASE_URL!;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const accessToken = await getValidAccessTokenFromServer();
  const acc = await prisma.account.findFirstOrThrow({
    where: { id },
  });
  const fullAddress = [
    acc.shippingStreet,
    acc.shippingCity,
    acc.shippingProvince,
    acc.shippingCountry,
  ]
    .filter(Boolean)
    .join(", ");

  try {
    const { result, location } = await geocodeAddress(fullAddress);
    const { confidenceScore, isAccurate, description, maxErrorRadiusMeters } =
      evaluateGeocodeAccuracy(result);

    console.log(`[${acc.code}] Accuracy: ${confidenceScore} (${description})`);

    const lat = location.lat;
    const lng = location.lng;
    if (!isAccurate) {
      console.warn(
        `Geocode for ${acc.name} (${acc.id}) is not accurate enough: ${description}`
      );
    }
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
