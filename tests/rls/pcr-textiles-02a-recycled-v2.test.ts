/**
 * Trazaloop · PT-02A · Contenido reciclado v2 · contra base REAL.
 *
 * Los doce casos A–L del Design Freeze, cada uno con su fixture, contra la
 * función de verdad y con la sesión de una persona real.
 *
 * LO QUE ESTA SUITE VIGILA POR ENCIMA DE TODO
 *
 * Que nunca aparezca un número donde debería haber un «no lo sé». v1 excluía
 * la masa sin soporte y seguía dando un porcentaje: no inflaba, pero afirmaba
 * con cuatro decimales algo que no podía defender. v2 se calla, y esta suite
 * comprueba que se calla en los siete casos en que debe.
 *
 * Correr: npm run test:pcr-textiles-02a-rls
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const HACE_UN_ANNO = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);

type Calc = {
  // El identificador del snapshot: lo necesita el caso U para releer el
  // dossier de un cálculo que ya no es el último.
  id: string;
  result_state: string; recycled_percent: number | null; total_mass_kg: number | null;
  recycled_mass_kg: number | null; incomplete_reasons: string[]; components: unknown[];
  methodology_version: number; defensibility_level: string; warnings: unknown;
};

async function main() {
  console.log("\nPT-02A · Contenido reciclado v2 · los doce casos\n");

  const email = `pt02a-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data: u, error: eu } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA v2" } });
  assert(!eu && u.user, `usuario: ${eu?.message}`);
  const cli: SupabaseClient = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  assert(!(await cli.auth.signInWithPassword({ email, password })).error, "login");

  const { data: orgId, error: eo } = await cli.rpc("create_organization", { p_name: `PT02A ${stamp}` });
  assert(!eo && orgId, `create_organization: ${eo?.message}`);
  const org = orgId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", org).eq("module_code", "traceability_6632");

  const { data: sup } = await cli.from("suppliers")
    .insert({ organization_id: org, name: `Prov ${stamp}` }).select("id").single();
  assert(sup, "proveedor");

  /** Un material con su clasificación y, opcionalmente, soporte de origen. */
  async function material(nombre: string, clasif: string, conSoporte: boolean) {
    const { data: m, error } = await cli.from("materials")
      .insert({ organization_id: org, name: `${nombre} ${stamp}`, classification_code: clasif })
      .select("id").single();
    assert(!error && m, `material ${nombre}: ${error?.message}`);
    if (conSoporte) {
      const { data: ev } = await cli.from("evidences")
        .insert({ organization_id: org, name: `Ev ${nombre} ${stamp}`, evidence_type: "origin_supplier" })
        .select("id").single();
      await cli.from("evidences").update({ status: "valid" }).eq("id", ev!.id);
      await cli.from("materials").update({ origin_support_evidence_id: ev!.id }).eq("id", m!.id);
    }
    return m!.id as string;
  }

  /** Una orden con sus consumos y UN lote de salida. */
  async function corrida(
    etiqueta: string,
    consumos: Array<{ materialId: string; kg: number; fraccion?: number | null }>,
    producidoKg = 100
  ): Promise<string> {
    const { data: o, error: eOrd } = await cli.from("production_orders")
      .insert({ organization_id: org, order_code: `OC-${etiqueta}-${stamp}`, order_date: HACE_UN_ANNO })
      .select("id").single();
    assert(!eOrd && o, `orden ${etiqueta}: ${eOrd?.message}`);
    for (const [i, c] of consumos.entries()) {
      const { data: lote, error: eL } = await cli.from("input_batches").insert({
        organization_id: org, supplier_id: sup!.id, material_id: c.materialId,
        batch_code: `LE-${etiqueta}-${i}-${stamp}`, received_date: HACE_UN_ANNO,
        quantity_kg: c.kg,
        recycled_fraction: c.fraccion ?? null,
        recycled_fraction_basis: c.fraccion == null ? null : "declaración del proveedor",
      }).select("id").single();
      assert(!eL && lote, `lote ${etiqueta}/${i}: ${eL?.message}`);
      const { error: eC } = await cli.from("batch_consumption").insert({
        organization_id: org, production_order_id: o!.id, input_batch_id: lote!.id, mass_kg: c.kg });
      assert(!eC, `consumo ${etiqueta}/${i}: ${eC?.message}`);
    }
    const { data: ob, error: eB } = await cli.from("output_batches").insert({
      organization_id: org, production_order_id: o!.id,
      batch_code: `LS-${etiqueta}-${stamp}`, produced_date: HACE_UN_ANNO,
      produced_quantity_kg: producidoKg,
    }).select("id").single();
    assert(!eB && ob, `lote de salida ${etiqueta}: ${eB?.message}`);
    return ob!.id as string;
  }

  async function calcular(outputBatchId: string): Promise<Calc> {
    const { data, error } = await cli.rpc("calculate_recycled_content_v2",
      { p_output_batch_id: outputBatchId });
    assert(!error, `calcular: ${error?.message}`);
    return data as unknown as Calc;
  }

  const virgen  = await material("Virgen", "virgin", false);
  const post    = await material("Postconsumo", "postconsumer_valid", true);
  const postSin = await material("PostconsumoSinSoporte", "postconsumer_valid", false);
  const otro    = await material("Otro", "other", true);
  const preInd  = await material("Postindustrial", "postindustrial", true);

  // -------------------------------------------------------------------------
  await check("A. Material 100 % virgen → CALCULATED con 0 %", async () => {
    const b = await corrida("A", [{ materialId: virgen, kg: 100 }]);
    const r = await calcular(b);
    assert(r.result_state === "calculated", `salió ${r.result_state}: ${r.incomplete_reasons}`);
    assert(Number(r.recycled_percent) === 0, `se esperaba 0 %, dio ${r.recycled_percent}`);
    assert(Number(r.total_mass_kg) === 100, "el denominador es lo consumido");
    assert(r.methodology_version === 2, "debía usar la v2");
  });

  await check("B. Material reciclado con fracción 100 → CALCULATED con 100 %", async () => {
    const b = await corrida("B", [{ materialId: post, kg: 100, fraccion: 100 }]);
    const r = await calcular(b);
    assert(r.result_state === "calculated", `salió ${r.result_state}: ${r.incomplete_reasons}`);
    assert(Number(r.recycled_percent) === 100, `se esperaba 100 %, dio ${r.recycled_percent}`);
  });

  await check("C. Fracción parcial → el porcentaje la respeta", async () => {
    const b = await corrida("C", [{ materialId: post, kg: 100, fraccion: 60 }]);
    const r = await calcular(b);
    assert(r.result_state === "calculated", `salió ${r.result_state}`);
    assert(Number(r.recycled_percent) === 60, `se esperaba 60 %, dio ${r.recycled_percent}`);
  });

  await check("D. Declarado reciclado SIN fracción → INCOMPLETE, ni 0 ni 100", async () => {
    // PT-H02 · La etiqueta binaria no implica 100 %. Este es el corazón.
    const b = await corrida("D", [{ materialId: post, kg: 100 }]);
    const r = await calcular(b);
    assert(r.result_state === "incomplete", `v1 habría dado 100 %; v2 salió ${r.result_state}`);
    assert(r.recycled_percent === null, "un incompleto NO escribe porcentaje");
    assert(r.incomplete_reasons.some((x) => x.startsWith("fraction_unknown")),
      `motivo inesperado: ${r.incomplete_reasons}`);
  });

  await check("E. Evidencia vencida HOY pero vigente al recibir el lote → cuenta", async () => {
    const haceSeisMeses = new Date(Date.now() - 182 * 864e5).toISOString().slice(0, 10);
    const { data: m } = await cli.from("materials")
      .insert({ organization_id: org, name: `E ${stamp}`, classification_code: "postconsumer_valid" })
      .select("id").single();
    const { data: ev } = await cli.from("evidences").insert({
      organization_id: org, name: `Ev E ${stamp}`, evidence_type: "origin_supplier",
      valid_until: haceSeisMeses }).select("id").single();
    await cli.from("evidences").update({ status: "valid" }).eq("id", ev!.id);
    await cli.from("materials").update({ origin_support_evidence_id: ev!.id }).eq("id", m!.id);
    const b = await corrida("E", [{ materialId: m!.id as string, kg: 100, fraccion: 50 }]);
    const r = await calcular(b);
    assert(r.result_state === "calculated",
      `debía contar: se juzga contra ${HACE_UN_ANNO}, no contra hoy. Salió ${r.incomplete_reasons}`);
    assert(Number(r.recycled_percent) === 50, `se esperaba 50 %, dio ${r.recycled_percent}`);
  });

  await check("F. Evidencia no aceptada internamente → no sostiene nada", async () => {
    const { data: m } = await cli.from("materials")
      .insert({ organization_id: org, name: `F ${stamp}`, classification_code: "postconsumer_valid" })
      .select("id").single();
    const { data: ev } = await cli.from("evidences").insert({
      organization_id: org, name: `Ev F ${stamp}`, evidence_type: "origin_supplier" })
      .select("id").single();           // se queda en 'pending'
    await cli.from("materials").update({ origin_support_evidence_id: ev!.id }).eq("id", m!.id);
    const b = await corrida("F", [{ materialId: m!.id as string, kg: 100, fraccion: 80 }]);
    const r = await calcular(b);
    assert(r.result_state === "incomplete", `una evidencia pendiente no sostiene: ${r.result_state}`);
    assert(r.incomplete_reasons.some((x) => x.startsWith("no_applicable_support")),
      `motivo inesperado: ${r.incomplete_reasons}`);
  });

  await check("G. Vínculo confirmado al LOTE: se usa y se anota como tal", async () => {
    const { data: m } = await cli.from("materials")
      .insert({ organization_id: org, name: `G ${stamp}`, classification_code: "postconsumer_valid" })
      .select("id").single();
    const { data: o } = await cli.from("production_orders")
      .insert({ organization_id: org, order_code: `OC-G-${stamp}`, order_date: HACE_UN_ANNO })
      .select("id").single();
    const { data: lote } = await cli.from("input_batches").insert({
      organization_id: org, supplier_id: sup!.id, material_id: m!.id,
      batch_code: `LE-G-${stamp}`, received_date: HACE_UN_ANNO, quantity_kg: 100,
      recycled_fraction: 40, recycled_fraction_basis: "certificado del lote",
    }).select("id").single();
    const { data: ev } = await cli.from("evidences").insert({
      organization_id: org, name: `Ev G ${stamp}`, evidence_type: "origin_supplier" })
      .select("id").single();
    await cli.from("evidences").update({ status: "valid" }).eq("id", ev!.id);
    // La vía fuerte: confirmación humana con instantánea histórica (PT-01).
    const { error: eLink } = await cli.rpc("evidence_link_confirm", {
      p_evidence_id: ev!.id, p_target_type: "input_batch", p_target_id: lote!.id,
      p_link_role: "soporte de origen", p_confirmed: true });
    assert(!eLink, `confirmar el vínculo: ${eLink?.message}`);
    await cli.from("batch_consumption").insert({
      organization_id: org, production_order_id: o!.id, input_batch_id: lote!.id, mass_kg: 100 });
    const { data: ob } = await cli.from("output_batches").insert({
      organization_id: org, production_order_id: o!.id, batch_code: `LS-G-${stamp}`,
      produced_date: HACE_UN_ANNO, produced_quantity_kg: 100 }).select("id").single();

    const r = await calcular(ob!.id as string);
    assert(r.result_state === "calculated", `salió ${r.result_state}: ${r.incomplete_reasons}`);
    assert(Number(r.recycled_percent) === 40, `se esperaba 40 %, dio ${r.recycled_percent}`);
    const comp = (r.components as Array<{ evidence_basis: string }>)[0];
    assert(comp.evidence_basis === "input_batch_confirmed_link",
      `debía anotar la vía fuerte, anotó ${comp.evidence_basis}`);
  });

  await check("G2. Soporte SOLO de material: cuenta, y se anota que no tiene instantánea", async () => {
    const b = await corrida("G2", [{ materialId: post, kg: 100, fraccion: 30 }]);
    const r = await calcular(b);
    assert(r.result_state === "calculated", `salió ${r.result_state}: ${r.incomplete_reasons}`);
    const comp = (r.components as Array<{ evidence_basis: string }>)[0];
    assert(comp.evidence_basis === "material_support_no_snapshot",
      `debía anotar la vía débil, anotó ${comp.evidence_basis}`);
  });

  await check("H. Lote consumido parcialmente: entra lo CONSUMIDO, no lo recibido", async () => {
    const { data: o } = await cli.from("production_orders")
      .insert({ organization_id: org, order_code: `OC-H-${stamp}`, order_date: HACE_UN_ANNO })
      .select("id").single();
    const { data: lote } = await cli.from("input_batches").insert({
      organization_id: org, supplier_id: sup!.id, material_id: post,
      batch_code: `LE-H-${stamp}`, received_date: HACE_UN_ANNO, quantity_kg: 500,
      recycled_fraction: 100, recycled_fraction_basis: "certificado",
    }).select("id").single();
    await cli.from("batch_consumption").insert({
      organization_id: org, production_order_id: o!.id, input_batch_id: lote!.id, mass_kg: 40 });
    const { data: ob } = await cli.from("output_batches").insert({
      organization_id: org, production_order_id: o!.id, batch_code: `LS-H-${stamp}`,
      produced_date: HACE_UN_ANNO, produced_quantity_kg: 40 }).select("id").single();
    const r = await calcular(ob!.id as string);
    assert(Number(r.total_mass_kg) === 40,
      `el denominador debía ser lo consumido (40), fue ${r.total_mass_kg}`);
    assert(Number(r.recycled_percent) === 100, "y el porcentaje, 100");
  });

  await check("I. Varios lotes del MISMO material, cada uno con su fracción", async () => {
    // Es la ganancia principal de v2: la fracción es del lote, no del catálogo.
    const b = await corrida("I", [
      { materialId: post, kg: 50, fraccion: 100 },
      { materialId: post, kg: 50, fraccion: 0 },
    ]);
    const r = await calcular(b);
    assert(r.result_state === "calculated", `salió ${r.result_state}: ${r.incomplete_reasons}`);
    assert(Number(r.recycled_percent) === 50,
      `50 kg al 100 % y 50 al 0 % son 50 %, dio ${r.recycled_percent}`);
  });

  await check("J. Mezcla de virgen y reciclado: suma ponderada", async () => {
    const b = await corrida("J", [
      { materialId: virgen, kg: 70 },
      { materialId: post, kg: 30, fraccion: 100 },
    ]);
    const r = await calcular(b);
    assert(r.result_state === "calculated", `salió ${r.result_state}: ${r.incomplete_reasons}`);
    assert(Number(r.recycled_percent) === 30, `se esperaba 30 %, dio ${r.recycled_percent}`);
  });

  await check("K. Reproceso interno: entra al denominador con φ = 0", async () => {
    const b = await corrida("K", [{ materialId: post, kg: 50, fraccion: 100 }]);
    // Un lote de salida anterior se reconsume en ESTA orden.
    const { data: ob } = await cli.from("output_batches").select("production_order_id").eq("id", b).single();
    // El lote previo debe haber PRODUCIDO al menos lo que se le va a reconsumir:
    // la guarda de saldo de 0105 lo impide, y hace bien.
    const previo = await corrida("Kprev", [{ materialId: virgen, kg: 50 }], 50);
    const { error } = await cli.from("output_batch_consumption").insert({
      organization_id: org, production_order_id: ob!.production_order_id,
      output_batch_id: previo, mass_kg: 50 });
    assert(!error, `reconsumo: ${error?.message}`);
    const r = await calcular(b);
    assert(r.result_state === "calculated", `salió ${r.result_state}: ${r.incomplete_reasons}`);
    assert(Number(r.total_mass_kg) === 100, `50 + 50 de reproceso = 100, fue ${r.total_mass_kg}`);
    assert(Number(r.recycled_percent) === 50,
      `el reproceso no cuenta como reciclado: se esperaba 50 %, dio ${r.recycled_percent}`);
  });

  await check("L. Clasificación «other»: no demuestra nada → INCOMPLETE", async () => {
    // PT-H02 · «other» no autoriza a resolver como cero.
    const b = await corrida("L", [{ materialId: otro, kg: 100 }]);
    const r = await calcular(b);
    assert(r.result_state === "incomplete", `«other» no puede dar un número: ${r.result_state}`);
    assert(r.incomplete_reasons.some((x) => x.startsWith("classification_other")),
      `motivo inesperado: ${r.incomplete_reasons}`);
  });


  // -------------------------------------------------------------------------
  // P4 · La regresión del defecto encontrado en validación humana
  // -------------------------------------------------------------------------
  await check("P4-a. SIN composición manual, con consumos y φ=60 → CALCULATED 60 %", async () => {
    // El defecto: la pantalla decía «Trazabilidad incompleta · Falta:
    // composición del lote» y ofrecía el formulario de composición. El motor
    // nunca la necesitó; era la interfaz la que la pedía. Esta prueba fija que
    // el motor no la necesita, para que nadie la reintroduzca como requisito.
    const b = await corrida("P4A", [{ materialId: post, kg: 100, fraccion: 60 }]);
    const { data: comp } = await cli.from("batch_composition").select("id").eq("output_batch_id", b);
    assert((comp ?? []).length === 0, "el fixture debe NO tener composición manual");
    const r = await calcular(b);
    assert(r.result_state === "calculated",
      `salió ${r.result_state}: ${JSON.stringify(r.incomplete_reasons)}`);
    assert(Number(r.recycled_percent) === 60, `se esperaba 60 %, dio ${r.recycled_percent}`);
    assert(!r.incomplete_reasons.some((x) => /composi/i.test(x)),
      `ningún motivo puede hablar de composición: ${r.incomplete_reasons}`);
  });

  await check("P4-b. SIN composición y SIN producto asociado: calcula igual", async () => {
    // «Sin producto asociado» aparecía en la misma pantalla y podía leerse como
    // otra carencia. El producto solo aporta `declared_recycled_percent`, que
    // v2 usa para AVISAR; no entra en numerador ni denominador.
    const b = await corrida("P4B", [{ materialId: post, kg: 100, fraccion: 25 }]);
    const { data: ob } = await cli.from("output_batches").select("product_id").eq("id", b).single();
    assert(ob!.product_id === null, "el fixture debe NO tener producto");
    const r = await calcular(b);
    assert(r.result_state === "calculated", `salió ${r.result_state}: ${r.incomplete_reasons}`);
    assert(Number(r.recycled_percent) === 25, `se esperaba 25 %, dio ${r.recycled_percent}`);
  });

  await check("P4-c. SIN composición y φ desconocida → INCOMPLETE por la FRACCIÓN", async () => {
    const b = await corrida("P4C", [{ materialId: post, kg: 100 }]);
    const r = await calcular(b);
    assert(r.result_state === "incomplete", `debía salir incompleto, salió ${r.result_state}`);
    assert(r.incomplete_reasons.some((x) => x.startsWith("fraction_unknown")),
      `el motivo debía ser la fracción: ${r.incomplete_reasons}`);
    // Y jamás por composición: ese era exactamente el mensaje equivocado.
    assert(!r.incomplete_reasons.some((x) => /composi/i.test(x)),
      `apareció un motivo de composición: ${r.incomplete_reasons}`);
    assert(r.recycled_percent === null, "ni 0 % ni 100 %");
  });

  await check("P4-d. La composición manual ya no se puede escribir, y el cálculo no la mira", async () => {
    // Antes esta comprobación tecleaba una composición absurda —999 kg— y
    // exigía que el resultado no se moviera. 0147 cierra la escritura, así que
    // ahora se comprueban las dos mitades: que la puerta está cerrada y que el
    // número sigue saliendo del consumo.
    const b = await corrida("P4D", [{ materialId: post, kg: 100, fraccion: 40 }]);
    const antes = await calcular(b);
    assert(Number(antes.recycled_percent) === 40, `antes: ${antes.recycled_percent}`);
    const { data: escrita, error } = await cli.from("batch_composition")
      .insert({ organization_id: org, output_batch_id: b, material_id: post, mass_kg: 999 })
      .select();
    assert(error || (escrita ?? []).length === 0,
      "un cliente pudo escribir composición: 0147 debía cerrar esa ruta");
    const despues = await calcular(b);
    assert(Number(despues.recycled_percent) === 40,
      `el resultado se movió sin que cambiaran los consumos: ${despues.recycled_percent}`);
    assert(Number(despues.total_mass_kg) === 100,
      `el denominador no salió del consumo: ${despues.total_mass_kg}`);
  });

  // -------------------------------------------------------------------------
  // PT-H05 · el reparto que no se inventa
  // -------------------------------------------------------------------------
  await check("M. Orden con VARIOS lotes de salida → INCOMPLETE, sin prorratear", async () => {
    const b = await corrida("M", [{ materialId: post, kg: 100, fraccion: 100 }]);
    const { data: ob } = await cli.from("output_batches").select("production_order_id").eq("id", b).single();
    await cli.from("output_batches").insert({
      organization_id: org, production_order_id: ob!.production_order_id,
      batch_code: `LS-M2-${stamp}`, produced_date: HACE_UN_ANNO, produced_quantity_kg: 50 });
    const r = await calcular(b);
    assert(r.result_state === "incomplete",
      "sin atribución de consumos no se puede repartir sin inventarlo");
    assert(r.incomplete_reasons.includes("multiple_output_batches_without_allocation"),
      `motivo inesperado: ${r.incomplete_reasons}`);
    assert(r.recycled_percent === null, "y no escribe número");
  });

  await check("N. Sin consumos registrados → INCOMPLETE, no cero", async () => {
    const { data: o } = await cli.from("production_orders")
      .insert({ organization_id: org, order_code: `OC-N-${stamp}`, order_date: HACE_UN_ANNO })
      .select("id").single();
    const { data: ob } = await cli.from("output_batches").insert({
      organization_id: org, production_order_id: o!.id, batch_code: `LS-N-${stamp}`,
      produced_date: HACE_UN_ANNO, produced_quantity_kg: 10 }).select("id").single();
    const r = await calcular(ob!.id as string);
    assert(r.result_state === "incomplete", `sin consumos no hay porcentaje: ${r.result_state}`);
    assert(r.incomplete_reasons.includes("no_consumption_recorded"), `${r.incomplete_reasons}`);
  });

  // -------------------------------------------------------------------------
  // PT-H01 y PT-H03 · el pasado
  // -------------------------------------------------------------------------
  await check("O. No queda un segundo motor: hay UN camino de cálculo", async () => {
    // La comprobación decía «v1 sigue existiendo y calcula igual». 0147 retiró
    // ese motor: ninguna empresa real lo usó y Production nunca recibió la
    // convivencia, así que perpetuarlo habría sido pagar compatibilidad con
    // nadie. Lo que se comprueba ahora es que NO se puede llamar.
    const b = await corrida("O", [{ materialId: post, kg: 100, fraccion: 100 }]);
    const { error: e1 } = await cli.rpc("calculate_recycled_content", { p_output_batch_id: b });
    assert(e1 !== null, "la función del motor retirado sigue siendo invocable");

    // Y el que queda apunta a la metodología canónica, no a «la activa».
    const { data: canon, error: eCanon } = await cli.rpc("recycled_content_canonical_methodology");
    assert(!eCanon && canon, `no se pudo leer la metodología canónica: ${eCanon?.message}`);
    assert(Number((canon as { version: number }).version) === 2,
      `la canónica debía ser la 2, es la ${(canon as { version: number }).version}`);
    const r = await calcular(b);
    assert(r.methodology_version === 2, `el cálculo debía estampar la 2, estampó ${r.methodology_version}`);
    assert(Number(r.recycled_percent) === 100, `esperado 100 %, dio ${r.recycled_percent}`);
  });

  await check("P. Un cálculo emitido es INMUTABLE (PT-H01)", async () => {
    const b = await corrida("P", [{ materialId: post, kg: 100, fraccion: 25 }]);
    const r = await calcular(b);
    const { data: fila } = await cli.from("recycled_content_calculations")
      .select("id").eq("output_batch_id", b).single();
    const { error } = await cli.from("recycled_content_calculations")
      .update({ recycled_percent: 99 }).eq("id", fila!.id);
    assert(error, "un cálculo histórico no puede reescribirse");
    const { data: sigue } = await cli.from("recycled_content_calculations")
      .select("recycled_percent").eq("id", fila!.id).single();
    assert(Number(sigue!.recycled_percent) === Number(r.recycled_percent), "el número cambió");
  });

  await check("Q. Rechazar la evidencia después NO reescribe el cálculo emitido", async () => {
    // El recálculo posterior puede dar otra cosa; el histórico no se toca.
    const { data: m } = await cli.from("materials")
      .insert({ organization_id: org, name: `Q ${stamp}`, classification_code: "postconsumer_valid" })
      .select("id").single();
    const { data: ev } = await cli.from("evidences").insert({
      organization_id: org, name: `Ev Q ${stamp}`, evidence_type: "origin_supplier" })
      .select("id").single();
    await cli.from("evidences").update({ status: "valid" }).eq("id", ev!.id);
    await cli.from("materials").update({ origin_support_evidence_id: ev!.id }).eq("id", m!.id);
    const b = await corrida("Q", [{ materialId: m!.id as string, kg: 100, fraccion: 70 }]);
    const antes = await calcular(b);
    assert(antes.result_state === "calculated" && Number(antes.recycled_percent) === 70, "el primero");

    await cli.from("evidences")
      .update({ status: "rejected", review_comment: "resultó falsa" }).eq("id", ev!.id);

    const { data: historico } = await cli.from("recycled_content_calculations")
      .select("recycled_percent, result_state").eq("output_batch_id", b)
      .order("calculated_at", { ascending: true }).limit(1).single();
    assert(Number(historico!.recycled_percent) === 70,
      "el cálculo histórico cambió: el pasado se reescribió");

    const despues = await calcular(b);
    assert(despues.result_state === "incomplete",
      "un recálculo posterior sí debe reflejar que la evidencia ya no sostiene");
  });

  await check("R. La base IMPIDE escribir un incompleto con número", async () => {
    // La garantía no es del código: es del CHECK. Se prueba saltándose el código.
    const { error } = await admin.from("recycled_content_calculations").insert({
      organization_id: org, output_batch_id: (await corrida("R", [{ materialId: virgen, kg: 1 }])),
      methodology_id: (await admin.from("calculation_methodologies")
        .select("id").eq("version", 2).single()).data!.id,
      methodology_rules_snapshot: {}, result_state: "incomplete",
      incomplete_reasons: ["inventado"], recycled_percent: 42,
      total_mass_kg: 1, recycled_mass_kg: 0,
      defensibility_level: "preliminary", components: [], calculated_by: u.user!.id,
    });
    assert(error, "un incompleto con porcentaje debía rechazarse");
    assert(/state_consistent/.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("S. Otra empresa no puede calcular sobre este lote", async () => {
    const otroEmail = `pt02a-b-${stamp}@test.trazaloop.dev`;
    const { data: u2 } = await admin.auth.admin.createUser({
      email: otroEmail, password, email_confirm: true, user_metadata: { full_name: "QA b" } });
    assert(u2.user, "segundo usuario");
    const c2 = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
    await c2.auth.signInWithPassword({ email: otroEmail, password });
    const b = await corrida("S", [{ materialId: virgen, kg: 10 }]);
    const { error } = await c2.rpc("calculate_recycled_content_v2", { p_output_batch_id: b });
    assert(error, "una empresa no puede calcular sobre lotes de otra");
    assert(/miembro activo/i.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });


  await check("T. Los movimientos de inventario NO tocan el contenido reciclado", async () => {
    // La separación que PT-02B.1 vino a hacer visible en la pantalla también
    // tiene que ser cierta en la base: el porcentaje es una propiedad de lo
    // que ENTRÓ a fabricar el lote, no de lo que queda en el almacén.
    // Despachar, perder o ajustar no puede mover ni un decimal.
    const b = await corrida("T", [{ materialId: post, kg: 60, fraccion: 100 },
                                   { materialId: virgen, kg: 40 }]);
    const antes = await calcular(b);
    assert(Number(antes.recycled_percent) === 60, `esperado 60 %, dio ${antes.recycled_percent}`);

    const mover = (kind: string, qty: number, extra: Record<string, unknown> = {}) =>
      cli.from("output_batch_movements").insert({
        organization_id: org, output_batch_id: b, movement_kind: kind,
        quantity: qty, unit_code: "kg", ...extra });

    assert(!(await mover("dispatch", 30)).error, "el despacho debía registrarse");
    assert(!(await mover("loss", 5, { reason: "rotura" })).error, "la merma debía registrarse");
    assert(!(await mover("adjustment", 2, {
      direction: "out", reason: "recuento físico",
      counted_quantity: 63, theoretical_quantity_at_count: 65 })).error,
      "el recuento debía registrarse");

    const { data: st } = await cli.from("v_output_batch_stock")
      .select("available_kg").eq("output_batch_id", b).single();
    assert(Number(st!.available_kg) === 63, `el saldo sí cambia: 100−30−5−2 = 63, dio ${st!.available_kg}`);

    // El cálculo emitido no se toca…
    const { data: emitido } = await cli.from("v_latest_batch_recycled")
      .select("recycled_percent").eq("output_batch_id", b).single();
    assert(Number(emitido!.recycled_percent) === 60,
      `el cálculo emitido cambió: ${emitido!.recycled_percent}`);

    // …y recalcular después de las salidas da exactamente lo mismo.
    const despues = await calcular(b);
    assert(Number(despues.recycled_percent) === 60,
      `recalcular tras los movimientos dio ${despues.recycled_percent}`);
    assert(Number(despues.total_mass_kg) === 100,
      `el denominador salió del inventario en vez del consumo: ${despues.total_mass_kg}`);
  });


  await check("U. Un cálculo nuevo NO reescribe el dossier del anterior", async () => {
    // Historical Truth del expediente, contra la base. El motor ya garantiza
    // que la fila del cálculo es inmutable (caso P); esto comprueba lo que la
    // gente hace de verdad: abrir el dossier de un cálculo VIEJO después de
    // haber recalculado, y que siga diciendo lo que dijo.
    const b = await corrida("U", [{ materialId: post, kg: 60, fraccion: 100 },
                                   { materialId: virgen, kg: 40 }]);
    const uno = await calcular(b);
    assert(Number(uno.recycled_percent) === 60, `primer cálculo: ${uno.recycled_percent}`);

    const leer = async (id: string) => {
      const { data } = await cli.from("v_calculation_dossier")
        .select("recycled_percent, total_mass_kg, recycled_mass_kg, defensibility_level, calculated_at")
        .eq("calculation_id", id).single();
      return JSON.stringify(data);
    };
    const componentes = async (id: string) => {
      const { data } = await cli.from("v_calculation_component_rows")
        .select("material_name, mass_kg, phi, counted")
        .eq("calculation_id", id).order("component_index");
      return JSON.stringify(data);
    };
    const dossierAntes = await leer(uno.id);
    const compAntes = await componentes(uno.id);

    // Cambia el mundo: más consumo virgen, y el porcentaje baja.
    const { data: ob } = await cli.from("output_batches")
      .select("production_order_id").eq("id", b).single();
    const { data: le } = await cli.from("input_batches").insert({
      organization_id: org, supplier_id: sup!.id, material_id: virgen,
      batch_code: `LE-U3-${stamp}`, received_date: HACE_UN_ANNO, quantity_kg: 40 })
      .select("id").single();
    await cli.from("batch_consumption").insert({
      organization_id: org, production_order_id: ob!.production_order_id,
      input_batch_id: le!.id, mass_kg: 40 });
    await cli.from("output_batches").update({ produced_quantity_kg: 140 }).eq("id", b);

    const dos = await calcular(b);
    assert(dos.id !== uno.id, "recalcular debía crear un snapshot NUEVO");
    assert(Number(dos.recycled_percent) !== 60,
      `el segundo cálculo debía dar otra cosa, dio ${dos.recycled_percent}`);

    // Y el primero sigue exactamente igual.
    assert(await leer(uno.id) === dossierAntes,
      "el dossier del primer cálculo se reescribió al emitir el segundo");
    assert(await componentes(uno.id) === compAntes,
      "los componentes del primer cálculo se reescribieron");

    // Los dos coexisten, cada uno con su identificador.
    const { data: ambos } = await cli.from("v_calculation_dossier")
      .select("calculation_id").eq("output_batch_id", b);
    assert((ambos ?? []).length === 2, `debían coexistir 2 dossiers, hay ${ambos?.length}`);
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
