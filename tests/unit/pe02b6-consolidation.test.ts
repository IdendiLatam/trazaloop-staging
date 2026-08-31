/**
 * Trazaloop · PE-02B6 · La consolidación de PE-02, leída en el código.
 *
 * Este tramo no construye: cierra. Lo que estas comprobaciones protegen es que
 * lo cerrado siga cerrado —una entrada de ayuda que desaparece de una pantalla,
 * un texto de ayuda que vuelve a competir con su constante, una cifra comercial
 * que se cuela en la FAQ— y que la puerta de publicación de B5B siga cerrada.
 *
 * Correr: npm run test:pe02b6-consolidation
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const leer = (p: string) => readFileSync(p, "utf8");
const sinComentarios = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const SHELL = leer("app/(app)/(shell)/layout.tsx");
const PUERTA = leer("app/(app)/modules/page.tsx");
const PLATAFORMA = leer("app/(app)/platform/layout.tsx");
const SELECT_ORG = leer("app/(app)/select-org/page.tsx");
const PERFIL = leer("app/(app)/settings/profile/page.tsx");
const REGISTRY = leer("lib/modules/registry.ts");
const PORTADA = leer("app/page.tsx");
const SEMILLA = leer("scripts/pe02b5a/seed-drafts.sql");
const TEXTO_FAQ = SEMILLA.replace(/^\s*--.*$/gm, "");
const POLITICA = leer("docs/legal/V1.1.0_PRIVACY_POLICY_SUCCESSOR_DRAFT.md");
const PARTES = leer("lib/domain/quality-interested-parties.ts");

console.log("\nPE-02B6 · La consolidación de PE-02\n");

// ===========================================================================
console.log("A · «Ayuda» en toda pantalla autenticada normal");
// ===========================================================================

check("A1. Está en las cinco superficies que la necesitan", () => {
  const superficies: [string, string][] = [
    ["el shell de módulo", SHELL], ["la puerta de módulos", PUERTA],
    ["la consola de plataforma", PLATAFORMA], ["seleccionar empresa", SELECT_ORG],
    ["mi perfil", PERFIL],
  ];
  for (const [n, src] of superficies) {
    const visible = sinComentarios(src);
    assert(/href="\/faq"/.test(visible), `${n} no lleva a la ayuda`);
    assert(/>\s*Ayuda\s*</.test(visible), `${n} no la llama «Ayuda»`);
  }
});

check("A2. Y toda página autenticada cae en una de ellas", () => {
  // Una página o vive en un envoltorio con barra —(shell), /platform— o es una
  // de las tres sueltas. Si aparece una cuarta suelta, esta prueba lo dice.
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`)
      : e.name === "page.tsx" ? [`${dir}/${e.name}`] : []);
  const sueltas = walk("app/(app)")
    .filter((p) => !p.includes("(shell)") && !p.includes("(print)")
      && !p.includes("/platform/"));
  const conocidas = new Set([
    "app/(app)/modules/page.tsx", "app/(app)/select-org/page.tsx",
    "app/(app)/settings/profile/page.tsx", "app/(app)/platform/page.tsx",
  ]);
  const nuevas = sueltas.filter((p) => !conocidas.has(p));
  assert(nuevas.length === 0,
    `hay pantallas autenticadas fuera de todo envoltorio con barra: ${nuevas.join(", ")}`);
});

check("A3. Las excepciones son las acordadas, y siguen sin ella", () => {
  for (const f of ["app/(auth)/login/page.tsx", "app/(auth)/register/page.tsx",
    "app/legal/accept/page.tsx", "app/accept-invite/page.tsx"]) {
    if (!existsSync(f)) continue;
    assert(!/href="\/faq"/.test(sinComentarios(leer(f))),
      `${f} ganó una entrada de ayuda, y ahí no hay barra por decisión`);
  }
  // Y las vistas de impresión tampoco: imprimirían el enlace.
  const impresion = leer("app/(app)/(print)/layout.tsx");
  assert(!/href="\/faq"/.test(impresion), "las vistas imprimibles ganaron un enlace de ayuda");
});

check("A4. No se esconde por tamaño de pantalla", () => {
  for (const [n, src] of [["el shell", SHELL], ["la puerta", PUERTA]] as const) {
    const visible = sinComentarios(src);
    const i = visible.indexOf('href="/faq"');
    const contexto = visible.slice(Math.max(0, i - 350), i + 120);
    assert(!/hidden\s+[a-z]{2}:(flex|block|inline)/.test(contexto),
      `${n} esconde la ayuda en pantallas estrechas`);
  }
});

// ===========================================================================
console.log("\nB · Un solo nombre dentro, otro fuera");
// ===========================================================================

check("B1. Dentro se llama «Ayuda», siempre", () => {
  const sistema = REGISTRY.slice(REGISTRY.indexOf("SISTEMA_GROUP"),
    REGISTRY.indexOf("PLATFORM_GROUP"));
  assert(/\{ label: "Ayuda", href: "\/faq" \}/.test(sistema),
    "la navegación transversal no llama «Ayuda» a la entrada de ayuda");
  // Y no queda ningún «Preguntas frecuentes» apuntando a /faq dentro.
  for (const [n, src] of [["el shell", SHELL], ["la puerta", PUERTA],
    ["seleccionar empresa", SELECT_ORG], ["mi perfil", PERFIL],
    ["la navegación", REGISTRY]] as const) {
    const visible = sinComentarios(src);
    const enlaces = [...visible.matchAll(/href="\/faq"[\s\S]{0,200}?<\/Link>/g)]
      .map((m) => m[0]);
    for (const e of enlaces) {
      assert(!/Preguntas frecuentes/.test(e),
        `${n} llama «Preguntas frecuentes» a la entrada global, y dentro es «Ayuda»`);
    }
  }
});

check("B2. Fuera sigue llamándose «Preguntas frecuentes»", () => {
  const visible = sinComentarios(PORTADA);
  assert(/Preguntas frecuentes/.test(visible),
    "la portada pública perdió el nombre por el que se busca desde fuera");
  assert(/href="\/faq"/.test(visible), "la portada no lleva a la ayuda");
});

check("B3. Y la consola de contenido conserva su propio nombre", () => {
  // «Preguntas frecuentes» en /platform nombra LO QUE SE ADMINISTRA, no una
  // entrada de ayuda: son cosas distintas y no compiten.
  assert(/href="\/platform\/faq"/.test(PLATAFORMA),
    "desapareció la administración de la FAQ");
  const i = PLATAFORMA.indexOf('href="/platform/faq"');
  assert(/Preguntas frecuentes/.test(PLATAFORMA.slice(i, i + 250)),
    "la consola de contenido dejó de nombrar lo que administra");
});

// ===========================================================================
console.log("\nC · La ayuda contextual tiene una sola verdad");
// ===========================================================================

check("C1. La precedencia es determinista y está escrita", () => {
  assert(/const administrada = help\?\.\[key\];\s*\n\s*if \(administrada\) return administrada;/
    .test(PARTES), "la precedencia entre la ayuda administrada y la constante no es explícita");
  assert(/NO es doble verdad/.test(PARTES),
    "no queda escrito por qué conviven la constante y la ayuda administrada");
  assert(/respaldo/i.test(PARTES), "no se dice que la constante es solo respaldo");
});

check("C2. Las once claves coinciden una a una", () => {
  const i = PARTES.indexOf("INTERESTED_PARTIES_HELP = {");
  const bloque = PARTES.slice(i, PARTES.indexOf("} as const;", i));
  const claves = [...bloque.matchAll(/^  ([a-z_]+):/gm)].map((m) => m[1]);
  assert(claves.length === 11, `la constante tiene ${claves.length} claves y son 11`);
  // La migración siembra exactamente esas once.
  const mig = leer("supabase/migrations/0158_platform_contextual_help.sql");
  for (const k of claves) {
    assert(new RegExp(`'${k}',`).test(mig), `«${k}» no se sembró como ayuda administrada`);
  }
});

check("C3. Ningún otro objetivo tiene ayuda administrada Y constante", () => {
  // Las siete familias aplazadas no se sembraron: si alguien sembrara una sin
  // cambiar su pantalla, habría dos textos compitiendo.
  const mig = leer("supabase/migrations/0158_platform_contextual_help.sql");
  for (const familia of ["LIFECYCLE_HELP", "CLASSIFICATION_HELP", "ACTION_KIND_HELP",
    "OBJECTIVE_RULE_HELP", "NATIVE_SOURCE_NATURE_HELP", "MOVEMENT_KIND_HELP",
    "DEFENSIBILITY_HELP"]) {
    assert(!mig.includes(familia), `${familia} se sembró sin migrar su pantalla`);
  }
  const paginas = mig.match(/'quality\.[a-z_.]+'/g) ?? [];
  const unicas = new Set(paginas);
  assert(unicas.size === 1,
    `se sembró ayuda para ${unicas.size} pantallas y solo una está migrada`);
});

check("C4. Y el respaldo está inventariado, no escondido", () => {
  const p = "docs/platform-experience/PE_02B6_DEFERRED_HELP_BACKLOG.md";
  assert(existsSync(p), "no existe el inventario de la ayuda aplazada");
  const doc = leer(p);
  for (const familia of ["LIFECYCLE_HELP", "CLASSIFICATION_HELP", "ACTION_KIND_HELP",
    "OBJECTIVE_RULE_HELP", "NATIVE_SOURCE_NATURE_HELP", "MOVEMENT_KIND_HELP",
    "DEFENSIBILITY_HELP"]) {
    assert(doc.includes(familia), `el inventario no menciona ${familia}`);
  }
  assert(/no se invent|no inventar|sin inventar|no se fabric/i.test(doc),
    "el inventario no dice que no se inventó contenido");
});

// ===========================================================================
console.log("\nD · Las dos confirmaciones humanas");
// ===========================================================================

check("D1. El entrenamiento distingue las dos mitades", () => {
  const i = TEXTO_FAQ.indexOf("seguridad_entrenamiento_modelos");
  const r = TEXTO_FAQ.slice(i, TEXTO_FAQ.indexOf("seguridad_retencion_proveedor"));
  assert(/no ha activado/i.test(r), "no se dice que Trazaloop no activó la autorización");
  assert(/documentación oficial/i.test(r), "no se atribuye la política al proveedor");
  assert(/verified_with_qualifier/.test(r), "no está marcada como verificada con salvedad");
  // La procedencia dice que son DOS fuentes.
  assert(/dos fuentes distintas/i.test(r),
    "la procedencia no distingue la política del proveedor de la confirmación humana");
});

check("D2. Y NO promete que el proveedor no entrenará jamás", () => {
  const t = TEXTO_FAQ.toLowerCase();
  for (const p of ["nunca entrenará", "no entrenará nunca", "bajo ninguna circunstancia",
    "jamás se usarán para entrenar"]) {
    const i = t.indexOf(p);
    if (i < 0) continue;
    const contexto = t.slice(Math.max(0, i - 80), i + 30);
    assert(/no se puede escribir|no se afirma|no afirma/.test(contexto),
      `se promete «${p}»`);
  }
});

check("D3. La retención dice que NO hay retención cero", () => {
  const i = TEXTO_FAQ.indexOf("seguridad_retencion_proveedor");
  const r = TEXTO_FAQ.slice(i, TEXTO_FAQ.indexOf("seguridad_modelo_sin_base"));
  assert(/no tiene contratado un acuerdo de retención cero|no lo tenemos/i.test(r),
    "no se dice que no hay retención cero");
  assert(/HASTA 30 DÍAS|hasta 30 días/i.test(r), "no se dice el plazo del proveedor");
  assert(/no es un acuerdo de retención cero|NO es un acuerdo de retención cero/i.test(r),
    "no se distingue pedir que no se almacene de la retención cero");
  assert(/verified_with_qualifier/.test(r), "no está marcada con salvedad");
});

check("D4. Ninguna respuesta afirma retención cero", () => {
  // Negarlas es justo lo que hay que hacer —«no hay retención cero
  // contratada»—; lo que no se puede es afirmarlas.
  const t = TEXTO_FAQ.toLowerCase();
  for (const p of ["retención cero contratada", "tenemos retención cero",
    "no se conserva nada", "no conserva nada"]) {
    const i = t.indexOf(p);
    if (i < 0) continue;
    const contexto = t.slice(Math.max(0, i - 70), i + 10);
    assert(/\bno\b|tampoco|sin /.test(contexto),
      `se afirma «${p}» y la dirección confirmó lo contrario: «${contexto.trim()}»`);
  }
});

check("D5. La política sucesora recoge las dos confirmaciones", () => {
  const i = POLITICA.indexOf("### 18.3");
  const seccion = POLITICA.slice(i, POLITICA.indexOf("### 18.4"));
  assert(/No se ha activado/i.test(seccion),
    "la política no dice que no se activó el uso para entrenamiento");
  assert(/No se tiene contratado/i.test(seccion),
    "la política no dice que no hay retención cero");
  assert(!/PENDIENTE DE CONFIRMACIÓN HUMANA/.test(seccion),
    "la política mantiene un aviso de pendiente que ya se resolvió");
  // Y sigue sin prometer lo imposible.
  const cierre = POLITICA.slice(POLITICA.indexOf("### 18.4"), POLITICA.indexOf("## 19."));
  assert(/no vayan a entrenarse nunca/i.test(cierre),
    "no se aclara que no se promete que jamás se entrene");
});

// ===========================================================================
console.log("\nE · Nada comercial adelantado");
// ===========================================================================

check("E1. Ni en los borradores ni en la política", () => {
  for (const [n, src] of [["los borradores", TEXTO_FAQ], ["la política", POLITICA]] as const) {
    // Con frontera de palabra: «encuesta» contiene «cuesta».
    for (const p of ["US\\$", "USD ", "€", "precio de", "\\bcuesta\\b", "\\btarifa\\b"]) {
      assert(!new RegExp(p, "i").test(src), `${n} adelanta un dato comercial: «${p}»`);
    }
    assert(!/\b\d+\s?(MB|GB)\b/.test(src), `${n} escribe una cuota de almacenamiento`);
    assert(!/\b\d+\s?consultas\b|\b\d+\s?(horas|días) de respuesta\b/.test(src),
      `${n} escribe una cuota de IA o un compromiso de respuesta`);
  }
});

check("E2. Y el plazo de 30 días es del proveedor, no un compromiso nuestro", () => {
  const i = TEXTO_FAQ.indexOf("seguridad_retencion_proveedor");
  const r = TEXTO_FAQ.slice(i, TEXTO_FAQ.indexOf("seguridad_modelo_sin_base"));
  assert(/documentación oficial del proveedor|Según la documentación/i.test(r),
    "el plazo de 30 días no se atribuye al proveedor");
});

// ===========================================================================
console.log("\nF · La puerta de B5B");
// ===========================================================================

check("F1. Está documentada, y dice qué la abre", () => {
  const p = "docs/platform-experience/PE_02B6_B5B_PUBLICATION_PLAN.md";
  assert(existsSync(p), "no existe el plan de publicación de B5B");
  const doc = leer(p);
  for (const paso of ["política de privacidad", "reaceptación", "seguridad"]) {
    assert(doc.toLowerCase().includes(paso), `el plan no contempla «${paso}»`);
  }
  assert(/aprobaci[óo]n/i.test(doc), "el plan no dice que hace falta aprobación humana");
});

check("F2. Y el paquete de revisión existe", () => {
  const p = "docs/platform-experience/PE_02B6_HUMAN_REVIEW_PACKAGE.md";
  assert(existsSync(p), "no existe el paquete de revisión humana");
  const doc = leer(p);
  // Las diez secciones que pide el encargo.
  for (const s of ["FAQ", "ayuda contextual", "privacidad", "entrenamiento",
    "retención", "personal", "Ayuda"]) {
    assert(doc.toLowerCase().includes(s.toLowerCase()),
      `el paquete no cubre «${s}»`);
  }
});

check("F3. Nada de esto publica nada", () => {
  assert(!/faq_publish_entry|legal_publish_document|help_publish_item/.test(SEMILLA),
    "el guion de borradores publica contenido");
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`)
      : /\.(sql|ts)$/.test(e.name) ? [`${dir}/${e.name}`] : []);
  for (const f of walk("scripts")) {
    const src = leer(f).replace(/^\s*--.*$/gm, "");
    assert(!/legal_publish_document/.test(src),
      `${f} activaría una política legal`);
  }
});

// ===========================================================================
console.log("\nG · Los arrastres de PE-01, cerrados");
// ===========================================================================

check("G1. La portada mantiene la jerarquía", () => {
  const visible = sinComentarios(PORTADA);
  const hero = visible.indexOf("modulo-principal");
  const resto = visible.indexOf("modulos-especializados");
  assert(hero > 0 && resto > hero, "se perdió la jerarquía de la portada");
  assert(/heroModule\(\)/.test(visible), "la portada dejó de leer el catálogo");
});

check("G2. Y /modules mantiene la copia acordada", () => {
  const visible = sinComentarios(PUERTA);
  assert(!/hora del servidor/.test(visible), "volvió la nota técnica");
  assert(/MODULE_ACCESS_FOOTNOTE/.test(visible), "se perdió la frase acordada");
  const entrada = leer("lib/modules/entry.ts");
  assert(entrada.includes("Los módulos disponibles dependen del acceso de tu empresa."),
    "desapareció la frase congelada");
});

console.log(`\nPE-02B6 · consolidación: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
