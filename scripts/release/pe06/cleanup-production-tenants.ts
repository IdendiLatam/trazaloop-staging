/**
 * Trazaloop · PE-06C2/C3/D1 · Purga de inquilinos de PRUEBA en Producción
 * scripts/release/pe06/cleanup-production-tenants.ts
 *
 *   ####################################################################
 *   #  ESTA HERRAMIENTA BORRA DATOS DE PRODUCCIÓN.                     #
 *   #  NO SE HA EJECUTADO NUNCA CONTRA PRODUCCIÓN.                     #
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
 * EL CAMINO REAL, ESCRITO Y ENSAYADO EN PE-06D1
 *
 * Ya no se detiene en el modo seco: borra de verdad, en UNA transacción que se
 * comprueba a sí misma antes de confirmar —si al final lo global no está donde
 * estaba, deshace—. Se ensayó dos veces sobre bases desechables con la forma de
 * Producción: una completa (26 filas, 7 tablas, 2 ficheros, candado devuelto a
 * su sitio) y otra provocando un fallo a mitad, para verla deshacerse entera.
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
 * Y EL ALMACENAMIENTO
 *
 * Los ficheros de un inquilino no viven en la base: viven en Storage. Borrar
 * solo las filas dejaría los ficheros huérfanos y pagándose. Se borran por el
 * API de Storage —que es quien sabe hacerlo— y SOLO los que cuelgan de un
 * prefijo que es una de las empresas aprobadas. Si faltan las credenciales para
 * ello, la herramienta se niega ANTES de borrar nada de la base: media limpieza
 * es peor que ninguna.
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
  { tabla: "audit_dossiers", trigger: "t_audit_dossiers_protect_delete",
    porque: "Un expediente de auditoría no se borra NUNCA por el producto: el "
          + "guardián no mira el estado, se niega y ya está." },
  { tabla: "traceability_exercises", trigger: "t_traceability_exercises_protect_delete",
    porque: "Un ejercicio terminado o archivado es historial de preparación. El "
          + "de Producción está «completed», así que este guardián se dispararía." },
  { tabla: "diagnostics", trigger: "t_diagnostics_lock_completed",
    porque: "Un diagnóstico completado no se modifica ni se elimina. El de "
          + "Producción está «completed»." },
  { tabla: "evidences", trigger: "t_evidences_guard_integrity",
    porque: "Una evidencia validada no se elimina. Ocho de las diez de "
          + "Producción están en «valid»." },
];

/**
 * Los que NO se bajan, y por qué —que es la mitad importante de la lista—:
 *
 *   · `t_production_orders_protect_history` y los guardianes estructurales de
 *     lotes y consumos: solo se niegan cuando la orden está cerrada o
 *     cancelada, y en Producción las ocho están en borrador o en curso.
 *   · `t_textile_diagnostics_lock_completed`: el único diagnóstico textil está
 *     «in_progress».
 *   · `trg_protect_global_textile_fiber_types`: defiende las fibras del
 *     catálogo base, que tienen `organization_id` nulo y por tanto el filtro de
 *     borrado no las alcanza jamás.
 *   · `audit_row_change`: no impide nada; escribe en `audit_log`. Que la
 *     limpieza quede registrada es exactamente lo que se quiere.
 *
 * Si uno de estos se dispara igualmente, la transacción se deshace entera y la
 * herramienta lo dice. Bajar candados «por si acaso» sería quitarles el sentido.
 */

export type Resultado = {
  ok: boolean;
  motivo?: string;
  plan?: Record<string, number>;
  globales?: Record<string, number>;
  /** Filas borradas de verdad, por tabla. Solo en ejecución real. */
  borradas?: Record<string, number>;
  /** Ficheros de inquilino borrados de Storage. Solo en ejecución real. */
  ficheros?: number;
};

function bloqueado(motivo: string): Resultado {
  console.log(`BLOQUEADO · ${motivo}`);
  return { ok: false, motivo };
}

