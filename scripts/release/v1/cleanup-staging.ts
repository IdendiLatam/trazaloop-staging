/**
 * Trazaloop v1.0.0 · LIMPIEZA OPCIONAL DE STAGING
 * scripts/release/v1/cleanup-staging.ts   ·   npm run cleanup:staging
 *
 *   ####################################################################
 *   #  ESTA HERRAMIENTA BORRA DATOS. NO SE HA EJECUTADO NUNCA.         #
 *   #                                                                  #
 *   #  · Está pensada EXCLUSIVAMENTE para el proyecto Supabase de      #
 *   #    STAGING. Jamás para producción.                               #
 *   #  · Por defecto NO borra nada: modo DRY-RUN.                      #
 *   #  · Falla CERRADO: ante cualquier duda, se niega a actuar.        #
 *   #  · No forma parte del despliegue de v1.0.0. Es una utilidad      #
 *   #    posterior y opcional.                                         #
 *   ####################################################################
 *
 * ---------------------------------------------------------------------------
 * QUÉ BORRA
 * ---------------------------------------------------------------------------
 *   · Todos los datos EMPRESARIALES: organizaciones, membresías,
 *     invitaciones, tickets y su historial, feedback, proveedores,
 *     materiales, productos, órdenes, lotes, consumos, composiciones,
 *     evidencias (CPR y Textiles), intentos de carga, documentos
 *     TrazaDocs y descargables, versiones documentales, evaluaciones de
 *     circularidad, pasaportes, enlaces privados y auditoría con ámbito
 *     de empresa.
 *   · Las fibras PERSONALIZADAS de empresas (no el catálogo base).
 *   · Los archivos físicos de todos los buckets de Storage.
 *   · Los usuarios de Auth y sus perfiles, EXCEPTO los de KEEP_AUTH_EMAILS.
 *
 * La lista de tablas NO está escrita a mano: se deriva del esquema real
 * (toda tabla de `public` con columna `organization_id`, más las raíces de
 * tenencia). Una tabla empresarial nueva queda cubierta automáticamente.
 *
 * ---------------------------------------------------------------------------
 * QUÉ PRESERVA SIEMPRE
 * ---------------------------------------------------------------------------
 *   · Catálogos globales y catálogo base de fibras (organization_id IS NULL)
 *   · modules · plan_definitions · plan_limits
 *   · calculation_methodologies · frameworks · requirements
 *   · diagnostic_sections / diagnostic_questions (CPR y Textiles)
 *   · textile_circularity_methodologies / _criteria
 *   · trazadoc_blueprints / trazadoc_blueprint_sections (hints)
 *   · material_classifications · roles · legal_documents
 *   · El esquema y las migraciones (no ejecuta DDL de ningún tipo)
 *   · Los superadministradores listados en KEEP_AUTH_EMAILS y su fila en
 *     platform_staff
 *
 * ---------------------------------------------------------------------------
 * REQUISITOS PARA EJECUTAR (todos, sin excepción)
 * ---------------------------------------------------------------------------
 *   1. --execute
 *   2. --project-ref=<ref>
 *   3. Una ALLOWLIST de staging aportada por el operador, vía
 *      --allow-staging-ref=<ref>[,<ref>...] o la variable de entorno
 *      STAGING_ALLOWLIST_PROJECT_REFS. Sin allowlist no se ejecuta nunca.
 *   4. Que --project-ref esté en la allowlist.
 *   5. Que --project-ref coincida con el proyecto al que apuntan de verdad
 *      NEXT_PUBLIC_SUPABASE_URL y SUPABASE_DB_URL.
 *   6. --confirm="BORRAR DATOS DE STAGING <project-ref>" (texto exacto).
 *   7. KEEP_AUTH_EMAILS con al menos un correo.
 *
 * ---------------------------------------------------------------------------
 * RESPALDO Y RECUPERACIÓN — LEER ANTES DE EJECUTAR
 * ---------------------------------------------------------------------------
 *   ESTA OPERACIÓN NO TIENE DESHACER. Antes de usar --execute:
 *
 *     # 1. Copia completa de la base
 *     pg_dump "$SUPABASE_DB_URL" -Fc -f staging_backup_$(date +%F).dump
 *
 *     # 2. Inventario de Storage (los archivos NO están en el dump)
 *     npm run cleanup:staging -- --project-ref=<ref> > inventario_$(date +%F).txt
 *
 *     # 3. Descarga de los archivos que quieras conservar, desde el panel
 *     #    de Supabase → Storage, o con la API de Storage.
 *
 *   Recuperación: restaura SIEMPRE sobre un proyecto Supabase NUEVO
 *   (`pg_restore`), nunca encima del proyecto dañado, y valida con
 *   `npm run verify:prod`. Ver docs/BACKUP_RESTORE.md.
 *
 *   Los archivos de Storage NO se recuperan desde el dump de PostgreSQL:
 *   el dump contiene la metadata de `storage.objects`, no los bytes.
 *
 * ---------------------------------------------------------------------------
 * USO
 * ---------------------------------------------------------------------------
 *   # Ensayo (por defecto, no borra nada):
 *   npm run cleanup:staging -- --project-ref=<ref>
 *
 *   # Ejecución real:
 *   KEEP_AUTH_EMAILS="admin@trazaloop.com" \
 *   STAGING_ALLOWLIST_PROJECT_REFS="<ref-de-staging>" \
 *   npm run cleanup:staging -- \
 *       --project-ref=<ref-de-staging> \
 *       --execute \
 *       --confirm="BORRAR DATOS DE STAGING <ref-de-staging>"
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

// ===========================================================================
// Utilidades de salida
// ===========================================================================
const line = (s = "") => console.log(s);
const head = (s: string) => {
  line("");
  line(`--- ${s} ---`);
};
const ok = (s: string) => line(`  ✅ ${s}`);
const info = (s: string) => line(`  ·  ${s}`);
const warn = (s: string) => line(`  ⚠️  ${s}`);

/** Aborta de inmediato. Fallar CERRADO es el comportamiento por defecto. */
function abort(reason: string, hint?: string): never {
  line("");
  line("==========================================================");
  line(" ABORTADO · no se ha modificado nada");
  line("==========================================================");
  line("");
  line(`  ${reason}`);
  if (hint) line(`  → ${hint}`);
  line("");
  process.exit(1);
}

