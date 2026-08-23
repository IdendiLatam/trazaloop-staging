/**
 * Trazaloop · HOTFIX transversal · El vencimiento es DE UN MÓDULO.
 *
 * Una empresa puede tener PCR y Textiles con la prueba vencida y Quality en
 * Full. Eso no es una cuenta vencida: es una cuenta con dos módulos vencidos y
 * uno vigente, y el producto debe comportarse en consecuencia.
 *
 * Estas comprobaciones existen porque el aviso de prueba decidía con una sola
 * pregunta —«¿queda alguna prueba en curso?»— y, si no quedaba, anunciaba que
 * el periodo de la empresa había terminado. Lo anunciaba también DENTRO del
 * módulo Full que el usuario estaba usando en ese momento.
 *
 * Ninguna prueba nombra un módulo concreto para decidir: todas resuelven por
 * catálogo y por estado, de modo que un módulo futuro queda cubierto sin tocar
 * este archivo.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveModuleAccess,
  type DerivedModuleState,
  type ModuleAssignment,
} from "../../lib/modules/access";
import {
  COMMERCIAL_MODULES,
  resolveModuleEntryHref,
  type CommercialModule,
} from "../../lib/modules/catalog";
import {
  classifyDemoNotice,
  isEnterableState,
  sortModulesForSelector,
} from "../../lib/modules/messages";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✘ ${name}: ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const NOW = new Date("2026-08-23T12:00:00.000Z");
const PAST = "2026-08-20T12:00:00.000Z";
const FUTURE = "2026-08-25T12:00:00.000Z";

const demoExpired: ModuleAssignment = { enabled: true, accessMode: "demo", accessExpiresAt: PAST };
const demoActive: ModuleAssignment = { enabled: true, accessMode: "demo", accessExpiresAt: FUTURE };
const full: ModuleAssignment = { enabled: true, accessMode: "full", accessExpiresAt: null };

/** El estado de un módulo del catálogo con una asignación dada. */
function stateOf(
  mod: CommercialModule,
  assignment: ModuleAssignment | null,
  killSwitchActive = true
): DerivedModuleState {
  return resolveModuleAccess({
    isFunctional: mod.status === "functional",
    killSwitchActive,
    assignment,
    now: NOW,
  }).derivedState;
}

/** Los módulos funcionales del catálogo, sin nombrar ninguno a mano. */
const FUNCTIONAL = COMMERCIAL_MODULES.filter((m) => m.status === "functional");
assert(FUNCTIONAL.length >= 3, "el catálogo debía tener al menos tres módulos funcionales");

/**
 * El escenario de la prueba humana, descrito por POSICIÓN y no por nombre:
 * todos los funcionales con la prueba vencida salvo el último, que está en
 * Full. Si mañana entra un módulo nuevo, el escenario sigue significando lo
 * mismo sin editarlo.
 */
const SUBJECT = FUNCTIONAL[FUNCTIONAL.length - 1];
const OTHERS = FUNCTIONAL.slice(0, -1);

console.log("\nTrazaloop · Acceso por módulo: una prueba vencida no vence la cuenta\n");

check("M1. con las demás pruebas vencidas, el módulo en Full SIGUE permitido", () => {
  for (const other of OTHERS) {
    const d = resolveModuleAccess({
      isFunctional: true, killSwitchActive: true, assignment: demoExpired, now: NOW,
    });
    assert(!d.allowed && d.reason === "demo_expired", `${other.name} debía estar bloqueado`);
  }
  const subject = resolveModuleAccess({
    isFunctional: true, killSwitchActive: true, assignment: full, now: NOW,
  });
  assert(subject.allowed, `${SUBJECT.name} quedó bloqueado por el vencimiento de otro módulo`);
  assert(subject.derivedState === "full", `estado inesperado: ${subject.derivedState}`);
});

check("M2. y por tanto su tarjeta OFRECE entrar", () => {
  const state = stateOf(SUBJECT, full);
  assert(isEnterableState(state), `${SUBJECT.name} no era entrable con estado ${state}`);
});

check("M3. su enlace de entrada es el que declara el catálogo", () => {
  const href = resolveModuleEntryHref({
    mod: SUBJECT,
    isEnterable: isEnterableState(stateOf(SUBJECT, full)),
  });
  assert(href === SUBJECT.homePath, `href=${href}, se esperaba ${SUBJECT.homePath}`);
  assert(href !== null, "un módulo funcional en Full no puede quedarse sin entrada");
});

