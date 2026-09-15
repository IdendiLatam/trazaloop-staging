/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01G · El informe público, por fuera.
 *
 * Dos cosas, y las dos son donde este tramo se rompería en silencio:
 *
 *   · que la pantalla de resultado NO sabe puntuar —no carga preguntas, no
 *     conoce el motor, no lee la versión— y por tanto no puede mover un
 *     resultado ya entregado; y
 *   · que el valor se entrega ENTERO antes de pedir nada: sin cuenta, sin
 *     pago y sin consentimiento comercial.
 *
 * Y las reglas de presentación, que son puras y tienen que ser honestas: no
 * llamar fortaleza a lo que no lo es.
 *
 * Correr: npm run test:pd01g
 */
import { readFileSync } from "node:fs";
import { READINESS_LABEL, type ReadinessLevel } from "../../lib/diagnostic/scoring";
import {
  parsePublicSnapshot, buildPublicReport, seleccionarDestacadas,
  ordenarBrechas, agruparRecomendaciones, READINESS_EXPLANATION,
  STRENGTH_THRESHOLD, RELATIVE_FLOOR, GAPS_VISIBLE,
  type SnapshotSection, type SnapshotGap,
} from "../../lib/domain/public-diagnostic-report";
import { PUBLIC_RESULT_SCHEMA } from "../../lib/diagnostic/public-result";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");
const sinTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|(^|[^:])\/\/[^\n]*/g, "$1");
const sinSql = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

const PAGINA = sinTs(leer("app/diagnostic/[slug]/result/page.tsx"));
const INFORME = sinTs(leer("components/domain/public-diagnostics/result-report.tsx"));
const REGLAS = sinTs(leer("lib/domain/public-diagnostic-report.ts"));
const DATOS = sinTs(leer("lib/db/public-diagnostic-assessment.ts"));
const SQL = sinSql(leer("supabase/migrations/0201_public_diagnostic_result_and_repeat.sql"));
const CSS = leer("app/globals.css");
const PUERTA = sinTs(leer("app/diagnostic/[slug]/page.tsx"));
const ACCION = sinTs(leer("server/actions/public-diagnostic-intake.ts"));

function cuerpoSql(nombre: string): string {
  const i = SQL.indexOf(`create or replace function public.${nombre}`);
  assert(i > -1, `no existe la función ${nombre}`);
  const j = SQL.indexOf("create or replace function", i + 40);
  return SQL.slice(i, j === -1 ? undefined : j);
}

const seccion = (code: string, title: string, percent: number): SnapshotSection =>
  ({ code, title, percent, answered_yes: 0, total: 10 });

console.log("\nA · El resultado no se recalcula");
// ===========================================================================

check("D/E. La pantalla no conoce el motor, ni las preguntas, ni la versión", () => {
  for (const prohibido of ["computeDiagnosticResult", "getVersionQuestions",
                           "getCurrentDiagnosticVersion", "getPublicAssessment",
                           "scoring_config", "PCR_V1_SCORING", "resolveReadinessLevel"]) {
    assert(!new RegExp(`\\b${prohibido}\\b`).test(PAGINA),
      `la pantalla de resultado usa «${prohibido}»: de ahí a recalcular hay un paso`);
    assert(!new RegExp(`\\b${prohibido}\\b`).test(INFORME),
      `el informe usa «${prohibido}»`);
  }
  // Y las reglas de presentación tampoco puntúan.
  assert(!/computeDiagnosticResult|weight|isCritical/.test(REGLAS),
    "el módulo de presentación toca la puntuación");
  assert(/getPublicResult/.test(PAGINA), "la pantalla no pide la instantánea");
});

