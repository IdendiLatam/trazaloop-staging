/**
 * Trazaloop v1.0.0 · PRECHECK DE VARIABLES DE ENTORNO
 * scripts/release/v1/precheck-env.ts   ·   npm run precheck:env
 *
 * COMPRUEBA ÚNICAMENTE LA **PRESENCIA** DE LAS VARIABLES. NUNCA IMPRIME
 * VALORES DE CLAVES, NI ENTEROS NI TRUNCADOS NI ENMASCARADOS.
 *
 * Lo único que se imprime de un valor es:
 *   · el *project ref* de NEXT_PUBLIC_SUPABASE_URL — que es información
 *     PÚBLICA (viaja en cada petición del navegador), y es imprescindible
 *     para confirmar que el entorno apunta al proyecto correcto;
 *   · la interpretación booleana de TEXTILES_MODULE_ENABLED, que no es un
 *     secreto sino un interruptor funcional documentado.
 *
 * Todo lo demás se reporta solo como PRESENTE o FALTA.
 *
 * USO
 *   npm run precheck:env
 *   npm run precheck:env -- --env=production --expect-project-ref=abcdefghijklm
 *   npm run precheck:env -- --env=preview    --expect-project-ref=<ref de staging>
 *
 * OPCIONES
 *   --env=<development|preview|production>
 *       Entorno que se está verificando. Si se omite, se deduce de
 *       VERCEL_ENV y, en su defecto, de NODE_ENV.
 *   --expect-project-ref=<ref>
 *       Project ref de Supabase que DEBE corresponder a este entorno.
 *       Si no coincide con el de NEXT_PUBLIC_SUPABASE_URL, falla.
 *   --no-dotenv
 *       No cargar .env.local (útil al ejecutarlo dentro de un build de
 *       Vercel, donde las variables ya están inyectadas).
 *
 * SALIDA
 *   exit 0 → todo lo obligatorio está presente y es coherente.
 *   exit 1 → falta algo obligatorio o hay una incoherencia.
 *
 * NO se conecta a ninguna red. NO lee la base de datos. NO despliega.
 */
import { config as loadEnv } from "dotenv";

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);

function flag(name: string): string | null {
  const withEq = argv.find((a) => a.startsWith(`--${name}=`));
  if (withEq) return withEq.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith("--")) {
    return argv[idx + 1];
  }
  return null;
}
const has = (name: string) => argv.includes(`--${name}`);

if (!has("no-dotenv")) {
  loadEnv({ path: ".env.local" });
}

type EnvName = "development" | "preview" | "production";

function resolveEnvName(): { name: EnvName; source: string } {
  const explicit = flag("env");
  if (explicit) {
    if (explicit !== "development" && explicit !== "preview" && explicit !== "production") {
      console.error(
        `\n❌ --env=${explicit} no es válido. Usa development, preview o production.\n`
      );
      process.exit(1);
    }
    return { name: explicit, source: "--env" };
  }
  // Misma precedencia que lib/env.ts: VERCEL_TARGET_ENV → VERCEL_ENV.
  const target = process.env.VERCEL_TARGET_ENV;
  if (target === "production" || target === "preview" || target === "development") {
    return { name: target, source: "VERCEL_TARGET_ENV" };
  }
  const vercel = process.env.VERCEL_ENV;
  if (vercel === "production" || vercel === "preview" || vercel === "development") {
    return { name: vercel, source: "VERCEL_ENV" };
  }
  // Un target de Vercel personalizado (p. ej. "qa") no es producción.
  if (target || vercel) {
    return { name: "preview", source: "VERCEL_TARGET_ENV/VERCEL_ENV (valor personalizado → preview)" };
  }
  return {
    name: process.env.NODE_ENV === "production" ? "production" : "development",
    source: "NODE_ENV (sin variables Vercel)",
  };
}

const ENVIRONMENT = resolveEnvName();

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let failures = 0;
let warnings = 0;

