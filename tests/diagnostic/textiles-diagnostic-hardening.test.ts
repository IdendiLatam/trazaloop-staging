/**
 * Trazaloop · Sprint T2.1 (Textil) · Tests del hardening del diagnóstico
 * textil: inspección estática de la migración 0072 y del código (patrón de
 * los tests de fuente del proyecto, sin BD).
 *
 * Correr: npx tsx tests/diagnostic/textiles-diagnostic-hardening.test.ts
 * (Sin script en package.json a propósito: T2.1 no modifica package.json.)
 */
import fs from "node:fs";
import path from "node:path";

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
function readSource(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relPath), "utf8");
}

const MIG = readSource("../../supabase/migrations/0072_textile_diagnostic_hardening.sql");
const ACTIONS = readSource("../../server/actions/textiles-diagnostic.ts");

console.log("Trazaloop · Textil T2.1: alcance de la migración\n");

check("1. Existe la migración 0072 y el rango del sprint (0070–0072) sigue intacto", () => {
  // Actualizado en T4: este check fijaba TODAS las migraciones ≥0070 al trío
  // de T2.1, por lo que fallaba con cada sprint textil legítimo posterior
  // (0073, 0074…). La garantía real es que el trío del sprint no cambió y
  // que nada se insertó en su rango.
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => { const n = Number(f.slice(0, 4)); return n >= 70 && n <= 72; })
    .sort();
  assert(
    JSON.stringify(files) ===
      JSON.stringify([
        "0070_add_textiles_module.sql",
        "0071_textile_diagnostic.sql",
        "0072_textile_diagnostic_hardening.sql",
      ]),
    `el rango 0070–0072 cambió: ${files.join(", ")}`
  );
});

check("2. 0072 no crea tablas nuevas (ni textile_* fuera del diagnóstico ni de otro tipo)", () => {
  assert(!/create\s+table/i.test(MIG), "0072 no debía crear tablas");
  for (const banned of [
    "textile_products",
    "textile_materials",
    "textile_suppliers",
    "textile_batches",
    "textile_passports",
    "textile_circularity",
    "textile_evidence",
    "textile_claims",
    "organization_module_access",
    "organization_module_subscriptions",
  ]) {
    assert(!MIG.includes(banned), `0072 no debía mencionar ${banned}`);
  }
});

check("3. 0072 no toca objetos CPR ni planes (solo textile_* + helpers de lectura)", () => {
  // Todo alter table / policy / trigger debe apuntar a tablas textile_
  // (los "revoke ... on function public.x" no son objetos alterados).
  const targets = [
    ...[...MIG.matchAll(/alter table public\.([a-z_]+)/g)].map((m) => m[1]),
    ...[...MIG.matchAll(/\bon\s+public\.([a-z_]+)/g)]
      .map((m) => m[1])
      .filter((t) => !MIG.includes(`function public.${t}`)),
  ];
  assert(targets.length > 0, "debía haber objetos objetivo que auditar");
  for (const t of targets) {
    assert(
      t.startsWith("textile_") || t === "profiles",
      `objeto fuera de alcance en 0072: public.${t}`
    );
  }
  assert(!/plan_definitions|plan_limits|organization_subscriptions/.test(MIG), "0072 no debía tocar planes");
  assert(!/public\.diagnostics\b|public\.diagnostic_answers\b|public\.diagnostic_questions\b/.test(MIG), "0072 no debía tocar el diagnóstico CPR");
  assert(!/drop\s+table|truncate/i.test(MIG), "0072 no debía tener drops destructivos");
});

console.log("\nTrazaloop · Textil T2.1: campos calculados protegidos\n");

check("4. Se elimina el UPDATE directo de clientes sobre textile_diagnostics", () => {
  assert(MIG.includes("drop policy if exists textile_diagnostics_update"), "debía eliminarse la política de UPDATE de 0071");
  assert(!/create policy textile_diagnostics_update/.test(MIG), "no debía crearse ninguna política de UPDATE nueva para clientes — deny-by-default real");
});

