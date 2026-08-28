/**
 * Trazaloop · PCR/TEXTILES PRE-INTEGRATION · §6
 * Verificación ESTRUCTURAL de un entorno a partir de su volcado de esquema.
 *
 *   npx supabase db dump --project-ref <REF> --schema public --keep-comments -f /tmp/esquema.sql
 *   node scripts/verify-schema-dump.mjs /tmp/esquema.sql
 *
 * QUÉ DEMUESTRA Y QUÉ NO
 *
 * Demuestra que el ESQUEMA aplicado es el esperado: columnas, restricciones,
 * políticas, disparadores, cuerpos de función y opciones de vista. No
 * demuestra comportamiento con datos: eso son las suites contra base, que
 * necesitan las claves del entorno.
 *
 * Es lo que se puede verificar de un entorno remoto sin más credenciales que
 * las que el CLI ya tiene.
 *
 * Solo lectura. El volcado ya se hizo con `supabase db dump --project-ref`;
 * esto no toca la base.
 *
 * pg_dump ENTRECOMILLA todos los identificadores —`"public"."evidence_links"`—
 * así que lo primero es quitar las comillas: sin eso, cualquier patrón escrito
 * como se escribe el SQL a mano falla, y falla en silencio dando la impresión
 * de que el objeto no existe.
 */
import { readFileSync } from "node:fs";

const CRUDO = readFileSync(process.argv[2], "utf8");
/** Sin comillas de identificador. */
const S = CRUDO.replace(/"/g, "");

let ok = 0, mal = 0;
const check = (n, cond, detalle = "") => {
  if (cond) { ok += 1; console.log(`  ✔ ${n}`); }
  else { mal += 1; console.error(`  ✘ ${n}${detalle ? " — " + detalle : ""}`); }
};
/** El cuerpo de una función, desde su cabecera hasta el fin del bloque. */
function funcion(nombre) {
  const i = S.indexOf(`FUNCTION public.${nombre}(`);
  if (i < 0) return "";
  const fin = S.indexOf("$$;", i);
  return S.slice(i, fin < 0 ? i + 20000 : fin);
}
/** La definición de una vista, desde su cabecera hasta el punto y coma. */
function vista(nombre) {
  const i = S.indexOf(`VIEW public.${nombre}`);
  if (i < 0) return "";
  const fin = S.indexOf(";", i);
  return S.slice(i, fin < 0 ? i + 20000 : fin);
}
/** El bloque CREATE TABLE de una tabla. */
function tabla(nombre) {
  const i = S.indexOf(`CREATE TABLE IF NOT EXISTS public.${nombre} (`);
  if (i < 0) return "";
  return S.slice(i, S.indexOf("\n);", i));
}

console.log("\n§6 · Verificación estructural de Staging (esquema real volcado)\n");

// ---------------------------------------------------------------- A
const links = tabla("evidence_links");
const COLS = ["confirmed_at", "confirmed_by", "reference_date",
  "evidence_status_at_confirmation", "evidence_valid_until_at_confirmation",
  "applicability_basis"];
check("A · evidence_links tiene las seis columnas de instantánea",
  links !== "" && COLS.every((c) => links.includes(c)),
  links === "" ? "no se encontró la tabla" : COLS.filter((c) => !links.includes(c)).join(", "));
const confirm = funcion("evidence_link_confirm");
check("A · evidence_link_confirm existe y es SECURITY DEFINER",
  confirm !== "" && /SECURITY DEFINER/i.test(confirm));
check("A · evidence_target_reference_date existe",
  funcion("evidence_target_reference_date") !== "");

// ---------------------------------------------------------------- B
check("B · evidence_links NO tiene política de INSERT (la puerta cerrada)",
  S.includes("CREATE POLICY evidence_links_select ON public.evidence_links") &&
  !S.includes("CREATE POLICY evidence_links_insert ON public.evidence_links"));
check("B · output_batch_movements bloquea el DELETE con disparador",
  funcion("output_batch_movements_no_delete") !== "" &&
  /BEFORE DELETE ON public\.output_batch_movements/i.test(S));
check("B · y no tiene política de DELETE",
  !/CREATE POLICY output_batch_movements_delete/i.test(S));

// ---------------------------------------------------------------- C
check("C · la confirmación exige aceptación interna",
  /status <> 'valid'/.test(confirm));
check("C · juzga la vigencia contra la FECHA DEL DESTINO, no contra hoy",
  /valid_until < v_ref/.test(confirm) && !/valid_until < current_date/.test(confirm));
check("C · exige confirmación humana explícita",
  /coalesce\(p_confirmed, false\)/.test(confirm));
check("C · y bloquea las evidencias archivadas",
  /archived_at is not null/.test(confirm));

// ---------------------------------------------------------------- D
const TABLAS_U = ["textile_input_lots", "textile_order_consumptions",
  "textile_output_lots", "textile_production_orders"];
check("D · unit_code en las cuatro tablas textiles",
  TABLAS_U.every((t) => S.includes(`${t}_unit_code_check`)),
  TABLAS_U.filter((t) => !S.includes(`${t}_unit_code_check`)).join(", "));
check("D · el CHECK admite exactamente los nueve códigos",
  /unit_code = ANY \(ARRAY\['kg'::text, 'g'::text, 'ton'::text, 'm'::text, 'cm'::text, 'm2'::text, 'unit'::text, 'roll'::text, 'other'::text\]\)/.test(S));
check("D · textile_canonical_unit existe y es inmutable",
  /FUNCTION public\.textile_canonical_unit[\s\S]{0,400}?IMMUTABLE/i.test(S));

// ---------------------------------------------------------------- E
const guardaTex = funcion("guard_textile_lot_overconsumption");
check("E · la guarda textil bloquea la fila (FOR UPDATE)", /for update/i.test(guardaTex));
check("E · rechaza unidades no comparables en vez de saltarse la comprobación",
  /no convierte unidades/.test(guardaTex));
check("E · usa el errcode 23514, como PCR", /errcode = '23514'/.test(guardaTex));
check("E · y «other» no puede comprometer un saldo",
  /no participa en saldos/.test(guardaTex));

// ---------------------------------------------------------------- F
const v2 = funcion("calculate_recycled_content_v2");
check("F · calculate_recycled_content_v2 existe", v2 !== "");
check("F · v1 sigue existiendo y sin tocar",
  funcion("calculate_recycled_content") !== "");
check("F · v2 lee los CONSUMOS, no la composición",
  /from public\.batch_consumption/i.test(v2) && !/from public\.batch_composition/i.test(v2));
check("F · y no prorratea entre lotes de salida",
  /multiple_output_batches_without_allocation/.test(v2));
check("F · la fracción sin declarar deja el cálculo incompleto",
  /recycled_fraction is null/.test(v2) && /fraction_unknown/.test(v2));

// ---------------------------------------------------------------- G
check("G · el CHECK impide un incompleto con número",
  /recycled_calc_state_consistent/.test(S) &&
  /result_state = 'incomplete'::text\) AND \(recycled_percent IS NULL\)/.test(S));
