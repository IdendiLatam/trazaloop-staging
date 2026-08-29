/**
 * Trazaloop · QUALITY-12.3B1 · Partes interesadas · estructura y fronteras.
 *
 * El comportamiento se demuestra contra la base en `test:quality123-rls`.
 * Aquí van las decisiones congeladas que tienen que seguir escritas donde se
 * pueden leer, y las fronteras que se rompen en silencio.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const MIG = read("supabase/migrations/0149_quality_interested_parties_core.sql");
/** Solo el SQL ejecutable: los comentarios nombran a propósito lo que se
 *  descartó, y confundirlos con el código haría fallar por lo contrario. */
const SQL = MIG.replace(/--.*$/gm, "").replace(/comment on [\s\S]*?';/gi, "");

console.log("\nQUALITY-12.3B1 · Partes interesadas · estructura\n");

check("1. Las OCHO tablas, y ni una más", () => {
  const creadas = [...SQL.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
  assert(creadas.length === 8, `se esperaban 8 tablas, hay ${creadas.length}: ${creadas}`);
  for (const t of ["quality_stakeholder_categories", "quality_stakeholder_groups",
                   "quality_stakeholder_assessments", "quality_stakeholder_requirements",
                   "quality_stakeholder_requirement_processes", "quality_stakeholder_strategies",
                   "quality_stakeholder_strategy_requirements", "quality_stakeholder_reviews"]) {
    assert(creadas.includes(t), `falta ${t}`);
  }
});

check("2. Ninguna identidad nueva: la entidad externa es la que ya existe", () => {
  assert(/references public\.quality_external_parties \(organization_id, id\)/.test(SQL),
    "el sujeto externo debía apuntar a quality_external_parties");
  const nombres = [...SQL.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
  for (const prohibida of ["party", "stakeholder_identity", "interested_party"]) {
    assert(!nombres.some((n) => n === `quality_${prohibida}` || n === `quality_stakeholder_${prohibida}`),
      `apareció una identidad nueva: ${prohibida}`);
  }
});

check("3. DOS sujetos, con FK compuestas, nunca un par genérico (PI-02, PI-38)", () => {
  assert(/subject_kind in \('external_party', 'group'\)/.test(SQL), "solo dos tipos de sujeto");
  assert(/num_nonnulls\(external_party_id, stakeholder_group_id\) = 1/.test(SQL),
    "exactamente un sujeto");
  assert(/subject_kind = 'external_party' and external_party_id is not null/.test(SQL),
    "el sujeto declarado y el relleno tienen que coincidir");
  // Y NO el organigrama.
  assert(!/quality_org_units/.test(SQL),
    "el organigrama no puede ser sujeto de un análisis de parte interesada");
  // Ni un par genérico.
  assert(!/subject_id/.test(SQL), "un subject_id genérico perdería la clave foránea");
});

check("4. TODAS las claves foráneas del dominio son compuestas", () => {
  const fks = [...SQL.matchAll(/foreign key \(([^)]*)\)\s*\n?\s*references public\.(\w+)/g)];
  assert(fks.length >= 12, `se esperaban al menos 12 FK, hay ${fks.length}`);
  for (const [, cols, tabla] of fks) {
    // Las de `organizations` y `profiles` son de una sola columna a propósito:
    // son la raíz del inquilino y el autor, no datos del dominio.
    if (tabla === "organizations" || tabla === "profiles") continue;
    assert(/organization_id\s*,/.test(cols),
      `la FK a ${tabla} no es compuesta: el aislamiento sería solo de política`);
  }
});

check("5. Necesidad, expectativa y requisito NO se colapsan (PI-12)", () => {
  assert(/entry_kind in \('need', 'expectation', 'requirement'\)/.test(SQL), "los tres tipos");
  assert(/requirement_kind is not null/.test(SQL),
    "el `is not null` del subtipo: sin él, `null in (...)` deja pasar un requisito sin subtipo");
  for (const k of ["legal", "regulatory", "contractual", "standard", "internal_commitment"]) {
    assert(SQL.includes(`'${k}'`), `falta el subtipo ${k}`);
  }
  assert(/derived_from_id/.test(SQL) && /conversion_rationale/.test(SQL),
    "la conversión debe conservar su origen y su motivo");
});

check("6. La pertinencia se justifica al descartar (PI-11, PI-15)", () => {
  const rationale = (SQL.match(/relevance_status <> 'not_relevant'/g) ?? []).length;
  assert(rationale === 2,
    `el motivo obligatorio debía exigirse en el análisis Y en el requisito, aparece ${rationale} veces`);
});

check("7. Las dos relaciones CORE son tablas con FK, no work_references (PI-36, PI-37)", () => {
  for (const t of ["quality_stakeholder_requirement_processes",
                   "quality_stakeholder_strategy_requirements"]) {
    const i = SQL.indexOf(`create table public.${t}`);
    const cuerpo = SQL.slice(i, SQL.indexOf(");", i));
    assert(/effective_from/.test(cuerpo) && /effective_to/.test(cuerpo),
      `${t} necesita vigencia: es lo que work_references no tiene`);
    assert((cuerpo.match(/foreign key/g) ?? []).length >= 2,
      `${t} necesita FK reales`);
  }
  assert(/link_kind in \('addressed_by', 'affects', 'monitored_by'\)/.test(SQL),
    "el vocabulario propio de la relación requisito→proceso");
  // Y el dominio NO escribe sus relaciones core en work_references.
  assert(!/insert into public\.work_references/.test(SQL),
    "la migración no puede registrar relaciones core como referencias genéricas");
});

check("8. El alcance de la estrategia vive en UN solo sitio (PI-20)", () => {
  const i = SQL.indexOf("create table public.quality_stakeholder_strategies");
  const cuerpo = SQL.slice(i, SQL.indexOf(");", i));
  assert(!/requirement_id/.test(cuerpo),
    "la estrategia no puede tener requirement_id: el alcance vive en los enlaces");
  assert(/assessment_id/.test(cuerpo), "pero sí cuelga de su análisis");
});

check("9. La dueña de la estrategia es un CARGO (PI-22, T-02)", () => {
  const i = SQL.indexOf("create table public.quality_stakeholder_strategies");
  const cuerpo = SQL.slice(i, SQL.indexOf(");", i));
  assert(/owner_position_id/.test(cuerpo) && /references public\.quality_positions/.test(SQL),
    "la dueña debía ser un cargo");
  assert(!/owner_person_id|owner_user_id|owner_profile_id/.test(cuerpo),
    "ni persona ni usuario: un cargo no se va de vacaciones");
});

check("10. El seguimiento no presupone encuesta (PI-24)", () => {
  for (const m of ["survey", "indicator", "periodic_evaluation", "meeting", "complaint",
                   "sla", "audit", "feedback", "regulatory_compliance", "document", "other"]) {
    assert(SQL.includes(`'${m}'`), `falta el mecanismo ${m}`);
  }
  assert(/monitoring_method is null or/.test(SQL), "y el mecanismo es opcional");
});

check("11. La priorización es opcional, y un número nunca va desnudo (PI-26, PI-39)", () => {
  assert(/priority_score is null\s*\n?\s*or length\(trim\(coalesce\(priority_method_note/.test(SQL),
    "una puntuación exige metodología o justificación");
  assert(/priority_label is null or priority_label in \('high', 'medium', 'low'\)/.test(SQL),
    "y la prioridad cualitativa es una alternativa válida");
  // Ninguna columna es obligatoria.
  assert(!/priority_score\s+numeric\s+not null/.test(SQL), "la puntuación no puede ser obligatoria");
});

check("12. Historical Truth: nada se borra y lo sucedido no se reescribe (PI-28)", () => {
  assert(/create trigger t_quality_stakeholder_reviews_immutable[\s\S]{0,120}forbid_mutation/.test(SQL),
    "una revisión es un hecho: ni se edita ni se borra");
  assert(/ya sucedido no se reescribe/.test(MIG),
    "una fila sucedida no puede volver a estar vigente");
  // Sin política de DELETE en ninguna de las ocho.
  assert(!/for delete/i.test(SQL), "ninguna tabla del dominio admite borrado");
  // Y sin privilegio, que es la segunda capa.
  const revocadas = (SQL.match(/revoke all on table public\.quality_stakeholder\w+\s+from public, anon, authenticated;/g) ?? []).length;
  assert(revocadas === 8,
    `las ocho tablas deben revocar también a authenticated: el default de Supabase concede DELETE (revocadas ${revocadas})`);
});

check("13. RLS en las ocho, con permiso propio (PI-34)", () => {
  const rls = (SQL.match(/enable row level security/g) ?? []).length;
  assert(rls === 8, `se esperaban 8 tablas con RLS, hay ${rls}`);
  const select = (SQL.match(/for select using \(is_org_member\(organization_id\)\)/g) ?? []).length;
  assert(select === 8, `las ocho leen con is_org_member, hay ${select}`);
  assert(/quality_manages_interested_parties\(p_organization_id uuid\)/.test(SQL),
    "el permiso de escritura debía tener función propia");
  assert(/has_org_role\(p_organization_id, array\['admin', 'quality', 'consultant'\]\)/.test(SQL),
    "y usar los roles del patrón de Quality");
  // Nada de service_role en runtime.
  assert(!/to service_role/.test(SQL), "sin service_role en las políticas");
});

check("14. La semilla es de 15, editable e idempotente (PI-06)", () => {
  const fn = SQL.slice(SQL.indexOf("function public.quality_seed_stakeholder_categories"));
  const cuerpo = fn.slice(0, fn.indexOf("$$;"));
  assert(/return 0;/.test(cuerpo), "la segunda siembra no puede duplicar");
  assert(/return 15;/.test(cuerpo), "quince categorías");
  const filas = (cuerpo.match(/\(p_organization_id, '/g) ?? []).length;
  assert(filas === 15, `se esperaban 15 filas sembradas, hay ${filas}`);
  // Las cuatro que la revisión humana pidió separadas.
  for (const c of ["'customers'", "'users'", "'authorities'", "'regulators'"]) {
    assert(cuerpo.includes(c), `falta la categoría ${c}`);
  }
  // Por empresa, no catálogo global: una fila global no se puede desactivar
  // para una sola empresa, y la decisión humana exige poder desactivarlas.
  assert(!/organization_id is null/.test(SQL),
    "las categorías son por empresa: un catálogo global no se puede desactivar por empresa");
});

check("15. Sin taxonomía sectorial cableada", () => {
  const fn = SQL.slice(SQL.indexOf("function public.quality_seed_stakeholder_categories"));
  const cuerpo = fn.slice(0, fn.indexOf("$$;")).toLowerCase();
  for (const palabra of ["planta", "manufactur", "fábrica", "producción", "textil", "reciclad"]) {
    assert(!cuerpo.includes(palabra), `la semilla contiene vocabulario sectorial: «${palabra}»`);
  }
});

check("16. Lo que NO entra en B1, y es deliberado", () => {
  // La automatización, Intelligence y la entrada de Revisión por la Dirección
  // se difieren: registrarlas ahora dejaría catálogos apuntando a nada.
  assert(!/quality_automation_event_catalog/.test(SQL), "sin eventos de automatización todavía");
  assert(!/quality_ai_sources/.test(SQL), "sin fuentes de Intelligence todavía");
  assert(!/quality_management_review_input_catalog/.test(SQL),
    "sin entrada de Revisión por la Dirección todavía");
  assert(!/work_references/.test(SQL),
    "sin ampliar work_references: los enlaces periféricos llegan con la capa de aplicación");
});

check("17. Sin DROP CASCADE y sin tocar migraciones históricas", () => {
  assert(!/cascade/i.test(SQL.replace(/on delete cascade/gi, "")),
    "ningún drop con cascade");
  assert(!/alter table public\.(?!quality_stakeholder)/.test(SQL),
    "la migración no altera tablas de otros dominios");
});

console.log(`\n  ${passed} comprobaciones correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
