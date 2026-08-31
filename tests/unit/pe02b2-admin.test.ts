/**
 * Trazaloop · PE-02B2 · La consola, leída en el código.
 *
 * Lo que ninguna prueba contra base comprueba: que la consola no invente un
 * segundo lenguaje visual, que no escriba una revisión a mano, que no use el
 * cliente administrativo, y que una avería no se cuente como ausencia.
 *
 * Correr: npm run test:pe02b2-admin
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const leer = (p: string) => readFileSync(p, "utf8");
const MIG = leer("supabase/migrations/0156_platform_legal_documents_hardening.sql");
const SQL = MIG.replace(/^\s*--.*$/gm, "");
const CAPA_FAQ = leer("lib/db/faq-platform.ts");
const CAPA_LEGAL = leer("lib/db/legal-platform.ts");
const ACC_FAQ = leer("server/actions/faq-admin.ts");
const ACC_LEGAL = leer("server/actions/legal-admin.ts");
const LISTA = leer("app/(app)/platform/faq/page.tsx");
const FICHA = leer("app/(app)/platform/faq/[id]/page.tsx");
const LEGAL_LISTA = leer("app/(app)/platform/legal/page.tsx");
const LEGAL_FICHA = leer("app/(app)/platform/legal/[id]/page.tsx");
const FORMS_FAQ = leer("components/domain/faq/faq-admin-forms.tsx");
const FORMS_LEGAL = leer("components/domain/legal-admin/legal-admin-forms.tsx");
const PREVIEW = leer("components/domain/faq/faq-preview.tsx");
const LAYOUT = leer("app/(app)/platform/layout.tsx");
const REGISTRY = leer("lib/modules/registry.ts");

console.log("\nPE-02B2 · La consola de contenido\n");

// ===========================================================================
console.log("A · La migración, y dónde toca");
// ===========================================================================

check("A1. Es la 0156 y es la única nueva", () => {
  const nuevas = readdirSync("supabase/migrations")
    .filter((f) => /^01(5[6-9]|[6-9]\d)_/.test(f));
  assert(nuevas.length === 1, `hay ${nuevas.length} migraciones nuevas: ${nuevas.join(", ")}`);
  assert(nuevas[0].startsWith("0156_platform_legal"), `se llama ${nuevas[0]}`);
});

check("A2. No se tocó 0155 ni ninguna histórica", () => {
  assert(!/faq_entries|faq_entry_revisions|faq_categories/.test(SQL),
    "0156 toca las tablas de la FAQ");
  assert(!/drop table/i.test(SQL), "0156 borra una tabla");
  const objetivo = SQL.match(/alter table public\.([a-z_]+)/g) ?? [];
  assert(objetivo.every((a) => a.includes("legal_documents")),
    `0156 altera algo que no es legal_documents: ${objetivo.join(", ")}`);
});

check("A3. Está autorizada en las listas blancas", () => {
  // Una lista blanca nombra la migración como ELEMENTO de una lista. Un archivo
  // que la menciona en un `assert` para comprobar cómo se llama no autoriza
  // nada, y exigirle que autorice sería pedirle que hable de otro tramo.
  const esElemento = /^\s*["']0155_platform_faq_foundation\.sql["'],?\s*$/m;
  const conLista = readdirSync("tests/unit").map((f) => `tests/unit/${f}`)
    .concat(["tests/release/v1-release.test.ts",
      "tests/passports/textiles-passports-share.test.ts"])
    .filter((p) => { try { return esElemento.test(leer(p)); } catch { return false; } });
  assert(conLista.length > 0, "no se encontró ninguna lista blanca");
  const sin = conLista.filter(
    (p) => !/["']0156_platform_legal_documents_hardening\.sql["']/.test(leer(p)));
  assert(sin.length === 0, `sin autorizar en: ${sin.join(", ")}`);
});

check("A4. No se creó la migración de ayuda contextual · §31", () => {
  const existe = readdirSync("supabase/migrations").some((f) => f.startsWith("0157"));
  assert(!existe, "se creó 0157 y la ayuda contextual es B4");
  for (const t of ["help_items", "help_item_revisions", "tutorial", "video"]) {
    assert(!SQL.includes(`create table public.${t}`), `se creó ${t}`);
  }
});

// ===========================================================================
console.log("\nB · La inmutabilidad legal");
// ===========================================================================

check("B1. El freno es un DISPARADOR, no una política", () => {
  assert(/create or replace function public\.legal_document_is_immutable/.test(SQL),
    "no hay freno de inmutabilidad");
  assert(/create trigger t_legal_documents_immutable[\s\S]{0,160}before update or delete/
    .test(SQL), "el freno no es un disparador: una política no frena a service_role");
});

check("B2. Protege el contenido, el título, la versión y la fecha", () => {
  const f = SQL.slice(SQL.indexOf("function public.legal_document_is_immutable"),
    SQL.indexOf("create trigger t_legal_documents_immutable"));
  for (const campo of ["content", "title", "version", "document_type",
    "content_hash", "published_at"]) {
    assert(new RegExp(`new\\.${campo} is distinct from old\\.${campo}`).test(f),
      `no protege «${campo}»`);
  }
});

check("B3. Un borrador sí se corrige · si no, no sería un borrador", () => {
  const f = SQL.slice(SQL.indexOf("function public.legal_document_is_immutable"));
  assert(/if old\.status = 'draft' then/.test(f.slice(0, 2500)),
    "no distingue el borrador de lo publicado");
});

check("B4. Una archivada no vuelve a estar vigente", () => {
  assert(/old\.status = 'archived' and new\.status <> 'archived'/.test(SQL),
    "se puede revivir una versión archivada");
});

check("B5. No se borra lo publicado ni lo aceptado", () => {
  const f = SQL.slice(SQL.indexOf("function public.legal_document_is_immutable"));
  assert(/tg_op = 'DELETE'/.test(f.slice(0, 900)), "no hay guardia de borrado");
  assert(/user_legal_acceptances where legal_document_id = old\.id/.test(f),
    "se puede borrar una versión que alguien aceptó");
});

// ===========================================================================
console.log("\nC · La sucesión");
// ===========================================================================

check("C1. Publicar archiva la vigente ANTES de activar la nueva", () => {
  const f = SQL.slice(SQL.indexOf("function public.legal_publish_document"),
    SQL.indexOf("function public.legal_discard_draft"));
  const archiva = f.indexOf("status = 'archived'");
  const activa = f.indexOf("set status = 'active'");
  assert(archiva > 0 && activa > 0 && archiva < activa,
    "se activa antes de archivar: el índice único de «uno activo por tipo» lo rechazaría");
});

check("C2. Y las enlaza en los dos sentidos", () => {
  const f = SQL.slice(SQL.indexOf("function public.legal_publish_document"));
  assert(/supersedes_id = v_vigente\.id/.test(f), "la nueva no dice a quién sucede");
  assert(/set superseded_by_id = p_id/.test(f), "la anterior no dice quién la sucede");
  assert(/retired_at = v_ahora/.test(f), "no se fecha el retiro");
});

check("C3. Las cuatro funciones exigen superadministrador y fijan search_path", () => {
  for (const fn of ["legal_create_draft", "legal_update_draft",
    "legal_publish_document", "legal_discard_draft"]) {
    const f = SQL.slice(SQL.indexOf(`function public.${fn}`));
    assert(/set search_path = public/.test(f.slice(0, 400)), `${fn} no fija search_path`);
    assert(/if not is_platform_superadmin\(\) then/.test(f.slice(0, 1200)),
      `${fn} no exige superadministrador`);
  }
});

check("C4. El anónimo no puede ejecutar ninguna", () => {
  for (const fn of ["legal_create_draft", "legal_update_draft",
    "legal_publish_document", "legal_discard_draft", "legal_document_is_immutable"]) {
    assert(new RegExp(`revoke all on function public\\.${fn}[^;]*from public, anon`).test(SQL),
      `${fn} no revoca al anónimo`);
  }
});

check("C5. La lectura pública de los legales NO cambia", () => {
  assert(!/drop policy|legal_documents_select_public/.test(
    SQL.replace(/legal_documents_select_public de 0066/g, "")),
    "0156 toca la política de lectura pública");
  assert(/create policy legal_documents_staff_select/.test(SQL),
    "la plataforma sigue sin poder ver borradores");
});

check("C6. La aceptación no se toca", () => {
  assert(!/alter table public\.user_legal_acceptances/.test(SQL),
    "0156 altera la tabla de aceptaciones");
  assert(!/(delete|update) from user_legal_acceptances/i.test(SQL),
    "0156 modifica aceptaciones existentes");
  assert(!/accept_active_legal_documents/.test(SQL.replace(/--.*/g, "")),
    "0156 redefine la función de aceptación");
});

