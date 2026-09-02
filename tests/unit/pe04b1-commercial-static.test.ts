/**
 * Trazaloop · PE-04B1 · Lo que se vigila leyendo, no ejecutando.
 *
 * Este tramo construye el modelo comercial **en paralelo** y NO cambia la
 * autoridad de nada. Eso es una ausencia, y una ausencia no se demuestra
 * ejecutando: se vigila leyendo.
 *
 * Es además la comprobación que más fácil se pierde. Basta con que alguien
 * «conecte» el resolutor nuevo a una acción para que B1 deje de ser lo que
 * dice ser — y desde fuera no se notaría hasta que una empresa se quedara sin
 * acceso.
 *
 * Correr: npm run test:pe04b1-static
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");
const sinComentarios = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  .replace(/^\s*--.*$/gm, "");

const MIGRACION = leer("supabase/migrations/0162_commercial_plan_foundation.sql");
const SQL = sinComentarios(MIGRACION);
const RESOLUTOR = leer("lib/db/commercial-plans.ts");
const SOMBRA = leer("lib/db/plan-shadow.ts");

/** Todo el código de producto: app, componentes, acciones y librería. */
function ficheros(raiz: string, out: string[] = []): string[] {
  if (!existsSync(raiz)) return out;
  for (const n of readdirSync(raiz)) {
    const p = join(raiz, n);
    if (statSync(p).isDirectory()) ficheros(p, out);
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
const PRODUCTO = [...ficheros("app"), ...ficheros("components"),
  ...ficheros("server"), ...ficheros("lib")];

console.log("\nPE-04B1 · Los cimientos, leídos en el código\n");

// ===========================================================================
console.log("A · B1 no cambia la autoridad de nada");
// ===========================================================================

check("A1. Ningún consumidor de producto usa todavía el modelo nuevo", () => {
  const consumidores = PRODUCTO
    .filter((f) => !/lib\/db\/(commercial-plans|plan-shadow)\.ts$/.test(f))
    .filter((f) => /commercial-plans|plan-shadow/.test(leer(f)));
  assert(consumidores.length === 0,
    `B1 dice no cambiar nada y estos ficheros ya lo usan: ${consumidores.join(", ")}`);
});

check("A2. El catálogo canónico se consulta por sus resolutores, no a mano", () => {
  // B1 exigía que NADIE tocara el modelo nuevo: se construía en paralelo y aún
  // no mandaba. Eso dejó de ser cierto a propósito en B2, y hoy el producto
  // entero depende de él. Lo que sigue en pie —y es lo que aquí se comprueba—
  // es que el producto pregunte por los RESOLUTORES (`plan_effective_for_*`,
  // `organization_plan_limit`, …) y no arme su propia aritmética leyendo filas
  // del catálogo.
  //
  // La única excepción es la CONSOLA COMERCIAL de PE-04B5: administrar un
  // catálogo es, literalmente, leer y escribir sus filas. Está acotada a
  // administración de plataforma, en la pantalla y otra vez en la base.
  const ADMINISTRACION = [
    "lib/db/commercial-console.ts",
    "server/actions/commercial-console.ts",
  ];
  const tablas = ["plan_revisions", "plan_revision_limits",
    "organization_plan_assignments", "commercial_trial_policy"];
  const culpables: string[] = [];
  for (const f of PRODUCTO) {
    if (/lib\/db\/(commercial-plans|plan-shadow)\.ts$/.test(f)) continue;
    if (ADMINISTRACION.includes(f)) continue;
    const codigo = sinComentarios(leer(f));
    for (const t of tablas) {
      if (new RegExp(`["'\`]${t}["'\`]`).test(codigo)) culpables.push(`${f} → ${t}`);
    }
  }
  assert(culpables.length === 0,
    `leen el catálogo comercial a mano en vez de preguntar a sus resolutores: ${culpables.join(", ")}`);
  // Y la excepción no se convierte en coladero: la consola exige
  // administración de plataforma en TODAS sus escrituras.
  const consola = leer("server/actions/commercial-console.ts");
  const escrituras = (consola.match(/export async function \w+Action/g) ?? [])
    .filter((m) => !/get\w+Action/.test(m));
  for (const fn of escrituras) {
    const nombre = fn.replace("export async function ", "");
    const i = consola.indexOf(fn);
    const sig = consola.indexOf("export async function", i + 10);
    assert(consola.slice(i, sig === -1 ? undefined : sig).includes("exigirSuperadmin()"),
      `${nombre} escribe en el catálogo sin exigir administración de plataforma`);
  }
});

check("A3. Las tablas legacy siguen intactas · 0162 no las toca", () => {
  for (const t of ["plan_definitions", "plan_limits", "organization_subscriptions",
    "subscription_plan_history", "organization_modules"]) {
    assert(!new RegExp(`alter table (public\\.)?${t}\\b`, "i").test(SQL),
      `0162 altera «${t}»`);
    assert(!new RegExp(`drop table[^;]*${t}\\b`, "i").test(SQL), `0162 borra «${t}»`);
  }
  assert(!/\bdrop column\b/i.test(SQL), "0162 elimina alguna columna");
  // Leerlas para COPIAR la siembra sí es correcto, y de hecho es lo que se pide.
  // Se busca el `join`, que es como la siembra las lee — no un `from`.
  assert(/join public\.plan_limits/.test(SQL),
    "la siembra dejó de copiar los límites del catálogo de hoy");
});

check("A4. Y no se toca la creación de empresas", () => {
  // Se miran las SENTENCIAS, no los textos: los `comment on` nombran
  // `provision_new_organization_modules` para explicar de dónde salieron las
  // 48 horas, y explicarlo no es tocarlo.
  const sentencias = SQL.replace(/comment on [\s\S]*?';/g, "");
  assert(!/create or replace function public\.create_organization/i.test(sentencias),
    "0162 redefine create_organization: eso es B2");
  assert(!/create or replace function public\.provision_new_organization_modules/i
    .test(sentencias), "0162 redefine la provisión de módulos: eso es B2");
});

check("A5. Ni hay doble escritura oculta hacia el modelo viejo", () => {
  assert(!/insert into public\.organization_subscriptions/i.test(SQL),
    "0162 escribe en la suscripción legacy");
  assert(!/update public\.organization_modules/i.test(SQL),
    "0162 escribe en los módulos legacy");
  // Solo el RESOLUTOR. La herramienta de sombra sí lee el modelo viejo, y es
  // exactamente para lo que existe: compararlos. Lo que no puede pasar es que
  // el resolutor canónico consulte el modelo viejo para decidir.
  const codigo = sinComentarios(RESOLUTOR);
  for (const t of ["organization_subscriptions", "plan_definitions", "plan_limits",
    "organization_modules"]) {
    assert(!new RegExp(`from\\(["'\`]${t}`).test(codigo),
      `el resolutor canónico lee «${t}» para decidir: eso es sincronización oculta`);
  }
});

// ===========================================================================
console.log("\nB · Los tres planes, y ningún otro");
// ===========================================================================

check("B1. El catálogo admite exactamente free, full y extra", () => {
  assert(/check \(code in \('free', 'full', 'extra'\)\)/.test(SQL),
    "la restricción de códigos de plan cambió");
});

check("B2. No se siembra «demo» ni «advisor»", () => {
  const siembra = SQL.slice(SQL.indexOf("insert into public.plans"));
  assert(!/'demo'/.test(siembra.slice(0, 300)), "se siembra «demo» como plan");
  assert(!/'advisor'|'asesor'/i.test(SQL), "aparece «advisor» como plan");
});

check("B3. Y el resolutor en TypeScript conoce los mismos tres", () => {
  assert(/CANONICAL_PLAN_CODES = \["free", "full", "extra"\]/.test(RESOLUTOR),
    "los códigos canónicos del resolutor no son los tres");
  assert(!/"demo"/.test(sinComentarios(RESOLUTOR)),
    "el resolutor todavía maneja «demo»");
});

// ===========================================================================
console.log("\nC · El dinero");
// ===========================================================================

check("C1. En unidades menores y en entero · nunca coma flotante", () => {
  assert(/monthly_price_minor bigint/.test(SQL), "el precio mensual no es bigint");
  assert(/annual_price_minor\s+bigint/.test(SQL), "el precio anual no es bigint");
  assert(!/numeric\(|decimal\(|real|double precision/.test(
    SQL.slice(SQL.indexOf("create table public.plan_revisions"),
      SQL.indexOf("create unique index plan_revisions_current_uniq"))),
    "hay un tipo con coma en la tabla de revisiones");
});

check("C2. Y se declara SIN IMPUESTOS, donde alguien lo va a leer", () => {
  const comentario = MIGRACION.slice(MIGRACION.indexOf("comment on column public.plan_revisions.monthly_price_minor"));
  assert(/ANTES de impuestos|sin impuestos/i.test(comentario.slice(0, 400)),
    "el comentario de la columna no dice que el precio es antes de impuestos");
});

check("C3. Ningún cálculo de impuestos ni de cobro en B1", () => {
  const codigo = SQL + sinComentarios(RESOLUTOR);
  for (const jerga of ["vat", "iva", "tax", "stripe", "invoice", "coupon", "discount"]) {
    assert(!new RegExp(`\\b${jerga}\\b`, "i").test(codigo),
      `B1 toca «${jerga}», que es de PE-05`);
  }
  // `checkout` sí aparece, y a propósito: es uno de los ORÍGENES admitidos de
  // una asignación, reservado para que PE-05 pueda crear transiciones
  // autorizadas sin cambiar el esquema. Reservar el hueco no es implementarlo.
  assert(/check \(source in \([^)]*'checkout'/.test(SQL),
    "no se reservó «checkout» como origen de asignación para PE-05");
  assert(!/function[^;]*checkout|checkout\(/i.test(codigo),
    "B1 implementa algo de checkout, y eso es PE-05");
});

check("C4. «Sin precio» es un estado, no un nulo suelto", () => {
  assert(/price_state[\s\S]{0,80}check \(price_state in \('configured', 'not_configured'\)\)/
    .test(SQL), "no existe el estado explícito del precio");
  assert(/plan_revisions_price_shape/.test(SQL),
    "no se impide una promesa de precio a medias");
});

// ===========================================================================
console.log("\nD · Los límites: tres estados, uno solo por recurso");
// ===========================================================================

check("D1. finite, unlimited y not_configured · los tres", () => {
  assert(/check \(limit_state in \('finite', 'unlimited', 'not_configured'\)\)/.test(SQL),
    "los estados de límite no son los tres");
});

check("D2. Un nulo NO puede significar «ilimitado»", () => {
  assert(/check \(\(limit_state = 'finite'\) = \(limit_value is not null\)\)/.test(SQL),
    "la forma del límite no ata el valor a su estado");
});

check("D3. Y la cuota vive en UN solo sitio", () => {
  // Hoy el almacenamiento está en plan_definitions.storage_limit_bytes Y en
  // plan_limits('storage_bytes'). Ese defecto es el que 0162 no repite.
  const tabla = SQL.slice(SQL.indexOf("create table public.plan_revisions"),
    SQL.indexOf("create unique index plan_revisions_current_uniq"));
  assert(!/storage|quota|limit_bytes/.test(tabla),
    "la revisión tiene una columna de cuota, además de la tabla de límites");
});

check("D4. El vocabulario de recursos es cerrado", () => {
  assert(/references public\.plan_resources\(code\)/.test(SQL),
    "los recursos no están atados a un catálogo");
});

check("D5. La IA y el uso diario nacen SIN CONFIGURAR", () => {
  assert(/'not_configured', null[\s\S]{0,200}ai_runs_per_month|ai_runs_per_month[\s\S]{0,200}'not_configured'/
    .test(SQL), "la IA no se siembra como no configurada");
  // Y sobre todo: no se inventó ningún número.
  const siembraIa = SQL.slice(SQL.indexOf("ai_runs_per_month"));
  assert(!/'finite'/.test(siembraIa.slice(0, 400)),
    "se le puso un número a la IA, y el propietario del producto no lo ha decidido");
});

check("D6. Y `not_configured` DENIEGA en el código, no concede", () => {
  const codigo = sinComentarios(RESOLUTOR);
  assert(/if \(limit\.status === "not_configured"\) return \{ allowed: false/.test(codigo),
    "un límite sin decidir concede");
  assert(/if \(limit\.status === "unavailable"\) return \{ allowed: false/.test(codigo),
    "una avería concede");
});

// ===========================================================================
console.log("\nE · Un fallo no es un plan");
// ===========================================================================

check("E1. El resolutor devuelve TRES respuestas", () => {
  const codigo = sinComentarios(RESOLUTOR);
  for (const estado of ["found", "absent", "unavailable"]) {
    assert(new RegExp(`status: "${estado}"`).test(codigo), `falta el estado «${estado}»`);
  }
});

check("E2. Y NUNCA cae a un plan por defecto ante un error", () => {
  const codigo = sinComentarios(RESOLUTOR);
  // El resolutor de hoy hace `if (error) return "demo"`. Aquí no puede haber
  // ningún camino que devuelva un plan desde un `catch` o un `if (error)`.
  assert(!/if \(error\) return \{ status: "found"/.test(codigo), "un error devuelve un plan");
  assert(!/catch \{[\s\S]{0,120}planCode/.test(codigo), "un catch devuelve un plan");
  const catches = [...codigo.matchAll(/catch \{\s*return ([^;]+);/g)].map((m) => m[1]);
  for (const c of catches) {
    assert(/unavailable|null/.test(c), `un catch devuelve «${c}»`);
  }
});

check("E3. Un código de plan desconocido tampoco se «arregla»", () => {
  const codigo = sinComentarios(RESOLUTOR);
  assert(/CANONICAL_PLAN_CODES as readonly string\[\]\)\.includes\(code\)/.test(codigo),
    "no se comprueba que el código esté en el catálogo canónico");
});

// ===========================================================================
console.log("\nF · Público e interno");
// ===========================================================================

check("F1. La vista pública deja fuera las notas internas", () => {
  const vista = SQL.slice(SQL.indexOf("create view public.v_public_plan_catalog"),
    SQL.indexOf("comment on view public.v_public_plan_catalog"));
  for (const prohibida of ["internal_notes", "created_by", "published_by"]) {
    assert(!vista.includes(prohibida), `la vista pública expone «${prohibida}»`);
  }
});

check("F2. Y solo lo publicado y vigente", () => {
  const vista = SQL.slice(SQL.indexOf("create view public.v_public_plan_catalog"),
    SQL.indexOf("comment on view public.v_public_plan_catalog"));
  assert(/status = 'published'/.test(vista), "la vista pública no filtra por publicado");
  assert(/effective_to is null/.test(vista), "la vista pública muestra revisiones cerradas");
});

check("F3. Ninguna vista se concede a `anon`", () => {
  assert(/revoke all on public\.v_public_plan_catalog, public\.v_public_plan_limits from public, anon/
    .test(SQL), "las vistas públicas no se revocan de anon");
  assert(!/grant select on public\.v_public_plan_catalog[^;]*anon/.test(SQL),
    "la vista pública se concede a anon: eso es PE-05, con su decisión");
});

// ===========================================================================
console.log("\nG · Quién escribe");
// ===========================================================================

check("G1. Escribir el catálogo exige superadministrador", () => {
  for (const politica of ["plans_write", "plan_revisions_write",
    "plan_revision_limits_write", "opa_write", "ctp_write"]) {
    const i = SQL.indexOf(`create policy ${politica}`);
    assert(i > -1, `falta la política «${politica}»`);
    const cuerpo = SQL.slice(i, SQL.indexOf(";", i));
    assert(/is_platform_superadmin\(\)/.test(cuerpo),
      `«${politica}» no exige superadministrador`);
    assert(/with check \(is_platform_superadmin\(\)\)/.test(cuerpo),
      `«${politica}» no comprueba al escribir, solo al leer`);
  }
});

check("G2. Publicar también, y en la propia función", () => {
  const i = SQL.indexOf("function public.plan_publish_revision");
  const cuerpo = SQL.slice(i, SQL.indexOf("$$;", i));
  assert(/if not is_platform_superadmin\(\)/.test(cuerpo),
    "publicar no comprueba el papel dentro de la función");
});

check("G3. Y la asignación es de la empresa, no de cualquiera", () => {
  const i = SQL.indexOf("create policy opa_select");
  const cuerpo = SQL.slice(i, SQL.indexOf(";", i));
  assert(/is_org_member\(organization_id\)/.test(cuerpo),
    "la asignación no está acotada a la empresa");
  assert(/is_platform_staff\(\)/.test(cuerpo),
    "el personal de plataforma no puede leer las asignaciones");
});

// ===========================================================================
console.log("\nH · La prueba, y la precedencia");
// ===========================================================================

check("H1. Una prueba SIEMPRE tiene fecha de fin", () => {
  assert(/check \(grant_kind <> 'trial' or ends_at is not null\)/.test(SQL),
    "una prueba puede no tener final, y entonces es un plan");
});

check("H2. La duración es CONFIGURACIÓN, no un literal en una función", () => {
  assert(/create table public\.commercial_trial_policy/.test(SQL),
    "no existe la política de prueba como configuración");
  assert(/trial_duration_hours/.test(SQL), "no se puede configurar la duración");
  // Y el 48 aparece UNA vez, en la siembra — no repartido por el código.
  const codigo = PRODUCTO.filter((f) => /commercial-plans|plan-shadow/.test(f))
    .map(leer).map(sinComentarios).join("\n");
  assert(!/\b48\b/.test(codigo), "las 48 horas volvieron a estar en el código");
});

check("H3. La precedencia se escribe UNA vez", () => {
  const apariciones = (SQL.match(/when 'extra' then 3/g) ?? []).length;
  assert(apariciones === 1,
    `la precedencia está escrita ${apariciones} veces: acabarán discrepando`);
  assert(/function public\.plan_rank/.test(SQL), "no hay una función de precedencia");
});

check("H4. Y `core` no puede elevar el nivel comercial", () => {
  const i = SQL.indexOf("function public.plan_effective_for_organization");
  const cuerpo = SQL.slice(i, SQL.indexOf("$$;", i));
  assert(/is_functional/.test(cuerpo),
    "la resolución de empresa no excluye los módulos no funcionales · `core` nace en full para siempre");
});

// ===========================================================================
console.log("\nI · La historia");
// ===========================================================================

check("I1. Una revisión publicada no se edita ni se borra", () => {
  assert(/t_plan_revisions_immutable/.test(SQL), "falta el disparador de inmutabilidad");
  assert(/t_plan_revisions_no_delete/.test(SQL), "una revisión publicada se puede borrar");
  assert(/t_plan_revision_limits_immutable/.test(SQL),
    "los límites de una publicada se pueden cambiar por detrás");
});

check("I2. Y lo dice un DISPARADOR, no una política", () => {
  // Una política no detiene a `service_role`; un disparador sí. Es la lección
  // que este repositorio ya aprendió con los tutoriales.
  assert(/create trigger t_plan_revisions_immutable/.test(SQL),
    "la inmutabilidad se confía a una política");
});

check("I3. No hay columna «plan actual» que sobrescribir", () => {
  const tabla = SQL.slice(SQL.indexOf("create table public.organization_plan_assignments"),
    SQL.indexOf("create index opa_org_idx"));
  assert(!/current_plan|active_plan/.test(tabla),
    "hay una columna de plan actual: sobrescribirla borraría el pasado");
  assert(/starts_at/.test(tabla) && /ends_at/.test(tabla),
    "la asignación no tiene vigencia");
});

check("I4. Y una asignación es de solo añadir", () => {
  assert(/t_plan_assignments_append_only/.test(SQL),
    "una asignación se puede reescribir");
});

// ===========================================================================
console.log("\nJ · La sombra compara, no corrige");
// ===========================================================================

check("J1. La herramienta de sombra no escribe nada", () => {
  const codigo = sinComentarios(SOMBRA);
  for (const escritura of ["insert(", "update(", "delete(", "upsert("]) {
    assert(!codigo.includes(escritura),
      `la comparación en sombra escribe: «${escritura}»`);
  }
});

check("J2. Y clasifica en cuatro, sin forzar coincidencias", () => {
  const codigo = sinComentarios(SOMBRA);
  for (const clase of ["MATCH", "EXPECTED_MIGRATION_DIFFERENCE",
    "LEGACY_DRIFT", "CANONICAL_UNAVAILABLE"]) {
    assert(codigo.includes(clase), `falta la clase «${clase}»`);
  }
  assert(/legacyMismatch/.test(codigo),
    "no se cuenta aparte el desacuerdo entre las fuentes viejas");
});

check("J3. El guion de informe tampoco escribe", () => {
  const guion = sinComentarios(leer("scripts/pe04b1/sombra.ts"));
  assert(/begin transaction read only/.test(guion),
    "el guion no declara la transacción de solo lectura");
  for (const escritura of ["insert into", "update ", "delete from"]) {
    assert(!new RegExp(escritura, "i").test(guion.replace(/read only/g, "")),
      `el guion de sombra escribe: «${escritura}»`);
  }
});

console.log(`\nPE-04B1 · estático: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
