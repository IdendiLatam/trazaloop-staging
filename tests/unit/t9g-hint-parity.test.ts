/**
 * Trazaloop · Sprint T9G · Tests de PARIDAD de hints TrazaDocs CPR ↔
 * Textiles (§18). Verifican, sobre la fuente real y la lógica pura, que
 * ambos módulos comparten UN solo componente de hint, UN solo renderizador
 * seguro y la MISMA arquitectura de configuración (blueprints por módulo),
 * sin filtrar contenido entre módulos ni duplicar implementaciones.
 *
 * Correr: npm run test:t9g-parity
 */
import fs from "node:fs";
import path from "node:path";
import { canEditBlueprint } from "../../lib/domain/trazadocs";
import { parseHintText } from "../../lib/domain/hint-links";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, "..", "..", rel), "utf8");
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(__dirname, "..", "..", rel));
}

const SHARED_HINT = "components/ui/section-hint.tsx";
const SHARED_RENDERER = "components/ui/hint-text.tsx";
const CPR_SECTION_EDITOR = "components/domain/trazadocs/section-editor.tsx";
const TEXTILES_EDITOR = "components/domain/textiles/trazadoc-editor.tsx";
const BLUEPRINT_EDITOR = "components/domain/trazadocs/blueprint-detail-editor.tsx";

console.log("Trazaloop · T9G: paridad de hints TrazaDocs CPR ↔ Textiles\n");

check("1. CPR y Textiles importan EL MISMO componente de hint (sin duplicados)", () => {
  const cpr = read(CPR_SECTION_EDITOR);
  const textiles = read(TEXTILES_EDITOR);
  assert(
    cpr.includes('from "@/components/ui/section-hint"'),
    "el editor de secciones CPR debía importar el SectionHint compartido"
  );
  assert(
    textiles.includes('from "@/components/ui/section-hint"'),
    "el editor Textil debía importar el SectionHint compartido"
  );
  assert(
    !exists("components/domain/trazadocs/section-hint.tsx"),
    "el SectionHint duplicado de CPR debía haberse eliminado"
  );
  assert(
    !textiles.includes("Tip: {s.hint}"),
    "Textiles no debía conservar el párrafo plano «Tip:» previo a la paridad"
  );
});

check("2. CPR y Textiles usan EL MISMO renderizador seguro (HintText + parser único)", () => {
  const hint = read(SHARED_HINT);
  assert(hint.includes('from "@/components/ui/hint-text"'), "SectionHint debía renderizar vía HintText");
  const renderer = read(SHARED_RENDERER);
  assert(
    renderer.includes('from "@/lib/domain/hint-links"') && renderer.includes("parseHintText"),
    "HintText debía usar el parser compartido"
  );
  // Un solo parser en todo el árbol: parseHintText solo se DEFINE en el
  // módulo compartido.
  const roots = ["app", "components", "lib", "server"];
  let definitions = 0;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const src = fs.readFileSync(full, "utf8");
        if (/export function parseHintText/.test(src)) definitions++;
      }
    }
  };
  for (const r of roots) walk(path.join(__dirname, "..", "..", r));
  assert(definitions === 1, `parseHintText debía definirse UNA sola vez, se encontró ${definitions} veces`);
});

check("3. Ambos admiten enlaces seguros por la misma vía", () => {
  // El comportamiento de enlaces se prueba en t9g-hint-links; aquí se
  // verifica que ninguno de los dos editores renderiza el hint por fuera
  // del componente compartido.
  const cpr = read(CPR_SECTION_EDITOR);
  const textiles = read(TEXTILES_EDITOR);
  assert(cpr.includes("<SectionHint hint="), "CPR debía renderizar el hint con SectionHint");
  assert(textiles.includes("<SectionHint hint="), "Textiles debía renderizar el hint con SectionHint");
  const tokens = parseHintText("[Guía](https://ejemplo.com) y [ajustes](/settings)");
  assert(tokens.filter((t) => t.type === "link").length === 2, "el parser compartido admite ambos tipos de enlace");
});

check("4. Con contenido, el botón «i» se muestra (mismo icono, aria y estilos)", () => {
  const hint = read(SHARED_HINT);
  assert(hint.includes(">\n        i\n      </button>") || /＞?i<\/button>|>\s*i\s*<\/button>/.test(hint), "el botón debía mostrar la «i»");
  assert(hint.includes('aria-label="Más información"'), "aria-label «Más información» requerido (§11)");
  assert(hint.includes('title="Más información"'), "title «Más información» requerido");
  assert(hint.includes("h-5 w-5") && hint.includes("rounded-full"), "el tamaño e icono circular debían conservarse");
});

check("5. Sin contenido, el botón «i» NO se muestra ni abre panel vacío", () => {
  const hint = read(SHARED_HINT);
  assert(
    hint.includes("if (!hasHintContent(hint)) return null;"),
    "sin contenido el componente debía retornar null (ni botón, ni panel, ni error)"
  );
  assert(hint.includes('from "@/lib/domain/hint-links"'), "la decisión de contenido vive en la lógica pura compartida");
});

