/** Prefix spreadsheet formulas; quoting alone does not prevent CSV injection. */
export function csvCell(value: unknown): string {
  const plain = String(value ?? "");
  const safe =
    /^[\s\u0000-\u001f]*[=+@-]/.test(plain) || /^[\t\r\n]/.test(plain) ? `'${plain}` : plain;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function csvDocument(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
