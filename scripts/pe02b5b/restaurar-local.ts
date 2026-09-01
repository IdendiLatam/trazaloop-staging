/**
 * Trazaloop · scripts/pe02b5b/restaurar-local.ts
 * ---------------------------------------------------------------------------
 * Devuelve a la base LOCAL el estado publicado de PE-02 después de una
 * reejecución limpia de migraciones.
 *
 * POR QUÉ HACE FALTA
 *
 * `scripts/replay-local.sh` deja la base vacía: sin personas, sin plantilla y
 * sin nada publicado. Las suites de PE-02B5B comprueban que la política v1.1
 * está vigente y que las quince respuestas de seguridad se ven, así que tras
 * cada reejecución hay que volver a publicarlas o esas suites fallan por una
 * razón que no tiene que ver con lo que comprueban.
 *
 * QUÉ HACE, Y QUÉ NO
 *
 * Crea UNA persona local y la sienta en `platform_staff` para que exista un
 * superadministrador. A partir de ahí no escribe ni una tabla de contenido:
 * `publicar.sql` publica por la vía canónica, con la identidad de esa persona
 * y ejerciendo la comprobación de autorización.
 *
 * EL ASIENTO DIRECTO ES UN ARRANQUE, NO UN ATAJO
 *
 * `add_platform_staff` exige que quien la llama YA sea superadministrador. En
 * una base recién vaciada no hay ninguno, así que el primero no puede nacer por
 * esa puerta — es el mismo arranque que hacen las suites. Solo el primero: la
 * publicación que viene después sí pasa por la puerta.
 *
 * SOLO LOCAL. Aborta si la URL no es local.
 *
 *   Uso:  npx tsx scripts/pe02b5b/restaurar-local.ts   # imprime el uuid
 *         psql "$PG" -v actor="'<uuid>'" -f scripts/pe02b5b/publicar.sql
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!URL || !SERVICE) { console.error("Faltan variables."); process.exit(1); }
  if (!URL.includes("127.0.0.1") && !URL.includes("localhost")) {
    console.error(`ABORTADO: esto es solo para la base LOCAL. URL: ${URL}`);
    process.exit(2);
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const email = "local-superadmin@test.trazaloop.dev";

  // La contraseña es efímera y no se imprime: nadie tiene que entrar con esta
  // cuenta, solo tiene que existir para que la publicación tenga un autor.
  const { data: creado, error: eC } = await admin.auth.admin.createUser({
    email, password: `local-${Math.random().toString(36).slice(2)}-Aa1!`,
    email_confirm: true, user_metadata: { full_name: "Superadmin local" },
  });
  if (eC && !/already/i.test(eC.message)) { console.error(eC.message); process.exit(1); }

  let uid = creado?.user?.id;
  if (!uid) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    uid = data.users.find((u) => u.email === email)?.id;
  }
  if (!uid) { console.error("no se pudo obtener el usuario"); process.exit(1); }

  const { error: eS } = await admin.from("platform_staff")
    .upsert({ user_id: uid, role_code: "superadmin", status: "active" },
      { onConflict: "user_id" });
  if (eS) { console.error("platform_staff:", eS.message); process.exit(1); }

  console.log(uid);
}

void main();