check("La lectura de la base devuelve la instantánea y NADA más", () => {
  const cuerpo = cuerpoSql("public_diagnostic_get_result");
  for (const prohibido of ["diagnostic_questions", "diagnostic_versions",
                           "public_diagnostic_answers", "weight", "is_critical"]) {
    assert(!new RegExp(`\\b${prohibido}\\b`).test(cuerpo),
      `la lectura del resultado toca «${prohibido}»`);
  }
  assert(/'result', s\.result_payload/.test(cuerpo),
    "no se devuelve la instantánea tal cual");
  assert(/security definer/.test(cuerpo) && /set search_path to 'public'/.test(cuerpo),
    "la lectura del resultado no está acotada como las demás");
});

check("P/Q. El estado de la campaña no decide si hay resultado", () => {
  const cuerpo = cuerpoSql("public_diagnostic_get_result");
  /*
    Matiz que importa: el estado de la campaña SÍ se mira, pero solo para decir
    si hoy se podría empezar otra participación —`repeat_available`—. Lo que no
    puede hacer es condicionar la ENTREGA del resultado: archivar es una acción
    administrativa sobre el estudio, no una revocación de lo ya entregado.
  */
  const lineas = cuerpo.split("\n")
    .filter((l) => /c\.status|closes_at|opens_at|campaign_status/.test(l));
  assert(lineas.length > 0, "no se calcula si la campaña admitiría repetir");
  const dentroDelSelect = /s\.campaign_status = 'open'/;
  for (const l of lineas) {
    assert(dentroDelSelect.test(l) || /s\.opens_at is null|s\.closes_at is null/.test(l)
        || /c\.status as campaign_status, c\.opens_at, c\.closes_at/.test(l),
      `el estado de la campaña se usa fuera del cálculo de repetición: «${l.trim()}»`);
  }
  // Y en ninguna rama se niega el resultado por el estado de la campaña.
  assert(!/campaign_status[^\n]*then[^\n]*not_found/.test(cuerpo),
    "se niega el resultado por el estado de la campaña");
  assert(!/where[^\n]*c\.status/.test(cuerpo),
    "la búsqueda de la participación filtra por el estado de la campaña");
});

console.log("\nB · Qué se enseña, y qué no");
// ===========================================================================

check("I. Ningún campo interno de puntuación llega a la pantalla", () => {
  for (const prohibido of ["weight", "is_critical", "isCritical", "criticality",
                           "min_percent", "max_critical_gaps", "critical_gaps"]) {
    assert(!new RegExp(`\\b${prohibido}\\b`).test(INFORME),
      `el informe pinta «${prohibido}»`);
  }
});

check("J. Ni más datos personales que la empresa", () => {
  for (const prohibido of ["participantName", "participant_name", "email",
                           "phone", "consent", "token"]) {
    assert(!new RegExp(`\\b${prohibido}\\b`, "i").test(INFORME),
      `el informe maneja «${prohibido}»`);
  }
  assert(/companyName/.test(INFORME),
    "no se muestra la empresa, que es el único dato que sí corresponde");
  // La base tampoco los entrega.
  const cuerpo = cuerpoSql("public_diagnostic_get_result");
  for (const prohibido of ["participant_email", "participant_phone", "participant_name",
                           "consent_content_hash", "resume_token_hash"]) {
    assert(!new RegExp(`'${prohibido}'`).test(cuerpo),
      `la lectura del resultado devuelve «${prohibido}»`);
  }
});

check("S/T. No se indexa, y el título no lleva empresa ni nota", () => {
  assert(/robots: \{ index: false, follow: false \}/.test(PAGINA),
    "la pantalla de resultado se indexaría");
  const i = PAGINA.indexOf("export const metadata");
  const meta = PAGINA.slice(i, PAGINA.indexOf("};", i));
  for (const prohibido of ["companyName", "company", "maturity", "readiness", "%"]) {
    assert(!new RegExp(prohibido, "i").test(meta),
      `la metadata lleva «${prohibido}»: acabaría en la vista previa de WhatsApp`);
  }
});

console.log("\nC · El valor va antes que la venta");
// ===========================================================================

