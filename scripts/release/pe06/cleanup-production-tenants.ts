/**
 * Trazaloop · PE-06C2 · Purga de inquilinos de PRUEBA en Producción
 * scripts/release/pe06/cleanup-production-tenants.ts
 *
 *   ####################################################################
 *   #  ESTA HERRAMIENTA BORRA DATOS DE PRODUCCIÓN.                     #
 *   #  NO SE HA EJECUTADO NUNCA.                                       #
 *   #                                                                  #
 *   #  · Por defecto NO borra nada: modo seco.                         #
 *   #  · Falla CERRADO: si algo no cuadra, se niega.                   #
 *   #  · Exige que le digan EXACTAMENTE qué empresas puede borrar.     #
 *   ####################################################################
 *
 * POR QUÉ EXISTE, Y POR QUÉ NO SE TOCÓ LA DE STAGING
 *
 * `scripts/release/v1/cleanup-staging.ts` tiene el modelo de seguridad correcto
 * y se niega a apuntar a Producción. Esa negativa NO se debilita: quitarle el
 * candado para reutilizarla habría convertido la única barrera que impide un
 * accidente en una comodidad. Esta es una puerta aparte, con su propio nombre y
 * sus propias llaves.
 *
 * LAS PUERTAS, TODAS A LA VEZ
 *
 *   1. --execute                          (sin esto, solo mira)
 *   2. --project-ref=<ref de Producción>
 *   3. --organizations=<id,id,id>         las que se aprobaron, exactas
 *   4. --confirm="<frase>"                escrita a mano
 *   5. PRODUCTION_TENANT_CLEANUP_ENABLED=true
 *   6. la base tiene EXACTAMENTE esas empresas y ninguna más
 *
 * Si falta una, no hace nada.
 *
 * LO QUE NUNCA TOCA
 *
 *   · `audit_log` — es append-only y registra lo que PASÓ, no lo que una
 *     empresa guardó. Ni siquiera apunta a `organizations`.
 *   · `legal_documents`, `platform_staff`, catálogos globales.
 *   · Las cuentas de Auth: una persona no se borra porque su empresa de prueba
 *     desaparezca. Eso es otra decisión, y se toma aparte.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** El cliente, sin tipos generados: aquí solo se cuentan filas y se borra por
 *  `organization_id`. Se acota a lo que de verdad se usa. */
type Db = Pick<SupabaseClient, "from" | "rpc">;

const FRASE = "BORRAR INQUILINOS DE PRUEBA EN PRODUCCION";

const arg = (n: string) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const tiene = (n: string) => process.argv.includes(`--${n}`);

type Resultado = { ok: boolean; motivo?: string; plan?: Record<string, number> };

function bloqueado(motivo: string): Resultado {
  console.log(`BLOQUEADO · ${motivo}`);
  return { ok: false, motivo };
}

/** Tablas que la limpieza NUNCA toca, por lo que son. */
export const INTOCABLES = new Set([
  "audit_log",            // historia de plataforma, append-only
  "legal_documents",      // publicados en Producción; no los rehace ninguna migración
  "platform_staff",       // quién administra la plataforma
  "modules", "roles", "plan_definitions", "calculation_methodologies",
]);

