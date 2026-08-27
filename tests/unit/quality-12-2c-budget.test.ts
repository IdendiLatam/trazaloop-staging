/**
 * Trazaloop · QUALITY-12.2C · Cuánto cuesta mejorar un párrafo.
 *
 * Esta suite existe por un número: el descubrimiento midió que el Copilot
 * arrastra **1 664 tokens** antes de un solo byte de contenido —846 de
 * política, 742 de esquema, 76 de tarea— y concluyó que para editar un párrafo
 * eso no se arregla recortando fuentes.
 *
 * Aquí se comprueba que la capa nueva no repite el problema, con la misma
 * regla de conversión que usó el descubrimiento para poder compararlos sin
 * trampa.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUDGET_TARGETS, breakdown, fixtureText, tokens,
} from "../../lib/intelligence/document-authoring/budget";
import {
  QUICK_EDIT_LIMITS, QUICK_EDIT_SCHEMA,
} from "../../lib/intelligence/document-authoring/schema";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

// La política y la tarea se leen del archivo: importarlas exigiría el entorno
// `server-only`, y para medir caracteres no hace falta ejecutarlas.
const POLICY_SRC = read("lib/intelligence/document-authoring/policy.ts");
const POLICY = /const POLITICA = `([\s\S]*?)`;/.exec(POLICY_SRC)![1];
const TAREAS = [...POLICY_SRC.matchAll(/^\s{4}"([^"]+(?:"\s*\n\s*\+ "[^"]+)*)",?$/gm)];
const TAREA_MAS_LARGA = /review_against_guidance:\n([\s\S]*?)\n  alternative_wording/
  .exec(POLICY_SRC)![1].replace(/^\s*"|"\s*$|"\s*\+\s*\n?\s*"/g, "");

const ESQUEMA = JSON.stringify(QUICK_EDIT_SCHEMA);

// Un contexto realista: guía media del inventario (≈97 caracteres) y perfil
// completo de QUALITY-12.2B.
const GUIA = "<GUIA_DE_LA_SECCION>\n"
  + "Guía: Indica quién prepara la orden, quién registra los consumos y quién "
  + "identifica el lote producido.\n"
  + "No se puede inventar: No inventar responsables ni cargos: si no está "
  + "definido quién lo hace, dilo en lugar de suponerlo.\n"
  + "</GUIA_DE_LA_SECCION>";
const PERFIL = "<PERFIL_DE_LA_EMPRESA>\n"
  + "Empresa: Envases del Caribe S.A.S.\nSector: Plásticos y caucho\n"
  + "Actividad principal: Fabricación de envases plásticos a partir de resina reciclada\n"
  + "Productos o servicios: Envases para alimentos, Preformas PET, Maquila de soplado\n"
  + "Descripción: Planta en Barranquilla que transforma resina reciclada en "
  + "envases para la industria de alimentos y bebidas.\n"
  + "</PERFIL_DE_LA_EMPRESA>";
const DOCUMENTO = "<DATOS_DEL_DOCUMENTO>\nMódulo: Trazaloop PCR\n"
  + "Documento: PR-PRO-01 · Procedimiento de producción\nTipo: procedure\n"
  + "Sección: Responsables\n</DATOS_DEL_DOCUMENTO>";

function medir(words: number) {
  return breakdown({
    policy: POLICY,
    task: TAREA_MAS_LARGA,
    schema: ESQUEMA,
    userText: `<TEXTO_DE_LA_PERSONA>\n${fixtureText(words)}\n</TEXTO_DE_LA_PERSONA>`,
    guidance: GUIA,
    organizationProfile: PERFIL,
    documentMetadata: DOCUMENTO,
  });
}

console.log("\nQUALITY-12.2C · presupuesto de tokens\n");

// ===========================================================================
console.log("A · EL COSTE FIJO");
// ===========================================================================

const BASE = medir(100);

check("A1. la política es corta de verdad", () => {
  const t = tokens(POLICY);
  console.log(`      política ≈ ${t} tokens (la del Copilot: 846)`);
  assert(t < 400, `la política ocupa ${t} tokens; el objetivo era muy por debajo de 846`);
});

check("A2. el esquema es pequeño de verdad", () => {
  const t = tokens(ESQUEMA);
  console.log(`      esquema  ≈ ${t} tokens (el del Copilot: 742)`);
  assert(t < 250, `el esquema ocupa ${t} tokens; el del Copilot ocupa 742`);
  assert(Object.keys((QUICK_EDIT_SCHEMA as { properties: object }).properties).length === 4,
    "el esquema tiene más de cuatro campos");
});

check("A3. el coste fijo del Copilot no se repite", () => {
  const fijoCopilot = 846 + 742 + 76;
  console.log(`      coste fijo ≈ ${BASE.fixedOverhead} tokens (Copilot: ${fijoCopilot})`);
  console.log(`        · política ${BASE.policy} · tarea ${BASE.task} · esquema ${BASE.schema}`);
  console.log(`        · guía ${BASE.guidance} · perfil ${BASE.organizationProfile} · documento ${BASE.documentMetadata}`);
  assert(BASE.fixedOverhead < fijoCopilot / 2,
    `el coste fijo es ${BASE.fixedOverhead} y el del Copilot ${fijoCopilot}: no se redujo a la mitad`);
});

check("A4. cada pieza pesa menos de la mitad que su equivalente en el Copilot", () => {
  const maquinaria = BASE.policy + BASE.task + BASE.schema;
  const contexto = BASE.guidance + BASE.organizationProfile + BASE.documentMetadata;
  console.log(`      maquinaria ${maquinaria} · contexto útil ${contexto}`);
  // Comparación pieza a pieza contra lo medido en el descubrimiento, que es
  // más honesta que un número redondo inventado para esta prueba.
  assert(BASE.policy < 846 / 2, `la política ocupa ${BASE.policy} y la del Copilot 846`);
  assert(BASE.schema < 742 / 2, `el esquema ocupa ${BASE.schema} y el del Copilot 742`);
  assert(maquinaria < (846 + 76 + 742) / 2,
    `la maquinaria ocupa ${maquinaria} tokens y la del Copilot 1664`);
});

// ===========================================================================
console.log("\nB · POR TAMAÑO DE TEXTO");
// ===========================================================================

for (const objetivo of BUDGET_TARGETS) {
  check(`B. ${objetivo.words} palabras → ≤ ${objetivo.maxInput} tokens de entrada`, () => {
    const b = medir(objetivo.words);
    console.log(`      ${String(objetivo.words).padStart(3)} palabras → `
      + `${String(b.total).padStart(4)} tokens `
      + `(fijo ${b.fixedOverhead} + texto ${b.userText})`);
    assert(b.total <= objetivo.maxInput,
      `${objetivo.words} palabras dan ${b.total} tokens y el tope es ${objetivo.maxInput}`);
  });
}

check("B5. comparado con el Copilot, para el mismo trabajo", () => {
  const b = medir(100);
  // Una consulta real del Copilot en la validación de QUALITY-12.1 gastó entre
  // 2 514 y 2 886 tokens de entrada. Ese es el listón real, no uno inventado.
  const copilotReal = 2514;
  const proporcion = b.total / copilotReal;
  console.log(`      100 palabras: ${b.total} tokens vs ${copilotReal} del Copilot `
    + `→ ${Math.round(proporcion * 100)} %`);
  assert(proporcion < 0.5,
    `una mejora de párrafo cuesta el ${Math.round(proporcion * 100)} % de una consulta completa`);
});

// ===========================================================================
console.log("\nC · LA SALIDA");
// ===========================================================================

check("C1. la salida tiene tope, y está en el esquema", () => {
  assert(QUICK_EDIT_LIMITS.changeSummary === 2, "el resumen no está acotado a dos");
  assert(QUICK_EDIT_LIMITS.missingInformation === 3, "lo que falta no está acotado a tres");
  assert(QUICK_EDIT_LIMITS.warnings === 2, "los avisos no están acotados a dos");
  assert(/Como mucho dos frases breves/.test(ESQUEMA), "el esquema no pide brevedad");
  assert(/Como mucho tres datos/.test(ESQUEMA), "el esquema no acota lo que falta");
});

check("C2. una propuesta desproporcionada se rechaza", () => {
  assert(QUICK_EDIT_LIMITS.suggestedTextFactor <= 3,
    "una propuesta puede ser mucho más larga que el original sin llamar la atención");
});

check("C3. no se piden campos del Copilot", () => {
  for (const campo of ["facts", "interpretation", "suggestions", "sources",
                       "evidence", "references", "themes"]) {
    assert(!new RegExp(`"${campo}"`).test(ESQUEMA),
      `el esquema pide ${campo}, que es del Copilot global`);
  }
});

// ===========================================================================
console.log("\nD · LO QUE NO SE ENVÍA");
// ===========================================================================

check("D1. un campo vacío no viaja", () => {
  const ctx = read("lib/intelligence/document-authoring/context.ts");
  assert(/if \(g\.purpose\)/.test(ctx) && /if \(g\.example\)/.test(ctx),
    "el propósito y el ejemplo vacíos viajarían como etiquetas sin contenido");
  assert(/if \(g && !g\.restricted && \(g\.guidance \?\? ""\)\.trim\(\)\.length > 0\)/.test(ctx),
    "una guía restringida o vacía viajaría igual");
});

check("D2. el perfil es el compacto de 12.2B, no otra consulta", () => {
  const ctx = read("lib/intelligence/document-authoring/context.ts");
  assert(/renderAuthoringContext/.test(ctx),
    "el perfil no se compone con el renderizador compacto de 12.2B");
  assert(!/from\("organizations"\)/.test(ctx), "se consulta la empresa por segunda vez");
});

console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
void TAREAS;
process.exit(failed === 0 ? 0 : 1);
