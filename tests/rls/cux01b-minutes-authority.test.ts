import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · COMMERCIAL-UX-01B.2 · El tiempo de uso no es la economía del
 * producto.
 *
 *
 * LA DECISIÓN QUE ESTA BATERÍA DEFIENDE
 *
 * Trazaloop se cobra por almacenamiento, créditos de IA y capacidades. NO por
 * el rato que alguien tiene el producto abierto. Una empresa que paga Full o
 * Extra no consume una bolsa de minutos y no se queda fuera por haber
 * trabajado mucho: medir el tiempo de quien ya pagó castiga exactamente el
 * comportamiento que se quiere.
 *
 * Free sí mide —30 al día, 300 al mes— porque ahí el tiempo es lo que separa
 * probar el producto de operar con él gratis.
 *
 *
 * POR QUÉ CONTRA LA BASE Y NO CON FICHEROS
 *
 * Que una tabla diga `unlimited` no demuestra que nadie mida. Quien decide es
 * `organization_time_status`: lee la revisión efectiva de la empresa y toma —o
 * no— la rama que devuelve `metered:false`. Y quien escribe es el latido, que
 * consulta ese mismo estado antes de gastar una fila. Esa cadena solo existe
 * en la base.
 *
 *
 * HISTORIA, PORQUE SI NO ESTO SE LEE COMO UN CAPRICHO
 *
 * 0211 publicó Full con 600 minutos al mes, y esta batería lo comprobaba. La
 * decisión comercial cambió después: el tiempo deja de ser el límite económico
 * de los planes pagos. 0212 sucede a 0211 —sin reescribirla— y esta batería
 * pasa a defender lo contrario que defendía. Queda escrito para que dentro de
 * un año nadie lo lea como un descuido.
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
const MARCA = `CUX01B-${sello}`;

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, params: unknown[] = []) => (await pg.query(sql, params)).rows;
  await q("set role postgres");

  // ── fixture ────────────────────────────────────────────────────────────────
  // `organization_time_status` exige sesión y pertenencia. Se suplantan las
  // dos: suplantar solo una daría un verde falso.
  const usuario = "22222222-2222-4222-8222-222222222222";
  const correo = `cux01b-${sello}@test.trazaloop.dev`;
  await q(`insert into auth.users (id, email, aud, role)
           values ($1, $2, 'authenticated', 'authenticated')
           on conflict (id) do nothing`, [usuario, correo]);
  await q(`select set_config('request.jwt.claims',
             json_build_object('sub', $1::text, 'role', 'authenticated')::text, false)`,
          [usuario]);

  const empresas: string[] = [];

  /** Una empresa por caso: los minutos se cuentan POR EMPRESA y una asignación
   *  no se reescribe —la base lo impide, y con razón—. */
  const nuevaEmpresa = async (etiqueta: string) => {
    const [org] = await q(
      `insert into organizations (name, country, contact_email, created_by)
       values ($1, 'CO', $2, $3) returning id`,
      [`${MARCA}-${etiqueta}`, correo, usuario]);
    await q(`insert into memberships (organization_id, user_id, role_code, status)
             values ($1, $2, 'admin', 'active')
             on conflict (organization_id, user_id) do nothing`, [org.id, usuario]);
    empresas.push(org.id as string);
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
               $4)`,
      [orgId, revisionId, grantKind, `${MARCA} fixture`]);
  };

  const estado = async (orgId: string) =>
    (await q(`select public.organization_time_status($1) s`, [orgId]))[0].s as
      Record<string, unknown>;

  const minutosEscritos = async (orgId: string) =>
    Number((await q(`select count(*)::int n from organization_usage_minutes
                      where organization_id = $1`, [orgId]))[0].n);

  console.log("\n1 · QUIEN PAGA NO TIENE RELOJ");

  const revFull = await revisionVigente("full");
  const orgFull = await nuevaEmpresa("full");
  await ponerPlan(orgFull, revFull.id);

  await check("1A. Full no se mide, y eso es la decisión, no un olvido", async () => {
    const s = await estado(orgFull);
    assert(s.plan_code === "full", `plan efectivo ${String(s.plan_code)}`);
    assert(s.metered === false,
      `Full volvió a tener reloj comercial (metered=${String(s.metered)})`);
    assert(s.state === "NORMAL", `Full arranca cortado: ${String(s.state)}`);
  });

  await check("1B. Ni tope diario ni tope mensual", async () => {
    const s = await estado(orgFull);
    assert(s.daily_limit === null, `tope diario en Full: ${String(s.daily_limit)}`);
    assert(s.monthly_limit === null, `tope mensual en Full: ${String(s.monthly_limit)}`);
    assert(s.daily_remaining === null && s.monthly_remaining === null,
      "se está llevando una cuenta de algo que no se limita");
  });

  await check("1C. Y no se gasta ni una fila en demostrarlo", async () => {
    // El latido consulta el estado ANTES de escribir. Sin reloj no escribe: la
    // otra mitad de la promesa, y la que se nota en la factura de la base.
    assert(await minutosEscritos(orgFull) === 0,
      "Full anotó minutos que nadie va a contar");
  });

  await check("1D. Extra igual", async () => {
    const rev = await revisionVigente("extra");
    const org = await nuevaEmpresa("extra");
    await ponerPlan(org, rev.id);
    const s = await estado(org);
    assert(s.metered === false, `Extra se mide (metered=${String(s.metered)})`);
    assert(s.daily_limit === null && s.monthly_limit === null,
      `Extra conserva topes: ${String(s.daily_limit)}/${String(s.monthly_limit)}`);
  });

  console.log("\n2 · FREE SÍ, PORQUE AHÍ EL TIEMPO ES EL LÍMITE");

  const orgFree = await nuevaEmpresa("free");
  await ponerPlan(orgFree, (await revisionVigente("free")).id);

  await check("2A. 30 al día y 300 al mes", async () => {
    const s = await estado(orgFree);
    assert(s.metered === true, "Free dejó de medirse");
    assert(s.daily_limit === 30, `tope diario de Free ${String(s.daily_limit)}`);
    assert(s.monthly_limit === 300, `tope mensual de Free ${String(s.monthly_limit)}`);
  });

  await check("2B. Y el corte llega de verdad al agotarlos", async () => {
    // Sin esto, «Free mide» sería una declaración: los números podrían estar
    // ahí sin que nadie los mirara.
    await q(
      `insert into public.organization_usage_minutes
         (organization_id, minute_start, business_date, business_month)
       select $1, m,
              (m at time zone public.organization_business_timezone($1))::date,
              date_trunc('month',
                (m at time zone public.organization_business_timezone($1))::date)::date
         from generate_series(date_trunc('minute', now()) - interval '29 minutes',
                              date_trunc('minute', now()), interval '1 minute') m
       on conflict do nothing`, [orgFree]);
    const s = await estado(orgFree);
    assert(s.daily_used === 30, `contó ${String(s.daily_used)} minutos`);
    assert(s.state === "CONSULTATION_DAILY_LIMIT",
      `estado ${String(s.state)}: «vuelve mañana» y «vuelve el mes que viene» no son la misma noticia`);
  });

  console.log("\n3 · LA PRUEBA DE FULL ES UNA PRUEBA DE FULL");

  await check("3A. Hereda el tiempo ilimitado sin ninguna excepción propia", async () => {
    // La política concede la revisión VIGENTE de `trial_plan_code`. Que herede
    // es justo lo que evita tener que mantener una segunda tabla de límites
    // para las pruebas.
    const org = await nuevaEmpresa("prueba");
    await ponerPlan(org, revFull.id, "trial");
    const s = await estado(org);
    assert(s.grant_kind === "trial", `concesión ${String(s.grant_kind)}`);
    assert(s.metered === false, "la prueba de Full tiene reloj y Full no");
    assert(s.daily_limit === null && s.monthly_limit === null,
      `la prueba conserva topes: ${String(s.daily_limit)}/${String(s.monthly_limit)}`);
  });

  await check("3B. Su límite es el que siempre tuvo: 48 horas", async () => {
    const [p] = await q(`select trial_duration_hours, trial_plan_code, trial_ai_credits,
                                enabled from commercial_trial_policy`);
    assert(Number(p.trial_duration_hours) === 48,
      `la prueba dura ${String(p.trial_duration_hours)} horas`);
    assert(p.trial_plan_code === "full", `la prueba es de ${String(p.trial_plan_code)}`);
    assert(Number(p.trial_ai_credits) === 50,
      `se tocaron los créditos de la prueba: ${String(p.trial_ai_credits)}`);
  });

  console.log("\n4 · LA INVARIANTE · NADIE LE VUELVE A PONER RELOJ A UN PLAN DE PAGO");

  await check("4A. Ninguna revisión vigente DE PAGO tiene tope de tiempo", async () => {
    // Esto no es una lista de planes: «de pago» se deduce de la propia
    // autoridad —tiene precio— así que un cuarto plan que se publique mañana
    // queda cubierto sin que nadie se acuerde de venir aquí.
    //
    // Y no duplica `plan_revision_limits`: la interroga. Si esto fuera una
    // constante con los valores, sería una segunda verdad, que es exactamente
    // el defecto que 01B vino a cerrar.
    const conReloj = await q(
      `select r.plan_code, r.revision_number, l.resource_code,
              l.limit_state, l.limit_value
         from plan_revisions r
         join plan_revision_limits l on l.plan_revision_id = r.id
        where r.status = 'published'
          and coalesce(r.monthly_price_minor, 0) > 0
          and l.resource_code in ('active_minutes_daily', 'active_minutes_monthly')
          and l.limit_state <> 'unlimited'`);
    assert(conReloj.length === 0,
      "un plan de pago volvió a tener reloj: "
      + conReloj.map((f) => `${f.plan_code} r${f.revision_number} `
          + `${f.resource_code}=${f.limit_state} ${f.limit_value ?? ""}`).join(", "));
  });

  await check("4B. Y Free conserva el suyo, que es lo que lo hace gratis", async () => {
    // La invariante de arriba no puede leerse como «nadie mide el tiempo». Free
    // mide, y si dejara de hacerlo el plan gratuito sería el plan de pago.
    const [f] = await q(
      `select
         max(case when l.resource_code = 'active_minutes_daily'   then l.limit_value end) dia,
         max(case when l.resource_code = 'active_minutes_monthly' then l.limit_value end) mes
         from plan_revisions r join plan_revision_limits l on l.plan_revision_id = r.id
        where r.plan_code = 'free' and r.status = 'published'`);
    assert(Number(f.dia) === 30 && Number(f.mes) === 300,
      `Free quedó en ${String(f.dia)}/${String(f.mes)}`);
  });

  await check("4C. Una sola revisión vigente por plan", async () => {
    const dobles = await q(
      `select plan_code, count(*)::int n from plan_revisions
        where status = 'published' group by plan_code having count(*) > 1`);
    assert(dobles.length === 0,
      `planes con más de una revisión vigente: ${dobles.map((d) => d.plan_code).join(", ")}`);
  });

  console.log("\n5 · Y LO QUE SE VENDIÓ ANTES SIGUE VALIENDO LO QUE VALÍA");

  await check("5A. Las revisiones retiradas no se reescribieron", async () => {
    // 0212 sucede a 0211; no la borra ni la corrige por debajo. La revisión de
    // 600 minutos sigue existiendo, retirada, con sus 600: es lo que incluía
    // Full durante las horas que estuvo vigente, y eso es historia.
    const [r600] = await q(
      `select r.revision_number, r.status
         from plan_revisions r join plan_revision_limits l on l.plan_revision_id = r.id
        where r.plan_code = 'full' and l.resource_code = 'active_minutes_monthly'
          and l.limit_state = 'finite' and l.limit_value = 600
        order by r.revision_number desc limit 1`);
    if (r600) {
      assert(r600.status !== "published",
        `la revisión de 600 minutos sigue vigente: r${r600.revision_number}`);
    }
  });

  // ── limpieza ───────────────────────────────────────────────────────────────
  // Una batería que deja empresas detrás ensucia justo la tabla que audita.
  for (const id of empresas) {
    await q(`delete from organization_usage_minutes where organization_id = $1`, [id]);
    await q(`delete from organization_plan_assignments where organization_id = $1`, [id]);
    await q(`delete from memberships where organization_id = $1`, [id]);
    await q(`delete from organization_modules where organization_id = $1`, [id]);
    await q(`delete from organizations where id = $1`, [id]);
  }
  const [resto] = await q(
    `select count(*)::int n from organizations where name like $1`, [`${MARCA}%`]);
  if (Number(resto.n) !== 0) {
    console.log(`  ⚠ quedaron ${resto.n} empresas del fixture sin borrar`);
  }

  await q(`select set_config('request.jwt.claims', null, false)`);
  await pg.end();

  console.log(`\nCOMMERCIAL-UX-01B.2 · tiempo contra la base: ${passed} en verde, ${failed} en rojo`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