// ===========================================================================
console.log("\nD · La capa de datos");
// ===========================================================================

check("D1. Sin cliente administrativo en ningún camino", () => {
  for (const [n, src] of [["capa FAQ", CAPA_FAQ], ["capa legal", CAPA_LEGAL],
    ["acciones FAQ", ACC_FAQ], ["acciones legal", ACC_LEGAL]] as const) {
    assert(!/createAdminClient|service_role|SUPABASE_SERVICE/.test(src),
      `${n} usa el cliente administrativo`);
  }
});

check("D2. Las revisiones NO se escriben desde la aplicación", () => {
  assert(!/from\("faq_entry_revisions"\)[\s\S]{0,80}\.(insert|update|upsert|delete)/
    .test(CAPA_FAQ), "la capa escribe revisiones a mano");
  assert(/rpc\("faq_publish_entry"/.test(CAPA_FAQ), "no se publica por la función canónica");
  assert(/rpc\("faq_unpublish_entry"/.test(CAPA_FAQ), "no se retira por la función canónica");
  assert(/rpc\("faq_restore_revision_to_draft"/.test(CAPA_FAQ),
    "no se restaura por la función canónica");
});

check("D3. Los legales pasan por sus funciones, no por UPDATE directo", () => {
  assert(!/from\("legal_documents"\)[\s\S]{0,80}\.(insert|update|upsert|delete)/
    .test(CAPA_LEGAL), "la capa legal escribe la tabla a mano");
  for (const fn of ["legal_create_draft", "legal_update_draft",
    "legal_publish_document", "legal_discard_draft"]) {
    assert(CAPA_LEGAL.includes(`rpc("${fn}"`), `no se usa ${fn}`);
  }
});

check("D4. Una actualización silenciosa se detecta", () => {
  // Una actualización que la RLS no autoriza devuelve cero filas SIN error. Sin
  // pedir la fila de vuelta, la consola diría «guardado» a quien no guardó nada.
  assert(/function filaAfectada/.test(CAPA_FAQ), "no hay guardia de fila afectada");
  const actualizaciones = CAPA_FAQ.match(/\.update\(\{[\s\S]*?\}\)\.eq\([^)]*\)(\.select\("id"\))?/g) ?? [];
  const sinSelect = actualizaciones.filter((a) => !a.includes('.select("id")'));
  assert(sinSelect.length === 0,
    `hay ${sinSelect.length} actualizaciones que no comprueban si tocaron algo`);
});

check("D5. Una avería NO se cuenta como ausencia · §29", () => {
  assert(/status: "unavailable"/.test(CAPA_FAQ) && /status: "unavailable"/.test(CAPA_LEGAL),
    "las lecturas no distinguen la avería del vacío");
  for (const [n, src] of [["FAQ", ACC_FAQ], ["legal", ACC_LEGAL]] as const) {
    assert(/unavailable: true/.test(src), `las acciones de ${n} pierden la avería`);
  }
  // El texto vive en el dominio —un módulo "use server" solo exporta
  // funciones— y dice «temporal», nunca «no hay»: una avería no es una
  // ausencia, y quien lee «no hay contenido» cree que perdió su trabajo.
  for (const [n, texto] of [
    ["FAQ", leer("lib/domain/faq-admin.ts")],
    ["legal", leer("lib/domain/legal.ts")],
  ] as const) {
    const i = texto.indexOf("UNAVAILABLE_MESSAGE =");
    assert(i > 0, `no existe el aviso de ${n}`);
    const mensaje = texto.slice(i, i + 300);
    assert(/temporal/.test(mensaje), `el aviso de ${n} no dice que es temporal`);
    assert(!/no hay contenido|no existe|sin contenido/i.test(mensaje),
      `el aviso de ${n} suena a ausencia`);
  }
  assert(/No se pudo consultar la lista/.test(LISTA), "la lista no distingue la avería");
  assert(/No se pudo abrir esta pregunta/.test(FICHA), "la ficha convierte una avería en 404");
  assert(/No se pudieron consultar los documentos/.test(LEGAL_LISTA),
    "la lista legal no distingue la avería");
});

// ===========================================================================
console.log("\nE · Los permisos, y no solo los botones");
// ===========================================================================

check("E1. Cada acción vuelve a exigir el papel", () => {
  for (const [n, src] of [["FAQ", ACC_FAQ], ["legal", ACC_LEGAL]] as const) {
    const acciones = src.match(/export async function [a-zA-Z]+Action/g) ?? [];
    assert(acciones.length >= 6, `${n} tiene ${acciones.length} acciones`);
    const bloques = src.split("export async function").slice(1);
    for (const b of bloques) {
      assert(/requirePlatformStaff\(\)/.test(b.slice(0, 700)),
        `una acción de ${n} no exige plataforma: ${b.slice(0, 60)}`);
    }
  }
});

check("E2. Y las de escritura exigen superadministrador", () => {
  for (const [n, src] of [["FAQ", ACC_FAQ], ["legal", ACC_LEGAL]] as const) {
    const bloques = src.split("export async function").slice(1)
      .filter((b) => /formData: FormData/.test(b.slice(0, 300)));
    assert(bloques.length >= 4, `${n} tiene ${bloques.length} acciones de escritura`);
    for (const b of bloques) {
      assert(/if \(!isSuperadmin\) return \{ error: NO_PERMISO \}/.test(b.slice(0, 800)),
        `una acción de escritura de ${n} no exige superadministrador: ${b.slice(0, 60)}`);
    }
  }
});

check("E3. Esconder el botón es cortesía, y está dicho", () => {
  assert(/canManage/.test(LISTA) && /canManage/.test(FICHA),
    "la pantalla no distingue quién puede escribir");
  assert(/no se fían|la barrera es la base|vuelven a comprobar/i.test(ACC_FAQ),
    "no queda escrito que la barrera está en la base");
});

// ===========================================================================
console.log("\nF · Borrador y publicado, a la vista");
// ===========================================================================

check("F1. La ficha enseña lo publicado Y el borrador", () => {
  assert(/Publicado ahora/.test(FICHA), "no se ve lo publicado");
  assert(/Vista previa del borrador/.test(FICHA), "no se ve la vista previa");
  assert(/Borrador con cambios/.test(FICHA) && /Borrador con cambios/.test(LISTA),
    "no se avisa de que hay cambios sin publicar");
});

check("F2. La vista previa tiene las DOS caras", () => {
  assert(/Cara pública/.test(PREVIEW) && /Cara con sesión/.test(PREVIEW),
    "la vista previa no distingue las dos caras");
  assert(/no aparece/.test(PREVIEW),
    "no se avisa de que una respuesta con sesión no sale en la cara pública");
  assert(/todavía no lo ve nadie fuera de esta consola/i.test(PREVIEW),
    "no se dice que la vista previa no publica nada");
});

check("F3. Guardar el borrador no toca lo publicado, y se dice", () => {
  assert(/Lo publicado no ha cambiado/.test(FORMS_FAQ),
    "al guardar no se tranquiliza sobre lo publicado");
  assert(/saveFaqDraft/.test(ACC_FAQ), "guardar no pasa por el borrador");
  const bloque = ACC_FAQ.slice(ACC_FAQ.indexOf("saveFaqDraftAction"));
  assert(!/publishFaqEntry/.test(bloque.slice(0, 1800)), "guardar publica");
});

check("F4. Crear NO publica", () => {
  const bloque = ACC_FAQ.slice(ACC_FAQ.indexOf("createFaqEntryAction"));
  assert(!/publishFaqEntry/.test(bloque.slice(0, 1600)), "crear publica");
  assert(/Crear NO publica|nace un borrador/i.test(ACC_FAQ),
    "no queda escrito que crear no publica");
});

// ===========================================================================
console.log("\nG · La gobernanza de lo que se afirma");
// ===========================================================================

check("G1. El bloque de procedencia va separado del texto", () => {
  assert(/Procedencia · no se publica|Procedencia · solo para la plataforma/.test(
    FORMS_FAQ + PREVIEW), "la procedencia no se separa del contenido");
  assert(/Nada de este bloque sale/.test(FORMS_FAQ + PREVIEW),
    "no se dice que la procedencia no se publica");
});

check("G2. Se explica ANTES de enviar por qué no se puede publicar", () => {
  const dominio = leer("lib/domain/faq-admin.ts");
  assert(/faqPublishBlockReason/.test(dominio), "no hay explicación previa");
  for (const estado of ["external_policy_verification_required", "not_verified",
    "must_not_claim"]) {
    assert(dominio.includes(estado), `no se contempla «${estado}»`);
  }
  assert(/la barrera de verdad sigue siendo la base|no la sustituye/i.test(dominio),
    "no queda escrito que la comprobación de pantalla no sustituye a la base");
});

check("G3. Y la pantalla no es la única guardia", () => {
  // La acción valida, pero la base rechaza igual: se comprueba que la acción
  // NO decide por sí sola qué se publica.
  const bloque = ACC_FAQ.slice(ACC_FAQ.indexOf("publishFaqEntryAction"));
  assert(/publishFaqEntry\(/.test(bloque.slice(0, 900)),
    "publicar no llama a la capa canónica");
  assert(!/verification_status/.test(bloque.slice(0, 900)),
    "la acción de publicar decide por su cuenta el estado de verificación");
});

// ===========================================================================
console.log("\nH · La navegación y el lenguaje de la consola");
// ===========================================================================

check("H1. Hay entrada de plataforma para las dos cosas", () => {
  assert(/platform\/faq/.test(LAYOUT), "no hay entrada a preguntas frecuentes");
  assert(/platform\/legal/.test(LAYOUT), "no hay entrada a documentos legales");
  assert(/Preguntas frecuentes/.test(REGISTRY) && /Documentos legales/.test(REGISTRY),
    "el grupo de plataforma no las declara");
});

check("H2. No aparecen en la navegación de una empresa", () => {
  const registro = REGISTRY.slice(0, REGISTRY.indexOf("PLATFORM_GROUP"));
  assert(!/platform\/faq|platform\/legal/.test(registro),
    "las superficies de plataforma se ofrecen dentro de un módulo de empresa");
});

check("H3. Se reutiliza el lenguaje visual de la consola", () => {
  for (const [n, src] of [["lista FAQ", LISTA], ["ficha FAQ", FICHA],
    ["lista legal", LEGAL_LISTA], ["ficha legal", LEGAL_FICHA]] as const) {
    assert(/eyebrow/.test(src), `${n} no usa el encabezado de la consola`);
    assert(/border-hairline/.test(src), `${n} no usa el borde de la consola`);
    assert(/export const dynamic = "force-dynamic"/.test(src),
      `${n} podría prerenderizarse`);
  }
  for (const [n, src] of [["formularios FAQ", FORMS_FAQ],
    ["formularios legal", FORMS_LEGAL]] as const) {
    assert(/from "@\/components\/ui\/field"/.test(src), `${n} no usa los campos comunes`);
    assert(/from "@\/components\/ui\/button"/.test(src), `${n} no usa el botón común`);
    assert(/useActionState/.test(src), `${n} no usa el patrón de acciones del repositorio`);
  }
});

check("H4. Publicar un legal avisa de lo que provoca", () => {
  // El texto vive dentro de JSX y se parte en varias líneas: se compara la
  // frase, no cómo quedó formateada.
  const plano = FORMS_LEGAL.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  assert(/se les volverá a pedir/.test(plano),
    "no se avisa de que publicar obliga a aceptar de nuevo");
  assert(/confirm_publish/.test(FORMS_LEGAL) && /confirm_publish/.test(ACC_LEGAL),
    "publicar un legal no exige confirmación explícita");
});

check("H5. Y la ficha legal dice que lo publicado no se corrige", () => {
  assert(/no se puede modificar/.test(LEGAL_FICHA),
    "no se dice que una versión publicada no se corrige");
  assert(/versión nueva/.test(LEGAL_FICHA), "no se dice cuál es la alternativa");
});

// ===========================================================================
console.log("\nI · Lo que este tramo NO hace");
// ===========================================================================

check("I1. Sin FAQ pública ni centro de ayuda · §30", () => {
  for (const r of ["app/faq", "app/(app)/(shell)/faq", "app/ayuda"]) {
    let existe = true;
    try { statSync(r); } catch { existe = false; }
    assert(!existe, `se creó ${r} y las pantallas de consumo son B3`);
  }
});

check("I2. Sin ayuda contextual · §31", () => {
  const dominio = readdirSync("lib/domain");
  assert(!dominio.some((f) => /contextual-help|page-help/.test(f)),
    "se empezó la ayuda contextual");
  const partes = leer("lib/domain/quality-interested-parties.ts");
  assert(/INTERESTED_PARTIES_HELP/.test(partes),
    "se migraron las once ayudas de partes interesadas, y eso es B4");
});

check("I3. Sin los carryovers de PE-01 · §32", () => {
  const portada = leer("app/page.tsx");
  assert(/grid gap-4 sm:grid-cols-2/.test(portada),
    "se tocó la jerarquía de la portada pública, y eso es B6");
  const puerta = leer("app/(app)/modules/page.tsx");
  assert(/hora del servidor/.test(puerta),
    "se cambió la copia de /modules, y eso es B6");
});

check("I4. Sin planes, precios ni pagos", () => {
  for (const [n, src] of [["capa FAQ", CAPA_FAQ], ["capa legal", CAPA_LEGAL],
    ["lista", LISTA], ["ficha", FICHA]] as const) {
    for (const p of ["precio", "checkout", "€/mes", "facturación"]) {
      assert(!src.toLowerCase().includes(p.toLowerCase()), `${n} habla de «${p}»`);
    }
  }
});

check("I5. Ninguna pantalla nueva vive fuera de /platform", () => {
  const nuevas: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page.tsx" && /faq|legal-admin/.test(p)) nuevas.push(p);
    }
  };
  walk("app");
  const fuera = nuevas.filter((p) => !p.includes("platform"));
  assert(fuera.length === 0, `hay pantallas de administración fuera de plataforma: ${fuera.join(", ")}`);
});

console.log(`\nPE-02B2 · consola (código): ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
