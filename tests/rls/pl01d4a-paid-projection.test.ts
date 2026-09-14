import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · PROD-LAUNCH-01D.4A · La proyección, contra la base.
 *
 * La lógica pura ya se prueba aparte. Aquí se prueba lo que solo la base puede
 * decir: que los disparadores saltan, que la renovación anticipada extiende sin
 * perder días, que volver a proyectar no cambia nada, y que nada de esto
 * regala módulos ni cruza empresas.
 *
 * Correr: npm run test:pl01d4a-db
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

let passed = 0, failed = 0;
async function check(nombre: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

const sello = Date.now();

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, params: unknown[] = []) => (await pg.query(sql, params)).rows;

  // ── fixture: una empresa con los tres módulos en demo VENCIDO ───────────
  await q("begin");
  // `created_by` es obligatorio; sirve cualquier perfil existente y todo se
  // deshace al final.
  const [{ id: autor }] = await q(`select id from public.profiles limit 1`);
  const [{ id: org }] = await q(
    `insert into public.organizations (name, country, created_by)
     values ($1, 'CO', $2) returning id`, [`PL01D4A ${sello}`, autor]);
  for (const m of ["quality", "textiles", "traceability_6632"]) {
    await q(`insert into public.organization_modules
             (organization_id, module_code, enabled, access_mode, access_expires_at, assignment_source)
             values ($1, $2, true, 'demo', now() - interval '5 days', 'auto_demo_trial')`, [org, m]);
  }
  // Un módulo que la empresa TIENE en demo vencido pero que NO va a comprar:
  // no recibe concesión vendida, así que la proyección no debe tocarlo. Es el
  // caso «nunca contratado» que de verdad puede darse, y se prueba con una
  // fila real en vez de con un módulo inexistente.
  const NO_COMPRADO = "textiles";

  const [{ id: rev }] = await q(
    `select id from public.plan_revisions where plan_code='full' and status='published' limit 1`);

  // Foto de lo que YA estaba proyectado antes de tocar nada.
  const [{ c: ajenasAntes }] = await q(
    `select count(*)::int c from public.organization_modules
      where assignment_source='paid_checkout' and organization_id <> $1`, [org]);
  let orgSinLiquidar: string = org;

  const estado = async () => q(
    `select module_code, enabled, access_mode, access_expires_at
       from public.organization_modules where organization_id=$1 order by module_code`, [org]);

  console.log("\nA · Conceder y liquidar proyecta el acceso\n");

  await check("Antes de pagar, los tres siguen en demo vencido", async () => {
    const filas = await estado();
    assert(filas.length === 3, `hay ${filas.length} módulos`);
    assert(filas.every((f) => f.access_mode === "demo"), "algún módulo no está en demo");
  });

  // Concesiones canónicas + suscripción + periodo liquidado, como hace la
  // liquidación real.
  const [{ id: sub }] = await q(
    `insert into public.billing_subscriptions
       (organization_id, provider, plan_code, plan_revision_id, billing_interval,
        catalog_amount_minor, catalog_currency, base_charge_amount, charge_currency,
        status, current_period_start, current_period_end)
     values ($1,'mercadopago','full',$2,'monthly',4000,'USD',132000,'COP','active',
             now(), now() + interval '1 month') returning id`, [org, rev]);
  for (const m of ["quality", "textiles", "traceability_6632"]) {
    await q(`insert into public.organization_plan_assignments
             (organization_id, plan_revision_id, scope, module_code, grant_kind, source, starts_at)
             values ($1,$2,'module',$3,'sold','checkout', now())`, [org, rev, m]);
  }
  const [{ period_end: fin1 }] = await q(
    `insert into public.billing_subscription_periods
       (subscription_id, organization_id, period_sequence, period_start, period_end,
        base_amount, charge_currency, status, settled_at, plan_code, plan_revision_id, billing_interval)
     values ($1,$2,1, now(), now() + interval '1 month', 132000,'COP','settled', now(),
             'full',$3,'monthly') returning period_end`, [sub, org, rev]);

  await check("Tras liquidar, los tres quedan en full hasta el fin del periodo", async () => {
    const filas = await estado();
    for (const f of filas) {
      assert(f.access_mode === "full", `${f.module_code} quedó en «${f.access_mode}»`);
      assert(f.enabled === true, `${f.module_code} quedó deshabilitado`);
      assert(f.access_expires_at !== null,
        `${f.module_code} quedó SIN vencimiento: eso es acceso perpetuo`);
      assert(new Date(f.access_expires_at).getTime() === new Date(fin1).getTime(),
        `${f.module_code} vence en ${f.access_expires_at} y el periodo en ${fin1}`);
    }
  });

  await check("G. Un módulo SIN concesión vendida no se promueve", async () => {
    // Se retira su concesión y se vuelve a proyectar: tiene que quedarse atrás.
    await q(`delete from public.organization_plan_assignments
              where organization_id=$1 and module_code=$2 and grant_kind='sold'`,
            [org, NO_COMPRADO]);
    await q(`update public.organization_modules
                set access_mode='demo', access_expires_at = now() - interval '5 days',
                    assignment_source='auto_demo_trial'
              where organization_id=$1 and module_code=$2`, [org, NO_COMPRADO]);
    await q(`select public.billing_project_module_access($1)`, [org]);
    const [f] = await q(
      `select access_mode from public.organization_modules
        where organization_id=$1 and module_code=$2`, [org, NO_COMPRADO]);
    assert(f.access_mode === "demo",
      `un módulo sin comprar quedó en «${f.access_mode}»: Full estaría regalando módulos`);
    // Y se devuelve al estado del fixture para el resto de la batería.
    await q(`insert into public.organization_plan_assignments
             (organization_id, plan_revision_id, scope, module_code, grant_kind, source, starts_at)
             values ($1,$2,'module',$3,'sold','checkout', now())`, [org, rev, NO_COMPRADO]);
  });

  console.log("\nB · Renovación anticipada\n");

  await check("D. Renovar antes de vencer EXTIENDE y no pierde días", async () => {
    const [{ period_end: fin2 }] = await q(
      `insert into public.billing_subscription_periods
         (subscription_id, organization_id, period_sequence, period_start, period_end,
          base_amount, charge_currency, status, settled_at, plan_code, plan_revision_id, billing_interval)
       values ($1,$2,2,$3,$3::timestamptz + interval '1 month',132000,'COP','settled', now(),
               'full',$4,'monthly') returning period_end`, [sub, org, fin1, rev]);
    const filas = await estado();
    for (const f of filas) {
      assert(new Date(f.access_expires_at).getTime() === new Date(fin2).getTime(),
        `${f.module_code} no se extendió: vence ${f.access_expires_at}, periodo ${fin2}`);
      assert(new Date(f.access_expires_at) > new Date(fin1),
        `${f.module_code} perdió días al renovar`);
    }
  });

  console.log("\nC · Idempotencia\n");

  await check("F. Proyectar dos veces no cambia nada ni duplica filas", async () => {
    const antes = await estado();
    const [{ billing_project_module_access: n1 }] = await q(
      `select public.billing_project_module_access($1)`, [org]);
    const [{ billing_project_module_access: n2 }] = await q(
      `select public.billing_project_module_access($1)`, [org]);
    assert(Number(n1) === 0 && Number(n2) === 0,
      `reproyectar escribió ${n1} y ${n2} filas: debería no tocar nada`);
    const despues = await estado();
    assert(despues.length === antes.length, "aparecieron filas de módulo duplicadas");
    assert(JSON.stringify(antes) === JSON.stringify(despues), "el estado cambió al reproyectar");
  });

  await check("Y no duplica nada financiero", async () => {
    const [{ c: subs }] = await q(
      `select count(*)::int c from public.billing_subscriptions where organization_id=$1`, [org]);
    const [{ c: per }] = await q(
      `select count(*)::int c from public.billing_subscription_periods where organization_id=$1`, [org]);
    const [{ c: asig }] = await q(
      `select count(*)::int c from public.organization_plan_assignments
        where organization_id=$1 and grant_kind='sold'`, [org]);
    assert(subs === 1, `${subs} suscripciones`);
    assert(per === 2, `${per} periodos (deberían ser los 2 creados)`);
    assert(asig === 3, `${asig} concesiones vendidas`);
  });

  console.log("\nD · Lo que NO debe proyectar\n");

  await check("I. Un periodo sin liquidar no concede nada", async () => {
    const [{ id: autor2 }] = await q(`select id from public.profiles limit 1`);
    const [{ id: org2 }] = await q(
      `insert into public.organizations (name, country, created_by)
       values ($1,'CO',$2) returning id`, [`PL01D4A sin liquidar ${sello}`, autor2]);
    orgSinLiquidar = org2;
    await q(`insert into public.organization_modules
             (organization_id, module_code, enabled, access_mode, access_expires_at, assignment_source)
             values ($1,'quality', true,'demo', now() - interval '5 days','auto_demo_trial')`, [org2]);
    await q(`insert into public.organization_plan_assignments
             (organization_id, plan_revision_id, scope, module_code, grant_kind, source, starts_at)
             values ($1,$2,'module','quality','sold','checkout', now())`, [org2, rev]);
    const [{ id: sub2 }] = await q(
      `insert into public.billing_subscriptions
         (organization_id, provider, plan_code, plan_revision_id, billing_interval,
          catalog_amount_minor, catalog_currency, base_charge_amount, charge_currency, status,
          current_period_start, current_period_end)
       values ($1,'mercadopago','full',$2,'monthly',4000,'USD',132000,'COP','pending',
               now(), now() + interval '1 month') returning id`, [org2, rev]);
    await q(`insert into public.billing_subscription_periods
             (subscription_id, organization_id, period_sequence, period_start, period_end,
              base_amount, charge_currency, status, plan_code, plan_revision_id, billing_interval)
             values ($1,$2,1, now(), now() + interval '1 month',132000,'COP','open',
                     'full',$3,'monthly')`, [sub2, org2, rev]);
    const [f] = await q(
      `select access_mode from public.organization_modules
        where organization_id=$1 and module_code='quality'`, [org2]);
    assert(f.access_mode === "demo",
      `un pago no aprobado promovió el módulo a «${f.access_mode}»`);
  });

  await check("H. Y no toca los módulos de ninguna otra empresa", async () => {
    // Contra la FOTO PREVIA, no contra cero: la propia migración 0194 proyecta
    // en su backfill las empresas que ya tenían periodos liquidados, y contar
    // esas como contaminación era un error de esta comprobación.
    const [{ c: ahora }] = await q(
      `select count(*)::int c from public.organization_modules
        where assignment_source='paid_checkout'
          and organization_id not in ($1, $2)`, [org, orgSinLiquidar]);
    assert(ahora === ajenasAntes,
      `las filas proyectadas de otras empresas pasaron de ${ajenasAntes} a ${ahora}`);
  });

  await q("rollback");
  await pg.end();

  console.log(`\nPROD-LAUNCH-01D.4A · proyección en base: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
