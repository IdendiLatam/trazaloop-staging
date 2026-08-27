import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trazaloop · QUALITY-11 · §49/§105/§106 · La puerta del barrido programado.
 *
 * POR QUÉ ESTE ENDPOINT Y NO UN SEGUNDO PLANIFICADOR
 *
 * El repositorio no tenía ninguna infraestructura de tareas programadas: ni
 * `vercel.json` con crons, ni `pg_cron`, ni funciones de borde. Crear una
 * habría significado, además, tocar configuración COMPARTIDA con Production —
 * un `crons` en `vercel.json` se aplica a los despliegues de producción, y este
 * sprint tiene prohibido tocar Production—.
 *
 * Así que la decisión es la mínima que resuelve el problema sin romper el
 * aislamiento: un endpoint HTTP, protegido por un secreto compartido, que
 * cualquier planificador externo puede llamar —y que también se puede llamar a
 * mano contra Staging para comprobar que funciona—. El día que se quiera un
 * cron, se apunta al mismo endpoint: no hay un segundo motor esperando.
 *
 * QUÉ NO HACE
 *
 * · No evalúa nada por su cuenta: llama a `quality_automation_run`, que es la
 *   MISMA función que usan el botón «Ejecutar ahora» y la simulación.
 * · No acepta reglas, condiciones ni sujetos desde la petición. Solo la empresa
 *   —y opcionalmente el día de negocio, para las pruebas—.
 * · No devuelve nada que no sea el recuento de lo que hizo.
 */

function unauthorized() {
  // Sin pistas: quien no trae el secreto no merece un mensaje distinto de quien
  // se equivoca de URL.
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function POST(request: Request) {
  const secreto = process.env.AUTOMATION_RUNNER_SECRET;
  if (!secreto || secreto.length < 16) {
    // Falla cerrada: sin secreto configurado, el endpoint no existe.
    return unauthorized();
  }
  const enviado = request.headers.get("x-automation-secret");
  if (enviado !== secreto) return unauthorized();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return unauthorized();

  let cuerpo: { organization_id?: string; business_date?: string } = {};
  try {
    cuerpo = (await request.json()) as typeof cuerpo;
  } catch {
    cuerpo = {};
  }

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const FECHA = /^\d{4}-\d{2}-\d{2}$/;
  const orgs: string[] = [];
  if (typeof cuerpo.organization_id === "string") {
    if (!UUID.test(cuerpo.organization_id)) return unauthorized();
    orgs.push(cuerpo.organization_id);
  }
  const dia = typeof cuerpo.business_date === "string" && FECHA.test(cuerpo.business_date)
    ? cuerpo.business_date : null;

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Sin empresa concreta, se barren las que tienen el motor activo.
  if (orgs.length === 0) {
    const { data } = await supabase
      .from("quality_automation_settings")
      .select("organization_id").eq("is_enabled", true);
    for (const row of data ?? []) orgs.push(row.organization_id as string);
  }

  const resultados: { organization_id: string; run_id?: string; error?: string }[] = [];
  for (const org of orgs) {
    // §45 · Una empresa que falla no arrastra a las demás.
    const { data, error } = await supabase.rpc("quality_automation_run", {
      p_organization_id: org, p_mode: "live", p_rule_id: null, p_today: dia,
    });
    resultados.push(error
      ? { organization_id: org, error: error.message }
      : { organization_id: org, run_id: data as string });
  }

  return NextResponse.json({
    organizations: orgs.length,
    runs: resultados.filter((r) => r.run_id).length,
    failures: resultados.filter((r) => r.error).length,
    results: resultados,
  });
}
