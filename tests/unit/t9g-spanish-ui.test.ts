/**
 * Trazaloop · Sprint T9G · Control de ESPAÑOL VISIBLE (§19), glosario
 * canónico (§6) y REGRESIÓN del superadministrador de módulos (§16).
 *
 * Parte A — Detector de alta confianza de textos visibles en inglés:
 *   inspecciona texto JSX, labels, placeholders, aria-label, title, alt y
 *   los mensajes de Server Actions destinados a interfaz (error/message).
 *   Usa la allowlist de términos técnicos (§19) y NUNCA falla por nombres
 *   de variables, imports, tipos, comentarios, rutas, tablas, funciones ni
 *   identificadores internos: solo analiza superficies visibles.
 *   Es un control COMPLEMENTARIO de la revisión manual documentada en
 *   docs/platform/TRAZALOOP_T9G_SPANISH_SWEEP_MATRIX.md.
 *
 * Parte B — Glosario: «Empresa» (nunca «organización» visible), términos
 *   obligatorios y mapeo de códigos internos a mensajes en español.
 *
 * Parte C — Regresión: el superadministrador asigna Deshabilitado /
 *   Demo permanente / Full / Extra POR módulo y POR empresa de forma
 *   independiente; Quality y Construcción siguen «Próximamente» y no
 *   asignables; ningún rol de empresa puede cambiar planes.
 *
 * Correr: npm run test:t9g-spanish
 */
import fs from "node:fs";
import path from "node:path";
import {
  resolveModuleAccess,
  type ModuleAccessInput,
} from "../../lib/modules/access";
import {
  DERIVED_STATE_LABEL,
  DERIVED_STATE_HINT,
  moduleAccessDeniedMessage,
} from "../../lib/modules/messages";
import {
  COMMERCIAL_MODULES,
  FUNCTIONAL_MODULE_CODES,
  isFunctionalModuleCode,
  CPR_MODULE_CODE,
  TEXTILES_MODULE_CODE,
} from "../../lib/modules/catalog";

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

const ROOT = path.join(__dirname, "..", "..");
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// ---------------------------------------------------------------------------
// Parte A · Detector de inglés visible de alta confianza (§19)
// ---------------------------------------------------------------------------

/** Allowlist §19: términos técnicos y de marca que pueden aparecer tal cual. */
const ALLOWLIST =
  /\b(Trazaloop|TrazaDocs|Demo|Full|Extra|CPR|QR|PDF|CSV|XLSX|MIME|ISO|NTC|UNE-EN|Supabase|Vercel|SKU|OK|Excel|Storage|Slug|Reset)\b/g;

/** Palabras funcionales del inglés: 2+ en una misma cadena visible, sin
 *  ninguna marca de español, es señal de alta confianza. */
const ENGLISH_STOPWORDS =
  /\b(the|is|are|was|were|not|please|your|you|cannot|can't|failed|failure|invalid|unable|must|should|click|here|try again|loading|required|forbidden|unauthorized|denied|welcome|sign in|sign up|sign out|log in|log out|something went wrong|does not|doesn't|there is|there are|has been|have been)\b/gi;

/** Marcas de español: tildes/eñes o palabras funcionales del español. */
const SPANISH_MARKERS =
  /[áéíóúñü¿¡]|\b(el|la|los|las|un|una|de|del|para|con|por|que|se|su|tu|es|no|ya|más|sin|este|esta|estos|estas|archivo|empresa|módulo|sesión|correo|contraseña|usuario|rol|cargar|descargar|guardar|buscar|crear|editar|eliminar|intenta|nuevamente|aquí|posible|pendiente|activa|activo)\b/i;

type Finding = { file: string; line: number; text: string };