check("M/N. El informe no sabe siquiera si hubo consentimiento comercial", () => {
  for (const src of [PAGINA, INFORME, REGLAS]) {
    assert(!/marketing/i.test(src),
      "algo del resultado depende del consentimiento comercial");
  }
  // Y la lectura de la base tampoco lo devuelve.
  assert(!/marketing/.test(cuerpoSql("public_diagnostic_get_result")),
    "la lectura del resultado devuelve el consentimiento comercial");
});

check("O. El CTA no crea cuenta ni mueve ningún consentimiento", () => {
  const i = INFORME.indexOf("¿Quieres trabajar estas brechas?");
  assert(i > -1, "no existe el bloque comercial");
  const bloque = INFORME.slice(i - 400, i + 1400);
  assert(!/action=|useActionState|formAction|<form/.test(bloque),
    "el CTA envía algo: debería ser un enlace y nada más");
  assert(!/marketing|consent|opt_in/i.test(bloque),
    "el CTA toca el consentimiento");
  assert(/<Link href=\{ctaHref\}/.test(INFORME), "el CTA no es un enlace simple");
});

check("El CTA sigue el recorrido que ya existe, y no lleva a una puerta cerrada", () => {
  assert(/isPublicRegistrationEnabled/.test(PAGINA),
    "el CTA no consulta si el registro público está abierto");
  assert(/"\/register"/.test(PAGINA), "no hay destino cuando el registro está abierto");
  assert(/mailto:/.test(PAGINA), "no hay destino cuando el registro está cerrado");
});

check("Y el bloque comercial no se imprime", () => {
  const i = INFORME.indexOf("¿Quieres trabajar estas brechas?");
  const seccionCta = INFORME.slice(INFORME.lastIndexOf("<section", i), i);
  assert(/no-print/.test(seccionCta),
    "el CTA sale en la hoja impresa: eso no es un informe, es un folleto");
});

console.log("\nD · Impresión");
// ===========================================================================

check("U/V. En papel quedan resultado, dimensiones y recomendaciones", () => {
  assert(/window\.print\(\)/.test(
    sinTs(leer("components/domain/public-diagnostics/print-button.tsx"))),
    "no hay forma de imprimir");
  assert(/\.no-print/.test(CSS) && /\.print-only/.test(CSS),
    "faltan las utilidades de impresión");
  // Lo que se esconde tras «Ver todas» se imprime entero: en papel no hay clic.
  assert(/print-only/.test(INFORME),
    "las brechas ocultas no se imprimen");
  const i = INFORME.indexOf("<details");
  assert(i > -1 && /no-print/.test(INFORME.slice(i, i + 120)),
    "el desplegable se imprime cerrado y se pierde su contenido");
  assert(/print-avoid-break/.test(INFORME),
    "las tarjetas se parten entre páginas");
});

console.log("\nE · Las reglas de presentación, que son puras");
// ===========================================================================

check("Una instantánea rota NO se completa a ojo", () => {
  for (const [qué, roto] of [
    ["nula", null], ["vacía", {}],
    ["sin nivel", { maturity_percent: 50, sections: [], gaps: [] }],
    ["con nivel inventado", { maturity_percent: 50, readiness_level: "genial",
                              sections: [], gaps: [] }],
    ["con porcentaje imposible", { maturity_percent: 140, readiness_level: "low",
                                   sections: [], gaps: [] }],
    ["sin dimensiones", { maturity_percent: 50, readiness_level: "low", gaps: [] }],
  ] as const) {
    assert(parsePublicSnapshot(roto) === null,
      `una instantánea ${qué} se aceptó: se enseñaría un informe inventado`);
  }
  const buena = parsePublicSnapshot({
    schema: PUBLIC_RESULT_SCHEMA, instrument: { type: "pcr", version: 1 },
    answered: 52, questions: 52, maturity_percent: 65.3846,
    readiness_level: "medium", readiness_label: READINESS_LABEL.medium,
    critical_gaps: 3,
    sections: [{ code: "a", title: "A", percent: 80, answered_yes: 8, total: 10 }],
    gaps: [{ code: "A1", section: "a", question: "¿Algo?", recommended_action: "Hazlo" }],
  });
  assert(buena !== null, "una instantánea buena se rechazó");
  assert(buena!.maturity_percent === 65.3846, "el porcentaje se alteró al leerlo");
});

