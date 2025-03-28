"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";

type Product = {
  id: string;
  productCode: string;
  name: string;
  updatedAt: string;
};

export function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof Product>("updatedAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchProducts = async () => {
    const res = await fetch("/api/tedis/products");
    const data = await res.json();
    setProducts(data);
  };

  const handleSync = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tedis/sync/products", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      toast.success(`✅ Synced ${data.synced} products.`);
      fetchProducts();
    } catch (err: any) {
      toast.error(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const filtered = products
    .filter(
      (p) =>
        p.productCode.toLowerCase().includes(search.toLowerCase()) ||
        (p.name?.toLowerCase().includes(search.toLowerCase()) ?? false)
    )
    .sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

  const handleSort = (key: keyof Product) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <>
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium">Products</h2>
              <p className="text-sm text-muted-foreground">
                Sync product data from VCRM into the local database.
              </p>
            </div>
            <Button onClick={handleSync} disabled={loading}>
              {loading ? (
                <Loader2 className="animate-spin h-4 w-4 mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Products
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">🗂️ Synced Products</h2>
            <Input
              type="text"
              placeholder="Filter by code or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort("productCode")}
                  >
                    Product Code{" "}
                    {sortKey === "productCode" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort("name")}
                  >
                    Name {sortKey === "name" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort("updatedAt")}
                  >
                    Last Synced{" "}
                    {sortKey === "updatedAt" && (sortAsc ? "▲" : "▼")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>{product.productCode}</TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell>
                      {new Date(product.updatedAt).toLocaleString()}
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