function englishFindingsInVisibleText(): Finding[] {
  const findings: Finding[] = [];
  const attrRe = /(aria-label|placeholder|title|alt|label)=\{?"([^"]{4,})"/g;
  const jsxTextRe = />\s*([A-Za-z][^<{>]{6,}?)\s*</g;
  const serverMsgRe = /\b(error|message|success)\s*:\s*"([^"]{8,})"/g;

  const scanVisible = (rel: string, patterns: RegExp[]) => {
    const lines = read(rel).split("\n");
    let inBlockComment = false;
    lines.forEach((raw, idx) => {
      const line = raw.trim();
      if (inBlockComment) {
        if (line.includes("*/")) inBlockComment = false;
        return;
      }
      if (line.startsWith("/*") || line.startsWith("{/*")) {
        if (!line.includes("*/")) inBlockComment = true;
        return;
      }
      if (line.startsWith("//") || line.startsWith("*") || line.startsWith("import ")) return;
      for (const re of patterns) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(raw)) !== null) {
          const candidate = (m[2] ?? m[1] ?? "").trim();
          if (candidate.length < 8) continue;
          const cleaned = candidate.replace(ALLOWLIST, " ");
          if (SPANISH_MARKERS.test(cleaned)) continue;
          const englishHits = cleaned.match(ENGLISH_STOPWORDS) ?? [];
          if (englishHits.length >= 2) {
            findings.push({ file: rel, line: idx + 1, text: candidate.slice(0, 90) });
          }
        }
      }
    });
  };

  for (const dir of ["app", "components"]) {
    for (const full of walk(path.join(ROOT, dir))) {
      if (!full.endsWith(".tsx")) continue;
      scanVisible(path.relative(ROOT, full), [attrRe, jsxTextRe]);
    }
  }
  // Mensajes de Server Actions destinados a interfaz (§19).
  for (const full of walk(path.join(ROOT, "server", "actions"))) {
    if (!full.endsWith(".ts")) continue;
    scanVisible(path.relative(ROOT, full), [serverMsgRe]);
  }
  return findings;
}

