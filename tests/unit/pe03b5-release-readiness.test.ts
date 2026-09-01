/**
 * Trazaloop · PE-03B5 · Lo que tiene que estar en pie para cerrar PE-03.
 *
 *
 * QUÉ COMPRUEBA UNA SUITE DE «CIERRE»
 *
 * No comprueba funcionalidad: eso lo hacen las otras. Comprueba que lo que se
 * decidió sigue decidido, que lo que se aplazó está ESCRITO donde alguien lo
 * va a leer, y que nada de lo que este tramo deja pendiente se ha convertido en
 * un olvido silencioso.
 *
 * En particular: `qa-a` sigue activo A PROPÓSITO y su retirada se movió al
 * corte de producción. Un pendiente que solo vive en la cabeza de quien lo
 * decidió no es un pendiente: es una bomba de relojería. Aquí se comprueba que
 * está en el papel.
 *
 * Correr: npm run test:pe03b5-release
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const D = "docs/platform-experience/";

console.log("\nPE-03B5 · Listo para cerrar\n");

// ===========================================================================
console.log("A · Los documentos de cierre existen y dicen lo que tienen que decir");
// ===========================================================================

const CIERRE = [
  "PE_03B5_FINAL_COVERAGE.md", "PE_03B5_QA_RESIDUE_AUDIT.md", "PE_03B5_HARDENING.md",
  "PE_03B5_INTEGRATED_ACCEPTANCE.md", "PE_03B5_TUTORIAL_ROLLOUT_PLAN.md",
  "PE_03B5_WELCOME_VIDEO_BRIEF.md", "PE_03_FINAL_CLOSURE.md",
  "PE_03_PRODUCTION_CUTOVER_CARRYOVERS.md",
];

check("A1. Los ocho documentos de cierre existen", () => {
  const faltan = CIERRE.filter((f) => !existsSync(D + f));
  assert(faltan.length === 0, `faltan: ${faltan.join(", ")}`);
});

check("A2. Y ninguno está vacío ni es un esqueleto", () => {
  for (const f of CIERRE) {
    const texto = leer(D + f);
    assert(texto.length > 1500, `${f} tiene ${texto.length} caracteres: es un esqueleto`);
    assert(/^# /m.test(texto), `${f} no tiene título`);
    // Los marcadores se buscan en MAYÚSCULAS y como palabra suelta: «todos»
    // contiene «TODO» y castellano tiene muchos «todos».
    assert(!/\b(TODO|TBD|XXX|FIXME)\b/.test(texto) && !/pendiente de escribir/i.test(texto),
      `${f} tiene marcadores sin rellenar`);
  }
});

check("A3. Los enlaces internos de la documentación apuntan a algo", () => {
  const rotos: string[] = [];
  for (const f of readdirSync(D).filter((x) => x.endsWith(".md"))) {
    for (const m of leer(D + f).matchAll(/\]\(([A-Za-z0-9_./-]+\.md)\)/g)) {
      if (!existsSync(D + m[1])) rotos.push(`${f} → ${m[1]}`);
    }
  }
  assert(rotos.length === 0, `enlaces rotos: ${rotos.join(", ")}`);
});

// ===========================================================================
console.log("\nB · Lo aplazado está escrito donde se va a leer");
// ===========================================================================

const CARRYOVER = leer(D + "PE_03_PRODUCTION_CUTOVER_CARRYOVERS.md");
const CIERRE_PE03 = leer(D + "PE_03_FINAL_CLOSURE.md");
const ESTADO = leer(D + "PE_STATUS.md");

check("B1. La retirada de qa-a es un CARRYOVER DE CORTE, no un pendiente de PE-03", () => {
  assert(/qa-a@trazaloop-staging\.local/.test(CARRYOVER),
    "el documento de corte no nombra la cuenta");
  assert(/corte|cutover/i.test(CARRYOVER), "el documento no se presenta como de corte");
  assert(/PE-06/.test(CARRYOVER),
    "no se dice en qué lista de verificación de publicación tiene que aparecer");
});

check("B2. Y el cierre de PE-03 dice que NO lo bloquea", () => {
  assert(/qa-a/.test(CIERRE_PE03), "el cierre no menciona la cuenta");
  assert(/no.{0,40}(bloquea|bloqueante)/i.test(CIERRE_PE03),
    "el cierre no aclara que la retirada no bloquea PE-03");
});

check("B3. El estado general recoge el aplazamiento", () => {
  assert(/qa-a/.test(ESTADO), "PE_STATUS no menciona qa-a");
  assert(/corte de producci[óo]n|cutover/i.test(ESTADO),
    "PE_STATUS no dice a dónde se aplazó");
});

check("B4. Y los tres pendientes que NO son bloqueantes están nombrados", () => {
  for (const pendiente of [/editorial|grabar/i, /subt[íi]tulo/i, /qa-a/]) {
    assert(pendiente.test(CIERRE_PE03),
      `el cierre no nombra un pendiente: ${pendiente}`);
  }
});

// ===========================================================================
console.log("\nC · El cierre no promete lo que no se verificó");
// ===========================================================================

check("C1. La capacidad del proveedor se presenta como infraestructura", () => {
  const cobertura = leer(D + "PE_03B5_HARDENING.md");
  if (!/48[.,]8|52428800000/.test(cobertura)) return;   // si no se nombra, nada que comprobar
  const i = cobertura.search(/48[.,]8|52428800000/);
  const contexto = cobertura.slice(Math.max(0, i - 400), i + 400);
  assert(/infraestructura|proveedor|observad|no es (un )?(l[íi]mite|regla|contrato) de trazaloop/i
    .test(contexto),
    "se da la capacidad del proveedor sin decir que no es una promesa del producto");
});

check("C2. Y lo que no se pudo verificar contra Staging se dice", () => {
  const residuos = leer(D + "PE_03B5_QA_RESIDUE_AUDIT.md");
  assert(/credencial/i.test(residuos),
    "el informe de residuos no explica qué no se pudo mirar y por qué");
});

// ===========================================================================
console.log("\nD · El plan editorial es un plan, no una entrega");
// ===========================================================================

check("D1. La recomendación de primera ola nombra los tres módulos", () => {
  const plan = leer(D + "PE_03B5_TUTORIAL_ROLLOUT_PLAN.md");
  for (const m of ["Quality", "PCR", "Textiles"]) {
    assert(new RegExp(m).test(plan), `el plan no cubre ${m}`);
  }
  // Entre ocho y doce, que es lo que se pidió.
  const filas = (plan.match(/^\|\s*\d+\s*\|/gm) ?? []).length;
  assert(filas >= 8 && filas <= 14,
    `el plan propone ${filas} tutoriales y se pidieron entre 8 y 12`);
});

check("D2. Y no se subió ningún vídeo · el plan es solo un plan", () => {
  const plan = leer(D + "PE_03B5_TUTORIAL_ROLLOUT_PLAN.md");
  assert(!/\.mp4|\.webm/.test(plan.replace(/`[^`]*`/g, "")),
    "el plan referencia archivos de vídeo");
});

check("D3. El guion de la bienvenida dice qué NO incluir", () => {
  const brief = leer(D + "PE_03B5_WELCOME_VIDEO_BRIEF.md");
  assert(/qu[ée] no|no incluir|fuera de/i.test(brief),
    "el guion no dice qué dejar fuera");
  assert(/duraci[óo]n/i.test(brief), "el guion no recomienda una duración");
});

// ===========================================================================
console.log("\nE · Producción sigue donde estaba");
// ===========================================================================

check("E1. Ninguna migración nueva por encima de 0161", () => {
  const migraciones = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql")).map((f) => f.slice(0, 4)).sort();
  const cabecera = migraciones[migraciones.length - 1];
  assert(cabecera === "0161", `la cabecera es ${cabecera} y se esperaba 0161`);
});

check("E2. Y el estado declara las tres cabeceras", () => {
  assert(/\| Local \| \*\*0161\*\* \|/.test(ESTADO), "PE_STATUS no dice Local 0161");
  assert(/\| Staging \| \*\*0161\*\* \|/.test(ESTADO), "PE_STATUS no dice Staging 0161");
  assert(/\| Producción \| \*\*0111\*\* \|/.test(ESTADO), "PE_STATUS no dice Producción 0111");
});

// ===========================================================================
console.log("\nF · PE-04 no se ha colado");
// ===========================================================================

check("F1. Ninguna migración de tutoriales conoce planes ni cuotas", () => {
  for (const f of ["0159_platform_tutorial_media_foundation.sql",
    "0160_platform_tutorial_unbounded_media.sql", "0161_user_product_preferences.sql"]) {
    const sql = leer(`supabase/migrations/${f}`).replace(/^\s*--.*$/gm, "");
    for (const rastro of ["plan_code", "organization_modules", "storage_limit",
      "entitlement", "coupon"]) {
      assert(!new RegExp(rastro, "i").test(sql), `${f} toca «${rastro}»`);
    }
  }
});

check("F2. Y el cierre no compromete nada de PE-04", () => {
  assert(!/PE-04[^\n]{0,60}(empieza|se inicia|comienza)/i.test(CIERRE_PE03),
    "el cierre de PE-03 arranca PE-04");
});

console.log(`\nPE-03B5 · cierre: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