check("M4. una prueba vencida y otra VIGENTE conviven: ambas se resuelven aparte", () => {
  const expired = stateOf(FUNCTIONAL[0], demoExpired);
  const active = stateOf(FUNCTIONAL[1], demoActive);
  const fullOne = stateOf(SUBJECT, full);
  assert(expired === "demo_expired", `el vencido dio ${expired}`);
  assert(isEnterableState(active), "una prueba VIGENTE debía seguir siendo entrable");
  assert(isEnterableState(fullOne), "Full debía seguir siendo entrable");
});

check("M5. si TODAS las pruebas vencieron, ninguno es entrable", () => {
  const states = FUNCTIONAL.map((m) => stateOf(m, demoExpired));
  assert(states.every((s) => s === "demo_expired"), `estados: ${states.join(", ")}`);
  assert(!states.some(isEnterableState), "algún módulo seguía entrable con todo vencido");
});

check("M6. una empresa que solo contrató UN módulo entra a ese módulo", () => {
  // Los demás ni siquiera están asignados: no vencen, y no arrastran a nadie.
  for (const other of OTHERS) {
    const s = stateOf(other, null);
    assert(s === "not_assigned", `${other.name} dio ${s}`);
  }
  const s = stateOf(SUBJECT, full);
  assert(isEnterableState(s), `${SUBJECT.name} no era entrable siendo el único contratado`);
});

check("M7. un módulo vencido no puede entrar A SÍ MISMO", () => {
  const state = stateOf(SUBJECT, demoExpired);
  assert(state === "demo_expired", `estado ${state}`);
  assert(!isEnterableState(state), "un vencido no puede ofrecer entrada");
  assert(
    resolveModuleEntryHref({ mod: SUBJECT, isEnterable: isEnterableState(state) }) === null,
    "un vencido no puede tener enlace de entrada"
  );
});

check("M8. Full y Extra NO heredan el vencimiento de una prueba ajena", () => {
  for (const mode of ["full", "extra"] as const) {
    const d = resolveModuleAccess({
      isFunctional: true,
      killSwitchActive: true,
      assignment: { enabled: true, accessMode: mode, accessExpiresAt: null },
      now: NOW,
    });
    assert(d.allowed, `${mode} quedó bloqueado`);
    assert(!d.isExpired, `${mode} se marcó como vencido`);
    assert(d.expiresAt === null, `${mode} recibió una fecha de vencimiento`);
  }
});

check("M9. el kill switch sigue mandando, pero SOLO sobre su propio módulo", () => {
  const off = stateOf(SUBJECT, full, false);
  assert(off === "globally_disabled", `estado ${off}`);
  assert(!isEnterableState(off), "un kill switch apagado no puede dejar entrar");
  // Y no contamina a los demás: cada módulo lee el suyo.
  const other = stateOf(OTHERS[0], full, true);
  assert(isEnterableState(other), "el kill switch de un módulo afectó a otro");
});

check("M10. la deshabilitación administrativa también es POR MÓDULO", () => {
  const disabled = stateOf(SUBJECT, { ...full, enabled: false });
  assert(disabled === "disabled", `estado ${disabled}`);
  assert(!isEnterableState(disabled), "un módulo deshabilitado no puede dejar entrar");
  const other = stateOf(OTHERS[0], full);
  assert(isEnterableState(other), "deshabilitar un módulo afectó a otro");
});

check("M11. aviso PARCIAL cuando venció alguna prueba pero queda algo entrable", () => {
  const states = [
    ...OTHERS.map((m) => ({ state: stateOf(m, demoExpired) })),
    { state: stateOf(SUBJECT, full) },
  ];
  assert(classifyDemoNotice(states) === "partial", "debía ser un aviso parcial");
});