const ok = (msg: string) => console.log(`  ✅ ${msg}`);
const warn = (msg: string, hint?: string) => {
  warnings++;
  console.log(`  ⚠️  ${msg}${hint ? `\n       → ${hint}` : ""}`);
};
const fail = (msg: string, hint?: string) => {
  failures++;
  console.log(`  ❌ ${msg}${hint ? `\n       → ${hint}` : ""}`);
};

/** true si la variable está definida y no es una cadena vacía. NUNCA
 *  devuelve ni registra el valor. */
function isPresent(name: string): boolean {
  const raw = process.env[name];
  return typeof raw === "string" && raw.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Definición del contrato de variables
// ---------------------------------------------------------------------------
type VarSpec = {
  name: string;
  /** Nombre heredado aceptado como respaldo temporal server-safe. */
  legacy?: string;
  description: string;
  /**
   * En "development" (local) la variable es RECOMENDADA pero su ausencia se
   * degrada a advertencia en vez de fallo: el código funciona sin ella
   * (p. ej. la cookie de empresa activa viaja sin firma con un aviso).
   * En Production y Preview es SIEMPRE obligatoria.
   */
  optionalInLocal?: boolean;
};

/**
 * CONTRATO REAL Y ÚNICO de variables que consume el CÓDIGO DEL PRODUCTO.
 * Derivado del barrido de `process.env` en app/, components/, lib/, server/
 * y proxy.ts — no de una lista escrita a mano.
 *
 * Todas son obligatorias en Production y en Preview. La diferencia entre
 * ambos ambientes no es QUÉ variables se exigen, sino a QUÉ proyecto
 * Supabase apuntan (Production→producción, Preview→staging) y el valor de
 * TEXTILES_MODULE_ENABLED / NEXT_PUBLIC_SITE_URL. Eso se comprueba en las
 * secciones 3 y 5, no aquí.
 */
const REQUIRED: VarSpec[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    description: "URL del proyecto Supabase de este ambiente (pública).",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    legacy: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    description: "Clave pública sujeta a RLS.",
  },
  {
    name: "SUPABASE_SECRET_KEY",
    legacy: "SUPABASE_SERVICE_ROLE_KEY",
    description: "Clave secreta, solo servidor. Jamás con prefijo NEXT_PUBLIC_.",
  },
  {
    name: "TEXTILES_MODULE_ENABLED",
    description: "Kill switch global de Trazaloop Textiles (server-only).",
  },
  {
    name: "PUBLIC_REGISTRATION_ENABLED",
    description:
      "Kill switch del registro público (server-only). Production técnico = false; " +
      "Preview/staging = true. Solo «true» o «1» habilitan; fail-closed.",
  },
  {
    name: "ACTIVE_ORG_COOKIE_SECRET",
    optionalInLocal: true,
    description:
      "Firma HMAC de la cookie de empresa activa (lib/auth/active-organization.ts). " +
      "Sin ella la cookie viaja SIN firma y el código emite una advertencia. " +
      "Debe ser DISTINTA en cada ambiente.",
  },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    description:
      "URL pública de la app en este ambiente. La consumen el restablecimiento " +
      "de contraseña, los enlaces de invitación (equipo y plataforma) y los " +
      "enlaces de compartición de pasaportes. Sin ella esos enlaces salen rotos.",
  },
];

// ---------------------------------------------------------------------------
console.log("");
console.log("==========================================================");
console.log(" Trazaloop v1.0.0 · precheck de variables (solo PRESENCIA)");
console.log("==========================================================");
console.log("");
console.log(`  Entorno evaluado : ${ENVIRONMENT.name.toUpperCase()}`);
console.log(`  Deducido de      : ${ENVIRONMENT.source}`);
console.log("");
console.log("  Este precheck NO imprime el valor de ninguna clave.");
console.log("");

// ---------------------------------------------------------------------------
// 1. Contrato de variables obligatorias (mismo conjunto en Prod y Preview)
// ---------------------------------------------------------------------------
console.log("--- 1. Variables obligatorias (contrato real v1.0.0) ---");

