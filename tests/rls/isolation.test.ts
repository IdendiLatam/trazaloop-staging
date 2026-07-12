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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL; // ej. postgresql://postgres:postgres@127.0.0.1:54322/postgres

if (!URL || !ANON || !SERVICE) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY en .env.local"
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

    await check("10. Todas las tablas (Sprint 1 + 2 + 3) tienen RLS activo", async () => {
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
      // audit_log se excluye: su trigger forbid_mutation ya bloquea TODO update.
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

    await pg.end();
  } else {
    console.log(
      "  ⚠ SUPABASE_DB_URL no definido: se omite la inspección DIRECTA de la base"
    );
    console.log(
      "    (8b inmutabilidad de audit_log, 10 barrido de RLS en las 27 tablas y 23 triggers de inmutabilidad)."
    );
    console.log(
      "    Las pruebas por cliente (1-9 y 11-22) sí corren con Supabase local."
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