/**
 * Los ficheros de las empresas aprobadas, y solo esos.
 *
 * Se recorre cada cubo por prefijo. Un objeto cuyo primer tramo de ruta no sea
 * una empresa aprobada no se toca ni se mira dos veces: el prefijo ES la
 * pertenencia, y esa es toda la comprobación que hace falta.
 */
async function borrarFicheros(
  base: string, llave: string, aprobadas: string[]
): Promise<number> {
  const cabeceras = { apikey: llave, Authorization: `Bearer ${llave}`,
                      "Content-Type": "application/json" };

  const cubosR = await fetch(`${base}/storage/v1/bucket`, { headers: cabeceras });
  if (!cubosR.ok) throw new Error(`no se pudieron listar los cubos (${cubosR.status})`);
  const cubos = (await cubosR.json()) as Array<{ name: string }>;

  const listar = async (cubo: string, prefijo: string) => {
    const r = await fetch(`${base}/storage/v1/object/list/${cubo}`, {
      method: "POST", headers: cabeceras,
      body: JSON.stringify({ prefix: prefijo, limit: 1000 }) });
    if (!r.ok) throw new Error(`no se pudo listar ${cubo}/${prefijo} (${r.status})`);
    return (await r.json()) as Array<{ name: string; id: string | null }>;
  };

  const recorrer = async (cubo: string, prefijo: string, prof: number): Promise<string[]> => {
    const salida: string[] = [];
    for (const o of await listar(cubo, prefijo)) {
      if (!o.name) continue;
      const ruta = `${prefijo}${o.name}`;
      // Sin `id` es una carpeta. Se baja, pero no hasta el infinito.
      if (o.id === null && prof < 8) salida.push(...await recorrer(cubo, `${ruta}/`, prof + 1));
      else if (o.id !== null) salida.push(ruta);
    }
    return salida;
  };

  let total = 0;
  for (const { name: cubo } of cubos) {
    const rutas: string[] = [];
    for (const org of aprobadas) rutas.push(...await recorrer(cubo, `${org}/`, 0));
    if (rutas.length === 0) continue;
    for (const r of rutas) {
      if (!aprobadas.includes(r.split("/")[0])) {
        throw new Error(`ruta fuera de las empresas aprobadas: ${cubo}/${r}`);
      }
    }
    const r = await fetch(`${base}/storage/v1/object/${cubo}`, {
      method: "DELETE", headers: cabeceras, body: JSON.stringify({ prefixes: rutas }) });
    if (!r.ok) throw new Error(`no se pudieron borrar ficheros de ${cubo} (${r.status})`);
    total += rutas.length;
  }
  return total;
}