check("M12. aviso GENERAL solo cuando NINGÚN módulo aplicable es entrable", () => {
  const allExpired = FUNCTIONAL.map((m) => ({ state: stateOf(m, demoExpired) }));
  assert(classifyDemoNotice(allExpired) === "all_expired", "debía ser un aviso general");

  // Un módulo «Próximamente» o «Sin asignar» no salva de un aviso general…
  const withComingSoon = [
    ...allExpired,
    { state: "coming_soon" as DerivedModuleState },
    { state: "not_assigned" as DerivedModuleState },
  ];
  assert(
    classifyDemoNotice(withComingSoon) === "all_expired",
    "un módulo no asignado no puede contar como acceso vigente"
  );
  // …ni provoca uno cuando no hay nada vencido.
  assert(
    classifyDemoNotice([{ state: "coming_soon" }, { state: "not_assigned" }]) === "none",
    "sin pruebas ni vencimientos no debe haber aviso"
  );
  // Con pruebas en curso, el aviso es el de siempre.
  assert(
    classifyDemoNotice([{ state: stateOf(SUBJECT, demoActive) }]) === "active",
    "una prueba en curso debía dar el aviso activo"
  );
});

console.log("\nTrazaloop · El módulo utilizable no se esconde\n");

check("M13. el selector pone delante los módulos a los que SÍ se puede entrar", () => {
  const cards = FUNCTIONAL.map((m, i) => ({
    key: m.key,
    enterable: i === FUNCTIONAL.length - 1, // solo el último es utilizable
  }));
  const sorted = sortModulesForSelector(cards, (c) => c.enterable);
  assert(sorted[0].enterable, "el módulo utilizable debía ir primero");
  assert(sorted[0].key === SUBJECT.key, `primero quedó ${sorted[0].key}`);
});

check("M14. el orden del catálogo se respeta DENTRO de cada grupo", () => {
  const cards = COMMERCIAL_MODULES.map((m) => ({ key: m.key, enterable: false }));
  const sorted = sortModulesForSelector(cards, (c) => c.enterable);
  assert(
    sorted.map((c) => c.key).join(",") === COMMERCIAL_MODULES.map((m) => m.key).join(","),
    "sin módulos entrables el orden no debía cambiar"
  );
});

console.log("\nTrazaloop · Nadie decide por clave de módulo\n");

check("M15. ninguna pieza transversal enumera módulos a mano para dar acceso", () => {
  // El defecto que este arreglo evita repetir: resolver el acceso o la entrada
  // comparando contra un nombre de módulo concreto.
  const files = [
    "app/(app)/modules/page.tsx",
    "lib/db/module-access.ts",
    "lib/modules/messages.ts",
    "components/domain/modules/demo-trial-banner.tsx",
  ];
  const keys = COMMERCIAL_MODULES.map((m) => m.key);
  for (const f of files) {
    const src = read(f);
    for (const key of keys) {
      // `cpr` tiene una excepción declarada y comentada: su destino depende de
      // la sesión (empresa activa / invitación), no del catálogo.
      if (key === "cpr" && f === "app/(app)/modules/page.tsx") continue;
      const compared = new RegExp(`===\\s*["'\`]${key}["'\`]|["'\`]${key}["'\`]\\s*===`).test(src);
      assert(!compared, `${f} compara contra la clave «${key}» para decidir`);
    }
  }
});

check("M16. el aviso se clasifica en el SERVIDOR y el banner solo lo pinta", () => {
  const banner = read("components/domain/modules/demo-trial-banner.tsx");
  assert(!banner.includes("resolveModuleAccess"), "el banner no debe resolver acceso");
  assert(banner.includes("notice"), "el banner debe recibir el aviso ya clasificado");
  const db = read("lib/db/module-access.ts");
  assert(db.includes("classifyDemoNotice"), "el servidor debe clasificar el aviso");
  assert(!db.includes("hasExpired"), "el booleano global no debe volver");
});

check("M17. el selector no ofrece un enlace a la página en la que ya se está", () => {
  const page = read("app/(app)/modules/page.tsx");
  assert(
    /showModulesLink=\{false\}/.test(page),
    "en el selector, «Ver módulos» no debe ofrecerse: lleva a donde ya se está"
  );
  const shell = read("app/(app)/(shell)/layout.tsx");
  assert(
    !/showModulesLink=\{false\}/.test(shell),
    "dentro de un módulo, «Ver módulos» sí es útil y debe conservarse"
  );
});

console.log(
  `\nAcceso por módulo: ${passed} correctas, ${failed} fallidas\n`
);
if (failed > 0) process.exit(1);
