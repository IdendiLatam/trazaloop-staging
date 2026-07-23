/**
 * Trazaloop · Sprint T9E.1/T9E.2 · Limpieza administrativa RECUPERABLE de
 * intentos de carga de evidencias textiles (tabla 0094 + hardening 0097) y
 * de sus objetos provisionales.
 *
 * Uso (local/operaciones, JAMÁS desde la app):
 *   npx tsx scripts/cleanup-textile-upload-intents.ts            # dry-run
 *   npx tsx scripts/cleanup-textile-upload-intents.ts --apply    # ejecuta
 *
 * Máquina recuperable (decisión T9E.2, documentada en el informe):
 *   · candidatos = pending VENCIDOS y failed (INCLUYE los que ya tuvieron
 *     retiros fallidos: conservan su estado y cleanup_attempts crece);
 *   · un intento SOLO pasa a 'expired' cuando Storage CONFIRMA el retiro
 *     del objeto — si el retiro falla, se registra el fallo (contador +
 *     fecha) y el intento SIGUE siendo candidato en la próxima ejecución;
 *   · BARRERA: antes de retirar se comprueba que la ruta NO pertenezca a
 *     una evidencia real (misma bucket/file_path) — si pertenece, se
 *     reporta la inconsistencia y NO se toca;
 *   · consumidos: JAMÁS se tocan (ni fila ni objeto) — además el guard de
 *     0097 lo impide incluso a service_role;
 *   · idempotente: ejecutarlo varias veces es seguro.
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local — por eso vive en
 * scripts/ (server-side) y nunca en la app. No imprime rutas completas,
 * URLs firmadas ni credenciales; solo conteos.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");
const BUCKET = "evidences";

if (!URL || !SERVICE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

async function main() {
  const admin = createClient(URL!, SERVICE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: expiredPending, error: e1 } = await admin
    .from("textile_evidence_upload_intents")
    .select("id, organization_id, object_path, status, cleanup_attempts")
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .limit(200);
  if (e1) throw new Error(`No fue posible listar pendientes vencidos: ${e1.code}`);

  const { data: failed, error: e2 } = await admin
    .from("textile_evidence_upload_intents")
    .select("id, organization_id, object_path, status, cleanup_attempts")
    .eq("status", "failed")
    .limit(200);
  if (e2) throw new Error(`No fue posible listar fallidos: ${e2.code}`);

  const candidates = [...(expiredPending ?? []), ...(failed ?? [])];
  const retries = candidates.filter((c) => Number(c.cleanup_attempts ?? 0) > 0).length;
  console.log(`Pendientes vencidos: ${expiredPending?.length ?? 0}`);
  console.log(`Fallidos con posible objeto: ${failed?.length ?? 0}`);
  console.log(`De ellos, reintentos de limpiezas fallidas previas: ${retries}`);
  if (!APPLY) {
    console.log("Dry-run: nada se modificó. Ejecuta con --apply para limpiar.");
    return;
  }

  let objectsRemoved = 0;
  let intentsClosed = 0;
  let removalFailures = 0;
  let linkedEvidenceSkips = 0;
  for (const intent of candidates) {
    // Defensa adicional (el guard de 0097 también lo impide en BD).
    if (intent.status === "consumed") continue;

    // BARRERA: jamás retirar el archivo de una evidencia registrada.
    const { data: linked } = await admin
      .from("textile_evidences")
      .select("id")
      .eq("file_path", intent.object_path)
      .limit(1);
    if (linked && linked.length > 0) {
      linkedEvidenceSkips++;
      continue;
    }

    const { error: rmErr } = await admin.storage.from(BUCKET).remove([intent.object_path]);
    if (rmErr) {
      // Retiro NO confirmado → el intento CONSERVA su estado y queda como
      // candidato para la próxima ejecución (solo crece el contador).
      removalFailures++;
      await admin
        .from("textile_evidence_upload_intents")
        .update({
          cleanup_attempts: Number(intent.cleanup_attempts ?? 0) + 1,
          last_cleanup_attempt_at: new Date().toISOString(),
        })
        .eq("id", intent.id)
        .eq("status", intent.status);
      continue;
    }
    objectsRemoved++;

    // Retiro CONFIRMADO → cerrar el ciclo (pending vencido y failed → expired).
    const { error: updErr } = await admin
      .from("textile_evidence_upload_intents")
      .update({
        status: "expired",
        last_cleanup_attempt_at: new Date().toISOString(),
      })
      .eq("id", intent.id)
      .eq("status", intent.status);
    if (!updErr) intentsClosed++;
  }
  console.log(`Objetos provisionales retirados: ${objectsRemoved}`);
  console.log(`Intentos cerrados (expired): ${intentsClosed}`);
  console.log(`Retiros fallidos (quedan recuperables): ${removalFailures}`);
  console.log(`Omitidos por evidencia vinculada (inconsistencia reportada): ${linkedEvidenceSkips}`);

  // T9E.3 · SUBIDA TARDÍA: el token firmado de subida (~2 h) sobrevive al
  // TTL del intento y puede reutilizarse tras un remove — se re-barren los
  // intentos YA expirados recientes (ventana de gracia) por si un objeto
  // reapareció en su ruta. Jamás rutas con evidencia ni intentos con
  // evidence_id; el intento sigue expirado y jamás vuelve a finalizarse.
  const graceSince = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data: recentExpired } = await admin
    .from("textile_evidence_upload_intents")
    .select("id, object_path, evidence_id")
    .eq("status", "expired")
    .gte("last_cleanup_attempt_at", graceSince)
    .limit(200);
  let lateRemovals = 0;
  for (const intent of recentExpired ?? []) {
    if (intent.evidence_id) continue;
    const { data: linked } = await admin
      .from("textile_evidences")
      .select("id")
      .eq("file_path", intent.object_path)
      .limit(1);
    if (linked && linked.length > 0) continue;
    const { data: info } = await admin.storage.from(BUCKET).info(intent.object_path);
    if (info) {
      const { error: rmErr } = await admin.storage.from(BUCKET).remove([intent.object_path]);
      if (!rmErr) lateRemovals++;
    }
  }
  console.log(`Objetos de subidas TARDÍAS retirados (rutas expiradas): ${lateRemovals}`);
}

main().catch((err) => {
  console.error("Fallo:", (err as Error).message);
  process.exit(1);
});