check("5. El INSERT queda endurecido: nace en borrador, sin resultados y a nombre del usuario", () => {
  assert(MIG.includes("create policy textile_diagnostics_insert"), "debía recrearse la política de INSERT");
  for (const cond of [
    "started_by = auth.uid()",
    "status = 'in_progress'",
    "maturity_percent is null",
    "maturity_level is null",
    "critical_gaps = 0",
    "completed_at is null",
    "finalized_by is null",
  ]) {
    assert(MIG.includes(cond), `la política de INSERT debía exigir: ${cond}`);
  }
});

check("6. Trigger de protección: status y resultados solo cambian dentro de la RPC", () => {
  assert(MIG.includes("protect_textile_diagnostic_calculated_fields"), "debía existir el trigger de protección");
  for (const field of ["status", "maturity_percent", "maturity_level", "critical_gaps", "dimension_scores", "completed_at", "finalized_by"]) {
    assert(MIG.includes(`new.${field} is distinct from old.${field}`), `el trigger debía proteger ${field}`);
  }
  assert(MIG.includes("trazaloop.textile_diag_finalize"), "la bandera transaccional debía gobernar la excepción");
  assert(MIG.includes("set_config('trazaloop.textile_diag_finalize', '1', true)"), "solo la RPC debía fijar la bandera (transaccional)");
});

console.log("\nTrazaloop · Textil T2.1: finalización controlada (RPC)\n");

check("7. Existe la RPC finalize_textile_diagnostic (SECURITY DEFINER, grant a authenticated)", () => {
  assert(MIG.includes("create or replace function public.finalize_textile_diagnostic(p_diagnostic_id uuid)"), "debía existir la RPC");
  assert(MIG.includes("security definer"), "la RPC debía ser SECURITY DEFINER");
  assert(MIG.includes("set search_path = public"), "la RPC debía fijar search_path");
  assert(MIG.includes("revoke execute on function public.finalize_textile_diagnostic(uuid) from public, anon"), "debía revocarse a public/anon");
  assert(MIG.includes("grant execute on function public.finalize_textile_diagnostic(uuid) to authenticated"), "debía otorgarse solo a authenticated");
});

check("8. La RPC valida identidad, membresía y habilitación del módulo (sin filtrar cross-tenant)", () => {
  assert(MIG.includes("auth.uid()"), "debía validar auth.uid()");
  assert(MIG.includes("is_org_member(v_org)"), "debía validar membresía");
  assert(MIG.includes("module_code = 'textiles'") && MIG.includes("om.enabled"), "debía validar la habilitación del módulo textiles");
  assert(MIG.includes("no existe o no pertenece"), "el mensaje de no-propiedad no debía distinguir existencia (cross-tenant)");
});

check("9. La RPC exige borrador y la finalización es terminal (sin reapertura)", () => {
  assert(MIG.includes("v_status <> 'in_progress'"), "debía validar estado borrador");
  assert(!/reopen|reabrir|status\s*=\s*'in_progress'\s*where/i.test(MIG), "no debía existir mecanismo de reapertura");
});

check("10. La RPC verifica completitud contra las preguntas activas", () => {
  assert(MIG.includes("q.is_active") && MIG.includes("not exists"), "debía contar preguntas activas sin respuesta");
  assert(MIG.includes("Faltan % pregunta(s)"), "debía rechazar con conteo de faltantes");
});

check("11. La RPC y el trigger de respuestas rechazan 'No aplica' donde no se admite", () => {
  assert(MIG.includes("not q.allows_na"), "la RPC debía detectar NA inválidos");
  assert(MIG.includes("validate_textile_diagnostic_answer"), "debía existir el trigger de validación de respuestas");
  assert(MIG.includes("new.answer = 'not_applicable' and not v_allows_na"), "el trigger debía bloquear NA donde allows_na = false");
});

check("12. La RPC aplica la regla de contexto TQ49 sobre lo GUARDADO (inconsistencias no manipulan el cálculo)", () => {
  assert(MIG.includes("q.is_context") && MIG.includes("ctx_off"), "el cálculo debía derivar dimensiones con contexto apagado");
  assert(MIG.includes("'no', 'not_applicable'"), "contexto en no/No aplica debía apagar la dimensión");
  assert(MIG.includes("then 'not_applicable'"), "las no-contexto debían volverse No aplica en el cálculo");
});

