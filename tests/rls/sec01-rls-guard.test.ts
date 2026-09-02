/**
 * Trazaloop · SEC-01 · Guardia global de RLS y privilegios.
 *
 * POR QUÉ EXISTE
 *
 * El incidente lo descubrió un correo del Security Advisor de Supabase. Eso
 * significa que durante siete migraciones —0128 a 0132— nadie del lado de este
 * repositorio se dio cuenta de que se estaban creando tablas de `public` sin
 * RLS. Un guardia que pregunte al ESTADO REAL de la base convierte ese hallazgo
 * en algo que se descubre solo, y en el momento en que se introduce.
 *
 * Pregunta a la base, no al SQL de las migraciones: una migración demuestra la
 * intención de quien la escribió; el estado demuestra lo que hay puesto.
 *
 * Correr: npm run test:sec01-guard
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });

/**
 * Las ÚNICAS políticas que pueden alcanzar al rol `anon`, con su motivo.
 * Cualquier otra es una decisión nueva que alguien tiene que justificar aquí.
 */
const POLITICAS_ANON_PERMITIDAS: Record<string, string> = {
  "legal_documents/legal_documents_select_public":
    "Los términos y la política de privacidad vigentes tienen que poder leerse ANTES de "
    + "iniciar sesión: si hubiera que aceptarlos sin poder leerlos, la aceptación no valdría nada.",
};

/**
 * Vistas que corren como PROPIETARIO (sin `security_invoker`) y están
 * concedidas a `authenticated` o `anon`. Cada una tiene que filtrar por dentro,
 * porque su definición ignora la RLS de las tablas que cruza. Se enumeran con
 * el mecanismo que las hace seguras.
 */
const VISTAS_DEFINER_CLASIFICADAS: Record<string, string> = {
  v_faq_public: "Contenido publicado a propósito para quien no ha entrado.",
  v_faq_public_categories: "Idem.",
  v_faq_authenticated: "FAQ para quien ya entró; contenido del producto, no de ninguna empresa.",
  v_help_effective: "Ayuda contextual publicada; contenido del producto.",
  v_tutorial_current: "Vídeos de tutorial publicados; contenido del producto.",
  v_intelligence_usage_platform: "Filtra con `is_platform_staff()` DENTRO de la vista.",
  v_intelligence_usage_platform_by_use_case: "Filtra con `is_platform_staff()` DENTRO de la vista.",
  v_platform_organizations: "Filtra con `is_platform_staff()` DENTRO de la vista.",
  v_platform_organization_members: "Filtra con `is_platform_staff()` DENTRO de la vista.",
  v_platform_organization_invitations: "Filtra con `is_platform_staff()` DENTRO de la vista.",
  v_platform_support_ticket_summary: "Filtra con `is_platform_staff()` DENTRO de la vista.",
  v_organization_plan_usage: "Acotada a la empresa de quien pregunta dentro de la vista.",
  v_organization_module_usage: "Idem.",
  v_organization_onboarding_status: "Idem.",
};

async function main() {
  console.log("\nSEC-01 · Guardia global\n");

  await check("1. CERO tablas base de `public` con RLS desactivado", async () => {
    // El invariante del incidente. Sin excepciones silenciosas: una tabla
    // global de solo lectura también lleva RLS y política explícita, porque
    // «todos pueden leer esto» y «nadie ha configurado nada» tienen que
    // distinguirse mirando la base.
    const { data, error } = await admin.rpc("public_tables_without_rls");
    assert(!error, `no se pudo consultar: ${error?.message}`);
    const filas = (data ?? []) as { schema_name: string; table_name: string }[];
    assert(filas.length === 0,
      `${filas.length} tabla(s) sin RLS: ${filas.map((t) => `${t.schema_name}.${t.table_name}`).join(", ")}`);
  });

  await check("2. Ningún privilegio de `anon`/`authenticated` sobre una tabla sin RLS", async () => {
    // Es la forma EXACTA que tuvo el incidente: un `grant` sin RLS es acceso
    // efectivo. Con RLS puesto y sin política, el mismo `grant` es inerte.
    const { data, error } = await admin.rpc("public_tables_with_unexpected_grants");
    assert(!error, `no se pudo consultar: ${error?.message}`);
    const filas = (data ?? []) as { table_name: string; grantee: string; privilege_type: string }[];
    assert(filas.length === 0,
      `privilegios expuestos: ${filas.map((f) => `${f.table_name}/${f.grantee}/${f.privilege_type}`).join(", ")}`);
  });

  await check("3. Solo las políticas declaradas alcanzan a `anon`", async () => {
    const { data, error } = await admin.rpc("public_policies_reaching_anon");
    assert(!error, `no se pudo consultar: ${error?.message}`);
    const filas = (data ?? []) as { table_name: string; policy_name: string }[];
    const nuevas = filas
      .map((f) => `${f.table_name}/${f.policy_name}`)
      .filter((k) => !(k in POLITICAS_ANON_PERMITIDAS));
    assert(nuevas.length === 0,
      `políticas nuevas que abren a anon: ${nuevas.join(", ")}. `
      + "Si es legítimo, añádelas a POLITICAS_ANON_PERMITIDAS con su motivo.");
    // Y las declaradas siguen existiendo: si desaparece la de los documentos
    // legales, nadie podría leer los términos antes de aceptarlos.
    for (const k of Object.keys(POLITICAS_ANON_PERMITIDAS)) {
      assert(filas.some((f) => `${f.table_name}/${f.policy_name}` === k),
        `desapareció la política declarada ${k}`);
    }
  });

  await check("4. Toda vista que corre como propietario está clasificada", async () => {
    // Una vista sin `security_invoker` ignora la RLS de lo que cruza: es la
    // segunda vía de exposición, y por eso se enumera con el mecanismo que
    // la hace segura en cada caso.
    const { data, error } = await admin.rpc("public_owner_views_granted");
    assert(!error, `no se pudo consultar: ${error?.message}`);
    const filas = (data ?? []) as { view_name: string; grantee: string }[];
    const sinClasificar = [...new Set(filas.map((f) => f.view_name))]
      .filter((v) => !(v in VISTAS_DEFINER_CLASIFICADAS));
    assert(sinClasificar.length === 0,
      `vistas de propietario sin clasificar: ${sinClasificar.join(", ")}. `
      + "Cada una debe filtrar por dentro y decir cómo.");
  });

  await check("5. Y las vistas de plataforma no devuelven nada a quien no lo es", async () => {
    // No basta con leer su definición: se comprueba preguntando con una
    // identidad real que no es personal de plataforma.
    const email = `sec01-guard-${Date.now()}@test.trazaloop.dev`;
    const password = "Trazaloop-Test-1234";
    const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const uid = (data.user as { id: string }).id;
    const cli: SupabaseClient = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await cli.auth.signInWithPassword({ email, password });
    try {
      for (const v of ["v_intelligence_usage_platform", "v_intelligence_usage_platform_by_use_case",
                       "v_platform_organizations"]) {
        const { data: filas } = await cli.from(v).select("*");
        assert((filas?.length ?? 0) === 0, `${v} devolvió ${filas?.length} filas a alguien sin rol`);
      }
    } finally {
      await admin.auth.admin.deleteUser(uid);
    }
  });

  console.log(`\nSEC-01 · guardia: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