/** Cadenas visibles con «organización» (el glosario exige «Empresa»). */
function organizationFindings(): Finding[] {
  const findings: Finding[] = [];
  const stringRe = /(["'`])((?:(?!\1).)*organizaci[óo]n(?:(?!\1).)*)\1/gi;
  const jsxRe = />\s*[^<{]*organizaci[óo]n[^<{]*/gi;
  for (const dir of ["app", "components", "server", "lib"]) {
    for (const full of walk(path.join(ROOT, dir))) {
      if (!/\.(ts|tsx)$/.test(full)) continue;
      const rel = path.relative(ROOT, full);
      read(rel).split("\n").forEach((raw, idx) => {
        const line = raw.trim();
        if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*") || line.startsWith("{/*")) return;
        stringRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = stringRe.exec(raw)) !== null) {
          const val = m[2];
          if (/^[a-z_./:\-]+$/.test(val)) continue; // clave interna, no texto
          findings.push({ file: rel, line: idx + 1, text: val.slice(0, 90) });
        }
        jsxRe.lastIndex = 0;
        if (jsxRe.test(raw)) findings.push({ file: rel, line: idx + 1, text: raw.trim().slice(0, 90) });
      });
    }
  }
  return findings;
}

console.log("Trazaloop · T9G: control de español visible y glosario\n");

check("1. Detector §19: cero textos visibles en inglés de alta confianza", () => {
  const findings = englishFindingsInVisibleText();
  const detail = findings
    .slice(0, 8)
    .map((f) => `\n     ${f.file}:${f.line} «${f.text}»`)
    .join("");
  assert(findings.length === 0, `se encontraron ${findings.length} textos en inglés:${detail}`);
});

check("2. Glosario: ninguna cadena visible usa «organización» (siempre «empresa»)", () => {
  const findings = organizationFindings();
  const detail = findings
    .slice(0, 8)
    .map((f) => `\n     ${f.file}:${f.line} «${f.text}»`)
    .join("");
  assert(findings.length === 0, `quedaron ${findings.length} usos visibles:${detail}`);
});

check("3. Términos obligatorios del glosario presentes en la interfaz", () => {
  const team = read("app/(app)/(shell)/team/page.tsx");
  assert(team.includes("Empresa activa"), "«Empresa activa» debía existir en Usuarios y roles");
  const recycled = read("server/actions/recycled.ts");
  assert(recycled.includes("orden / corrida de producción"), "«orden / corrida de producción» requerido");
  assert(recycled.includes("lote producido / lote final"), "«lote producido / lote final» requerido");
  const inputLots = fs.existsSync(path.join(ROOT, "app/(app)/(shell)/textiles/traceability/input-lots/page.tsx"));
  assert(inputLots, "la ruta de «Lotes de entrada» debía existir");
  const authLayout = read("app/(auth)/layout.tsx");
  assert(authLayout.includes("NTC 6632 · UNE-EN 15343"), "«NTC 6632 · UNE-EN 15343» requerido");
  const catalog = read("lib/modules/catalog.ts");
  assert(catalog.includes('"Trazaloop Textiles"'), "«Trazaloop Textiles» requerido");
});

check("4. Los códigos internos de error se muestran mapeados a español (nunca crudos)", () => {
  const intents = read("lib/db/storage-intents.ts");
  for (const code of [
    "MODULE_ACCESS_BLOCKED",
    "STORAGE_QUOTA_EXCEEDED",
    "STORAGE_USAGE_UNVERIFIABLE",
    "OBJECT_SIZE_MISMATCH",
    "OBJECT_MIME_MISMATCH",
    "FILE_SIZE_INVALID",
  ]) {
    assert(intents.includes(code), `el mapeo del código ${code} debía existir`);
  }
  assert(
    intents.includes("El módulo no está disponible para tu empresa en este momento."),
    "MODULE_ACCESS_BLOCKED debía mostrar su mensaje en español con «empresa»"
  );
  const master = read("lib/domain/trazadocs-master.ts");
  assert(
    master.includes("FILE_TOO_LARGE_MESSAGE_DEMO") && master.includes("no puede pesar más de"),
    "los mensajes de tamaño máximo debían seguir en español"
  );
  // El código interno permanece en inglés; solo su representación es visible.
  const denied = moduleAccessDeniedMessage("Trazaloop CPR", "demo_expired");
  assert(/Demo de Trazaloop CPR ha finalizado/.test(denied), "el mensaje de Demo vencido debía estar en español");
});

console.log("\nTrazaloop · T9G: regresión del superadministrador de módulos (§16)\n");

const NOW = new Date("2026-07-23T12:00:00Z");
function decide(assignment: ModuleAccessInput["assignment"], isFunctional = true) {
  return resolveModuleAccess({ isFunctional, killSwitchActive: true, assignment, now: NOW });
}

check("5. Asignación INDEPENDIENTE por módulo: CPR Full + Textiles Demo", () => {
  const cpr = decide({ enabled: true, accessMode: "full", accessExpiresAt: null });
  const tex = decide({ enabled: true, accessMode: "demo", accessExpiresAt: null });
  assert(cpr.allowed && cpr.derivedState === "full", "CPR debía quedar Full");
  assert(tex.allowed && tex.derivedState === "demo_permanent", "Textiles debía quedar Demo permanente");
});

check("6. Asignación INDEPENDIENTE por módulo: CPR Demo + Textiles Extra", () => {
  const cpr = decide({ enabled: true, accessMode: "demo", accessExpiresAt: null });
  const tex = decide({ enabled: true, accessMode: "extra", accessExpiresAt: null });
  assert(cpr.allowed && cpr.derivedState === "demo_permanent", "CPR debía quedar Demo permanente");
  assert(tex.allowed && tex.derivedState === "extra", "Textiles debía quedar Extra");
});

check("7. Asignación INDEPENDIENTE por módulo: CPR deshabilitado + Textiles Full", () => {
  const cpr = decide({ enabled: false, accessMode: "full", accessExpiresAt: null });
  const tex = decide({ enabled: true, accessMode: "full", accessExpiresAt: null });
  assert(!cpr.allowed && cpr.derivedState === "disabled", "CPR debía quedar deshabilitado");
  assert(tex.allowed && tex.derivedState === "full", "Textiles debía quedar Full");
});

check("8. Asignación INDEPENDIENTE por módulo: Textiles deshabilitado + CPR Extra", () => {
  const cpr = decide({ enabled: true, accessMode: "extra", accessExpiresAt: null });
  const tex = decide({ enabled: false, accessMode: "demo", accessExpiresAt: null });
  assert(cpr.allowed && cpr.derivedState === "extra", "CPR debía quedar Extra");
  assert(!tex.allowed && tex.derivedState === "disabled", "Textiles debía quedar deshabilitado");
});

check("9. Los cuatro estados objetivo del superadministrador siguen disponibles", () => {
  const action = read("server/actions/platform-modules.ts");
  assert(
    action.includes('const TARGET_STATES = ["disabled", "demo_permanent", "full", "extra"] as const;'),
    "los estados asignables debían ser exactamente disabled/demo_permanent/full/extra"
  );
});

check("10. Quality y Construcción siguen «Próximamente» y NO asignables", () => {
  const quality = COMMERCIAL_MODULES.find((m) => m.key === "quality");
  const construccion = COMMERCIAL_MODULES.find((m) => m.key === "construccion");
  assert(quality?.status === "coming_soon", "Quality debía seguir coming_soon");
  assert(construccion?.status === "coming_soon", "Construcción debía seguir coming_soon");
  assert(isFunctionalModuleCode("quality") === false, "quality no debía ser asignable");
  assert(isFunctionalModuleCode("construccion") === false, "construccion no debía ser asignable");
  assert(isFunctionalModuleCode(CPR_MODULE_CODE) === true, "CPR debía seguir asignable");
  assert(isFunctionalModuleCode(TEXTILES_MODULE_CODE) === true, "Textiles debía seguir asignable");
  assert(FUNCTIONAL_MODULE_CODES.length === 2, "solo CPR y Textiles debían ser gestionables");
  const comingSoon = decide({ enabled: true, accessMode: "full", accessExpiresAt: null }, false);
  assert(!comingSoon.allowed && comingSoon.derivedState === "coming_soon", "coming_soon jamás permite entrar");
  assert(DERIVED_STATE_LABEL.coming_soon === "Próximamente", "la etiqueta visible debía ser «Próximamente»");
});

check("11. Solo el superadministrador puede cambiar módulos y planes", () => {
  const action = read("server/actions/platform-modules.ts");
  assert(action.includes("requirePlatformStaff"), "la acción debía exigir personal de plataforma");
  assert(
    action.includes("if (!isSuperadmin)") &&
      action.includes("Solo un superadministrador de plataforma puede cambiar el estado de un módulo."),
    "administrador de empresa, supervisor, consultor y usuario normal jamás cambian planes: la acción exige superadmin y responde en español"
  );
  const section = read("components/domain/platform/organization-modules-section.tsx");
  assert(section.length > 0, "la sección de módulos vive solo en la consola de plataforma");
});

check("12. Todas las etiquetas y ayudas del estado comercial están en español", () => {
  const visible = [
    ...Object.values(DERIVED_STATE_LABEL),
    ...Object.values(DERIVED_STATE_HINT),
  ];
  for (const text of visible) {
    const cleaned = text.replace(ALLOWLIST, " ");
    const english = cleaned.match(ENGLISH_STOPWORDS) ?? [];
    assert(
      english.length < 2 || SPANISH_MARKERS.test(cleaned),
      `etiqueta comercial sospechosa de inglés: «${text}»`
    );
  }
  for (const reason of ["demo_expired", "disabled", "globally_disabled", "coming_soon", "not_assigned"] as const) {
    const msg = moduleAccessDeniedMessage("Trazaloop Textiles", reason);
    assert(SPANISH_MARKERS.test(msg), `mensaje de acceso no parece español: «${msg}»`);
  }
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
