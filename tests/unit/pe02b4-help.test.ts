/**
 * Trazaloop · PE-02B4 · La ayuda contextual y la entrada global, en el código.
 *
 * Correr: npm run test:pe02b4-help-static
 */
import { readFileSync, readdirSync, statSync } from "node:fs";

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

const MIG = leer("supabase/migrations/0158_platform_contextual_help.sql");
const SQL = MIG.replace(/^\s*--.*$/gm, "");
const REGISTRO = leer("lib/modules/page-keys.ts");
const CARGA = leer("lib/db/contextual-help.ts");
const DOMINIO = leer("lib/domain/contextual-help.ts");
const PLAT = leer("lib/db/help-platform.ts");
const ACCIONES = leer("server/actions/help-admin.ts");
const HINT = leer("components/ui/section-hint.tsx");
const SHELL = leer("app/(app)/(shell)/layout.tsx");
const PUERTA = leer("app/(app)/modules/page.tsx");
const PLATAFORMA = leer("app/(app)/platform/layout.tsx");
const SELECT_ORG = leer("app/(app)/select-org/page.tsx");
const REGISTRY = leer("lib/modules/registry.ts");
const PARTES = leer("lib/domain/quality-interested-parties.ts");

console.log("\nPE-02B4 · La ayuda contextual\n");

// ===========================================================================
console.log("A · Un solo componente de interacción");
// ===========================================================================

