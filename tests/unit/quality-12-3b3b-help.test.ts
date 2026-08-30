/**
 * Trazaloop · QUALITY-12.3B3B · La ayuda contextual del dominio.
 *
 * Once ayudas, y cada una con las tres cosas que hacen útil una ayuda: qué es,
 * un ejemplo, y en qué se apoya. Sin las tres, un botón «i» es decoración.
 *
 * Y una regla que importa más que las tres: NO se le atribuye a la norma lo
 * que la norma no dice. Priorizar con influencia × impacto es una práctica
 * común, no un requisito de ISO 9001:2015, y esta suite lo comprueba.
 *
 * Correr: npm run test:quality123b3b-help
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  INTERESTED_PARTIES_HELP, interestedPartiesHint,
} from "../../lib/domain/quality-interested-parties";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const raiz = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");
const COMP = "components/domain/quality/interested-parties";

const CLAVES = [
  "overview", "relevance", "need", "expectation", "requirement",
  "influence", "impact", "strategy", "monitoring", "review", "history",
] as const;

console.log("\nQUALITY-12.3B3B · Ayuda contextual\n");

check("AE. Están las once ayudas del dominio", () => {
  for (const k of CLAVES) {
    assert(k in INTERESTED_PARTIES_HELP, `falta la ayuda «${k}»`);
  }
  assert(Object.keys(INTERESTED_PARTIES_HELP).length === CLAVES.length,
    "hay ayudas que no están en la lista declarada, o al revés");
});

check("AF. Cada ayuda tiene qué es, un ejemplo y en qué se apoya", () => {
  for (const k of CLAVES) {
    const t = INTERESTED_PARTIES_HELP[k];
    assert(/QUÉ ES/.test(t), `«${k}» no explica qué es`);
    assert(/EJEMPLO/.test(t), `«${k}» no trae un ejemplo`);
    assert(/RESPALDO/.test(t), `«${k}» no dice en qué se apoya`);
    assert(t.length > 300, `«${k}» es demasiado corta para servir de algo`);
    const ejemplo = t.slice(t.indexOf("EJEMPLO"), t.indexOf("RESPALDO"));
    assert(ejemplo.trim().length > 60, `el ejemplo de «${k}» no es un ejemplo`);
  }
});

check("AG. Los ejemplos son de cualquier sector, no de textil ni de reciclado", () => {
  for (const k of CLAVES) {
    const t = INTERESTED_PARTIES_HELP[k];
    assert(!/textil|poliéster|algodón|reciclad|lote de producción|PCR\b/i.test(t),
      `«${k}» usa un ejemplo de un sector concreto`);
  }
});

check("AH. Se cita la norma por su apartado y NUNCA se copia su texto", () => {
  const conNorma = CLAVES.filter((k) => /ISO 9001:2015/.test(INTERESTED_PARTIES_HELP[k]));
  assert(conNorma.length >= 8,
    `solo ${conNorma.length} ayudas citan la norma; el respaldo es parte del contenido`);
  for (const k of CLAVES) {
    const t = INTERESTED_PARTIES_HELP[k];
    // Referencia por apartado, sin transcribir.
    assert(!/«[^»]{120,}»/.test(t), `«${k}» parece transcribir un texto largo`);
    assert(!/la norma dice textualmente|cita textual|literalmente/i.test(t),
      `«${k}» insinúa que transcribe la norma`);
  }
  // Los apartados que se mencionan existen en la estructura de la norma.
  const apartados = new Set<string>();
  for (const k of CLAVES) {
    for (const m of INTERESTED_PARTIES_HELP[k].matchAll(/\b(\d(?:\.\d){0,2})\b(?=[.,;: ])/g)) {
      if (/^\d(\.\d)+$/.test(m[1])) apartados.add(m[1]);
    }
  }
  for (const a of apartados) {
    assert(/^(4|5|6|7|8|9|10)(\.\d){0,2}$/.test(a),
      `se cita un apartado que no existe en ISO 9001:2015: ${a}`);
  }
});

check("AI. NO se le atribuye a la norma lo que la norma no exige", () => {
  const prioridad = INTERESTED_PARTIES_HELP.influence + INTERESTED_PARTIES_HELP.impact;
  assert(/NO exige|no exige|opcional/.test(prioridad),
    "no se dice que priorizar es opcional");
  assert(!/la norma exige.*influencia|ISO.*exige.*matriz/i.test(prioridad),
    "se afirma que la norma exige influencia × impacto");
  const todo = CLAVES.map((k) => INTERESTED_PARTIES_HELP[k]).join("\n");
  for (const prohibido of ["garantiza el cumplimiento", "cumplimiento garantizado",
                           "esto certifica", "la norma obliga a esta matriz"]) {
    assert(!new RegExp(prohibido, "i").test(todo), `la ayuda afirma «${prohibido}»`);
  }
  // Y la frecuencia de revisión no se inventa.
  assert(/no dice «anual»|no dice "anual"|La frecuencia la decide la empresa/i
    .test(INTERESTED_PARTIES_HELP.review),
    "la ayuda de revisión no aclara que la cadencia la decide la empresa");
});

check("AJ. Las ayudas están puestas donde se necesitan, no en una sola esquina", () => {
  const secciones: Record<string, string[]> = {
    "assessment-section.tsx": ["overview", "relevance", "influence", "impact"],
    "requirements-section.tsx": ["requirement", "need", "expectation"],
    "strategies-section.tsx": ["strategy", "monitoring"],
    "reviews-section.tsx": ["review"],
    "history-section.tsx": ["history"],
  };
  for (const [archivo, claves] of Object.entries(secciones)) {
    const src = leer(`${COMP}/${archivo}`);
    assert(src.includes("SectionHint"), `${archivo} no usa el botón «i» compartido`);
    for (const k of claves) {
      const directa = src.includes(`interestedPartiesHint("${k}")`);
      // Las de tipo de entrada se resuelven por variable dentro del bucle.
      const porVariable = src.includes("interestedPartiesHint(k)");
      assert(directa || porVariable, `${archivo} no ofrece la ayuda «${k}»`);
    }
  }
});

check("AK. Se reutiliza el componente compartido, sin infraestructura nueva", () => {
  const dom = leer("lib/domain/quality-interested-parties.ts");
  assert(dom.includes("INTERESTED_PARTIES_HELP"), "el contenido no vive en el dominio");
  assert(!existsSync(join(raiz, "lib/db/interested-parties-help.ts")),
    "se creó una capa de datos para la ayuda");
  for (const archivo of ["assessment-section.tsx", "requirements-section.tsx"]) {
    const src = leer(`${COMP}/${archivo}`);
    assert(src.includes('from "@/components/ui/section-hint"'),
      `${archivo} no usa el componente compartido`);
    assert(!/authoring-guidance|resolveHintForViewer/.test(src),
      `${archivo} se enganchó a la infraestructura de guías administradas`);
  }
  // Y el hint que se entrega tiene la forma que espera el componente.
  const h = interestedPartiesHint("overview");
  assert(h.restricted === false && h.title === null && typeof h.text === "string",
    "el hint no tiene la forma que espera SectionHint");
});

check("AL. B3B no trajo tutoriales, vídeo de bienvenida ni FAQ", () => {
  // Sin comentarios: el dominio EXPLICA que los tutoriales vienen después, y
  // esa frase no puede hacer fallar a la prueba que comprueba que no están.
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const fuentes = [
    "lib/domain/quality-interested-parties.ts",
    `${COMP}/detail-view.tsx`,
    "app/(app)/(shell)/quality/context/interested-parties/page.tsx",
  ].map((f) => sinComentarios(leer(f))).join("\n");
  for (const prohibido of ["Ver video", "Ver vídeo", "tutorial", "welcome video",
                           "No volver a mostrar", "Preguntas frecuentes", "FAQ"]) {
    assert(!fuentes.includes(prohibido), `B3B incluye «${prohibido}», y está diferido`);
  }
  const dom = leer("lib/domain/quality-interested-parties.ts");
  assert(/transversal posterior|sprint transversal/.test(dom),
    "no queda escrito que el endurecimiento global de la ayuda viene después");
});

console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
