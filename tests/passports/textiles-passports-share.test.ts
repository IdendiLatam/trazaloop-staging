/**
 * Trazaloop · Sprint T9D (Textil) · Enlace privado controlado y QR del pasaporte
 * técnico textil — inspección de SQL/código/rutas, con foco en seguridad.
 * Correr: npx tsx tests/passports/textiles-passports-share.test.ts
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

const MIG = "supabase/migrations/0092_textile_passport_private_share_links.sql";
const sql = read(MIG);
const stripLineComments = (s: string) => s.split("\n").map((l) => l.replace(/--.*$/, "").replace(/\/\/.*$/, "")).join("\n");
const sqlCode = stripLineComments(sql).toLowerCase();
const sqlNoComments = stripLineComments(sql);
const dbSrc = read("lib/db/textiles-passport-share.ts");
const actionsSrc = read("server/actions/textiles-passport-share.ts");
const publicPage = read("app/textile-passport-share/[token]/page.tsx");
const manager = read("components/textiles/passports/share-link-manager.tsx");
const detailPage = read("app/(app)/(shell)/textiles/passports/[id]/page.tsx");

console.log("\nSprint T9D · Enlace privado controlado y QR del pasaporte\n");

// --- Migración: tabla y seguridad ---
check("1. Existe 0092 y las migraciones posteriores están bajo control (0093 fibras T9E; 0094 intentos, 0095/0096 fixes digest, 0097 atomicidad T9E.2, 0098 sellado server-only T9E.3, 0099 Storage RLS T9E.4, 0100 acceso comercial por módulo T9F, 0101 endurecimiento operativo T9F.1, 0102 cierre QA T9G)", () => {
  const dir = path.join(root, "supabase/migrations");
  const after91 = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) > 91);
  assert(
    JSON.stringify(after91.sort()) ===
      JSON.stringify([
        "0092_textile_passport_private_share_links.sql",
        "0093_textile_custom_fibers.sql",
        "0094_textile_evidence_upload_intents.sql",
        "0095_fix_passport_share_digest_schema.sql",
        "0096_fix_passport_generation_digest_schema.sql",
        "0097_atomic_textile_evidence_upload_finalize.sql",
        "0098_server_only_textile_evidence_finalize.sql",
        "0099_textile_storage_rls_and_csv_utf8_closure.sql",
        "0100_organization_module_access_modes_and_demo_trial.sql",
        "0101_t9f1_module_access_hardening.sql",
        "0102_t9g_qa_finalizer_closure.sql",
      ]),
    `después de 0091 solo debían existir 0092–0102 (hay: ${after91.join(", ")})`
  );
});

check("2. Crea la tabla de enlaces con la nomenclatura correcta", () => {
  assert(sql.includes("create table public.textile_technical_passport_share_links"), "falta la tabla de enlaces");
  assert(!/textile_material_passports/.test(sql), "usa la tabla incorrecta");
});

check("3. El token se guarda como HASH, nunca en claro", () => {
  assert(/token_hash\s+text not null/.test(sql), "debe existir token_hash");
  assert(sql.includes("token_hash_uniq"), "token_hash debe ser único");
  // No hay columna que guarde el token en claro.
  assert(!/token_plain|token_value|raw_token/i.test(sql), "no debe existir el token en claro en la tabla");
  assert(/token_prefix/.test(sql), "debe guardarse solo un prefijo para la UI");
});

check("4. Identidad y token inmutables tras crear; revocar es irreversible", () => {
  assert(/protect_textile_passport_share_link/.test(sql), "falta el trigger de protección");
  assert(/token_hash is distinct from old\.token_hash/.test(sql), "el token_hash debe ser inmutable");
  assert(/passport_id is distinct from old\.passport_id/.test(sql), "el passport_id debe ser inmutable");
  assert(/revoked' and new\.status is distinct from 'revoked'/.test(sql), "un enlace revocado no debe reactivarse");
});

check("5. FK compuesta: el enlace pertenece a un pasaporte de la MISMA organización", () => {
  assert(/foreign key \(organization_id, passport_id\)/.test(sql), "falta la FK compuesta org+passport");
  assert(/references public\.textile_technical_passports \(organization_id, id\)/.test(sql), "la FK debe apuntar a (organization_id, id)");
});

check("6. RLS deny-by-default; anon SIN SELECT sobre la tabla", () => {
  assert(/enable row level security/.test(sqlCode), "falta habilitar RLS");
  assert(/for select to authenticated using \(public\.is_org_member/.test(sql), "SELECT debe requerir ser miembro");
  // Crear/revocar exige admin/quality.
  assert(/for insert to authenticated\s*\n?\s*with check \(public\.has_org_role\(organization_id, array\['admin','quality'\]\)\)/.test(sql), "INSERT debe exigir admin/quality");
  // anon jamás tiene SELECT sobre la tabla (solo la RPC).
  assert(!/to anon/.test(sql.split("resolve_textile_passport_share")[0]), "anon no debe tener acceso a la tabla antes de la RPC");
});

// --- RPC pública controlada ---
check("7. RPC resolve_textile_passport_share es SECURITY DEFINER y resuelve por hash", () => {
  assert(sql.includes("create or replace function public.resolve_textile_passport_share(p_token text)"), "falta la RPC de resolución");
  assert(/security definer/.test(sqlCode.split("resolve_textile_passport_share")[1] ?? ""), "la RPC debe ser SECURITY DEFINER");
  assert(/encode\(digest\(p_token, 'sha256'\), 'hex'\)/.test(sql), "la RPC debe resolver por hash sha256 del token");
  assert(/where token_hash = v_hash/.test(sql), "la RPC debe buscar por token_hash");
});

check("8. La RPC valida estado, expiración y límite de accesos", () => {
  const rpc = sql.slice(sql.indexOf("resolve_textile_passport_share(p_token"));
  assert(/status <> 'active'/.test(rpc), "debe validar estado activo");
  assert(/expires_at is not null and v_link\.expires_at <= v_now/.test(rpc), "debe validar expiración");
  assert(/max_access_count is not null and v_link\.access_count >= v_link\.max_access_count/.test(rpc), "debe validar el límite de accesos");
  assert(/revoked_at is not null/.test(rpc), "debe rechazar enlaces revocados");
});

check("9. Mensaje genérico: no revela existencia ni organización", () => {
  const rpc = sqlNoComments.slice(sqlNoComments.indexOf("resolve_textile_passport_share(p_token"));
  // Todas las rutas de rechazo devuelven el mismo reason genérico.
  assert(/'ok', false, 'reason', 'not_available'/.test(rpc), "los rechazos deben usar un motivo genérico");
  // La respuesta de éxito (jsonb_build_object con 'ok', true) no incluye token_hash
  // ni data_sources_json.
  const successReturn = rpc.slice(rpc.indexOf("'ok', true"));
  assert(!/token_hash/.test(successReturn), "la respuesta de éxito no debe incluir token_hash");
  assert(!/data_sources_json/.test(rpc), "la respuesta no debe incluir data_sources_json");
});

check("10. La RPC registra el acceso (contador + última fecha)", () => {
  const rpc = sql.slice(sql.indexOf("resolve_textile_passport_share(p_token"));
  assert(/access_count = access_count \+ 1/.test(rpc), "debe incrementar el contador de accesos");
  assert(/last_accessed_at = v_now/.test(rpc), "debe registrar la última fecha de acceso");
});

check("11. Grants: la RPC es ejecutable por anon; la tabla no", () => {
  assert(/grant execute on function public\.resolve_textile_passport_share\(text\) to anon, authenticated/.test(sql), "la RPC debe concederse a anon+authenticated");
  assert(/revoke execute on function public\.resolve_textile_passport_share\(text\) from public/.test(sql), "debe revocarse de public antes del grant");
  assert(!/grant select on public\.textile_technical_passport_share_links to anon/i.test(sql), "anon nunca debe tener SELECT sobre la tabla");
});

// --- Capa DB / actions ---
check("12. El token en claro se genera en servidor y solo se devuelve al crear", () => {
  assert(/randomBytes\(32\)/.test(dbSrc), "el token debe tener 32 bytes de entropía");
  assert(/createHash\("sha256"\)/.test(dbSrc), "el token debe hashearse con sha256");
  // Se inserta el hash, no el token.
  assert(/token_hash: tokenHash/.test(dbSrc), "se debe insertar el hash");
  assert(!/token_plain|token: token,/.test(dbSrc), "el token en claro no debe persistirse");
});

check("13. Crear/revocar exige rol y verifica pertenencia del pasaporte", () => {
  assert(/requireTextilesForAction/.test(actionsSrc), "las actions deben usar el guard Textil");
  assert(/getTechnicalPassport\(g\.organizationId, input\.passportId\)/.test(actionsSrc), "crear debe verificar que el pasaporte es de la organización");
  assert(/revokePassportShareLinkAction/.test(actionsSrc), "debe existir la acción de revocar");
  // Las actions no aceptan organization_id del cliente.
  assert(!/organizationId:\s*input\./.test(actionsSrc), "las actions no deben tomar organization_id del cliente");
});

check("14. Revocar marca revoked_at y es irreversible (la BD lo refuerza)", () => {
  assert(/status: "revoked", revoked_at:/.test(dbSrc), "revocar debe fijar status revoked + fecha");
  assert(/\.neq\("status", "revoked"\)/.test(dbSrc), "deshabilitar/expirar no deben afectar enlaces revocados");
});

// --- Ruta pública ---
check("15. Existe la ruta pública tokenizada fuera del shell autenticado", () => {
  assert(exists("app/textile-passport-share/[token]/page.tsx"), "falta la ruta pública");
  assert(!exists("app/(app)/(shell)/textile-passport-share"), "la vista pública no debe estar bajo el shell autenticado");
});

check("16. La ruta pública resuelve SOLO vía la RPC (no lee la tabla)", () => {
  assert(/resolveSharedPassport/.test(publicPage), "la ruta pública debe usar el resolvedor por RPC");
  assert(/resolve_textile_passport_share/.test(dbSrc), "el resolvedor debe llamar la RPC");
  // La ruta pública no importa helpers que lean la tabla directamente.
  assert(!/listPassportShareLinks|from\(["']textile_technical_passport_share_links/.test(publicPage), "la ruta pública no debe leer la tabla directamente");
});

check("17. La ruta pública no es indexable y muestra mensaje genérico ante fallo", () => {
  assert(/robots:\s*\{\s*index:\s*false/.test(publicPage), "la vista compartida debe llevar noindex");
  assert(/Enlace no disponible/.test(publicPage), "debe mostrar un mensaje genérico ante token inválido");
  assert(/result\.ok !== true/.test(publicPage), "debe comprobar el ok de la RPC");
});

check("18. La ruta pública no expone signed URLs ni datos de otras orgs", () => {
  assert(!/signed[_ ]?url|createSignedUrl|file_path/i.test(publicPage), "la vista pública no debe exponer signed URLs");
  // Solo muestra lo que la RPC devuelve (snapshot reducido).
  assert(/passport\.snapshot|obj\(passport\.snapshot\)/.test(publicPage), "la vista debe usar el snapshot reducido de la RPC");
});

// --- QR y detalle ---
check("19. El QR se genera para el enlace (sin exponerlo en la tabla)", () => {
  assert(/QRCode\.toDataURL/.test(manager), "el QR debe generarse desde la URL del enlace");
  // El QR se genera del enlace recién creado (que contiene el token), no se guarda.
  assert(/freshUrl/.test(manager), "el QR debe basarse en el enlace recién creado");
});

check("20. El detalle integra la gestión de enlaces; solo admin/quality gestiona", () => {
  assert(/ShareLinkManager/.test(detailPage), "el detalle debe incluir el gestor de enlaces");
  assert(/canManageShare/.test(detailPage) || /canManage/.test(detailPage), "debe distinguir quién puede gestionar");
  assert(/roleCode === "admin" \|\| org\.roleCode === "quality"/.test(detailPage), "solo admin/quality gestiona enlaces");
});

// --- Alcance ---
check("21. Sin PDF server-side, IA, ACV, huella, planes por módulo", () => {
  const all = [sqlNoComments, stripLineComments(dbSrc), stripLineComments(actionsSrc), stripLineComments(publicPage), stripLineComments(manager)].join("\n");
  for (const banned of ["pdfkit", "puppeteer", "@react-pdf", "openai", "\\bacv\\b", "carbon", "module_subscription", "organization_module_access"]) {
    assert(!new RegExp(banned, "i").test(all), `alcance prohibido en T9D: ${banned}`);
  }
});

check("22. No toca CPR; solo lectura del pasaporte + escritura de la tabla de enlaces", () => {
  assert(!/trazadoc_documents\s+set|update trazadoc/i.test(sql), "0092 no debía escribir en CPR");
  // Escrituras DML reales: 'update <tabla> set', 'insert into <tabla>',
  // 'delete from <tabla>' — excluye el DDL de triggers (before/after ... on).
  const dml = [
    ...sqlCode.matchAll(/\bupdate\s+(\w+)\s+set\b/g),
    ...sqlCode.matchAll(/\binsert\s+into\s+(\w+)/g),
    ...sqlCode.matchAll(/\bdelete\s+from\s+(\w+)/g),
  ].map((m) => m[1]);
  const nonShareWrites = dml.filter((t) => t !== "textile_technical_passport_share_links");
  assert(nonShareWrites.length === 0, `la RPC/tabla escribe en tablas ajenas: ${nonShareWrites.join(", ")}`);
});

check("23. Lenguaje prudente: no es DPP oficial ni certificación", () => {
  const all = [sqlNoComments, stripLineComments(publicPage), stripLineComments(manager)].join("\n");
  const scan = all.split("\n").filter((l) => !/no equivale a|no constituye|no es un/i.test(l)).join("\n").toLowerCase();
  for (const t of ["certificación garantizada", "pasaporte oficial", "dpp oficial", "producto certificado", "sello oficial"]) {
    assert(!scan.includes(t), `lenguaje prohibido: ${t}`);
  }
  // La vista pública declara explícitamente que no es oficial.
  assert(/no constituye certificaci[oó]n|no es un pasaporte oficial|pasaporte digital de producto oficial/i.test(publicPage), "la vista pública debe aclarar que no es oficial");
});

check("24. Reporte T9D creado", () => {
  assert(exists("docs/modules/textiles/TEXTILES_T9D_PASSPORT_SHARE_REPORT.md"), "falta el reporte T9D");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
