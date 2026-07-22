/**
 * Trazaloop · Sprint T9E.4 (Textil) · Verificación ESTÁTICA de las políticas
 * de Storage (migración 0099), de la eliminación física server-only y de la
 * validación UTF-8 estricta de CSV.
 *
 * Complementa —nunca sustituye— las pruebas vivas contra staging de
 * `tests/rls/textiles-t9e4-storage-policies.test.ts`.
 *
 * Correr: npx tsx tests/evidences/textiles-storage-policies-static.test.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stripSql = (s: string) => s.replace(/--[^\n]*/g, "");
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const MIGRATION = "supabase/migrations/0099_textile_storage_rls_and_csv_utf8_closure.sql";
const DB = "lib/db/textiles-evidences.ts";
const DOMAIN_SIG = "lib/domain/textiles-evidence-signatures.ts";

const sql = stripSql(read(MIGRATION));
const sqlLower = sql.toLowerCase();
/** Cuerpo de la política INSERT textil (para asertar sobre ELLA, no sobre el archivo). */
const textilePolicy = (() => {
  const start = sqlLower.indexOf("create policy evidences_insert_textiles");
  assert(start >= 0, "no existe la política evidences_insert_textiles");
  const end = sqlLower.indexOf("comment on policy", start);
  return sql.slice(start, end > start ? end : undefined);
})();

console.log("Trazaloop · T9E.4: políticas de Storage (0099)\n");

check("1. NO existe política DELETE para authenticated sobre rutas Textiles", () => {
  assert(
    /drop\s+policy\s+if\s+exists\s+evidences_delete_textiles\s+on\s+storage\.objects/.test(sqlLower),
    "0099 debe eliminar evidences_delete_textiles"
  );
  assert(
    !/create\s+policy[^;]*for\s+delete[^;]*storage\.objects/.test(sqlLower) &&
      !/for\s+delete\s+to\s+authenticated/.test(sqlLower),
    "0099 no debe crear ninguna política DELETE"
  );
});

check("2. NO existe política UPDATE para authenticated sobre rutas Textiles", () => {
  assert(
    !/create\s+policy[^;]*for\s+update/.test(sqlLower),
    "0099 no debe crear ninguna política UPDATE (deny-by-default)"
  );
});