export async function limpiar(opciones: {
  databaseUrl: string; projectRef: string; organizations: string[];
  ejecutar: boolean; confirmacion: string | null; habilitado: boolean;
  /** Base del proyecto y llave de servicio: solo para borrar sus ficheros. */
  storageUrl?: string; storageKey?: string;
}): Promise<Resultado> {
  const { databaseUrl, projectRef, organizations, ejecutar, confirmacion, habilitado,
          storageUrl, storageKey } = opciones;

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
  if (ejecutar && (!storageUrl || !storageKey)) {
    return bloqueado("faltan las credenciales de Storage. Borrar las filas y dejar "
      + "los ficheros seria media limpieza, y la peor mitad: se para antes de tocar "
      + "la base.");
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

    // =====================================================================
    // LA EJECUCIÓN REAL
    // =====================================================================
    // Una sola transacción, que se comprueba a sí misma antes de confirmar. Si
    // al final lo global no está donde estaba, deshace y no confirma: nadie
    // tiene que acordarse de mirar.
    console.log("\nEJECUTANDO · una transacción, con verificación antes de confirmar.");
    const borradas: Record<string, number> = {};
    await pg.query("begin");
    let confirmada = false;
    try {
      for (const c of CANDADOS) {
        await pg.query(`alter table public.${c.tabla} disable trigger ${c.trigger}`);
      }

      // Vueltas hasta que ninguna clave foránea se queje. El orden de borrado no
      // se adivina: se descubre chocando, y cada choque se deshace solo hasta su
      // punto de guardado.
      let vueltas = 0;
      for (;;) {
        vueltas += 1;
        let pendientes = 0;
        let progreso = 0;
        for (const t of objetivo) {
          await pg.query("savepoint tabla");
          try {
            const r = await pg.query(
              `delete from public.${t} where organization_id = any($1::uuid[])`, [aprobadas]);
            const n = r.rowCount ?? 0;
            if (n > 0) { borradas[t] = (borradas[t] ?? 0) + n; progreso += n; }
            await pg.query("release savepoint tabla");
          } catch (e) {
            await pg.query("rollback to savepoint tabla");
            const codigo = (e as { code?: string }).code;
            if (codigo === "23503") pendientes += 1;   // foreign_key_violation
            else throw e;
          }
        }
        if (pendientes === 0) break;
        if (progreso === 0 || vueltas > 12) {
          throw new Error(`${pendientes} tabla(s) siguen bloqueadas por claves `
            + `foráneas tras ${vueltas} vuelta(s) sin progreso.`);
        }
      }

      const rOrg = await pg.query(
        "delete from public.organizations where id = any($1::uuid[])", [aprobadas]);
      borradas["organizations"] = rOrg.rowCount ?? 0;

      for (const c of CANDADOS) {
        await pg.query(`alter table public.${c.tabla} enable trigger ${c.trigger}`);
      }

      // ---- La verificación, ANTES de confirmar ---------------------------
      const { rows: quedan } = await pg.query<{ n: string }>(
        "select count(*)::text n from public.organizations");
      if (Number(quedan[0].n) !== 0) {
        throw new Error(`quedan ${quedan[0].n} empresa(s) después de borrar.`);
      }
      for (const t of ["legal_documents", "platform_staff"]) {
        const { rows } = await pg.query<{ n: string }>(
          `select count(*)::text n from public.${t}`);
        if (Number(rows[0].n) !== globales[t]) {
          throw new Error(`${t} pasó de ${globales[t]} a ${rows[0].n}: `
            + "la limpieza tocó algo global.");
        }
      }
      const { rows: aud } = await pg.query<{ n: string }>(
        "select count(*)::text n from public.audit_log");
      if (Number(aud[0].n) < globales.audit_log) {
        throw new Error(`audit_log bajó de ${globales.audit_log} a ${aud[0].n}: `
          + "la historia no se borra.");
      }

      await pg.query("commit");
      confirmada = true;
    } catch (e) {
      if (!confirmada) await pg.query("rollback");
      return bloqueado(`la limpieza se deshizo entera y no se confirmó · `
        + `${e instanceof Error ? e.message : e}`);
    }

    const totalBorradas = Object.values(borradas).reduce((a, b) => a + b, 0);
    console.log(`Confirmado          : ${totalBorradas} fila(s) en `
      + `${Object.keys(borradas).length} tabla(s)`);

    // ---- Y los ficheros, que no viven en la base ------------------------
    const ficheros = await borrarFicheros(storageUrl!, storageKey!, aprobadas);
    console.log(`Ficheros borrados   : ${ficheros}`);
    console.log(`Cuentas de Auth     : intactas`);

    return { ok: true, plan, globales, borradas, ficheros };
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
    storageUrl: process.env.PRODUCTION_SUPABASE_URL,
    storageKey: process.env.PRODUCTION_SERVICE_KEY,
  }).then((r) => process.exit(r.ok ? 0 : 1))
    .catch((e) => { console.log(`BLOQUEADO · ${e instanceof Error ? e.message : e}`); process.exit(1); });
}