// ===========================================================================
// Argumentos
// ===========================================================================
const argv = process.argv.slice(2);
function flag(name: string): string | null {
  const withEq = argv.find((a) => a.startsWith(`--${name}=`));
  if (withEq) return withEq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  return null;
}
const EXECUTE = argv.includes("--execute");
const PROJECT_REF = flag("project-ref");
const CONFIRM = flag("confirm");

const ALLOWLIST = (
  flag("allow-staging-ref") ??
  process.env.STAGING_ALLOWLIST_PROJECT_REFS ??
  ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Cuentas QA PERMANENTES de Staging que esta herramienta no debe borrar nunca.
 *
 * No son cuentas de suite: son los accesos humanos con los que se prueban los
 * sprints de Quality, y viven en una empresa que no depende de ningún Demo. Si
 * dependieran de que alguien acordara ponerlas en KEEP_AUTH_EMAILS, la primera
 * limpieza hecha con prisa se las llevaría — y recrearlas significa recrear
 * también la empresa, los cargos y los titulares.
 *
 * Van aquí y no en el .env por eso mismo: una lista que hay que recordar no es
 * una protección. Son direcciones `.local`, no enrutables: no existe ninguna
 * persona real detrás.
 */
const ALWAYS_KEEP_EMAILS = [
  "quality.admin@trazaloop-staging.local",
  "quality.reviewer@trazaloop-staging.local",
  "quality.approver@trazaloop-staging.local",
];

const KEEP_EMAILS = [
  ...new Set([
    ...(process.env.KEEP_AUTH_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    ...ALWAYS_KEEP_EMAILS,
  ]),
];

// ===========================================================================
// Tablas GLOBALES que jamás se tocan (además de todo lo que no se derive
// como empresarial). Lista explícita para que el informe pueda demostrarlo.
// ===========================================================================
const PRESERVED_GLOBAL_TABLES = [
  "modules",
  "plan_definitions",
  "plan_limits",
  "calculation_methodologies",
  "frameworks",
  "requirements",
  "diagnostic_sections",
  "diagnostic_questions",
  "material_classifications",
  "textile_diagnostic_sections",
  "textile_diagnostic_questions",
  "textile_circularity_methodologies",
  "textile_circularity_criteria",
  "trazadoc_blueprints",
  "trazadoc_blueprint_sections",
  "roles",
  "legal_documents",
];

/** Mixta: solo se borra la parte con organization_id NOT NULL. */
const MIXED_TABLE = "textile_fiber_types";

// ===========================================================================
// Validación de precondiciones — TODO antes de conectarse a nada
// ===========================================================================
line("");
line("==========================================================");
line(" Trazaloop · limpieza de STAGING");
line("==========================================================");
line("");
line(`  Modo: ${EXECUTE ? "⚠️  EJECUCIÓN REAL (BORRA DATOS)" : "ENSAYO (dry-run) · no borra nada"}`);
line("");

if (!PROJECT_REF) {
  abort(
    "Falta --project-ref=<ref>.",
    "Debes declarar explícitamente contra qué proyecto vas a trabajar."
  );
}

if (ALLOWLIST.length === 0) {
  abort(
    "No se ha aportado ninguna allowlist de staging.",
    "Indica --allow-staging-ref=<ref>[,<ref>] o la variable " +
      "STAGING_ALLOWLIST_PROJECT_REFS. Sin allowlist esta herramienta NUNCA " +
      "se ejecuta: es la única barrera que impide apuntar a producción."
  );
}

if (!ALLOWLIST.includes(PROJECT_REF)) {
  abort(
    `El project ref «${PROJECT_REF}» NO está en la allowlist de staging.`,
    `Allowlist declarada: ${ALLOWLIST.join(", ")}. ` +
      "Si de verdad es un proyecto de staging, añádelo explícitamente. " +
      "Si es producción: DETENTE."
  );
}
ok(`Project ref «${PROJECT_REF}» presente en la allowlist de staging.`);

// El entorno debe apuntar de verdad a ese proyecto.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";

if (!SUPABASE_URL || !SECRET_KEY || !DB_URL) {
  abort(
    "Faltan variables de entorno.",
    "Se necesitan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (o el " +
      "heredado SUPABASE_SERVICE_ROLE_KEY) y SUPABASE_DB_URL, todas del " +
      "proyecto de STAGING. Esta herramienta nunca imprime sus valores."
  );
}

function refFromUrl(raw: string): string | null {
  try {
    const m = /^([a-z0-9]{16,})\.supabase\.(co|in)$/i.exec(new URL(raw).hostname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const urlRef = refFromUrl(SUPABASE_URL);
if (!urlRef) {
  abort(
    "No se pudo extraer el project ref de NEXT_PUBLIC_SUPABASE_URL.",
    "Sin poder confirmar a qué proyecto apunta el entorno, la herramienta " +
      "falla cerrado."
  );
}
if (urlRef !== PROJECT_REF) {
  abort(
    `Incoherencia: --project-ref=${PROJECT_REF} pero el entorno apunta a ${urlRef}.`,
    "Estarías borrando en un proyecto distinto del que has declarado."
  );
}
ok("NEXT_PUBLIC_SUPABASE_URL apunta al proyecto declarado.");

if (!DB_URL.includes(PROJECT_REF)) {
  warn(
    "SUPABASE_DB_URL no contiene el project ref de forma reconocible; " +
      "se comprobará contra el servidor tras conectar."
  );
}

if (KEEP_EMAILS.length === 0) {
  abort(
    "KEEP_AUTH_EMAILS está vacía.",
    "Debes declarar al menos un correo a conservar (el superadministrador). " +
      "Sin esa lista, la limpieza dejaría staging sin ningún acceso " +
      "administrativo. La herramienta falla cerrado."
  );
}
ok(`Se conservarán ${KEEP_EMAILS.length} cuenta(s): ${KEEP_EMAILS.join(", ")}`);

const EXPECTED_CONFIRM = `BORRAR DATOS DE STAGING ${PROJECT_REF}`;
if (EXECUTE && CONFIRM !== EXPECTED_CONFIRM) {
  abort(
    "La confirmación escrita no es exacta.",
    `Se exige literalmente:  --confirm="${EXPECTED_CONFIRM}"` +
      (CONFIRM ? "\n  → Lo recibido no coincide carácter por carácter." : "")
  );
}
if (EXECUTE) ok("Confirmación escrita exacta verificada.");

// ===========================================================================
// Tipos del informe
// ===========================================================================
type TableCensus = { table: string; filter: string; before: number; after: number | null };
type BucketCensus = { bucket: string; before: number; after: number | null };
type UserCensus = { total: number; kept: number; deleted: number };

// ===========================================================================
async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();

  try {
    // -----------------------------------------------------------------------
    // Confirmación adicional: el servidor al que hemos conectado es el
    // proyecto declarado.
    // -----------------------------------------------------------------------
    const serverInfo = await pg.query<{ db: string }>("select current_database() as db");
    info(`Conectado a la base «${serverInfo.rows[0].db}».`);

    // -----------------------------------------------------------------------
    // 1. Derivar las tablas empresariales del ESQUEMA REAL
    // -----------------------------------------------------------------------
    head("1. Tablas empresariales derivadas del esquema");

    const derived = await pg.query<{ table_name: string }>(
      `select distinct c.table_name
         from information_schema.columns c
         join information_schema.tables t
           on t.table_schema = c.table_schema
          and t.table_name   = c.table_name
          and t.table_type   = 'BASE TABLE'
        where c.table_schema = 'public'
          and c.column_name  = 'organization_id'
          and c.table_name  <> $1
        order by 1`,
      [MIXED_TABLE]
    );

    const targets: { table: string; filter: string }[] = [
      ...derived.rows.map((r) => ({ table: r.table_name, filter: "" })),
      { table: MIXED_TABLE, filter: "where organization_id is not null" },
      { table: "organizations", filter: "" },
    ];

    info(`${targets.length} tabla(s) empresarial(es) detectada(s).`);

    // Tablas sin clasificar: fallar cerrado.
    const unclassified = await pg.query<{ table_name: string }>(
      `select t.table_name
         from information_schema.tables t
        where t.table_schema = 'public'
          and t.table_type = 'BASE TABLE'
          and t.table_name not in (
                select table_name from information_schema.columns
                 where table_schema='public' and column_name='organization_id')
          and t.table_name <> all($1::text[])
        order by 1`,
      [
        [
          ...PRESERVED_GLOBAL_TABLES,
          MIXED_TABLE,
          "organizations",
          "profiles",
          "user_legal_acceptances",
          "platform_staff",
        ],
      ]
    );

    if (unclassified.rows.length > 0) {
      abort(
        `Hay ${unclassified.rows.length} tabla(s) cuya relación con la empresa no está clara: ` +
          unclassified.rows.map((r) => r.table_name).join(", "),
        "La herramienta falla CERRADO. Clasifícalas a mano: si son globales, " +
          "añádelas a PRESERVED_GLOBAL_TABLES; si son empresariales, deben " +
          "tener organization_id. No se ha borrado nada."
      );
    }
    ok("Ninguna tabla queda sin clasificar.");

    // -----------------------------------------------------------------------
    // 2. Orden de borrado: hijos antes que padres (grafo FK real)
    // -----------------------------------------------------------------------
    head("2. Orden de borrado (topológico sobre las claves foráneas reales)");

    const fks = await pg.query<{ child: string; parent: string }>(
      `select src.relname as child, tgt.relname as parent
         from pg_constraint con
         join pg_class src on src.oid = con.conrelid
         join pg_class tgt on tgt.oid = con.confrelid
         join pg_namespace ns on ns.oid = src.relnamespace
         join pg_namespace nt on nt.oid = tgt.relnamespace
        where con.contype = 'f'
          and ns.nspname = 'public' and nt.nspname = 'public'
          and src.relname <> tgt.relname`
    );

    const names = new Set(targets.map((t) => t.table));
    const parents = new Map<string, Set<string>>();
    for (const t of names) parents.set(t, new Set());
    for (const { child, parent } of fks.rows) {
      if (names.has(child) && names.has(parent)) parents.get(child)!.add(parent);
    }

    // Un padre solo puede borrarse cuando ya no queda ningún hijo por borrar.
    const order: string[] = [];
    const pending = new Set(names);
    let guard = 0;
    while (pending.size > 0 && guard++ < 1000) {
      const ready = [...pending].filter((t) =>
        [...pending].every((other) => other === t || !parents.get(other)!.has(t))
      );
      if (ready.length === 0) {
        // Ciclo de claves foráneas: se resolverá con pasadas repetidas.
        warn(
          `Ciclo de FK entre: ${[...pending].join(", ")}. ` +
            "Se borrarán con pasadas repetidas dentro de la transacción."
        );
        order.push(...pending);
        break;
      }
      ready.sort();
      for (const t of ready) {
        order.push(t);
        pending.delete(t);
      }
    }
    info(`Orden calculado para ${order.length} tabla(s).`);

    const orderedTargets = order.map(
      (t) => targets.find((x) => x.table === t)!
    );

    // -----------------------------------------------------------------------
    // 3. INVENTARIO — qué se borraría (siempre, también en dry-run)
    // -----------------------------------------------------------------------
    head("3. Inventario: datos EMPRESARIALES que se borrarían");

    const census: TableCensus[] = [];
    for (const t of orderedTargets) {
      const r = await pg.query<{ n: string }>(
        `select count(*)::text as n from public.${quoteIdent(t.table)} ${t.filter}`
      );
      const n = Number(r.rows[0].n);
      census.push({ table: t.table, filter: t.filter, before: n, after: null });
    }
    const totalBusiness = census.reduce((a, c) => a + c.before, 0);
    for (const c of census.filter((c) => c.before > 0)) {
      info(`${c.table.padEnd(42)} ${String(c.before).padStart(8)} fila(s)`);
    }
    if (totalBusiness === 0) info("(ninguna fila empresarial)");
    line("");
    info(`TOTAL de filas empresariales a borrar: ${totalBusiness}`);

    // Usuarios -------------------------------------------------------------
    head("3b. Inventario: cuentas de usuario");

    const supa: SupabaseClient = createClient(SUPABASE_URL, SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const allUsers: { id: string; email: string }[] = [];
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 });
      if (error) abort(`No se pudieron listar los usuarios de Auth: ${error.message}`);
      if (!data.users.length) break;
      allUsers.push(
        ...data.users.map((u) => ({ id: u.id, email: (u.email ?? "").toLowerCase() }))
      );
      if (data.users.length < 200) break;
    }

    const keptUsers = allUsers.filter((u) => KEEP_EMAILS.includes(u.email));
    const doomedUsers = allUsers.filter((u) => !KEEP_EMAILS.includes(u.email));

    info(`Usuarios en Auth: ${allUsers.length}`);
    info(`Se CONSERVAN:     ${keptUsers.length} → ${keptUsers.map((u) => u.email).join(", ") || "(ninguno)"}`);
    info(`Se BORRAN:        ${doomedUsers.length}`);

    // Salvaguarda crítica: ningún correo de KEEP_AUTH_EMAILS puede faltar.
    // Solo se exige que existan los correos que el OPERADOR declaró. Las
    // cuentas QA permanentes pueden no estar todavía en un proyecto recién
    // creado, y eso no es un error: simplemente no hay nada que conservar.
    const declared = (process.env.KEEP_AUTH_EMAILS ?? "")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const missing = declared.filter((e) => !allUsers.some((u) => u.email === e));
    if (missing.length > 0) {
      abort(
        `Correos de KEEP_AUTH_EMAILS que NO existen en este proyecto: ${missing.join(", ")}`,
        "Probablemente estés apuntando al proyecto equivocado, o el correo " +
          "está mal escrito. Si se continuara, la limpieza podría eliminar al " +
          "único superadministrador. La herramienta falla cerrado."
      );
    }

    // Salvaguarda crítica: debe quedar al menos un superadministrador.
    const superadmins = await pg.query<{ id: string; email: string }>(
      `select ps.user_id::text as id, lower(coalesce(u.email,'')) as email
         from public.platform_staff ps
         join auth.users u on u.id = ps.user_id
        where ps.is_superadmin is true`
    );
    const survivingSupers = superadmins.rows.filter((s) => KEEP_EMAILS.includes(s.email));
    info(`Superadministradores actuales: ${superadmins.rows.length}`);
    info(`Superadministradores que sobreviven: ${survivingSupers.length}`);

    if (superadmins.rows.length > 0 && survivingSupers.length === 0) {
      abort(
        "La limpieza eliminaría a TODOS los superadministradores.",
        "Añade al menos uno de estos correos a KEEP_AUTH_EMAILS: " +
          superadmins.rows.map((s) => s.email).join(", ") +
          ". La herramienta falla cerrado."
      );
    }

    // Storage --------------------------------------------------------------
    head("3c. Inventario: Storage");
    line("");
    line("     NOTA: borrar filas de storage.objects por SQL NO elimina el");
    line("     archivo físico. Por eso Storage se trata APARTE, siempre a");
    line("     través de la API de Storage, y se verifica volviendo a listar.");
    line("");

    const { data: buckets, error: bErr } = await supa.storage.listBuckets();
    if (bErr) abort(`No se pudieron listar los buckets: ${bErr.message}`);

    const bucketCensus: BucketCensus[] = [];
    const bucketObjects = new Map<string, string[]>();

    for (const b of buckets ?? []) {
      const paths = await listAllObjects(pg, b.id);
      bucketObjects.set(b.id, paths);
      bucketCensus.push({ bucket: b.id, before: paths.length, after: null });
      info(
        `${b.id.padEnd(28)} ${String(paths.length).padStart(6)} objeto(s)` +
          (b.public ? "   ⚠️  BUCKET PÚBLICO" : "   (privado)")
      );
    }
    const totalObjects = bucketCensus.reduce((a, c) => a + c.before, 0);
    info(`TOTAL de objetos a borrar: ${totalObjects}`);

    // Preservados ----------------------------------------------------------
    head("3d. Datos GLOBALES que se PRESERVAN (no se tocan)");
    for (const t of PRESERVED_GLOBAL_TABLES) {
      const exists = await pg.query(`select to_regclass($1) as r`, [`public.${t}`]);
      if (!exists.rows[0].r) continue;
      const r = await pg.query<{ n: string }>(
        `select count(*)::text as n from public.${quoteIdent(t)}`
      );
      info(`${t.padEnd(42)} ${String(r.rows[0].n).padStart(8)} fila(s) · se conservan`);
    }
    const baseFibers = await pg.query<{ n: string }>(
      `select count(*)::text as n from public.${quoteIdent(MIXED_TABLE)} where organization_id is null`
    );
    info(
      `${(MIXED_TABLE + " (catálogo base)").padEnd(42)} ${String(baseFibers.rows[0].n).padStart(8)} fila(s) · se conservan`
    );

    // -----------------------------------------------------------------------
    // 4. DRY-RUN: parar aquí
    // -----------------------------------------------------------------------
    if (!EXECUTE) {
      line("");
      line("==========================================================");
      line(" ENSAYO COMPLETADO · no se ha borrado NADA");
      line("==========================================================");
      line("");
      line(`  Se borrarían ${totalBusiness} fila(s) empresarial(es),`);
      line(`  ${totalObjects} objeto(s) de Storage y ${doomedUsers.length} cuenta(s).`);
      line("");
      line("  Para ejecutarlo de verdad (tras hacer copia de seguridad):");
      line("");
      line(`    KEEP_AUTH_EMAILS="${KEEP_EMAILS.join(",")}" \\`);
      line(`    STAGING_ALLOWLIST_PROJECT_REFS="${ALLOWLIST.join(",")}" \\`);
      line(`    npm run cleanup:staging -- \\`);
      line(`        --project-ref=${PROJECT_REF} \\`);
      line(`        --execute \\`);
      line(`        --confirm="${EXPECTED_CONFIRM}"`);
      line("");
      return;
    }

    // -----------------------------------------------------------------------
    // 5. EJECUCIÓN — Storage primero (lo único no transaccional)
    // -----------------------------------------------------------------------
    head("5. Borrado de Storage (API de Storage, no SQL)");

    for (const bc of bucketCensus) {
      const paths = bucketObjects.get(bc.bucket) ?? [];
      if (paths.length === 0) {
        bc.after = 0;
        ok(`${bc.bucket}: ya estaba vacío.`);
        continue;
      }
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { error } = await supa.storage.from(bc.bucket).remove(chunk);
        if (error) {
          abort(
            `Fallo borrando objetos de «${bc.bucket}»: ${error.message}`,
            "La limpieza se detiene. Storage puede haber quedado a medias: " +
              "vuelve a ejecutar el ensayo para ver el estado real."
          );
        }
      }
      // Verificación: volver a listar. NUNCA se asume el resultado.
      const remaining = await listAllObjects(pg, bc.bucket);
      bc.after = remaining.length;
      if (remaining.length > 0) {
        abort(
          `Tras el borrado quedan ${remaining.length} objeto(s) en «${bc.bucket}».`,
          "La eliminación física no se completó. No se continúa con la base " +
            "de datos para no dejar archivos huérfanos sin su metadata."
        );
      }
      ok(`${bc.bucket}: ${bc.before} objeto(s) eliminados y verificados.`);
    }

    // -----------------------------------------------------------------------
    // 6. EJECUCIÓN — datos empresariales, en UNA transacción
    // -----------------------------------------------------------------------
    head("6. Borrado de datos empresariales (transaccional)");

    await pg.query("begin");
    try {
      for (const c of census) {
        const target = orderedTargets.find((t) => t.table === c.table)!;
        await pg.query(`delete from public.${quoteIdent(c.table)} ${target.filter}`);
      }

      // Pasadas adicionales por si hubo ciclos de FK.
      for (let pass = 0; pass < 3; pass++) {
        let leftovers = 0;
        for (const c of census) {
          const target = orderedTargets.find((t) => t.table === c.table)!;
          const r = await pg.query<{ n: string }>(
            `select count(*)::text as n from public.${quoteIdent(c.table)} ${target.filter}`
          );
          if (Number(r.rows[0].n) > 0) {
            leftovers++;
            await pg.query(`delete from public.${quoteIdent(c.table)} ${target.filter}`);
          }
        }
        if (leftovers === 0) break;
      }

      // Verificación de CADA retirada, dentro de la misma transacción.
      for (const c of census) {
        const target = orderedTargets.find((t) => t.table === c.table)!;
        const r = await pg.query<{ n: string }>(
          `select count(*)::text as n from public.${quoteIdent(c.table)} ${target.filter}`
        );
        c.after = Number(r.rows[0].n);
        if (c.after !== 0) {
          throw new Error(
            `La tabla ${c.table} conserva ${c.after} fila(s) tras el borrado.`
          );
        }
      }

      // Perfiles: solo los que no se conservan.
      const keptIds = keptUsers.map((u) => u.id);
      await pg.query(
        `delete from public.user_legal_acceptances where user_id <> all($1::uuid[])`,
        [keptIds]
      );
      await pg.query(`delete from public.profiles where id <> all($1::uuid[])`, [keptIds]);

      // Salvaguarda final antes de confirmar: el superadministrador sigue ahí.
      const stillSuper = await pg.query<{ n: string }>(
        `select count(*)::text as n from public.platform_staff where is_superadmin is true`
      );
      if (superadmins.rows.length > 0 && Number(stillSuper.rows[0].n) === 0) {
        throw new Error(
          "Tras la limpieza no quedaría ningún superadministrador. Se revierte."
        );
      }

      await pg.query("commit");
      ok("Datos empresariales borrados y verificados. Transacción confirmada.");
    } catch (err) {
      await pg.query("rollback");
      abort(
        `Fallo durante el borrado: ${(err as Error).message}`,
        "Se ha hecho ROLLBACK: la base queda como estaba. Storage, en cambio, " +
          "YA fue vaciado (no es transaccional). Revisa el estado con el ensayo."
      );
    }

    // -----------------------------------------------------------------------
    // 7. EJECUCIÓN — cuentas de Auth
    // -----------------------------------------------------------------------
    head("7. Borrado de cuentas de Auth");

    let deletedUsers = 0;
    for (const u of doomedUsers) {
      const { error } = await supa.auth.admin.deleteUser(u.id);
      if (error) {
        warn(`No se pudo borrar la cuenta ${u.email}: ${error.message}`);
        continue;
      }
      deletedUsers++;
    }
    ok(`${deletedUsers} de ${doomedUsers.length} cuenta(s) eliminadas.`);

    // Verificación final de usuarios.
    const finalUsers: string[] = [];
    for (let page = 1; page <= 100; page++) {
      const { data } = await supa.auth.admin.listUsers({ page, perPage: 200 });
      if (!data || !data.users.length) break;
      finalUsers.push(...data.users.map((u) => (u.email ?? "").toLowerCase()));
      if (data.users.length < 200) break;
    }
    const unexpected = finalUsers.filter((e) => !KEEP_EMAILS.includes(e));
    if (unexpected.length > 0) {
      warn(`Quedan ${unexpected.length} cuenta(s) no previstas: ${unexpected.join(", ")}`);
    }

    const userCensus: UserCensus = {
      total: allUsers.length,
      kept: finalUsers.length - unexpected.length,
      deleted: deletedUsers,
    };

    // -----------------------------------------------------------------------
    // 8. INFORME FINAL
    // -----------------------------------------------------------------------
    line("");
    line("==========================================================");
    line(" INFORME FINAL · limpieza de staging");
    line("==========================================================");
    line("");
    line(`  Proyecto ............... ${PROJECT_REF}`);
    line(`  Tablas empresariales ... ${census.length} revisadas`);
    line(`  Filas borradas ......... ${totalBusiness}`);
    line(`  Filas restantes ........ ${census.reduce((a, c) => a + (c.after ?? 0), 0)}`);
    line(`  Objetos de Storage ..... ${totalObjects} borrados`);
    line(`  Buckets verificados .... ${bucketCensus.length}`);
    line(`  Cuentas borradas ....... ${userCensus.deleted}`);
    line(`  Cuentas conservadas .... ${userCensus.kept} (${KEEP_EMAILS.join(", ")})`);
    line(`  Tablas globales ........ ${PRESERVED_GLOBAL_TABLES.length} intactas`);
    line(`  Catálogo base fibras ... intacto`);
    line(`  Migraciones ............ intactas (no se ejecutó DDL)`);
    line("");
    line("  Siguiente paso recomendado:");
    line("    npm run verify:prod    (verificación de solo lectura)");
    line("");
  } finally {
    await pg.end();
  }
}

/** Identificador SQL citado. Las tablas provienen del catálogo del propio
 *  servidor, nunca de entrada del usuario, pero se cita igualmente. */
function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    abort(`Nombre de tabla inesperado: ${name}`, "La herramienta falla cerrado.");
  }
  return `"${name}"`;
}

/** Rutas de todos los objetos de un bucket, leídas de storage.objects.
 *  Se usan SOLO para pedir su borrado a la API de Storage — que es lo
 *  único que elimina el archivo físico. */
async function listAllObjects(pg: PgClient, bucket: string): Promise<string[]> {
  const r = await pg.query<{ name: string }>(
    `select name from storage.objects where bucket_id = $1 order by name`,
    [bucket]
  );
  return r.rows.map((x) => x.name);
}

main().catch((err) => {
  abort(`Error inesperado: ${(err as Error).message}`, "No se completó la limpieza.");
});
