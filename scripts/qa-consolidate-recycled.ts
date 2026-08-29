/**
 * Trazaloop · 0147 · Limpieza de los cálculos QA de contenido reciclado.
 *
 * POR QUÉ ESTO NO ES UNA MIGRACIÓN
 *
 * Porque borra DATOS, y una migración se ejecuta en todos los entornos. Una
 * limpieza de fixtures escrita como migración es una bomba con temporizador:
 * el día que Production la ejecute, borrará lo que encuentre.
 *
 * 0147 consolida el ESQUEMA y es segura en una base sin estos datos. Esto de
 * aquí toca las FILAS, corre a mano, contra un entorno que se nombra, y sabe
 * decir que no.
 *
 *
 * QUÉ BORRA, Y POR QUÉ SE PUEDE
 *
 * Los cálculos de contenido reciclado emitidos antes de la consolidación en
 * organizaciones de QA. Se comprobó, empresa por empresa, que ninguna es real:
 * Production sigue en 0111 y nunca recibió la convivencia de metodologías, así
 * que no existe un cálculo empresarial que preservar. Lo que hay son fixtures
 * de suites automáticas y las dos empresas creadas para la validación humana.
 *
 *
 * LAS TRES BARRERAS, EN ESTE ORDEN
 *
 *   1 · El entorno se nombra en la orden. Sin `--project-ref`, no corre.
 *   2 · Production está prohibida por referencia, no por convención.
 *   3 * Cuenta y ENSEÑA lo que va a borrar, empresa por empresa, y exige
 *       `--apply`. Sin él solo mira.
 *
 * Y una cuarta que no es una barrera sino una consecuencia: solo borra filas
 * de organizaciones que el propio guion ha clasificado como QA. Si aparece una
 * que no encaja en ningún patrón conocido, se DETIENE. No borra «lo demás».
 *
 *   npx tsx scripts/qa-consolidate-recycled.ts --project-ref=<ref>
 *   npx tsx scripts/qa-consolidate-recycled.ts --project-ref=<ref> --apply
 *
 * Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno. No los
 * busca en ningún fichero ni los imprime.
 */
import { createClient } from "@supabase/supabase-js";

const REF_PROHIBIDAS = new Set<string>([
  // Production. Nombrada para que la prohibición no dependa de acordarse.
  "mvmpadeixomwkpxbnhky",
]);

/**
 * Los patrones de nombre con los que las suites y la preparación de QA crean
 * sus empresas. Deliberadamente estrictos: una empresa que no encaje detiene
 * el guion en vez de caer en un «resto».
 */
const PATRONES_QA: RegExp[] = [
  /^Q\d/i,                       // Q01 Org A 178…, Q012 UI …, Q111 B …
  /^QA\b/i,                      // QA Empresa A, QA PT PCR, QA Staging · …
  /^PT\d/i,                      // PT01 A …, PT02A …, PT02B …
  /^Org [AB] \d/i,               // fixtures de isolation
  /^Probe /i,
  /^RETIRADA · /i,
  /^Trazaloop QA Permanente/i,
  /^QUALITY-\d/i,
];

function esQA(nombre: string): boolean {
  return PATRONES_QA.some((r) => r.test(nombre.trim()));
}

function arg(nombre: string): string | null {
  const p = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return p ? p.slice(nombre.length + 3) : null;
}

