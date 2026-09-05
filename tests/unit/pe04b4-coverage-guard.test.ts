/**
 * Trazaloop · PE-04B4 · Guardias de cobertura: Intelligence y modo consulta.
 *
 * Dos límites comerciales nuevos valen exactamente lo que valga el camino más
 * flojo que los rodea. Da igual lo buena que sea la reserva de créditos si
 * alguien añade en seis meses una llamada al proveedor que no reserva, y da
 * igual lo bien definido que esté el modo consulta si una acción nueva escribe
 * sin pasar por la puerta.
 *
 * Estos guardias no comprueban que el código de HOY esté bien —eso lo hacen las
 * suites que ejecutan—, sino que mañana nadie pueda añadir un camino sin
 * declararlo. Misma idea que la cobertura de tutoriales de PE-03 y el guardia
 * de puertas de almacenamiento de PE-04B3.
 *
 * Correr: npm run test:pe04b4-coverage
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");

function archivos(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) archivos(ruta, salida);
    else if (/\.tsx?$/.test(entrada)) salida.push(ruta);
  }
  return salida;
}

/** Quita comentarios: una MENCIÓN no es una llamada, y confundirlas convierte
 *  un guardia en ruido que se acaba ignorando. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\*\s.*$/gm, "");
}

console.log("\nPE-04B4 · Guardias de cobertura\n");

// ===========================================================================
console.log("A · Ningún camino al modelo sin medir");
// ===========================================================================

/** Los ÚNICOS sitios donde el producto llama a un modelo, con su operación. */
const CAMINOS_DE_MODELO: { archivo: string; operacion: string }[] = [
  { archivo: "lib/ai/copilot.ts", operacion: "req.useCase (las siete del Copilot)" },
  { archivo: "lib/intelligence/document-review/contextual-review.ts", operacion: "document.contextual_review" },
  { archivo: "lib/intelligence/document-authoring/quick-edit.ts", operacion: "document.quick_edit" },
];

/** Archivos que tocan el proveedor SIN ejecutar: no reservan y no deben. */
const TOCAN_PROVEEDOR_SIN_EJECUTAR: Record<string, string> = {
  "lib/ai/provider.ts": "Resuelve QUÉ proveedor se usará. No ejecuta nada.",
  "lib/ai/providers/openai.ts": "El transporte. Lo invoca quien ya reservó.",
  "lib/ai/providers/anthropic.ts": "Idem.",
  "lib/ai/providers/fake.ts": "El doble determinista: no llama a nadie y no cuesta.",
  "lib/ai/config.ts": "Configuración del modelo. No ejecuta.",
};