check("A1. No nació un segundo motor de tooltips", () => {
  const prohibidos = ["ContextHelpPopover", "FaqTooltip", "QualityHelpBubble",
    "HelpPopover", "Tooltip"];
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`)
      : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
  for (const f of walk("components")) {
    const src = sinComentarios(leer(f));
    for (const p of prohibidos) {
      assert(!new RegExp(`(function|const) ${p}\\b`).test(src),
        `${f} declara ${p}: hay un segundo motor de ayuda`);
    }
  }
});

check("A2. SectionHint conserva lo que lo hacía accesible", () => {
  for (const promesa of ['type="button"', "aria-expanded", 'aria-label="Más información"',
    "Escape", "buttonRef.current?.focus()"]) {
    assert(HINT.includes(promesa), `SectionHint perdió «${promesa}»`);
  }
  assert(/if \(!hint \|\| !hasHintContent\(hint\.text\)\) return null;/.test(HINT),
    "SectionHint dejó de no pintar nada cuando no hay contenido");
});

check("A3. La ayuda administrada llega por el MISMO contrato", () => {
  assert(/helpToHint/.test(DOMINIO), "no hay puente hacia el contrato del componente");
  assert(!/section-hint/.test(sinComentarios(CARGA)),
    "la capa de datos conoce el componente de pantalla");
});

// ===========================================================================
console.log("\nB · La migración");
// ===========================================================================

check("B1. La ayuda contextual cabe en UNA migración, la 0158", () => {
  // Esta comprobación exigía que la 0158 fuera la última del repositorio. Servía
  // mientras PE-02B4 era el último tramo; PE-03B1 añadió la 0159 y la
  // afirmación pasó a ser una foto del calendario, no una promesa.
  //
  // Lo que sí sigue siendo promesa: que la ayuda contextual se construyó en una
  // sola migración y que nadie le ha añadido otra por detrás. Si un día hiciera
  // falta una segunda, sería una decisión, no un descuido.
  const deAyuda = readdirSync("supabase/migrations")
    .filter((f) => /contextual_help|_help_/.test(f));
  assert(deAyuda.length === 1, `hay ${deAyuda.length} migraciones de ayuda: ${deAyuda.join(", ")}`);
  assert(deAyuda[0] === "0158_platform_contextual_help.sql", `se llama ${deAyuda[0]}`);
});

check("B2. No toca las migraciones de la FAQ ni las legales", () => {
  for (const ajena of ["faq_entries", "faq_entry_revisions", "faq_categories",
    "legal_documents", "trazadoc_authoring_guidance"]) {
    assert(!new RegExp(`(alter|drop) table[^;]*${ajena}`, "i").test(SQL),
      `0158 altera ${ajena}`);
  }
});

check("B3. Tres tablas, con la forma acordada", () => {
  for (const t of ["help_items", "help_item_revisions", "help_item_drafts"]) {
    assert(SQL.includes(`create table public.${t} (`), `falta ${t}`);
  }
  // La identidad no guarda el texto.
  const identidad = SQL.slice(SQL.indexOf("create table public.help_items ("),
    SQL.indexOf("create table public.help_item_revisions ("));
  for (const c of ["explanation", "example", "technical_reference", "title"]) {
    assert(!new RegExp(`^\\s+${c}\\s`, "m").test(identidad),
      `la identidad guarda «${c}»: cambiar el texto movería la identidad`);
  }
});

check("B4. Sin organization_id, y sin ruta en la identidad", () => {
  assert(!/organization_id/.test(SQL),
    "la ayuda lleva organization_id: es catálogo del producto, no dato de empresa");
  const identidad = SQL.slice(SQL.indexOf("create table public.help_items ("),
    SQL.indexOf("create table public.help_item_revisions ("));
  for (const c of ["route", "url", "path", "href"]) {
    assert(!new RegExp(`^\\s+${c}\\s`, "m").test(identidad),
      `la identidad guarda «${c}»: la URL no es identidad`);
  }
});

check("B5. Revisiones inmutables por DISPARADOR", () => {
  assert(/create or replace function public\.help_revision_is_immutable/.test(SQL),
    "no hay freno de inmutabilidad");
  assert(/create trigger t_help_revisions_immutable[\s\S]{0,160}before update or delete/
    .test(SQL), "el freno no es un disparador: una política no frena a service_role");
  assert(/create unique index help_revisions_vigente[\s\S]{0,200}where effective_to is null/
    .test(SQL), "no se garantiza una sola revisión vigente");
});

check("B6. El borrador vive aparte", () => {
  assert(SQL.includes("create table public.help_item_drafts ("), "no hay tabla de borradores");
  const rev = SQL.slice(SQL.indexOf("create table public.help_item_revisions ("),
    SQL.indexOf("create or replace function public.help_revision_is_immutable"));
  assert(!/status\s+text[^;]*'draft'/.test(rev), "el borrador vive dentro de las revisiones");
});

check("B7. Publicar exige superadministrador, y la interna no se concede", () => {
  const publica = SQL.slice(SQL.indexOf("create or replace function public.help_publish_item("));
  assert(/if not is_platform_superadmin\(\) then/.test(publica.slice(0, 900)),
    "publicar no comprueba quién publica");
  assert(/revoke all on function public\.help_publish_item_internal[^;]*from public, anon, authenticated/
    .test(SQL), "la función interna se concede a alguien");
  for (const fn of ["help_publish_item", "help_unpublish_item",
    "help_restore_revision_to_draft"]) {
    const f = SQL.slice(SQL.indexOf(`function public.${fn}(`));
    assert(/set search_path = public/.test(f.slice(0, 400)), `${fn} no fija search_path`);
  }
});

check("B8. La herramienta de siembra se va", () => {
  assert(/drop function public\.help_seed_item/.test(SQL),
    "la función de siembra se queda como una puerta más");
});

check("B9. Y no se toca la guía de autoría de TrazaDocs", () => {
  assert(!/trazadoc/i.test(SQL.replace(/--.*/g, "")),
    "0158 toca la infraestructura de TrazaDocs");
});

// ===========================================================================
console.log("\nC · El registro de pantallas");
// ===========================================================================

check("C1. Existe, es único, y vive con los módulos", () => {
  assert(REGISTRO.includes("export const PAGE_KEYS"), "no hay registro");
  const archivos = readdirSync("lib/modules");
  assert(archivos.includes("page-keys.ts"), "el registro no está en lib/modules");
  // Y NO hay un segundo registro escondido.
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`)
      : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
  const otros = walk("lib").concat(walk("components"))
    .filter((f) => !f.endsWith("page-keys.ts"))
    .filter((f) => /export const (PAGE_KEYS|TUTORIAL_PAGE_KEYS|HELP_PAGE_KEYS)/.test(leer(f)));
  assert(otros.length === 0, `hay un segundo registro de pantallas: ${otros.join(", ")}`);
});

check("C2. Sus claves empiezan por un módulo canónico", () => {
  assert(/from "@\/lib\/modules\/catalog"/.test(REGISTRO),
    "el registro no se apoya en el catálogo de módulos");
  const claves = [...REGISTRO.matchAll(/key: "([a-z0-9_.]+)"/g)].map((m) => m[1]);
  assert(claves.length >= 5, `el registro tiene ${claves.length} pantallas`);
  const modulos = new Set(["cpr", "textiles", "quality", "construccion", "platform"]);
  for (const k of claves) {
    assert(modulos.has(k.split(".")[0]), `«${k}» no empieza por un módulo canónico`);
  }
});

check("C3. La ruta es informativa, no identidad", () => {
  assert(/no forma parte de la identidad/.test(REGISTRO),
    "el registro no dice que la ruta es informativa");
  // PE-03B4 · Se lee SOLO el bloque de PAGE_KEYS. El fichero tiene ahora una
  // segunda lista —las pantallas excluidas a propósito—, y esas declaran ruta
  // sin clave: contarlas juntas daría 187 rutas para 152 claves y haría fallar
  // esta comprobación por una razón que no tiene nada que ver con lo que mide.
  const BLOQUE = REGISTRO.slice(
    REGISTRO.indexOf("export const PAGE_KEYS"),
    REGISTRO.indexOf("export function resolvePageKeyForPath"));
  const claves = [...BLOQUE.matchAll(/key: "([a-z0-9_.]+)"/g)].map((m) => m[1]);
  const rutas = [...BLOQUE.matchAll(/route: "([^"]+)"/g)].map((m) => m[1]);
  assert(claves.length === rutas.length, "no todas las pantallas declaran su ruta");
  // Que una clave sencilla coincida con su ruta es natural y no prueba nada.
  // Lo que se comprueba es que la clave NO SE DERIVE de la ruta: si lo hiciera,
  // todas coincidirían, y cambiar una dirección movería una identidad.
  const distintas = claves.filter(
    (k, i) => k.replace(/\./g, "/") !== rutas[i].replace(/^\//, ""));
  assert(distintas.length > 0,
    "todas las claves son su ruta escrita con puntos: la identidad depende de la URL");
  // Y la base no guarda la ruta: comprobado también en B4.
  assert(!/route|url|path/.test(SQL.slice(SQL.indexOf("create table public.help_items ("),
    SQL.indexOf("create table public.help_item_revisions ("))),
    "la identidad de la ayuda guarda la ruta");
});

check("C4. Y está declarado como el registro también de PE-03", () => {
  assert(/PE-03/.test(REGISTRO), "el registro no dice que los tutoriales lo reutilizarán");
  assert(!/tutorial_page_key|help_page_key/i.test(sinComentarios(REGISTRO)),
    "el registro ya contempla una segunda familia de claves");
});

// ===========================================================================
console.log("\nD · La carga");
// ===========================================================================

check("D1. Por PANTALLA, no por botón", () => {
  assert(/export async function getPageHelp/.test(CARGA), "no hay carga por pantalla");
  // Una sola llamada a `from` en cada función de carga.
  for (const fn of ["getPageHelp", "getHelpForPages"]) {
    const i = CARGA.indexOf(`export async function ${fn}`);
    const cuerpo = CARGA.slice(i, CARGA.indexOf("\n}", i));
    const consultas = (cuerpo.match(/supabase\s*\n?\s*\.from\(|supabase\.from\(/g) ?? []).length;
    assert(consultas === 1, `${fn} hace ${consultas} consultas`);
  }
});

check("D2. Y solo por la vista, sin cliente administrativo", () => {
  assert(/v_help_effective/.test(CARGA), "no se usa la vista canónica");
  const tablas = [...sinComentarios(CARGA).matchAll(/from\("(help_[a-z_]+)"\)/g)].map((m) => m[1]);
  assert(tablas.length === 0, `la carga consulta tablas: ${tablas.join(", ")}`);
  assert(!/createAdminClient|service_role/i.test(sinComentarios(CARGA)),
    "la carga usa el cliente administrativo");
});

check("D3. Distingue avería de «no configurada»", () => {
  assert(/status: "unavailable"/.test(CARGA), "no distingue la avería");
  assert(/HELP_UNAVAILABLE_IS_SILENT/.test(DOMINIO),
    "no está escrito qué hace la pantalla cuando la ayuda falla");
  assert(/no se rompe la página/.test(DOMINIO),
    "no queda dicho que un fallo de ayuda no rompe la pantalla");
});

check("D4. La carga NO mira el plan · decisión congelada", () => {
  assert(!/access_mode|organization_modules|resolveModuleAccess|Demo/i.test(sinComentarios(CARGA)),
    "la carga de ayuda mira el plan comercial");
  assert(!/hint-access|canViewAdministeredHint/.test(CARGA),
    "la ayuda contextual heredó la puerta comercial de la guía de TrazaDocs");
});

// ===========================================================================
console.log("\nE · Lo que ve quien pulsa");
// ===========================================================================

check("E1. Tres rótulos, y solo lo que tiene contenido", () => {
  assert(DOMINIO.includes('"Qué es"') && DOMINIO.includes('"Ejemplo"')
    && DOMINIO.includes('"Respaldo"'), "los rótulos no son los acordados");
  assert(/helpSectionsToRender/.test(DOMINIO), "no hay decisión de qué se pinta");
  assert(/soloExplicacion/.test(DOMINIO),
    "se pinta «Qué es» aunque sea lo único que hay");
});

check("E2. Sin vocabulario interno en lo que se lee", () => {
  const visible = [...DOMINIO.matchAll(/"([^"\n]{8,})"/g)].map((m) => m[1]).join(" | ");
  for (const jerga of ["page_key", "field_key", "normative_class", "revision",
    "help_item", "target_kind"]) {
    assert(!visible.includes(jerga), `«${jerga}» aparece en un texto visible`);
  }
});

// ===========================================================================
console.log("\nF · La primera ola");
// ===========================================================================

check("F1. Las once de partes interesadas están sembradas", () => {
  const llamadas = MIG.split("select public.help_seed_item(").slice(1);
  assert(llamadas.length === 11, `se sembraron ${llamadas.length} y son 11`);
  for (const clave of ["overview", "relevance", "need", "expectation", "requirement",
    "influence", "impact", "strategy", "monitoring", "review", "history"]) {
    assert(MIG.includes(`'${clave}',`), `falta la ayuda «${clave}»`);
  }
});

check("F2. No se inventó ningún ejemplo ni respaldo", () => {
  // Dos de las once no tenían respaldo normativo en el texto original: sus
  // columnas quedan nulas en vez de rellenarse con algo plausible.
  const llamadas = MIG.split("select public.help_seed_item(").slice(1);
  const sinRespaldo = llamadas.filter((l) => /\n  null,\n  'safe'\);/.test(l));
  assert(sinRespaldo.length === 2,
    `${sinRespaldo.length} ayudas se sembraron sin respaldo, y deberían ser 2`);
});

check("F3. Y la pantalla las consume de la base, no de la constante", () => {
  const pagina = leer("app/(app)/(shell)/quality/context/interested-parties/page.tsx");
  const ficha = leer("app/(app)/(shell)/quality/context/interested-parties/[assessmentId]/page.tsx");
  for (const [n, src] of [["la lista", pagina], ["la ficha", ficha]] as const) {
    assert(/getPageHelp\(INTERESTED_PARTIES_PAGE_KEY\)/.test(src),
      `${n} no carga la ayuda administrada`);
    assert(/interestedPartiesHelpMap/.test(src), `${n} no traduce el mapa`);
  }
});

check("F4. La constante queda como respaldo, y se dice por qué", () => {
  assert(/INTERESTED_PARTIES_HELP/.test(PARTES), "desapareció el texto de respaldo");
  assert(/NO es doble verdad/.test(PARTES),
    "no queda escrito por qué conviven la constante y la ayuda administrada");
  assert(/interestedPartiesHint\(\s*\n?\s*key: InterestedPartiesHelpKey,\s*\n?\s*help\?/
    .test(PARTES), "la función no acepta la ayuda administrada");
});

check("F5. Y una sola pantalla la carga una sola vez", () => {
  for (const f of ["app/(app)/(shell)/quality/context/interested-parties/page.tsx",
    "app/(app)/(shell)/quality/context/interested-parties/[assessmentId]/page.tsx"]) {
    const src = leer(f);
    const veces = (src.match(/getPageHelp\(/g) ?? []).length;
    assert(veces === 1, `${f} carga la ayuda ${veces} veces`);
  }
  // Y los componentes de abajo NO consultan nada.
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`)
      : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : []);
  for (const f of walk("components/domain/quality/interested-parties")) {
    assert(!/getPageHelp|contextual-help/.test(leer(f)),
      `${f} consulta la ayuda por su cuenta: eso es un N+1 esperando`);
  }
});

// ===========================================================================
console.log("\nG · La consola");
// ===========================================================================

check("G1. Existe, y se llega desde la navegación de plataforma", () => {
  for (const r of ["app/(app)/platform/help/page.tsx",
    "app/(app)/platform/help/[id]/page.tsx"]) {
    let existe = true;
    try { statSync(r); } catch { existe = false; }
    assert(existe, `falta ${r}`);
  }
  assert(/platform\/help/.test(PLATAFORMA), "no se llega desde el menú de plataforma");
  assert(/href: "\/platform\/help"/.test(REGISTRY), "el grupo de plataforma no la declara");
});

check("G2. Las escrituras exigen superadministrador", () => {
  const bloques = ACCIONES.split("export async function").slice(1)
    .filter((b) => /formData: FormData/.test(b.slice(0, 300)));
  assert(bloques.length >= 5, `hay ${bloques.length} acciones de escritura`);
  for (const b of bloques) {
    assert(/if \(!isSuperadmin\) return \{ error: HELP_NO_PERMISSION \}/.test(b.slice(0, 800)),
      `una acción no exige superadministrador: ${b.slice(0, 50)}`);
  }
});

check("G3. Las revisiones no se escriben a mano", () => {
  assert(!/from\("help_item_revisions"\)[\s\S]{0,80}\.(insert|update|upsert|delete)/.test(PLAT),
    "la capa escribe revisiones a mano");
  for (const fn of ["help_publish_item", "help_unpublish_item",
    "help_restore_revision_to_draft"]) {
    assert(PLAT.includes(`rpc("${fn}"`), `no se usa ${fn}`);
  }
});

check("G4. La vista previa usa el MISMO componente que el producto", () => {
  const ficha = leer("app/(app)/platform/help/[id]/page.tsx");
  assert(/from "@\/components\/ui\/section-hint"/.test(ficha),
    "la vista previa no usa el botón «i» de verdad");
  assert(/helpToHint/.test(ficha), "la vista previa no compone el mismo contenido");
  assert(/Todavía no lo ve nadie fuera de esta consola/.test(ficha),
    "no se dice que la vista previa no publica");
});

check("G5. Y una avería no se cuenta como ausencia", () => {
  const lista = leer("app/(app)/platform/help/page.tsx");
  const ficha = leer("app/(app)/platform/help/[id]/page.tsx");
  assert(/No se pudo consultar la lista/.test(lista), "la lista no distingue la avería");
  assert(/No se pudo abrir esta ayuda/.test(ficha), "la ficha convierte una avería en 404");
  const i = DOMINIO.indexOf("HELP_UNAVAILABLE_MESSAGE");
  assert(/temporal/.test(DOMINIO.slice(i, i + 300)), "el aviso no dice que es temporal");
});

// ===========================================================================
console.log("\nH · La ayuda en la barra superior");
// ===========================================================================

check("H1. Está en el shell de módulo", () => {
  const visible = sinComentarios(SHELL);
  assert(/href="\/faq"/.test(visible), "el shell no lleva a la ayuda");
  assert(/>\s*Ayuda\s*</.test(visible), "no se llama «Ayuda»");
  // Y está en la barra superior, no escondida en el menú lateral.
  const cabecera = visible.slice(visible.indexOf("<header"), visible.indexOf("</header>"));
  assert(/href="\/faq"/.test(cabecera), "la ayuda no está en la barra superior");
});

check("H2. Y en la puerta, la consola y la selección de empresa", () => {
  for (const [n, src] of [["la puerta", PUERTA], ["la consola", PLATAFORMA],
    ["seleccionar empresa", SELECT_ORG]] as const) {
    const visible = sinComentarios(src);
    assert(/href="\/faq"/.test(visible), `${n} no lleva a la ayuda`);
    assert(/>\s*Ayuda\s*</.test(visible), `${n} no la llama «Ayuda»`);
  }
});

check("H3. Se llama Ayuda, no FAQ · va a crecer", () => {
  const cabecera = sinComentarios(SHELL);
  const enlace = cabecera.slice(cabecera.indexOf('href="/faq"'),
    cabecera.indexOf('href="/faq"') + 200);
  assert(!/FAQ|Preguntas frecuentes/.test(enlace),
    "la entrada global se llama por su destino de hoy y no por lo que es");
});

check("H4. No se metió en pantallas sin shell", () => {
  for (const f of ["app/(auth)/login/page.tsx", "app/(auth)/register/page.tsx",
    "app/legal/accept/page.tsx"]) {
    let src = "";
    try { src = leer(f); } catch { continue; }
    assert(!/href="\/faq"/.test(sinComentarios(src)),
      `${f} ganó una entrada de ayuda, y ahí no hay shell`);
  }
});

check("H5. En pantalla estrecha sigue estando", () => {
  const cabecera = sinComentarios(SHELL);
  const i = cabecera.indexOf('href="/faq"');
  const contexto = cabecera.slice(Math.max(0, i - 400), i + 200);
  assert(!/hidden\s+(sm|md|lg):/.test(contexto),
    "la ayuda se esconde en pantallas estrechas");
  assert(!/lg:hidden/.test(contexto), "la ayuda solo aparece en pantallas estrechas");
});

// ===========================================================================
console.log("\nI · Lo que este tramo NO hace");
// ===========================================================================

check("I1. La ayuda contextual no tiene motor de vídeo propio", () => {
  // Antes esto decía «sin vídeos ni tutoriales, eso es PE-03». PE-03B1 los
  // construyó, así que la afirmación caducó.
  //
  // Lo que se conserva es lo que de verdad protegía, y que PET-34 dejó
  // congelado: el botón «i» y el vídeo responden a preguntas distintas —qué es
  // esto, frente a cómo se usa esta pantalla— y NO se duplican. La ayuda
  // contextual no guarda medios, y el motor de tutoriales vive aparte.
  for (const t of ["tutorial", "video", "media_asset"]) {
    assert(!SQL.includes(`create table public.${t}`), `0158 creó ${t}`);
  }
  for (const columna of ["video_url", "media_path", "poster", "duration"]) {
    assert(!new RegExp(`\\b${columna}\\b`, "i").test(SQL),
      `la ayuda contextual guarda «${columna}»: está duplicando el motor de tutoriales`);
  }
  // Y la lectura de la ayuda no consulta tutoriales, ni al revés.
  assert(!/tutorial/i.test(leer("lib/db/contextual-help.ts")),
    "la lectura de la ayuda contextual consulta tutoriales");
});

check("I2. Sin FAQ de seguridad ni política de privacidad · B5", () => {
  // Buscar la palabra «seguridad» no vale: aparece en un ejemplo —«casi con
  // seguridad, no»— y eso no es contenido de seguridad. Lo que se comprueba es
  // que 0158 no toque las tablas ni las categorías de las que habla B5.
  const limpio = SQL.replace(/--.*/g, "");
  for (const ajeno of ["faq_categories", "faq_entries", "legal_documents",
    "'seguridad'"]) {
    assert(!limpio.includes(ajeno), `0158 toca «${ajeno}», y eso es de B5`);
  }
});

check("I3. Sin planes ni precios", () => {
  for (const [n, src] of [["la migración", SQL], ["la carga", CARGA],
    ["la consola", leer("app/(app)/platform/help/page.tsx")]] as const) {
    for (const p of ["precio", "USD", "€", "checkout"]) {
      assert(!src.toLowerCase().includes(p.toLowerCase()), `${n} habla de «${p}»`);
    }
  }
});

console.log(`\nPE-02B4 · ayuda (código): ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