check("3. La política INSERT Textiles exige object_path = name (coincidencia EXACTA)", () => {
  assert(
    /i\.object_path\s*=\s*storage\.objects\.name/.test(textilePolicy),
    "falta la igualdad exacta object_path = storage.objects.name"
  );
  assert(
    !/like|position\(|left\(|starts_?with/i.test(textilePolicy),
    "la coincidencia no puede ser por prefijo ni parcial"
  );
});

check("4. La política exige created_by = auth.uid()", () => {
  assert(/i\.created_by\s*=\s*auth\.uid\(\)/.test(textilePolicy), "falta created_by = auth.uid()");
});

check("5. La política exige estado pending y vigencia", () => {
  assert(/i\.status\s*=\s*'pending'/.test(textilePolicy), "falta status = 'pending'");
  assert(/i\.expires_at\s*>\s*now\(\)/.test(textilePolicy), "falta expires_at > now()");
});

check("6. La política excluye intentos ya ligados (consumed/expired/failed)", () => {
  // status = 'pending' excluye failed/expired/consumed por construcción…
  assert(/i\.status\s*=\s*'pending'/.test(textilePolicy), "el filtro de estado debe ser exacto");
  // …y además se exige que el intento no tenga evidencia ligada.
  assert(/i\.evidence_id\s+is\s+null/i.test(textilePolicy), "falta evidence_id is null");
});

check("7. La política Textiles no afecta las rutas CPR (política legada preservada)", () => {
  const legacyStart = sqlLower.indexOf("create policy evidences_insert_legacy");
  assert(legacyStart >= 0, "falta la política legada evidences_insert_legacy");
  const legacy = sql.slice(legacyStart, sqlLower.indexOf("create policy evidences_insert_textiles"));
  assert(
    /\(storage\.foldername\(name\)\)\[2\]\s+is\s+distinct\s+from\s+'textiles'/i.test(legacy),
    "la política legada debe EXCLUIR el prefijo textil"
  );
  assert(
    /has_org_role\([\s\S]*safe_uuid\(\(storage\.foldername\(name\)\)\[1\]\)[\s\S]*admin[\s\S]*quality[\s\S]*consultant/i.test(
      legacy
    ),
    "la política legada debe conservar la condición de 0016 (rol + organización por ruta)"
  );
  assert(
    /\(storage\.foldername\(name\)\)\[2\]\s*=\s*'textiles'/i.test(textilePolicy),
    "la política textil debe aplicar SOLO al prefijo textil"
  );
});

check("8. La política Textiles revalida rol y módulo habilitado", () => {
  assert(/has_org_role\(\s*i\.organization_id/.test(textilePolicy), "falta la revalidación de rol");
  assert(
    /organization_modules[\s\S]*module_code\s*=\s*'textiles'[\s\S]*m\.enabled/.test(textilePolicy),
    "falta la revalidación del módulo Textiles habilitado"
  );
});

check("9. 0099 no hace público el bucket ni concede nada a anon", () => {
  assert(!/update\s+storage\.buckets/i.test(sqlLower), "no debe tocar storage.buckets");
  assert(!/\bto\s+anon\b/.test(sqlLower), "no debe conceder nada a anon");
  assert(!/\bpublic\s*=\s*true/.test(sqlLower), "no debe hacer público el bucket");
});

check("10. 0099 no modifica ni elimina datos existentes", () => {
  assert(
    !/\bdelete\s+from\b|\btruncate\b|\bupdate\s+storage\.objects\b/.test(sqlLower),
    "0099 no debe borrar ni modificar filas"
  );
});

console.log("\nTrazaloop · T9E.4: eliminación física server-only\n");

const dbSrc = stripTs(read(DB));
const removeFn = (() => {
  const i = dbSrc.indexOf("export async function removeTextileEvidenceObject");
  assert(i >= 0, "no existe removeTextileEvidenceObject");
  const rest = dbSrc.slice(i);
  const next = rest.indexOf("export async function", 10);
  return next > 0 ? rest.slice(0, next) : rest;
})();

check("11. removeTextileEvidenceObject usa el cliente ADMINISTRATIVO server-only", () => {
  assert(removeFn.includes("createAdminClient()"), "debe usar createAdminClient()");
  assert(
    !removeFn.includes("createServerClient"),
    "NO debe usar el cliente de sesión: tras 0099 no hay política DELETE para authenticated"
  );
  assert(/import\s+"server-only"/.test(read("lib/supabase/admin.ts")), "admin.ts debe ser server-only");
  assert(/import\s+"server-only"/.test(read(DB)), "lib/db debe ser server-only");
});

check("12. La ruta NO se recibe del llamador: se lee del intento en la base", () => {
  assert(
    /export async function removeTextileEvidenceObject\(\s*intentId:\s*string\s*\)/.test(removeFn),
    "la firma debe recibir el intentId, jamás una ruta arbitraria"
  );
  assert(
    /from\("textile_evidence_upload_intents"\)[\s\S]*object_path/.test(removeFn),
    "debe leer object_path del intento"
  );
  assert(
    /isCanonicalTextileObjectPath\(/.test(removeFn),
    "debe validar la forma canónica de la ruta"
  );
});

check("13. Se niega a borrar objetos de evidencias (consumed / ligado / file_path)", () => {
  assert(/status\s*===\s*"consumed"/.test(removeFn), "debe rechazar intentos consumed");
  assert(/evidence_id\s*!==\s*null/.test(removeFn), "debe rechazar intentos con evidencia ligada");
  assert(
    /from\("textile_evidences"\)[\s\S]*eq\("file_path"/.test(removeFn),
    "debe comprobar que la ruta no pertenezca a una evidencia"
  );
  const iRemove = removeFn.indexOf(".remove([");
  const iConsumed = removeFn.indexOf('status === "consumed"');
  const iLinked = removeFn.indexOf('eq("file_path"');
  assert(iConsumed < iRemove && iLinked < iRemove, "las barreras deben evaluarse ANTES del remove");
});

check("14. El resultado del retiro se comprueba de verdad (limpieza recuperable)", () => {
  assert(/return\s+!error;/.test(removeFn), "debe devolver el resultado REAL del remove");
});

check("15. Ningún componente \"use client\" importa el módulo administrativo", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        const src = readFileSync(p, "utf8");
        if (/^\s*["']use client["']/.test(src.trimStart()) && /supabase\/admin/.test(src)) {
          offenders.push(p);
        }
      }
    }
  };
  for (const r of ["app", "components", "lib", "server"]) walk(join(process.cwd(), r));
  assert(offenders.length === 0, `módulos cliente importan admin: ${offenders.join(", ")}`);
});

console.log("\nTrazaloop · T9E.4: CSV UTF-8 estricto\n");

const sigSrc = stripTs(read(DOMAIN_SIG));

check("16. El helper CSV usa TextDecoder en modo fatal", () => {
  assert(
    /new TextDecoder\(\s*"utf-8"\s*,\s*\{\s*fatal:\s*true\s*\}\s*\)/.test(sigSrc),
    "debe decodificar con { fatal: true }"
  );
});

check("17. Ya NO se usa 'byte >= 0x80' como criterio de texto", () => {
  assert(!/b\s*>=\s*0x80/.test(sigSrc), "la regla débil byte >= 0x80 no debe permanecer");
  assert(!/looksLikeText\b/.test(sigSrc), "la función heurística anterior no debe permanecer");
  assert(/looksLikeUtf8Text\(/.test(sigSrc), "debe usarse el validador UTF-8 estricto");
});

check("18. BOM UTF-8 admitido y controles limitados a tab/LF/CR", () => {
  assert(/0xef[\s\S]{0,40}0xbb[\s\S]{0,40}0xbf/.test(sigSrc), "debe contemplar el BOM UTF-8");
  assert(
    /CSV_ALLOWED_CONTROLS\s*=\s*new Set\(\[\s*0x09,\s*0x0a,\s*0x0d\s*\]\)/.test(sigSrc),
    "solo tabulación, LF y CR deben admitirse como controles"
  );
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