console.log("\nTrazaloop · Textil T2.1: histórico y respuestas\n");

check("13. Las respuestas de un diagnóstico finalizado quedan bloqueadas para todos los roles", () => {
  assert(MIG.includes("lock_finalized_textile_diagnostic_answers"), "debía existir el trigger de bloqueo de respuestas");
  assert(MIG.includes("before insert or update or delete on public.textile_diagnostic_answers"), "el trigger debía cubrir insert/update/delete");
  // Y las políticas de 0071 siguen exigiendo diagnóstico en progreso:
  const base = readSource("../../supabase/migrations/0071_textile_diagnostic.sql");
  assert((base.match(/d\.status = 'in_progress'/g) ?? []).length >= 3, "las políticas de respuestas de 0071 debían seguir exigiendo borrador");
});

check("14. finalized_by queda registrado y completed_at es la fecha de finalización", () => {
  assert(MIG.includes("add column if not exists finalized_by"), "debía agregarse finalized_by (aditivo)");
  assert(MIG.includes("finalized_by = v_user"), "la RPC debía registrar quién finalizó");
  assert(MIG.includes("completed_at = now()"), "la RPC debía fijar la fecha de finalización");
  assert(!/add column if not exists finalized_at/.test(MIG), "no debía duplicarse la fecha con un finalized_at");
});

console.log("\nTrazaloop · Textil T2.1: server actions y lenguaje\n");

check("15. La finalización en actions usa la RPC — sin update directo de textile_diagnostics", () => {
  assert(ACTIONS.includes('rpc("finalize_textile_diagnostic"'), "completeTextileDiagnosticAction debía llamar a la RPC");
  assert(!ACTIONS.includes('.from("textile_diagnostics")\n    .update('), "no debía quedar update directo de textile_diagnostics");
  assert(!/from\("textile_diagnostics"\)\s*\.update\(/.test(ACTIONS), "no debía quedar update directo de textile_diagnostics (regex)");
});

check("16. Las actions no usan service_role y mantienen las guardas de módulo", () => {
  assert(!ACTIONS.includes("createAdminClient") && !ACTIONS.includes("service_role"), "las actions no debían usar el cliente admin");
  // Actualizado en T4: T2.1 encapsuló la triple guarda en
  // requireTextilesForAction (lib/auth/require-textiles-module.ts); el check
  // buscaba los nombres literales dentro de las actions y quedó desfasado.
  // Verificamos la garantía real siguiendo la indirección.
  assert(ACTIONS.includes("requireTextilesForAction"), "las actions debían pasar por el guard del módulo");
  const guard = readSource("../../lib/auth/require-textiles-module.ts");
  assert(
    guard.includes("isTextilesModuleEnabled") && guard.includes("organizationHasTextiles") && guard.includes("requireActiveOrg"),
    "el guard debía validar flag + habilitación + empresa activa"
  );
  assert(ACTIONS.includes("checkOrganizationCanMutate"), "el modo solo lectura de plataforma debía seguir");
});

check("17. Los textos siguen hablando de preparación (advertencia intacta)", () => {
  const domain = readSource("../../lib/domain/textiles-diagnostic.ts");
  assert(domain.includes("No constituye"), "la advertencia obligatoria debía seguir en el dominio");
  const results = readSource("../../app/(app)/(shell)/textiles/diagnostic/results/page.tsx");
  assert(results.includes("TEXTILE_DIAGNOSTIC_DISCLAIMER"), "resultados debía seguir mostrando la advertencia");
});

check("18. La UI de finalizar sigue llamando a la action (sin cambios de flujo en el wizard)", () => {
  const wizard = readSource("../../components/domain/textiles/diagnostic-wizard.tsx");
  assert(wizard.includes("completeTextileDiagnosticAction"), "el wizard debía seguir usando la action de finalizar");
  assert(!wizard.includes("finalize_textile_diagnostic"), "el wizard jamás llama la RPC directamente");
});

if (failures > 0) {
  console.error(`\n${failures} fallo(s).`);
  process.exit(1);
}
console.log("\nTodo verde.");
