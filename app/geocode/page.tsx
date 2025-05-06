"use client";

import { useState } from "react";

interface GeoResult {
  id: string;
  latitude: number;
  longitude: number;
}

interface FailedResult {
  id: string;
  address: string;
  reason: string;
}

interface ApiResponse {
  message: string;
  updatedCount: number;
  failedCount: number;
  updatedAccounts?: GeoResult[];
  failedAccounts?: FailedResult[];
}

export default function GeoCodePage() {
  const [loading, setLoading] = useState(false);
  const [updatedCount, setUpdatedCount] = useState<number | null>(null);
  const [failedCount, setFailedCount] = useState<number | null>(null);
  const [updatedAccounts, setUpdatedAccounts] = useState<GeoResult[]>([]);
  const [failedAccounts, setFailedAccounts] = useState<FailedResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleGeocode = async () => {
    setLoading(true);
    setError(null);
    setUpdatedCount(null);
    setFailedCount(null);
    setUpdatedAccounts([]);
    setFailedAccounts([]);

    try {
      const response = await fetch("/api/tedis/geocode-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to geocode accounts");
      }

      setUpdatedCount(data.updatedCount);
      setFailedCount(data.failedCount);
      setUpdatedAccounts(data.updatedAccounts ?? []);
      setFailedAccounts(data.failedAccounts ?? []);
    } catch (err: unknown) {
      console.error("Geocode error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Geocode CRM Accounts</h1>
      <button
        type="button"
        onClick={handleGeocode}
        disabled={loading}
        className="mb-4 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Processing..." : "Start Geocoding"}
      </button>

      {error && <p className="mt-4 text-red-600">❌ Error: {error}</p>}

      {updatedCount !== null && (
        <p className="mt-4 text-green-700">
          ✅ Successfully updated {updatedCount} account
          {updatedCount !== 1 && "s"}.
        </p>
      )}

      {failedCount !== null && failedCount > 0 && (
        <p className="mt-2 text-yellow-700">
          ⚠️ {failedCount} account{failedCount !== 1 && "s"} failed to geocode.
        </p>
      )}

      {updatedAccounts.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-medium text-green-700 mb-2">
            Updated Accounts
          </h2>
          <ul className="space-y-1 text-sm">
            {updatedAccounts.map(({ id, latitude, longitude }) => (
              <li key={id} className="border-b pb-1">
                <strong>ID:</strong> {id} <br />
                <strong>Lat:</strong> {latitude.toFixed(6)},{" "}
                <strong>Lng:</strong> {longitude.toFixed(6)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {failedAccounts.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-medium text-red-700 mb-2">
            Failed Accounts
          </h2>
          <ul className="space-y-2 text-sm">
            {failedAccounts.map(({ id, address, reason }) => (
              <li key={id} className="border-b pb-2">
                <strong>ID:</strong> {id} <br />
                <strong>Address:</strong> {address} <br />
                <strong>Reason:</strong> {reason}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
