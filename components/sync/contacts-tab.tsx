'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { fetchWithAuth } from '@/lib/auth';

export type Contact = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  trigger: boolean;
  updatedAt: string;
};

export default function ContactsTab() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof Contact>('updatedAt');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(false);
  const fetchContacts = async () => {
    const res = await fetchWithAuth('/api/tedis/contacts?take=100');
    const data = await res.json();
    setContacts(data);
  };
  useEffect(() => {
    fetchContacts();
  }, []);

  const handleSync = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/tedis/sync/contacts', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      toast.success(`Synced ${data.synced} contacts.`);
      fetchContacts();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(`${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filtered = contacts
    .filter(
      (a) =>
        a.firstName.toLowerCase().includes(search.toLowerCase()) ||
        a.lastName.toLowerCase().includes(search.toLowerCase()) ||
        a.code.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

  const handleSort = (key: keyof Contact) => {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <>
      {' '}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium">Contacts</h2>
              <p className="text-sm text-muted-foreground">
                Sync contact data from VCRM into the local database.
              </p>
            </div>
            <Button onClick={handleSync} disabled={loading}>
              {loading ? (
                <Loader2 className="animate-spin size-4 mr-2" />
              ) : (
                <RefreshCw className="size-4 mr-2" />
              )}
              Sync Contacts
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b-1 pb-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Synced contact data from VCRM
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
                  <TableHead onClick={() => handleSort('code')}>
                    Code {sortKey === 'code' && (sortAsc ? '▲' : '▼')}
                  </TableHead>
                  <TableHead onClick={() => handleSort('firstName')}>
                    First Name{' '}
                    {sortKey === 'firstName' && (sortAsc ? '▲' : '▼')}
                  </TableHead>
                  <TableHead onClick={() => handleSort('lastName')}>
                    Last Name {sortKey === 'lastName' && (sortAsc ? '▲' : '▼')}
                  </TableHead>
                  <TableHead onClick={() => handleSort('updatedAt')}>
                    Last Synced{' '}
                    {sortKey === 'updatedAt' && (sortAsc ? '▲' : '▼')}
                  </TableHead>
                  <TableHead onClick={() => handleSort('trigger')}>
                    Trigger {sortKey === 'trigger' && (sortAsc ? '▲' : '▼')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((con) => (
                  <TableRow key={con.id}>
                    <TableCell>{con.code}</TableCell>
                    <TableCell>{con.firstName}</TableCell>
                    <TableCell>{con.lastName}</TableCell>
                    <TableCell>{con.trigger}</TableCell>
                    <TableCell>
                      {new Date(con.updatedAt).toLocaleString()}
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
