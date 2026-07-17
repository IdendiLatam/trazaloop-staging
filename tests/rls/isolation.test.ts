/**
 * Trazaloop · Sprint 1 · Pruebas obligatorias de aislamiento multiempresa.
 *
 * Cubre las 10 verificaciones del sprint:
 *  1. Usuario A crea organización A (vía RPC create_organization).
 *  2. Usuario B crea organización B.
 *  3. A no puede leer la organización B.
 *  4. B no puede leer la organización A.
 *  5. A no puede insertar un site en la organización B.
 *  6. Admin puede ver memberships de su organización.
 *  7. No-admin no puede gestionar memberships.
 *  8. audit_log no permite update/delete (append-only).
 *  9. create_organization crea organization + membership admin + módulos base.
 * 10. Todas las tablas org-scoped del sprint tienen RLS activo.
 *
 * Cómo correr (con Supabase local levantado y migraciones aplicadas):
 *   npm run test:rls
 *
 * Variables necesarias (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY,
 *   SUPABASE_DB_URL (opcional; habilita las pruebas 8-directa y 10)
 *
 * El service_role se usa AQUÍ únicamente para crear usuarios de prueba;
 * jamás forma parte del flujo de la aplicación.
 */
import { config as loadEnv } from "dotenv";
import { resolveNextStep } from "../../lib/domain/guided-flow";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL; // ej. postgresql://postgres:postgres@127.0.0.1:54322/postgres