check("G · y un calculado sin número",
  /result_state = 'calculated'::text\) AND \(recycled_percent IS NOT NULL\)/.test(S));
check("G · input_batches tiene la fracción y exige su procedencia",
  S.includes("input_batches_recycled_fraction_range") &&
  S.includes("input_batches_recycled_fraction_basis"));

// ---------------------------------------------------------------- H
const invTex = vista("v_textile_material_inventory");
check("H · v_textile_material_inventory existe", invTex !== "");
check("H · agrupa por (material, UNIDAD)", /GROUP BY[^;]*unit_code/i.test(invTex));
check("H · y expone lo que NO pudo restar", /unmatched_consumptions/.test(invTex));

// ---------------------------------------------------------------- I
const mov = tabla("output_batch_movements");
check("I · la tabla output_batch_movements existe", mov !== "");
check("I · cantidad siempre positiva y el signo en `direction`",
  S.includes("output_batch_movements_quantity_positive") &&
  S.includes("output_batch_movements_direction_kind"));
check("I · perder o ajustar exige motivo",
  S.includes("output_batch_movements_reason_required"));
check("I · la guarda de saldo bloquea la fila",
  /for update/i.test(funcion("output_batch_movement_guard")));

// ---------------------------------------------------------------- J
check("J · el linaje de corrección está completo",
  ["corrects_movement_id", "superseded_by_movement_id", "correction_reason", "is_current"]
    .every((c) => mov.includes(c)));
check("J · corregir exige motivo y superado ⇒ no vigente",
  S.includes("output_batch_movements_correction_reason") &&
  S.includes("output_batch_movements_current_consistent"));
const corr = funcion("correct_output_batch_movement");
check("J · correct_output_batch_movement INSERTA en vez de editar",
  corr !== "" && /insert into public\.output_batch_movements/i.test(corr));
check("J · y retira el original ANTES de insertar la corrección",
  corr.indexOf("set is_current = false") >= 0 &&
  corr.indexOf("set is_current = false") < corr.indexOf("insert into public.output_batch_movements"));

// ---------------------------------------------------------------- K
const stock = vista("v_output_batch_stock");
check("K · v_output_batch_stock descuenta las cuatro salidas y el reproceso",
  stock !== "" &&
  ["dispatched_kg", "lost_kg", "internal_use_kg", "adjustment_kg", "reprocessed_kg"]
    .every((c) => stock.includes(c)));
check("K · y cuenta los movimientos, para distinguir «no hay» de «no se registró»",
  /movements_count/.test(stock));

// ---------------------------------------------------------------- L
const VISTAS = ["v_textile_input_lot_balance", "v_textile_material_inventory",
  "v_latest_batch_recycled", "v_output_batch_stock",
  "v_material_inventory", "v_input_batch_inventory"];
for (const v of VISTAS) {
  const d = vista(v);
  const cabecera = d.slice(0, d.indexOf(" AS") + 3);
  check(`L · ${v} declara security_invoker`,
    d !== "" && /security_invoker\s*=\s*'?true'?/i.test(cabecera),
    d === "" ? "la vista no está en el volcado" : "sin security_invoker: se saltaría la RLS");
}
check("L · output_batch_movements tiene RLS y sus tres políticas",
  /ALTER TABLE public\.output_batch_movements ENABLE ROW LEVEL SECURITY/i.test(S) &&
  /CREATE POLICY output_batch_movements_select/i.test(S) &&
  /CREATE POLICY output_batch_movements_insert/i.test(S) &&
  /CREATE POLICY output_batch_movements_update/i.test(S));

console.log(`\n  ${ok} correctas, ${mal} fallidas\n`);
process.exit(mal === 0 ? 0 : 1);
