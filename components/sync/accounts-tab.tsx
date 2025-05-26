"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { fetchWithAuth } from "@/lib/auth";

export type Account = {
  id: string;
  code: string;
  name: string;
  shippingStreet: string;
  shippingCity: string;
  shippingProvince: string;
  shippingCode: string;
  shippingCountry: string;
  latitude: number | null;
  longitude: number | null;
  geocodeAttempts: number;
  lastGeocodeError: string | null;
  updatedAt: string;
};

export default function AccountsTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof Account>("updatedAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(false);
  const fetchAccounts = async () => {
    const res = await fetchWithAuth("/api/tedis/accounts?take=100");
    const data = await res.json();
    setAccounts(data);
  };
  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleSync = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/tedis/sync/accounts", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      toast.success(`Synced ${data.synced} accounts.`);
      fetchAccounts();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(`${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filtered = accounts
    .filter(
      (a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.code.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

  const handleSort = (key: keyof Account) => {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <>
      {" "}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium">Accounts</h2>
              <p className="text-sm text-muted-foreground">
                Sync account data from VCRM into the local database.
              </p>
            </div>
            <Button onClick={handleSync} disabled={loading}>
              {loading ? (
                <Loader2 className="animate-spin h-4 w-4 mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Accounts
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b-1 pb-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Synced account data from VCRM
            </p>
            <Input
              type="text"
              placeholder="Search by code or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => handleSort("code")}>
                    Code {sortKey === "code" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("name")}>
                    Name {sortKey === "name" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("shippingStreet")}>
                    Street{" "}
                    {sortKey === "shippingStreet" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("shippingCity")}>
                    City {sortKey === "shippingCity" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("shippingProvince")}>
                    Province{" "}
                    {sortKey === "shippingProvince" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("shippingCode")}>
                    Postal Code{" "}
                    {sortKey === "shippingCode" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("shippingCountry")}>
                    Country{" "}
                    {sortKey === "shippingCountry" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("latitude")}>
                    Latitude {sortKey === "latitude" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("longitude")}>
                    Longitude {sortKey === "longitude" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead onClick={() => handleSort("updatedAt")}>
                    Last Synced{" "}
                    {sortKey === "updatedAt" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell>{acc.code}</TableCell>
                    <TableCell>{acc.name}</TableCell>
                    <TableCell>{acc.shippingStreet}</TableCell>
                    <TableCell>{acc.shippingCity}</TableCell>
                    <TableCell>{acc.shippingProvince}</TableCell>
                    <TableCell>{acc.shippingCode}</TableCell>
                    <TableCell>{acc.shippingCountry}</TableCell>
                    <TableCell>
                      {acc.latitude !== null ? acc.latitude.toFixed(6) : "N/A"}
                    </TableCell>
                    <TableCell>
                      {acc.longitude !== null
                        ? acc.longitude.toFixed(6)
                        : "N/A"}
                    </TableCell>
                    <TableCell>{acc.geocodeAttempts} </TableCell>
                    <TableCell>
                      {acc.lastGeocodeError && (
                        <span className="text-red-500">
                          ({acc.lastGeocodeError})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(acc.updatedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
