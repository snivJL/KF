import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidAccessTokenFromServer } from "@/lib/auth-server";
import axios from "axios";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;
const BASE_URL = process.env.BASE_URL!;

type LatLng = { lat: number; lng: number };

const geocodeClient = axios.create({
  baseURL: "https://maps.googleapis.com/maps/api/geocode",
});

type GeocodeResult = {
  geometry: {
    location: LatLng;
    location_type: string;
    bounds?: {
      northeast: LatLng;
      southwest: LatLng;
    };
  };
  types: string[];
  address_components: { long_name: string; types: string[] }[];
};

interface GoogleGeocodeResponse {
  status: string;
  results: GeocodeResult[];
}

export async function POST() {
  try {
    const accounts = await prisma.account.findMany({
      where: { latitude: null, longitude: null },
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
                Confidence_Score__C: confidenceScore,
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

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function evaluateGeocodeAccuracy(result: GeocodeResult) {
  const { location_type, bounds } = result.geometry;

  let score = 0;
  let description = "";
  let maxErrorRadius = null;

  switch (location_type) {
    case "ROOFTOP":
      score += 1;
      description = "Exact address";
      break;
    case "RANGE_INTERPOLATED":
      score += 0.7;
      description = "Interpolated between addresses";
      break;
    case "GEOMETRIC_CENTER":
      score += 0.5;
      description = "Center of a region";
      break;
    case "APPROXIMATE":
    default:
      score += 0.3;
      description = "Approximate location (e.g., city, district)";
  }

  const matchTypes = result.types;
  if (matchTypes.includes("street_address") || matchTypes.includes("premise")) {
    score += 0.3;
  } else if (
    matchTypes.includes("locality") ||
    matchTypes.includes("neighborhood")
  ) {
    score += 0.1;
  }

  score = Math.min(1, score);

  if (bounds) {
    const { northeast, southwest } = bounds;
    maxErrorRadius =
      haversine(northeast.lat, northeast.lng, southwest.lat, southwest.lng) / 2;
  }

  return {
    confidenceScore: parseFloat(score.toFixed(2)),
    isAccurate: score >= 0.7,
    description,
    maxErrorRadiusMeters: maxErrorRadius ? Math.round(maxErrorRadius) : null,
  };
}

async function geocodeAddress(
  address: string
): Promise<{ result: GeocodeResult; location: LatLng }> {
  const { data } = await geocodeClient.get<GoogleGeocodeResponse>("/json", {
    params: { address, key: GOOGLE_API_KEY },
  });

  if (data.status !== "OK" || !data.results.length) {
    throw new Error(`Geocode status ${data.status}`);
  }

  const result = data.results[0]!;
  return { result, location: result.geometry.location };
}
