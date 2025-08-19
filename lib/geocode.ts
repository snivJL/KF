import axios from "axios";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;

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
  formatted_address: string;
  place_id: string;
};

interface GoogleGeocodeResponse {
  status: string;
  results: GeocodeResult[];
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

export function evaluateGeocodeAccuracy(result: GeocodeResult) {
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

export async function geocodeAddress(
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
