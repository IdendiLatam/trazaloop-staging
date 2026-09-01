/**
 * Trazaloop · PE-04B3 · Reconciliación de almacenamiento.
 *
 * Compara lo que la BASE cree que hay con lo que STORAGE tiene de verdad, por
 * empresa. NO borra nada, NO corrige nada y NO cambia ninguna cuota: informa.
 * Corregir a ciegas un desajuste de almacenamiento es cómo se pierden archivos
 * de clientes.
 *
 * Se ejecuta adoptando la identidad de una persona de plataforma real —igual
 * que la sombra de PE-04B1—, porque `organization_storage_drift` es
 * `security definer` y comprueba `is_platform_staff()`: correrlo con la clave
 * de servicio (sin `auth.uid()`) devolvería un error, y correrlo sin
 * comprobar la identidad devolvería CERO FILAS, que se lee como «todo bien» y
 * es la peor de las respuestas.
 *
 * Uso:
 *   npx tsx --conditions=react-server scripts/pe04b3/reconciliacion.ts \
 *     --email <persona-de-plataforma> --password <clave>
 *   (opcional) --org <uuid>   para una sola empresa
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY en .env.local.");
  process.exit(1);
}

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const CLASES = [
  "MISSING_OBJECT",    // la base declara un archivo que en Storage no está
  "UNTRACKED_OBJECT",  // Storage tiene un objeto que nadie declara ni ampara
  "UNKNOWN_SIZE",      // el objeto existe pero no dice cuánto ocupa
  "UNDECLARED_SIZE",   // la fila existe pero no dice cuánto ocupa
  "SIZE_MISMATCH",     // los dos lo dicen y no coinciden
] as const;

type Fila = {
  bucket_id: string; object_path: string;
  declared_bytes: number | null; physical_bytes: number | null;
  drift_class: string;
};

async function main() {
  const email = arg("email");
  const password = arg("password");
  if (!email || !password) {
    console.error("Faltan --email y --password de una persona de plataforma.");
    process.exit(1);
  }

  const operador = createClient(URL!, SERVICE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const actor = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: eLogin } = await actor.auth.signInWithPassword({ email, password });
  if (eLogin) {
    console.error(`No se pudo iniciar sesión: ${eLogin.message}`);
    process.exit(1);
  }

  const soloOrg = arg("org");
  const { data: orgs, error: eOrgs } = await operador
    .from("organizations").select("id, name").order("name");
  if (eOrgs) {
    console.error(`No se pudo leer el inventario de empresas: ${eOrgs.message}`);
    process.exit(1);
  }
  const lista = (orgs ?? []).filter((o) => !soloOrg || o.id === soloOrg);

  console.log(`\nPE-04B3 · Reconciliación · ${lista.length} empresa(s)\n`);

  const total: Record<string, number> = Object.fromEntries(CLASES.map((c) => [c, 0]));
  let ilegibles = 0;
  const detalle: string[] = [];

  for (const org of lista) {
    const { data, error } = await actor.rpc("organization_storage_drift", {
      p_organization_id: org.id,
    });
    if (error) {
      // Un fallo de lectura NO es «sin deriva»: se cuenta aparte y se dice.
      ilegibles += 1;
      detalle.push(`  ⚠ ${org.name}: no se pudo leer (${error.message})`);
      continue;
    }
    const filas = (data ?? []) as unknown as Fila[];
    if (filas.length === 0) continue;

    detalle.push(`\n  ${org.name} · ${filas.length} desajuste(s)`);
    for (const f of filas) {
      total[f.drift_class] = (total[f.drift_class] ?? 0) + 1;
      detalle.push(
        `    ${f.drift_class.padEnd(16)} ${f.bucket_id}/${f.object_path}` +
          `  declarado=${f.declared_bytes ?? "—"} físico=${f.physical_bytes ?? "—"}`
      );
    }
  }

  console.log(detalle.length ? detalle.join("\n") : "  Sin desajustes.");
  console.log("\n  Resumen");
  for (const c of CLASES) console.log(`    ${c.padEnd(16)} ${total[c] ?? 0}`);
  console.log(`    ${"ILEGIBLES".padEnd(16)} ${ilegibles}`);
  console.log(
    "\n  Nada se ha modificado. Qué hacer con cada clase está en " +
      "docs/platform-experience/PE_04B3_STORAGE_RECONCILIATION.md\n"
  );
}

void main();
