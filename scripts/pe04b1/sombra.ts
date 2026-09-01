/**
 * Trazaloop · PE-04B1 · Informe de la comparación en sombra. **SOLO LECTURA.**
 * ---------------------------------------------------------------------------
 * Compara, empresa por empresa y módulo por módulo, lo que dice el modelo de
 * hoy con lo que diría el canónico. No escribe nada, no corrige nada, no
 * sincroniza nada. Es la evidencia con la que PE-04B2 decidirá cómo migrar.
 *
 *
 * POR QUÉ ADOPTA UNA IDENTIDAD EN VEZ DE USAR `service_role`
 *
 * Los resolutores canónicos son `security definer` y exigen `auth.uid()`: sin
 * sesión responden «No autenticado», que es lo correcto para una función de
 * producto. Una clave de servicio no tiene `auth.uid()`, así que con ella el
 * informe saldría entero como CANONICAL_UNAVAILABLE — y sería mentira: el
 * resolutor funciona; lo que falta es una identidad.
 *
 * Así que se hace lo mismo que `scripts/pe02b5b/publicar.sql`: se declara la
 * sesión y se baja al rol `authenticated`, igual que hace la pasarela. **La
 * comprobación de autorización SE EJECUTA**: si el actor no fuera personal de
 * plataforma, el informe saldría vacío o denegado, que es la respuesta correcta.
 *
 *   SUPABASE_DB_URL=... npx tsx scripts/pe04b1/sombra.ts --actor <uuid>
 *
 * Contra Staging, con las credenciales que pone quien ejecuta:
 *
 *   STAGING_DB_URL=... npx tsx scripts/pe04b1/sombra.ts --actor <uuid>
 */
import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";

import {
  classifyDrift, summarizeDrift, type ShadowRow, type DriftClass,
} from "@/lib/db/plan-shadow";
import type { PlanResolution } from "@/lib/db/commercial-plans";

loadEnv({ path: ".env.local" });

const args = process.argv.slice(2);
const actor = args[args.indexOf("--actor") + 1];
const url = process.env.STAGING_DB_URL ?? process.env.SUPABASE_DB_URL;

/** El `jsonb` de los resolutores, traducido al tipo del producto. */
function comoResolucion(v: unknown): PlanResolution {
  const r = v as Record<string, unknown> | null;
  if (!r || typeof r.status !== "string") return { status: "unavailable" };
  if (r.status === "absent") return { status: "absent" };
  if (r.status !== "found") return { status: "unavailable" };
  return {
    status: "found",
    planCode: r.plan_code as "free" | "full" | "extra",
    planRevisionId: String(r.plan_revision_id),
    grantKind: r.grant_kind as "base" | "trial" | "sold" | "courtesy",
    endsAt: (r.ends_at as string | null) ?? null,
  };
}

