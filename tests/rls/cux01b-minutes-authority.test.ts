import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · COMMERCIAL-UX-01B · Los 600 minutos, donde se cuentan de verdad.
 *
 *
 * POR QUÉ ESTA BATERÍA NO PUEDE SER DETERMINISTA
 *
 * `cux01b-commercial-invariants` comprueba la FORMA de la migración 0211: que
 * publique revisión en vez de reescribirla, que no toque el precio, que sea
 * idempotente. Eso vale para revisar el arreglo y no vale para saber si el
 * producto mide.
 *
 * La pregunta que aquí se responde es otra: si una empresa con Full consume
 * seiscientos minutos en un mes, ¿el reloj comercial lo nota? Esa respuesta no
 * está en ningún fichero. Está en `organization_time_status`, que lee la
 * revisión efectiva de la empresa, cuenta filas de `organization_usage_minutes`
 * y decide. Solo la base puede contestarla.
 *
 * Importa porque el defecto original era exactamente ese: la autoridad decía
 * `unlimited` en los DOS límites de minutos, y la función tiene una rama que
 * ante eso devuelve `metered:false` y no escribe ni un minuto. Full no se medía
 * en absoluto. Una página de precios que prometiera 600 habría prometido algo
 * que el producto no aplicaba.
 *
 *
 * LO QUE SE DEFIENDE
 *
 *   · Full mide, y mide 600 al mes, sin tope diario.
 *   · El corte ocurre en el minuto 600, ni en el 599 ni en el 601.
 *   · Free sigue en 30/300. Extra sigue sin reloj. Nadie más se movió.
 *   · La prueba de Full HEREDA los 600: es una prueba DE Full, no otra cosa.
 *
 * Correr: npm run test:cux01b-db
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
  await q("set role postgres");

  // ── fixture ────────────────────────────────────────────────────────────────
  // `organization_time_status` exige sesión y pertenencia. Se suplantan las dos:
  // suplantar solo una daría un verde falso.
  const usuario = "22222222-2222-4222-8222-222222222222";
  const correo = `cux01b-${sello}@test.trazaloop.dev`;
  await q(`insert into auth.users (id, email, aud, role)
           values ($1, $2, 'authenticated', 'authenticated')
           on conflict (id) do nothing`, [usuario, correo]);
  await q(`select set_config('request.jwt.claims',
             json_build_object('sub', $1::text, 'role', 'authenticated')::text, false)`,
          [usuario]);

  /** Una empresa nueva por caso: los minutos se cuentan POR EMPRESA y por mes,
   *  así que reutilizarla mezclaría el consumo de un plan con el del siguiente. */
  const nuevaEmpresa = async (etiqueta: string) => {
    const [org] = await q(
      `insert into organizations (name, country, contact_email, created_by)
       values ($1, 'CO', $2, $3) returning id`,
      [`CUX01B-${etiqueta}-${sello}`, correo, usuario]);
    await q(`insert into memberships (organization_id, user_id, role_code, status)
             values ($1, $2, 'admin', 'active')
             on conflict (organization_id, user_id) do nothing`, [org.id, usuario]);
    return org.id as string;
  };

  /** La revisión VIGENTE de un plan: la misma que leería el producto. */
  const revisionVigente = async (plan: string) => {
    const [r] = await q(
      `select id, revision_number from plan_revisions
        where plan_code = $1 and status = 'published' and effective_to is null`, [plan]);
    assert(Boolean(r), `no hay revisión vigente de ${plan}`);
    return r as { id: string; revision_number: number };
  };

  /**
   * Se pone el plan por asignación de ÁMBITO EMPRESA, que es lo que
   * `plan_effective_scan` mira primero. No se llama a la primitiva de
   * transición comercial: aquí no se está probando cómo se contrata, sino qué
   * mide el reloj una vez contratado.
   */
  const ponerPlan = async (orgId: string, revisionId: string,
                           grantKind: "sold" | "trial" = "sold") => {
    await q(
      `insert into organization_plan_assignments
         (organization_id, plan_revision_id, scope, module_code, grant_kind,
          source, starts_at, ends_at, reason)
       values ($1, $2, 'organization', null, $3,
               case when $3 = 'trial' then 'trial' else 'checkout' end,
               now() - interval '1 hour',
               case when $3 = 'trial' then now() + interval '47 hours' end,
               'CUX01B · fixture')`,
      [orgId, revisionId, grantKind]);
  };

  const estado = async (orgId: string) =>
    (await q(`select public.organization_time_status($1) s`, [orgId]))[0].s as
      Record<string, unknown>;

  /** Minutos consumidos, escritos como los escribiría el latido: uno por
   *  minuto, con el día y el mes de negocio congelados. */
  const consumir = async (orgId: string, cuantos: number) => {
    await q(
      `insert into public.organization_usage_minutes
         (organization_id, minute_start, business_date, business_month)
       select $1, m,
              (m at time zone public.organization_business_timezone($1))::date,
              date_trunc('month',
                (m at time zone public.organization_business_timezone($1))::date)::date
         from generate_series(
                date_trunc('minute', now()) - make_interval(mins => $2::int - 1),
                date_trunc('minute', now()), interval '1 minute') m
       on conflict do nothing`, [orgId, cuantos]);
  };

  console.log("\n1 · FULL MIDE, Y MIDE LO QUE LA DECISIÓN COMERCIAL DICE");

  const revFull = await revisionVigente("full");
  const orgFull = await nuevaEmpresa("full");
  await ponerPlan(orgFull, revFull.id);

  await check("1A. Full tiene reloj: la rama de «plan ilimitado» ya no se toma", async () => {
    const s = await estado(orgFull);
    assert(s.metered === true,
      `Full sigue sin medirse (metered=${String(s.metered)}), como antes de 0211`);
    assert(s.plan_code === "full", `plan efectivo ${String(s.plan_code)}`);
  });

  await check("1B. El tope mensual es 600 y el diario no existe", async () => {
    const s = await estado(orgFull);
    assert(s.monthly_limit === 600, `tope mensual ${String(s.monthly_limit)}`);
    assert(s.daily_limit === null,
      `apareció un tope diario en Full: ${String(s.daily_limit)}`);
  });

  await check("1C. A 599 minutos todavía se trabaja", async () => {
    // El límite es un CORTE, no un margen. Cortar antes le quita a alguien un
    // minuto que pagó.
    await consumir(orgFull, 599);
    const s = await estado(orgFull);
    assert(s.monthly_used === 599, `contó ${String(s.monthly_used)} minutos`);
    assert(s.state === "NORMAL", `cortó en el minuto 599: ${String(s.state)}`);
    assert(s.monthly_remaining === 1, `restante ${String(s.monthly_remaining)}`);
  });

  await check("1D. En el 600 se corta, y se dice que fue el MES", async () => {
    await consumir(orgFull, 600);
    const s = await estado(orgFull);
    assert(s.monthly_used === 600, `contó ${String(s.monthly_used)} minutos`);
    assert(s.state === "CONSULTATION_MONTHLY_LIMIT",
      `estado ${String(s.state)}: «vuelve mañana» y «vuelve el mes que viene» no son la misma noticia`);
    assert(s.monthly_remaining === 0, `restante ${String(s.monthly_remaining)}`);
  });

  console.log("\n2 · Y NADIE MÁS SE MOVIÓ");

  await check("2A. Free sigue en 30 al día y 300 al mes", async () => {
    const rev = await revisionVigente("free");
    const org = await nuevaEmpresa("free");
    await ponerPlan(org, rev.id);
    const s = await estado(org);
    assert(s.metered === true, "Free dejó de medirse");
    assert(s.daily_limit === 30, `tope diario de Free ${String(s.daily_limit)}`);
    assert(s.monthly_limit === 300, `tope mensual de Free ${String(s.monthly_limit)}`);
  });

  await check("2B. Extra sigue sin reloj", async () => {
    const rev = await revisionVigente("extra");
    const org = await nuevaEmpresa("extra");
    await ponerPlan(org, rev.id);
    const s = await estado(org);
    assert(s.metered === false,
      `0211 le puso reloj a Extra (metered=${String(s.metered)}), y no era el encargo`);
    assert(s.monthly_limit === null, `tope mensual en Extra: ${String(s.monthly_limit)}`);
  });

  console.log("\n3 · LA PRUEBA DE FULL ES UNA PRUEBA DE FULL");

  await check("3A. Durante la prueba se miden los mismos 600", async () => {
    // La política de prueba concede la revisión VIGENTE de `trial_plan_code`.
    // Si la prueba no heredara el tope, ofrecería 48 horas de algo que el plano
    // vendido no da, y quien la aprovechara vería peor producto al pagar.
    const org = await nuevaEmpresa("prueba");
    await ponerPlan(org, revFull.id, "trial");
    const s = await estado(org);
    assert(s.grant_kind === "trial", `concesión ${String(s.grant_kind)}`);
    assert(s.metered === true, "la prueba de Full no mide minutos");
    assert(s.monthly_limit === 600,
      `la prueba promete ${String(s.monthly_limit)} minutos y Full da 600`);
  });

  console.log("\n4 · LA REVISIÓN VIEJA SIGUE VALIENDO LO QUE VALÍA");

  await check("4A. Quien contrató antes de 0211 conserva sus condiciones", async () => {
    // Esto NO es un defecto: una revisión publicada es el contrato. Se comprueba
    // para que quede escrito que el cambio es hacia adelante y que nadie se
    // sorprenda al ver empresas con Full sin medir.
    const [vieja] = await q(
      `select r.id, r.revision_number,
              (select l.limit_state from plan_revision_limits l
                where l.plan_revision_id = r.id
                  and l.resource_code = 'active_minutes_monthly') estado_mes
         from plan_revisions r
        where r.plan_code = 'full' and r.status = 'retired'
        order by r.revision_number desc limit 1`);
    assert(Boolean(vieja), "no quedó ninguna revisión retirada de Full");
    assert(vieja.estado_mes === "unlimited",
      `la revisión retirada r${vieja.revision_number} dice ${String(vieja.estado_mes)}: se reescribió el pasado`);

    const org = await nuevaEmpresa("vieja");
    await ponerPlan(org, vieja.id);
    const s = await estado(org);
    assert(s.metered === false,
      "una empresa en la revisión anterior empezó a medirse: 0211 tocó hacia atrás");
  });

  await q(`select set_config('request.jwt.claims', null, false)`);
  await pg.end();

  console.log(`\nCOMMERCIAL-UX-01B · minutos contra la base: ${passed} en verde, ${failed} en rojo`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