const isLocal = ENVIRONMENT.name === "development";

for (const spec of REQUIRED) {
  const primary = isPresent(spec.name);
  const legacy = spec.legacy ? isPresent(spec.legacy) : false;
  // En local, una variable marcada optionalInLocal ausente es advertencia,
  // no fallo. En Production y Preview es siempre fallo.
  const missingSeverity: (msg: string, hint?: string) => void =
    isLocal && spec.optionalInLocal ? warn : fail;

  if (primary && legacy) {
    ok(`${spec.name} · PRESENTE`);
    warn(
      `${spec.legacy} también está definida (nombre HEREDADO, compatibilidad).`,
      "La variable principal es la primera; el heredado es solo respaldo " +
        "temporal server-safe, nunca la configuración recomendada. Planifica " +
        "retirarlo una vez migrados todos los ambientes."
    );
  } else if (primary) {
    ok(`${spec.name} · PRESENTE`);
  } else if (legacy) {
    warn(
      `${spec.name} · FALTA — ${spec.legacy} PRESENTE (respaldo HEREDADO).`,
      "La aplicación funciona, pero la variable principal de v1.0.0 es " +
        `${spec.name}. El heredado es compatibilidad temporal: configúrala.`
    );
  } else {
    missingSeverity(
      `${spec.name} · FALTA`,
      `${spec.description}${spec.legacy ? ` (tampoco está el heredado ${spec.legacy})` : ""}` +
        (isLocal && spec.optionalInLocal
          ? " · En local se degrada con advertencia; en Production/Preview es obligatoria."
          : "")
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Coherencia del proyecto Supabase
// ---------------------------------------------------------------------------
console.log("");
console.log("--- 3. Coherencia del proyecto Supabase ---");

/** Extrae el project ref del host `<ref>.supabase.co`. Información PÚBLICA. */
function projectRefFromUrl(raw: string): string | null {
  try {
    const host = new URL(raw).hostname;
    const m = /^([a-z0-9]{16,})\.supabase\.(co|in)$/i.exec(host);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const expectedRef = flag("expect-project-ref");
let actualRef: string | null = null;

if (!rawUrl) {
  fail("No se puede comprobar el proyecto: NEXT_PUBLIC_SUPABASE_URL falta.");
} else {
  actualRef = projectRefFromUrl(rawUrl);
  if (!actualRef) {
    warn(
      "NEXT_PUBLIC_SUPABASE_URL no tiene la forma https://<project-ref>.supabase.co",
      "Si usas un dominio propio delante de Supabase, comprueba el proyecto a mano."
    );
  } else {
    ok(`Project ref detectado: ${actualRef} (dato público)`);

    if (expectedRef) {
      if (actualRef === expectedRef) {
        ok(`Coincide con --expect-project-ref (${expectedRef})`);
      } else {
        fail(
          `El project ref NO coincide con el esperado.`,
          `Esperado: ${expectedRef} · Detectado: ${actualRef}. ` +
            `Este entorno está apuntando al proyecto Supabase equivocado. ` +
            `NO despliegues hasta corregirlo.`
        );
      }
    } else {
      warn(
        "No se indicó --expect-project-ref: no se puede confirmar que sea el proyecto correcto.",
        `Vuelve a ejecutarlo con --expect-project-ref=<ref>. ` +
          `Recuerda: Production debe apuntar al proyecto de PRODUCCIÓN y ` +
          `Preview al de STAGING — nunca al revés.`
      );
    }
  }
}

// A partir de v1.0.0 el ambiente NO se decide por el nombre del dominio:
// lo deciden VERCEL_TARGET_ENV / VERCEL_ENV (lib/env.ts). Un
// NEXT_PUBLIC_SITE_URL con «vercel.app» en Production es perfectamente
// válido. Solo se avisa (no se falla) si el sitio parece de staging pero el
// ambiente dice Production, por si hubiera un cruce de configuración.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
if (siteUrl && ENVIRONMENT.name === "production" && /staging/i.test(siteUrl)) {
  warn(
    "NEXT_PUBLIC_SITE_URL de Production contiene «staging».",
    "No afecta al distintivo de ambiente (ya no depende del dominio), pero " +
      "revisa que no sea un cruce de configuración: en Production la URL " +
      "pública debería ser la de producción."
  );
}

// ---------------------------------------------------------------------------
// 4. Higiene de secretos
// ---------------------------------------------------------------------------
console.log("");
console.log("--- 4. Higiene de secretos (sin imprimir valores) ---");

const leaked = Object.keys(process.env).filter(
  (k) =>
    k.startsWith("NEXT_PUBLIC_") &&
    /(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|DB_URL)/i.test(k)
);

if (leaked.length > 0) {
  fail(
    `Hay ${leaked.length} variable(s) con prefijo NEXT_PUBLIC_ y nombre de secreto: ${leaked.join(", ")}`,
    "Todo lo que lleva NEXT_PUBLIC_ se inlinea en el bundle del navegador. " +
      "Renómbralas sin ese prefijo INMEDIATAMENTE y rota la clave expuesta."
  );
} else {
  ok("Ninguna variable NEXT_PUBLIC_* tiene nombre de secreto.");
}

if (isPresent("SUPABASE_DB_URL")) {
  if (ENVIRONMENT.name === "production") {
    warn(
      "SUPABASE_DB_URL está presente en un entorno marcado como production.",
      "Esa cadena es solo para verificaciones locales del operador. " +
        "NUNCA debe configurarse en Vercel."
    );
  } else {
    ok("SUPABASE_DB_URL presente (uso local del operador).");
  }
}

// ---------------------------------------------------------------------------
// 5. Kill switch de Textiles
// ---------------------------------------------------------------------------
console.log("");
console.log("--- 5. Kill switch de Trazaloop Textiles ---");

const textilesRaw = process.env.TEXTILES_MODULE_ENABLED;
const textilesOn = textilesRaw === "true" || textilesRaw === "1";

if (!isPresent("TEXTILES_MODULE_ENABLED")) {
  // Ya contabilizado como fallo en la sección 1; aquí solo se explica.
  console.log(
    "     TEXTILES_MODULE_ENABLED ausente → el módulo queda APAGADO " +
      "(apagado por defecto, por diseño)."
  );
} else {
  console.log(`     Interpretación: ${textilesOn ? "ENCENDIDO" : "APAGADO"}`);
  if (ENVIRONMENT.name === "production" && !textilesOn) {
    fail(
      "TEXTILES_MODULE_ENABLED no está en «true» en Production.",
      "Trazaloop Textiles es un módulo funcional de v1.0.0: en producción " +
        "debe valer exactamente true."
    );
  } else if (textilesOn) {
    ok("Textiles encendido.");
  } else {
    warn("Textiles apagado en este entorno.", "Correcto solo si es deliberado.");
  }
}

// ---------------------------------------------------------------------------
// 5b. Kill switch del REGISTRO PÚBLICO
// ---------------------------------------------------------------------------
//
// El flag NO es un secreto: describe un modo de operación, no una
// credencial. Por eso sí puede imprimirse su interpretación (HABILITADO /
// DESHABILITADO) — nunca se imprime ninguna clave.
//
// Estado esperado por defecto:
//   · production → DESHABILITADO (hito A: despliegue técnico sin usuarios
//     externos). Se puede exigir lo contrario con --expect-registration.
//   · preview    → habilitado o deshabilitado, ambos válidos.
// ---------------------------------------------------------------------------
console.log("");
console.log("--- 5b. Kill switch del registro público ---");

const REGISTRATION_VALID_VALUES = ["true", "false", "1", "0"];
const registrationRaw = process.env.PUBLIC_REGISTRATION_ENABLED;
const registrationOn = registrationRaw === "true" || registrationRaw === "1";

/** Estado exigido explícitamente por el operador, si lo indicó. */
const expectRegistration = flag("expect-registration"); // "enabled" | "disabled"

if (!isPresent("PUBLIC_REGISTRATION_ENABLED")) {
  // Ya contabilizado como fallo en la sección 1; aquí solo se explica.
  console.log(
    "     PUBLIC_REGISTRATION_ENABLED ausente → el registro queda " +
      "DESHABILITADO (fail-closed, por diseño)."
  );
} else {
  console.log(`     Interpretación: ${registrationOn ? "HABILITADO" : "DESHABILITADO"}`);

  if (!REGISTRATION_VALID_VALUES.includes(registrationRaw ?? "")) {
    fail(
      "PUBLIC_REGISTRATION_ENABLED tiene un valor no admitido.",
      `Valores admitidos: ${REGISTRATION_VALID_VALUES.join(", ")}. ` +
        "Cualquier otro se comporta como DESHABILITADO, pero casi siempre " +
        "es un error de configuración."
    );
  } else if (expectRegistration === "enabled" || expectRegistration === "disabled") {
    // Comprobación explícita pedida por el operador.
    const wanted = expectRegistration === "enabled";
    if (registrationOn === wanted) {
      ok(`El registro está ${wanted ? "HABILITADO" : "DESHABILITADO"}, como se esperaba.`);
    } else {
      fail(
        `Se esperaba el registro ${wanted ? "HABILITADO" : "DESHABILITADO"}, ` +
          `pero está ${registrationOn ? "HABILITADO" : "DESHABILITADO"}.`,
        "Corrige PUBLIC_REGISTRATION_ENABLED y crea un deployment nuevo."
      );
    }
  } else if (ENVIRONMENT.name === "production" && registrationOn) {
    // Regla documentada por defecto para el hito técnico de Production.
    fail(
      "PUBLIC_REGISTRATION_ENABLED está HABILITADO en Production.",
      "Para el hito A (despliegue técnico) debe valer false: /register no " +
        "puede quedar abierto mientras siguen pendientes los gates de " +
        "apertura comercial (paquete jurídico aprobado y SMTP personalizado " +
        "probado). Si la apertura comercial ya fue autorizada, ejecuta este " +
        "precheck con --expect-registration=enabled para declararlo de forma " +
        "explícita."
    );
  } else if (ENVIRONMENT.name === "production") {
    ok("Registro público DESHABILITADO en Production (correcto para el hito técnico).");
  } else {
    ok(`Registro ${registrationOn ? "habilitado" : "deshabilitado"} en este ambiente.`);
  }
}

// ---------------------------------------------------------------------------
// 6. Recordatorio operativo
// ---------------------------------------------------------------------------
console.log("");
console.log("--- 6. Recordatorio ---");
console.log("");
console.log("  Vercel inyecta las variables de entorno EN TIEMPO DE BUILD.");
console.log("  Cambiar, añadir o borrar una variable NO afecta a los");
console.log("  despliegues ya existentes: hay que crear un DEPLOYMENT NUEVO");
console.log("  (Redeploy sin caché) para que el cambio surta efecto.");
console.log("");
console.log("  Ámbitos separados en Vercel:");
console.log("    · Production  → proyecto Supabase de PRODUCCIÓN");
console.log("    · Preview     → proyecto Supabase de STAGING");
console.log("    · Development → tu .env.local");
console.log("");

// ---------------------------------------------------------------------------
console.log("==========================================================");
if (failures > 0) {
  console.log(` NO-GO · ${failures} fallo(s), ${warnings} advertencia(s).`);
  console.log("==========================================================");
  console.log("");
  process.exit(1);
}
console.log(
  ` OK · variables presentes${warnings > 0 ? ` · ${warnings} advertencia(s)` : ""}.`
);
console.log("==========================================================");
console.log("");
