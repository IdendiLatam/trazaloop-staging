/**
 * Trazaloop · PE-06C2/C3 · Purga de inquilinos de PRUEBA en Producción
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
 * SE CONECTA A LA BASE, NO AL API
 *
 * Igual que su hermana de Staging: la lista de tablas se DERIVA del esquema
 * real —toda tabla de `public` con `organization_id`— y eso solo se puede
 * preguntar por Postgres. Una lista escrita a mano envejece mal: la primera
 * tabla nueva que alguien añada quedaría fuera y dejaría restos.
 *
 * LAS PUERTAS, TODAS A LA VEZ
 *
 *   1. --execute                          (sin esto, solo mira)
 *   2. --project-ref=<ref de Producción>
 *   3. --organizations=<id,id,id>         las aprobadas, exactas
 *   4. --confirm="<frase>"                escrita a mano
 *   5. PRODUCTION_TENANT_CLEANUP_ENABLED=true
 *   6. la base tiene EXACTAMENTE esas empresas y ninguna más
 *
 * Si falta una, no hace nada.
 *
 * LO QUE NUNCA TOCA
 *
 *   · `audit_log` — append-only, registra lo que PASÓ y ni siquiera apunta a
 *     `organizations`.
 *   · `legal_documents`, `platform_staff`, catálogos globales.
 *   · Las cuentas de Auth: una persona no se borra porque su empresa de prueba
 *     desaparezca. Eso es otra decisión y se toma aparte.
 */
import { Client as PgClient } from "pg";

const FRASE = "BORRAR INQUILINOS DE PRUEBA EN PRODUCCION";

const arg = (n: string) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const tiene = (n: string) => process.argv.includes(`--${n}`);

/** Tablas que la limpieza NUNCA toca, por lo que son. */
export const INTOCABLES = new Set([
  "audit_log",            // historia de plataforma, append-only
  "legal_documents",      // publicados en Producción; ninguna migración los rehace
  "platform_staff",       // quién administra la plataforma
  "modules", "roles", "plan_definitions", "calculation_methodologies",
]);

/** Candados de inmutabilidad que hay que bajar para purgar un inquilino de
 *  PRUEBA, y volver a subir en la misma transacción. Se nombran de uno en uno:
 *  bajar candados «los que hagan falta» es como no tenerlos. */
export const CANDADOS: Array<{ tabla: string; trigger: string; porque: string }> = [
  { tabla: "recycled_content_calculations", trigger: "t_recycled_calc_immutable",
    porque: "Un cálculo de trazabilidad es evidencia y el producto se niega a "
          + "borrarlo. Para un inquilino de prueba se baja a propósito." },
];

export type Resultado = {
  ok: boolean;
  motivo?: string;
  plan?: Record<string, number>;
  globales?: Record<string, number>;
};

function bloqueado(motivo: string): Resultado {
  console.log(`BLOQUEADO · ${motivo}`);
  return { ok: false, motivo };
}

