/**
 * Trazaloop · Sprint 5C · Seed de datos demo para staging (OPCIONAL).
 *
 * Crea en UNA organización explícita la cadena completa para probar el flujo:
 * proveedor → materiales → evidencia validada → producto/familia → lote de
 * entrada → orden → consumo → lote de salida → composición → cálculo.
 *
 * SEGURIDAD:
 * - NO usa service_role: inicia sesión COMO el usuario demo con la anon key,
 *   así aplican RLS, triggers (created_by) y el mismo camino que la app.
 * - Exige DEMO_ORGANIZATION_ID explícito y verifica la membresía del usuario
 *   en esa organización antes de insertar nada. Jamás toca otras empresas.
 * - No se ejecuta automáticamente en ningún despliegue: es un script manual
 *   (`npm run seed:demo`). No usarlo en producción con datos reales.
 *
 * Requisitos previos (por UI, ver docs/STAGING_DEPLOYMENT.md §Demo):
 *   1. Registrar el usuario demo desde /register (Auth por SQL no es práctico).
 *   2. Crear la organización (p. ej. "Demo Plásticos") y copiar su id.
 *
 * Variables requeridas (falla claro si faltan):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   DEMO_ORGANIZATION_ID, DEMO_USER_EMAIL, DEMO_USER_PASSWORD
 * Opcional: DEMO_USER_ID (si se pasa, debe coincidir con el usuario logueado).
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

function requireVar(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(
      `❌ Falta ${name}. El seed demo exige variables explícitas y no inserta nada sin ellas.\n` +
        `   Ejemplo: DEMO_ORGANIZATION_ID=<uuid> DEMO_USER_EMAIL=demo@... DEMO_USER_PASSWORD=... npm run seed:demo`
    );
    process.exit(1);
  }
  return v;
}

const TAG = "DEMO";

async function main() {
  console.log("Trazaloop · seed demo (staging)\n");
  const url = requireVar("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const orgId = requireVar("DEMO_ORGANIZATION_ID");
  const email = requireVar("DEMO_USER_EMAIL");
  const password = requireVar("DEMO_USER_PASSWORD");

  const supabase = createClient(url, anonKey);
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authErr || !auth.user) {
    console.error(`❌ No se pudo iniciar sesión como ${email}: ${authErr?.message}`);
    console.error("   Registra el usuario primero desde la UI (/register).");
    process.exit(1);
  }
  const userId = auth.user.id;
  if (process.env.DEMO_USER_ID && process.env.DEMO_USER_ID !== userId) {
    console.error(`❌ DEMO_USER_ID no coincide con el usuario logueado (${userId}). Abortando.`);
    process.exit(1);
  }
  console.log(`✅ Sesión iniciada como ${email} (${userId})`);

  // Membresía activa en la organización EXPLÍCITA (jamás otra).
  const { data: membership } = await supabase
    .from("memberships")
    .select("role_code, status")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership || membership.status !== "active") {
    console.error(
      `❌ El usuario no es miembro activo de la organización ${orgId}.\n` +
        "   Crea la organización desde la UI con este usuario y usa ese id."
    );
    process.exit(1);
  }
  console.log(`✅ Membresía verificada (rol ${membership.role_code})`);

  async function insert<T extends Record<string, unknown>>(
    table: string,
    values: T,
    label: string
  ): Promise<string> {
    const { data, error } = await supabase
      .from(table)
      .insert({ organization_id: orgId, ...values })
      .select("id")
      .single();
    if (error || !data) {
      console.error(`❌ ${label}: ${error?.message}`);
      process.exit(1);
    }
    console.log(`✅ ${label}`);
    return data.id as string;
  }

  // 1. Proveedor y materiales.
  const supplierId = await insert(
    "suppliers",
    { name: `Recicladora ${TAG}` },
    "Proveedor: Recicladora DEMO"
  );
  const evidenceId = await insert(
    "evidences",
    { name: `Soporte de origen PCR ${TAG}`, evidence_type: "declaración de origen" },
    "Evidencia de origen (pendiente)"
  );
  const { error: validateErr } = await supabase
    .from("evidences")
    .update({ status: "valid" })
    .eq("id", evidenceId);
  if (validateErr) {
    console.error(
      `❌ No se pudo validar la evidencia: ${validateErr.message}\n` +
        "   El usuario demo debe tener rol admin o quality."
    );
    process.exit(1);
  }
  console.log("✅ Evidencia validada");

  const materialPcrId = await insert(
    "materials",
    {
      name: `PCR ${TAG}`,
      classification_code: "postconsumer_valid",
      origin_support_evidence_id: evidenceId,
    },
    "Material: PCR DEMO (postconsumo con soporte válido)"
  );
  const materialVirginId = await insert(
    "materials",
    { name: `Resina virgen ${TAG}`, classification_code: "virgin" },
    "Material: resina virgen DEMO"
  );

  // 2. Producto y familia.
  const familyId = await insert(
    "product_families",
    { name: `Envases ${TAG}` },
    "Familia: Envases DEMO"
  );
  await insert(
    "products",
    {
      code: `${TAG}-P1`,
      name: `Envase ${TAG}`,
      family_id: familyId,
      declared_recycled_percent: 60,
    },
    "Producto: Envase DEMO (declara 60%)"
  ).then(async (productId) => {
    // 3. Cadena de trazabilidad balanceada (consumo 100 kg = composición 100 kg).
    const inputBatchId = await insert(
      "input_batches",
      {
        batch_code: `${TAG}-LE-001`,
        supplier_id: supplierId,
        material_id: materialPcrId,
        received_date: new Date().toISOString().slice(0, 10),
        quantity_kg: 200,
      },
      "Lote de entrada DEMO-LE-001 (200 kg)"
    );
    const orderId = await insert(
      "production_orders",
      { order_code: `${TAG}-OP-001`, order_date: new Date().toISOString().slice(0, 10) },
      "Orden de producción DEMO-OP-001"
    );
    await insert(
      "batch_consumption",
      { production_order_id: orderId, input_batch_id: inputBatchId, mass_kg: 100 },
      "Consumo: 100 kg de DEMO-LE-001"
    );
    const outputBatchId = await insert(
      "output_batches",
      {
        batch_code: `${TAG}-LS-001`,
        production_order_id: orderId,
        product_id: productId,
        produced_date: new Date().toISOString().slice(0, 10),
        produced_quantity_kg: 100,
      },
      "Lote de salida DEMO-LS-001"
    );
    await insert(
      "batch_composition",
      { output_batch_id: outputBatchId, material_id: materialPcrId, mass_kg: 70 },
      "Composición: 70 kg PCR DEMO"
    );
    await insert(
      "batch_composition",
      { output_batch_id: outputBatchId, material_id: materialVirginId, mass_kg: 30 },
      "Composición: 30 kg resina virgen"
    );

    // 4. Cálculo por la MISMA RPC de la app (nada de lógica duplicada).
    const { data: calc, error: calcErr } = await supabase.rpc("calculate_recycled_content", {
      p_output_batch_id: outputBatchId,
    });
    if (calcErr) {
      console.error(`❌ Cálculo: ${calcErr.message}`);
      process.exit(1);
    }
    console.log(
      `✅ Cálculo creado: ${Number(calc.recycled_percent).toFixed(2)}% · ` +
        `${calc.defensibility_level}${calc.risk_flag ? " · con riesgo (declara 60% > calculado)" : ""}`
    );
    console.log(
      `\nListo. Abre en la app:\n` +
        `  · Flujo guiado:      /guided-flow/output-batches/${outputBatchId}\n` +
        `  · Dossier técnico:   /audit-support/calculations/${calc.id}\n` +
        `  · Imprimible:        /audit-support/calculations/${calc.id}/print`
    );
  });
}

main().catch((err) => {
  console.error(`❌ Error inesperado: ${(err as Error).message}`);
  process.exit(1);
});
