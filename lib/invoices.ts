import * as XLSX from 'xlsx';
import type { InvoiceRow } from '@/types/tedis/invoices';

export function parseInvoiceExcel(file: File): Promise<{
  data: InvoiceRow[];
  headers: string[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0] as string;
        const ws = wb.Sheets[wsname] as XLSX.WorkSheet;
        const json = XLSX.utils.sheet_to_json<InvoiceRow>(ws, { defval: '' });

        const keys = json.length > 0 ? Object.keys(json[0] as InvoiceRow) : [];
        resolve({ data: json, headers: keys });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsBinaryString(file);
  });
}

export function groupConsecutively<T extends { subject: string }>(
  items: T[],
): T[][] {
  const groups: T[][] = [];
  let currentGroup: T[] = [];

  for (let i = 0; i < items.length; i++) {
    const current = items[i];
    const prev = items[i - 1];
    if (!prev || current.subject === prev.subject) {
      currentGroup.push(current);
    } else {
      groups.push(currentGroup);
      currentGroup = [current];
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);
  return groups;
}