async function main() {
  if (!url || !actor || !/^[0-9a-f-]{36}$/i.test(actor)) {
    console.error("Uso: SUPABASE_DB_URL=... npx tsx scripts/pe04b1/sombra.ts --actor <uuid>");
    console.error("El actor tiene que ser personal de plataforma: la comprobación se ejecuta.");
    process.exit(2);
  }

  const cli = new PgClient({ connectionString: url });
  await cli.connect();
  const filas: ShadowRow[] = [];
  try {
    // TODA la transacción es de SOLO LECTURA. Este guion no tiene ninguna razón
    // para poder escribir, y decírselo a Postgres es más fuerte que prometerlo.
    await cli.query("begin transaction read only");

    // FASE 1 · el inventario, con el rol del operador.
    //
    // `organizations` y `organization_modules` tienen RLS de MIEMBRO —no de
    // personal de plataforma—, así que un superadministrador que no pertenezca
    // a ninguna empresa no vería ni una fila y el informe saldría vacío
    // diciendo que no hay nada que comparar. Es la peor forma de fallar: la
    // apariencia de éxito.
    //
    // Es el mismo motivo por el que `listPlatformOrganizationModules` ya usa un
    // cliente administrativo para esto. Aquí, además, la transacción es de solo
    // lectura, así que el privilegio no puede escribir nada.
    const { rows: orgs } = await cli.query<{ id: string; name: string }>(
      "select id, name from organizations order by name");
    const { rows: subs } = await cli.query<{ organization_id: string; plan_code: string }>(
      "select organization_id, plan_code from organization_subscriptions");
    const { rows: modRows } = await cli.query<{
      organization_id: string; module_code: string; access_mode: string;
      enabled: boolean; access_expires_at: string | null;
    }>("select organization_id, module_code, access_mode, enabled, access_expires_at"
       + " from organization_modules order by organization_id, module_code");
    const subPorOrg = new Map(subs.map((r) => [r.organization_id, r.plan_code]));

    // FASE 2 · los resolutores, con la IDENTIDAD del actor.
    //
    // Aquí sí se adopta la sesión y se baja a `authenticated`, igual que hace la
    // pasarela. La comprobación de autorización de los resolutores SE EJECUTA:
    // si el actor no fuera personal de plataforma ni miembro, responderían «No
    // autorizado» y el informe lo diría.
    await cli.query(
      "select set_config('request.jwt.claims', json_build_object('sub', $1::text,"
      + " 'role', 'authenticated')::text, true)", [actor]);
    await cli.query("set local role authenticated");

    for (const o of orgs) {
      const subPlan = subPorOrg.get(o.id) ?? null;
      const { rows: [leg] } = await cli.query<{ p: string | null }>(
        "select get_organization_effective_plan($1) as p", [o.id]);

      const { rows: [co] } = await cli.query<{ r: unknown }>(
        "select plan_effective_for_organization($1) as r", [o.id]);
      const canonOrg = comoResolucion(co?.r);
      filas.push({
        organizationId: o.id, organizationName: o.name, moduleCode: null,
        legacyModuleAccessMode: null,
        legacyEffectivePlan: leg?.p ?? null,
        legacySubscriptionPlan: subPlan,
        canonical: canonOrg,
        ...classifyDrift({
          legacyModuleAccessMode: null,
          legacyEffectivePlan: leg?.p ?? null,
          legacySubscriptionPlan: subPlan,
          canonical: canonOrg,
        }),
      });

      for (const m of modRows.filter((r) => r.organization_id === o.id)) {
        const vencido = m.access_mode === "demo" && m.access_expires_at !== null
          && new Date(m.access_expires_at) <= new Date();
        const modo = !m.enabled || vencido ? "demo" : m.access_mode;
        const { rows: [cm] } = await cli.query<{ r: unknown }>(
          "select plan_effective_for_module($1, $2) as r", [o.id, m.module_code]);
        const canon = comoResolucion(cm?.r);
        filas.push({
          organizationId: o.id, organizationName: o.name, moduleCode: m.module_code,
          legacyModuleAccessMode: modo,
          legacyEffectivePlan: leg?.p ?? null,
          legacySubscriptionPlan: subPlan,
          canonical: canon,
          ...classifyDrift({
            legacyModuleAccessMode: modo,
            legacyEffectivePlan: leg?.p ?? null,
            legacySubscriptionPlan: subPlan,
            canonical: canon,
          }),
        });
      }
    }
    await cli.query("commit");
  } finally {
    await cli.end();
  }

  console.log(`\nComparación en sombra · ${process.env.STAGING_DB_URL ? "STAGING" : "LOCAL"}\n`);
  const ancho = Math.max(12, ...filas.map((f) => f.organizationName.length));
  for (const f of filas) {
    const canon = f.canonical.status === "found"
      ? `${f.canonical.planCode}/${f.canonical.grantKind}` : f.canonical.status;
    console.log(
      `${f.organizationName.padEnd(ancho)}  ${(f.moduleCode ?? "(empresa)").padEnd(20)}  `
      + `viejo=${(f.legacyModuleAccessMode ?? f.legacyEffectivePlan ?? "—").padEnd(6)}  `
      + `susc=${(f.legacySubscriptionPlan ?? "—").padEnd(6)}  `
      + `canónico=${canon.padEnd(16)}  ${f.drift}`);
  }

  const resumen = summarizeDrift(filas);
  console.log("\n══ RESUMEN ══");
  for (const clase of ["MATCH", "EXPECTED_MIGRATION_DIFFERENCE",
    "LEGACY_DRIFT", "CANONICAL_UNAVAILABLE"] as DriftClass[]) {
    console.log(`  ${clase.padEnd(32)} ${resumen[clase]}`);
  }
  console.log(`\n  filas comparadas: ${filas.length}`);
  if (resumen.legacyMismatch > 0) {
    console.log(`\n  ${resumen.legacyMismatch} de ${filas.length} filas tienen las DOS FUENTES`);
    console.log("  VIEJAS EN DESACUERDO entre sí: los módulos dicen una cosa y la");
    console.log("  suscripción otra. Es el defecto que PE-04A documentó, y NO lo causa el");
    console.log("  modelo nuevo. Se cuenta aparte porque mientras B1 no migre a nadie el");
    console.log("  canónico responde «absent» y esto quedaría escondido tras esa clase.");
  }
  console.log("\nEste guion NO ha escrito nada.\n");
}

void main();