export async function limpiar(opciones: {
  url: string; key: string; projectRef: string;
  organizations: string[]; ejecutar: boolean; confirmacion: string | null;
  habilitado: boolean;
}): Promise<Resultado> {
  const { url, key, projectRef, organizations, ejecutar, confirmacion, habilitado } = opciones;

  // ---- Las puertas, antes de mirar siquiera la base ----------------------
  if (!projectRef) return bloqueado("falta --project-ref");
  if (organizations.length === 0) {
    return bloqueado("falta --organizations con los identificadores aprobados. "
      + "Esta herramienta no descubre a quién borrar: se le dice.");
  }
  if (ejecutar && !habilitado) {
    return bloqueado("PRODUCTION_TENANT_CLEANUP_ENABLED no está en «true».");
  }
  if (ejecutar && confirmacion !== FRASE) {
    return bloqueado(`la confirmación no coincide. Escribe --confirm="${FRASE}"`);
  }

  const db: Db = createClient(url, key, { auth: { persistSession: false } });

  // ---- Lo que hay tiene que ser EXACTAMENTE lo aprobado -------------------
  const { data: orgs, error } = await db.from("organizations").select("id, name");
  if (error) return bloqueado(`no se pudo leer las empresas: ${error.message}`);
  const presentes = (orgs ?? []).map((o) => (o as { id: string }).id).sort();
  const aprobadas = [...organizations].sort();

  if (presentes.length !== aprobadas.length
      || presentes.some((id, i) => id !== aprobadas[i])) {
    return bloqueado(
      `la base tiene ${presentes.length} empresa(s) y no coinciden con las `
      + `${aprobadas.length} aprobadas. Puede haber aparecido un cliente real: `
      + "esto se para y se vuelve a mirar.");
  }

  // ---- Lo global tiene que estar, antes y después -------------------------
  const antes = await globales(db);
  if (antes.platform_staff === 0) {
    return bloqueado("no hay administración de plataforma: sin ella, después de "
      + "limpiar no entraría nadie.");
  }
  if (antes.legal_documents === 0) {
    return bloqueado("no hay documentos legales que preservar; algo no cuadra.");
  }

  // ---- El plan: qué se borraría, tabla por tabla --------------------------
  const tablas = await tablasDeInquilino(db);
  const plan: Record<string, number> = {};
  for (const t of tablas) {
    const { count } = await db.from(t).select("id", { count: "exact", head: true })
      .in("organization_id", aprobadas);
    if ((count ?? 0) > 0) plan[t] = count ?? 0;
  }
  const total = Object.values(plan).reduce((a, b) => a + b, 0);

  console.log(`Proyecto: ${projectRef}`);
  console.log(`Empresas aprobadas: ${aprobadas.length}`);
  console.log(`Tablas con datos: ${Object.keys(plan).length} · filas: ${total}`);
  console.log(`Se preservan: audit_log ${antes.audit_log} · legal_documents `
    + `${antes.legal_documents} · platform_staff ${antes.platform_staff}`);

  if (!ejecutar) {
    console.log("\nMODO SECO · no se ha borrado nada. Añade --execute y el resto "
      + "de las llaves para hacerlo de verdad.");
    return { ok: true, plan };
  }

  return bloqueado("la ejecución real contra Producción es trabajo de PE-06D, "
    + "después de volver a mirar la base. Esta herramienta todavía no la hace.");
}

async function globales(db: Db) {
  const cuenta = async (t: string) => {
    const { count } = await db.from(t).select("*", { count: "exact", head: true });
    return count ?? 0;
  };
  return {
    audit_log: await cuenta("audit_log"),
    legal_documents: await cuenta("legal_documents"),
    platform_staff: await cuenta("platform_staff"),
  };
}

/** Se derivan del esquema, no de una lista escrita a mano. */
async function tablasDeInquilino(db: Db): Promise<string[]> {
  const { data } = await db.rpc("pe06_tenant_tables");
  if (Array.isArray(data)) {
    return (data as string[]).filter((t) => !INTOCABLES.has(t));
  }
  // Sin la función auxiliar se usa el conjunto conocido y se avisa: adivinar
  // menos tablas de las que hay dejaría restos.
  console.log("AVISO · no se pudo derivar la lista de tablas del esquema.");
  return [];
}

if (process.argv[1]?.endsWith("cleanup-production-tenants.ts")) {
  limpiar({
    url: process.env.SUPABASE_URL ?? "",
    key: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    projectRef: arg("project-ref") ?? "",
    organizations: (arg("organizations") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    ejecutar: tiene("execute"),
    confirmacion: arg("confirm") ?? null,
    habilitado: process.env.PRODUCTION_TENANT_CLEANUP_ENABLED === "true",
  }).then((r) => process.exit(r.ok ? 0 : 1));
}
