/**
 * Trazaloop · PE-02B1 · Los cimientos de la FAQ, leídos en el código.
 *
 * Lo que una suite contra base no puede comprobar: que la migración diga lo que
 * dice por escrito, que no se haya inventado un segundo vocabulario de módulos,
 * que no se haya colado un cliente administrativo, y que la cabecera de
 * migraciones sea la que el sprint dice que es.
 *
 * Correr: npm run test:pe02b1-faq
 */
import { readFileSync, readdirSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const leer = (p: string) => readFileSync(p, "utf8");
const MIG = leer("supabase/migrations/0155_platform_faq_foundation.sql");
const CATALOGO = leer("lib/modules/catalog.ts");
/** Lo que de verdad ejecuta la base: sin los comentarios, que aquí son muchos. */
const SQL = MIG.replace(/^\s*--.*$/gm, "");

console.log("\nPE-02B1 · Los cimientos de la FAQ\n");

// ===========================================================================
console.log("A · Una migración, y donde toca");
// ===========================================================================

check("A1. Es la 0155 y es la única nueva", () => {
  const nuevas = readdirSync("supabase/migrations")
    .filter((f) => /^01(5[5-9]|[6-9]\d)_/.test(f));
  assert(nuevas.length === 1, `hay ${nuevas.length} migraciones nuevas: ${nuevas.join(", ")}`);
  assert(nuevas[0] === "0155_platform_faq_foundation.sql", `se llama ${nuevas[0]}`);
});

check("A2. No hay 0156: la ayuda contextual no es este tramo", () => {
  const existe = readdirSync("supabase/migrations").some((f) => f.startsWith("0156"));
  assert(!existe, "se creó 0156 y §20 dice que no");
});

check("A3. No se tocó ninguna migración histórica", () => {
  // Si se hubiera editado una anterior, su contenido ya no coincidiría con lo
  // que se aplicó en Staging. Aquí se comprueba lo comprobable: que 0155 no
  // altera ni borra nada de las anteriores.
  assert(!/drop table (if exists )?public\.(?!faq_)/i.test(SQL),
    "0155 borra una tabla que no es suya");
  assert(!/alter table public\.(?!faq_)/i.test(SQL),
    "0155 altera una tabla que no es suya");
  assert(!/drop function public\.(?!faq_)/i.test(SQL),
    "0155 borra una función que no es suya");
});

check("A4. Está autorizada en las listas blancas", () => {
  // Una lista blanca nombra la migración COMO ELEMENTO —entre comillas y sin
  // ruta—. Quien la abre para leerla escribe `supabase/migrations/0154…`, que
  // es otra cosa: contarla aquí exigiría autorizar una migración en un archivo
  // que no autoriza nada.
  const esElemento = /["']0154_quality_intelligence_integrated_sources\.sql["']/;
  const conLista = readdirSync("tests/unit")
    .map((f) => `tests/unit/${f}`)
    .concat(["tests/release/v1-release.test.ts", "tests/passports/textiles-passports-share.test.ts"])
    .filter((p) => {
      try { return esElemento.test(leer(p)); } catch { return false; }
    });
  assert(conLista.length > 0, "no se encontró ninguna lista blanca");
  const sinAutorizar = conLista.filter(
    (p) => !/["']0155_platform_faq_foundation\.sql["']/.test(leer(p)));
  assert(sinAutorizar.length === 0,
    `sin autorizar en: ${sinAutorizar.join(", ")}`);
});

// ===========================================================================
console.log("\nB · La forma que PEH-02 congeló");
// ===========================================================================

check("B1. Cuatro tablas: categorías, identidad, revisiones y borrador", () => {
  for (const t of ["faq_categories", "faq_entries", "faq_entry_revisions",
    "faq_entry_drafts"]) {
    assert(SQL.includes(`create table public.${t} (`), `falta ${t}`);
  }
});

check("B2. La identidad NO guarda el texto de la pregunta", () => {
  const bloque = SQL.slice(SQL.indexOf("create table public.faq_entries ("),
    SQL.indexOf("create table public.faq_entry_revisions ("));
  for (const columna of ["question", "answer_short", "answer_long"]) {
    assert(!new RegExp(`^\\s+${columna}\\s`, "m").test(bloque),
      `la identidad guarda «${columna}»: reformular una pregunta movería su identidad`);
  }
  assert(/slug\s+text not null/.test(bloque), "la identidad no tiene slug estable");
});

check("B3. Las revisiones llevan vigencia, huella, autor y nota", () => {
  const bloque = SQL.slice(SQL.indexOf("create table public.faq_entry_revisions ("));
  for (const columna of ["effective_from", "effective_to", "content_hash",
    "created_by", "change_note", "revision_number", "superseded_by_revision_id"]) {
    assert(bloque.includes(columna), `las revisiones no llevan «${columna}»`);
  }
});

check("B4. Una sola revisión abierta por entrada e idioma", () => {
  assert(/create unique index faq_revisions_vigente[\s\S]{0,200}where effective_to is null/
    .test(SQL), "no hay índice que garantice una sola vigente");
  assert(/\(entry_id, language\)/.test(SQL),
    "la unicidad no contempla el idioma: traducir rompería «la vigente»");
});

check("B5. El idioma vive en la revisión, no en la identidad", () => {
  const identidad = SQL.slice(SQL.indexOf("create table public.faq_entries ("),
    SQL.indexOf("create table public.faq_entry_revisions ("));
  assert(!/^\s+language\s/m.test(identidad),
    "el idioma está en la identidad: traducir duplicaría cada pregunta");
  assert(/^\s+language\s+text not null default 'es'/m
    .test(SQL.slice(SQL.indexOf("create table public.faq_entry_revisions ("))),
    "la revisión no declara idioma");
});

check("B6. El borrador vive en su propia tabla", () => {
  assert(SQL.includes("create table public.faq_entry_drafts ("),
    "no hay tabla de borradores");
  const rev = SQL.slice(SQL.indexOf("create table public.faq_entry_revisions ("),
    SQL.indexOf("create or replace function public.faq_revision_is_immutable"));
  assert(!/status\s+text[^;]*'draft'/.test(rev),
    "el borrador se guarda dentro de las revisiones, que son inmutables");
});

check("B7. Las revisiones son inmutables, y también contra la clave de servicio", () => {
  assert(/create or replace function public\.faq_revision_is_immutable/.test(SQL),
    "no hay freno de inmutabilidad");
  assert(/create trigger t_faq_revisions_immutable[\s\S]{0,160}before update or delete/
    .test(SQL), "el freno no es un disparador: una política no frena a service_role");
});

// ===========================================================================
console.log("\nC · Los tres estados, y la publicación");
// ===========================================================================

check("C1. draft, published y unpublished son tres cosas", () => {
  assert(/status in \('draft', 'published', 'unpublished'\)/.test(SQL),
    "los estados de publicación no son los tres acordados");
});

check("C2. Publicar es una función, y solo del superadministrador", () => {
  const f = SQL.slice(SQL.indexOf("function public.faq_publish_entry"));
  assert(/if not is_platform_superadmin\(\) then/.test(f.slice(0, 1500)),
    "publicar no exige superadministrador");
  assert(/set search_path = public/.test(f.slice(0, 400)),
    "la función de publicar no fija su search_path");
});

check("C3. Publicar cierra la anterior ANTES de abrir la siguiente", () => {
  const f = SQL.slice(SQL.indexOf("function public.faq_publish_entry"),
    SQL.indexOf("function public.faq_unpublish_entry"));
  const cierre = f.indexOf("set effective_to = v_ahora");
  const alta = f.indexOf("insert into faq_entry_revisions");
  assert(cierre > 0 && alta > 0 && cierre < alta,
    "se abre la nueva antes de cerrar la vigente: el índice único lo rechazaría");
});

check("C4. Retirar no borra", () => {
  const f = SQL.slice(SQL.indexOf("function public.faq_unpublish_entry"),
    SQL.indexOf("function public.faq_restore_revision_to_draft"));
  assert(!/delete from/i.test(f), "retirar borra algo");
  assert(/status = case when status = 'draft'/.test(f),
    "retirar convierte un borrador en «retirado», que nunca estuvo publicado");
});

check("C5. Restaurar escribe en el BORRADOR, nunca en la historia", () => {
  const f = SQL.slice(SQL.indexOf("function public.faq_restore_revision_to_draft"));
  assert(/insert into faq_entry_drafts/.test(f), "restaurar no pasa por el borrador");
  assert(!/update faq_entry_revisions/.test(f.slice(0, 2500)),
    "restaurar toca una revisión: reabrir haría que la historia mintiera");
});

// ===========================================================================
console.log("\nD · Lo que se puede afirmar");
// ===========================================================================

check("D1. Los cinco estados de verificación de la auditoría", () => {
  for (const estado of ["verified", "verified_with_qualifier",
    "external_policy_verification_required", "not_verified", "must_not_claim"]) {
    assert(SQL.includes(`'${estado}'`), `falta el estado «${estado}»`);
  }
});

check("D2. Publicar RECHAZA lo que no se puede afirmar", () => {
  const f = SQL.slice(SQL.indexOf("function public.faq_publish_entry"),
    SQL.indexOf("function public.faq_unpublish_entry"));
  assert(/verification_status in\s*\n?\s*\('external_policy_verification_required', 'not_verified', 'must_not_claim'\)/
    .test(f), "la barrera de publicación no rechaza los tres estados");
  assert(/raise exception/.test(f.slice(f.indexOf("external_policy_verification_required"))),
    "el rechazo no es una excepción: sería un aviso");
});

check("D3. La política de un tercero se comprueba y se fecha, no se codifica", () => {
  assert(SQL.includes("external_source_url") && SQL.includes("external_source_checked_on"),
    "no hay dónde anotar la comprobación de una política externa");
  assert(/external_source_url is null or external_source_checked_on is not null/.test(SQL),
    "se admite una fuente externa sin fecha de comprobación");
  // Y la política del proveedor NO está escrita en el código de la aplicación.
  const codigo = ["lib", "server", "app"].flatMap((d) => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`)
        : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    return walk(d);
  });
  const infractores = codigo.filter((p) => /no (se )?(usan|utilizan) para entrenar|not used for training|zero data retention/i
    .test(leer(p)));
  assert(infractores.length === 0,
    `la política del proveedor está escrita en el código: ${infractores.join(", ")}`);
});

check("D4. Una salvedad que no se escribe no es una salvedad", () => {
  assert(/verification_status <> 'verified_with_qualifier'\s*\n?\s*or length\(btrim\(coalesce\(verification_note/
    .test(SQL), "se admite «verificada con salvedad» sin la salvedad escrita");
});

check("D5. La clasificación normativa es la de 0136, no una segunda", () => {
  const original = leer("supabase/migrations/0136_trazadoc_canonical_authoring_guidance.sql");
  for (const clase of ["safe", "normative_reference", "conformity_risk",
    "certification_risk", "ambiguous"]) {
    assert(original.includes(`'${clase}'`), `0136 no tiene «${clase}»`);
    assert(SQL.includes(`'${clase}'`), `0155 no reutiliza «${clase}»`);
  }
});

// ===========================================================================
console.log("\nE · Un solo vocabulario de módulos");
// ===========================================================================

check("E1. Las claves son las canónicas del catálogo", () => {
  const canonicas = [...CATALOGO.matchAll(/^\s{4}key:\s*"([a-z]+)"/gm)].map((m) => m[1]);
  assert(canonicas.length === 4, `el catálogo declara ${canonicas.length} módulos`);
  const restriccion = SQL.slice(SQL.indexOf("faq_entries_module_keys_check"));
  for (const k of canonicas) {
    assert(restriccion.slice(0, 300).includes(`'${k}'`),
      `la restricción no admite «${k}», que sí está en el catálogo`);
  }
});

check("E2. Y no se coló el vocabulario de los tickets ni el de las estructuras", () => {
  const restriccion = SQL.slice(SQL.indexOf("faq_entries_module_keys_check"), 
    SQL.indexOf("faq_entries_module_keys_check") + 300);
  for (const ajena of ["trazadocs", "diagnostic", "recycled_content", "traceability",
    "implementation", "catalog"]) {
    assert(!restriccion.includes(`'${ajena}'`),
      `se coló «${ajena}», que es de otro dominio`);
  }
});

check("E3. El alcance no tiene ambigüedad: global o de módulos, sin listas vacías", () => {
  assert(/scope = 'global'\s+and cardinality\(module_keys\) = 0/.test(SQL),
    "una entrada global puede llevar módulos");
  assert(/scope = 'modules' and cardinality\(module_keys\) between 1/.test(SQL),
    "una entrada «de módulos» puede no decir de cuáles");
});

// ===========================================================================
console.log("\nF · La superficie pública");
// ===========================================================================

check("F1. Tres vistas, con el filtro dentro", () => {
  for (const v of ["v_faq_public", "v_faq_authenticated", "v_faq_public_categories"]) {
    assert(SQL.includes(`create view public.${v} as`), `falta la vista ${v}`);
  }
  const publica = SQL.slice(SQL.indexOf("create view public.v_faq_public as"),
    SQL.indexOf("create view public.v_faq_authenticated"));
  assert(/e\.status = 'published'/.test(publica), "la vista pública no filtra publicadas");
  assert(/e\.visibility = 'public'/.test(publica), "la vista pública no filtra públicas");
  assert(/r\.effective_to is null/.test(publica), "la vista pública enseña la historia");
});

check("F2. Y no llevan security_invoker: la vista ES la frontera", () => {
  // Con `security_invoker` se evaluaría la RLS de quien pregunta, que le
  // devuelve cero. Es el mismo razonamiento de 0141, y conviene que se parezca.
  assert(!/security_invoker/.test(SQL.slice(SQL.indexOf("create view public.v_faq_public"))),
    "las vistas de FAQ usan security_invoker y devolverían cero");
});

check("F3. Ninguna vista expone procedencia interna", () => {
  // Se mira la PROYECCIÓN, no la consulta entera: `effective_to is null` en el
  // `where` es justamente lo que impide enseñar la historia, y buscarlo en todo
  // el bloque lo confundiría con exponerlo.
  const vistas = SQL.slice(SQL.indexOf("create view public.v_faq_public as"),
    SQL.indexOf("function public.faq_publish_entry"));
  const proyecciones = [...vistas.matchAll(/as\nselect([\s\S]*?)\nfrom /g)]
    .map((m) => m[1]);
  assert(proyecciones.length === 3, `se leyeron ${proyecciones.length} proyecciones de 3`);
  for (const p of proyecciones) {
    for (const c of ["source_basis", "verification_note", "verification_status",
      "verified_at", "change_note", "created_by", "updated_by", "content_hash",
      "effective_to", "superseded_by_revision_id", "revision_number"]) {
      assert(!new RegExp(`\\b${c}\\b`).test(p), `una vista pública proyecta «${c}»`);
    }
  }
});

check("F4. El anónimo no tiene permiso sobre ninguna tabla de FAQ", () => {
  assert(/revoke all on table public\.faq_categories\s+from public, anon, authenticated/
    .test(SQL), "las tablas no revocan al anónimo");
  const grants = SQL.match(/grant [a-z, ]+ on table public\.faq_[a-z_]+ to ([a-z, ]+);/g) ?? [];
  for (const g of grants) {
    assert(!g.includes("anon"), `se concede a anon: ${g}`);
  }
});

check("F5. Las revisiones no se escriben ni siendo superadministrador", () => {
  assert(!/grant [a-z, ]*insert[a-z, ]* on table public\.faq_entry_revisions/.test(SQL),
    "se puede escribir una revisión saltándose la publicación");
  assert(!/create policy [a-z_]+ on public\.faq_entry_revisions\s+for all/.test(SQL),
    "hay política de escritura sobre las revisiones");
});

// ===========================================================================
console.log("\nG · Lo que este tramo NO hace");
// ===========================================================================

check("G1. Sin cliente administrativo en ningún camino de FAQ", () => {
  assert(!/service_role/i.test(SQL), "la migración menciona service_role");
  const codigo = readdirSync("lib/db").filter((f) => /faq/i.test(f));
  assert(codigo.length === 0,
    `hay capa de datos de FAQ y B1 es solo esquema: ${codigo.join(", ")}`);
});

check("G2. Sin pantallas: ni pública ni de administración", () => {
  const rutas = ["app/faq", "app/(app)/platform/faq"];
  for (const r of rutas) {
    let existe = true;
    try { readdirSync(r); } catch { existe = false; }
    assert(!existe, `se creó ${r} y B1 no tiene pantallas`);
  }
});

check("G3. Sin tabla de vídeos ni de ayuda contextual", () => {
  for (const t of ["help_items", "help_item_revisions", "tutorial", "video"]) {
    assert(!SQL.includes(`create table public.${t}`), `se creó ${t}`);
  }
});

check("G4. Sin precios, sin límites y sin cuotas", () => {
  const semillas = SQL.slice(SQL.indexOf("insert into public.faq_categories"));
  for (const p of ["€", "USD", "MB", "precio", "mensual"]) {
    assert(!semillas.includes(p), `la siembra escribe «${p}»`);
  }
});

check("G5. Se siembran las categorías, y ninguna pregunta", () => {
  assert(SQL.includes("insert into public.faq_categories"), "no se siembran categorías");
  assert(!/insert into public\.faq_entries/.test(SQL),
    "se siembra una pregunta: el día que B3 publique la pantalla, estaría en producción");
  for (const c of ["primeros_pasos", "cuenta_empresa", "seguridad", "quality", "pcr",
    "textiles", "documentos", "intelligence", "planes", "soporte"]) {
    assert(SQL.includes(`'${c}'`), `falta la categoría «${c}»`);
  }
  assert(!/'construccion',\s*'Trazaloop Construcción'/.test(SQL),
    "se creó la categoría de Construcción: el módulo no existe y sería una promesa");
});

check("G6. El documento legal no se rediseñó por la puerta de atrás", () => {
  assert(!/legal_documents/.test(SQL),
    "0155 toca legal_documents y §19 dice que solo se inspecciona");
});

console.log(`\nPE-02B1 · cimientos: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
