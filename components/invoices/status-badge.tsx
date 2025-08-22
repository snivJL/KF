import { Badge } from "../ui/badge";

export default function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="secondary">Unknown</Badge>;
  const v = status.toLowerCase();
  if (v.includes("paid")) return <Badge className="bg-emerald-600">Paid</Badge>;
  if (v.includes("cancel"))
    return <Badge variant="destructive">Cancelled</Badge>;
  if (v.includes("draft")) return <Badge variant="outline">Draft</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}
