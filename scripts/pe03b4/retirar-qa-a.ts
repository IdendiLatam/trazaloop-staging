/**
 * Trazaloop · PE-03B4 · Parte 1 · Retirar a `qa-a` como superadministrador.
 * ---------------------------------------------------------------------------
 * SOLO CONTRA STAGING. Aborta si la URL no es la del proyecto de Staging.
 *
 *
 * QUÉ HACE, Y QUÉ NO
 *
 * Cambia UNA columna de UNA fila: `platform_staff.status`, de `active` a
 * `revoked`, con la misma semántica que usa la consola —que es un `update` de
 * ese campo y nada más, ver `updatePlatformStaffStatus`—.
 *
 * NO borra la identidad de Auth, no cambia el correo, no restablece ni mira la
 * contraseña, no toca la autoría histórica y no roza los datos de ninguna
 * empresa. `qa-a` publicó la política de privacidad v1.1 y las quince
 * respuestas de seguridad en Staging: esas publicaciones siguen atribuidas a
 * ella, y tienen que seguir estándolo. Retirar un acceso no es borrar a quien
 * hizo algo.
 *
 *
 * EL ORDEN IMPORTA
 *
 * Primero se comprueba que `idendilatam@gmail.com` es superadministrador
 * ACTIVO. Si no lo fuera, revocar a `qa-a` dejaría Staging sin ningún
 * superadministrador humano y sin nadie con quien arreglarlo. Es la regla de no
 * quedarse sin puerta, y por eso este guion se niega a seguir en ese caso.
 *
 * Después se revoca. Y después se vuelve a leer la base para comprobar el
 * estado final, en vez de dar por hecho que el `update` hizo lo que se pedía.
 *
 *
 * CÓMO SE EJECUTA
 *
 * Las credenciales de Staging NO viven en el repositorio ni en `.env.local`, a
 * propósito: las pone quien ejecuta, en el entorno de la orden.
 *
 *   STAGING_SUPABASE_URL=... STAGING_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/pe03b4/retirar-qa-a.ts
 *
 * Se puede pasar `--dry-run` para ver el estado actual sin escribir nada.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.STAGING_SUPABASE_URL;
const SERVICE = process.env.STAGING_SERVICE_ROLE_KEY;

const REF_STAGING = "qchzkxbnbqeyuxinipln";
const HUMANO = "idendilatam@gmail.com";
const A_RETIRAR = "qa-a@trazaloop-staging.local";

const seco = process.argv.includes("--dry-run");

async function main() {
  if (!URL || !SERVICE) {
    console.error("Faltan STAGING_SUPABASE_URL y STAGING_SERVICE_ROLE_KEY.");
    console.error("No se buscan en ningún fichero: las pone quien ejecuta.");
    process.exit(2);
  }
  if (!URL.includes(REF_STAGING)) {
    console.error(`ABORTADO: la URL no es la de Staging (${REF_STAGING}). URL: ${URL}`);
    process.exit(2);
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // --- Quién es quién ------------------------------------------------------
  const { data: usuarios, error: eU } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (eU) { console.error("No se pudo listar Auth:", eU.message); process.exit(1); }
  const porCorreo = new Map(usuarios.users.map((u) => [u.email ?? "", u]));

  const humano = porCorreo.get(HUMANO);
  const qaA = porCorreo.get(A_RETIRAR);
  if (!humano) { console.error(`No existe ${HUMANO} en Auth.`); process.exit(1); }
  if (!qaA) { console.error(`No existe ${A_RETIRAR} en Auth.`); process.exit(1); }

  const { data: personal, error: eP } = await admin
    .from("platform_staff")
    .select("id, user_id, role_code, status");
  if (eP) { console.error("No se pudo leer platform_staff:", eP.message); process.exit(1); }

  const filaDe = (id: string) => (personal ?? []).find((r) => r.user_id === id) ?? null;
  const fHumano = filaDe(humano.id);
  const fQaA = filaDe(qaA.id);

  console.log("── ANTES ──");
  console.log(`${HUMANO}: ${fHumano ? `${fHumano.role_code}/${fHumano.status}` : "sin fila"}`);
  console.log(`${A_RETIRAR}: ${fQaA ? `${fQaA.role_code}/${fQaA.status}` : "sin fila"}`);

  // --- La puerta de repuesto tiene que existir ANTES de cerrar la vieja ----
  if (!fHumano || fHumano.role_code !== "superadmin" || fHumano.status !== "active") {
    console.error(`\nABORTADO: ${HUMANO} no es superadministrador activo.`);
    console.error("Revocar ahora dejaría Staging sin ningún superadministrador humano.");
    process.exit(1);
  }

  if (!fQaA) { console.log("\nNada que hacer: qa-a no tiene fila de personal."); return; }
  if (fQaA.status === "revoked") { console.log("\nNada que hacer: ya estaba revocada."); return; }

  if (seco) { console.log("\n--dry-run: no se escribe nada."); return; }

  // --- Revocar -------------------------------------------------------------
  // La misma operación que hace la consola: un solo campo. No se borra la fila
  // —eso perdería quién tuvo acceso y hasta cuándo— y no se cambia el papel.
  const { error: eR } = await admin
    .from("platform_staff")
    .update({ status: "revoked" })
    .eq("id", fQaA.id);
  if (eR) { console.error("No se pudo revocar:", eR.message); process.exit(1); }

  // --- Comprobar contra la base, no contra el flujo -----------------------
  const { data: despues, error: eD } = await admin
    .from("platform_staff")
    .select("user_id, role_code, status");
  if (eD) { console.error("No se pudo releer:", eD.message); process.exit(1); }

  const correosActivos = (despues ?? [])
    .filter((r) => r.role_code === "superadmin" && r.status === "active")
    .map((r) => usuarios.users.find((u) => u.id === r.user_id)?.email ?? r.user_id);

  console.log("\n── DESPUÉS ──");
  const fFinal = (despues ?? []).find((r) => r.user_id === qaA.id);
  console.log(`${A_RETIRAR}: ${fFinal ? `${fFinal.role_code}/${fFinal.status}` : "sin fila"}`);
  console.log(`superadministradores ACTIVOS: ${correosActivos.join(", ") || "ninguno"}`);

  const soloElHumano = correosActivos.length === 1 && correosActivos[0] === HUMANO;
  console.log(soloElHumano
    ? "\nPE-03B4 · qa-a RETIRADA · queda un solo superadministrador humano activo."
    : "\nATENCIÓN: el conjunto de superadministradores activos no es el esperado.");
  if (!soloElHumano) process.exit(1);
}

void main();
