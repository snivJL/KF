'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/auth';
import { useDebounce } from '@/hooks/useDebounce';
import { TableSkeleton } from '../ui/table-skeleton';
import { Loader2, RefreshCw } from 'lucide-react';

type Product = {
  id: string;
  productCode: string;
  name: string;
  updatedAt: string;
};

const PAGE_SIZE = 20;

export function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof Product>('updatedAt');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingTable, setLoadingTable] = useState(false);
  const debouncedSearch = useDebounce(search);

  const fetchProducts = async (options: {
    page?: number;
    search?: string;
    sortKey?: keyof Product;
    sortAsc?: boolean;
  }) => {
    setLoadingTable(true);

    const {
      page = 0,
      search = '',
      sortKey = 'updatedAt',
      sortAsc = false,
    } = options;

    const offset = page * PAGE_SIZE;
    const res = await fetchWithAuth(
      `/api/tedis/products?limit=${PAGE_SIZE}&offset=${offset}&search=${encodeURIComponent(
        search,
      )}&sortKey=${sortKey}&sortOrder=${sortAsc ? 'asc' : 'desc'}`,
    );
    const data = await res.json();
    setProducts(data.products);
    setTotalProducts(data.total);
    setLoadingTable(false);
  };

  const handleSync = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/tedis/sync/products', {
        method: 'POST',
      });
      const { jobId } = await res.json();
      if (!jobId) throw new Error('Failed to start sync job');

      const interval = setInterval(async () => {
        const statusRes = await fetchWithAuth(
          `/api/tedis/sync/products/status?jobId=${jobId}`,
        );
        const status = await statusRes.json();
        if (status.status === 'success') {
          clearInterval(interval);
          toast.success(`Synced ${status.synced} products.`);
          fetchProducts({ page });
          setLoading(false);
        } else if (status.status === 'error') {
          clearInterval(interval);
          toast.error(`Sync failed: ${status.error}`);
          setLoading(false);
        }
      }, 1500);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts({
      page,
      search: debouncedSearch,
      sortKey,
      sortAsc,
    });
  }, [page, debouncedSearch, sortKey, sortAsc]);

  const handleSort = (key: keyof Product) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <Card className="relative pt-2">
      <CardContent className="py-0 ">
        {/* Sticky Toolbar inside the Card */}
        <div className="sticky top-24 z-20 bg-background border-b p-6 flex flex-wrap items-center justify-between gap-4">
          {/* Left: Title + Description */}
          <div>
            <h2 className="text-lg font-semibold">📦 Products</h2>
            <p className="text-sm text-muted-foreground">
              Manage and sync product data from VCRM into the local database.
            </p>
          </div>

          {/* Right: Controls */}
          <div className="flex flex-wrap items-center gap-4 w-full">
            <Input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="w-64"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Showing {products.length} / {totalProducts} results
            </span>
            <Button onClick={handleSync} disabled={loading} className="ml-auto">
              {loading ? (
                <Loader2 className="animate-spin size-4 mr-2" />
              ) : (
                <RefreshCw className="size-4 mr-2" />
              )}
              Sync Products
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[300px] relative">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer"
                  onClick={() => handleSort('productCode')}
                >
                  Product Code
                  {sortKey === 'productCode' && (sortAsc ? '▲' : '▼')}
                </TableHead>
                <TableHead
                  className="cursor-pointer"
                  onClick={() => handleSort('name')}
                >
                  Name {sortKey === 'name' && (sortAsc ? '▲' : '▼')}
                </TableHead>
                <TableHead
                  className="cursor-pointer"
                  onClick={() => handleSort('updatedAt')}
                >
                  Last Synced {sortKey === 'updatedAt' && (sortAsc ? '▲' : '▼')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingTable ? (
                <TableSkeleton columns={3} rows={10} />
              ) : (
                products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>{product.productCode}</TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell>
                      {new Date(product.updatedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        <div className="flex justify-end gap-4 mt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => {
              setPage((p) => p - 1);
              fetchProducts({ page: page - 1, search });
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={(page + 1) * PAGE_SIZE >= totalProducts}
            onClick={() => {
              setPage((p) => p + 1);
              fetchProducts({ page: page + 1, search });
            }}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
