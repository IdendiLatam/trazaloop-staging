import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { limpiarFixtures, describirResiduo, tasaCanonicaQA } from "../support/fixture-cleanup";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · PROD-LAUNCH-01B · Bajar a Free no es perder nada.
 *
 *
 * LA PROMESA QUE ESTO DEFIENDE
 *
 * Cuando el periodo Full termina, la empresa vuelve a Free. Vuelve, no cae:
 * sus documentos, sus evidencias, su configuración y su historia siguen ahí,
 * y puede consultarlos, descargarlos y borrarlos. Lo único que no puede es
 * CRECER por encima del cupo.
 *
 * Esa distinción —entre no dejar subir y borrar lo subido— es la diferencia
 * entre un plan gratuito y un rehén. Un producto que borra datos al vencer un
 * pago no se puede recomendar a nadie, y quien lo descubra el día del
 * vencimiento no vuelve.
 *
 * Se prueba contra la base porque es una promesa sobre datos, no sobre
 * pantallas.
 *
 * Correr: npm run test:pl01b-free-db
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;
if (!URL || !SERVICE || !ANON || !DB_URL) {
  console.log("faltan credenciales locales en .env.local");
  process.exit(1);
}

const admin: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });
let passed = 0, failed = 0;
const sello = Date.now();
const personas: string[] = [];
const orgs: string[] = [];

