/**
 * Trazaloop · Sprint T9E (Textil) · Regresión de seguridad transversal
 * (§10.8): sin service_role en cliente, sin organization_id del cliente,
 * RLS intacta, bucket privado, tokens hasheados, sin errores SQL crudos
 * al usuario y rutas públicas del pasaporte seguras.
 *
 * Correr: npx tsx tests/unit/textiles-t9e-security.test.ts
 */
import fs from "node:fs";
import path from "node:path";

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
const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
/** Código sin comentarios de línea ni de bloque: los comentarios pueden
 * NOMBRAR una práctica prohibida al explicar que no se usa. */
const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").replace(/^\s*--.*$/, ""))
    .join("\n");

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

console.log("Trazaloop · T9E: seguridad transversal del módulo Textil\n");

check("1. Ningún componente cliente usa service_role ni claves privadas", () => {
  const clientFiles = walk(path.join(root, "components"), [".tsx", ".ts"]);
  for (const f of clientFiles) {
    const src = stripComments(fs.readFileSync(f, "utf8"));
    assert(!src.includes("SERVICE_ROLE"), `${path.relative(root, f)} referencia la service role`);
    assert(!src.includes("service_role"), `${path.relative(root, f)} referencia service_role`);
  }
});

check("2. Ninguna server action textil confía en un organization_id del cliente", () => {
  const actionFiles = fs
    .readdirSync(path.join(root, "server/actions"))
    .filter((f) => f.startsWith("textiles-"));
  assert(actionFiles.length >= 10, "debían existir las actions textiles");
  for (const f of actionFiles) {
    const src = read(`server/actions/${f}`);
    assert(!src.includes("input.organizationId"), `${f} lee organization_id del cliente`);
    assert(
      !/formData\.get\(["']organization_?[iI]d["']\)/.test(src),
      `${f} lee organization_id desde FormData`
    );
    assert(
      src.includes("requireTextilesForAction") || src.includes("requireActiveOrg"),
      `${f} debía resolver la organización activa en servidor`
    );
  }
});

check("3. Las nuevas superficies T9E no debilitan RLS ni usan service_role", () => {
  for (const f of [
    "server/actions/textiles-catalogs-admin.ts",
    "lib/db/textiles-catalogs.ts",
    "lib/modules/registry.ts",
    "components/layout/nav.tsx",
    "components/layout/module-badge.tsx",
    "components/ui/confirm-dialog.tsx",
    "lib/domain/textiles-forms.ts",
  ]) {
    const src = stripComments(read(f));
    assert(!src.includes("service_role") && !src.includes("SERVICE_ROLE"), `${f} usa service role`);
    assert(!/disable row level security/i.test(src), `${f} intenta apagar RLS`);
  }
  const mig = read("supabase/migrations/0093_textile_custom_fibers.sql");
  assert(!/disable row level security/i.test(mig), "0093 jamás apaga RLS");
  assert(!/to anon/.test(mig), "0093 no concede nada a anon");
  assert(!/grant\s+(all|insert|update|delete)/i.test(mig), "0093 no agrega grants de escritura directos");
});

check("4. Los errores SQL crudos no llegan al usuario (mensajes seguros en actions)", () => {
  for (const f of ["textiles-catalogs.ts", "textiles-catalogs-admin.ts", "textiles-circularity.ts", "textiles-evidences.ts"]) {
    const src = read(`server/actions/${f}`);
    assert(!/error:\s*error\.message/.test(src), `${f} devuelve el mensaje SQL crudo`);
    assert(!/error:\s*String\(error\)/.test(src), `${f} devuelve el error crudo`);
  }
});

check("5. Tokens de enlaces privados: hasheados en BD, nunca en claro", () => {
  const mig = read("supabase/migrations/0092_textile_passport_private_share_links.sql");
  assert(mig.includes("token_hash"), "la tabla guarda hash del token");
  assert(mig.includes("sha256"), "el hash es sha256");
  assert(!/token\s+text\s+not\s+null/.test(mig), "jamás una columna token en claro");
});

check("6. La ruta pública del pasaporte no expone datos privados ni requiere shell", () => {
  const page = read("app/textile-passport-share/[token]/page.tsx");
  assert(!page.includes("requireSession"), "la ruta pública no exige sesión");
  assert(!page.includes("AppNav"), "la ruta pública no monta la navegación privada");
  assert(page.includes("resolve_textile_passport_share") || page.includes("resolveTextilePassportShare") || page.includes("resolvePassportShare"), "la resolución pasa por la RPC controlada");
});

check("7. El flag de Textiles vive solo en servidor (sin NEXT_PUBLIC_)", () => {
  const mod = read("lib/modules/textiles.ts");
  assert(mod.includes('TEXTILES_MODULE_ENABLED'), "el flag conserva su nombre");
  assert(!mod.includes("NEXT_PUBLIC_TEXTILES"), "el flag jamás se expone al navegador");
});

check("8. El registro central de navegación no filtra secretos ni depende de la BD", () => {
  const registry = stripComments(read("lib/modules/registry.ts"));
  assert(!registry.includes("process.env"), "el registro es puro (sin entorno)");
  assert(!registry.includes("supabase"), "el registro es puro (sin BD)");
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