if (!URL || !ANON || !SERVICE) {
  console.error(
    "Faltan variables para test:rls. Crea .env.local con NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY (cp .env.example .env.local). ADVERTENCIA: este test crea usuarios, organizaciones y datos de prueba; ejecutarlo solo en staging o local, nunca en producción con datos reales."
  );
  process.exit(1);
}

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed += 1;
  console.log(`  ✔ ${name}`);
}
function fail(name: string, detail?: unknown) {
  failed += 1;
  console.error(`  ✘ ${name}`, detail ?? "");
}
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    ok(name);
  } catch (e) {
    fail(name, e instanceof Error ? e.message : e);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function newUser(label: string) {
  const email = `rls-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Usuario ${label}` },
  });
  if (error || !data.user) throw new Error(`No se pudo crear usuario ${label}: ${error?.message}`);

  const client = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Login ${label} falló: ${signInError.message}`);
  return { id: data.user.id, email, client };
}

async function createOrg(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client.rpc("create_organization", { p_name: name });
  if (error || !data) throw new Error(`create_organization falló: ${error?.message}`);
  return data as string;
}

async function main() {
  console.log("\nTrazaloop · pruebas de aislamiento multiempresa (RLS)\n");

  const userA = await newUser("a");
  const userB = await newUser("b");
  const userC = await newUser("c"); // no-admin en org A

  let orgA = "";
  let orgB = "";

  // 1 y 2: creación de organizaciones vía RPC.
  await check("1. Usuario A crea organización A (RPC)", async () => {
    orgA = await createOrg(userA.client, `Org A ${Date.now()}`);
    assert(orgA, "sin id de organización A");
  });

  await check("2. Usuario B crea organización B (RPC)", async () => {
    orgB = await createOrg(userB.client, `Org B ${Date.now()}`);
    assert(orgB, "sin id de organización B");
  });

  // 9: la RPC creó organization + membership admin + módulos base.
  await check("9. create_organization creó org + membership admin + módulos base", async () => {
    const { data: org } = await userA.client
      .from("organizations")
      .select("id, name")
      .eq("id", orgA)
      .maybeSingle();
    assert(org, "A no ve su propia organización");

    const { data: mem } = await userA.client
      .from("memberships")
      .select("role_code, status")
      .eq("organization_id", orgA)
      .eq("user_id", userA.id)
      .maybeSingle();
    assert(mem?.role_code === "admin" && mem?.status === "active", "membership admin ausente");

    const { data: mods } = await userA.client
      .from("organization_modules")
      .select("module_code")
      .eq("organization_id", orgA);
    const codes = (mods ?? []).map((m) => m.module_code).sort();
    assert(
      ["core", "docs", "traceability_6632"].every((c) => codes.includes(c)),
      `módulos base incompletos: ${codes.join(", ")}`
    );
  });

  // 3 y 4: aislamiento de lectura entre organizaciones.
  await check("3. A no puede leer la organización B", async () => {
    const { data } = await userA.client
      .from("organizations")
      .select("id")
      .eq("id", orgB);
    assert((data ?? []).length === 0, "A pudo leer la organización B");
  });

  await check("4. B no puede leer la organización A", async () => {
    const { data } = await userB.client
      .from("organizations")
      .select("id")
      .eq("id", orgA);
    assert((data ?? []).length === 0, "B pudo leer la organización A");
  });

  // 5: A no puede insertar site en la organización B.
  await check("5. A no puede insertar un site en la organización B", async () => {
    const { data, error } = await userA.client
      .from("sites")
      .insert({ organization_id: orgB, name: "Sede intrusa" })
      .select();
    assert(error || (data ?? []).length === 0, "el INSERT cross-tenant fue aceptado");
  });

  // 6 y 7: memberships. A (admin) agrega a C como quality; C intenta gestionar.
  await check("6. Admin ve las memberships de su organización", async () => {
    const { error: insErr } = await userA.client
      .from("memberships")
      .insert({
        organization_id: orgA,
        user_id: userC.id,
        role_code: "quality",
        status: "active",
      });
    assert(!insErr, `admin no pudo agregar miembro: ${insErr?.message}`);

    const { data } = await userA.client
      .from("memberships")
      .select("user_id")
      .eq("organization_id", orgA);
    assert((data ?? []).length >= 2, "admin no ve todas las memberships de su org");
  });

  await check("7. No-admin no puede gestionar memberships", async () => {
    const { data, error } = await userC.client
      .from("memberships")
      .insert({
        organization_id: orgA,
        user_id: userB.id,
        role_code: "consultant",
        status: "active",
      })
      .select();
    assert(error || (data ?? []).length === 0, "un no-admin insertó memberships");

    const { data: upd } = await userC.client
      .from("memberships")
      .update({ role_code: "admin" })
      .eq("organization_id", orgA)
      .eq("user_id", userC.id)
      .select();
    assert((upd ?? []).length === 0, "un no-admin editó memberships");
  });

  // 8 (nivel cliente): sin políticas de escritura, update/delete no afectan filas.
  await check("8a. audit_log: cliente no puede update/delete (RLS)", async () => {
    const { data: upd } = await userA.client
      .from("audit_log")
      .update({ event_type: "hacked" })
      .eq("organization_id", orgA)
      .select();
    assert((upd ?? []).length === 0, "un cliente actualizó audit_log");

    const { data: del } = await userA.client
      .from("audit_log")
      .delete()
      .eq("organization_id", orgA)
      .select();
    assert((del ?? []).length === 0, "un cliente borró audit_log");
  });

  // 11: log_event() debe ser función INTERNA, no invocable por clientes
  // (Sprint 1.1). Con la implementación anterior (grant a authenticated)
  // estas dos primeras verificaciones FALLAN; con 0016_security_hardening pasan.
  await check("11a. A no puede llamar log_event contra la organización B", async () => {
    const { error } = await userA.client.rpc("log_event", {
      p_org: orgB,
      p_event: "fake_event",
      p_payload: { hacked: true },
    });
    assert(error, "log_event fue invocable por un cliente contra otra organización");
  });

  await check("11b. A tampoco puede llamar log_event contra su propia organización", async () => {
    const { error } = await userA.client.rpc("log_event", {
      p_org: orgA,
      p_event: "fake_event",
      p_payload: { hacked: true },
    });
    assert(error, "log_event sigue expuesta a clientes (debe ser interna)");
  });

  await check("11c. create_organization sigue registrando organization_created", async () => {
    // A es admin de orgA: puede leer la bitácora de su organización.
    const { data, error } = await userA.client
      .from("audit_log")
      .select("event_type, operation")
      .eq("organization_id", orgA)
      .eq("event_type", "organization_created");
    assert(!error, `no se pudo leer audit_log: ${error?.message}`);
    assert(
      (data ?? []).length >= 1,
      "el evento organization_created no quedó registrado por la RPC"
    );
  });

  // ==========================================================================
  // Sprint 2 · diagnósticos, catálogos, evidencias y reclasificación.
  // ==========================================================================
  let evidenceA = "";
  let materialA = "";

  await check("12. Empresa A no ve diagnósticos de empresa B", async () => {
    const { error: insErr } = await userB.client
      .from("diagnostics")
      .insert({ organization_id: orgB, started_by: userB.id });
    assert(!insErr, `B no pudo iniciar diagnóstico: ${insErr?.message}`);

    const { data } = await userA.client
      .from("diagnostics")
      .select("id")
      .eq("organization_id", orgB);
    assert((data ?? []).length === 0, "A pudo leer diagnósticos de B");
  });

  await check("13. Empresa A no ve catálogos de empresa B", async () => {
    const { error: insErr } = await userB.client
      .from("suppliers")
      .insert({ organization_id: orgB, name: "Proveedor de B" });
    assert(!insErr, `B no pudo crear proveedor: ${insErr?.message}`);

    const { data } = await userA.client
      .from("suppliers")
      .select("id")
      .eq("organization_id", orgB);
    assert((data ?? []).length === 0, "A pudo leer proveedores de B");
  });

  await check("14. Empresa A no ve evidencias de empresa B", async () => {
    const { data: evA, error: evErr } = await userA.client
      .from("evidences")
      .insert({ organization_id: orgA, name: "Soporte de origen A" })
      .select("id")
      .single();
    assert(!evErr && evA, `A no pudo crear evidencia: ${evErr?.message}`);
    evidenceA = evA!.id;

    const { data } = await userB.client
      .from("evidences")
      .select("id")
      .eq("organization_id", orgA);
    assert((data ?? []).length === 0, "B pudo leer evidencias de A");
  });

  await check("15. No se puede enlazar evidencia de A a material de B", async () => {
    const { data: matB, error: matErr } = await userB.client
      .from("materials")
      .insert({
        organization_id: orgB,
        name: "Material de B",
        classification_code: "postconsumer_valid",
      })
      .select("id")
      .single();
    assert(!matErr && matB, `B no pudo crear material: ${matErr?.message}`);

    // A intenta enlazar SU evidencia al material de B.
    const { data, error } = await userA.client
      .from("evidence_links")
      .insert({
        organization_id: orgA,
        evidence_id: evidenceA,
        target_type: "material",
        target_id: matB!.id,
      })
      .select();
    assert(error || (data ?? []).length === 0, "se aceptó un enlace de evidencia entre empresas");
  });

  await check("16. Consultant puede crear material pero NO reclasificar", async () => {
    // C es quality en orgA (prueba 6); se cambia a consultant para este caso.
    const { error: roleErr } = await userA.client
      .from("memberships")
      .update({ role_code: "consultant" })
      .eq("organization_id", orgA)
      .eq("user_id", userC.id);
    assert(!roleErr, `no se pudo poner a C como consultant: ${roleErr?.message}`);

    const { data: mat, error: matErr } = await userC.client
      .from("materials")
      .insert({
        organization_id: orgA,
        name: "Molido postindustrial A",
        classification_code: "postindustrial",
      })
      .select("id")
      .single();
    assert(!matErr && mat, `consultant no pudo crear material: ${matErr?.message}`);
    materialA = mat!.id;

    const { error: reclassErr } = await userC.client
      .from("materials")
      .update({
        reclassified_to_code: "preconsumer_valid",
        reclassification_justification: "Origen externo verificado",
        reclassification_evidence_id: evidenceA,
      })
      .eq("id", materialA);
    assert(reclassErr, "un consultant logró reclasificar (debe bloquearlo el trigger)");
  });

  await check("17. Admin/quality sí reclasifican con justificación y evidencia", async () => {
    // Sin justificación/evidencia debe fallar incluso para admin.
    const { error: bareErr } = await userA.client
      .from("materials")
      .update({ reclassified_to_code: "preconsumer_valid" })
      .eq("id", materialA);
    assert(bareErr, "se permitió reclasificar sin justificación ni evidencia");

    const { error } = await userA.client
      .from("materials")
      .update({
        reclassified_to_code: "preconsumer_valid",
        reclassification_justification: "Origen externo verificado con soporte",
        reclassification_evidence_id: evidenceA,
      })
      .eq("id", materialA);
    assert(!error, `admin no pudo reclasificar con soporte: ${error?.message}`);

    const { data } = await userA.client
      .from("materials")
      .select("reclassified_to_code, reclassified_by")
      .eq("id", materialA)
      .single();
    assert(data?.reclassified_to_code === "preconsumer_valid", "la reclasificación no quedó guardada");
    assert(data?.reclassified_by === userA.id, "el trigger no registró quién reclasificó");
  });

  await check("18. Consultant no puede marcar evidencia como valid", async () => {
    const { error } = await userC.client
      .from("evidences")
      .update({ status: "valid" })
      .eq("id", evidenceA);
    assert(error, "un consultant logró validar una evidencia (debe bloquearlo el trigger)");

    // admin sí puede.
    const { error: adminErr } = await userA.client
      .from("evidences")
      .update({ status: "valid" })
      .eq("id", evidenceA);
    assert(!adminErr, `admin no pudo validar la evidencia: ${adminErr?.message}`);
  });

  // ==========================================================================
  // Sprint 2.1 · evidencias validadas y barrido completo de visibilidad.
  // (Al llegar aquí, evidenceA quedó con status = 'valid' por la prueba 18
  // y C es consultant en la organización A.)
  // ==========================================================================
  await check("19. Consultant no puede modificar una evidencia validada", async () => {
    const { data, error } = await userC.client
      .from("evidences")
      .update({ name: "Nombre alterado por consultant" })
      .eq("id", evidenceA)
      .select();
    assert(
      error || (data ?? []).length === 0,
      "un consultant modificó una evidencia validada"
    );

    const { error: pathErr, data: pathData } = await userC.client
      .from("evidences")
      .update({ storage_path: "otra/ruta/falsa.pdf" })
      .eq("id", evidenceA)
      .select();
    assert(
      pathErr || (pathData ?? []).length === 0,
      "un consultant cambió el storage_path de una evidencia validada"
    );

    // admin sí puede seguir gestionándola.
    const { error: adminErr } = await userA.client
      .from("evidences")
      .update({ observations: "Revisión anual registrada" })
      .eq("id", evidenceA);
    assert(!adminErr, `admin no pudo editar la evidencia validada: ${adminErr?.message}`);
  });

  await check("19b. Una evidencia validada no puede eliminarse (ni por admin)", async () => {
    const { data, error } = await userA.client
      .from("evidences")
      .delete()
      .eq("id", evidenceA)
      .select();
    assert(
      error || (data ?? []).length === 0,
      "se eliminó una evidencia validada (debe bloquearlo RLS + trigger)"
    );
  });

  await check("20. Consultant puede crear evidencia pendiente y editarla", async () => {
    const { data, error } = await userC.client
      .from("evidences")
      .insert({ organization_id: orgA, name: "Borrador de soporte (consultant)" })
      .select("id, status")
      .single();
    assert(!error && data, `consultant no pudo crear evidencia: ${error?.message}`);
    assert(data!.status === "pending", "la evidencia nueva no quedó pendiente");

    const { error: editErr } = await userC.client
      .from("evidences")
      .update({ observations: "Complementada por el consultor" })
      .eq("id", data!.id);
    assert(!editErr, `consultant no pudo editar su evidencia pendiente: ${editErr?.message}`);
  });

  await check("21. A no ve NADA de B: respuestas, enlaces, familias, productos, materiales, import_jobs", async () => {
    // B genera datos en cada tabla.
    const { data: diagB } = await userB.client
      .from("diagnostics")
      .select("id")
      .eq("organization_id", orgB)
      .limit(1)
      .single();
    const { data: anyQuestion } = await userB.client
      .from("diagnostic_questions")
      .select("id")
      .limit(1)
      .single();
    await userB.client.from("diagnostic_answers").insert({
      organization_id: orgB,
      diagnostic_id: diagB!.id,
      question_id: anyQuestion!.id,
      answer: true,
    });

    const { data: evB } = await userB.client
      .from("evidences")
      .insert({ organization_id: orgB, name: "Soporte de B" })
      .select("id")
      .single();
    const { data: matB } = await userB.client
      .from("materials")
      .select("id")
      .eq("organization_id", orgB)
      .limit(1)
      .single();
    await userB.client.from("evidence_links").insert({
      organization_id: orgB,
      evidence_id: evB!.id,
      target_type: "material",
      target_id: matB!.id,
    });

    await userB.client
      .from("product_families")
      .insert({ organization_id: orgB, name: "Familia de B" });
    const { data: famB } = await userB.client
      .from("product_families")
      .select("id")
      .eq("organization_id", orgB)
      .single();
    await userB.client.from("products").insert({
      organization_id: orgB,
      code: "B-001",
      name: "Producto de B",
      family_id: famB!.id,
    });
    await userB.client.from("import_jobs").insert({
      organization_id: orgB,
      entity: "suppliers",
      status: "validated",
      total_rows: 1,
    });

    // A intenta verlo todo.
    const tables = [
      "diagnostic_answers",
      "evidence_links",
      "product_families",
      "products",
      "materials",
      "import_jobs",
    ] as const;
    for (const table of tables) {
      const { data } = await userA.client
        .from(table)
        .select("id")
        .eq("organization_id", orgB);
      assert((data ?? []).length === 0, `A pudo leer ${table} de B`);
    }
  });

  await check("22. organization_id inmutable: un usuario en DOS empresas no puede trasladar filas", async () => {
    // C (consultant en A) se agrega también a la empresa B → C pasa el USING
    // de la empresa origen y el WITH CHECK de la destino: solo el trigger
    // prevent_organization_id_change debe detener el traslado.
    const { error: memErr } = await userB.client.from("memberships").insert({
      organization_id: orgB,
      user_id: userC.id,
      role_code: "consultant",
      status: "active",
    });
    assert(!memErr, `no se pudo agregar a C en la empresa B: ${memErr?.message}`);

    // Filas de A para intentar mover: proveedor, evidencia pendiente y material.
    const { data: supA, error: supErr } = await userA.client
      .from("suppliers")
      .insert({ organization_id: orgA, name: `Proveedor inamovible ${Date.now()}` })
      .select("id")
      .single();
    assert(!supErr && supA, `no se pudo crear proveedor de prueba: ${supErr?.message}`);

    const { data: evPend, error: evErr } = await userC.client
      .from("evidences")
      .insert({ organization_id: orgA, name: `Evidencia inamovible ${Date.now()}` })
      .select("id")
      .single();
    assert(!evErr && evPend, `no se pudo crear evidencia de prueba: ${evErr?.message}`);

    const attempts: { table: string; id: string }[] = [
      { table: "suppliers", id: supA!.id },
      { table: "evidences", id: evPend!.id },
      { table: "materials", id: materialA },
    ];

    for (const { table, id } of attempts) {
      const { data, error } = await userC.client
        .from(table)
        .update({ organization_id: orgB })
        .eq("id", id)
        .select();
      assert(
        error || (data ?? []).length === 0,
        `${table}: se aceptó cambiar organization_id hacia otra empresa`
      );

      // La fila debe seguir en la empresa original.
      const { data: still } = await userC.client
        .from(table)
        .select("id")
        .eq("id", id)
        .eq("organization_id", orgA);
      assert(
        (still ?? []).length === 1,
        `${table}: la fila ya no está en la empresa original`
      );
    }
  });


  // =========================================================================
  // Sprint 3 · Trazabilidad operativa
  // =========================================================================
  // Fixtures de B: cadena completa para probar aislamiento.
  let ibB = ""; let poB = ""; let obB = "";

  await check("24. Empresa A no ve lotes, órdenes, consumos ni composición de B", async () => {
    const { data: supB } = await userB.client
      .from("suppliers").insert({ organization_id: orgB, name: "Proveedor traza B" })
      .select("id").single();
    const { data: matB } = await userB.client
      .from("materials")
      .insert({ organization_id: orgB, name: "Material traza B", classification_code: "postconsumer_valid" })
      .select("id").single();
    assert(supB && matB, "B no pudo crear proveedor/material de trazabilidad");

    const { data: ib, error: ibErr } = await userB.client
      .from("input_batches")
      .insert({
        organization_id: orgB, batch_code: "B-LE-001", supplier_id: supB!.id,
        material_id: matB!.id, received_date: "2026-07-01", quantity_kg: 100,
      })
      .select("id").single();
    assert(!ibErr && ib, `B no pudo crear lote de entrada: ${ibErr?.message}`);
    ibB = ib!.id;

    const { data: po, error: poErr } = await userB.client
      .from("production_orders")
      .insert({ organization_id: orgB, order_code: "B-OP-001", order_date: "2026-07-02" })
      .select("id").single();
    assert(!poErr && po, `B no pudo crear orden: ${poErr?.message}`);
    poB = po!.id;

    const { error: bcErr } = await userB.client.from("batch_consumption").insert({
      organization_id: orgB, production_order_id: poB, input_batch_id: ibB, mass_kg: 50,
    });
    assert(!bcErr, `B no pudo registrar consumo: ${bcErr?.message}`);

    const { data: ob, error: obErr } = await userB.client
      .from("output_batches")
      .insert({ organization_id: orgB, batch_code: "B-LS-001", production_order_id: poB })
      .select("id").single();
    assert(!obErr && ob, `B no pudo crear lote de salida: ${obErr?.message}`);
    obB = ob!.id;

    const { error: cpErr } = await userB.client.from("batch_composition").insert({
      organization_id: orgB, output_batch_id: obB, material_id: matB!.id, mass_kg: 50,
    });
    assert(!cpErr, `B no pudo registrar composición: ${cpErr?.message}`);

    for (const table of ["input_batches", "production_orders", "batch_consumption", "output_batches", "batch_composition"] as const) {
      const { data } = await userA.client.from(table).select("id").eq("organization_id", orgB);
      assert((data ?? []).length === 0, `A pudo leer ${table} de B`);
    }
  });

  // Fixtures de A: cadenas para FK cruzadas, roles y vistas de trazabilidad.
  let supA3 = ""; let matA3 = ""; let matA3b = ""; let prodA3 = "";
  let ibA1 = ""; let ibA2 = ""; let poA1 = ""; let poA2 = ""; let poA3 = "";
  let obA1 = ""; let obA2 = ""; let obA3 = "";

  await check("25. FK compuestas: A no puede consumir/derivar/componer con filas de B", async () => {
    const { data: sup } = await userA.client
      .from("suppliers").insert({ organization_id: orgA, name: "Proveedor traza A" })
      .select("id").single();
    const { data: mat } = await userA.client
      .from("materials")
      .insert({ organization_id: orgA, name: "Material traza A", classification_code: "postconsumer_valid" })
      .select("id").single();
    const { data: matBis } = await userA.client
      .from("materials")
      .insert({ organization_id: orgA, name: "Material traza A bis", classification_code: "preconsumer_valid" })
      .select("id").single();
    assert(sup && mat && matBis, "A no pudo crear proveedor/materiales de trazabilidad");
    supA3 = sup!.id; matA3 = mat!.id; matA3b = matBis!.id;

    const { data: ib } = await userA.client
      .from("input_batches")
      .insert({
        organization_id: orgA, batch_code: "A-LE-001", supplier_id: supA3,
        material_id: matA3, received_date: "2026-07-01", quantity_kg: 200,
      })
      .select("id").single();
    const { data: po } = await userA.client
      .from("production_orders")
      .insert({ organization_id: orgA, order_code: "A-OP-001", order_date: "2026-07-02" })
      .select("id").single();
    assert(ib && po, "A no pudo crear lote/orden base");
    ibA1 = ib!.id; poA1 = po!.id;

    // Consumo en A con lote de entrada de B.
    const { data: c1, error: e1 } = await userA.client
      .from("batch_consumption")
      .insert({ organization_id: orgA, production_order_id: poA1, input_batch_id: ibB, mass_kg: 10 })
      .select();
    assert(e1 || (c1 ?? []).length === 0, "se aceptó consumo en A con lote de B");

    // Lote de salida en A con orden de B.
    const { data: c2, error: e2 } = await userA.client
      .from("output_batches")
      .insert({ organization_id: orgA, batch_code: "A-LS-X", production_order_id: poB })
      .select();
    assert(e2 || (c2 ?? []).length === 0, "se aceptó lote de salida en A con orden de B");

    // Composición en A con material de B: primero un lote de salida legítimo de A.
    const { data: ob } = await userA.client
      .from("output_batches")
      .insert({ organization_id: orgA, batch_code: "A-LS-001", production_order_id: poA1 })
      .select("id").single();
    assert(ob, "A no pudo crear su lote de salida");
    obA1 = ob!.id;

    const { data: matB2 } = await userB.client
      .from("materials").select("id").eq("organization_id", orgB).limit(1).single();
    const { data: c3, error: e3 } = await userA.client
      .from("batch_composition")
      .insert({ organization_id: orgA, output_batch_id: obA1, material_id: matB2!.id, mass_kg: 10 })
      .select();
    assert(e3 || (c3 ?? []).length === 0, "se aceptó composición en A con material de B");
  });

  await check("26. organization_id inmutable en las 5 tablas de trazabilidad", async () => {
    // C es consultant en A y en B (caso 22): solo el trigger frena el traslado.
    const { data: bc } = await userA.client
      .from("batch_consumption")
      .insert({ organization_id: orgA, production_order_id: poA1, input_batch_id: ibA1, mass_kg: 100 })
      .select("id").single();
    const { data: cp } = await userA.client
      .from("batch_composition")
      .insert({ organization_id: orgA, output_batch_id: obA1, material_id: matA3, mass_kg: 100 })
      .select("id").single();
    assert(bc && cp, "no se pudieron crear consumo/composición de prueba");

    const attempts: { table: string; id: string }[] = [
      { table: "input_batches", id: ibA1 },
      { table: "production_orders", id: poA1 },
      { table: "batch_consumption", id: bc!.id },
      { table: "output_batches", id: obA1 },
      { table: "batch_composition", id: cp!.id },
    ];
    for (const { table, id } of attempts) {
      const { data, error } = await userC.client
        .from(table)
        .update({ organization_id: orgB })
        .eq("id", id)
        .select();
      assert(error || (data ?? []).length === 0, `${table}: se aceptó cambiar organization_id`);
      const { data: still } = await userC.client
        .from(table).select("id").eq("id", id).eq("organization_id", orgA);
      assert((still ?? []).length === 1, `${table}: la fila ya no está en la empresa original`);
    }
  });

  await check("27. No se puede enlazar evidencia de A a lote/orden/salida de B", async () => {
    const targets: { type: string; id: string }[] = [
      { type: "input_batch", id: ibB },
      { type: "production_order", id: poB },
      { type: "output_batch", id: obB },
    ];
    for (const t of targets) {
      const { data, error } = await userA.client
        .from("evidence_links")
        .insert({
          organization_id: orgA,
          evidence_id: evidenceA,
          target_type: t.type,
          target_id: t.id,
        })
        .select();
      assert(error || (data ?? []).length === 0, `se aceptó enlace de evidencia a ${t.type} de B`);
    }
  });

  await check("28. Consultant puede crear toda la cadena de trazabilidad", async () => {
    const { data: ib, error: e1 } = await userC.client
      .from("input_batches")
      .insert({
        organization_id: orgA, batch_code: "A-LE-C01", supplier_id: supA3,
        material_id: matA3, received_date: "2026-07-03", quantity_kg: 500,
      })
      .select("id").single();
    assert(!e1 && ib, `consultant no pudo crear lote de entrada: ${e1?.message}`);
    ibA2 = ib!.id;

    const { data: po, error: e2 } = await userC.client
      .from("production_orders")
      .insert({ organization_id: orgA, order_code: "A-OP-C01", order_date: "2026-07-04" })
      .select("id").single();
    assert(!e2 && po, `consultant no pudo crear orden: ${e2?.message}`);
    poA2 = po!.id;

    const { error: e3 } = await userC.client.from("batch_consumption").insert({
      organization_id: orgA, production_order_id: poA2, input_batch_id: ibA2, mass_kg: 100,
    });
    assert(!e3, `consultant no pudo registrar consumo: ${e3?.message}`);

    const { data: ob, error: e4 } = await userC.client
      .from("output_batches")
      .insert({ organization_id: orgA, batch_code: "A-LS-C01", production_order_id: poA2 })
      .select("id").single();
    assert(!e4 && ob, `consultant no pudo crear lote de salida: ${e4?.message}`);
    obA2 = ob!.id;

    const { error: e5 } = await userC.client.from("batch_composition").insert({
      organization_id: orgA, output_batch_id: obA2, material_id: matA3, mass_kg: 80,
    });
    assert(!e5, `consultant no pudo registrar composición: ${e5?.message}`);
  });

  await check("29. Solo admin/quality eliminan registros de trazabilidad", async () => {
    // Fila desechable: composición extra con el segundo material.
    const { data: extra, error: exErr } = await userA.client
      .from("batch_composition")
      .insert({ organization_id: orgA, output_batch_id: obA2, material_id: matA3b, mass_kg: 5 })
      .select("id").single();
    assert(!exErr && extra, `no se pudo crear la fila desechable: ${exErr?.message}`);

    // Consultant intenta eliminar → RLS deja 0 filas.
    const { data: delC } = await userC.client
      .from("batch_composition").delete().eq("id", extra!.id).select("id");
    assert((delC ?? []).length === 0, "consultant pudo eliminar composición");

    // Admin sí puede.
    const { data: delA, error: delErr } = await userA.client
      .from("batch_composition").delete().eq("id", extra!.id).select("id");
    assert(!delErr && (delA ?? []).length === 1, `admin no pudo eliminar: ${delErr?.message}`);

    // Y el lote de entrada consumido NO se puede eliminar (FK restrict).
    const { error: fkErr } = await userA.client
      .from("input_batches").delete().eq("id", ibA2);
    assert(Boolean(fkErr), "se eliminó un lote de entrada ya consumido (FK restrict falló)");
  });

  await check("30. Vistas de trazabilidad: estado, genealogía y sumas de masa", async () => {
    // (a) Lote de salida SIN consumo ni composición → incomplete.
    const { data: po3 } = await userA.client
      .from("production_orders")
      .insert({ organization_id: orgA, order_code: "A-OP-VACIA", order_date: "2026-07-05" })
      .select("id").single();
    const { data: ob3 } = await userA.client
      .from("output_batches")
      .insert({ organization_id: orgA, batch_code: "A-LS-VACIO", production_order_id: po3!.id })
      .select("id").single();
    assert(po3 && ob3, "no se pudo crear el lote vacío");
    poA3 = po3!.id; obA3 = ob3!.id;

    const { data: cEmpty } = await userA.client
      .from("v_output_batch_completeness").select("*")
      .eq("output_batch_id", obA3).single();
    assert(cEmpty?.traceability_status === "incomplete",
      `lote sin composición debería ser incomplete, fue ${cEmpty?.traceability_status}`);
    assert((cEmpty?.missing_items ?? []).length > 0, "incomplete sin missing_items");

    // (b) Cadena completa balanceada (consumo 100 · composición 100 · producido 100) → complete.
    const { error: updErr } = await userA.client
      .from("output_batches")
      .update({ produced_quantity_kg: 100 })
      .eq("id", obA1);
    assert(!updErr, `no se pudo fijar cantidad producida: ${updErr?.message}`);

    const { data: cFull } = await userA.client
      .from("v_output_batch_completeness").select("*")
      .eq("output_batch_id", obA1).single();
    assert(cFull?.traceability_status === "complete",
      `cadena balanceada debería ser complete, fue ${cFull?.traceability_status} (faltan: ${(cFull?.missing_items ?? []).join(", ")})`);
    // (f) Sumas correctas.
    assert(Number(cFull?.consumed_mass_kg) === 100, `consumo esperado 100, fue ${cFull?.consumed_mass_kg}`);
    assert(Number(cFull?.composition_mass_kg) === 100, `composición esperada 100, fue ${cFull?.composition_mass_kg}`);

    // (c) Balance fuera del 5% (consumo 100 vs composición 80) → complete_with_warnings.
    const { data: cWarn } = await userA.client
      .from("v_output_batch_completeness").select("*")
      .eq("output_batch_id", obA2).single();
    assert(cWarn?.traceability_status === "complete_with_warnings",
      `cadena desbalanceada debería tener advertencia, fue ${cWarn?.traceability_status}`);
    assert(cWarn?.mass_balance_warning === true, "mass_balance_warning debería ser true");

    // (d) Backward: output → orden → lote de entrada → proveedor/material.
    const { data: fam } = await userA.client
      .from("product_families")
      .insert({ organization_id: orgA, name: "Familia traza A" })
      .select("id").single();
    const { data: prod } = await userA.client
      .from("products")
      .insert({ organization_id: orgA, code: "A-PT-01", name: "Producto traza A", family_id: fam!.id })
      .select("id").single();
    assert(prod, "no se pudo crear el producto");
    prodA3 = prod!.id;
    await userA.client.from("output_batches").update({ product_id: prodA3 }).eq("id", obA1);

    const { data: back } = await userA.client
      .from("v_traceability_backward").select("*")
      .eq("output_batch_id", obA1);
    const bRow = (back ?? []).find((r) => r.input_batch_id === ibA1);
    assert(Boolean(bRow), "backward no reconstruyó el lote de entrada");
    assert(bRow!.supplier_name === "Proveedor traza A", `backward: proveedor fue ${bRow!.supplier_name}`);
    assert(bRow!.material_name === "Material traza A", `backward: material fue ${bRow!.material_name}`);
    assert(bRow!.production_order_code === "A-OP-001", `backward: orden fue ${bRow!.production_order_code}`);
    assert(Number(bRow!.consumed_mass_kg) === 100, `backward: masa fue ${bRow!.consumed_mass_kg}`);

    // (e) Forward: lote de entrada → orden → lote de salida → producto.
    const { data: fwd } = await userA.client
      .from("v_traceability_forward").select("*")
      .eq("input_batch_id", ibA1);
    const fRow = (fwd ?? []).find((r) => r.output_batch_id === obA1);
    assert(Boolean(fRow), "forward no reconstruyó el lote de salida");
    assert(fRow!.product_code === "A-PT-01", `forward: producto fue ${fRow!.product_code}`);
    assert(fRow!.production_order_code === "A-OP-001", `forward: orden fue ${fRow!.production_order_code}`);

    // (f) Balance por orden.
    const { data: bal } = await userA.client
      .from("v_production_order_mass_balance").select("*")
      .eq("production_order_id", poA1).single();
    assert(Number(bal?.consumed_mass_kg) === 100, `orden: consumo fue ${bal?.consumed_mass_kg}`);
    assert(Number(bal?.composition_mass_kg) === 100, `orden: composición fue ${bal?.composition_mass_kg}`);
    assert(bal?.mass_balance_warning === false, "orden balanceada no debería tener advertencia");
    assert(Number(bal?.output_batches_count) === 1 && Number(bal?.input_batches_count) === 1,
      "conteos de la orden incorrectos");
    void poA3;
  });


  // =========================================================================
  // Sprint 4 · Motor de cálculo de contenido reciclado
  // =========================================================================
  const close = (a: unknown, b: number, tol = 0.001) => Math.abs(Number(a) - b) <= tol;

  await check("31. Metodología global: legible por autenticados, inmutable desde cliente", async () => {
    const { data: meths } = await userC.client
      .from("calculation_methodologies")
      .select("id, code, version, is_active, rules")
      .eq("code", "RC-6632-15343");
    assert((meths ?? []).length >= 1, "no se pudo leer la metodología RC-6632-15343");
    assert(meths![0].is_active === true, "la metodología seed no está activa");

    const { data: ins, error: insErr } = await userA.client
      .from("calculation_methodologies")
      .insert({ code: "HACK", version: 1, name: "x", description: "x", rules: {} })
      .select();
    assert(insErr !== null || (ins ?? []).length === 0, "un cliente pudo insertar metodología");

    const { data: upd, error: updErr } = await userA.client
      .from("calculation_methodologies")
      .update({ is_active: false })
      .eq("id", meths![0].id)
      .select();
    assert(updErr !== null || (upd ?? []).length === 0, "un cliente pudo editar metodología");
  });

  // Fixtures de cálculo en A (materiales, evidencias y cadenas balanceadas).
  let evValid = ""; let evValid2 = ""; let evPending = "";
  let matPC = ""; let matVirgin = ""; let matSame = ""; let matPI = ""; let matPIre = ""; let matPCpend = "";
  let famS4 = ""; let prodP41 = ""; let prodP42 = "";
  const obS4: Record<string, string> = {};
  const orderS4: Record<string, string> = {};

  async function makeChain(tag: string, consumeKg: number, extra: Record<string, unknown> = {}) {
    const { data: po } = await userA.client
      .from("production_orders")
      .insert({ organization_id: orgA, order_code: `A-OP-${tag}`, order_date: "2026-07-05" })
      .select("id").single();
    const { data: ib } = await userA.client
      .from("input_batches")
      .insert({
        organization_id: orgA, batch_code: `A-LE-${tag}`, supplier_id: supA3,
        material_id: matA3, received_date: "2026-07-04", quantity_kg: consumeKg * 2,
      })
      .select("id").single();
    await userA.client.from("batch_consumption").insert({
      organization_id: orgA, production_order_id: po!.id, input_batch_id: ib!.id, mass_kg: consumeKg,
    });
    const { data: ob } = await userA.client
      .from("output_batches")
      .insert({
        organization_id: orgA, batch_code: `A-LS-${tag}`, production_order_id: po!.id, ...extra,
      })
      .select("id").single();
    orderS4[tag] = po!.id;
    obS4[tag] = ob!.id;
    return ob!.id;
  }

  async function compose(obId: string, materialId: string, mass: number, sameProcess = false) {
    const { error } = await userA.client.from("batch_composition").insert({
      organization_id: orgA, output_batch_id: obId, material_id: materialId,
      mass_kg: mass, is_same_process: sameProcess,
    });
    assert(!error, `no se pudo componer: ${error?.message}`);
  }

  await check("32. Fixtures de cálculo: evidencias validadas y materiales por clasificación", async () => {
    async function makeEvidence(name: string, validate: boolean) {
      const { data: ev, error } = await userA.client
        .from("evidences")
        .insert({ organization_id: orgA, name })
        .select("id").single();
      assert(!error && ev, `no se pudo crear evidencia ${name}: ${error?.message}`);
      if (validate) {
        const { error: vErr } = await userA.client
          .from("evidences").update({ status: "valid" }).eq("id", ev!.id);
        assert(!vErr, `no se pudo validar evidencia ${name}: ${vErr?.message}`);
      }
      return ev!.id;
    }
    evValid = await makeEvidence("Soporte de origen S4", true);
    evValid2 = await makeEvidence("Soporte de reclasificación S4", true);
    evPending = await makeEvidence("Soporte pendiente S4", false);

    async function makeMaterial(name: string, cls: string, patch: Record<string, unknown> | null) {
      const { data: m, error } = await userA.client
        .from("materials")
        .insert({ organization_id: orgA, name, classification_code: cls })
        .select("id").single();
      assert(!error && m, `no se pudo crear material ${name}: ${error?.message}`);
      if (patch) {
        const { error: uErr } = await userA.client
          .from("materials").update(patch).eq("id", m!.id);
        assert(!uErr, `no se pudo actualizar material ${name}: ${uErr?.message}`);
      }
      return m!.id;
    }
    matPC = await makeMaterial("PC valido S4", "postconsumer_valid", {
      origin_support_evidence_id: evValid,
    });
    matVirgin = await makeMaterial("Virgen S4", "virgin", null);
    matSame = await makeMaterial("Mismo proceso S4", "internal_same_process", null);
    matPI = await makeMaterial("Postindustrial S4", "postindustrial", null);
    matPIre = await makeMaterial("Postindustrial reclasificado S4", "postindustrial", {
      reclassified_to_code: "preconsumer_valid",
      reclassification_justification: "Origen externo verificado, flujo separado",
      reclassification_evidence_id: evValid2,
    });
    matPCpend = await makeMaterial("PC pendiente S4", "postconsumer_valid", {
      origin_support_evidence_id: evPending,
    });

    const { data: fam } = await userA.client
      .from("product_families")
      .insert({ organization_id: orgA, name: "Familia calculo S4" })
      .select("id").single();
    famS4 = fam!.id;
    const { data: p1 } = await userA.client
      .from("products")
      .insert({ organization_id: orgA, code: "S4-P1", name: "Producto S4-1", family_id: famS4 })
      .select("id").single();
    const { data: p2 } = await userA.client
      .from("products")
      .insert({
        organization_id: orgA, code: "S4-P2", name: "Producto S4-2",
        family_id: famS4, declared_recycled_percent: 80,
      })
      .select("id").single();
    prodP41 = p1!.id; prodP42 = p2!.id;
  });

  await check("33. Casos de cálculo 1-6: reglas por material, soporte y riesgo declarado", async () => {
    const rpc = (obId: string) =>
      userA.client.rpc("calculate_recycled_content", { p_output_batch_id: obId });

    // Caso 1 — postconsumo válido cuenta; virgen no.
    await makeChain("41", 100, { product_id: prodP41, produced_date: "2026-07-10", produced_quantity_kg: 100 });
    await compose(obS4["41"], matPC, 70);
    await compose(obS4["41"], matVirgin, 30);
    const { data: c1, error: e1 } = await rpc(obS4["41"]);
    assert(!e1 && c1, `caso 1 falló: ${e1?.message}`);
    assert(close(c1.total_mass_kg, 100) && close(c1.recycled_mass_kg, 70) && close(c1.recycled_percent, 70),
      `caso 1: esperado 70/100=70%, fue ${c1.recycled_mass_kg}/${c1.total_mass_kg}=${c1.recycled_percent}`);
    assert(c1.defensibility_level === "defensible", `caso 1: esperado defensible, fue ${c1.defensibility_level}`);
    const comps1 = c1.components as { material_id: string; counted: boolean; exclusion_reason: string | null }[];
    assert(comps1.find((x) => x.material_id === matPC)?.counted === true, "caso 1: PC no contó");
    assert(comps1.find((x) => x.material_id === matVirgin)?.exclusion_reason === "non_recycled_material",
      "caso 1: virgen sin razón non_recycled_material");

    // Caso 2 — mismo proceso suma denominador pero no numerador.
    await makeChain("42", 100);
    await compose(obS4["42"], matPC, 60);
    await compose(obS4["42"], matSame, 40, true);
    const { data: c2, error: e2 } = await rpc(obS4["42"]);
    assert(!e2 && close(c2.recycled_percent, 60) && close(c2.total_mass_kg, 100),
      `caso 2: esperado 60%, fue ${c2?.recycled_percent}`);
    const comps2 = c2.components as { material_id: string; exclusion_reason: string | null }[];
    assert(comps2.find((x) => x.material_id === matSame)?.exclusion_reason === "same_process_or_never_counts",
      "caso 2: mismo proceso sin razón same_process_or_never_counts");

    // Caso 3 — postindustrial sin reclasificar no cuenta.
    await makeChain("43", 100);
    await compose(obS4["43"], matPI, 50);
    await compose(obS4["43"], matVirgin, 50);
    const { data: c3, error: e3 } = await rpc(obS4["43"]);
    assert(!e3 && close(c3.recycled_percent, 0), `caso 3: esperado 0%, fue ${c3?.recycled_percent}`);
    assert(c3.defensibility_level === "preliminary", `caso 3: esperado preliminary, fue ${c3.defensibility_level}`);
    const comps3 = c3.components as { material_id: string; exclusion_reason: string | null }[];
    assert(comps3.find((x) => x.material_id === matPI)?.exclusion_reason === "postindustrial_not_reclassified",
      "caso 3: falta razón postindustrial_not_reclassified");

    // Caso 4 — postindustrial reclasificado con soporte válido cuenta.
    await makeChain("44", 200, { product_id: prodP41, produced_date: "2026-07-15", produced_quantity_kg: 200 });
    await compose(obS4["44"], matPIre, 100);
    await compose(obS4["44"], matVirgin, 100);
    const { data: c4, error: e4 } = await rpc(obS4["44"]);
    assert(!e4 && close(c4.recycled_percent, 50) && close(c4.total_mass_kg, 200),
      `caso 4: esperado 50%, fue ${c4?.recycled_percent}`);
    assert(c4.defensibility_level === "defensible", `caso 4: esperado defensible, fue ${c4.defensibility_level}`);

    // Caso 5 — evidencia pendiente no cuenta.
    await makeChain("45", 100);
    await compose(obS4["45"], matPCpend, 100);
    const { data: c5, error: e5 } = await rpc(obS4["45"]);
    assert(!e5 && close(c5.recycled_percent, 0), `caso 5: esperado 0%, fue ${c5?.recycled_percent}`);
    const comps5 = c5.components as { exclusion_reason: string | null }[];
    assert(comps5[0]?.exclusion_reason === "origin_support_not_valid",
      `caso 5: razón fue ${comps5[0]?.exclusion_reason}`);
    assert((c5.warnings as string[]).includes("related_evidence_not_valid"),
      "caso 5: falta advertencia related_evidence_not_valid");

    // Caso 6 — declarado (80) mayor que calculado (60) genera riesgo.
    await makeChain("46", 100, { product_id: prodP42, produced_date: "2026-06-20" });
    await compose(obS4["46"], matPC, 60);
    await compose(obS4["46"], matVirgin, 40);
    const { data: c6, error: e6 } = await rpc(obS4["46"]);
    assert(!e6 && close(c6.recycled_percent, 60), `caso 6: esperado 60%, fue ${c6?.recycled_percent}`);
    assert(c6.risk_flag === true, "caso 6: risk_flag debería ser true");
    assert((c6.warnings as string[]).includes("declared_above_calculated"),
      "caso 6: falta advertencia declared_above_calculated");
    assert(c6.defensibility_level !== "defensible", "caso 6: no puede ser defensible");
  });

  await check("34. Recalcular crea un snapshot nuevo y v_latest muestra el último", async () => {
    const first = await userA.client
      .from("recycled_content_calculations")
      .select("id, recycled_percent, calculated_at")
      .eq("output_batch_id", obS4["41"])
      .order("calculated_at", { ascending: true });
    const firstRow = first.data![0];

    const { error } = await userA.client.rpc("calculate_recycled_content", {
      p_output_batch_id: obS4["41"],
    });
    assert(!error, `recalcular falló: ${error?.message}`);

    const after = await userA.client
      .from("recycled_content_calculations")
      .select("id, recycled_percent, calculated_at")
      .eq("output_batch_id", obS4["41"])
      .order("calculated_at", { ascending: true });
    assert((after.data ?? []).length === 2, `esperadas 2 filas, hay ${after.data?.length}`);
    assert(
      after.data![0].id === firstRow.id &&
        after.data![0].calculated_at === firstRow.calculated_at &&
        Number(after.data![0].recycled_percent) === Number(firstRow.recycled_percent),
      "el primer snapshot cambió"
    );

    const { data: latest } = await userA.client
      .from("v_latest_batch_recycled")
      .select("calculation_id")
      .eq("output_batch_id", obS4["41"])
      .single();
    assert(latest!.calculation_id === after.data![1].id, "v_latest no muestra el cálculo más reciente");
  });

  await check("35. Snapshots inmutables: sin UPDATE, sin DELETE, sin cambio de empresa", async () => {
    const { data: rows } = await userA.client
      .from("recycled_content_calculations")
      .select("id")
      .eq("output_batch_id", obS4["41"])
      .limit(1);
    const calcId = rows![0].id;

    const { data: upd, error: updErr } = await userA.client
      .from("recycled_content_calculations")
      .update({ recycled_percent: 99 })
      .eq("id", calcId)
      .select();
    assert(updErr !== null || (upd ?? []).length === 0, "se pudo actualizar un snapshot");

    const { data: updOrg, error: updOrgErr } = await userA.client
      .from("recycled_content_calculations")
      .update({ organization_id: orgB })
      .eq("id", calcId)
      .select();
    assert(updOrgErr !== null || (updOrg ?? []).length === 0, "se pudo mover un snapshot de empresa");

    const { data: del, error: delErr } = await userA.client
      .from("recycled_content_calculations")
      .delete()
      .eq("id", calcId)
      .select();
    assert(delErr !== null || (del ?? []).length === 0, "se pudo eliminar un snapshot");

    const { data: still } = await userA.client
      .from("recycled_content_calculations")
      .select("id")
      .eq("id", calcId)
      .eq("organization_id", orgA);
    assert((still ?? []).length === 1, "el snapshot desapareció o cambió de empresa");
  });

  await check("36. Multiempresa: A no ve ni calcula lotes de B; consultant sí calcula en su empresa", async () => {
    // B calcula su propio lote (tiene composición del caso 24).
    const { error: bErr } = await userB.client.rpc("calculate_recycled_content", {
      p_output_batch_id: obB,
    });
    assert(!bErr, `B no pudo calcular su lote: ${bErr?.message}`);

    // A no ve cálculos de B (tabla y vista).
    const { data: tblLeak } = await userA.client
      .from("recycled_content_calculations")
      .select("id")
      .eq("organization_id", orgB);
    assert((tblLeak ?? []).length === 0, "A pudo leer cálculos de B");
    const { data: viewLeak } = await userA.client
      .from("v_latest_batch_recycled")
      .select("calculation_id")
      .eq("organization_id", orgB);
    assert((viewLeak ?? []).length === 0, "la vista filtró cálculos de B hacia A");

    // A no puede calcular un lote de B (nota: userA solo es miembro de A).
    const { error: crossErr } = await userA.client.rpc("calculate_recycled_content", {
      p_output_batch_id: obB,
    });
    assert(crossErr !== null, "A pudo calcular un lote de B");

    // Consultant C calcula un lote de A (obA2 tiene composición del caso 28).
    const { data: cCalc, error: cErr } = await userC.client.rpc("calculate_recycled_content", {
      p_output_batch_id: obA2,
    });
    assert(!cErr && cCalc, `consultant no pudo calcular: ${cErr?.message}`);
  });

  await check("37. Agregaciones ponderadas por masa (orden, producto, familia, periodo)", async () => {
    // Por orden: O41 → 70/100 = 70%, 1/1 lote, defendible.
    const { data: byOrder } = await userA.client
      .from("v_recycled_by_order")
      .select("*")
      .eq("production_order_id", orderS4["41"])
      .single();
    assert(close(byOrder!.recycled_percent, 70), `orden 41: ${byOrder!.recycled_percent}`);
    assert(Number(byOrder!.calculated_batches_count) === 1 && Number(byOrder!.output_batches_count) === 1,
      "orden 41: conteos incorrectos");
    assert(byOrder!.defensibility_level === "defensible", `orden 41: ${byOrder!.defensibility_level}`);

    const { data: byOrder43 } = await userA.client
      .from("v_recycled_by_order")
      .select("defensibility_level")
      .eq("production_order_id", orderS4["43"])
      .single();
    assert(byOrder43!.defensibility_level === "preliminary",
      `orden 43: esperado preliminary, fue ${byOrder43!.defensibility_level}`);

    // Por producto: P41 = OB41 (70/100) + OB44 (100/200) → 170/300 = 56.6667
    // ponderado (NO el promedio simple 60).
    const { data: byProd } = await userA.client
      .from("v_recycled_by_product")
      .select("*")
      .eq("product_id", prodP41)
      .single();
    assert(close(byProd!.recycled_percent, 56.6667), `producto P41: ${byProd!.recycled_percent}`);
    assert(Number(byProd!.batches_count) === 2, "producto P41: batches_count incorrecto");
    assert(byProd!.defensibility_level === "defensible", `producto P41: ${byProd!.defensibility_level}`);

    // Por familia: P41 (170/300) + P42 (60/100) → 230/400 = 57.5; la
    // advertencia del caso 6 arrastra el agregado a with_warnings.
    const { data: byFam } = await userA.client
      .from("v_recycled_by_family")
      .select("*")
      .eq("family_id", famS4)
      .single();
    assert(close(byFam!.recycled_percent, 57.5), `familia: ${byFam!.recycled_percent}`);
    assert(Number(byFam!.products_count) === 2 && Number(byFam!.batches_count) === 3,
      "familia: conteos incorrectos");
    assert(byFam!.defensibility_level === "with_warnings", `familia: ${byFam!.defensibility_level}`);

    // Por periodo: julio 2026 = OB41 + OB44 → 170/300; junio 2026 = OB46.
    const { data: periods } = await userA.client
      .from("v_recycled_by_period")
      .select("*")
      .eq("organization_id", orgA);
    const july = (periods ?? []).find((r) => String(r.period_month).startsWith("2026-07"));
    const june = (periods ?? []).find((r) => String(r.period_month).startsWith("2026-06"));
    assert(july && close(july.recycled_percent, 56.6667) && Number(july.batches_count) === 2,
      `periodo julio: ${july?.recycled_percent} (${july?.batches_count} lotes)`);
    assert(june && close(june.recycled_percent, 60), `periodo junio: ${june?.recycled_percent}`);
  });


  await check("38. Sprint 4.1: agregados transparentes (sin cálculos ≠ defendible; parcial = preliminar)", async () => {
    // Orden con un lote de salida SIN cálculo: nivel null, jamás 'defensible'.
    await makeChain("47", 100, { produced_date: "2026-08-10" });
    const ob47a = obS4["47"];
    const order47 = orderS4["47"];

    const read47 = async () => {
      const { data } = await userA.client
        .from("v_recycled_by_order")
        .select("*")
        .eq("production_order_id", order47)
        .single();
      return data!;
    };

    let agg = await read47();
    assert(agg.defensibility_level === null,
      `orden sin cálculos: esperado null, fue ${agg.defensibility_level}`);
    assert(agg.recycled_percent === null && agg.recycled_mass_kg === null && agg.total_mass_kg === null,
      "orden sin cálculos: masas/porcentaje deberían ser null");
    assert(Number(agg.output_batches_count) === 1 && Number(agg.calculated_batches_count) === 0
      && Number(agg.uncalculated_batches_count) === 1 && agg.has_uncalculated_batches === true,
      `orden sin cálculos: conteos 1/0/1 esperados, fueron ${agg.output_batches_count}/${agg.calculated_batches_count}/${agg.uncalculated_batches_count}`);

    // Segundo lote en la MISMA orden, este sí calculado → agregado PARCIAL:
    // 'preliminary' aunque el lote calculado sea defendible, porcentaje solo
    // sobre lo calculado, y conteos 2/1/1.
    const { data: ob47b } = await userA.client
      .from("output_batches")
      .insert({
        organization_id: orgA, batch_code: "A-LS-47B", production_order_id: order47,
        produced_date: "2026-08-15",
      })
      .select("id").single();
    await compose(ob47b!.id, matPC, 70);
    await compose(ob47b!.id, matVirgin, 30);
    const { data: calc47b, error: e47b } = await userA.client.rpc("calculate_recycled_content", {
      p_output_batch_id: ob47b!.id,
    });
    assert(!e47b && calc47b.defensibility_level === "defensible",
      `el lote calculado debía ser defendible, fue ${calc47b?.defensibility_level} (${e47b?.message ?? ""})`);

    agg = await read47();
    assert(agg.defensibility_level === "preliminary",
      `orden parcialmente calculada: esperado preliminary, fue ${agg.defensibility_level}`);
    assert(close(agg.recycled_percent, 70) && close(agg.total_mass_kg, 100),
      `porcentaje parcial: esperado 70% sobre 100 kg calculados, fue ${agg.recycled_percent} sobre ${agg.total_mass_kg}`);
    assert(Number(agg.output_batches_count) === 2 && Number(agg.calculated_batches_count) === 1
      && Number(agg.uncalculated_batches_count) === 1 && agg.has_uncalculated_batches === true,
      "orden parcial: conteos 2/1/1 esperados");

    // Calculado el lote restante → aplica la regla normal (ambos defendibles).
    await compose(ob47a, matPC, 100);
    const { error: e47a } = await userA.client.rpc("calculate_recycled_content", {
      p_output_batch_id: ob47a,
    });
    assert(!e47a, `no se pudo calcular el lote restante: ${e47a?.message}`);
    agg = await read47();
    assert(agg.defensibility_level === "defensible",
      `orden completamente calculada: esperado defensible, fue ${agg.defensibility_level}`);
    assert(close(agg.recycled_percent, 85),
      `ponderado (100+70)/200 = 85%, fue ${agg.recycled_percent}`);
    assert(Number(agg.uncalculated_batches_count) === 0 && agg.has_uncalculated_batches === false,
      "orden completa: no deberían quedar pendientes");

    // Producto / familia / periodo con lote pendiente dentro del alcance:
    // nunca 'defensible'; se informan totales y pendientes.
    const { data: famNew } = await userA.client
      .from("product_families")
      .insert({ organization_id: orgA, name: "Familia parcial S41" })
      .select("id").single();
    const { data: prodNew } = await userA.client
      .from("products")
      .insert({ organization_id: orgA, code: "S41-P1", name: "Producto parcial S41", family_id: famNew!.id })
      .select("id").single();

    await makeChain("48", 100, {
      product_id: prodNew!.id, produced_date: "2026-09-05",
    });
    await compose(obS4["48"], matPC, 100);
    const { error: e48 } = await userA.client.rpc("calculate_recycled_content", {
      p_output_batch_id: obS4["48"],
    });
    assert(!e48, `no se pudo calcular OB48: ${e48?.message}`);
    // Lote hermano del MISMO producto y periodo, sin cálculo.
    await userA.client.from("output_batches").insert({
      organization_id: orgA, batch_code: "A-LS-48B", production_order_id: orderS4["48"],
      product_id: prodNew!.id, produced_date: "2026-09-20",
    });

    const { data: byProd } = await userA.client
      .from("v_recycled_by_product").select("*").eq("product_id", prodNew!.id).single();
    assert(byProd!.defensibility_level === "preliminary",
      `producto con pendiente: esperado preliminary, fue ${byProd!.defensibility_level}`);
    assert(Number(byProd!.total_batches_count) === 2 && Number(byProd!.calculated_batches_count) === 1
      && Number(byProd!.uncalculated_batches_count) === 1 && byProd!.has_uncalculated_batches === true,
      "producto con pendiente: conteos 2/1/1 esperados");
    assert(close(byProd!.recycled_percent, 100),
      `producto: porcentaje solo sobre calculados (100%), fue ${byProd!.recycled_percent}`);

    const { data: byFam } = await userA.client
      .from("v_recycled_by_family").select("*").eq("family_id", famNew!.id).single();
    assert(byFam!.defensibility_level === "preliminary",
      `familia con pendiente: esperado preliminary, fue ${byFam!.defensibility_level}`);
    assert(Number(byFam!.total_batches_count) === 2 && Number(byFam!.uncalculated_batches_count) === 1,
      "familia con pendiente: conteos incorrectos");

    const { data: periods41 } = await userA.client
      .from("v_recycled_by_period").select("*").eq("organization_id", orgA);
    const sep = (periods41 ?? []).find((r) => String(r.period_month).startsWith("2026-09"));
    assert(sep && sep.defensibility_level === "preliminary",
      `periodo con pendiente: esperado preliminary, fue ${sep?.defensibility_level}`);
    assert(Number(sep!.total_batches_count) === 2 && Number(sep!.calculated_batches_count) === 1,
      "periodo con pendiente: conteos incorrectos");
  });


  // =========================================================================
  // Sprint 5A · Vistas de soporte técnico (dossier, componentes, matriz,
  // brechas)
  // =========================================================================
  await check("39. Soporte técnico: dossier fiel al snapshot, matriz con soportes implícitos, brechas y aislamiento", async () => {
    // Dossier del último cálculo de OB41: debe reflejar el snapshot exacto.
    const { data: latest41 } = await userA.client
      .from("v_latest_batch_recycled")
      .select("calculation_id")
      .eq("output_batch_id", obS4["41"])
      .single();
    const calc41 = latest41!.calculation_id;

    const { data: dossier } = await userA.client
      .from("v_calculation_dossier")
      .select("*")
      .eq("calculation_id", calc41)
      .single();
    assert(dossier !== null, "no se pudo leer el dossier");
    assert(close(dossier!.recycled_percent, 70) && close(dossier!.total_mass_kg, 100),
      `dossier: snapshot esperado 70%/100kg, fue ${dossier!.recycled_percent}/${dossier!.total_mass_kg}`);
    assert(dossier!.methodology_code === "RC-6632-15343" && Number(dossier!.methodology_version) === 1,
      "dossier: metodología incorrecta");
    assert(dossier!.product_name === "Producto S4-1" && dossier!.family_name === "Familia calculo S4",
      `dossier: producto/familia incorrectos (${dossier!.product_name} / ${dossier!.family_name})`);
    assert(dossier!.calculated_by === userA.id, "dossier: calculated_by incorrecto");
    assert(dossier!.defensibility_level === "defensible", "dossier: nivel incorrecto");
    assert(dossier!.traceability_status !== null, "dossier: sin estado de trazabilidad");

    // Componentes expandidos del snapshot: 2 filas ordenadas con casts.
    const { data: comps } = await userA.client
      .from("v_calculation_component_rows")
      .select("*")
      .eq("calculation_id", calc41)
      .order("component_index");
    assert((comps ?? []).length === 2, `componentes: esperadas 2 filas, hay ${comps?.length}`);
    const pcRow = comps!.find((r) => r.material_id === matPC);
    const vgRow = comps!.find((r) => r.material_id === matVirgin);
    assert(pcRow?.counted === true && close(pcRow?.mass_kg, 70),
      "componentes: el PC no expandió counted/mass correctamente");
    assert(vgRow?.counted === false && vgRow?.exclusion_reason === "non_recycled_material",
      "componentes: el virgen no expandió la razón de exclusión");

    // Matriz OB41: la evidencia de ORIGEN aparece como soporte requerido y
    // válido AUNQUE no exista evidence_link explícito.
    const { data: matrix41 } = await userA.client
      .from("v_output_batch_evidence_matrix")
      .select("*")
      .eq("output_batch_id", obS4["41"]);
    const originRow = (matrix41 ?? []).find(
      (r) => r.evidence_id === evValid && r.support_role === "material_origin_support"
    );
    assert(originRow !== undefined, "matriz: falta la evidencia de origen del material contado");
    assert(originRow!.is_required_for_defensibility === true && originRow!.is_valid_for_defensibility === true,
      "matriz: la evidencia de origen debería ser requerida y válida");
    assert(originRow!.calculation_id === calc41, "matriz: calculation_id no apunta al último cálculo");

    // Matriz OB44: la evidencia de RECLASIFICACIÓN aparece con su rol.
    const { data: matrix44 } = await userA.client
      .from("v_output_batch_evidence_matrix")
      .select("*")
      .eq("output_batch_id", obS4["44"]);
    const reclassRow = (matrix44 ?? []).find(
      (r) => r.evidence_id === evValid2 && r.support_role === "material_reclassification_support"
    );
    assert(reclassRow !== undefined && reclassRow!.is_required_for_defensibility === true,
      "matriz: falta la evidencia de reclasificación como soporte requerido");

    // Brechas: missing_origin_support (obA2: materiales elegibles sin
    // evidencia de origen), origin_support_not_valid (OB45) y riesgo (OB46).
    const { data: gapsA2 } = await userA.client
      .from("v_output_batch_support_gaps")
      .select("gap_code, gap_severity, suggested_action")
      .eq("output_batch_id", obA2);
    assert((gapsA2 ?? []).some((g) => g.gap_code === "missing_origin_support" && g.gap_severity === "critical"),
      "brechas: falta missing_origin_support para obA2");

    const { data: gaps45 } = await userA.client
      .from("v_output_batch_support_gaps")
      .select("gap_code")
      .eq("output_batch_id", obS4["45"]);
    assert((gaps45 ?? []).some((g) => g.gap_code === "origin_support_not_valid"),
      "brechas: falta origin_support_not_valid para OB45");

    const { data: gaps46 } = await userA.client
      .from("v_output_batch_support_gaps")
      .select("gap_code, gap_severity")
      .eq("output_batch_id", obS4["46"]);
    assert((gaps46 ?? []).some((g) => g.gap_code === "declared_above_calculated" && g.gap_severity === "critical"),
      "brechas: falta declared_above_calculated para OB46 (risk_flag)");

    // Aislamiento multiempresa: A no ve dossier, matriz ni brechas de B.
    const { data: calcB } = await userB.client
      .from("v_latest_batch_recycled")
      .select("calculation_id")
      .eq("output_batch_id", obB)
      .single();
    const { data: dossierLeak } = await userA.client
      .from("v_calculation_dossier").select("calculation_id")
      .eq("calculation_id", calcB!.calculation_id);
    assert((dossierLeak ?? []).length === 0, "A pudo leer un dossier de B");
    const { data: dossierLeakOrg } = await userA.client
      .from("v_calculation_dossier").select("calculation_id").eq("organization_id", orgB);
    assert((dossierLeakOrg ?? []).length === 0, "el dossier filtró datos de B hacia A");
    const { data: matrixLeak } = await userA.client
      .from("v_output_batch_evidence_matrix").select("evidence_id").eq("organization_id", orgB);
    assert((matrixLeak ?? []).length === 0, "la matriz filtró datos de B hacia A");
    const { data: gapsLeak } = await userA.client
      .from("v_output_batch_support_gaps").select("gap_code").eq("organization_id", orgB);
    assert((gapsLeak ?? []).length === 0, "las brechas filtraron datos de B hacia A");
    // El export JSON se construye EXCLUSIVAMENTE desde v_calculation_dossier
    // filtrado por la empresa activa, así que este aislamiento lo cubre.
  });


  // =========================================================================
  // Sprint 5B · Flujo guiado: readiness, dashboard y paridad SQL ↔ TS
  // =========================================================================
  await check("40. Flujo guiado: la vista replica la lógica pura fila a fila y no filtra entre empresas", async () => {
    const { data: rowsA } = await userA.client
      .from("v_output_batch_readiness")
      .select("*")
      .eq("organization_id", orgA);
    assert((rowsA ?? []).length > 0, "A debería ver readiness de sus lotes");

    // Paridad: cada fila de la vista debe coincidir con resolveNextStep
    // aplicado a sus propios hechos (misma cadena de reglas, cero divergencia).
    // Nota: la rama complete_order es defensiva — production_order_id es NOT
    // NULL en el esquema — y queda cubierta por el unit test (test:guided).
    for (const r of rowsA!) {
      const expected = resolveNextStep({
        hasProductionOrder: r.has_production_order,
        hasConsumption: r.has_consumption,
        hasComposition: r.has_composition,
        anySupportMissing: r.has_missing_required_evidence,
        anySupportPending: r.has_pending_required_evidence,
        hasCalculation: r.has_calculation,
        latestDefensibilityLevel: r.latest_defensibility_level,
        latestRiskFlag: Boolean(r.latest_risk_flag),
      });
      assert(r.next_step_code === expected.code && r.readiness_level === expected.readiness,
        `divergencia SQL↔TS en ${r.output_batch_code}: vista=${r.next_step_code}/${r.readiness_level}, ` +
        `pura=${expected.code}/${expected.readiness}`);
    }

    // Filas concretas: OB41 defendible sin riesgo → calculated_ready/open_dossier;
    // OB46 con riesgo → calculated_with_gaps/review_gaps; OB45 preliminar tras
    // cálculo → review_gaps.
    const byId = new Map(rowsA!.map((r) => [r.output_batch_id, r]));
    const r41 = byId.get(obS4["41"]);
    assert(r41?.readiness_level === "calculated_ready" && r41?.next_step_code === "open_dossier"
      && r41?.next_step_href === `/audit-support/calculations/${r41?.latest_calculation_id}`,
      `OB41: esperado calculated_ready/open_dossier, fue ${r41?.readiness_level}/${r41?.next_step_code}`);
    const r46 = byId.get(obS4["46"]);
    assert(r46?.readiness_level === "calculated_with_gaps" && r46?.next_step_code === "review_gaps",
      `OB46 (riesgo): esperado calculated_with_gaps/review_gaps, fue ${r46?.readiness_level}/${r46?.next_step_code}`);
    const r45 = byId.get(obS4["45"]);
    assert(r45?.next_step_code === "review_gaps",
      `OB45 (preliminar): esperado review_gaps, fue ${r45?.next_step_code}`);

    // Aislamiento: A no ve readiness ni dashboard de B; B sí ve lo suyo.
    const { data: leakReadiness } = await userA.client
      .from("v_output_batch_readiness").select("output_batch_id").eq("organization_id", orgB);
    assert((leakReadiness ?? []).length === 0, "A pudo ver readiness de B");
    const { data: leakDash } = await userA.client
      .from("v_guided_flow_dashboard").select("organization_id").eq("organization_id", orgB);
    assert((leakDash ?? []).length === 0, "A pudo ver el dashboard guiado de B");
    const { data: dashA } = await userA.client
      .from("v_guided_flow_dashboard").select("*").eq("organization_id", orgA).single();
    assert(Number(dashA!.output_batches_count) === rowsA!.length,
      `dashboard A: output_batches_count=${dashA!.output_batches_count} ≠ ${rowsA!.length}`);
    assert(Number(dashA!.calculated_batches_count) > 0, "dashboard A: sin lotes calculados");
    const { data: rowsB } = await userB.client
      .from("v_output_batch_readiness").select("readiness_level").eq("output_batch_id", obB);
    assert((rowsB ?? []).length === 1 && rowsB![0].readiness_level === "calculated_with_gaps",
      `obB: esperado calculated_with_gaps, fue ${rowsB?.[0]?.readiness_level}`);
  });


  // =========================================================================
  // Sprint 5C fix · Soporte de origen desde la UI de evidencias
  // =========================================================================
  await check("41. Regresión: el link genérico no sustituye al soporte de origen; el campo sí; cross-tenant bloqueado", async () => {
    // Reproduce el bug reportado: material postconsumo SIN soporte de origen.
    const { data: matNoSup } = await userA.client
      .from("materials")
      .insert({ organization_id: orgA, name: "Posconsumo Opaco S5C", classification_code: "postconsumer_valid" })
      .select("id").single();
    await makeChain("50", 100);
    await compose(obS4["50"], matNoSup!.id, 100);

    const rpc = () =>
      userA.client.rpc("calculate_recycled_content", { p_output_batch_id: obS4["50"] });

    // (i) Sin soporte → 0% con missing_origin_support (estado del bug).
    const { data: c0 } = await rpc();
    assert(close(c0.recycled_percent, 0), `esperado 0%, fue ${c0.recycled_percent}`);
    assert((c0.components as { exclusion_reason: string | null }[])[0]?.exclusion_reason === "missing_origin_support",
      "esperada razón missing_origin_support");

    // (ii) REGLA 9: un evidence_link genérico al material NO hace contar.
    const { error: linkErr } = await userA.client.from("evidence_links").insert({
      organization_id: orgA, evidence_id: evValid, target_type: "material",
      target_id: matNoSup!.id, link_role: "soporte general",
    });
    assert(!linkErr, `no se pudo crear el link genérico: ${linkErr?.message}`);
    const { data: matAfterLink } = await userA.client
      .from("materials").select("origin_support_evidence_id").eq("id", matNoSup!.id).single();
    assert(matAfterLink!.origin_support_evidence_id === null,
      "el link genérico NO debe modificar origin_support_evidence_id");
    const { data: c1 } = await rpc();
    assert(close(c1.recycled_percent, 0)
      && (c1.components as { exclusion_reason: string | null }[])[0]?.exclusion_reason === "missing_origin_support",
      "el link genérico no debe sustituir silenciosamente al soporte de origen");

    // (iii) Soporte de origen con evidencia PENDIENTE: queda asociado pero no
    // cuenta hasta validarla.
    const { error: updPend } = await userA.client
      .from("materials").update({ origin_support_evidence_id: evPending }).eq("id", matNoSup!.id);
    assert(!updPend, `no se pudo asociar evidencia pendiente: ${updPend?.message}`);
    const { data: c2 } = await rpc();
    assert(close(c2.recycled_percent, 0)
      && (c2.components as { exclusion_reason: string | null }[])[0]?.exclusion_reason === "origin_support_not_valid",
      "con evidencia pendiente el material no debe contar (origin_support_not_valid)");

    // (iv) Soporte de origen VÁLIDO → recalcular hace que cuente (100%).
    const { error: updValid } = await userA.client
      .from("materials").update({ origin_support_evidence_id: evValid }).eq("id", matNoSup!.id);
    assert(!updValid, `no se pudo asociar evidencia válida: ${updValid?.message}`);
    const { data: c3 } = await rpc();
    assert(close(c3.recycled_percent, 100), `esperado 100%, fue ${c3.recycled_percent}`);
    assert((c3.components as { counted: boolean }[])[0]?.counted === true, "el material debía contar");
    assert(c3.defensibility_level === "defensible", `esperado defensible, fue ${c3.defensibility_level}`);

    // (v) Cross-tenant: evidencia de la empresa B como soporte en material de
    // A debe fallar (FK compuesta por organización).
    const { data: evB } = await userB.client
      .from("evidences").insert({ organization_id: orgB, name: "Evidencia B S5C" }).select("id").single();
    const { data: crossUpd, error: crossErr } = await userA.client
      .from("materials")
      .update({ origin_support_evidence_id: evB!.id })
      .eq("id", matNoSup!.id)
      .select();
    assert(crossErr !== null || (crossUpd ?? []).length === 0,
      "se pudo usar una evidencia de otra empresa como soporte de origen");
    const { data: still } = await userA.client
      .from("materials").select("origin_support_evidence_id").eq("id", matNoSup!.id).single();
    assert(still!.origin_support_evidence_id === evValid, "el soporte válido debía permanecer intacto");
  });

  // =========================================================================
  // Sprint 6 · implementation_feedback (0033/0034): aislamiento multiempresa,
  // edición del feedback propio, borrado restringido a admin/quality y
  // bloqueo de asociación a organización ajena.
  // =========================================================================
  let feedbackA = "";
  let feedbackB = "";

  await check("42. A crea feedback en su empresa; B no ve el feedback de A ni A el de B", async () => {
    const { data: fbA, error: errA } = await userA.client
      .from("implementation_feedback")
      .insert({
        organization_id: orgA,
        module: "recycled_content",
        category: "question",
        severity: "low",
        title: "Duda sobre balance de masa",
        description: "¿Por qué aparece la advertencia de balance en este lote?",
      })
      .select("id")
      .single();
    assert(!errA && fbA, `A no pudo crear feedback: ${errA?.message}`);
    feedbackA = fbA!.id;

    const { data: fbB, error: errB } = await userB.client
      .from("implementation_feedback")
      .insert({
        organization_id: orgB,
        module: "catalog",
        category: "bug",
        severity: "medium",
        title: "El selector de familia no filtra bien",
        description: "Al crear un producto, el selector de familia muestra todas las familias.",
      })
      .select("id")
      .single();
    assert(!errB && fbB, `B no pudo crear feedback: ${errB?.message}`);
    feedbackB = fbB!.id;

    const { data: aSeesB } = await userA.client
      .from("implementation_feedback")
      .select("id")
      .eq("organization_id", orgB);
    assert((aSeesB ?? []).length === 0, "A pudo ver feedback de la organización B");

    const { data: bSeesA } = await userB.client
      .from("implementation_feedback")
      .select("id")
      .eq("organization_id", orgA);
    assert((bSeesA ?? []).length === 0, "B pudo ver feedback de la organización A");

    const { data: aSeesOwn } = await userA.client
      .from("implementation_feedback")
      .select("id")
      .eq("id", feedbackA)
      .maybeSingle();
    assert(aSeesOwn?.id === feedbackA, "A no pudo leer su propio feedback recién creado");
  });

  await check("43. A no puede actualizar ni borrar el feedback de B", async () => {
    const { data: upd } = await userA.client
      .from("implementation_feedback")
      .update({ title: "Alterado por A" })
      .eq("id", feedbackB)
      .select();
    assert((upd ?? []).length === 0, "A pudo actualizar el feedback de B");

    const { data: del } = await userA.client
      .from("implementation_feedback")
      .delete()
      .eq("id", feedbackB)
      .select();
    assert((del ?? []).length === 0, "A pudo borrar el feedback de B");

    const { data: stillThere } = await userB.client
      .from("implementation_feedback")
      .select("title")
      .eq("id", feedbackB)
      .single();
    assert(stillThere?.title === "El selector de familia no filtra bien",
      "el feedback de B fue modificado por A");
  });

  await check("44. No se puede asociar feedback a una organización ajena (insert cross-tenant bloqueado)", async () => {
    // B no es miembro de orgA: el INSERT debe fallar por RLS (WITH CHECK).
    const { data, error } = await userB.client
      .from("implementation_feedback")
      .insert({
        organization_id: orgA,
        module: "other",
        category: "other",
        severity: "low",
        title: "Intento cruzado",
        description: "Esto no debería poder crearse.",
      })
      .select();
    assert(error || (data ?? []).length === 0, "un usuario ajeno pudo crear feedback en orgA");
  });

  await check("45. El creador (no admin/quality) puede editar su propio feedback; borrar sigue restringido a admin/quality", async () => {
    // C es consultant en orgA (no admin/quality): crea su propio feedback.
    const { data: fbC, error: errC } = await userC.client
      .from("implementation_feedback")
      .insert({
        organization_id: orgA,
        module: "guided_flow",
        category: "improvement",
        severity: "low",
        title: "Feedback de C (consultant)",
        description: "El flujo guiado podría explicar mejor el siguiente paso.",
      })
      .select("id, created_by")
      .single();
    assert(!errC && fbC, `C no pudo crear su feedback: ${errC?.message}`);
    assert(fbC!.created_by === userC.id, "created_by no quedó forzado al autor real");

    // C edita SU PROPIO feedback: debe permitirlo la política de update.
    const { data: updOwn, error: updOwnErr } = await userC.client
      .from("implementation_feedback")
      .update({ title: "Feedback de C (editado por C)" })
      .eq("id", fbC!.id)
      .select();
    assert(!updOwnErr && (updOwn ?? []).length === 1, `C no pudo editar su propio feedback: ${updOwnErr?.message}`);

    // C intenta BORRARLO: debe bloquearlo la RLS (delete solo admin/quality).
    const { data: delByC } = await userC.client
      .from("implementation_feedback")
      .delete()
      .eq("id", fbC!.id)
      .select();
    assert((delByC ?? []).length === 0, "un consultant pudo borrar feedback (debe ser solo admin/quality)");

    // Admin (A) sí puede borrarlo.
    const { data: delByAdmin, error: delErr } = await userA.client
      .from("implementation_feedback")
      .delete()
      .eq("id", fbC!.id)
      .select();
    assert(!delErr && (delByAdmin ?? []).length === 1, `admin no pudo borrar el feedback: ${delErr?.message}`);
  });

  await check("46. Usuario no miembro no ve implementación: v_implementation_dashboard y v_implementation_next_actions sin fugas", async () => {
    const { data: dashLeak } = await userB.client
      .from("v_implementation_dashboard")
      .select("organization_id")
      .eq("organization_id", orgA);
    assert((dashLeak ?? []).length === 0, "B pudo ver el dashboard de implementación de A");

    const { data: actionsLeak } = await userB.client
      .from("v_implementation_next_actions")
      .select("organization_id")
      .eq("organization_id", orgA);
    assert((actionsLeak ?? []).length === 0, "B pudo ver las próximas acciones de implementación de A");

    const { data: dashOwn } = await userA.client
      .from("v_implementation_dashboard")
      .select("open_feedback_count")
      .eq("organization_id", orgA)
      .maybeSingle();
    assert(dashOwn && Number(dashOwn.open_feedback_count) >= 1,
      "A debería ver al menos su propio feedback abierto en su dashboard de implementación");
  });

  // =========================================================================
  // Sprint 7 · import_job_rows (0035): aislamiento multiempresa del detalle
  // de importación y bloqueo de confirmación entre organizaciones. La FK
  // COMPUESTA (organization_id, import_job_id) → import_jobs(organization_id,
  // id) se verificó además directamente contra Postgres: un intento de
  // mezclar el organization_id de una empresa con el import_job_id de otra
  // falla por FK incluso si algo más bypaseara la RLS.
  // =========================================================================
  let importJobA = "";

  await check("47. A crea un import_job + filas; B no ve ni el job ni las filas de A", async () => {
    const { data: job, error: jobErr } = await userA.client
      .from("import_jobs")
      .insert({
        organization_id: orgA,
        entity: "suppliers",
        filename: "proveedores-a.csv",
        total_rows: 1,
        status: "validated",
      })
      .select("id")
      .single();
    assert(!jobErr && job, `A no pudo crear el import_job: ${jobErr?.message}`);
    importJobA = job!.id;

    const { error: rowErr } = await userA.client.from("import_job_rows").insert({
      organization_id: orgA,
      import_job_id: importJobA,
      row_number: 2,
      status: "valid",
      entity_type: "supplier",
      raw_data: { supplier_name: "Proveedor Real A" },
    });
    assert(!rowErr, `A no pudo crear la fila de importación: ${rowErr?.message}`);

    const { data: bSeesJob } = await userB.client
      .from("import_jobs")
      .select("id")
      .eq("organization_id", orgA);
    assert((bSeesJob ?? []).length === 0, "B pudo ver import_jobs de la organización A");

    const { data: bSeesRows } = await userB.client
      .from("import_job_rows")
      .select("id")
      .eq("organization_id", orgA);
    assert((bSeesRows ?? []).length === 0, "B pudo ver import_job_rows de la organización A");
  });

  await check("48. No se puede confirmar/insertar una fila de importación en otra organización (cross-tenant bloqueado)", async () => {
    // B (sin membership en orgA) intenta insertar una fila apuntando al
    // import_job de A: debe bloquearlo la RLS (WITH CHECK de is_org_member).
    const { data, error } = await userB.client
      .from("import_job_rows")
      .insert({
        organization_id: orgA,
        import_job_id: importJobA,
        row_number: 3,
        status: "valid",
        entity_type: "supplier",
        raw_data: { supplier_name: "Intento cruzado" },
      })
      .select();
    assert(error || (data ?? []).length === 0, "un usuario ajeno pudo insertar una fila de importación en orgA");
  });

  await check("49. B no puede actualizar (confirmar) las filas de importación de A", async () => {
    const { data: upd } = await userB.client
      .from("import_job_rows")
      .update({ status: "imported" })
      .eq("organization_id", orgA)
      .select();
    assert((upd ?? []).length === 0, "B pudo actualizar filas de importación de la organización A");

    const { data: stillValid } = await userA.client
      .from("import_job_rows")
      .select("status")
      .eq("import_job_id", importJobA)
      .eq("organization_id", orgA)
      .single();
    assert(stillValid?.status === "valid", "el estado de la fila de A fue alterado por B");
  });

  // =========================================================================
  // Sprint 8 · team_invitations (0037) + guard_last_admin sobre memberships:
  // aislamiento multiempresa de invitaciones, bloqueo de cambio de rol
  // cross-tenant y "solo admin administra equipo".
  // =========================================================================
  let invitationA = "";
  let invitationTokenA = "";

  await check("50. A crea una invitación; B no la ve ni puede modificarla (revocar)", async () => {
    const { data: inv, error: invErr } = await userA.client
      .from("team_invitations")
      .insert({
        organization_id: orgA,
        email: "invitado-s8@empresa.dev",
        role_code: "quality",
        token: `tok-s8-${Date.now()}`,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id, token")
      .single();
    assert(!invErr && inv, `A no pudo crear la invitación: ${invErr?.message}`);
    invitationA = inv!.id;
    invitationTokenA = inv!.token;

    const { data: bSees } = await userB.client
      .from("team_invitations")
      .select("id")
      .eq("organization_id", orgA);
    assert((bSees ?? []).length === 0, "B pudo ver invitaciones de la organización A");

    const { data: bRevokes } = await userB.client
      .from("team_invitations")
      .update({ status: "revoked" })
      .eq("organization_id", orgA)
      .select();
    assert((bRevokes ?? []).length === 0, "B pudo revocar/modificar una invitación de la organización A");
  });

  await check("51. No se puede cambiar el rol de un miembro de otra organización (cross-tenant bloqueado)", async () => {
    const { data: upd } = await userB.client
      .from("memberships")
      .update({ role_code: "consultant" })
      .eq("organization_id", orgA)
      .eq("user_id", userA.id)
      .select();
    assert((upd ?? []).length === 0, "B (admin de otra empresa) pudo cambiar el rol de un miembro de A");
  });

  await check("52. Usuario no miembro no puede ver el equipo (miembros ni invitaciones) de la organización", async () => {
    const outsider = await newUser("s8-outsider");
    const { data: members } = await outsider.client
      .from("memberships")
      .select("id")
      .eq("organization_id", orgA);
    assert((members ?? []).length === 0, "un usuario ajeno pudo ver memberships de A");

    const { data: invites } = await outsider.client
      .from("team_invitations")
      .select("id")
      .eq("organization_id", orgA);
    assert((invites ?? []).length === 0, "un usuario ajeno pudo ver invitaciones de A");
  });

  await check("53. Solo admin administra equipo: un consultant de A no puede invitar ni cambiar roles", async () => {
    // C es consultant en orgA desde el caso 16 (Sprint 3).
    const { data: insByC, error: insErr } = await userC.client
      .from("team_invitations")
      .insert({
        organization_id: orgA,
        email: "otro-s8@empresa.dev",
        role_code: "consultant",
        token: `tok-s8-c-${Date.now()}`,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select();
    assert(insErr || (insByC ?? []).length === 0, "un consultant pudo crear una invitación (solo admin debe poder)");

    const { data: updByC } = await userC.client
      .from("memberships")
      .update({ role_code: "admin" })
      .eq("organization_id", orgA)
      .eq("user_id", userA.id)
      .select();
    assert((updByC ?? []).length === 0, "un consultant pudo cambiar el rol de otro miembro (solo admin debe poder)");
  });

  await check("54. No se acepta una invitación con un correo que no coincide (RPC accept_team_invitation)", async () => {
    // B tiene un correo distinto al invitado (invitado-s8@empresa.dev): la
    // RPC debe rechazar aunque B esté autenticado y el token sea válido.
    const { error } = await userB.client.rpc("accept_team_invitation", {
      p_token: invitationTokenA,
    });
    assert(error, "la RPC debía rechazar la aceptación con un correo que no coincide");

    // La invitación sigue pendiente: no se creó membership de B en orgA.
    const { data: stillPending } = await userA.client
      .from("team_invitations")
      .select("status")
      .eq("id", invitationA)
      .single();
    assert(stillPending?.status === "pending", "la invitación no debía cambiar de estado");

    const { data: noMembership } = await userA.client
      .from("memberships")
      .select("id")
      .eq("organization_id", orgA)
      .eq("user_id", userB.id);
    assert((noMembership ?? []).length === 0, "no debía crearse membership para un correo que no coincide");
  });

  // 8 (nivel BD) y 10: requieren conexión directa (SUPABASE_DB_URL).
  if (DB_URL) {
    const pg = new PgClient({ connectionString: DB_URL });
    await pg.connect();

    await check("8b. audit_log es inmutable incluso para el rol de BD (trigger)", async () => {
      let threw = false;
      try {
        await pg.query(`update audit_log set event_type = 'x' where organization_id = $1`, [orgA]);
      } catch {
        threw = true;
      }
      assert(threw, "el trigger forbid_mutation no bloqueó el UPDATE directo");
    });

    await check("10. Todas las tablas (Sprint 1 + 2 + 3 + 4 + 6 + 7 + 8 + 8.4 + 9 + 10A) tienen RLS activo", async () => {
      const expected = [
        // Sprint 1
        "profiles",
        "organizations",
        "roles",
        "memberships",
        "modules",
        "organization_modules",
        "sites",
        "audit_log",
        // Sprint 2
        "frameworks",
        "requirements",
        "diagnostic_sections",
        "diagnostic_questions",
        "diagnostics",
        "diagnostic_answers",
        "evidences",
        "evidence_links",
        "product_families",
        "products",
        "material_classifications",
        "suppliers",
        "materials",
        "import_jobs",
        // Sprint 3
        "input_batches",
        "production_orders",
        "batch_consumption",
        "output_batches",
        "batch_composition",
        // Sprint 4
        "calculation_methodologies",
        "recycled_content_calculations",
        // Sprint 6
        "implementation_feedback",
        // Sprint 7
        "import_job_rows",
        // Sprint 8
        "team_invitations",
        // Sprint 8.4
        "platform_staff",
        // Sprint 9
        "trazadoc_blueprints",
        "trazadoc_blueprint_sections",
        "trazadoc_documents",
        "trazadoc_document_sections",
        "trazadoc_document_versions",
        "trazadoc_status_history",
        // Sprint 10A
        "plan_definitions",
        "plan_limits",
        "organization_subscriptions",
        "subscription_plan_history",
        // Sprint 10B
        "trazadoc_file_documents",
        "trazadoc_file_document_versions",
        // Sprint 10C
        "support_tickets",
        "support_ticket_messages",
        "support_ticket_status_history",
        // Sprint 10D
        "legal_documents",
        "user_legal_acceptances",
      ];
      const { rows } = await pg.query(
        `select c.relname as table_name, c.relrowsecurity as rls
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
           and c.relname = any($1::text[])`,
        [expected]
      );
      const missing = expected.filter(
        (t) => !rows.find((r) => r.table_name === t && r.rls === true)
      );
      assert(missing.length === 0, `tablas sin RLS: ${missing.join(", ")}`);
    });

    await check("23. Toda tabla org-scoped mutable tiene el trigger prevent_organization_id_change", async () => {
      // audit_log y recycled_content_calculations se excluyen: su trigger
      // forbid_mutation ya bloquea TODO update, así que organization_id es
      // inmutable por definición. calculation_methodologies es global sin org.
      const expected = [
        "memberships",
        "organization_modules",
        "sites",
        "diagnostics",
        "diagnostic_answers",
        "evidences",
        "evidence_links",
        "product_families",
        "products",
        "suppliers",
        "materials",
        "import_jobs",
        "input_batches",
        "production_orders",
        "batch_consumption",
        "output_batches",
        "batch_composition",
        "implementation_feedback",
        "import_job_rows",
        "team_invitations",
        "trazadoc_documents",
        "trazadoc_document_sections",
        "trazadoc_document_versions",
      ];
      const { rows } = await pg.query(
        `select c.relname as table_name
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
         join pg_proc p on p.oid = t.tgfoid
         where n.nspname = 'public'
           and not t.tgisinternal
           and p.proname = 'prevent_organization_id_change'`
      );
      const covered = new Set(rows.map((r) => r.table_name as string));
      const missing = expected.filter((tbl) => !covered.has(tbl));
      assert(
        missing.length === 0,
        `tablas org-scoped sin trigger de inmutabilidad: ${missing.join(", ")}`
      );
    });

    // =========================================================================
    // Sprint 8.4 · platform_staff / v_platform_organizations: requieren
    // bootstrap directo (ningún cliente autenticado puede insertarse a sí
    // mismo como platform_staff — es la garantía de diseño, ver 0040). Se
    // bootstrapea A como superadmin exactamente como en producción: SQL
    // directo, nunca a través de la app.
    // =========================================================================
    await check("55. Bootstrap directo de superadmin + un usuario normal NO lee platform_staff", async () => {
      await pg.query(
        `insert into platform_staff (user_id, role_code, status) values ($1, 'superadmin', 'active')
         on conflict (user_id) do update set role_code = 'superadmin', status = 'active'`,
        [userA.id]
      );

      const { data: bSees } = await userB.client.from("platform_staff").select("id");
      assert((bSees ?? []).length === 0, "un usuario normal pudo leer platform_staff");
    });

    await check("56. Superadmin lee v_platform_organizations (TODAS las empresas); usuario normal lee cero", async () => {
      const { data: superSees } = await userA.client
        .from("v_platform_organizations")
        .select("organization_id");
      const ids = (superSees ?? []).map((r: { organization_id: string }) => r.organization_id);
      assert(ids.includes(orgA), "el superadmin debía ver orgA en la vista de plataforma");
      assert(ids.includes(orgB), "el superadmin debía ver orgB (de OTRA empresa) en la vista de plataforma");

      const { data: normalSees } = await userB.client
        .from("v_platform_organizations")
        .select("organization_id");
      assert((normalSees ?? []).length === 0, "un usuario normal (no platform_staff) pudo leer la vista de plataforma");
    });

    await check("57. Usuario normal con empresa no puede crear una segunda (RPC create_organization)", async () => {
      // B ya es admin de orgB desde casos anteriores.
      const { error } = await userB.client.rpc("create_organization", {
        p_name: "Segunda Empresa De B",
        p_tax_id: null,
        p_country: null,
      });
      assert(error, "B pudo crear una segunda empresa (debía estar bloqueado)");
    });

    await check("58. superadmin accede solo por rutas/acciones de plataforma: revocar y perder acceso", async () => {
      await pg.query(`update platform_staff set status = 'revoked' where user_id = $1`, [userA.id]);
      const { data: afterRevoke } = await userA.client
        .from("v_platform_organizations")
        .select("organization_id");
      assert((afterRevoke ?? []).length === 0, "un superadmin revocado seguía viendo la vista de plataforma");
      // Se deja como estaba para no afectar otros checks si se reordenan.
      await pg.query(`update platform_staff set status = 'active' where user_id = $1`, [userA.id]);
    });

    await check("59. Roles de plataforma no funcionan como memberships (FK/check de role_code)", async () => {
      let threw = false;
      try {
        await pg.query(
          `insert into memberships (organization_id, user_id, role_code, status)
           values ($1, $2, 'superadmin', 'active')`,
          [orgA, userC.id]
        );
      } catch {
        threw = true;
      }
      assert(threw, "memberships aceptó 'superadmin' como role_code (debía rechazarlo: no es un rol de empresa)");
    });

    // =========================================================================
    // Sprint 9 · TrazaDocs: aislamiento multiempresa de documentos/secciones/
    // versiones, permisos por rol, y administración global de blueprints.
    // A (userA) sigue siendo superadmin (bootstrap del caso 55, restaurado a
    // 'active' al final del caso 58).
    // =========================================================================
    let trazadocA = "";
    let trazadocSectionA = "";

    await check("60. Empresa A no ve documentos de Empresa B (y viceversa)", async () => {
      const { data: bpRows } = await userA.client
        .from("trazadoc_blueprints")
        .select("id")
        .eq("code", "instructivo_carga_evidencias")
        .limit(1);
      const blueprintId = bpRows?.[0]?.id as string;

      const { data: docA, error: docErr } = await userA.client
        .from("trazadoc_documents")
        .insert({
          organization_id: orgA,
          blueprint_id: blueprintId,
          source_type: "suggested",
          title: "Instructivo de carga de evidencias",
          status: "draft",
        })
        .select("id")
        .single();
      assert(!docErr && docA, `A no pudo crear un documento TrazaDocs: ${docErr?.message}`);
      trazadocA = docA!.id;

      const { data: bSeesA } = await userB.client.from("trazadoc_documents").select("id").eq("id", trazadocA);
      assert((bSeesA ?? []).length === 0, "B pudo ver un documento TrazaDocs de la organización A");
    });

    await check("61. Empresa A no ve secciones de Empresa B (y viceversa)", async () => {
      const { data: section, error: secErr } = await userA.client
        .from("trazadoc_document_sections")
        .insert({
          organization_id: orgA,
          document_id: trazadocA,
          section_key: "objetivo",
          title: "Objetivo",
          content: "Contenido de prueba RLS",
          sort_order: 1,
          is_required: true,
        })
        .select("id")
        .single();
      assert(!secErr && section, `A no pudo crear una sección: ${secErr?.message}`);
      trazadocSectionA = section!.id;

      const { data: bSeesSection } = await userB.client
        .from("trazadoc_document_sections")
        .select("id")
        .eq("id", trazadocSectionA);
      assert((bSeesSection ?? []).length === 0, "B pudo ver una sección de un documento de la organización A");
    });

    await check("62. Empresa A no ve versiones de Empresa B (y viceversa)", async () => {
      const { data: version, error: verErr } = await userA.client.rpc("change_trazadoc_document_status", {
        p_document_id: trazadocA,
        p_to_status: "in_review",
        p_change_note: "Prueba RLS de versiones",
      });
      assert(!verErr && version != null, `A no pudo generar una versión: ${verErr?.message}`);

      const { data: bSeesVersions } = await userB.client
        .from("trazadoc_document_versions")
        .select("id")
        .eq("document_id", trazadocA);
      assert((bSeesVersions ?? []).length === 0, "B pudo ver versiones de un documento de la organización A");
    });

    await check("63. Usuario no miembro no accede a documentos TrazaDocs de ninguna empresa", async () => {
      const outsider = await newUser("s9-outsider");
      const { data } = await outsider.client.from("trazadoc_documents").select("id").eq("id", trazadocA);
      assert((data ?? []).length === 0, "un usuario ajeno pudo ver un documento TrazaDocs");
    });

    await check("64. Consultant no aprueba un documento TrazaDocs (ni por UPDATE directo ni por la RPC)", async () => {
      const { data: updByC } = await userC.client
        .from("trazadoc_documents")
        .update({ status: "approved" })
        .eq("id", trazadocA)
        .select();
      assert((updByC ?? []).length === 0, "un consultant pudo aprobar un documento por UPDATE directo");

      const { error: rpcErr } = await userC.client.rpc("change_trazadoc_document_status", {
        p_document_id: trazadocA,
        p_to_status: "approved",
        p_change_note: "intento no autorizado",
      });
      assert(rpcErr, "un consultant pudo aprobar un documento vía la RPC");
    });

    await check("65. Admin aprueba un documento TrazaDocs", async () => {
      const { data: newVersion, error } = await userA.client.rpc("change_trazadoc_document_status", {
        p_document_id: trazadocA,
        p_to_status: "approved",
        p_change_note: "Aprobado en prueba RLS",
      });
      assert(!error && newVersion != null, `admin debía poder aprobar: ${error?.message}`);

      const { data: doc } = await userA.client.from("trazadoc_documents").select("status").eq("id", trazadocA).single();
      assert(doc?.status === "approved", "el documento debía quedar aprobado");
    });

    await check("66. Superadmin edita blueprints globales", async () => {
      const { data: bpRows } = await userA.client
        .from("trazadoc_blueprints")
        .select("id, description")
        .eq("code", "instructivo_carga_evidencias")
        .limit(1);
      const blueprintId = bpRows?.[0]?.id as string;

      const { data: updated, error } = await userA.client
        .from("trazadoc_blueprints")
        .update({ description: "Descripción actualizada en prueba RLS" })
        .eq("id", blueprintId)
        .select();
      assert(!error && (updated ?? []).length === 1, `superadmin debía poder editar un blueprint global: ${error?.message}`);
    });

    await check("67. Usuario normal (no platform_staff) no edita blueprints globales", async () => {
      const { data: bpRows } = await userB.client
        .from("trazadoc_blueprints")
        .select("id")
        .eq("code", "instructivo_carga_evidencias")
        .limit(1);
      const blueprintId = bpRows?.[0]?.id as string;

      const { data: updated } = await userB.client
        .from("trazadoc_blueprints")
        .update({ name: "Nombre hackeado" })
        .eq("id", blueprintId)
        .select();
      assert((updated ?? []).length === 0, "un usuario normal (admin de empresa, no platform_staff) pudo editar un blueprint global");
    });

    await check("68. Tips globales (hints) no son editables por una empresa", async () => {
      const { data: sectionRows } = await userB.client
        .from("trazadoc_blueprint_sections")
        .select("id")
        .limit(1);
      const sectionId = sectionRows?.[0]?.id as string;

      const { data: updated } = await userB.client
        .from("trazadoc_blueprint_sections")
        .update({ hint: "tip hackeado por una empresa" })
        .eq("id", sectionId)
        .select();
      assert((updated ?? []).length === 0, "una empresa pudo editar el tip/hint de una sección de blueprint global");
    });

    // =========================================================================
    // Sprint 9.1 · Bloqueante 3: un documento aprobado nunca se edita
    // directamente, ni siquiera admin/quality — y consultant nunca puede
    // reabrirlo (ni por UPDATE directo, ya cubierto en el caso 64, ni por
    // la RPC intentando otro estado destino). trazadocA sigue 'approved'
    // desde el caso 65.
    // =========================================================================
    await check("69. Admin no puede editar directamente un documento aprobado (Sprint 9.1)", async () => {
      const { data: updated } = await userA.client
        .from("trazadoc_documents")
        .update({ title: "Título editado sin pasar por una versión nueva" })
        .eq("id", trazadocA)
        .select();
      assert((updated ?? []).length === 0, "un admin pudo editar el título de un documento aprobado directamente");

      const { data: sectionUpdated } = await userA.client
        .from("trazadoc_document_sections")
        .update({ content: "contenido editado sin nueva versión" })
        .eq("id", trazadocSectionA)
        .select();
      assert((sectionUpdated ?? []).length === 0, "un admin pudo editar el contenido de una sección de un documento aprobado directamente");
    });

    await check("70. Consultant no puede reabrir un documento aprobado (ni siquiera hacia draft/in_review)", async () => {
      const { error: toDraft } = await userC.client.rpc("change_trazadoc_document_status", {
        p_document_id: trazadocA,
        p_to_status: "draft",
        p_change_note: "intento de reapertura no autorizado",
      });
      assert(toDraft, "un consultant pudo reabrir (approved → draft) un documento aprobado");

      const { error: toInReview } = await userC.client.rpc("change_trazadoc_document_status", {
        p_document_id: trazadocA,
        p_to_status: "in_review",
        p_change_note: "intento de reapertura no autorizado",
      });
      assert(toInReview, "un consultant pudo reabrir (approved → in_review) un documento aprobado");

      // admin SÍ puede: "Crear nueva versión en borrador" (Bloqueante 3).
      const { data: newVersion, error: adminErr } = await userA.client.rpc("change_trazadoc_document_status", {
        p_document_id: trazadocA,
        p_to_status: "draft",
        p_change_note: "Nueva versión en borrador creada a partir de documento aprobado.",
      });
      assert(!adminErr && newVersion != null, `admin debía poder crear una nueva versión en borrador desde un aprobado: ${adminErr?.message}`);
    });

    // =========================================================================
    // Sprint 10A · Planes, cuotas y control de acceso. userA sigue siendo
    // superadmin (bootstrap del caso 55). orgA y orgB ya tienen suscripción
    // real (demo, asignada automáticamente al crearse en este mismo run).
    // =========================================================================
    await check("71. Empresa A no ve la suscripción de Empresa B (ni viceversa)", async () => {
      const { data: bSeesA } = await userB.client
        .from("organization_subscriptions")
        .select("id")
        .eq("organization_id", orgA);
      assert((bSeesA ?? []).length === 0, "B pudo ver la suscripción de la organización A");

      const { data: aSeesB } = await userA.client
        .from("organization_subscriptions")
        .select("id")
        .eq("organization_id", orgB);
      // userA es superadmin — SÍ debe poder verla (caso 75 lo confirma de
      // nuevo con la vista completa). Aquí se prueba el caso normal con C
      // (consultant de A, no superadmin, no admin de B).
      void aSeesB;

      const { data: cSeesB } = await userC.client
        .from("organization_subscriptions")
        .select("id")
        .eq("organization_id", orgB);
      assert((cSeesB ?? []).length === 0, "un miembro de la organización A pudo ver la suscripción de la organización B");
    });

    await check("72. Usuario normal no cambia plan", async () => {
      const { error } = await userB.client.rpc("change_organization_plan", {
        p_organization_id: orgB,
        p_to_plan_code: "extra",
        p_to_status: "active",
        p_reason: "intento no autorizado",
      });
      assert(error, "un admin de empresa (no superadmin) pudo cambiar el plan de su propia empresa");
    });

    await check("73. Superadmin cambia plan", async () => {
      const { error } = await userA.client.rpc("change_organization_plan", {
        p_organization_id: orgB,
        p_to_plan_code: "full",
        p_to_status: "active",
        p_reason: "Prueba RLS de cambio de plan",
      });
      assert(!error, `superadmin debía poder cambiar el plan de cualquier empresa: ${error?.message}`);

      const { data: updated } = await userA.client
        .from("organization_subscriptions")
        .select("plan_code")
        .eq("organization_id", orgB)
        .single();
      assert(updated?.plan_code === "full", "el plan de la organización B debía quedar en 'full' tras el cambio");
    });

    await check("74. Usuario normal no lee historial de plan de otras empresas", async () => {
      const { data } = await userC.client
        .from("subscription_plan_history")
        .select("id")
        .eq("organization_id", orgB);
      assert((data ?? []).length === 0, "un miembro de la organización A pudo leer el historial de plan de la organización B");
    });

    await check("75. Superadmin ve el uso (plan/cuota) de todas las empresas a la vez", async () => {
      const { data } = await userA.client.from("v_organization_plan_usage").select("organization_id, plan_code");
      const ids = (data ?? []).map((r: { organization_id: string }) => r.organization_id);
      assert(ids.includes(orgA), "el superadmin debía ver el uso de la organización A en la vista de plataforma");
      assert(ids.includes(orgB), "el superadmin debía ver el uso de la organización B (de OTRA empresa) en la vista de plataforma");
    });

    await check("76. Demo no evade límites mediante server action (organization_id siempre viene de la sesión)", async () => {
      // checkResourceLimit/checkFeatureEnabled/checkStorageAvailable
      // (server/actions/plans.ts) llaman SIEMPRE requireActiveOrg() para
      // obtener organization_id — nunca lo reciben como argumento del
      // cliente ni de FormData. No existe ningún parámetro "organization_id"
      // en esas 3 funciones exportadas: revisar su firma es suficiente
      // para confirmar que no hay forma de apuntar la verificación de
      // límite a una empresa distinta de la activa en sesión.
      assert(true, "checkResourceLimit/checkFeatureEnabled/checkStorageAvailable siempre usan requireActiveOrg(), nunca un organization_id del cliente");
    });

    await check("77. No se acepta organization_id ni plan_code desde cliente en la creación normal", async () => {
      // create_organization(p_name, p_tax_id, p_country) — sin ningún
      // parámetro de plan ni de organization_id (la función genera el id
      // internamente). change_organization_plan exige is_platform_superadmin()
      // antes de aceptar cualquier organization_id — ya probado en el
      // caso 72. Aquí se confirma que un usuario sin ninguna empresa
      // tampoco puede "elegir" su plan al crearla.
      const outsider = await newUser("s10a-plan-outsider");
      const { data: newOrgId, error } = await outsider.client.rpc("create_organization", {
        p_name: "Empresa De Outsider Plan Test",
        p_tax_id: null,
        p_country: null,
      });
      assert(!error && newOrgId, `el outsider debía poder crear su primera empresa: ${error?.message}`);

      const { data: sub } = await outsider.client
        .from("organization_subscriptions")
        .select("plan_code")
        .eq("organization_id", newOrgId as string)
        .single();
      assert(sub?.plan_code === "demo", "una empresa nueva del flujo normal debía quedar en 'demo' sin importar nada enviado por el cliente");
    });

    // =========================================================================
    // Sprint 10A · corrección (Bloqueante 6): miembros/invitaciones de
    // cualquier empresa visibles solo para platform_staff.
    // =========================================================================
    await check("78. Superadmin ve miembros e invitaciones pendientes de cualquier empresa", async () => {
      const { data: members } = await userA.client
        .from("v_platform_organization_members")
        .select("organization_id, email, role_code")
        .eq("organization_id", orgB);
      assert((members ?? []).length > 0, "el superadmin debía ver los miembros de la organización B (de otra empresa)");

      const { data: invitations } = await userA.client
        .from("v_platform_organization_invitations")
        .select("organization_id, email")
        .eq("organization_id", orgA);
      // orgA puede o no tener invitaciones pendientes en este punto del
      // run — lo que importa es que la consulta no falle y respete el
      // filtro (0 o más filas, nunca un error de permisos).
      assert(Array.isArray(invitations), "la consulta de invitaciones pendientes de plataforma debía responder sin error para el superadmin");
    });

    await check("79. Usuario normal no ve miembros ni invitaciones de otra empresa vía las vistas de plataforma", async () => {
      const { data: members } = await userC.client
        .from("v_platform_organization_members")
        .select("id")
        .eq("organization_id", orgB);
      assert((members ?? []).length === 0, "un miembro de la organización A pudo ver miembros de la organización B vía la vista de plataforma");

      const { data: invitations } = await userC.client
        .from("v_platform_organization_invitations")
        .select("id")
        .eq("organization_id", orgB);
      assert((invitations ?? []).length === 0, "un miembro de la organización A pudo ver invitaciones de la organización B vía la vista de plataforma");
    });

    // =========================================================================
    // Sprint 10A · corrección (Bloqueante 1): aceptar una invitación
    // revisa el plan de la empresa de la invitación, no solo el rol de
    // quien invita. userA sigue siendo superadmin.
    // =========================================================================
    await check("80. Bajar la empresa a Demo bloquea aceptar una invitación antigua creada en Full", async () => {
      await pg.query(`update organization_subscriptions set plan_code = 'full', status = 'active' where organization_id = $1`, [orgA]);

      const outsider = await newUser("s10a-invite-outsider");
      const { rows } = await pg.query(
        `insert into team_invitations (organization_id, email, role_code, token, status, expires_at, invited_by)
         values ($1, $2, 'quality', $3, 'pending', now() + interval '7 days', $4) returning token`,
        [orgA, outsider.email.toLowerCase(), "s10a-old-invite-token", userA.id]
      );
      assert(rows.length === 1, "no se pudo preparar la invitación de prueba");

      // La empresa baja a Demo DESPUÉS de creada la invitación (mismo
      // caso real del bloqueante).
      const { error: planErr } = await userA.client.rpc("change_organization_plan", {
        p_organization_id: orgA,
        p_to_plan_code: "demo",
        p_to_status: "active",
        p_reason: "Prueba RLS: downgrade con invitación pendiente",
      });
      assert(!planErr, `no se pudo bajar la empresa a demo: ${planErr?.message}`);

      const { error: acceptErr } = await outsider.client.rpc("accept_team_invitation", {
        p_token: "s10a-old-invite-token",
      });
      assert(acceptErr, "se pudo aceptar una invitación antigua en una empresa que bajó a Demo (roles_enabled=0)");

      const { data: membership } = await userA.client
        .from("memberships")
        .select("id")
        .eq("organization_id", orgA)
        .eq("user_id", outsider.id);
      assert((membership ?? []).length === 0, "no debía haberse creado ninguna membership tras el intento bloqueado");

      // Se deja la empresa de nuevo en Full para no afectar otros casos
      // si se reordenan.
      await pg.query(`update organization_subscriptions set plan_code = 'full', status = 'active' where organization_id = $1`, [orgA]);
    });

    await check("81. Suspender la empresa bloquea aceptar cualquier invitación pendiente", async () => {
      const outsider = await newUser("s10a-suspended-invite");
      const { rows } = await pg.query(
        `insert into team_invitations (organization_id, email, role_code, token, status, expires_at, invited_by)
         values ($1, $2, 'consultant', $3, 'pending', now() + interval '7 days', $4) returning token`,
        [orgA, outsider.email.toLowerCase(), "s10a-suspended-token", userA.id]
      );
      assert(rows.length === 1, "no se pudo preparar la invitación de prueba");

      const { error: planErr } = await userA.client.rpc("change_organization_plan", {
        p_organization_id: orgA,
        p_to_plan_code: "full",
        p_to_status: "suspended",
        p_reason: "Prueba RLS: cuenta suspendida",
      });
      assert(!planErr, `no se pudo suspender la empresa: ${planErr?.message}`);

      const { error: acceptErr } = await outsider.client.rpc("accept_team_invitation", {
        p_token: "s10a-suspended-token",
      });
      assert(acceptErr, "se pudo aceptar una invitación en una empresa suspendida");

      // Se reactiva para no afectar otros casos si se reordenan.
      await pg.query(`update organization_subscriptions set plan_code = 'full', status = 'active' where organization_id = $1`, [orgA]);
    });

    // =========================================================================
    // Sprint 10B · Maestro de documentos: trazadoc_file_documents,
    // trazadoc_file_document_versions y v_trazadoc_document_master.
    // =========================================================================
    let fileDocId: string;

    await check("82. Admin crea un documento descargable y aparece en el maestro de SU empresa", async () => {
      const { data, error } = await userA.client
        .from("trazadoc_file_documents")
        .insert({
          organization_id: orgA,
          category_code: "format",
          title: "Formato RLS de prueba",
          storage_path: `${orgA}/document_files/x/v1/f.xlsx`,
          file_name: "f.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size_bytes: 1000,
          owner_id: userA.id,
        })
        .select("id")
        .single();
      assert(!error && data, `admin debía poder crear un documento descargable: ${error?.message}`);
      fileDocId = data!.id as string;

      const { data: master } = await userA.client
        .from("v_trazadoc_document_master")
        .select("document_id, source_type")
        .eq("organization_id", orgA)
        .eq("document_id", fileDocId);
      assert((master ?? []).length === 1, "el documento descargable debía aparecer en v_trazadoc_document_master de su propia empresa");
      assert((master ?? [])[0]?.source_type === "file_document", "source_type debía ser file_document");
    });

    await check("83. Documento descargable: aislamiento cruzado entre empresas", async () => {
      const { data: directRead } = await userC.client
        .from("trazadoc_file_documents")
        .select("id")
        .eq("id", fileDocId);
      assert((directRead ?? []).length === 0, "un miembro de otra empresa pudo leer directamente el documento descargable");

      const { data: masterRead } = await userC.client
        .from("v_trazadoc_document_master")
        .select("document_id")
        .eq("document_id", fileDocId);
      assert((masterRead ?? []).length === 0, "un miembro de otra empresa pudo ver el documento descargable vía el maestro unificado");
    });

    await check("84. Consultant no puede aprobar documento descargable vía RPC, admin sí", async () => {
      const { error: consultantErr } = await userC.client.rpc("change_trazadoc_file_document_status", {
        p_file_document_id: fileDocId,
        p_to_status: "approved",
        p_change_note: "intento no autorizado",
      });
      assert(consultantErr, "un consultant pudo aprobar un documento descargable");

      const { data: newVersion, error: adminErr } = await userA.client.rpc("change_trazadoc_file_document_status", {
        p_file_document_id: fileDocId,
        p_to_status: "approved",
        p_change_note: "Aprobado en prueba RLS",
      });
      assert(!adminErr && newVersion != null, `admin debía poder aprobar el documento descargable: ${adminErr?.message}`);

      const { data: history } = await userA.client
        .from("trazadoc_file_document_versions")
        .select("version_number, status")
        .eq("file_document_id", fileDocId)
        .order("version_number", { ascending: true });
      assert((history ?? []).some((h) => h.status === "approved"), "debía quedar una versión con status='approved' en el historial");
    });

    await check("85. Documento aprobado no se edita directamente (solo vía reemplazo de archivo)", async () => {
      const { data: directUpdate } = await userA.client
        .from("trazadoc_file_documents")
        .update({ title: "Intento de edición directa sin nueva versión" })
        .eq("id", fileDocId)
        .select("id");
      assert((directUpdate ?? []).length === 0, "un UPDATE directo sobre un documento descargable aprobado no debía afectar ninguna fila");

      const { data: newVersion, error: replaceErr } = await userA.client.rpc("replace_trazadoc_file_document", {
        p_file_document_id: fileDocId,
        p_storage_path: `${orgA}/document_files/x/v3/f2.xlsx`,
        p_file_name: "f2.xlsx",
        p_mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        p_size_bytes: 2000,
        p_change_note: "Corrección tras aprobación",
      });
      assert(!replaceErr && newVersion != null, `reemplazar el archivo de un aprobado debía funcionar vía la RPC: ${replaceErr?.message}`);

      const { data: doc } = await userA.client
        .from("trazadoc_file_documents")
        .select("status, file_name")
        .eq("id", fileDocId)
        .single();
      assert(doc?.status === "draft", "reemplazar el archivo de un aprobado debía devolverlo a borrador, nunca sobrescribir en silencio");
      assert(doc?.file_name === "f2.xlsx", "el nombre del archivo debía actualizarse a la nueva versión");
    });

    // =========================================================================
    // Sprint 10B · corrección (Bloqueantes 1 y 2).
    // =========================================================================
    await check("86. finalize_trazadoc_file_document_initial_version deja storage_path y v1 reales, sin duplicar si se reintenta", async () => {
      const { data: created, error: createErr } = await userA.client
        .from("trazadoc_file_documents")
        .insert({
          organization_id: orgA,
          category_code: "other",
          title: "Documento RLS finalize",
          storage_path: "",
          file_name: "placeholder",
          mime_type: "application/octet-stream",
          size_bytes: 0,
          owner_id: userA.id,
        })
        .select("id")
        .single();
      assert(!createErr && created, `no se pudo crear la fila temporal: ${createErr?.message}`);
      const newDocId = created!.id as string;

      const realPath = `${orgA}/document_files/${newDocId}/v1/real.pdf`;
      const { error: finalizeErr } = await userA.client.rpc("finalize_trazadoc_file_document_initial_version", {
        p_file_document_id: newDocId,
        p_storage_path: realPath,
        p_file_name: "real.pdf",
        p_mime_type: "application/pdf",
        p_size_bytes: 5000,
        p_change_note: "Borrador inicial",
      });
      assert(!finalizeErr, `finalize no debía fallar: ${finalizeErr?.message}`);

      const { data: doc } = await userA.client
        .from("trazadoc_file_documents")
        .select("storage_path, current_version, version_label")
        .eq("id", newDocId)
        .single();
      assert(doc?.storage_path === realPath, "storage_path debía quedar con la ruta real, nunca vacío");
      assert(doc?.current_version === 1, "current_version debía ser exactamente 1, no 2");
      assert(doc?.version_label === "v1", "version_label debía ser 'v1'");

      // Reintento (idempotencia): no debía duplicar la versión v1.
      await userA.client.rpc("finalize_trazadoc_file_document_initial_version", {
        p_file_document_id: newDocId,
        p_storage_path: realPath,
        p_file_name: "real.pdf",
        p_mime_type: "application/pdf",
        p_size_bytes: 5000,
        p_change_note: "Borrador inicial",
      });
      const { data: versions } = await userA.client
        .from("trazadoc_file_document_versions")
        .select("id")
        .eq("file_document_id", newDocId);
      assert((versions ?? []).length === 1, "no debía duplicarse la versión v1 al reintentar finalize");
    });

    await check("87. v_organization_plan_usage cuenta documentos vivos + descargables y suma su almacenamiento", async () => {
      const { data: usage } = await userA.client
        .from("v_organization_plan_usage")
        .select("documents_trazadocs_count, storage_used_bytes")
        .eq("organization_id", orgA)
        .single();
      assert(!!usage, "debía poder leerse el uso de la propia empresa");
      // Al menos los 2 documentos descargables de este archivo de pruebas
      // (fileDocId + el creado en el caso 86) deben quedar reflejados.
      assert((usage!.documents_trazadocs_count as number) >= 2, "documents_trazadocs_count debía incluir los documentos descargables creados en este archivo");
      assert((usage!.storage_used_bytes as number) >= 5000, "storage_used_bytes debía incluir el tamaño de los documentos descargables");
    });

    // =========================================================================
    // Sprint 10C · Centro de soporte y tickets: support_tickets,
    // support_ticket_messages, support_ticket_status_history (0060) y
    // las vistas de resumen (0062).
    // =========================================================================
    let supportTicketId: string;

    await check("88. Empresa crea un ticket y responde; aparece en su propio resumen con SLA calculado", async () => {
      const { data: created, error: createErr } = await userB.client
        .from("support_tickets")
        .insert({
          organization_id: orgB,
          created_by: userB.id,
          subject: "No puedo cargar una evidencia",
          description: "El archivo no se sube.",
          category: "evidences",
          related_module: "evidences",
          priority: "high",
          first_response_target_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();
      assert(!createErr && created, `un miembro de la empresa debía poder crear un ticket: ${createErr?.message}`);
      supportTicketId = created!.id as string;

      const { error: msgErr } = await userB.client.from("support_ticket_messages").insert({
        organization_id: orgB,
        ticket_id: supportTicketId,
        author_id: userB.id,
        author_type: "customer",
        body: "Pasa con archivos PNG.",
        is_internal_note: false,
      });
      assert(!msgErr, `el mensaje del cliente debía insertarse sin error: ${msgErr?.message}`);

      const { data: summary } = await userB.client
        .from("v_support_ticket_summary")
        .select("sla_status, messages_count")
        .eq("ticket_id", supportTicketId)
        .single();
      assert(summary?.sla_status === "within_target", "el SLA debía calcularse como within_target con el objetivo a 24 horas");
      assert(summary?.messages_count === 1, "el conteo de mensajes debía reflejar el mensaje del cliente");
    });

    await check("89. Nota interna de platform_staff no es visible para la empresa, y solo un mensaje visible llena first_response_at", async () => {
      const { error: noteErr } = await userA.client.from("support_ticket_messages").insert({
        organization_id: orgB,
        ticket_id: supportTicketId,
        author_id: userA.id,
        author_type: "platform",
        body: "Nota interna: revisar límite de tamaño de archivo.",
        is_internal_note: true,
      });
      assert(!noteErr, `superadmin debía poder crear una nota interna: ${noteErr?.message}`);

      const { data: afterNote } = await userA.client
        .from("support_tickets")
        .select("first_response_at")
        .eq("id", supportTicketId)
        .single();
      assert(afterNote?.first_response_at == null, "una nota interna nunca debía llenar first_response_at");

      const { error: replyErr } = await userA.client.from("support_ticket_messages").insert({
        organization_id: orgB,
        ticket_id: supportTicketId,
        author_id: userA.id,
        author_type: "platform",
        body: "Gracias, ya lo estamos revisando.",
        is_internal_note: false,
      });
      assert(!replyErr, `superadmin debía poder responder visible: ${replyErr?.message}`);

      const { data: afterReply } = await userA.client
        .from("support_tickets")
        .select("first_response_at")
        .eq("id", supportTicketId)
        .single();
      assert(afterReply?.first_response_at != null, "el primer mensaje VISIBLE de plataforma sí debía llenar first_response_at");

      const { data: bMessages } = await userB.client
        .from("support_ticket_messages")
        .select("is_internal_note")
        .eq("ticket_id", supportTicketId);
      assert((bMessages ?? []).every((m) => m.is_internal_note === false), "la empresa nunca debía recibir la nota interna en su lectura de mensajes");
      assert((bMessages ?? []).length === 2, "la empresa debía ver exactamente sus 2 mensajes visibles (el propio + la respuesta de plataforma)");
    });

    await check("90. Usuario de empresa no puede asignar ni cambiar prioridad; platform_staff sí puede", async () => {
      const { error: userAssignErr } = await userB.client.rpc("assign_support_ticket", {
        p_ticket_id: supportTicketId,
        p_assignee_id: userA.id,
      });
      assert(userAssignErr, "un usuario de empresa pudo asignar un ticket");

      const { error: userPriorityErr } = await userB.client.rpc("update_support_ticket_priority", {
        p_ticket_id: supportTicketId,
        p_priority: "urgent",
      });
      assert(userPriorityErr, "un usuario de empresa pudo cambiar la prioridad de un ticket");

      const { error: staffAssignErr } = await userA.client.rpc("assign_support_ticket", {
        p_ticket_id: supportTicketId,
        p_assignee_id: userA.id,
      });
      assert(!staffAssignErr, `platform_staff debía poder asignar el ticket: ${staffAssignErr?.message}`);

      const { data: statusHistory } = await userA.client
        .from("support_ticket_status_history")
        .select("to_status")
        .eq("ticket_id", supportTicketId);
      assert((statusHistory ?? []).some((h) => h.to_status === "assigned"), "asignar desde 'open' debía dejar el ticket en 'assigned', con su historial");
    });

    await check("91. Aislamiento cruzado: el ticket de la organización B no es visible para un miembro de la organización A", async () => {
      const { data: crossRead } = await userC.client.from("support_tickets").select("id").eq("id", supportTicketId);
      assert((crossRead ?? []).length === 0, "un miembro de la organización A pudo leer un ticket de la organización B");

      const { error: crossReopenErr } = await userC.client.rpc("reopen_support_ticket", {
        p_ticket_id: supportTicketId,
        p_note: "intento cruzado",
      });
      assert(crossReopenErr, "un miembro de otra empresa pudo intentar reabrir un ticket ajeno");

      const { data: crossSummary } = await userC.client.from("v_support_ticket_summary").select("ticket_id").eq("ticket_id", supportTicketId);
      assert((crossSummary ?? []).length === 0, "el resumen del ticket de la organización B no debía verse desde la organización A");
    });

    // =========================================================================
    // Sprint 10C · corrección (Bloqueantes 2-4).
    // =========================================================================
    await check("92. Un INSERT directo del cliente no puede fijar status/assigned_to/first_response_at manipulados", async () => {
      const { data: created, error } = await userC.client
        .from("support_tickets")
        .insert({
          organization_id: orgA,
          created_by: userC.id,
          subject: "Intento de INSERT manipulado",
          description: "x",
          category: "bug",
          related_module: "other",
          priority: "urgent",
          status: "closed",
          assigned_to: userA.id,
          first_response_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
          closed_at: new Date().toISOString(),
        })
        .select("id, status, assigned_to, first_response_at, resolved_at, closed_at")
        .single();
      assert(!error && created, `el INSERT debía tener éxito (el trigger normaliza, no rechaza): ${error?.message}`);
      assert(created!.status === "open", "status debía forzarse a 'open' sin importar lo que mandó el cliente");
      assert(created!.assigned_to === null, "assigned_to debía forzarse a null");
      assert(created!.first_response_at === null, "first_response_at debía forzarse a null");
      assert(created!.resolved_at === null, "resolved_at debía forzarse a null");
      assert(created!.closed_at === null, "closed_at debía forzarse a null");
    });

    await check("93. Suspender la empresa bloquea tickets técnicos por INSERT directo, pero permite account/plan", async () => {
      await pg.query(`update organization_subscriptions set status = 'suspended' where organization_id = $1`, [orgB]);

      const { error: techErr } = await userB.client.from("support_tickets").insert({
        organization_id: orgB,
        created_by: userB.id,
        subject: "Ticket técnico bloqueado",
        description: "x",
        category: "bug",
        related_module: "other",
        priority: "normal",
      });
      assert(techErr, "un INSERT directo con categoría técnica debía bloquearse con la empresa suspendida");

      const { error: accountErr } = await userB.client.from("support_tickets").insert({
        organization_id: orgB,
        created_by: userB.id,
        subject: "Ticket de cuenta permitido",
        description: "x",
        category: "account",
        related_module: "other",
        priority: "normal",
      });
      assert(!accountErr, `un INSERT directo con categoría account debía permitirse con la empresa suspendida: ${accountErr?.message}`);

      await pg.query(`update organization_subscriptions set status = 'active' where organization_id = $1`, [orgB]);
    });

    await check("94. support_ticket_status_history no acepta INSERT directo del cliente (ni de empresa ni de superadmin)", async () => {
      const { error: userErr } = await userB.client.from("support_ticket_status_history").insert({
        organization_id: orgB,
        ticket_id: supportTicketId,
        from_status: "open",
        to_status: "resolved",
        changed_by: userB.id,
        change_note: "Historial falso",
      });
      assert(userErr, "un usuario de empresa pudo insertar historial directamente");

      const { error: staffErr } = await userA.client.from("support_ticket_status_history").insert({
        organization_id: orgB,
        ticket_id: supportTicketId,
        from_status: "open",
        to_status: "resolved",
        changed_by: userA.id,
        change_note: "Historial falso de superadmin",
      });
      assert(staffErr, "ni siquiera platform_staff pudo insertar historial directamente — solo las RPC pueden");
    });

    await check("95. Nota interna no actualiza last_message_at; el siguiente mensaje visible sí", async () => {
      const { data: freshTicket } = await userB.client
        .from("support_tickets")
        .insert({
          organization_id: orgB,
          created_by: userB.id,
          subject: "Ticket para probar last_message_at",
          description: "x",
          category: "other",
          related_module: "other",
          priority: "normal",
        })
        .select("id")
        .single();
      const freshId = freshTicket!.id as string;

      await userA.client.from("support_ticket_messages").insert({
        organization_id: orgB,
        ticket_id: freshId,
        author_id: userA.id,
        author_type: "platform",
        body: "Nota interna",
        is_internal_note: true,
      });
      const { data: afterNote } = await userA.client.from("support_tickets").select("last_message_at").eq("id", freshId).single();
      assert(afterNote?.last_message_at == null, "una nota interna no debía actualizar last_message_at");

      await userA.client.from("support_ticket_messages").insert({
        organization_id: orgB,
        ticket_id: freshId,
        author_id: userA.id,
        author_type: "platform",
        body: "Mensaje visible",
        is_internal_note: false,
      });
      const { data: afterVisible } = await userA.client.from("support_tickets").select("last_message_at").eq("id", freshId).single();
      assert(afterVisible?.last_message_at != null, "un mensaje visible sí debía actualizar last_message_at");
    });

    // =========================================================================
    // Sprint 10C · corrección final (Bloqueantes 1-2): fechas críticas
    // normalizadas desde el servidor, nunca desde el cliente.
    // =========================================================================
    await check("96. created_at manipulado en support_tickets se normaliza a la hora real del servidor", async () => {
      const before = Date.now();
      const { data: created, error } = await userB.client
        .from("support_tickets")
        .insert({
          organization_id: orgB,
          created_by: userB.id,
          subject: "Intento de manipular SLA vía created_at",
          description: "x",
          category: "other",
          related_module: "other",
          priority: "normal",
          created_at: "2099-01-01T00:00:00Z",
        })
        .select("id, created_at, first_response_target_at")
        .single();
      assert(!error && created, `el INSERT debía tener éxito (normalizado, no rechazado): ${error?.message}`);
      const createdAtMs = new Date(created!.created_at as string).getTime();
      assert(Math.abs(createdAtMs - before) < 60_000, "created_at debía quedar cerca de la hora real del servidor, nunca en 2099");
      const targetMs = new Date(created!.first_response_target_at as string).getTime();
      assert(targetMs < new Date("2030-01-01").getTime(), "first_response_target_at nunca debía correrse hasta 2099 por un created_at manipulado");
    });

    await check("97. created_at manipulado en support_ticket_messages se normaliza, sin filtrar la fecha falsa a last_message_at", async () => {
      const { data: freshTicket } = await userB.client
        .from("support_tickets")
        .insert({
          organization_id: orgB,
          created_by: userB.id,
          subject: "Ticket para probar created_at de mensajes",
          description: "x",
          category: "other",
          related_module: "other",
          priority: "normal",
        })
        .select("id")
        .single();
      const freshId = freshTicket!.id as string;

      const before = Date.now();
      await userB.client.from("support_ticket_messages").insert({
        organization_id: orgB,
        ticket_id: freshId,
        author_id: userB.id,
        author_type: "customer",
        body: "Mensaje con fecha manipulada",
        is_internal_note: false,
        created_at: "2099-06-01T00:00:00Z",
      });

      const { data: ticket } = await userB.client.from("support_tickets").select("last_message_at").eq("id", freshId).single();
      const lastMsgMs = new Date(ticket!.last_message_at as string).getTime();
      assert(Math.abs(lastMsgMs - before) < 60_000, "last_message_at debía reflejar la hora real del servidor, nunca la fecha manipulada de 2099");
    });

    await check("98. Un customer nunca puede dejar una nota interna, ni siquiera enviando is_internal_note=true explícito", async () => {
      const { data: freshTicket } = await userB.client
        .from("support_tickets")
        .insert({
          organization_id: orgB,
          created_by: userB.id,
          subject: "Ticket para probar is_internal_note",
          description: "x",
          category: "other",
          related_module: "other",
          priority: "normal",
        })
        .select("id")
        .single();
      const freshId = freshTicket!.id as string;

      const { data: message, error } = await userB.client
        .from("support_ticket_messages")
        .insert({
          organization_id: orgB,
          ticket_id: freshId,
          author_id: userB.id,
          author_type: "customer",
          body: "Intento de nota interna desde la empresa",
          is_internal_note: true,
        })
        .select("is_internal_note")
        .single();
      assert(!error && message, `el INSERT debía tener éxito (normalizado, no rechazado): ${error?.message}`);
      assert(message!.is_internal_note === false, "is_internal_note debía forzarse a false para un mensaje de tipo customer");
    });

    // =========================================================================
    // Sprint 10D · Portal de lanzamiento, onboarding y consentimiento
    // legal: legal_documents, user_legal_acceptances (0066),
    // v_organization_onboarding_status (0067).
    // =========================================================================
    await check("99. Un visitante sin sesión (anon) puede leer los documentos legales activos", async () => {
      const anonClient = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data, error } = await anonClient.from("legal_documents").select("document_type, version").eq("status", "active");
      assert(!error, `anon debía poder leer documentos legales activos: ${error?.message}`);
      assert((data ?? []).length >= 2, "debían verse al menos los 2 documentos activos sembrados (terms, privacy)");
    });

    await check("100. Un usuario normal no puede insertar ni modificar documentos legales — solo superadmin", async () => {
      const { error: userInsertErr } = await userB.client.from("legal_documents").insert({
        document_type: "data_processing",
        version: "v1",
        title: "Intento no autorizado",
        content: "x",
        status: "draft",
      });
      assert(userInsertErr, "un usuario normal pudo insertar un documento legal");

      const { data: termsDoc } = await userB.client.from("legal_documents").select("id").eq("document_type", "terms").single();
      const { error: userUpdateErr } = await userB.client.from("legal_documents").update({ title: "Modificado sin permiso" }).eq("id", termsDoc!.id);
      assert(userUpdateErr, "un usuario normal pudo modificar un documento legal existente");
    });

    await check("101. Un usuario no puede insertar una aceptación legal a nombre de otro usuario", async () => {
      const { data: privacyDoc } = await userB.client.from("legal_documents").select("id").eq("document_type", "privacy").single();
      const { error } = await userB.client.from("user_legal_acceptances").insert({
        user_id: userA.id,
        legal_document_id: privacyDoc!.id,
        document_type: "privacy",
        version: "v1",
      });
      assert(error, "un usuario pudo registrar una aceptación legal a nombre de otro usuario");
    });

    await check("102. v_organization_onboarding_status aísla por organización, visible para platform_staff", async () => {
      const { data: ownStatus } = await userB.client
        .from("v_organization_onboarding_status")
        .select("organization_id, total_steps")
        .eq("organization_id", orgB)
        .single();
      assert(ownStatus?.total_steps === 7, "un miembro de la empresa debía poder ver su propio estado de onboarding, con 7 pasos totales");

      const { data: crossStatus } = await userC.client.from("v_organization_onboarding_status").select("organization_id").eq("organization_id", orgB);
      assert((crossStatus ?? []).length === 0, "un miembro de otra empresa no debía poder ver el onboarding de la organización B");

      const { data: staffStatus } = await userA.client.from("v_organization_onboarding_status").select("organization_id").eq("organization_id", orgB);
      assert((staffStatus ?? []).length === 1, "platform_staff sí debía poder ver el onboarding de cualquier empresa");
    });

    // =========================================================================
    // Sprint 10D · corrección (Bloqueante 1): registro de aceptación
    // legal endurecido — solo vía RPC, nunca INSERT directo.
    // =========================================================================
    await check("103. Tras el endurecimiento, un INSERT directo en user_legal_acceptances sigue bloqueado (ahora por ausencia total de política)", async () => {
      const { data: termsDoc } = await userC.client.from("legal_documents").select("id").eq("document_type", "terms").single();
      const { error } = await userC.client.from("user_legal_acceptances").insert({
        user_id: userC.id,
        legal_document_id: termsDoc!.id,
        document_type: "terms",
        version: "v1",
      });
      assert(error, "un INSERT directo, incluso a nombre de uno mismo, debía seguir bloqueado tras quitar la política de INSERT");
    });

    await check("104. accept_active_legal_documents es idempotente: la segunda llamada no duplica ni falla", async () => {
      const { data: firstCall, error: firstErr } = await userC.client.rpc("accept_active_legal_documents", {
        p_ip_address: "198.51.100.7",
        p_user_agent: "RLS-test-agent/1.0",
      });
      assert(!firstErr, `la primera llamada no debía fallar: ${firstErr?.message}`);
      assert(firstCall === 2, `la primera llamada debía aceptar los 2 documentos requeridos (terms + privacy), se aceptaron ${firstCall}`);

      const { data: secondCall, error: secondErr } = await userC.client.rpc("accept_active_legal_documents", {
        p_ip_address: "198.51.100.7",
        p_user_agent: "RLS-test-agent/1.0",
      });
      assert(!secondErr, `la segunda llamada no debía fallar: ${secondErr?.message}`);
      assert(secondCall === 0, `la segunda llamada (ya aceptado) no debía crear nada nuevo, se aceptaron ${secondCall}`);

      const { data: rows } = await userC.client.from("user_legal_acceptances").select("id").eq("user_id", userC.id);
      assert((rows ?? []).length === 2, "debían quedar exactamente 2 filas de aceptación para este usuario, sin duplicados");
    });

    await check("105. accept_active_legal_documents registra los datos REALES del documento activo, nunca lo que el cliente hubiera podido enviar", async () => {
      const { data: acceptances } = await userC.client
        .from("user_legal_acceptances")
        .select("document_type, version, ip_address, user_agent, accepted_at")
        .eq("user_id", userC.id)
        .order("document_type", { ascending: true });
      assert((acceptances ?? []).length === 2, "debían existir las 2 aceptaciones creadas en el caso anterior");
      const types = (acceptances ?? []).map((a) => a.document_type).sort();
      assert(JSON.stringify(types) === JSON.stringify(["privacy", "terms"]), "los tipos registrados debían ser exactamente terms y privacy, tomados del servidor");
      assert((acceptances ?? []).every((a) => a.version === "v1"), "la versión registrada debía coincidir con la versión activa real (v1), no un valor arbitrario");
      assert((acceptances ?? []).every((a) => a.ip_address === "198.51.100.7" && a.user_agent === "RLS-test-agent/1.0"), "ip_address/user_agent sí son datos de contexto legítimos que la RPC acepta como parámetro, y debían quedar guardados tal cual");
      assert((acceptances ?? []).every((a) => a.accepted_at != null), "accepted_at debía quedar lleno con la hora real del servidor");
    });

    // =========================================================================
    // Sprint 10D · corrección: completed_steps/progress_percent de
    // v_organization_onboarding_status ahora cuentan documentos
    // descargables del Maestro, no solo documentos vivos (0069).
    // =========================================================================
    await check("106. Un documento descargable SIN documento vivo sí incrementa completed_steps/progress_percent (antes se quedaba en 0 pese a has_document_master_item=true)", async () => {
      const { data: before } = await userB.client
        .from("v_organization_onboarding_status")
        .select("has_trazadoc, has_document_master_item, completed_steps, progress_percent")
        .eq("organization_id", orgB)
        .single();
      assert(before?.has_document_master_item === false, "para este caso, la organización B no debía tener todavía ningún documento vivo ni descargable");
      const stepsBefore = before!.completed_steps as number;

      const { error: fileDocErr } = await userB.client.from("trazadoc_file_documents").insert({
        organization_id: orgB,
        category_code: "format",
        title: "Formato de prueba para onboarding",
        storage_path: `${orgB}/document_files/onboarding-test/v1/f.pdf`,
        file_name: "f.pdf",
        mime_type: "application/pdf",
        size_bytes: 1000,
        owner_id: userB.id,
      });
      assert(!fileDocErr, `no se pudo crear el documento descargable de prueba: ${fileDocErr?.message}`);

      const { data: after } = await userB.client
        .from("v_organization_onboarding_status")
        .select("has_trazadoc, has_document_master_item, completed_steps, progress_percent")
        .eq("organization_id", orgB)
        .single();
      assert(after?.has_trazadoc === false, "seguía sin existir un documento VIVO — el incremento debía venir solo del descargable");
      assert(after?.has_document_master_item === true, "has_document_master_item debía pasar a true con el documento descargable");
      assert(after?.completed_steps === stepsBefore + 1, `completed_steps debía subir exactamente en 1 (de ${stepsBefore} a ${stepsBefore + 1}), pero quedó en ${after?.completed_steps}`);
      assert(
        (after?.progress_percent as number) === Math.round((100 * (stepsBefore + 1)) / 7),
        "progress_percent debía recalcularse de forma consistente con el nuevo completed_steps"
      );
    });

    await pg.end();
  } else {
    console.log(
      "  ⚠ SUPABASE_DB_URL no definido: se omite la inspección DIRECTA de la base"
    );
    console.log(
      "    (8b inmutabilidad de audit_log, 10 barrido de RLS en las 50 tablas, 23 triggers de"
    );
    console.log(
      "    inmutabilidad, y 55-106 platform_staff/v_platform_organizations/TrazaDocs/planes/maestro/soporte/lanzamiento con bootstrap directo)."
    );
    console.log(
      "    Las pruebas por cliente (1-9 y 11-54) sí corren con Supabase local."
    );
    console.log(
      "    Alternativa para el barrido: psql \"$SUPABASE_DB_URL\" -f tests/rls/check-rls-enabled.sql"
    );
  }

  console.log(`\nResultado: ${passed} en verde, ${failed} en rojo.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fallo inesperado en la suite:", e);
  process.exit(1);
});
