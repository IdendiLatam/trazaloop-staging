/**
 * Trazaloop · PE-02B3 · La FAQ que se lee y los dos arrastres de PE-01,
 * comprobados en el código.
 *
 * Correr: npm run test:pe02b3-consumer
 */
import { readFileSync, readdirSync, statSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const leer = (p: string) => readFileSync(p, "utf8");
const PORTADA = leer("app/page.tsx");
const PUERTA = leer("app/(app)/modules/page.tsx");
const ENTRADA = leer("lib/modules/entry.ts");
const CATALOGO = leer("lib/modules/catalog.ts");
const FAQ = leer("app/faq/page.tsx");
const FICHA = leer("app/faq/[slug]/page.tsx");
const CAPA = leer("lib/db/faq-public.ts");
const PIEZAS = leer("components/domain/faq/faq-reader.tsx");
const DOMINIO = leer("lib/domain/faq-reader.ts");
const REGISTRY = leer("lib/modules/registry.ts");
const MIG = leer("supabase/migrations/0157_platform_faq_initial_content.sql");
const SQL = MIG.replace(/^\s*--.*$/gm, "");
/** Lo que de verdad se lee en pantalla: sin comentarios. */
const sinComentarios = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const PORTADA_CODIGO = sinComentarios(PORTADA);
const PUERTA_CODIGO = sinComentarios(PUERTA);

console.log("\nPE-02B3 · La FAQ que se lee, y los arrastres\n");

// ===========================================================================
console.log("A · La portada pública · carryover-01");
// ===========================================================================

check("A1. Quality se pinta APARTE, y antes que los demás", () => {
  const hero = PORTADA_CODIGO.indexOf("modulo-principal");
  const grid = PORTADA_CODIGO.indexOf("modulos-especializados");
  assert(hero > 0, "no hay bloque de módulo principal");
  assert(grid > 0, "no hay bloque de especializados");
  assert(hero < grid, "el protagonista se pinta después de los especializados");
  // Y ya no están los cuatro en la misma rejilla.
  assert(!/<section className="grid gap-4 sm:grid-cols-2">/.test(PORTADA_CODIGO),
    "los cuatro módulos siguen en una rejilla de iguales");
});

check("A2. Y se pinta más grande", () => {
  const bloque = PORTADA_CODIGO.slice(PORTADA_CODIGO.indexOf("modulo-principal"),
    PORTADA_CODIGO.indexOf("modulos-especializados"));
  assert(/text-2xl|text-3xl/.test(bloque), "el protagonista no titula más grande");
  const secundarios = PORTADA_CODIGO.slice(PORTADA_CODIGO.indexOf("modulos-especializados"));
  assert(/text-base font-semibold/.test(secundarios),
    "los especializados no titulan más pequeño");
});

check("A3. Los tres especializados van en rejilla, y se apilan en móvil", () => {
  const bloque = PORTADA_CODIGO.slice(PORTADA_CODIGO.indexOf("modulos-especializados"));
  assert(/sm:grid-cols-2/.test(bloque) && /lg:grid-cols-3/.test(bloque),
    "la rejilla de especializados no declara su forma por tamaño de pantalla");
  assert(!/overflow-x-(auto|scroll)/.test(PORTADA_CODIGO),
    "la portada se desplaza en horizontal");
});

check("A4. La frase de Quality es la congelada, y sale del catálogo", () => {
  assert(/ENTRY_COPY\[hero\.key\]/.test(PORTADA_CODIGO),
    "la frase se escribe a mano en la portada");
  assert(/Gestiona procesos, riesgos, objetivos, personas, proveedores/.test(ENTRADA),
    "la frase congelada desapareció del catálogo de entrada");
});

check("A5. Los módulos salen del CATÁLOGO, no de una lista propia · PEH-19", () => {
  assert(/heroModule\(\)/.test(PORTADA_CODIGO) && /specializedModules\(\)/.test(PORTADA_CODIGO),
    "la portada no usa el catálogo canónico");
  // Ni un nombre de módulo escrito a mano en la portada.
  const nombres = [...CATALOGO.matchAll(/name:\s*"(Trazaloop [^"]+)"/g)].map((m) => m[1]);
  assert(nombres.length === 4, `el catálogo declara ${nombres.length} nombres`);
  for (const n of nombres) {
    assert(!PORTADA_CODIGO.includes(`"${n}"`) && !PORTADA_CODIGO.includes(`>${n}<`),
      `la portada escribe «${n}» a mano`);
  }
});

check("A6. Construcción es inerte: ni enlace, ni botón", () => {
  const bloque = PORTADA_CODIGO.slice(PORTADA_CODIGO.indexOf("modulos-especializados"));
  assert(/Próximamente/.test(bloque), "no se anuncia el módulo futuro");
  assert(!/<button/.test(bloque),
    "el futuro se ofrece como botón deshabilitado, que se anuncia igual que uno vivo");
  assert(/Todavía no está disponible/.test(bloque), "no se explica");
});

check("A7. Y no se toca el registro ni el Demo · §20", () => {
  assert(/Crear cuenta Demo/.test(PORTADA_CODIGO), "desapareció «Crear cuenta Demo»");
  assert(/isPublicRegistrationEnabled/.test(PORTADA_CODIGO), "se quitó el kill switch");
  assert(!/Gratis|Freemium/.test(PORTADA_CODIGO), "se renombró Demo antes de tiempo");
});

check("A8. El estado que se enseña es de PRODUCTO, no de una empresa", () => {
  const bloque = PORTADA_CODIGO.slice(PORTADA_CODIGO.indexOf("modulo-principal"));
  for (const estado of ["No incluido", "Acceso suspendido", "Prueba", "No se pudo verificar"]) {
    assert(!bloque.includes(estado),
      `la portada enseña un estado de empresa antes de entrar: «${estado}»`);
  }
  assert(!/getActiveOrgModuleStatuses|resolveModuleAccess/.test(PORTADA_CODIGO),
    "la portada resuelve acceso comercial de alguien que todavía no ha entrado");
});

// ===========================================================================
console.log("\nB · La copia de /modules · carryover-02");
// ===========================================================================

check("B1. La nota técnica ya no está", () => {
  assert(!/hora del servidor/.test(PUERTA_CODIGO),
    "la puerta sigue hablando de la hora del servidor");
});

check("B2. Y la reemplaza la frase congelada", () => {
  assert(/MODULE_ACCESS_FOOTNOTE/.test(PUERTA_CODIGO), "la puerta no usa la frase congelada");
  assert(ENTRADA.includes("Los módulos disponibles dependen del acceso de tu empresa."),
    "la frase congelada no está");
  assert(ENTRADA.includes("tu rol define las funciones que puedes usar."),
    "falta la segunda mitad de la frase congelada");
});

check("B3. Sin vocabulario interno en lo visible", () => {
  // Solo el texto que se PINTA. Un comentario que explica por qué se retiró la
  // palabra «hora del servidor» tiene que poder nombrarla.
  // Dos cosas y solo dos: los textos entrecomillados largos, y el texto de
  // JSX que empieza como empieza una frase. Así `status.access.derivedState`
  // —que es código y nadie lee— no se confunde con lo que se pinta.
  const fuente = PUERTA_CODIGO + sinComentarios(ENTRADA);
  // Sin saltos de línea dentro: si no, una comilla de una línea se empareja con
  // otra veinte líneas más abajo y el «literal» acaba siendo código.
  const literales = [...fuente.matchAll(/"([^"\n]{12,})"/g)].map((m) => m[1]);
  const prosa = [...fuente.matchAll(/>\s*([A-ZÁÉÍÓÚ¿][^<>{}]{11,})</g)].map((m) => m[1]);
  const visible = [...literales, ...prosa].join(" | ");
  for (const jerga of ["hora del servidor", "entitlement", "derivedState", "RLS",
    "kill switch", "resolver comercial", "tenant"]) {
    assert(!visible.includes(jerga), `sigue apareciendo «${jerga}» en lo visible`);
  }
});

// ===========================================================================
console.log("\nC · Dónde se encuentra la FAQ");
// ===========================================================================

check("C1. Desde fuera: cabecera y pie de la portada", () => {
  const enlaces = [...PORTADA_CODIGO.matchAll(/href="\/faq"/g)];
  assert(enlaces.length >= 2, `solo hay ${enlaces.length} enlaces a la FAQ en la portada`);
});

check("C2. Desde dentro: en la navegación TRANSVERSAL, no dentro de un módulo", () => {
  const sistema = REGISTRY.slice(REGISTRY.indexOf("SISTEMA_GROUP"),
    REGISTRY.indexOf("PLATFORM_GROUP"));
  assert(/href: "\/faq"/.test(sistema),
    "la FAQ no está en el grupo transversal");
  // Y NO dentro de ningún módulo: sería invisible para quien no lo tenga.
  const modulos = REGISTRY.slice(REGISTRY.indexOf("PLATFORM_GROUP"));
  assert(!/{ label: "Preguntas frecuentes", href: "\/faq" }/.test(modulos),
    "la FAQ se ofrece dentro de un módulo concreto");
});

check("C3. Y desde la puerta de módulos", () => {
  assert(/href="\/faq"/.test(PUERTA_CODIGO), "la puerta no lleva a la FAQ");
});

check("C4. La consola de plataforma sigue teniendo la suya · §1", () => {
  const layout = leer("app/(app)/platform/layout.tsx");
  assert(/platform\/faq/.test(layout),
    "el superadministrador no encuentra la administración de la FAQ");
  const plataforma = REGISTRY.slice(REGISTRY.indexOf("PLATFORM_GROUP"));
  assert(/href: "\/platform\/faq"/.test(plataforma),
    "el grupo de plataforma no declara la administración de la FAQ");
});

check("C5. Y la administración NO se ofrece a una empresa", () => {
  const antesDePlataforma = REGISTRY.slice(0, REGISTRY.indexOf("PLATFORM_GROUP"));
  assert(!/platform\/faq|platform\/legal/.test(antesDePlataforma),
    "una superficie de administración se ofrece en la navegación de empresa");
  // La ruta pública y la de administración son distintas y no se confunden.
  assert(!FAQ.includes("/platform/faq"), "la FAQ pública enlaza a la consola");
});

// ===========================================================================
console.log("\nD · Cómo se lee");
// ===========================================================================

check("D1. La página abre con una pregunta, no con un eslogan", () => {
  assert(DOMINIO.includes("¿En qué podemos ayudarte?"), "falta el encabezado");
  assert(/FAQ_HEADLINE/.test(FAQ), "la página no lo usa");
  for (const ruido of ["¡", "Descubre", "Potencia", "revoluciona", "líder"]) {
    assert(!sinComentarios(FAQ).includes(ruido), `hay ruido de marketing: «${ruido}»`);
  }
});

check("D2. Buscador, destacadas, temas y resultados", () => {
  for (const pieza of ["FaqSearch", "FaqCategoryNav", "FaqAnswerCard", "FaqEmptyState"]) {
    assert(FAQ.includes(pieza), `falta ${pieza}`);
  }
});

check("D3. La búsqueda es del SERVIDOR y en español", () => {
  assert(/textSearch\("search_document"/.test(CAPA), "no se usa el documento de búsqueda");
  assert(/config: "spanish"/.test(CAPA), "la búsqueda no se analiza en español");
  assert(/type: "websearch"/.test(CAPA), "no se usa el analizador de búsqueda web");
  // Y no se filtra en el navegador sobre un conjunto parcial.
  assert(!/\.filter\(.*toLowerCase\(\).*includes/.test(PIEZAS),
    "hay filtrado de texto en el cliente");
  assert(!/"use client"/.test(PIEZAS), "las piezas de la FAQ se pintan en el cliente");
});

check("D4. Sin servicios externos, sin vectores y sin IA", () => {
  for (const src of [CAPA, FAQ, FICHA, PIEZAS]) {
    for (const p of ["embedding", "openai", "algolia", "elastic", "vector", "fetch("]) {
      assert(!src.toLowerCase().includes(p), `la FAQ usa «${p}»`);
    }
  }
});

check("D5. Sin cliente administrativo, y solo por las vistas de 0155", () => {
  assert(!/createAdminClient|service_role/i.test(sinComentarios(CAPA)),
    "la capa usa el cliente administrativo");
  const tablas = [...CAPA.matchAll(/from\((?:VISTA\[[a-z.]+\]|"([a-z_]+)")\)/g)]
    .map((m) => m[1]).filter(Boolean);
  assert(tablas.length === 0,
    `la capa consulta tablas directamente: ${tablas.join(", ")}`);
  assert(/v_faq_public/.test(CAPA) && /v_faq_authenticated/.test(CAPA),
    "no se usan las vistas canónicas");
});

check("D6. Los cuatro vacíos son cuatro, y la avería no es uno de resultados", () => {
  for (const c of ["nothing_published", "no_search_results", "empty_category", "unavailable"]) {
    assert(DOMINIO.includes(c), `falta el caso «${c}»`);
  }
  const averia = DOMINIO.slice(DOMINIO.indexOf("FAQ_UNAVAILABLE_TITLE"),
    DOMINIO.indexOf("FAQ_NOT_FOUND_TITLE"));
  assert(/temporal/.test(averia), "la avería no se cuenta como temporal");
  assert(!/no encontramos|no hay preguntas/i.test(averia),
    "una avería se cuenta como ausencia de contenido");
});

check("D7. El enlace de una respuesta es su identificador estable", () => {
  assert(/\$\{base\}\/\$\{answer\.slug\}/.test(PIEZAS), "el enlace no usa el identificador");
  let existe = true;
  try { statSync("app/faq/[slug]/page.tsx"); } catch { existe = false; }
  assert(existe, "no hay página de respuesta individual");
  assert(/getFaqAnswerBySlug/.test(FICHA), "la ficha no resuelve por identificador");
});

check("D8. Los metadatos salen de lo PÚBLICO, y un borrador no llega", () => {
  assert(/generateMetadata/.test(FICHA), "la ficha no declara metadatos");
  assert(/getFaqAnswerBySlug\("public"/.test(FICHA),
    "los metadatos se componen con la vista de quien tiene sesión");
  assert(/robots: \{ index: false \}/.test(FICHA),
    "una respuesta que no se puede leer se ofrece para indexar");
});

// ===========================================================================
console.log("\nE · Accesibilidad y pantalla estrecha");
// ===========================================================================

check("E1. El buscador tiene etiqueta y se anuncia como búsqueda", () => {
  assert(/role="search"/.test(PIEZAS), "el formulario no se anuncia como búsqueda");
  assert(/aria-label=\{FAQ_SEARCH_LABEL\}/.test(PIEZAS), "el campo no tiene nombre accesible");
  assert(/<span className="sr-only">/.test(PIEZAS), "no hay etiqueta para lectores de pantalla");
});

check("E2. Los temas son enlaces con estado, no pestañas mudas", () => {
  assert(/aria-current=\{active/.test(PIEZAS), "no se anuncia el tema activo");
  assert(/<nav aria-label="Temas/.test(PIEZAS), "la lista de temas no es una navegación");
  // El estado no se dice solo con color.
  assert(/font-medium/.test(PIEZAS), "el tema activo se distingue solo por color");
});

check("E3. Encabezados con jerarquía", () => {
  // La ficha declara tres `h1` —avería, no encontrada, respuesta— y son ramas
  // EXCLUYENTES: solo se pinta una. Que sea una sola en el HTML lo comprueba el
  // recorrido por HTTP, que es donde se puede contar de verdad.
  for (const [n, src] of [["la lista", FAQ], ["la ficha", FICHA]] as const) {
    assert((src.match(/<h1/g) ?? []).length >= 1, `${n} no tiene encabezado principal`);
    assert(/<h2/.test(src), `${n} no usa encabezados de segundo nivel`);
  }
  assert(/<h3/.test(PIEZAS), "las respuestas no llevan encabezado");
});

check("E4. Sin acordeones y sin desplazamiento horizontal", () => {
  assert(!/aria-expanded/.test(sinComentarios(PIEZAS)),
    "hay un acordeón: una respuesta corta cabe entera y plegarla añade una pulsación");
  for (const [n, src] of [["la lista", FAQ], ["la ficha", FICHA], ["las piezas", PIEZAS]] as const) {
    assert(!/overflow-x-(auto|scroll)/.test(src), `${n} se desplaza en horizontal`);
    assert(!/\bw-\[\d{3,}px\]/.test(src), `${n} tiene un ancho fijo en píxeles`);
    assert(!/<table/.test(src), `${n} usa una tabla para leer respuestas`);
  }
});

check("E5. El foco se ve", () => {
  const enlaces = (PIEZAS.match(/focus-visible:outline/g) ?? []).length;
  assert(enlaces >= 2, `solo ${enlaces} elementos declaran foco visible`);
});

// ===========================================================================
console.log("\nF · El contenido sembrado");
// ===========================================================================

check("F1. Es una migración, es la 0157, y no crea esquema", () => {
  const nuevas = readdirSync("supabase/migrations").filter((f) => /^015[7-9]|^01[6-9]\d/.test(f));
  assert(nuevas.length === 1, `hay ${nuevas.length} migraciones nuevas: ${nuevas.join(", ")}`);
  assert(nuevas[0].startsWith("0157_platform_faq_initial_content"), `se llama ${nuevas[0]}`);
  assert(!/create table|alter table|create policy|drop policy/i.test(SQL),
    "0157 crea o cambia esquema, y solo debía sembrar contenido");
});

check("F2. La siembra NO se salta la barrera de verificación", () => {
  assert(/faq_publish_entry_internal/.test(SQL), "la siembra no pasa por la publicación canónica");
  const interna = SQL.slice(SQL.indexOf("function public.faq_publish_entry_internal"),
    SQL.indexOf("create or replace function public.faq_publish_entry("));
  for (const estado of ["external_policy_verification_required", "not_verified",
    "must_not_claim"]) {
    assert(interna.includes(estado), `la barrera perdió el estado «${estado}»`);
  }
  assert(/raise exception 'Esta respuesta no se puede publicar/.test(interna),
    "la barrera dejó de rechazar");
  // Y no se insertan revisiones a mano en ningún sitio de la migración.
  const fuera = SQL.replace(/function public\.faq_publish_entry_internal[\s\S]*?\$\$;/, "");
  assert(!/insert into faq_entry_revisions/.test(fuera),
    "la siembra escribe revisiones a mano, saltándose la publicación");
});

check("F3. La puerta de la aplicación sigue exigiendo superadministrador", () => {
  const publica = SQL.slice(SQL.indexOf("create or replace function public.faq_publish_entry("));
  assert(/if not is_platform_superadmin\(\) then/.test(publica.slice(0, 900)),
    "faq_publish_entry dejó de comprobar quién publica");
  assert(/faq_publish_entry_internal\(p_entry_id, p_language, p_change_note, auth\.uid\(\)\)/
    .test(publica), "la puerta no delega en la función interna");
  assert(/revoke all on function public\.faq_publish_entry_internal[^;]*from public, anon, authenticated/
    .test(SQL), "la función interna se concede a alguien");
});

check("F4. Y la herramienta de siembra no se queda", () => {
  assert(/drop function public\.faq_seed_entry/.test(SQL),
    "la función de siembra se queda como una puerta más");
});

check("F5. Nada bloqueado, ninguna cifra comercial", () => {
  const contenido = SQL.slice(SQL.indexOf("faq_seed_entry("));
  assert(!/'seguridad'/.test(contenido),
    "se siembra en la categoría de seguridad, y esa es de B5");
  assert(!/entrenar model|entrenamiento de model/i.test(contenido),
    "se siembra la respuesta del entrenamiento de modelos");
  assert(!/US\$|USD|€|\b\d+ ?(MB|GB)\b/i.test(contenido),
    "se siembra una cifra comercial");
});

check("F6. Y todo lo sembrado se declara verificado, con su base", () => {
  const llamadas = MIG.split("select public.faq_seed_entry(").slice(1);
  assert(llamadas.length >= 20, `solo hay ${llamadas.length} respuestas sembradas`);
  for (const l of llamadas) {
    assert(/'verified'/.test(l), "una respuesta sembrada no se declara verificada");
    assert(!/'not_verified'|'must_not_claim'|'external_policy_verification_required'/.test(l),
      "una respuesta sembrada llega con un estado que no se puede publicar");
  }
});

check("F7. docs/FAQ_PILOT.md se conserva, y se marca como sustituido", () => {
  const piloto = leer("docs/FAQ_PILOT.md");
  assert(piloto.length > 100, "se borró el archivo del piloto");
  assert(/SUSTITUIDO|SUPERSEDED/i.test(piloto),
    "el archivo del piloto no se marca como sustituido");
  assert(/\/faq|FAQ administrada|PE_02B/i.test(piloto),
    "no se dice dónde vive ahora la FAQ canónica");
});

console.log(`\nPE-02B3 · lectura (código): ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