export async function limpiar(opciones: {
  databaseUrl: string; projectRef: string; organizations: string[];
  ejecutar: boolean; confirmacion: string | null; habilitado: boolean;
}): Promise<Resultado> {
  const { databaseUrl, projectRef, organizations, ejecutar, confirmacion, habilitado } = opciones;

  // ---- Las puertas, antes de abrir siquiera la conexión ------------------
  if (!projectRef) return bloqueado("falta --project-ref");
  if (organizations.length === 0) {
    return bloqueado("falta --organizations con los identificadores aprobados. "
      + "Esta herramienta no descubre a quién borrar: se le dice.");
  }
  if (!databaseUrl) return bloqueado("falta la cadena de conexión (PRODUCTION_DB_URL).");
  if (ejecutar && !habilitado) {
    return bloqueado("PRODUCTION_TENANT_CLEANUP_ENABLED no está en «true».");
  }
  if (ejecutar && confirmacion !== FRASE) {
    return bloqueado(`la confirmación no coincide. Escribe --confirm="${FRASE}"`);
  }

  const pg = new PgClient({ connectionString: databaseUrl });
  await pg.connect();
  try {
    // ---- Lo que hay tiene que ser EXACTAMENTE lo aprobado ----------------
    const { rows: orgs } = await pg.query<{ id: string; name: string }>(
      "select id, name from public.organizations order by id");
    const presentes = orgs.map((o) => o.id).sort();
    const aprobadas = [...organizations].sort();

    if (presentes.length !== aprobadas.length
        || presentes.some((id, i) => id !== aprobadas[i])) {
      return bloqueado(
        `la base tiene ${presentes.length} empresa(s) y no coinciden con las `
        + `${aprobadas.length} aprobadas. Puede haber aparecido un cliente real: `
        + "esto se para y se vuelve a mirar.");
    }

    // ---- Lo global tiene que estar, antes de tocar nada ------------------
    const globales: Record<string, number> = {};
    for (const t of ["audit_log", "legal_documents", "platform_staff"]) {
      const { rows } = await pg.query<{ n: string }>(`select count(*)::text n from public.${t}`);
      globales[t] = Number(rows[0].n);
    }
    if (globales.platform_staff === 0) {
      return bloqueado("no hay administración de plataforma: sin ella, después de "
        + "limpiar no entraría nadie.");
    }
    if (globales.legal_documents === 0) {
      return bloqueado("no hay documentos legales que preservar; algo no cuadra.");
    }

    // ---- Las tablas, DERIVADAS del esquema -------------------------------
    const { rows: tablas } = await pg.query<{ table_name: string }>(
      `select c.relname as table_name
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and exists (select 1 from information_schema.columns col
                       where col.table_schema = 'public'
                         and col.table_name = c.relname
                         and col.column_name = 'organization_id')
        order by c.relname`);
    const objetivo = tablas.map((t) => t.table_name).filter((t) => !INTOCABLES.has(t));

    // ---- El plan: qué se borraría, tabla por tabla -----------------------
    const plan: Record<string, number> = {};
    for (const t of objetivo) {
      const { rows } = await pg.query<{ n: string }>(
        `select count(*)::text n from public.${t} where organization_id = any($1::uuid[])`,
        [aprobadas]);
      const n = Number(rows[0].n);
      if (n > 0) plan[t] = n;
    }
    const total = Object.values(plan).reduce((a, b) => a + b, 0);

    console.log(`Proyecto            : ${projectRef}`);
    console.log(`Empresas aprobadas  : ${aprobadas.length} · y son las que hay`);
    console.log(`Tablas candidatas   : ${objetivo.length} (derivadas del esquema)`);
    console.log(`Tablas con datos    : ${Object.keys(plan).length} · ${total} filas`);
    console.log(`Se preservan        : audit_log ${globales.audit_log} · `
      + `legal_documents ${globales.legal_documents} · platform_staff ${globales.platform_staff}`);
    console.log(`Candados a bajar    : ${CANDADOS.map((c) => c.tabla).join(", ") || "ninguno"}`);
    console.log(`Cuentas de Auth     : NO se tocan`);
    for (const [t, n] of Object.entries(plan).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`   ${t.padEnd(38)} ${n}`);
    }

    if (!ejecutar) {
      console.log("\nMODO SECO · no se ha borrado nada. Para hacerlo de verdad hacen "
        + "falta --execute, PRODUCTION_TENANT_CLEANUP_ENABLED=true y la frase de "
        + "confirmación.");
      return { ok: true, plan, globales };
    }

    return bloqueado("la ejecución real contra Producción es trabajo de PE-06D, "
      + "después de volver a mirar la base. Esta herramienta todavía no la hace.");
  } finally {
    await pg.end();
  }
}

if (process.argv[1]?.endsWith("cleanup-production-tenants.ts")) {
  limpiar({
    databaseUrl: process.env.PRODUCTION_DB_URL ?? "",
    projectRef: arg("project-ref") ?? "",
    organizations: (arg("organizations") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    ejecutar: tiene("execute"),
    confirmacion: arg("confirm") ?? null,
    habilitado: process.env.PRODUCTION_TENANT_CLEANUP_ENABLED === "true",
  }).then((r) => process.exit(r.ok ? 0 : 1))
    .catch((e) => { console.log(`BLOQUEADO · ${e instanceof Error ? e.message : e}`); process.exit(1); });
}
