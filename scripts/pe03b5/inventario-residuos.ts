/**
 * Trazaloop · PE-03B5 · Inventario de residuos de QA. **SOLO LECTURA.**
 * ---------------------------------------------------------------------------
 * No borra nada. No escribe nada. No llama a ninguna primitiva que mute.
 *
 * Produce el inventario que pide el cierre de PE-03 —cuentas, papeles de
 * plataforma, identidades de tutorial, versiones, objetos del cubo, reservas y
 * preferencias— y **clasifica** cada cosa, que es lo que el encargo pide en vez
 * de borrar a ciegas.
 *
 *
 * POR QUÉ CLASIFICA EN VEZ DE LIMPIAR
 *
 * Porque la limpieza de QA de PE-03B1 borró el objeto de una versión que había
 * sido publicada, y dejó en Staging una inconsistencia que ya no se puede
 * deshacer. La lección quedó escrita: **un objeto referenciado por una versión
 * que se publicó alguna vez no se borra por limpieza de QA**, y la única forma
 * de no repetirlo es que la herramienta no sepa borrar.
 *
 *
 * LAS CINCO CLASES
 *
 *   HISTORICO_SEGURO    · publicado alguna vez. Se conserva, siempre.
 *   QA_ACTIVO_SEGURO    · de QA, en servicio y a propósito (qa-a).
 *   TEMPORAL_RETIRABLE  · nunca publicado, sin referencias, sin reserva viva.
 *   RIESGO_SEGURIDAD    · una cuenta con papel activo que no debería tenerlo.
 *   HISTORIA_INCONSISTENTE · publicado, y sus bytes no están.
 *
 * Solo la tercera es candidata a retirarse, y ni siquiera esta herramienta lo
 * hace: lo dice, y lo hace una persona.
 *
 *
 * CÓMO SE EJECUTA
 *
 * Las credenciales no viven en el repositorio, a propósito:
 *
 *   STAGING_SUPABASE_URL=... STAGING_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/pe03b5/inventario-residuos.ts
 *
 * Contra la base local:
 *
 *   npx tsx scripts/pe03b5/inventario-residuos.ts --local
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const local = process.argv.includes("--local");
if (local) loadEnv({ path: ".env.local" });

const URL = local ? process.env.NEXT_PUBLIC_SUPABASE_URL : process.env.STAGING_SUPABASE_URL;
const SERVICE = local
  ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.STAGING_SERVICE_ROLE_KEY;

const BUCKET = "tutorial-media";
const QA_A = "qa-a@trazaloop-staging.local";
const HUMANO = "idendilatam@gmail.com";
/** El arranque de la base LOCAL: sin él, PE-02 no tiene autor para publicar.
 *  Nunca existe en Staging, y si apareciera allí SÍ sería un hallazgo. */
const ARRANQUE_LOCAL = "local-superadmin@test.trazaloop.dev";

type Clase = "HISTORICO_SEGURO" | "QA_ACTIVO_SEGURO" | "TEMPORAL_RETIRABLE"
  | "RIESGO_SEGURIDAD" | "HISTORIA_INCONSISTENTE";

const filas: { clase: Clase; que: string; detalle: string }[] = [];
const anota = (clase: Clase, que: string, detalle: string) =>
  filas.push({ clase, que, detalle });

/** Lista el cubo a cualquier profundidad. Un prefijo llega sin `id`. */
async function objetos(cli: SupabaseClient, prefijo = ""): Promise<string[]> {
  const { data } = await cli.storage.from(BUCKET).list(prefijo, { limit: 1000 });
  const fuera: string[] = [];
  for (const e of data ?? []) {
    const ruta = prefijo ? `${prefijo}/${e.name}` : e.name;
    if ((e as { id: string | null }).id === null) fuera.push(...await objetos(cli, ruta));
    else fuera.push(ruta);
  }
  return fuera;
}