const LLAMADA = /generateStructured\s*\(/;

check("A1. Toda llamada al modelo sale de un camino declarado", () => {
  const todos = ["lib", "server", "app", "components"].flatMap((r) => archivos(r));
  const declarados = new Set([
    ...CAMINOS_DE_MODELO.map((c) => c.archivo),
    ...Object.keys(TOCAN_PROVEEDOR_SIN_EJECUTAR),
  ]);
  const intrusos = todos.filter((ruta) => {
    if (declarados.has(ruta)) return false;
    return LLAMADA.test(sinComentarios(leer(ruta)));
  });
  assert(intrusos.length === 0,
    `llaman al modelo sin estar declarados: ${intrusos.join(", ")}. `
    + "Si es legítimo, añádelo a CAMINOS_DE_MODELO y haz que reserve créditos.");
});

check("A2. Y cada camino declarado RESERVA antes de llamar", () => {
  for (const c of CAMINOS_DE_MODELO) {
    const src = sinComentarios(leer(c.archivo));
    assert(src.includes("reserveAiCredits("), `${c.archivo} no reserva créditos`);
    const iReserva = src.indexOf("reserveAiCredits(");
    const iLlamada = src.search(LLAMADA);
    assert(iReserva < iLlamada,
      `${c.archivo} reserva DESPUÉS de llamar al proveedor: eso regala la última operación`);
  }
});

check("A3. Cada camino confirma con resultado y libera sin él", () => {
  for (const c of CAMINOS_DE_MODELO) {
    const src = sinComentarios(leer(c.archivo));
    assert(src.includes("commitAiCredits("), `${c.archivo} nunca confirma el consumo`);
    // Al menos una liberación por cada salida sin resultado utilizable: fallo
    // del proveedor, salida ilegible y denegación de una salvaguarda interna.
    const liberaciones = (src.match(/releaseAiCredits\(/g) ?? []).length;
    assert(liberaciones >= 3,
      `${c.archivo} solo libera ${liberaciones} vez/veces: un fallo de infraestructura no se le cobra al cliente`);
  }
});

check("A4. Todas las operaciones del producto tienen peso declarado", () => {
  // El registro vive en la migración; una operación sin peso se RECHAZA en la
  // base, así que lo que aquí se comprueba es que no falte ninguna y que nadie
  // tenga que descubrirlo en ejecución.
  const mig = leer("supabase/migrations/0166_intelligence_and_free_usage_limits.sql");
  const dominio = leer("lib/domain/quality-ai.ts");
  const lista = /export const USE_CASES = \[([\s\S]*?)\] as const;/.exec(dominio);
  assert(lista, "no se encontró el catálogo USE_CASES del Copilot");
  const casos = [...lista[1].matchAll(/"([\w.]+)"/g)].map((m) => m[1]);
  assert(casos.length >= 7, `se esperaban al menos 7 casos del Copilot, hay ${casos.length}`);
  for (const caso of [...casos, "document.quick_edit", "document.contextual_review", "copilot.ask"]) {
    assert(mig.includes(`('${caso}',`), `la operación «${caso}» no tiene peso en el registro`);
  }
});

check("A5. Un peso no puede ser cero · no hay operaciones gratis", () => {
  const mig = leer("supabase/migrations/0166_intelligence_and_free_usage_limits.sql");
  assert(/check \(weight_credits > 0 and weight_credits <= 100\)/.test(mig),
    "el registro de pesos admite cero créditos (o un peso sin techo)");
  // Y el libro tampoco: una fila de consumo de cero créditos sería un consumo
  // que no consume, imposible de explicar en una factura.
  assert(/weight_credits  integer not null check \(weight_credits > 0\)/.test(mig),
    "el libro de créditos admite movimientos de cero");
});

// ===========================================================================
console.log("\nB · Ninguna mutación de negocio sin puerta comercial");
// ===========================================================================

/**
 * Acciones que ESCRIBEN y no pasan por la puerta comercial, cada una con el
 * motivo. Si aparece una nueva, esta prueba se pone roja y hay que decidirlo a
 * conciencia en vez de descubrirlo pantalla por pantalla.
 */
const ESCRITURAS_SIN_PUERTA: Record<string, string> = {
  "server/actions/evidences.ts:finalizeEvidenceUploadAction":
    "CIERRA un flujo que ya pasó la puerta y la reserva en su `begin`. Bloquear el "
    + "final dejaría bytes reservados y un archivo subido sin fila que lo represente.",
  "server/actions/evidences.ts:cancelEvidenceUploadAction":
    "Cancela y LIBERA. Es una reducción; en modo consulta debe poder hacerse.",
  "server/actions/billing.ts:requestCancellationAction":
    "Cancelar es una REDUCCIÓN, y además es la salida. Ponerle la puerta comercial "
    + "delante dejaría atrapada a la empresa que agotó su cupo: no podría ni "
    + "irse. No cobra, no concede y no crece.",
  "server/actions/billing.ts:schedulePlanChangeAction":
    "Bajar de plan es una REDUCCIÓN programada para el final del periodo pagado. "
    + "Mismo motivo: quien agotó su cupo tiene que poder bajar, que es justamente "
    + "lo que lo arregla. No cobra nada hoy.",
  "server/actions/billing.ts:cancelScheduledChangeAction":
    "Retira un cambio programado. Deja las cosas como estaban; no concede nada.",
  "server/actions/settings.ts:updateMyProfileAction":
    "Datos y seguridad de la propia persona: operación esencial de cuenta, nunca comercial.",
  "server/actions/platform.ts:listPlatformStaffAction":
    "Es una LECTURA. Revalida ruta, no escribe.",
  "server/actions/team.ts:getPostAuthDestinationAction":
    "Es una LECTURA: decide a dónde llevar a alguien tras autenticarse.",
  "server/actions/plans.ts:changeOrganizationPlanAction":
    "Consola de PLATAFORMA (superadministrador). No es uso de cliente y no puede "
    + "depender del cupo del cliente: sería imposible reactivar a quien lo agotó.",
  "server/actions/platform-modules.ts:setOrganizationModuleAccessAction":
    "Consola de PLATAFORMA. Mismo motivo.",
  "server/actions/promotions-console.ts:createPromotionAction":
    "Consola de PLATAFORMA: campañas comerciales globales, no uso de cliente. "
    + "Ponerle el cupo de una empresa delante no tendría sentido —no es de "
    + "ninguna— y dejaría a la administración sin poder crear promociones.",
  "server/actions/promotions-console.ts:publishPromotionAction": "Idem.",
  "server/actions/promotions-console.ts:retirePromotionAction": "Idem.",
  "server/actions/promotions-console.ts:createPromotionCodeAction": "Idem.",
  "server/actions/promotions-console.ts:retirePromotionCodeAction": "Idem.",
  "server/actions/faq-admin.ts:createFaqCategoryAction":
    "Contenido de PLATAFORMA (la FAQ del producto), no de ninguna empresa.",
  "server/actions/faq-admin.ts:updateFaqCategoryAction": "Idem.",
  "server/actions/trazadocs.ts:createTrazadocBlueprintAction":
    "Plantillas de PLATAFORMA: exigen `requirePlatformStaff()` y no son datos de empresa.",
  "server/actions/trazadocs.ts:updateTrazadocBlueprintAction": "Idem.",
  "server/actions/trazadocs.ts:updateTrazadocBlueprintStatusAction": "Idem.",
  "server/actions/trazadocs.ts:createTrazadocBlueprintSectionAction": "Idem.",
  "server/actions/trazadocs.ts:updateTrazadocBlueprintSectionAction": "Idem.",
  "server/actions/trazadocs.ts:updateTrazadocBlueprintSectionStatusAction": "Idem.",
  "server/actions/trazadocs.ts:reorderTrazadocBlueprintSectionsAction": "Idem.",
  // PE-04B5 · La consola comercial. Administrar el catálogo o mover a una
  // empresa de plan NO puede depender del cupo de esa empresa: sería imposible
  // reactivar precisamente a quien lo agotó. Exigen administración de
  // plataforma, en la pantalla y otra vez en la base.
  "server/actions/commercial-console.ts:createDraftRevisionAction":
    "Consola comercial de PLATAFORMA · exige administración de plataforma.",
  "server/actions/commercial-console.ts:updateDraftRevisionAction":
    "Consola comercial de PLATAFORMA · exige administración de plataforma.",
  "server/actions/commercial-console.ts:updateDraftLimitAction":
    "Consola comercial de PLATAFORMA · exige administración de plataforma.",
  "server/actions/commercial-console.ts:publishRevisionAction":
    "Consola comercial de PLATAFORMA · exige administración de plataforma.",
  "server/actions/commercial-console.ts:assignPlanAction":
    "Consola comercial de PLATAFORMA · mover a una empresa de plan no puede depender de su propio cupo.",
};

const DECL = /(?:export )?async function (\w+)\s*\(/g;
const PUERTA = /check(?:Cpr|Textiles|Quality|Module|Organization)\w*CanMutate\s*\(/;

function escriturasSinPuerta(): string[] {
  const fuera: string[] = [];
  for (const ruta of archivos("server/actions")) {
    const src = leer(ruta);
    const ms = [...src.matchAll(DECL)];
    const cuerpos = new Map<string, { cuerpo: string; exportada: boolean }>();
    ms.forEach((m, i) => {
      const fin = i + 1 < ms.length ? ms[i + 1].index! : src.length;
      cuerpos.set(m[1], {
        cuerpo: src.slice(m.index!, fin),
        exportada: src.slice(m.index!, m.index! + 30).startsWith("export"),
      });
    });
    // Un ayudante local que pasa por la puerta cubre a quien lo llama: es como
    // Quality lo tiene montado, con un `gate()` compartido por decenas de acciones.
    const conPuerta = new Set(
      [...cuerpos.entries()].filter(([, v]) => PUERTA.test(v.cuerpo)).map(([k]) => k)
    );
    for (let i = 0; i < 3; i += 1) {
      const antes = conPuerta.size;
      for (const [n, v] of cuerpos) {
        if ([...conPuerta].some((h) => new RegExp(`\\b${h}\\s*\\(`).test(v.cuerpo))) conPuerta.add(n);
      }
      if (conPuerta.size === antes) break;
    }
    for (const [n, v] of cuerpos) {
      if (v.exportada && v.cuerpo.includes("revalidatePath(") && !conPuerta.has(n)) {
        fuera.push(`${ruta}:${n}`);
      }
    }
  }
  return fuera;
}

check("B1. Toda escritura sin puerta está declarada con su motivo", () => {
  const fuera = escriturasSinPuerta();
  const nuevas = fuera.filter((k) => !(k in ESCRITURAS_SIN_PUERTA));
  assert(nuevas.length === 0,
    `escriben sin puerta comercial y sin declarar: ${nuevas.join(", ")}. `
    + "Si es legítimo, añádelas a ESCRITURAS_SIN_PUERTA con el motivo.");
});

check("B2. Y la lista no acumula entradas que ya no aplican", () => {
  const fuera = new Set(escriturasSinPuerta());
  const sobran = Object.keys(ESCRITURAS_SIN_PUERTA).filter((k) => !fuera.has(k));
  assert(sobran.length === 0,
    `declaradas como excepción pero ya pasan por la puerta (o ya no existen): ${sobran.join(", ")}`);
});

check("B3. El borrado NO se bloquea en modo consulta", () => {
  // Es la regla que impide que agotar un cupo secuestre los datos del cliente.
  // Se comprueba que las acciones que retiran declaren su intención.
  const esperadas = [
    ["server/actions/catalog.ts", "deleteSupplierAction"],
    ["server/actions/traceability.ts", "deleteInputBatchAction"],
    ["server/actions/trazadocs.ts", "deleteDocumentSectionAction"],
    ["server/actions/team.ts", "deactivateMemberAction"],
    ["server/actions/settings.ts", "removeCompanyLogoAction"],
  ] as const;
  for (const [ruta, fn] of esperadas) {
    const src = leer(ruta);
    const i = src.indexOf(`export async function ${fn}`);
    assert(i > -1, `no se encontró ${fn}`);
    const siguiente = src.indexOf("export async function", i + 10);
    const cuerpo = src.slice(i, siguiente === -1 ? undefined : siguiente);
    assert(/CanMutate\("delete_or_reduce"\)/.test(cuerpo),
      `${fn} no declara que RETIRA: en modo consulta quedaría bloqueada`);
  }
});

check("B4. La intención por omisión es la restrictiva", () => {
  // Una acción nueva que no declare nada debe comportarse como creación, que es
  // el caso seguro. Lo contrario —que por omisión se permita— convierte cada
  // olvido en una fuga.
  const mp = leer("server/actions/module-plans.ts");
  assert(/intent: MutationIntent = "business_increase_or_modify"/.test(mp),
    "la puerta por módulo no tiene la intención restrictiva por omisión");
  const pl = leer("server/actions/plans.ts");
  assert(/intent: MutationIntent = "business_increase_or_modify"/.test(pl),
    "la puerta de empresa no tiene la intención restrictiva por omisión");
});

// ===========================================================================
console.log("\nC · El reloj no vigila a nadie");
// ===========================================================================

check("C1. El reloj NO escucha ratón, teclado, scroll ni foco", () => {
  // Free incluye TIEMPO DE USO, no «tiempo con alguien moviendo el ratón».
  // Quien deja abierta una pantalla mientras atiende una llamada está usando su
  // plan. Detectar actividad convertiría el medidor en otra cosa —y en una
  // herramienta de vigilancia—, así que se prohíbe explícitamente.
  const reloj = leer("components/domain/usage/usage-clock.tsx");
  for (const prohibido of ["mousemove", "keydown", "keypress", "scroll",
                           "visibilitychange", "document.hidden", "onIdle"]) {
    assert(!new RegExp(`["'\`]?${prohibido}`).test(sinComentarios(reloj)),
      `el reloj escucha «${prohibido}»: eso es detección de actividad`);
  }
});

check("C2. El cliente no envía duraciones · las pone el servidor", () => {
  const accion = sinComentarios(leer("server/actions/usage.ts"));
  assert(!/minutes|seconds|elapsed|duration/i.test(accion.replace(/HEARTBEAT_SECONDS/g, "")),
    "la acción del latido acepta tiempo calculado en el navegador");
  const mig = leer("supabase/migrations/0166_intelligence_and_free_usage_limits.sql");
  const i = mig.indexOf("create or replace function public.usage_heartbeat(");
  const cuerpo = mig.slice(i, mig.indexOf("$$;", i));
  assert(/date_trunc\('minute', now\(\)\)/.test(cuerpo),
    "el latido no usa el reloj del servidor para decidir los minutos");
});

check("C3. Los minutos son de la EMPRESA, sin quién", () => {
  // La unión sale de la clave primaria (empresa, minuto). Guardar el usuario
  // ahí convertiría la contabilidad en un panel de productividad individual.
  const mig = leer("supabase/migrations/0166_intelligence_and_free_usage_limits.sql");
  const i = mig.indexOf("create table if not exists public.organization_usage_minutes");
  const cuerpo = mig.slice(i, mig.indexOf(");", i));
  assert(!/user_id/.test(cuerpo), "los minutos guardan a quién: eso es vigilancia laboral");
  assert(/primary key \(organization_id, minute_start\)/.test(cuerpo),
    "la unión no está garantizada por la clave primaria");
});

// ===========================================================================
console.log("\nD · Las tablas nuevas salen con RLS");
// ===========================================================================

check("D1. Toda tabla que crea 0166 activa RLS en la misma migración", () => {
  // El incidente SEC-01 fue exactamente esto: siete tablas creadas entre 0128 y
  // 0132 con los grants cuidados y sin `enable row level security`.
  const mig = leer("supabase/migrations/0166_intelligence_and_free_usage_limits.sql");
  const creadas = [...mig.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  assert(creadas.length >= 4, `se esperaban al menos 4 tablas nuevas, se vieron ${creadas.length}`);
  for (const t of creadas) {
    assert(mig.includes(`alter table public.${t} enable row level security`),
      `${t} nace sin RLS · es el incidente 0128–0132 otra vez`);
    assert(new RegExp(`create policy \\w+ on public\\.${t}`).test(mig),
      `${t} tiene RLS y ninguna política: nadie podría leerla y nadie sabría si es a propósito`);
  }
});

check("D2. Y 0166 lleva el preflight que se niega a promover una base expuesta", () => {
  const mig = leer("supabase/migrations/0166_intelligence_and_free_usage_limits.sql");
  assert(mig.includes("SEC01_RLS_PREFLIGHT"), "falta el preflight heredado del incidente");
});

// ===========================================================================
console.log("\nE · Lo que se le enseña a quien paga");
// ===========================================================================

check("E1. La UX de consumo NO presenta tokens, coste ni pesos internos", () => {
  // Son economía nuestra. Presentarlos como si fueran unidades del plan
  // confundiría lo que se vende con cómo se produce.
  const tarjeta = sinComentarios(leer("components/domain/usage/usage-summary-card.tsx"));
  const dominio = sinComentarios(leer("lib/domain/usage-summary.ts"));
  for (const prohibido of ["token", "cost_usd", "estimated_cost", "weight_credits", "provider"]) {
    assert(!new RegExp(prohibido, "i").test(tarjeta + dominio),
      `la tarjeta de consumo enseña «${prohibido}»`);
  }
});

check("E2. Las dos bolsas de créditos se enseñan SEPARADAS", () => {
  // Sumarlas haría leer «75 créditos» a una empresa Free con prueba activa, y
  // al caducar la prueba parecería que se le quitaron 50 que nunca fueron suyos.
  const tarjeta = leer("components/domain/usage/usage-summary-card.tsx");
  assert(tarjeta.includes("Créditos de Intelligence este mes"), "no se enseña la bolsa mensual");
  assert(tarjeta.includes("Créditos de la prueba"), "no se enseña la bolsa de la prueba");
  assert(/caducan/i.test(tarjeta), "no se dice que los de la prueba caducan");
  // Se busca el número EN EL TEXTO, no en clases de estilo ni en comentarios:
  // `neutral-500` no es una promesa comercial.
  const visible = sinComentarios(tarjeta).replace(/className="[^"]*"/g, "");
  assert(!/500\s*(créditos|crédito)/i.test(visible),
    "la tarjeta insinúa los 500 créditos de Full durante la prueba");
});

check("E3. Cliente y consola de plataforma usan la MISMA fuente", () => {
  const puerta = leer("app/(app)/modules/page.tsx");
  const consola = leer("app/(app)/platform/organizations/[id]/page.tsx");
  for (const [nombre, src] of [["la puerta", puerta], ["la consola", consola]] as const) {
    assert(src.includes("getOrganizationTimeStatus(") && src.includes("getAiCreditStatus("),
      `${nombre} no lee el consumo de la fuente canónica`);
    assert(src.includes("<UsageSummaryCard"), `${nombre} no usa la tarjeta compartida`);
  }
});

check("E4. La puerta está FUERA del shell · mirar el cupo no consume cupo", () => {
  const registro = leer("lib/usage/metered-surfaces.ts");
  assert(/prefix: "\/modules"/.test(registro),
    "la puerta no está declarada como superficie no medida");
  // Y el reloj se monta SOLO en el layout del shell: si apareciera en otro
  // sitio, mediría fuera de la frontera que lo define.
  const montajes = ["lib", "server", "app", "components"]
    .flatMap((r) => archivos(r))
    .filter((ruta) => /<UsageClock\s*\/?>/.test(leer(ruta)));
  assert(montajes.length === 1 && montajes[0] === "app/(app)/(shell)/layout.tsx",
    `el reloj se monta en ${montajes.join(", ")}: debe vivir solo en el layout del shell`);
});

console.log(`\nPE-04B4 · guardias: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
