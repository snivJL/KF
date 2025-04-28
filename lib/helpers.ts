import * as XLSX from "xlsx";

type RawRow = Array<string | number | null | undefined>;

export async function parseIdsFromFile(file: File): Promise<string[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0] as string;
  const sheet = workbook.Sheets[sheetName];
  // Parse sheet into typed rows
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet!, { header: 1 });
  return rows
    .slice(1) // skip header row
    .map((row) => {
      const cell = row[0];
      // Convert number to string, handle null/undefined
      const str = typeof cell === "number" ? String(cell) : cell ?? "";
      return str.trim();
    })
    .filter((id) => id.length > 0);
}