async function check(nombre: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

const CLAVE = "Trazaloop-Test-1234";

async function empresa(etiqueta: string) {
  const email = `pl01bfree-${etiqueta}-${sello}@test.trazaloop.dev`;
  const { data: u, error } = await admin.auth.admin.createUser({
    email, password: CLAVE, email_confirm: true });
  assert(!error && Boolean(u.user), `crear persona: ${error?.message}`);
  const uid = (u.user as { id: string }).id;
  personas.push(uid);
  const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: CLAVE });
  const { data: orgId, error: eOrg } = await cli.rpc("create_organization",
    { p_name: `PL01BFREE ${etiqueta} ${sello}`, p_tax_id: null, p_country: "CO" });
  assert(!eOrg && Boolean(orgId), `crear empresa: ${eOrg?.message}`);
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", uid);
  return { org, uid, cli, email };
}

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  await tasaCanonicaQA(admin);

  console.log("\nA · Por encima del cupo: se consulta, se descarga, se borra");
  // =========================================================================

  const e = await empresa("cupo");

  await check("El cupo de Free existe y es finito", async () => {
    const { data, error } = await e.cli.rpc("organization_storage_quota",
      { p_organization_id: e.org });
    assert(!error, `leer cupo: ${error?.message}`);
    const q = data as Record<string, unknown>;
    const bytes = Number(q.quota_bytes ?? q.limit_bytes ?? q.bytes ?? -1);
    assert(Number.isFinite(bytes) && bytes > 0,
      `el cupo de Free no es un número finito: ${JSON.stringify(q)}`);
  });

  let cupo = 0;
  await check("Se puede empujar a la empresa POR ENCIMA de su cupo", async () => {
    const { data } = await e.cli.rpc("organization_storage_quota",
      { p_organization_id: e.org });
    const q = data as Record<string, unknown>;
    cupo = Number(q.quota_bytes ?? q.limit_bytes ?? q.bytes ?? 0);
    assert(cupo > 0, `sin cupo legible: ${JSON.stringify(q)}`);
    // Se registra ocupación real por la vía que la contabilidad ya mide.
    await pg.query(
      `insert into public.storage_orphan_candidates
         (organization_id, module_code, bucket_id, object_path, size_bytes,
          source_type, status)
       values ($1, 'traceability_6632', 'evidences', $2, $3, 'evidence', 'pending_delete')`,
      // La ruta NO puede empezar por «<org>/textiles/»: ese prefijo pertenece al
      // otro módulo y la restricción de 0099 lo separa a propósito.
      [e.org, `${e.org}/cpr/pl01b-${sello}.bin`, cupo * 6]);

    const { data: st } = await e.cli.rpc("organization_storage_status",
      { p_organization_id: e.org });
    const s = st as Record<string, unknown>;
    const usado = Number(s.used_bytes ?? s.usage_bytes ?? 0);
    assert(usado > cupo, `la ocupación (${usado}) no superó el cupo (${cupo})`);
  });

  await check("I. Consultar el estado SIGUE funcionando por encima del cupo", async () => {
    const { data, error } = await e.cli.rpc("organization_storage_status",
      { p_organization_id: e.org });
    assert(!error, `consultar estado por encima del cupo: ${error?.message}`);
    assert(data !== null, "el estado no se pudo leer estando por encima del cupo");
  });

  await check("El cupo SOLO se consulta al reservar una subida", async () => {
    // Esta es la comprobación que de verdad sostiene la promesa de §10.
    //
    // La primera versión de esta prueba pedía cero bytes al guardián y esperaba
    // un sí, razonando que «leer, descargar y borrar no crecen». El guardián
    // dice que no —`usado + 0 > cupo` sigue siendo cierto por encima del
    // cupo— y durante un rato pareció un defecto del producto. No lo es: NADIE
    // llama al guardián para leer, descargar ni borrar. Se invoca en un solo
    // sitio, la reserva atómica de subida de 0164.
    //
    // Así que lo que hay que fijar no es el comportamiento con cero bytes, es
    // que ese siga siendo el único invocador. El día que alguien lo meta en un
    // camino de lectura, esta comprobación se pondrá roja antes de que un
    // cliente por encima del cupo se quede sin poder descargar lo suyo.
    const { readFileSync, readdirSync } = await import("node:fs");
    const invocadores: string[] = [];
    for (const dir of ["lib", "server", "app", "supabase/migrations"]) {
      const pila = [dir];
      while (pila.length) {
        const d = pila.pop() as string;
        for (const n of readdirSync(d, { withFileTypes: true })) {
          const ruta = `${d}/${n.name}`;
          if (n.isDirectory()) { pila.push(ruta); continue; }
          if (!/\.(ts|tsx|sql)$/.test(n.name)) continue;
          const src = readFileSync(ruta, "utf8");
          // Se buscan LLAMADAS, no menciones en comentarios ni la definición.
          if (/(perform|select)\s+(public\.)?organization_storage_guard\s*\(/.test(src)
              || /rpc\(\s*"organization_storage_guard"/.test(src)) {
            invocadores.push(ruta);
          }
        }
      }
    }
    const unicos = [...new Set(invocadores)].sort();
    assert(unicos.length === 1
        && unicos[0] === "supabase/migrations/0164_canonical_organization_storage_quota.sql",
      `el guardián del cupo se invoca desde ${unicos.length} sitios: ${unicos.join(", ")}. `
      + "Si alguno es un camino de lectura, una empresa por encima del cupo "
      + "dejará de poder consultar o descargar lo que ya es suyo.");
  });

  await check("Pero UN byte más sí se bloquea", async () => {
    const { error } = await e.cli.rpc("organization_storage_guard",
      { p_organization_id: e.org, p_requested_bytes: 1 });
    assert(Boolean(error) && /STORAGE_QUOTA_EXCEEDED/.test(error!.message),
      `se dejó crecer por encima del cupo: ${error?.message ?? "sin error"}`);
  });

  await check("Y BORRAR reduce la ocupación en vez de estar prohibido", async () => {
    const { rows: antes } = await pg.query(
      `select coalesce(sum(size_bytes),0)::bigint as b from public.storage_orphan_candidates
        where organization_id = $1 and deleted_at is null`, [e.org]);
    await pg.query(
      `update public.storage_orphan_candidates set deleted_at = now(), status = 'deleted'
        where organization_id = $1`, [e.org]);
    const { rows: despues } = await pg.query(
      `select coalesce(sum(size_bytes),0)::bigint as b from public.storage_orphan_candidates
        where organization_id = $1 and deleted_at is null`, [e.org]);
    assert(Number(antes[0].b) > Number(despues[0].b),
      "borrar no redujo la ocupación: entonces no hay salida del cupo");
    const { error } = await e.cli.rpc("organization_storage_guard",
      { p_organization_id: e.org, p_requested_bytes: 1 });
    assert(!error, `tras liberar sitio seguía bloqueado: ${error?.message}`);
  });

  console.log("\nB · Bajar de Full a Free no borra nada");
  // =========================================================================

  await check("H. Al pasar a Free, la empresa y sus datos siguen enteros", async () => {
    const staff = await empresa("staff");
    await admin.from("platform_staff").insert({
      user_id: staff.uid, role_code: "superadmin", status: "active" });
    const cliente = await empresa("baja");

    // Full por el camino real: un pago registrado a mano.
    const { error: ePago } = await staff.cli.rpc("billing_record_manual_payment", {
      p_organization_id: cliente.org, p_plan_code: "full", p_billing_interval: "monthly",
      p_reference: `TRF-BAJA-${sello}`, p_paid_at: new Date(Date.now() - 3600_000).toISOString(),
      p_evidence: null, p_reason: "Pago confirmado para la prueba de bajada a Free.",
    });
    assert(!ePago, `activar Full: ${ePago?.message}`);

    // Datos de la empresa mientras es Full.
    const { rows: antes } = await pg.query(
      `select
         (select count(*) from public.organizations where id = $1)                as empresa,
         (select count(*) from public.memberships where organization_id = $1)     as miembros,
         (select count(*) from public.billing_payments where organization_id = $1) as pagos,
         (select count(*) from public.billing_subscription_periods
            where organization_id = $1)                                          as periodos`,
      [cliente.org]);

    // Y se le asigna Free, que es lo que ocurre al vencer.
    const { data: revFree } = await admin.from("plan_revisions")
      .select("id").eq("plan_code", "free").eq("status", "published").single();
    const { error: eBaja } = await staff.cli.rpc("commercial_assign_plan", {
      p_organization_id: cliente.org,
      p_plan_revision_id: (revFree as { id: string }).id,
      p_scope: "organization", p_module_code: null,
      p_starts_at: null, p_ends_at: null,
      p_reason: "Fin del periodo Full: la empresa vuelve a Free.",
    });
    assert(!eBaja, `bajar a Free: ${eBaja?.message}`);

    const { rows: despues } = await pg.query(
      `select
         (select count(*) from public.organizations where id = $1)                as empresa,
         (select count(*) from public.memberships where organization_id = $1)     as miembros,
         (select count(*) from public.billing_payments where organization_id = $1) as pagos,
         (select count(*) from public.billing_subscription_periods
            where organization_id = $1)                                          as periodos`,
      [cliente.org]);

    for (const k of ["empresa", "miembros", "pagos", "periodos"]) {
      assert(String(antes[0][k]) === String(despues[0][k]),
        `bajar a Free cambió «${k}»: ${antes[0][k]} → ${despues[0][k]}`);
    }
    assert(Number(despues[0].empresa) === 1, "la empresa desapareció al bajar a Free");
    assert(Number(despues[0].pagos) === 1, "se perdió la historia de cobros al bajar a Free");
  });

  await check("Y la historia de cobros conserva que un día fue Full", async () => {
    const { rows } = await pg.query(
      `select p.plan_code from public.billing_subscription_periods p
        join public.organizations o on o.id = p.organization_id
       where o.name like $1`, [`PL01BFREE baja ${sello}%`]);
    assert(rows.length === 1 && rows[0].plan_code === "full",
      `el periodo pagado dejó de decir «full»: ${JSON.stringify(rows)}`);
  });

  console.log("\nC · De qué plan depende la puerta de los tutoriales");
  // =========================================================================
  //
  // La regla de acceso es pura y ya tiene su suite. Lo que aquí se comprueba
  // es la CADENA de la que se alimenta: que el plan efectivo diga la verdad
  // antes y después de pagar, y que «tuvo Full alguna vez» se pueda saber.
  // Sin esto, la regla podría estar perfecta y decidir con datos falsos.

  await check("Una empresa recién creada está en Demo Full, y por eso VE tutoriales", async () => {
    // Esto se escribió esperando «free» y salió «full». La expectativa estaba
    // mal, no el producto: desde 0100 toda empresa nueva recibe Full en prueba
    // durante 48 horas. Y es justo lo que hace falta — Demo Full conserva los
    // tutoriales, así que quien está probando el producto ve cómo se usa.
    const e = await empresa("tutdemo");
    const { data, error } = await e.cli.rpc("get_organization_effective_plan",
      { p_organization_id: e.org });
    assert(!error, `resolver plan: ${error?.message}`);
    assert(data === "full", `una empresa en prueba resolvió «${data}»`);
    const { rows } = await pg.query(
      `select a.grant_kind, a.ends_at from public.organization_plan_assignments a
         join public.plan_revisions r on r.id = a.plan_revision_id
        where a.organization_id = $1 and r.plan_code = 'full'
          and (a.ends_at is null or a.ends_at > now()) limit 1`, [e.org]);
    assert(rows.length === 1 && rows[0].grant_kind === "trial",
      `el Full de una empresa nueva no es una prueba: ${JSON.stringify(rows)}`);
    assert(rows[0].ends_at !== null,
      "la prueba no tiene fecha de fin: sería Full permanente y gratis");
  });

  await check("Una empresa YA en Free resuelve «free», que es quien ve la oferta", async () => {
    // La empresa de la comprobación H bajó a Free por el camino real.
    const { rows } = await pg.query(
      `select id from public.organizations where name like $1`,
      [`PL01BFREE baja ${sello}%`]);
    assert(rows.length === 1, "no se encontró la empresa que bajó a Free");
    // Se lee la asignación vigente de ámbito empresa, no la RPC: esa exige
    // sesión y aquí se está mirando con el propietario de la base.
    const { rows: plan } = await pg.query(
      `select r.plan_code, a.grant_kind
         from public.organization_plan_assignments a
         join public.plan_revisions r on r.id = a.plan_revision_id
        where a.organization_id = $1 and a.scope = 'organization'
          and (a.ends_at is null or a.ends_at > now())
        order by a.starts_at desc limit 1`, [rows[0].id]);
    assert(plan.length === 1 && plan[0].plan_code === "free",
      `la empresa que bajó a Free tiene vigente «${JSON.stringify(plan)}»`);
  });

  await check("Y no consta que haya pagado nunca", async () => {
    const { rows } = await pg.query(
      `select count(*)::int as n from public.billing_subscription_periods p
        join public.organizations o on o.id = p.organization_id
       where o.name like $1 and p.status = 'settled'
         and p.plan_code in ('full','extra')`, [`PL01BFREE tutdemo ${sello}%`]);
    assert(rows[0].n === 0,
      "una empresa en prueba figura como antigua clienta: se le diría «Reactivar» sin haber pagado");
  });

  await check("Tras pagar, el plan efectivo pasa a «full»", async () => {
    const staff = await empresa("tutstaff");
    await admin.from("platform_staff").insert({
      user_id: staff.uid, role_code: "superadmin", status: "active" });
    const cliente = await empresa("tutpago");
    const { error } = await staff.cli.rpc("billing_record_manual_payment", {
      p_organization_id: cliente.org, p_plan_code: "full", p_billing_interval: "monthly",
      p_reference: `TRF-TUT-${sello}`, p_paid_at: new Date(Date.now() - 3600_000).toISOString(),
      p_evidence: null, p_reason: "Pago para comprobar la puerta de tutoriales.",
    });
    assert(!error, `activar Full: ${error?.message}`);
    const { data } = await cliente.cli.rpc("get_organization_effective_plan",
      { p_organization_id: cliente.org });
    assert(data === "full", `tras pagar Full el plan efectivo dice «${data}»`);
  });

  await check("Y queda constancia de que fue clienta, para decirle «Reactivar»", async () => {
    const { rows } = await pg.query(
      `select count(*)::int as n from public.billing_subscription_periods p
        join public.organizations o on o.id = p.organization_id
       where o.name like $1 and p.status = 'settled'
         and p.plan_code in ('full','extra')`, [`PL01BFREE tutpago ${sello}%`]);
    assert(rows[0].n === 1,
      `hay ${rows[0].n} periodos liquidados: sin eso se le ofrecería «Activar» a quien ya pagó`);
  });

  // -------------------------------------------------------------------------
  const residuo = await limpiarFixtures(pg, admin, { orgs, personas });
  const parte = describirResiduo(residuo);
  if (parte) console.log(`\n  ${parte}`);
  await pg.end();

  console.log(`\nPROD-LAUNCH-01B · Free seguro: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