check("6. Un hint CPR no aparece en Textiles: los hints se resuelven POR blueprint del documento", () => {
  const textilesDb = read("lib/db/textiles-trazadocs.ts");
  assert(textilesDb.includes('const MODULE = "textiles"'), "el wrapper Textil debía fijar module_key textiles");
  assert(
    textilesDb.includes("getBlueprintSections(blueprintId)"),
    "los hints Textiles debían salir de las secciones del blueprint del documento"
  );
  const textilesPage = read("app/(app)/(shell)/textiles/trazadocs/[documentId]/page.tsx");
  assert(
    textilesPage.includes("listTextileTrazadocHints"),
    "la página Textil debía resolver hints vía su wrapper de módulo"
  );
});

check("7. Un hint Textiles no aparece en CPR: las consultas CPR filtran por su module_key", () => {
  const cprDb = read("lib/db/trazadocs.ts");
  assert(
    cprDb.includes('moduleKey: TrazadocModuleKey = "cpr"') && cprDb.includes('.eq("module_key", moduleKey)'),
    "el motor debía filtrar blueprints/documentos por module_key con cpr por defecto"
  );
  const cprEdit = read("app/(app)/(shell)/(cpr)/trazadocs/[id]/edit/page.tsx");
  assert(
    cprEdit.includes("getBlueprintSections(doc.blueprintId)"),
    "los hints CPR debían salir del blueprint del propio documento (nunca de otro módulo)"
  );
});

check("8. Un usuario autorizado (superadmin de plataforma) puede editar hints", () => {
  assert(canEditBlueprint("superadmin") === true, "superadmin debía poder editar blueprints/hints");
});

check("9. Un usuario NO autorizado no puede editar hints (support, null)", () => {
  assert(canEditBlueprint("support") === false, "support no debía poder editar");
  assert(canEditBlueprint(null) === false, "sin rol de plataforma no se edita");
  assert(canEditBlueprint(undefined) === false, "sin rol de plataforma no se edita");
  const editor = read(BLUEPRINT_EDITOR);
  assert(editor.includes("disabled={!canManage}"), "el editor debía deshabilitar el campo sin permisos");
});

check("10. La vista previa del editor usa EXACTAMENTE el mismo renderizador que el usuario final", () => {
  const editor = read(BLUEPRINT_EDITOR);
  assert(
    editor.includes('from "@/components/ui/hint-text"') && editor.includes("<HintText text={value} />"),
    "la vista previa debía renderizar con HintText"
  );
  assert(editor.includes("HINT_LINK_HELP_TEXT"), "el editor debía mostrar la ayuda del formato de enlaces (§14)");
  assert(
    !editor.includes("dangerouslySetInnerHTML="),
    "la vista previa jamás usa HTML crudo"
  );
});

check("11. El botón «i» no envía formularios (type=button, también en el cierre)", () => {
  const hint = read(SHARED_HINT);
  const code = hint
    .split("\n")
    .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"))
    .join("\n");
  const buttons = code.match(/<button/g) ?? [];
  const typed = code.match(/type="button"/g) ?? [];
  assert(buttons.length >= 2, "debían existir el botón «i» y el cierre visible");
  assert(typed.length === buttons.length, "TODOS los botones del hint debían ser type=button");
});

check("12. La interfaz del hint es accesible con teclado (foco visible + aria-expanded)", () => {
  const hint = read(SHARED_HINT);
  assert(hint.includes("aria-expanded={open}"), "aria-expanded requerido");
  assert(hint.includes("focus-visible:outline"), "el foco visible debía estar estilizado");
});

check("13. Escape cierra el contenido y devuelve el foco al botón", () => {
  const hint = read(SHARED_HINT);
  assert(hint.includes('event.key === "Escape"'), "el hint debía cerrarse con Escape");
  assert(hint.includes("buttonRef.current?.focus()"), "al cerrar, el foco debía volver al botón");
  assert(hint.includes(">\n            Cerrar\n          </button>") || />\s*Cerrar\s*<\/button>/.test(hint), "debía existir un cierre visible");
});

check("14. TrazaDocs CPR conserva su comportamiento previo (hint por sección + edición en blueprint)", () => {
  const cpr = read(CPR_SECTION_EDITOR);
  assert(cpr.includes("<SectionHint hint={hint} />"), "la sección CPR debía conservar su botón «i»");
  const editor = read(BLUEPRINT_EDITOR);
  assert(editor.includes('name="hint"'), "el campo hint del blueprint debía conservar su name para el server action");
  assert(
    editor.includes("Tip / hint para diligenciar esta sección"),
    "la etiqueta de edición del hint debía conservarse"
  );
  const docEditor = read("components/domain/trazadocs/document-editor.tsx");
  assert(
    docEditor.includes("hint={s.blueprintSectionId ? hints[s.blueprintSectionId] ?? null : null}"),
    "el mapa de hints del documento CPR debía conservarse intacto"
  );
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
