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

type Employee = {
  id: string;
  code: string;
  name: string;
  updatedAt: string;
};

export function EmployeesTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchEmployees = async () => {
    const res = await fetch("/api/tedis/employees");
    const data = await res.json();
    setEmployees(data);
  };

  const handleSync = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tedis/sync/employees", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      toast.success(`✅ Synced ${data.synced} employees.`);
      fetchEmployees();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const filtered = employees.filter(
    (e) =>
      e.code.toLowerCase().includes(search.toLowerCase()) ||
      (e.name?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  return (
    <>
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium">Employees</h2>
              <p className="text-sm text-muted-foreground">
                Sync employee data from VCRM into the local database.
              </p>
            </div>
            <Button onClick={handleSync} disabled={loading}>
              {loading ? (
                <Loader2 className="animate-spin h-4 w-4 mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Employees
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">🗂️ Synced Employees</h2>
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
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Last Synced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>{employee.code}</TableCell>
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>
                      {new Date(employee.updatedAt).toLocaleString()}
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
