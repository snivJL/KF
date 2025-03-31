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

export type Account = {
  id: string;
  code: string;
  name: string;
  shippingStreet: string;
  shippingCity: string;
  shippingProvince: string;
  shippingCode: string;
  shippingCountry: string;
  updatedAt: string;
};

export default function AccountsTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof Account>("updatedAt");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const fetchAccounts = async () => {
      const res = await fetch("/api/tedis/accounts");
      const data = await res.json();
      setAccounts(data);
    };
    fetchAccounts();
  }, []);

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
                  Street {sortKey === "shippingStreet" && (sortAsc ? "▲" : "▼")}
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
                <TableHead onClick={() => handleSort("updatedAt")}>
                  Last Synced {sortKey === "updatedAt" && (sortAsc ? "▲" : "▼")}
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
                    {new Date(acc.updatedAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
