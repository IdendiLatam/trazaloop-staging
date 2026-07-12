/**
 * Parser CSV mínimo (Sprint 2: solo CSV, sin XLSX).
 * Soporta campos entre comillas con comas y comillas escapadas ("").
 * Devuelve filas como arreglos de strings; la primera fila es el encabezado.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const src = text.replace(/^\uFEFF/, ""); // BOM

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // última fila sin salto final
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // descartar filas totalmente vacías
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
        .join(",")
    )
    .join("\n");
}
