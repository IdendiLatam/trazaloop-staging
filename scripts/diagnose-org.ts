/**
 * Trazaloop · Sprint 5F · Diagnóstico de una organización (SOLO LECTURA).
 *
 * Herramienta de soporte: cuando una empresa piloto reporta "no me calcula",
 * "sale 0 %", "sale preliminar" o "no veo mis datos", este script arma el
 * panorama completo de esa organización sin tocar nada (únicamente SELECTs).
 *
 * Uso:
 *   npm run diagnose:org -- --org <uuid-de-la-organización>
 *
 * Requiere SUPABASE_DB_URL en .env.local (credencial administrativa: solo
 * operador de soporte, jamás código de la app). No modifica datos, no crea
 * usuarios, no recalcula nada.
 */
import { Client as PgClient } from "pg";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

function getOrgArg(): string | null {
  const idx = process.argv.indexOf("--org");
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function h(title: string) {
  console.log(`\n— ${title} ${"—".repeat(Math.max(0, 60 - title.length))}`);
}

async function main() {
  console.log("Trazaloop · diagnóstico de organización (solo lectura)");

  const orgId = getOrgArg();
  if (!orgId || !UUID_RE.test(orgId)) {
    console.error(
      "❌ Falta el id de la organización o no es un UUID válido.\n" +
        "   Uso: npm run diagnose:org -- --org <uuid>\n" +
        "   El uuid está en la tabla organizations o en la URL de soporte."
    );
    process.exit(1);
  }
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(
      "❌ Falta SUPABASE_DB_URL en .env.local (Supabase → Settings → Database → Connection string)."
    );
    process.exit(1);
  }

  const pg = new PgClient({ connectionString: dbUrl });
  try {
    await pg.connect();
  } catch (err) {
    console.error(`❌ No se pudo conectar: ${(err as Error).message}`);
    process.exit(1);
  }

  const findings: string[] = [];

  try {
    // 1. La organización existe.
    const { rows: org } = await pg.query(
      "select id, name, created_at from organizations where id = $1",
      [orgId]
    );
    if (org.length === 0) {
      console.error(`❌ La organización ${orgId} no existe en esta base.`);
      process.exit(1);
    }
    h("Organización");
    console.log(`  ${org[0].name} · creada ${new Date(org[0].created_at).toISOString().slice(0, 10)}`);

    // 2. Miembros por rol y estado.
    const { rows: members } = await pg.query(
      `select role_code, status, count(*)::int n
         from memberships where organization_id = $1
        group by 1, 2 order by 1, 2`,
      [orgId]
    );
    h("Miembros");
    if (members.length === 0) {
      console.log("  (sin membresías)");
      findings.push("La organización no tiene miembros: nadie puede ver ni registrar datos.");
    } else {
      for (const m of members) console.log(`  ${m.role_code} · ${m.status}: ${m.n}`);
      if (!members.some((m) => m.status === "active")) {
        findings.push("No hay miembros ACTIVOS: la RLS no mostrará datos a nadie.");
      }
    }

    // 3. Catálogos y evidencias.
    const counts: Record<string, number> = {};
    for (const t of ["suppliers", "materials", "products", "input_batches", "production_orders", "output_batches"]) {
      const { rows } = await pg.query(
        `select count(*)::int n from ${t} where organization_id = $1`,
        [orgId]
      );
      counts[t] = rows[0].n;
    }
    h("Catálogos y trazabilidad");
    console.log(
      `  proveedores: ${counts.suppliers} · materiales: ${counts.materials} · productos: ${counts.products}`
    );
    console.log(
      `  lotes de entrada: ${counts.input_batches} · órdenes/corridas: ${counts.production_orders} · lotes producidos: ${counts.output_batches}`
    );

    const { rows: evid } = await pg.query(
      `select status::text, count(*)::int n from evidences
        where organization_id = $1 group by 1 order by 1`,
      [orgId]
    );
    console.log(
      `  evidencias: ${evid.length === 0 ? "0" : evid.map((e) => `${e.status}=${e.n}`).join(" · ")}`
    );
    const pendingEv = evid.find((e) => e.status === "pending")?.n ?? 0;
    if (pendingEv > 0) {
      findings.push(`${pendingEv} evidencia(s) PENDIENTES de validar: no cuentan en el cálculo hasta validarlas (admin/calidad).`);
    }

    // 4. Huecos de trazabilidad.
    const { rows: noConsumption } = await pg.query(
      `select count(*)::int n from production_orders po
        where po.organization_id = $1
          and not exists (select 1 from batch_consumption bc where bc.production_order_id = po.id)`,
      [orgId]
    );
    const { rows: noComposition } = await pg.query(
      `select count(*)::int n from output_batches ob
        where ob.organization_id = $1
          and not exists (select 1 from batch_composition bc where bc.output_batch_id = ob.id)`,
      [orgId]
    );
    h("Huecos de trazabilidad");
    console.log(`  órdenes sin consumo: ${noConsumption[0].n} · lotes producidos sin composición: ${noComposition[0].n}`);
    if (noConsumption[0].n > 0) {
      findings.push(`${noConsumption[0].n} orden(es) sin consumo: sus cálculos saldrán PRELIMINARES (sin trazabilidad hacia atrás).`);
    }
    if (noComposition[0].n > 0) {
      findings.push(`${noComposition[0].n} lote(s) producido(s) sin composición: no se pueden calcular todavía.`);
    }

    // 5. Materiales elegibles sin soporte de origen válido (la causa clásica del 0 %).
    const { rows: unsupported } = await pg.query(
      `select m.name,
              case when m.origin_support_evidence_id is null then 'sin evidencia'
                   else 'evidencia ' || coalesce(ev.status::text, 'inexistente') end as estado
         from materials m
         join material_classifications mc
           on mc.code = coalesce(m.reclassified_to_code, m.classification_code)
         left join evidences ev on ev.id = m.origin_support_evidence_id
        where m.organization_id = $1
          and mc.eligible_as_recycled and not mc.never_counts
          and m.reclassified_to_code is null
          and (m.origin_support_evidence_id is null or ev.status <> 'valid')
        order by m.name limit 15`,
      [orgId]
    );
    h("Materiales elegibles SIN soporte de origen válido");
    if (unsupported.length === 0) {
      console.log("  (ninguno: todos los materiales elegibles tienen soporte válido)");
    } else {
      for (const u of unsupported) console.log(`  · ${u.name} — ${u.estado}`);
      findings.push(
        `${unsupported.length} material(es) elegible(s) sin soporte de origen VÁLIDO: su masa sale del numerador → cálculos en 0 % o por debajo de lo esperado. ` +
          "Remedio: Evidencias → Asociar → tipo de vínculo «Soporte de origen del material» + validar, y recalcular."
      );
    }

    // 6. Últimos cálculos por lote.
    const { rows: calcs } = await pg.query(
      `select output_batch_code, recycled_percent, defensibility_level, risk_flag, calculated_at
         from v_latest_batch_recycled where organization_id = $1
        order by calculated_at desc limit 10`,
      [orgId]
    );
    h("Últimos cálculos (por lote)");
    if (calcs.length === 0) {
      console.log("  (sin cálculos todavía)");
      if (counts.output_batches > 0 && noComposition[0].n < counts.output_batches) {
        findings.push("Hay lotes con composición pero sin cálculo: falta pulsar «Calcular» (o revisar el rol del usuario).");
      }
    } else {
      for (const c of calcs) {
        console.log(
          `  ${c.output_batch_code}: ${Number(c.recycled_percent).toFixed(2)} % · ${c.defensibility_level}` +
            `${c.risk_flag ? " · RIESGO (declarado > calculado)" : ""}`
        );
      }
      const risky = calcs.filter((c) => c.risk_flag).length;
      if (risky > 0) {
        findings.push(`${risky} lote(s) con RIESGO: el % declarado del producto supera al calculado. Revisar el declarado o los soportes, y recalcular.`);
      }
    }

    // 7. Brechas de soporte.
    const { rows: gaps } = await pg.query(
      `select gap_severity, gap_code, count(*)::int n
         from v_output_batch_support_gaps where organization_id = $1
        group by 1, 2
        order by case gap_severity when 'critical' then 0 when 'warning' then 1 else 2 end, n desc`,
      [orgId]
    );
    h("Brechas de soporte");
    if (gaps.length === 0) {
      console.log("  (sin brechas)");
    } else {
      for (const g of gaps) console.log(`  [${g.gap_severity}] ${g.gap_code}: ${g.n}`);
    }

    // 8. Semáforo del flujo guiado.
    const { rows: readiness } = await pg.query(
      `select readiness_level, count(*)::int n
         from v_output_batch_readiness where organization_id = $1
        group by 1 order by 1`,
      [orgId]
    );
    h("Semáforo del flujo guiado");
    if (readiness.length === 0) console.log("  (sin lotes producidos)");
    for (const r of readiness) console.log(`  ${r.readiness_level}: ${r.n}`);

    // 9. Conclusiones.
    h("Diagnóstico (causas probables)");
    if (findings.length === 0) {
      console.log("  ✅ No se detectan causas de bloqueo: los datos de la organización se ven consistentes.");
    } else {
      findings.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    }
    console.log(
      "\nNada fue modificado (solo lectura). Guía de soporte: docs/SUPPORT_GUIDE.md"
    );
  } finally {
    await pg.end().catch(() => undefined);
  }
}

if (process.argv[1]?.includes("diagnose-org")) {
  main().catch((err) => {
    console.error(`❌ Error inesperado: ${(err as Error).message}`);
    process.exit(1);
  });
}
