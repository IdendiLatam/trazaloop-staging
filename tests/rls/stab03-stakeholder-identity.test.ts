import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { limpiarFixtures, describirResiduo } from "../support/fixture-cleanup";
import { readFileSync } from "node:fs";
import { normalizarIdentidad, terminoDeBusqueda } from "../../lib/domain/identidad-normalizada";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · STABILIZATION-03 · Una identidad externa, un nombre.
 *
 * LO QUE ESTA SUITE IMPIDE QUE VUELVA
 *
 *   · «Empresa ABC», «empresa abc», «  Empresa ABC  », «Empresa  ABC» y
 *     «Émpresa ABC» convivían como cinco empresas distintas.
 *   · No había forma de retirar una parte externa: ni acción, ni borrado
 *     posible una vez usada.
 *   · Y el buscador no encontraba lo que todavía no se había analizado, así que
 *     quien no la encontraba la volvía a crear.
 *
 * Todo contra la base, con sesiones reales.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;
if (!URL || !SERVICE || !ANON || !DB_URL) {
  console.log("faltan credenciales locales en .env.local");
  process.exit(1);
}

const admin: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });
const pg = new PgClient({ connectionString: DB_URL });

let passed = 0;
let failed = 0;
const sello = Date.now();
const personas: string[] = [];
const orgs: string[] = [];

async function check(nombre: string, fn: () => Promise<void> | void) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