check("Y una instantánea v1 —sin dimensión en la brecha— se sigue leyendo", () => {
  const vieja = parsePublicSnapshot({
    schema: "public_pcr_result.v1", maturity_percent: 10, readiness_level: "low",
    sections: [{ code: "a", title: "A", percent: 10 }],
    gaps: [{ code: "A1", question: "¿Algo?", recommended_action: "Hazlo" }],
  });
  assert(vieja !== null, "un informe del formato anterior dejó de poder leerse");
  assert(vieja!.gaps[0].section === null, "se inventó una dimensión que no venía");
});

check("Fortaleza es fortaleza; lo demás se llama por su nombre", () => {
  const fuerte = seleccionarDestacadas([
    seccion("a", "A", 90), seccion("b", "B", 72), seccion("c", "C", 40),
    seccion("d", "D", 75)]);
  assert(fuerte.kind === "strengths", `salió «${fuerte.kind}»`);
  assert(fuerte.items.length === 3, `se destacaron ${fuerte.items.length}`);
  assert(fuerte.items[0].code === "a", "no se ordenaron de mejor a peor");
  assert(!fuerte.items.some((s) => s.percent < STRENGTH_THRESHOLD),
    "se coló una dimensión por debajo del umbral");

  const relativa = seleccionarDestacadas([
    seccion("a", "A", 55), seccion("b", "B", 45), seccion("c", "C", 10)]);
  assert(relativa.kind === "relative",
    `con nada por encima del umbral salió «${relativa.kind}»`);
  assert(relativa.items.length === 2, "se destacaron demasiadas relativas");
  assert(!relativa.items.some((s) => s.percent < RELATIVE_FLOOR),
    "se llamó «mejor desempeño» a algo que está por los suelos");

  const ninguna = seleccionarDestacadas([
    seccion("a", "A", 20), seccion("b", "B", 5)]);
  assert(ninguna.kind === "none" && ninguna.items.length === 0,
    "se forzó una fortaleza donde no hay ninguna");
});

check("Las brechas van primero por la dimensión más floja", () => {
  const secciones = [seccion("a", "A", 80), seccion("b", "B", 20), seccion("c", "C", 50)];
  const brechas: SnapshotGap[] = [
    { code: "A1", section: "a", question: "de A", recommended_action: null },
    { code: "C1", section: "c", question: "de C", recommended_action: null },
    { code: "B1", section: "b", question: "de B 1", recommended_action: null },
    { code: "B2", section: "b", question: "de B 2", recommended_action: null },
  ];
  const orden = ordenarBrechas(brechas, secciones).map((g) => g.code);
  assert(JSON.stringify(orden) === JSON.stringify(["B1", "B2", "C1", "A1"]),
    `orden obtenido: ${orden.join(", ")}`);
  // Y dentro de una dimensión se respeta el orden del instrumento.
  assert(orden.indexOf("B1") < orden.indexOf("B2"),
    "dentro de la dimensión no se respeta el orden en que se preguntó");
});

check("Las recomendaciones se agrupan y no se repiten", () => {
  const secciones = [seccion("a", "Dimensión A", 30), seccion("b", "Dimensión B", 60)];
  const brechas: SnapshotGap[] = [
    { code: "A1", section: "a", question: "q1", recommended_action: "Registra los lotes" },
    { code: "A2", section: "a", question: "q2", recommended_action: "Registra los lotes" },
    { code: "A3", section: "a", question: "q3", recommended_action: "Guarda las facturas" },
    { code: "B1", section: "b", question: "q4", recommended_action: "Forma al equipo" },
    { code: "B2", section: "b", question: "q5", recommended_action: null },
  ];
  const grupos = agruparRecomendaciones(brechas, secciones);
  assert(grupos.length === 2, `salieron ${grupos.length} grupos`);
  const a = grupos.find((g) => g.sectionCode === "a")!;
  assert(a.sectionTitle === "Dimensión A", "el grupo no toma el nombre de la dimensión");
  assert(a.actions.length === 2, `la dimensión A repite: ${a.actions.length} acciones`);
  assert(a.actions[0] === "Registra los lotes", "se reescribió el texto original");
  const b = grupos.find((g) => g.sectionCode === "b")!;
  assert(b.actions.length === 1, "una brecha sin recomendación generó una vacía");
});

