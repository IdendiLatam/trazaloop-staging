/**
 * Trazaloop · QUALITY-12.2D · ¿Está el fixture listo para la prueba humana?
 *
 * POR QUÉ EXISTE
 *
 * Porque en la primera validación humana de 12.2D dos de las tres pruebas
 * fallaron y ninguna de las dos era un defecto del código: faltaban relaciones
 * en los datos. Un cargo que no existía y una relación documento↔proceso que
 * no se había creado.
 *
 * Lo caro no fue el fallo: fue que la pantalla decía lo mismo —«no encontré
 * registros relacionados»— tanto si falta una relación como si la sección no
 * se contrasta con nada. Sin este comprobador, la única forma de saber cuál de
 * las dos era es leer la base.
 *
 * CÓMO SE USA
 *
 *   npx tsx scripts/check-12-2d-fixture.ts "<nombre de la empresa>"
 *
 * Lee con las variables de entorno que haya configuradas —`.env.local`—, así
 * que apunta a la base que apunte ese archivo. Solo LEE: no crea nada, no
 * modifica nada, y no sirve para preparar el fixture, solo para saber si lo
 * está.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const db = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CARGO_DUENO = "Coordinador de Compras";
const CARGO_ESCRITO = "Coordinador de Calidad";
const PROCESO = "Gestión de compras";

let faltan = 0;
const ok = (n: string, extra = "") => console.log(`  ✔ ${n}${extra ? ` · ${extra}` : ""}`);
const no = (n: string, comoArreglarlo: string) => {
  faltan += 1;
  console.log(`  ✘ ${n}\n      → ${comoArreglarlo}`);
};

async function main() {
  const nombre = process.argv[2];
  if (!nombre) {
    console.error('Uso: npx tsx scripts/check-12-2d-fixture.ts "<nombre de la empresa>"');
    process.exit(1);
  }

  const { data: orgs } = await db.from("organizations").select("id, name").ilike("name", `%${nombre}%`);
  if (!orgs || orgs.length === 0) {
    console.error(`No hay ninguna empresa cuyo nombre contenga «${nombre}».`);
    process.exit(1);
  }
  if (orgs.length > 1) {
    console.error("Hay varias empresas con ese nombre; concreta más:");
    for (const o of orgs) console.error(`  · ${o.name}`);
    process.exit(1);
  }
  const org = orgs[0].id as string;
  console.log(`\nEmpresa: ${orgs[0].name}\n`);

  // ---- A · los dos cargos, con nombre exacto -----------------------------
  const { data: cargos } = await db.from("quality_positions")
    .select("id, name, is_active").eq("organization_id", org);
  const busca = (n: string) =>
    (cargos ?? []).find((c) => String(c.name).trim().toLowerCase() === n.toLowerCase());
  const dueno = busca(CARGO_DUENO);
  const escrito = busca(CARGO_ESCRITO);

  dueno
    ? ok(`cargo «${CARGO_DUENO}»`, dueno.is_active ? "activo" : "INACTIVO")
    : no(`cargo «${CARGO_DUENO}»`, "Calidad › Personas › Cargos → créalo con ese nombre exacto.");
  escrito
    ? ok(`cargo «${CARGO_ESCRITO}»`, escrito.is_active ? "activo" : "INACTIVO")
    : no(`cargo «${CARGO_ESCRITO}»`,
        "Calidad › Personas › Cargos → créalo. Sin él la discrepancia NO puede "
        + "confirmarse: solo se confirma cuando los DOS cargos están registrados, "
        + "y el resultado se queda —correctamente— en «podría no coincidir».");

  // ---- B · el proceso y su dueño -----------------------------------------
  const { data: procesos } = await db.from("quality_processes")
    .select("id, name, owner_position_id").eq("organization_id", org);
  const proc = (procesos ?? []).find(
    (p) => String(p.name).trim().toLowerCase() === PROCESO.toLowerCase());
  if (!proc) {
    no(`proceso «${PROCESO}»`, "Calidad › Procesos → créalo con ese nombre exacto.");
  } else {
    ok(`proceso «${PROCESO}»`);
    proc.owner_position_id === dueno?.id
      ? ok(`  su cargo dueño es «${CARGO_DUENO}»`)
      : no(`  el cargo dueño del proceso NO es «${CARGO_DUENO}»`,
          "Calidad › Procesos › Gestión de compras → cambia el cargo dueño. "
          + "Es lo único que da un cargo a un documento de PCR.");

    const { data: revs } = await db.from("quality_process_revisions")
      .select("revision_number, status").eq("organization_id", org)
      .eq("process_id", proc.id).is("effective_to", null).eq("status", "published");
    (revs ?? []).length > 0
      ? ok("  tiene revisión publicada vigente")
      : no("  el proceso NO tiene revisión publicada vigente",
          "Publica su revisión. Sin ella el contexto pierde el propósito del "
          + "proceso, aunque la prueba puede pasar igual.");
  }

  // ---- C · los dos documentos --------------------------------------------
  const { data: docs } = await db.from("trazadoc_documents")
    .select("id, title, code, module_key, blueprint_id, owner_position_id, status")
    .eq("organization_id", org).in("module_key", ["quality", "cpr"]);

  const quality = (docs ?? []).filter((d) => d.module_key === "quality"
    && d.owner_position_id === dueno?.id);
  quality.length > 0
    ? ok(`documento de Quality con responsable «${CARGO_DUENO}»`,
        quality.map((d) => d.title).join(", "))
    : no("ningún documento de Quality tiene ese cargo responsable",
        "Calidad › Documentos → abre el documento y fija «Cargo responsable» = "
        + `«${CARGO_DUENO}».`);

  for (const d of quality) {
    const { data: secs } = await db.from("trazadoc_document_sections")
      .select("section_key").eq("organization_id", org).eq("document_id", d.id);
    (secs ?? []).some((s) => s.section_key === "responsibilities")
      ? ok(`  «${d.title}» tiene sección con papel Responsabilidades`)
      : no(`  «${d.title}» no tiene sección con papel Responsabilidades`,
          "Añádele una sección con ese papel.");
  }

  // ---- D · el documento de PCR y su relación con el proceso --------------
  const { data: bp } = await db.from("trazadoc_blueprints")
    .select("id").eq("code", "procedimiento_produccion").maybeSingle();
  const pcr = (docs ?? []).filter((d) => d.module_key === "cpr"
    && (!bp || d.blueprint_id === bp.id));
  if (pcr.length === 0) {
    no("ningún documento de PCR de la estructura `procedimiento_produccion`",
      "TrazaDocs › PCR → créalo desde esa estructura.");
  } else {
    ok("documento de PCR de `procedimiento_produccion`",
      pcr.map((d) => d.code ?? d.title).join(", "));

    let algunoLigado = false;
    for (const d of pcr) {
      const { data: rel } = await db.from("quality_process_documents")
        .select("process_id").eq("organization_id", org).eq("document_id", d.id);
      const ligadoAlProceso = (rel ?? []).some((r) => r.process_id === proc?.id);
      if (ligadoAlProceso) algunoLigado = true;

      const { data: secs } = await db.from("trazadoc_document_sections")
        .select("section_key").eq("organization_id", org).eq("document_id", d.id);
      const tieneSeccion = (secs ?? []).some((s) => s.section_key === "responsables");

      console.log(`      · «${d.code ?? d.title}»: `
        + `${(rel ?? []).length} relación(es) con procesos`
        + `${ligadoAlProceso ? ` (incluye «${PROCESO}») ✔` : " ✘"}`
        + ` · sección Responsables ${tieneSeccion ? "✔" : "✘"}`);
    }
    algunoLigado
      ? ok(`  hay un documento de PCR ligado a «${PROCESO}»`)
      : no(`  NINGÚN documento de PCR está ligado a «${PROCESO}»`,
          "Calidad › Procesos › Gestión de compras › Documentos → «Asociar "
          + "documento de TrazaDocs» y elige el de PCR. **Esta es la relación "
          + "que faltaba en la primera validación**: sin ella la revisión no "
          + "tiene nada que buscar y responde sin llamar al modelo.");
  }

  // ---- E · el plan del módulo --------------------------------------------
  const { data: mods } = await db.from("organization_modules")
    .select("module_code, enabled, access_mode")
    .eq("organization_id", org).in("module_code", ["quality", "traceability_6632"]);
  for (const m of mods ?? []) {
    const bien = m.enabled && ["full", "extra"].includes(String(m.access_mode));
    bien
      ? ok(`módulo ${m.module_code}`, String(m.access_mode))
      : no(`módulo ${m.module_code} está en «${m.access_mode}»`,
          "La revisión contextual necesita Full o Extra.");
  }

  console.log(faltan === 0
    ? "\nFixture LISTO para las pruebas humanas.\n"
    : `\n${faltan} cosa(s) por preparar antes de la prueba humana.\n`);
  process.exit(faltan === 0 ? 0 : 1);
}

void main();
