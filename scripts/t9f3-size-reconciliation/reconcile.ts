/**
 * Trazaloop · T9F.3 · §23 · RECONCILIACIÓN de tamaños desconocidos.
 *
 * Localiza registros con ruta física y size NULL (evidencias CPR, evidencias
 * Textiles y candidatos del ciclo de eliminación), consulta la metadata REAL
 * de Storage y:
 *   - actualiza size_bytes SOLO cuando el objeto existe y reporta tamaño;
 *   - marca (en el reporte) los objetos INEXISTENTES o sin metadata como
 *     inconsistencias a revisar manualmente — JAMÁS inventa tamaños.
 *
 * MODO POR DEFECTO: DRY-RUN (solo reporta; no escribe nada). Para aplicar:
 *   npx tsx scripts/t9f3-size-reconciliation/reconcile.ts --apply
 *
 * REGLAS:
 *   - Server-only: requiere SUPABASE_SERVICE_ROLE_KEY en el entorno (máquina
 *     autorizada). NUNCA se ejecuta desde el entorno del sprint ni forma
 *     parte de ninguna migración.
 *   - Mientras existan desconocidos, la vista reporta
 *     storage_unknown_size_count > 0 y las cargas nuevas están bloqueadas
 *     (fail-closed): esta herramienta es el camino para desbloquearlas.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

type Target = {
  table: string;
  idColumn: string;
  pathColumn: string;
  sizeColumn: string;
  bucketOf: (row: Record<string, unknown>) => string;
};

const TARGETS: Target[] = [
  { table: "evidences", idColumn: "id", pathColumn: "storage_path", sizeColumn: "size_bytes", bucketOf: () => "evidences" },
  { table: "textile_evidences", idColumn: "id", pathColumn: "file_path", sizeColumn: "file_size_bytes", bucketOf: () => "evidences" },
  {
    table: "storage_orphan_candidates",
    idColumn: "id",
    pathColumn: "object_path",
    sizeColumn: "size_bytes",
    bucketOf: (row) => String(row.bucket_id ?? "evidences"),
  },
];

async function objectSize(bucket: string, path: string): Promise<number | null> {
  const { data, error } = await admin.storage.from(bucket).info(path);
  if (error || !data || typeof data.size !== "number" || data.size < 0) return null;
  return data.size;
}

async function main() {
  console.log(`Reconciliación de tamaños · modo: ${APPLY ? "APLICAR" : "DRY-RUN (sin escrituras)"}\n`);
  let unknown = 0;
  let reconciled = 0;
  let missing = 0;

  for (const t of TARGETS) {
    let query = admin
      .from(t.table)
      .select(`${t.idColumn}, organization_id, ${t.pathColumn}${t.table === "storage_orphan_candidates" ? ", bucket_id, status" : ""}`)
      .is(t.sizeColumn, null)
      .not(t.pathColumn, "is", null)
      .neq(t.pathColumn, "");
    if (t.table === "storage_orphan_candidates") {
      query = query.neq("status", "deleted");
    }
    const { data, error } = await query;
    if (error) {
      console.error(`  ✘ ${t.table}: consulta fallida (${error.message})`);
      process.exitCode = 1;
      continue;
    }
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    console.log(`${t.table}: ${rows.length} registro(s) con tamaño desconocido`);
    unknown += rows.length;

    for (const row of rows) {
      const path = String(row[t.pathColumn]);
      const bucket = t.bucketOf(row);
      const size = await objectSize(bucket, path);
      if (size === null) {
        missing += 1;
        console.log(`  ✘ SIN METADATA/INEXISTENTE (revisar manualmente): ${bucket}/${path.slice(0, 60)}…`);
        continue;
      }
      if (!APPLY) {
        reconciled += 1;
        console.log(`  · [dry-run] ${bucket}/${path.slice(0, 60)}… → ${size} bytes`);
        continue;
      }
      const { error: updateError } = await admin
        .from(t.table)
        .update({ [t.sizeColumn]: size })
        .eq(t.idColumn, row[t.idColumn] as string);
      if (updateError) {
        console.error(`  ✘ actualización fallida en ${t.table}: ${updateError.message}`);
        process.exitCode = 1;
      } else {
        reconciled += 1;
        console.log(`  ✔ ${bucket}/${path.slice(0, 60)}… → ${size} bytes`);
      }
    }
  }

  console.log(
    `\nResumen: ${unknown} desconocidos · ${reconciled} ${APPLY ? "reconciliados" : "reconciliables"} · ${missing} inexistentes/sin metadata (no se inventan tamaños).`
  );
  if (missing > 0) {
    console.log(
      "Los objetos sin metadata requieren decisión manual (¿el objeto existe? ¿la referencia es válida?). Mientras queden desconocidos, las cargas nuevas del módulo permanecen bloqueadas por diseño."
    );
  }
}

main().catch((err) => {
  console.error("Reconciliación abortada:", (err as Error).message);
  process.exit(1);
});