check("Cada nivel tiene su explicación, y ninguna menciona un umbral", () => {
  const niveles: ReadinessLevel[] = ["low", "medium", "high", "audit_ready_candidate"];
  for (const n of niveles) {
    const texto = READINESS_EXPLANATION[n];
    assert(typeof texto === "string" && texto.length > 60,
      `«${n}» no tiene explicación`);
    assert(!/\d+\s*%|\bpor ciento\b|umbral|puntaje|peso/i.test(texto),
      `la explicación de «${n}» revela una regla de puntuación: «${texto.slice(0, 60)}…»`);
  }
  assert(new Set(niveles.map((n) => READINESS_EXPLANATION[n])).size === 4,
    "dos niveles comparten explicación");
});

check("El informe se compone en el orden en que se lee", () => {
  const snap = parsePublicSnapshot({
    schema: PUBLIC_RESULT_SCHEMA, instrument: { type: "pcr", version: 1 },
    answered: 52, questions: 52, maturity_percent: 40, readiness_level: "low",
    readiness_label: READINESS_LABEL.low, critical_gaps: 5,
    sections: [seccion("a", "A", 30), seccion("b", "B", 70)],
    gaps: Array.from({ length: 9 }, (_, i) => ({
      code: `Q${i}`, section: i < 5 ? "a" : "b", question: `pregunta ${i}`,
      recommended_action: `acción ${i % 2}`,
    })),
  })!;
  const informe = buildPublicReport(snap);
  assert(informe.gapsPriority.length === GAPS_VISIBLE,
    `se enseñan ${informe.gapsPriority.length} brechas de entrada`);
  assert(informe.gapsRest.length === 3, "el resto no queda a un clic");
  assert(informe.totalGaps === 9, "el total de brechas no se conserva");
  assert(informe.explanation === READINESS_EXPLANATION.low, "la explicación no es la del nivel");
  assert(informe.readinessLabel === READINESS_LABEL.low, "la etiqueta no es la congelada");
  // El orden del instrumento, no el de la puntuación.
  assert(JSON.stringify(informe.dimensions.map((d) => d.code)) === JSON.stringify(["a", "b"]),
    "las dimensiones se reordenaron");
});

console.log("\nF · Repetir");
// ===========================================================================