async function main() {
  if (!URL || !SERVICE) {
    console.error(local
      ? "Faltan las variables de .env.local."
      : "Faltan STAGING_SUPABASE_URL y STAGING_SERVICE_ROLE_KEY.\n"
        + "No se buscan en ningún fichero: las pone quien ejecuta.");
    process.exit(2);
  }
  const cli = createClient(URL, SERVICE, { auth: { persistSession: false } });
  console.log(`\nInventario de residuos · ${local ? "LOCAL" : "STAGING"}\n`);

  // --- 1 · Cuentas y papeles de plataforma ---------------------------------
  const { data: usuarios } = await cli.auth.admin.listUsers({ perPage: 1000 });
  const porId = new Map((usuarios?.users ?? []).map((u) => [u.id, u]));
  type Staff = { user_id: string; role_code: string; status: string };
  const { data: personalCrudo } = await cli.from("platform_staff")
    .select("user_id, role_code, status");
  const personal = (personalCrudo ?? []) as unknown as Staff[];

  console.log("── PERSONAL DE PLATAFORMA ──");
  for (const r of personal) {
    const u = porId.get(r.user_id);
    const correo = u?.email ?? r.user_id;
    const estado = `${r.role_code}/${r.status}`;
    console.log(`  ${correo.padEnd(48)} ${estado}`);
    if (r.status !== "active") continue;
    if (correo === HUMANO) {
      anota("QA_ACTIVO_SEGURO", correo, "superadministrador humano previsto");
    } else if (correo === QA_A) {
      anota("QA_ACTIVO_SEGURO", correo,
        "activo A PROPÓSITO · su retirada se aplazó al corte de producción");
    } else if (correo === ARRANQUE_LOCAL && local) {
      anota("QA_ACTIVO_SEGURO", correo,
        "arranque de la base local · no debe existir en Staging");
    } else if (/probe|sonda|test\.trazaloop\.dev/i.test(correo)) {
      anota("RIESGO_SEGURIDAD", correo, "cuenta de QA con papel de plataforma ACTIVO");
    } else {
      anota("QA_ACTIVO_SEGURO", correo, "cuenta de plataforma no clasificada · revisar");
    }
  }

  // --- 2 · Cuentas de sonda, tengan papel o no -----------------------------
  console.log("\n── CUENTAS DE SONDA ──");
  const sondas = (usuarios?.users ?? []).filter((u) => /probe|sonda/i.test(u.email ?? ""));
  if (sondas.length === 0) console.log("  ninguna");
  for (const u of sondas) {
    const fila = personal.find((r) => r.user_id === u.id);
    const baneada = Boolean((u as { banned_until?: string | null }).banned_until);
    const papel = fila ? `${fila.role_code}/${fila.status}` : "sin papel";
    console.log(`  ${(u.email ?? u.id).padEnd(48)} ${papel} · ${baneada ? "baneada" : "NO baneada"}`);
    if (fila?.status === "active") {
      anota("RIESGO_SEGURIDAD", u.email ?? u.id, "sonda con papel activo");
    } else if (!baneada) {
      anota("TEMPORAL_RETIRABLE", u.email ?? u.id, "sonda sin papel y sin banear");
    } else {
      anota("HISTORICO_SEGURO", u.email ?? u.id, "sonda revocada y baneada · conserva autoría");
    }
  }

  // --- 3 · Tutoriales, versiones y objetos ---------------------------------
  type Tutorial = { id: string; tutorial_type: string; page_key: string | null;
    title: string; status: string };
  const { data: tutorialesCrudos } = await cli.from("platform_tutorials")
    .select("id, tutorial_type, page_key, title, status");
  const tutoriales = (tutorialesCrudos ?? []) as unknown as Tutorial[];
  // El tipo se declara a mano: sin tipos generados, el cliente infiere una
  // unión con `GenericStringError` y TypeScript no deja leer ni una columna.
  type Version = {
    id: string; tutorial_id: string; object_path: string; file_state: string;
    effective_from: string | null; effective_to: string | null;
  };
  const { data: versionesCrudas } = await cli.from("platform_tutorial_versions")
    .select("id, tutorial_id, object_path, file_state, effective_from, effective_to");
  const versiones = (versionesCrudas ?? []) as unknown as Version[];
  const rutas = new Set(await objetos(cli));
  const referenciados = new Set(versiones.map((v) => v.object_path as string));

  // El registro del código: una clave que no está en él no la alcanza nadie.
  const { PAGE_KEYS } = await import("../../lib/modules/page-keys");
  const registro = new Set(PAGE_KEYS.map((p) => p.key));

  console.log("\n── TUTORIALES ──");
  for (const t of tutoriales) {
    const suyas = versiones.filter((v) => v.tutorial_id === t.id);
    const publicadas = suyas.filter((v) => v.effective_from !== null);
    const clave = t.page_key ?? "(bienvenida)";
    const enRegistro = t.page_key === null || registro.has(t.page_key);
    console.log(`  ${clave.padEnd(46)} ${String(t.status).padEnd(8)} `
      + `${suyas.length} versiones (${publicadas.length} publicadas)`
      + `${enRegistro ? "" : "  ← FUERA DEL REGISTRO"}`);
    if (publicadas.length === 0) {
      anota("TEMPORAL_RETIRABLE", `tutorial ${clave}`,
        "nunca publicó nada · se puede retirar entero");
    } else if (!enRegistro) {
      anota("HISTORICO_SEGURO", `tutorial ${clave}`,
        "publicó alguna vez y su clave NO está en el registro: nadie lo alcanza");
    }
  }

  console.log("\n── VERSIONES ──");
  for (const v of versiones) {
    const publicada = v.effective_from !== null;
    const existe = rutas.has(v.object_path as string);
    if (publicada && !existe) {
      anota("HISTORIA_INCONSISTENTE", String(v.object_path),
        "publicada alguna vez y sus bytes NO están · NO se corrige inventando");
    } else if (!publicada && v.file_state === "verified") {
      anota("TEMPORAL_RETIRABLE", String(v.object_path),
        "candidata nunca publicada · se puede descartar desde la consola");
    } else if (!publicada && v.file_state === "failed") {
      anota("TEMPORAL_RETIRABLE", String(v.object_path), "subida fallida");
    } else if (!publicada && v.file_state === "reserved") {
      anota("QA_ACTIVO_SEGURO", String(v.object_path),
        "reserva viva · puede ser una subida larga EN CURSO, no se toca por antigua");
    }
  }
  console.log(`  ${versiones.length} versiones · `
    + `${versiones.filter((v) => v.effective_from !== null).length} publicadas alguna vez`);

  console.log("\n── OBJETOS DEL CUBO ──");
  const huerfanos = [...rutas].filter((r) => !referenciados.has(r));
  console.log(`  ${rutas.size} objetos · ${huerfanos.length} sin ninguna versión que los use`);
  for (const h of huerfanos) {
    anota("TEMPORAL_RETIRABLE", h, "objeto sin versión que lo referencie");
  }

  // --- 4 · Preferencias ----------------------------------------------------
  type Pref = { user_id: string; preference_key: string };
  const { data: prefsCrudas } = await cli.from("user_preferences")
    .select("user_id, preference_key");
  const prefs = (prefsCrudas ?? []) as unknown as Pref[];
  const sinPersona = prefs.filter((p) => !porId.has(p.user_id));
  console.log(`\n── PREFERENCIAS ──\n  ${prefs.length} filas · `
    + `${sinPersona.length} sin persona`);
  for (const p of sinPersona) {
    anota("TEMPORAL_RETIRABLE", `preferencia de ${p.user_id}`, "sin persona");
  }

  // --- 5 · El resumen ------------------------------------------------------
  console.log("\n══ CLASIFICACIÓN ══");
  const orden: Clase[] = ["RIESGO_SEGURIDAD", "HISTORIA_INCONSISTENTE",
    "TEMPORAL_RETIRABLE", "QA_ACTIVO_SEGURO", "HISTORICO_SEGURO"];
  for (const clase of orden) {
    const suyas = filas.filter((f) => f.clase === clase);
    console.log(`\n${clase} · ${suyas.length}`);
    for (const f of suyas) console.log(`  · ${f.que}\n      ${f.detalle}`);
  }

  const riesgos = filas.filter((f) => f.clase === "RIESGO_SEGURIDAD").length;
  console.log(`\n${riesgos === 0
    ? "Sin riesgos de seguridad en el inventario."
    : `ATENCIÓN: ${riesgos} elementos clasificados como riesgo de seguridad.`}`);
  console.log("\nEste guion NO ha escrito nada. Lo retirable lo decide una persona.\n");
}

void main();
