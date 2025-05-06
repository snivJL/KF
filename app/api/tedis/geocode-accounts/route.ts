import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccessTokenFromServer } from "@/lib/auth-server";
import axios from "axios";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;
const BASE_URL = process.env.BASE_URL!;

interface GeocodeResult {
  lat: number;
  lng: number;
}

interface GoogleGeocodeResponse {
  status: string;
  results: { geometry: { location: GeocodeResult } }[];
}

const geocodeClient = axios.create({
  baseURL: "https://maps.googleapis.com/maps/api/geocode",
});

async function geocodeAddress(address: string): Promise<GeocodeResult> {
  try {
    const { data } = await geocodeClient.get<GoogleGeocodeResponse>("/json", {
      params: { address, key: GOOGLE_API_KEY },
    });
    console.log(data.results.map((r) => r.geometry.location));
    if (data.status !== "OK" || !data.results.length) {
      throw new Error(`Geocode status ${data.status}`);
    }
    return data.results[0]!.geometry.location;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(`Axios error: ${err.response?.status} ${err.message}`);
    }
    throw err;
  }
}

// export async function POST() {
//   try {
//     const accounts = await prisma.account.findMany({
//       take: 14643,
//     });

//     const accessToken = await getAccessTokenFromServer();
//     const updatedAccounts: GeoResult[] = [];
//     const failedAccounts: FailedResult[] = [];

//     for (const acc of accounts) {
//       const fullAddress = `${acc.shippingStreet ?? ""}, ${
//         acc.shippingCity ?? ""
//       }, ${acc.shippingProvince ?? ""}, ${acc.shippingCountry ?? ""}`;
//       console.log("Searching concatenated address:", fullAddress);

//       try {
//         const encoded = encodeURIComponent(fullAddress);
//         const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${GOOGLE_API_KEY}`;
//         const geoRes = await fetch(url);
//         const geoData = await geoRes.json();

//         console.log("Geocoding for:", acc.name);
//         console.log(geoData);

//         const location = geoData.results?.[0]?.geometry?.location;
//         if (geoData.status === "OK" && location) {
//           const { lat, lng } = location;

//           const crmRes = await fetch(`${BASE_URL}/crm/v6/Accounts/${acc.id}`, {
//             method: "PUT",
//             headers: {
//               Authorization: `Bearer ${accessToken}`,
//               "Content-Type": "application/json",
//             },
//             body: JSON.stringify({
//               data: [
//                 {
//                   Latitude__C: lat,
//                   Longitude__C: lng,
//                 },
//               ],
//             }),
//           });

//           const crmResponse = await crmRes.json();
//           updatedAccounts.push({ id: acc.id, latitude: lat, longitude: lng });

//           // Optional: update in your own database
//           // await prisma.account.update({
//           //   where: { id: acc.id },
//           //   data: { latitude: lat, longitude: lng },
//           // });
//         } else {
//           failedAccounts.push({
//             id: acc.id,
//             address: fullAddress,
//             reason: geoData.status ?? "Location not found",
//           });
//         }
//       } catch (geoError: unknown) {
//         failedAccounts.push({
//           id: acc.id,
//           address: fullAddress,
//           reason:
//             geoError instanceof Error
//               ? geoError.message
//               : "Unknown geocoding error",
//         });
//         continue; // continue with next account
//       }
//     }

//     return NextResponse.json({
//       message: "Geocoding completed",
//       updatedCount: updatedAccounts.length,
//       updatedAccounts,
//       failedCount: failedAccounts.length,
//       failedAccounts,
//     });
//   } catch (error) {
//     console.error("Batch geocoding failed:", error);
//     return NextResponse.json(
//       { error: "Internal server error" },
//       { status: 500 }
//     );
//   }
// }

export async function POST() {
  try {
    // only grab those you haven’t successfully geocoded yet
    const accounts = await prisma.account.findMany({
      where: { latitude: null },
      orderBy: { code: "desc" },
    });

    const accessToken = await getAccessTokenFromServer();

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
        const { lat, lng } = await geocodeAddress(fullAddress);
        console.log("updating crm with:", lat, lng);
        // push to Zoho CRM
        await axios.put(
          `${BASE_URL}/crm/v6/Accounts/${acc.id}`,
          {
            data: [
              { Latitude__C: lat.toFixed(9), Longitude__C: lng.toFixed(9) },
            ],
          },
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        console.log("CRM updated with:", lat, lng);
        // record success
        await prisma.account.update({
          where: { id: acc.id },
          data: {
            latitude: lat,
            longitude: lng,
            geocodeAttempts: { increment: 1 },
            lastGeocodeError: null,
            lastGeocodeAt: new Date(),
          },
        });
      } catch (e) {
        // record failure, increment attempt
        console.error(e);
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