check("W/X. El enlace de repetir depende de la campaña, no del gusto", () => {
  assert(/repeatHref=\{lectura\.result\.allowRepeat && lectura\.result\.repeatAvailable/
    .test(PAGINA),
    "el enlace de repetir no depende de allow_repeat Y de que la campaña siga "
    + "admitiendo participaciones: sería un botón hacia una puerta tapiada");
  assert(/repeatHref \? \(/.test(INFORME),
    "el informe pinta el bloque de repetir siempre");
  const cuerpo = cuerpoSql("public_diagnostic_get_result");
  assert(/'allow_repeat', s\.allow_repeat/.test(cuerpo),
    "la base no dice si la campaña admite repetir");
  assert(/'repeat_available'/.test(cuerpo),
    "la base no dice si HOY se podría empezar otra");
});

check("Y la intención se declara, pero la prueba es el testigo de la cookie", () => {
  assert(/formData\.get\("repetir"\) === "1"/.test(ACCION),
    "la acción no lee la intención de repetir");
  assert(/galletasPrevias\.get\(INTAKE_COOKIE\)/.test(ACCION),
    "el testigo anterior no sale de la cookie");
  assert(!/formData\.get\("(repeat_token|token|repeatToken)"\)/.test(ACCION),
    "el testigo anterior llega del formulario: cualquiera podría superar la "
    + "participación de otro");
  const cuerpo = cuerpoSql("public_diagnostic_begin_submission");
  assert(/v_anterior\.status = 'completed'/.test(cuerpo),
    "se permite repetir sobre algo sin cerrar");
  assert(/v_anterior\.campaign_id = c\.id/.test(cuerpo),
    "un testigo de otra campaña sirve para repetir en esta");
  assert(/v_anterior\.superseded_by_id is null/.test(cuerpo),
    "se puede superar dos veces la misma participación");
  assert(/c\.allow_repeat/.test(cuerpo), "la campaña no gobierna la repetición");
});

check("Y. Repetir NO reabre ni borra lo anterior", () => {
  const cuerpo = cuerpoSql("public_diagnostic_begin_submission");
  assert(!/delete from public\.public_diagnostic_answers/.test(cuerpo),
    "repetir borra las respuestas anteriores");
  const upd = cuerpo.slice(cuerpo.indexOf("update public.public_diagnostic_submissions"));
  assert(/set superseded_by_id = v_id/.test(upd),
    "no se encadena la participación anterior");
  assert(!/set status|completed_at|maturity_percent/.test(upd.slice(0, 300)),
    "repetir toca algo más que la cadena de supersesión");
  // La puerta manda a repetir, no repite sola.
  assert(/quiereRepetir/.test(PUERTA) && /repetir === "1"/.test(PUERTA),
    "la puerta no exige una intención explícita");
});

console.log("\nG · La puerta que sigue abierta");
// ===========================================================================

check("AA. PUBLIC-ANON-EXECUTE-AUDIT-01 sigue gobernada", () => {
  /*
    Este renglón nació en 01G exigiendo que la puerta estuviera ABIERTA, porque
    entonces lo estaba y el riesgo era que alguien la diera por cerrada sin
    haberla auditado. PD-01H la cerró de verdad: inventario completo, 0202 y
    una lista blanca cerrada que muerde.

    Así que lo que se defiende aquí ya no es el estado, sino que el estado esté
    DECLARADO y RESPALDADO: abierta con criterio de salida, o cerrada con la
    prueba que la sostiene. Declararla cerrada sin esa prueba sigue estando
    prohibido, y eso lo comprueba además la batería de preparación.
  */
  const doc = leer("docs/security/PUBLIC-ANON-EXECUTE-AUDIT-01.md");
  const abierta = /\*\*Estado:\*\*\s*ABIERTA/.test(doc);
  const cerrada = /\*\*Estado:\*\*\s*CERRADA/.test(doc);
  assert(abierta !== cerrada, "la puerta no declara un estado inequívoco");
  if (abierta) {
    assert(/no se abre la primera campaña pública real/i.test(doc),
      "la puerta dejó de bloquear nada");
  } else {
    assert(leer("tests/rls/pd01h-admin-export.test.ts")
      .includes("PUBLIC_ANON_EXECUTE_ALLOWLIST"),
      "se declara cerrada sin la lista blanca cerrada que la sostiene");
  }
  assert(/PUBLIC-ANON-EXECUTE-AUDIT-01/.test(
    leer("tests/unit/pe04b6-release-readiness.test.ts")),
    "la lista de preparación dejó de vigilar la puerta");
});

check("Y 0201 no abre ninguna tabla", () => {
  assert(!/grant\s+(select|insert|update|delete|all)\s+on\s+table/i.test(SQL),
    "0201 concede una tabla");
  assert(!/for select to anon|to anon using/i.test(SQL), "0201 crea una política para anon");
  const concesiones = (SQL.match(/grant execute on function/g) ?? []).length;
  assert(concesiones === 2, `0201 concede ${concesiones} funciones`);
});

console.log(`\nPUBLIC-DIAGNOSTICS-01G · informe público: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