async function empresa(etiqueta: string) {
  const email = `stab03-${etiqueta}-${sello}@test.trazaloop.dev`;
  const { data: u, error } = await admin.auth.admin.createUser({
    email, password: "Trazaloop-Test-1234", email_confirm: true });
  assert(!error && Boolean(u.user), `crear ${etiqueta}: ${error?.message}`);
  const uid = (u.user as { id: string }).id;
  personas.push(uid);
  const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: "Trazaloop-Test-1234" });
  const { data: orgId } = await cli.rpc("create_organization",
    { p_name: `STAB03 ${etiqueta} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", uid);
  await admin.from("organization_modules").update({ access_mode: "full" })
    .eq("organization_id", org).eq("module_code", "quality");
  return { org, uid, cli };
}

const leer = (p: string) => readFileSync(p, "utf8");
const leerCodigo = (p: string) => leer(p)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

async function main() {
  console.log("\nSTABILIZATION-03 · la identidad de las partes interesadas\n");
  await pg.connect();

  const A = await empresa("a");
  const B = await empresa("b");
  const db = await import("../../lib/db/quality-interested-parties");

  // =========================================================================
  console.log("A · La normalización, y que las dos copias dicen lo mismo");
  // =========================================================================

  await check("1. TypeScript y PostgreSQL normalizan idéntico", async () => {
    const casos = ["Empresa ABC", "  Empresa ABC  ", "Empresa  ABC", "Émpresa ABC",
                   "ÑANDÚ", "Fundación Ñandú", "  a   b  ", "Coöperatie", "ÁÉÍÓÚÜÇ"];
    for (const c of casos) {
      const { rows } = await pg.query(
        "select public.quality_normalized_identity($1) as n", [c]);
      assert(rows[0].n === normalizarIdentidad(c),
        `«${c}» → base «${rows[0].n}» vs TypeScript «${normalizarIdentidad(c)}»`);
    }
  });

  await check("2. La normalización sigue siendo apta para el índice", async () => {
    // QUÉ VIGILA ESTA COMPROBACIÓN, Y QUÉ NO
    //
    // La primera versión fallaba si `unaccent` aparecía instalada. Estaba mal:
    // instalar una extensión disponible no rompe nada de STABILIZATION-03, y
    // una guarda que se pone roja por algo que no es una regresión acaba
    // ignorándose. Lo que de verdad hay que defender es el INVARIANTE: que la
    // normalización siga siendo apta para sostener un índice único.
    //
    // Se rompería si alguien reescribiera la función apoyándola en algo que no
    // es inmutable —`unaccent` entre otras cosas—, porque entonces el índice
    // podría quedar desincronizado del dato sin que nadie se entere.
    const { rows: fn } = await pg.query(
      `select p.provolatile::text as v, pg_get_functiondef(p.oid) as d
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'quality_normalized_identity'`);
    assert(fn.length === 1, "no existe la normalización canónica");
    assert(fn[0].v === "i", `provolatile = ${fn[0].v}`);

    // 2 · No depende de `unaccent`, esté instalada o no.
    const def = String(fn[0].d).toLowerCase();
    assert(!def.includes("unaccent"),
      "la normalización pasó a depender de unaccent, que es STABLE y no vale para un índice");

    // 3 · Y las funciones de las que sí depende siguen siendo inmutables. Se
    // pregunta al catálogo AHORA: que lo fueran cuando se escribió esto no
    // garantiza que alguien no las haya redefinido en el esquema del producto.
    const usadas = ["btrim", "regexp_replace", "lower", "translate"]
      .filter((f) => def.includes(`${f}(`));
    assert(usadas.length >= 3,
      `la normalización dejó de usar las primitivas conocidas: ${usadas.join(", ")}`);
    for (const f of usadas) {
      const { rows } = await pg.query(
        `select bool_and(p.provolatile = 'i') as todas
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where p.proname = $1 and n.nspname in ('pg_catalog', 'public')`, [f]);
      assert(rows[0].todas === true, `${f} ya no es inmutable en este esquema`);
    }

    // 4 · La unicidad sigue apoyada en la columna almacenada, no en una
    // expresión que pudiera calcularse de otra forma.
    const { rows: idx } = await pg.query(
      `select indexname, indexdef from pg_indexes
        where schemaname = 'public'
          and indexname in ('quality_external_parties_org_name_uniq',
                            'quality_stakeholder_groups_org_name_uniq')`);
    assert(idx.length === 2, `faltan unicidades: ${idx.map((r: {indexname:string}) => r.indexname).join(", ")}`);
    for (const i of idx as { indexname: string; indexdef: string }[]) {
      assert(i.indexdef.includes("UNIQUE"), `${i.indexname} dejó de ser única`);
      assert(i.indexdef.includes("normalized_name"),
        `${i.indexname} ya no se apoya en normalized_name`);
      assert(!/\bWHERE\b/.test(i.indexdef),
        `${i.indexname} pasó a ser parcial: el nombre de una retirada dejaría de ser suyo`);
    }

    // 5 · Y el disparador sigue puesto en las dos tablas, antes de insertar y
    // de actualizar. Que además IGNORE lo que mande el cliente se demuestra
    // ejecutándolo en la comprobación 23, no leyéndolo aquí.
    const { rows: trg } = await pg.query(
      `select c.relname::text as tabla, t.tgname::text as disparador,
              pg_get_triggerdef(t.oid) as def
         from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal
          and c.relname in ('quality_external_parties', 'quality_stakeholder_groups')
          and t.tgname like '%normalize%'`);
    assert(trg.length === 2, `disparadores de normalización: ${trg.length}`);
    for (const t of trg as { tabla: string; def: string }[]) {
      assert(/BEFORE INSERT OR UPDATE/i.test(t.def),
        `${t.tabla}: el disparador ya no cubre insertar y actualizar`);
    }
  });

  await check("2 bis. Búsqueda y unicidad comparten la MISMA semántica", async () => {
    // Si se separaran, habría nombres que colisionan al crear y no aparecen al
    // buscar: quien no encuentra, vuelve a crear, y el duplicado que 0188
    // impide sería otra vez el defecto de partida.
    const capa = leerCodigo("lib/db/quality-interested-parties.ts");
    const i = capa.indexOf("export async function searchIdentities");
    assert(i > 0, "desapareció el buscador de identidades");
    const cuerpo = capa.slice(i, i + 3000);
    assert(cuerpo.includes('like("normalized_name"'),
      "la búsqueda dejó de comparar contra la columna normalizada");
    assert(cuerpo.includes("terminoDeBusqueda("),
      "la búsqueda dejó de normalizar el término");
    // Y la prueba viva: el mismo texto que la base considera igual es el que
    // encuentra el buscador.
    const nombre = `Semantica Compartida ${sello}`;
    const r = await db.createExternalParty(A.org, { legalName: nombre }, A.cli);
    assert(r.ok, JSON.stringify(r));
    const variante = "  SEMÁNTICA   compartida  " + sello;
    const choca = await db.createExternalParty(A.org, { legalName: variante }, A.cli);
    assert(!choca.ok, "la variante no colisionó al crear");
    const encontrada = await db.searchIdentities(A.org, { q: variante }, A.cli);
    assert(encontrada.some((f) => f.name === nombre),
      "la variante colisiona al crear pero no encuentra al buscar");
  });

  // =========================================================================
  console.log("\nB · Duplicados");
  // =========================================================================

  const NOMBRE = `Empresa ABC ${sello}`;
  let idOriginal = "";

  await check("3. La primera se crea", async () => {
    const r = await db.createExternalParty(A.org, { legalName: NOMBRE }, A.cli);
    assert(r.ok, `no se creó: ${JSON.stringify(r)}`);
    idOriginal = (r as { data: string }).data;
  });

  await check("4. Mayúsculas, espacios exteriores, espacios interiores y acentos colisionan", async () => {
    const variantes = [
      NOMBRE.toLowerCase(),
      `  ${NOMBRE}  `,
      NOMBRE.replace("Empresa ABC", "Empresa  ABC"),
      NOMBRE.replace("Empresa", "Émpresa"),
    ];
    for (const v of variantes) {
      const r = await db.createExternalParty(A.org, { legalName: v }, A.cli);
      assert(!r.ok, `«${v}» se aceptó como identidad nueva`);
      assert((r as { code: string }).code === "external_party_duplicate",
        `«${v}» → ${(r as { code: string }).code}`);
    }
    // Acotado a ESTA identidad: la organización tiene otras del fixture, y
    // contarlas todas mediría el tamaño del montaje en vez de la unicidad.
    const { rows } = await pg.query(
      `select count(*)::int n from public.quality_external_parties
        where organization_id = $1 and normalized_name = $2`,
      [A.org, normalizarIdentidad(NOMBRE)]);
    assert(rows[0].n === 1, `quedaron ${rows[0].n} filas para «${NOMBRE}»`);
  });

  await check("5. Otra empresa SÍ puede usar el mismo nombre", async () => {
    const r = await db.createExternalParty(B.org, { legalName: NOMBRE }, B.cli);
    assert(r.ok, `la unicidad se escapó del inquilino: ${JSON.stringify(r)}`);
  });

  await check("6. Sin identificador fiscal también está protegida", async () => {
    const { rows } = await pg.query(
      "select tax_id from public.quality_external_parties where id=$1", [idOriginal]);
    assert(rows[0].tax_id === null, "el fixture tenía tax_id: la prueba no demuestra nada");
    const r = await db.createExternalParty(A.org, { legalName: NOMBRE.toUpperCase() }, A.cli);
    assert(!r.ok, "una parte sin NIT quedó sin proteger");
  });

  await check("7. Y la unicidad del identificador fiscal sigue en pie", async () => {
    const nif = `NIT-${sello}`;
    const p1 = await db.createExternalParty(A.org, { legalName: `Otra Uno ${sello}`, taxId: nif }, A.cli);
    assert(p1.ok, `primera con NIT: ${JSON.stringify(p1)}`);
    const p2 = await db.createExternalParty(A.org, { legalName: `Otra Dos ${sello}`, taxId: nif.toLowerCase() }, A.cli);
    assert(!p2.ok, "dos identidades distintas con el mismo NIT");
  });

  await check("8. Un colectivo duplicado también se bloquea", async () => {
    const g1 = await db.createGroup(A.org, { name: `Comunidad Vecina ${sello}` }, A.cli);
    assert(g1.ok, `primer colectivo: ${JSON.stringify(g1)}`);
    const g2 = await db.createGroup(A.org, { name: `  comunidad  vecína ${sello}  ` }, A.cli);
    assert(!g2.ok, "se creó un colectivo duplicado");
    assert((g2 as { code: string }).code === "stakeholder_group_duplicate",
      `código: ${(g2 as { code: string }).code}`);
  });

  // =========================================================================
  console.log("\nC · Retirar y reactivar");
  // =========================================================================

  await check("9. Retirar conserva el nombre y la identidad", async () => {
    const r = await db.setExternalPartyStatus(A.org, idOriginal, "retired", A.cli);
    assert(r.ok && (r as { data: string }).data === "changed", JSON.stringify(r));
    const { rows } = await pg.query(
      "select legal_name, normalized_name, status from public.quality_external_parties where id=$1",
      [idOriginal]);
    assert(rows[0].legal_name === NOMBRE, "le cambiaron el nombre al retirarla");
    assert(rows[0].normalized_name === normalizarIdentidad(NOMBRE), "cambió su identidad");
    assert(rows[0].status === "retired", `estado: ${rows[0].status}`);
  });

  await check("10. Y el nombre de una retirada NO se puede reutilizar", async () => {
    const r = await db.createExternalParty(A.org, { legalName: NOMBRE.toLowerCase() }, A.cli);
    assert(!r.ok, "se creó una segunda fila con el nombre de una retirada");
    assert((r as { code: string }).code === "external_party_duplicate_retired",
      `esperaba el código que ofrece reactivar y vino ${(r as { code: string }).code}`);
    const { rows } = await pg.query(
      "select count(*)::int n from public.quality_external_parties where organization_id=$1 and normalized_name=$2",
      [A.org, normalizarIdentidad(NOMBRE)]);
    assert(rows[0].n === 1, `quedaron ${rows[0].n} filas`);
  });

  await check("11. Reactivar la devuelve al uso", async () => {
    const r = await db.setExternalPartyStatus(A.org, idOriginal, "active", A.cli);
    assert(r.ok && (r as { data: string }).data === "changed", JSON.stringify(r));
  });

  await check("12. Y es idempotente · repetir no escribe nada", async () => {
    const { rows: antes } = await pg.query(
      "select updated_at from public.quality_external_parties where id=$1", [idOriginal]);
    const r = await db.setExternalPartyStatus(A.org, idOriginal, "active", A.cli);
    assert(r.ok && (r as { data: string }).data === "unchanged", JSON.stringify(r));
    const { rows: despues } = await pg.query(
      "select updated_at from public.quality_external_parties where id=$1", [idOriginal]);
    assert(String(antes[0].updated_at) === String(despues[0].updated_at),
      "una operación sin cambio movió updated_at");
  });

  await check("13. Retirar no toca los análisis históricos", async () => {
    await db.seedCategories(A.org, A.cli);
    const cats = await db.listCategories(A.org, {}, A.cli);
    const a = await db.createAssessment(A.org, {
      categoryId: cats[0].id, subjectKind: "external_party", subjectId: idOriginal,
      relevanceStatus: "relevant", relevanceRationale: "STAB03 histórico",
    }, A.cli);
    assert(a.ok, `crear análisis: ${JSON.stringify(a)}`);
    const { rows: antes } = await pg.query(
      "select id, relevance_status, effective_from, effective_to from public.quality_stakeholder_assessments where organization_id=$1 order by id",
      [A.org]);
    await db.setExternalPartyStatus(A.org, idOriginal, "retired", A.cli);
    const { rows: despues } = await pg.query(
      "select id, relevance_status, effective_from, effective_to from public.quality_stakeholder_assessments where organization_id=$1 order by id",
      [A.org]);
    assert(JSON.stringify(antes) === JSON.stringify(despues),
      "retirar reescribió un análisis");
    await db.setExternalPartyStatus(A.org, idOriginal, "active", A.cli);
  });

  await check("14. Y la base sigue impidiendo BORRAR lo que ya se usó", async () => {
    const { error } = await A.cli.from("quality_external_parties").delete().eq("id", idOriginal);
    assert(Boolean(error), "se borró una identidad que ya tiene análisis");
    assert(String(error?.code) === "23503", `código: ${error?.code}`);
  });

  // =========================================================================
  console.log("\nD · El buscador de identidades");
  // =========================================================================

  await check("15. Encuentra una parte SIN análisis", async () => {
    const nombre = `Alcaldia Sin Analisis ${sello}`;
    const r = await db.createExternalParty(A.org, { legalName: nombre }, A.cli);
    assert(r.ok, JSON.stringify(r));
    const filas = await db.searchIdentities(A.org, { q: "Alcaldia Sin" }, A.cli);
    assert(filas.some((f) => f.name === nombre && !f.hasAssessment),
      "una identidad sin análisis siguió siendo invisible");
  });

  await check("16. Y un colectivo SIN análisis", async () => {
    const filas = await db.searchIdentities(A.org, { q: "Comunidad" }, A.cli);
    assert(filas.some((f) => f.kind === "group"), "el colectivo no apareció");
  });

  await check("17. Insensible a mayúsculas y a acentos · Fundación Ñandú", async () => {
    const nombre = `Fundación Ñandú ${sello}`;
    const r = await db.createExternalParty(A.org, { legalName: nombre }, A.cli);
    assert(r.ok, JSON.stringify(r));
    // La expectativa de cada variante, dicha antes de comprobarla: las cinco
    // encuentran, porque la comparación va contra el nombre normalizado.
    for (const q of ["Fundación Ñandú", "fundación ñandú", "fundacion nandu",
                     "NANDU", "ñandú"]) {
      const filas = await db.searchIdentities(A.org, { q }, A.cli);
      assert(filas.some((f) => f.name === nombre), `«${q}» no encontró la fundación`);
    }
  });

  await check("18. `%` y `_` no ensanchan la búsqueda", async () => {
    assert(terminoDeBusqueda("50%") === "50\\%", `escape: ${terminoDeBusqueda("50%")}`);
    const todas = await db.searchIdentities(A.org, { q: "a" }, A.cli);
    assert(todas.length > 0, "el fixture no tiene identidades con «a»");
    const comodin = await db.searchIdentities(A.org, { q: "%" }, A.cli);
    assert(comodin.length === 0, `«%» devolvió ${comodin.length} identidades`);
    const guion = await db.searchIdentities(A.org, { q: "_" }, A.cli);
    assert(guion.length === 0, `«_» devolvió ${guion.length} identidades`);
  });

  await check("19. Las retiradas se pueden ver, pero no por omisión", async () => {
    await db.setExternalPartyStatus(A.org, idOriginal, "retired", A.cli);
    const sin = await db.searchIdentities(A.org, { q: "Empresa ABC" }, A.cli);
    assert(!sin.some((f) => f.id === idOriginal), "una retirada apareció sin pedirlo");
    const con = await db.searchIdentities(A.org, { q: "Empresa ABC", includeRetired: true }, A.cli);
    assert(con.some((f) => f.id === idOriginal && f.status === "retired"),
      "no se pudo ver la retirada ni pidiéndolo");
    await db.setExternalPartyStatus(A.org, idOriginal, "active", A.cli);
  });

  await check("20. Y el listado de análisis sigue funcionando · no se rompió nada", async () => {
    const r = await db.searchAssessments(A.org, { q: "Empresa ABC" }, A.cli);
    assert(r.total >= 1, `el listado de análisis devolvió ${r.total}`);
    const lista = leer("components/domain/quality/interested-parties/parties-list.tsx");
    assert(lista.includes("Buscar en los análisis"),
      "la etiqueta del listado sigue prometiendo buscar partes");
  });

  // =========================================================================
  console.log("\nE · Inquilino");
  // =========================================================================

  await check("21. A no ve las identidades de B", async () => {
    const desdeA = await db.searchIdentities(A.org, { q: "STAB03" }, A.cli);
    const { rows: deB } = await pg.query(
      "select id from public.quality_external_parties where organization_id=$1", [B.org]);
    const idsB = new Set((deB as { id: string }[]).map((r) => r.id));
    assert(!desdeA.some((f) => idsB.has(f.id)), "A vio una identidad de B");
    // Y pidiéndolo por el identificador de B tampoco.
    const cruzada = await db.searchIdentities(B.org, { q: "Empresa ABC" }, A.cli);
    assert(cruzada.length === 0, "A leyó identidades de B pasando su organización");
  });

  await check("22. A no puede retirar ni reactivar una identidad de B", async () => {
    const { rows } = await pg.query(
      "select id from public.quality_external_parties where organization_id=$1 limit 1", [B.org]);
    const idB = rows[0].id;
    const r = await db.setExternalPartyStatus(B.org, idB, "retired", A.cli);
    assert(!r.ok, "A retiró una identidad de B");
    const r2 = await db.setExternalPartyStatus(A.org, idB, "retired", A.cli);
    assert(!r2.ok, "A retiró una identidad de B diciendo que era suya");
    const { rows: sigue } = await pg.query(
      "select status from public.quality_external_parties where id=$1", [idB]);
    assert(sigue[0].status === "active", `la identidad de B quedó en ${sigue[0].status}`);
  });

  await check("23. Nadie puede escribir su propia normalización", async () => {
    // Ni el inquilino, ni el rol de servicio, ni el propietario: el disparador
    // recalcula siempre y descarta lo que venga de fuera. Es lo que impide
    // esquivar la unicidad mandando una normalización que no colisiona.
    const nombre = `Colision Forzada ${sello}`;
    const r = await db.createExternalParty(A.org, { legalName: nombre }, A.cli);
    assert(r.ok, JSON.stringify(r));
    await admin.from("quality_external_parties")
      .update({ normalized_name: "algo-que-no-colisiona" })
      .eq("id", (r as { data: string }).data);
    const { rows } = await pg.query(
      "select normalized_name from public.quality_external_parties where id=$1",
      [(r as { data: string }).data]);
    assert(rows[0].normalized_name === normalizarIdentidad(nombre),
      `service_role dejó ${rows[0].normalized_name}`);
    // Y como propietario tampoco.
    await pg.query("update public.quality_external_parties set normalized_name='trampa' where id=$1",
      [(r as { data: string }).data]);
    const { rows: r2 } = await pg.query(
      "select normalized_name from public.quality_external_parties where id=$1",
      [(r as { data: string }).data]);
    assert(r2[0].normalized_name === normalizarIdentidad(nombre),
      `el propietario dejó ${r2[0].normalized_name}`);
  });

  await check("24. Renombrar recalcula la identidad y choca si colisiona", async () => {
    const { rows } = await pg.query(
      `select id from public.quality_external_parties
        where organization_id=$1 and normalized_name=$2`, [A.org, normalizarIdentidad(NOMBRE)]);
    const otro = await db.createExternalParty(A.org, { legalName: `Renombrable ${sello}` }, A.cli);
    assert(otro.ok, JSON.stringify(otro));
    // Renombrar a algo libre: la identidad se recalcula sola.
    await pg.query("update public.quality_external_parties set legal_name=$2 where id=$1",
      [(otro as { data: string }).data, `  RENOMBRADA  Ñ ${sello}  `]);
    const { rows: tras } = await pg.query(
      "select normalized_name from public.quality_external_parties where id=$1",
      [(otro as { data: string }).data]);
    assert(tras[0].normalized_name === normalizarIdentidad(`  RENOMBRADA  Ñ ${sello}  `),
      `quedó ${tras[0].normalized_name}`);
    // Y renombrar encima de otra identidad no se puede.
    let choco = false;
    try {
      await pg.query("update public.quality_external_parties set legal_name=$2 where id=$1",
        [(otro as { data: string }).data, NOMBRE.toLowerCase()]);
    } catch (e) { choco = String((e as Error).message).includes("quality_external_parties_org_name_uniq"); }
    assert(choco, "se pudo renombrar una identidad encima de otra");
    assert(rows.length === 1, "el fixture perdió la identidad original");
  });

  // =========================================================================
  console.log("\nF · La migración y el preflight");
  // =========================================================================

  await check("25. El preflight lee sin exponer datos, y solo para plataforma", async () => {
    const { rows } = await pg.query(
      `select pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='quality_identity_duplicates'`);
    const def = String(rows[0].d);
    assert(def.includes("is_platform_staff()"), "el preflight no filtra por plataforma");
    for (const campo of ["tax_id", "legal_name,", "website", "notes", "city"]) {
      assert(!def.includes(campo), `el preflight expone ${campo}`);
    }
    const { error } = await A.cli.rpc("quality_identity_duplicates");
    assert(Boolean(error), "un inquilino pudo ejecutar el preflight");
  });

  await check("26. La migración ABORTA si encuentra identidades en colisión", async () => {
    const sql = leer("supabase/migrations/0188_stakeholder_identity_normalization.sql");
    assert(sql.includes("STAKEHOLDER_IDENTITY_DUPLICATES_PRESENT"),
      "no aborta ante duplicados preexistentes");
    // Y se ejecuta de verdad: se fabrica una colisión saltándose el disparador
    // y se comprueba que el bloque de preflight la ve.
    await pg.query("begin");
    await pg.query("alter table public.quality_external_parties disable trigger quality_external_party_normalize_trg");
    await pg.query("alter table public.quality_external_parties drop constraint if exists quality_external_parties_org_name_uniq");
    await pg.query("drop index if exists public.quality_external_parties_org_name_uniq");
    await pg.query(
      `insert into public.quality_external_parties (organization_id, legal_name, normalized_name, status)
       values ($1, $2, $3, 'active')`,
      [A.org, `EMPRESA ABC ${sello}`, "colision-fabricada"]);
    const { rows } = await pg.query(
      `select count(*)::int n from (
         select organization_id, public.quality_normalized_identity(legal_name) as x
           from public.quality_external_parties group by 1,2 having count(*)>1) d`);
    assert(rows[0].n >= 1, "no se pudo fabricar la colisión: la prueba no demuestra nada");
    await pg.query("rollback");
    // Y todo vuelve a su sitio.
    const { rows: idx } = await pg.query(
      `select count(*)::int n from pg_indexes where schemaname='public'
        and indexname='quality_external_parties_org_name_uniq'`);
    assert(idx[0].n === 1, "el índice único no volvió tras el ensayo");
  });

  await check("27. Las filas históricas sobrevivieron intactas al relleno", async () => {
    const { rows } = await pg.query(
      `select count(*)::int n from public.quality_external_parties
        where normalized_name is distinct from public.quality_normalized_identity(legal_name)`);
    assert(rows[0].n === 0, `${rows[0].n} filas con la identidad desincronizada`);
    const { rows: g } = await pg.query(
      `select count(*)::int n from public.quality_stakeholder_groups
        where normalized_name is distinct from public.quality_normalized_identity(name)`);
    assert(g[0].n === 0, `${g[0].n} colectivos con la identidad desincronizada`);
  });

  await check("28. La interfaz ofrece RETIRAR, no eliminar", () => {
    const acciones = leerCodigo("server/actions/quality-interested-parties.ts");
    assert(acciones.includes("retireExternalPartyAction")
      && acciones.includes("reactivateExternalPartyAction"),
      "no existen las acciones de retirar y reactivar");
    assert(!/deleteExternalParty|eliminarParte/.test(acciones),
      "apareció una acción de borrado físico");
    const panel = leerCodigo("components/domain/quality/interested-parties/new-party-panel.tsx");
    assert(panel.includes("IdentityFinder"),
      "el panel de alta no ofrece buscar antes de crear");
  });

  // ---- Limpieza ----------------------------------------------------------
  //
  // Y COMPROBADA, no supuesta. Es el defecto que dejaron `mp0184` y `mp0185`:
  // su limpieza fallaba en silencio, la suite decía verde y la base se llenaba
  // de fixtures que acabaron rompiendo otra prueba tres tramos después. Aquí
  // cada borrado va con su punto de retorno, y al final se CUENTA lo que queda:
  // si sobrevive algo, esta suite se pone roja por su propia basura.
  // TEST-HYGIENE-04 · Aquí había una COPIA A MANO del barrido por claves
  // ajenas, con `catch {}` en cada borrado. Contra Local funcionaba; contra
  // Staging dejó dos organizaciones y dos usuarios, y no dijo por qué: los
  // errores se tragaban sin registrarlos y la postcondición solo contaba filas.
  // Una limpieza que falla sin explicarse es la que ya costó tres tramos.
  //
  // Ahora usa el ayudante común, que es el mismo código en los dos entornos y
  // DEVUELVE lo que no pudo hacer. Y las personas van por su primitiva, que
  // borra lo que es suyo y después comprueba que se fueron.
  // Una sola llamada: `limpiarFixtures` ya se lleva las organizaciones Y las
  // personas, en ese orden, que es el único que funciona. Llamar además a
  // `limpiarPersonas` con la misma lista hacía que la segunda pasada intentara
  // borrar a quien ya no estaba y lo reportara como problema: la limpieza era
  // correcta y el informe decía que no.
  const residuo = await limpiarFixtures(pg, admin, { orgs, personas });

  await check("29. La suite no deja un solo fixture detrás", async () => {
    const { rows: p } = await pg.query(
      `select count(*)::int n from public.quality_external_parties
        where organization_id = any($1::uuid[])`, [orgs]);
    const { rows: g } = await pg.query(
      `select count(*)::int n from public.quality_stakeholder_groups
        where organization_id = any($1::uuid[])`, [orgs]);
    assert(residuo.problemas.length === 0,
      `la limpieza informó de: ${residuo.problemas.join(" · ")}`);
    assert(residuo.organizaciones === 0 && residuo.personas === 0
      && Object.keys(residuo.porTabla).length === 0,
      `quedaron fixtures: ${describirResiduo(residuo)}`);
    assert(p[0].n === 0, `quedaron ${p[0].n} partes externas`);
    assert(g[0].n === 0, `quedaron ${g[0].n} colectivos`);
  });

  await pg.end();

  console.log(`\nSTABILIZATION-03 · identidad: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