async function main() {
  const ref = arg("project-ref");
  const aplicar = process.argv.includes("--apply");

  if (!ref) {
    console.error("BLOQUEADO: falta --project-ref=<ref>. El entorno se nombra, no se adivina.");
    process.exit(2);
  }
  if (REF_PROHIBIDAS.has(ref)) {
    console.error(`BLOQUEADO: ${ref} es Production. Este guion no toca Production.`);
    process.exit(2);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("BLOQUEADO: faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
    process.exit(2);
  }
  if (!url.includes(ref)) {
    console.error("BLOQUEADO: la URL del entorno no corresponde al --project-ref indicado.");
    process.exit(2);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: orgs, error: eOrgs } = await db
    .from("organizations").select("id, name").order("name");
  if (eOrgs) throw new Error(`no se pudo leer organizations: ${eOrgs.message}`);

  const noQA = (orgs ?? []).filter((o) => !esQA(String(o.name)));
  if (noQA.length > 0) {
    console.error("DETENIDO: hay organizaciones que este guion no reconoce como QA.");
    for (const o of noQA) console.error(`   · ${o.name}`);
    console.error("\nNo se borra nada. Clasifícalas antes de continuar.");
    process.exit(1);
  }

  const idsQA = new Set((orgs ?? []).map((o) => String(o.id)));
  const nombrePorId = new Map((orgs ?? []).map((o) => [String(o.id), String(o.name)]));

  const { data: calcs, error: eCalc } = await db
    .from("recycled_content_calculations")
    .select("id, organization_id, methodology_version, result_state, calculated_at");
  if (eCalc) throw new Error(`no se pudo leer los cálculos: ${eCalc.message}`);

  const aBorrar = (calcs ?? []).filter((c) => idsQA.has(String(c.organization_id)));
  const intrusos = (calcs ?? []).length - aBorrar.length;
  if (intrusos > 0) {
    console.error(`DETENIDO: ${intrusos} cálculo(s) fuera de las organizaciones QA. No se borra nada.`);
    process.exit(1);
  }

  const porOrg = new Map<string, number>();
  for (const c of aBorrar) {
    const k = nombrePorId.get(String(c.organization_id)) ?? String(c.organization_id);
    porOrg.set(k, (porOrg.get(k) ?? 0) + 1);
  }

  console.log(`\nEntorno: ${ref}`);
  console.log(`Organizaciones: ${(orgs ?? []).length}, todas clasificadas como QA.`);
  console.log(`Cálculos de contenido reciclado: ${aBorrar.length}`);
  for (const [nombre, n] of [...porOrg].sort()) console.log(`   · ${nombre}: ${n}`);

  if (!aplicar) {
    console.log("\nSIMULACIÓN. Nada se ha borrado. Añade --apply para ejecutar.\n");
    return;
  }

  // `recycled_content_calculations` lleva un disparador que PROHÍBE el DELETE
  // (PT-H01: un cálculo emitido es inmutable), y ese disparador no distingue
  // roles: la clave de servicio salta la RLS, no los disparadores. Está bien
  // que sea así, y este guion no lo desactiva por su cuenta.
  //
  // Con conexión directa (SUPABASE_DB_URL) se levanta dentro de UNA
  // transacción y se repone en la misma: si algo falla, la transacción
  // deshace el permiso junto con el borrado. Sin ella, el guion imprime lo que
  // hay que ejecutar y no finge haberlo hecho.
  const dbUrl = process.env.SUPABASE_DB_URL;
  const sql =
    "begin;\n" +
    "  alter table recycled_content_calculations disable trigger t_recycled_calc_immutable;\n" +
    "  delete from recycled_content_calculations;\n" +
    "  alter table recycled_content_calculations enable  trigger t_recycled_calc_immutable;\n" +
    "  delete from calculation_methodologies m\n" +
    "   where m.code = 'RC-6632-15343' and m.version = 1\n" +
    "     and not exists (select 1 from recycled_content_calculations c where c.methodology_id = m.id);\n" +
    "commit;";

  if (!dbUrl) {
    console.log(
      "\nSin SUPABASE_DB_URL no hay conexión directa, y por PostgREST el disparador de\n" +
      "inmutabilidad rechaza el borrado —correctamente—. Ejecuta esto contra el entorno:\n\n" +
      sql + "\n"
    );
    return;
  }

  const { Client } = await import("pg");
  const cli = new Client({ connectionString: dbUrl });
  await cli.connect();
  try {
    await cli.query(sql);
    console.log(`\nBorrados ${aBorrar.length} cálculo(s) de fixtures QA.`);
    const { rows } = await cli.query(
      "select version, is_active from calculation_methodologies where code = 'RC-6632-15343' order by version"
    );
    console.log("Metodologías que quedan:", rows.map((r) => `v${r.version}`).join(", ") || "(ninguna)");
  } finally {
    await cli.end();
  }
  console.log("\nHecho.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
