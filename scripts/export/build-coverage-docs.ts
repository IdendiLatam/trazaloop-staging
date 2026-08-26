/**
 * EXPORT-01.1 · Genera los documentos de cobertura A PARTIR DEL INVENTARIO.
 *
 * Los markdown son lo que la gente lee; el inventario tipado es lo que las
 * pruebas comprueban. Generarlos en vez de escribirlos a mano es lo que impide
 * que digan cosas distintas: un documento desactualizado no falla, se consulta.
 *
 *   npx tsx scripts/export/build-coverage-docs.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { EXPORT_INVENTORY, inventoryCounts, promisedKeys, type AxisState } from "../../lib/export/inventory";

const MODULE_TITLE: Record<string, string> = {
  quality: "Quality",
  trazadocs: "TrazaDocs",
  cpr: "PCR",
  textiles: "Textiles",
  core: "Transversal (cuenta y soporte)",
};

const STATE_LABEL: Record<AxisState["state"], string> = {
  AVAILABLE: "AVAILABLE",
  EMBEDDED: "EMBEDDED",
  NOT_APPLICABLE: "NOT_APPLICABLE",
  HISTORICAL_NOT_SUPPORTED: "HISTORICAL_NOT_SUPPORTED",
};

function cell(axis: AxisState): string {
  switch (axis.state) {
    case "AVAILABLE": return `**AVAILABLE** · \`${axis.key}\``;
    case "EMBEDDED": return `EMBEDDED · dentro de *${axis.parent}*`;
    case "NOT_APPLICABLE": return "N/A";
    case "HISTORICAL_NOT_SUPPORTED": return "**HISTORICAL_NOT_SUPPORTED**";
  }
}

const counts = inventoryCounts();
const keys = promisedKeys();

const lines: string[] = [];
lines.push("# EXPORT-01.1 · Matriz de cobertura");
lines.push("");
lines.push("> **Generado** desde `lib/export/inventory.ts` con");
lines.push("> `npx tsx scripts/export/build-coverage-docs.ts`. No se edita a mano:");
lines.push("> un documento de cobertura desactualizado es peor que no tenerlo, porque");
lines.push("> se consulta creyendo que dice la verdad.");
lines.push("");
lines.push("**Estados finales.** `AVAILABLE` se descarga · `EMBEDDED` se imprime dentro");
lines.push("del PDF de su padre · `NOT_APPLICABLE` no es documentable, con motivo ·");
lines.push("`HISTORICAL_NOT_SUPPORTED` el dominio no conserva versión temporal suficiente");
lines.push("para reconstruir el pasado con verdad — y **nunca** significa que falte el PDF");
lines.push("actual.");
lines.push("");
lines.push("No existe `PENDING`.");
lines.push("");
lines.push("## Recuento");
lines.push("");
lines.push("| | |");
lines.push("|---|---|");
lines.push(`| Entidades clasificadas | **${EXPORT_INVENTORY.length}** |`);
lines.push(`| Ejes clasificados (ficha · listado · histórico) | **${EXPORT_INVENTORY.length * 3}** |`);
lines.push(`| \`AVAILABLE\` | **${counts.AVAILABLE}** |`);
lines.push(`| \`EMBEDDED\` | **${counts.EMBEDDED}** |`);
lines.push(`| \`NOT_APPLICABLE\` | **${counts.NOT_APPLICABLE}** |`);
lines.push(`| \`HISTORICAL_NOT_SUPPORTED\` | **${counts.HISTORICAL_NOT_SUPPORTED}** |`);
lines.push(`| **\`PENDING\`** | **0** |`);
lines.push(`| Claves distintas en el registro | **${keys.length}** |`);
lines.push("");

for (const mod of ["quality", "trazadocs", "cpr", "textiles", "core"]) {
  const rows = EXPORT_INVENTORY.filter((r) => r.module === mod);
  if (rows.length === 0) continue;
  lines.push(`## ${MODULE_TITLE[mod]}`);
  lines.push("");
  lines.push("| Entidad | Ruta | Clase | Ficha | Listado | Histórico |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of rows) {
    lines.push(
      `| ${r.entity} | ${r.route ? `\`${r.route}\`` : "—"} | ${r.klass} | ` +
      `${cell(r.detail)} | ${cell(r.list)} | ${cell(r.historical)} |`
    );
  }
  lines.push("");
}

lines.push("## Motivos declarados");
lines.push("");
lines.push("Cada `NOT_APPLICABLE`, cada `EMBEDDED` y cada `HISTORICAL_NOT_SUPPORTED`");
lines.push("lleva su motivo. Las pruebas exigen que el motivo exista, que tenga");
lines.push("sustancia y que no sea «no alcanzó el tiempo».");
lines.push("");
lines.push("| Entidad | Eje | Estado | Motivo |");
lines.push("|---|---|---|---|");
for (const r of EXPORT_INVENTORY) {
  for (const [axisName, axis] of [["Ficha", r.detail], ["Listado", r.list], ["Histórico", r.historical]] as [string, AxisState][]) {
    if (axis.state === "AVAILABLE") continue;
    const motivo = axis.state === "EMBEDDED"
      ? `Dentro de *${axis.parent}*. ${axis.reason}`
      : axis.reason;
    lines.push(`| ${r.entity} | ${axisName} | ${STATE_LABEL[axis.state]} | ${motivo} |`);
  }
}
lines.push("");

writeFileSync("docs/export/export-01-1/EXPORT_01_1_COVERAGE_MATRIX.md", lines.join("\n"));

// ---------------------------------------------------------------------------
// Los dos documentos de EXPORT-01 quedan APUNTANDO aquí, con la lista completa
// de claves para que la prueba de deriva siga teniendo algo que comprobar.
// ---------------------------------------------------------------------------
const legacy: string[] = [];
legacy.push("# EXPORT-01 · Matriz de cobertura");
legacy.push("");
legacy.push("> **Superada por EXPORT-01.1.** La matriz vigente se genera desde");
legacy.push("> `lib/export/inventory.ts` y vive en");
legacy.push("> [`docs/export/export-01-1/EXPORT_01_1_COVERAGE_MATRIX.md`](../export-01-1/EXPORT_01_1_COVERAGE_MATRIX.md).");
legacy.push("> Este documento se conserva porque el informe de EXPORT-01 lo cita, y se");
legacy.push("> mantiene sincronizado automáticamente para que no pueda mentir.");
legacy.push("");
legacy.push("EXPORT-01 entregó 32 exportaciones y dejó 31 filas clasificadas como");
legacy.push("pendientes. EXPORT-01.1 cerró esas 31 y llevó el registro a");
legacy.push(`**${keys.length} exportaciones**, con **0 pendientes**.`);
legacy.push("");
legacy.push("## Todas las claves del registro");
legacy.push("");
for (const mod of ["quality", "trazadocs", "cpr", "textiles", "core"]) {
  const mine = keys.filter((k) => {
    const prefix = k.split(".")[0];
    if (mod === "quality") return prefix === "quality";
    if (mod === "trazadocs") return prefix === "trazadocs";
    if (mod === "cpr") return prefix === "cpr";
    if (mod === "textiles") return prefix === "textiles";
    return prefix === "core";
  });
  if (mine.length === 0) continue;
  legacy.push(`### ${MODULE_TITLE[mod]} (${mine.length})`);
  legacy.push("");
  for (const k of mine) legacy.push(`- \`${k}\``);
  legacy.push("");
}
writeFileSync("docs/export/export-01/EXPORT_01_PDF_COVERAGE_MATRIX.md", legacy.join("\n"));

// El recuento del inventario de EXPORT-01 se sincroniza en su sitio.
const invPath = "docs/export/export-01/EXPORT_01_INVENTORY.md";
let inv = readFileSync(invPath, "utf8");
inv = inv.replace(
  /\| Exportadores en el registro \| \*\*\d+\*\* \|/,
  `| Exportadores en el registro | **${keys.length}** |`
);
inv = inv.replace(
  /\| Clasificadas y pendientes de adaptador \| \*\*\d+\*\* \|/,
  "| Clasificadas y pendientes de adaptador | **0** · cerradas en EXPORT-01.1 |"
);
writeFileSync(invPath, inv);

console.log(`Escrito: ${EXPORT_INVENTORY.length} entidades, ${keys.length} claves.`);
