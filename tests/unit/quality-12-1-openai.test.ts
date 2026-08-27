/**
 * Trazaloop · QUALITY-12.1 · El proveedor real y las fuentes que faltaban.
 *
 * QUÉ SE COMPRUEBA AQUÍ Y QUÉ NO
 *
 * Aquí NO se llama a OpenAI. Esta suite lee código y SQL, y comprueba las cosas
 * que tienen que ser ciertas ANTES de que exista una credencial: que la clave no
 * puede acabar en el navegador ni en un registro; que no se activan capacidades
 * del proveedor que este encargo prohíbe —búsqueda web, ficheros alojados,
 * ejecución de código, herramientas del lado del proveedor—; que una
 * configuración rota no cae en silencio sobre OpenAI; y que la 0132, que ya está
 * aplicada en Staging, no se ha tocado.
 *
 * La llamada de verdad se comprueba contra el proveedor, en Preview, y queda
 * anotada en los entregables. No en una suite que tiene que poder pasar sin
 * credencial (§133 de QUALITY-12).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const OPENAI = read("lib/ai/providers/openai.ts");
const CONFIG = read("lib/ai/config.ts");
const PROVIDER = read("lib/ai/provider.ts");
const COPILOT = read("lib/ai/copilot.ts");
const ADAPTERS = read("lib/ai/context/adapters.ts");
const SCHEMAS = read("lib/ai/schemas.ts");
const MIG133 = read("supabase/migrations/0133_quality_ai_copilot_completion.sql");
const MIG134 = read("supabase/migrations/0134_quality_ai_provider_call_truth.sql");
const BUILDER = read("lib/ai/context/builder.ts");
const MIG132 = read("supabase/migrations/0132_quality_ai_copilot.sql");

/** Quita comentarios: lo que se prohíbe es el CÓDIGO, no hablar de ello. */
function stripTs(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const OPENAI_CODE = stripTs(OPENAI);
const PROVIDER_CODE = stripTs(PROVIDER);
const CONFIG_CODE = stripTs(CONFIG);

console.log("\nQUALITY-12.1 · proveedor real y cobertura de fuentes\n");

// ===========================================================================
console.log("A · LA CREDENCIAL");
// ===========================================================================

check("A1. el adaptador es server-only y la clave no viaja al cliente", () => {
  assert(/^import "server-only";/m.test(OPENAI), "falta server-only");
  assert(!/NEXT_PUBLIC/.test(OPENAI + CONFIG), "una variable pública toca la IA");
  assert(!/"use client"/.test(OPENAI), "el adaptador se marcó como cliente");
});

check("A2. la clave solo se lee de QUALITY_AI_API_KEY, y solo en la configuración", () => {
  const usos = [OPENAI, PROVIDER, COPILOT].join("\n");
  assert(!/process\.env\.QUALITY_AI_API_KEY/.test(stripTs(usos)),
    "alguien lee la clave fuera de lib/ai/config.ts");
  assert(/QUALITY_AI_API_KEY/.test(CONFIG), "la configuración no lee la clave");
  assert(!/OPENAI_API_KEY/.test(stripTs(OPENAI + CONFIG + PROVIDER)),
    "se introdujo una variable nueva pudiendo usar la existente (§8)");
});

check("A3. la clave no se imprime, ni en un error (§64)", () => {
  assert(!/console\.(log|error|warn|info)/.test(OPENAI_CODE),
    "el adaptador escribe en el registro");
  // El mapeo de errores no puede reenviar el objeto del proveedor tal cual: ahí
  // dentro va la petición, y en la petición va la cabecera de autorización.
  assert(!/JSON\.stringify\(\s*e\s*\)/.test(OPENAI_CODE),
    "se serializa el error entero");
  assert(/function limpiar/.test(OPENAI), "no hay saneado del texto de error");
});

check("A4. sin credencial NO se llama al proveedor (§62)", () => {
  assert(/if \(key\)/.test(PROVIDER_CODE),
    "resolveProvider no comprueba la credencial antes de elegir un proveedor real");
  assert(/return \{ provider: fakeProvider\(\), live: false \}/.test(PROVIDER_CODE),
    "sin credencial no se cae en el doble");
});

// ===========================================================================
console.log("\nB · LA CONFIGURACIÓN");
// ===========================================================================

check("B1. un proveedor desconocido NO cae en OpenAI (§61)", () => {
  // La resolución es una lista cerrada con un último `else` explícito, y ese
  // else NO puede ser un proveedor real: si alguien escribe mal «anthropic», lo
  // que tiene que pasar es que el Copilot lo diga, no que llame a OpenAI.
  const bloque = /provider: provider === "openai"[\s\S]{0,300}?,\n/.exec(CONFIG_CODE);
  assert(bloque, "no se ve la resolución de proveedor por lista cerrada");
  const cola = bloque![0].trimEnd();
  assert(cola.endsWith(': "fake",'), `el valor por defecto no es el doble: ${cola.slice(-40)}`);
});

check("B2. el modelo lo pone el servidor, nunca la pantalla (§63)", () => {
  assert(/req\.config\.model/.test(OPENAI_CODE), "el modelo no sale de la configuración");
  const acciones = read("server/actions/quality-ai.ts");
  assert(!/"model"|'model'/.test(stripTs(acciones)),
    "una acción de servidor acepta un modelo del formulario");
  assert(/defaultModel/.test(CONFIG), "no hay modelo por omisión por proveedor");
});

check("B3. el esfuerzo de razonamiento es bajo por defecto y configurable (§13)", () => {
  assert(/return v === "minimal" \|\| v === "low"/.test(CONFIG_CODE)
    || /effortFromEnv/.test(CONFIG_CODE), "no hay esfuerzo de razonamiento");
  assert(/: "low";/.test(CONFIG_CODE), "el valor por defecto no es low");
  assert(!/"xhigh"|"max"/.test(CONFIG_CODE), "se admite un esfuerzo prohibido (§13)");
});

// ===========================================================================
console.log("\nC · LA LLAMADA: LO QUE LLEVA Y LO QUE NO");
// ===========================================================================

check("C1. no se retiene nada en el proveedor: store false (§6)", () => {
  assert(/store: false/.test(OPENAI_CODE), "no se envía store:false");
});

check("C2. NADA de búsqueda web, ficheros alojados ni ejecución de código (§53–§56)", () => {
  for (const prohibido of ["web_search", "file_search", "vector_store", "code_interpreter",
                           "computer_use", "web_search_preview"]) {
    assert(!new RegExp(prohibido).test(OPENAI_CODE),
      `el adaptador activa ${prohibido}`);
  }
  assert(!/\btools\s*:/.test(OPENAI_CODE), "se declaran herramientas del proveedor");
  assert(!/tool_choice/.test(OPENAI_CODE), "se fuerza el uso de herramientas");
});

check("C3. no se envía temperatura a un modelo que razona (§14)", () => {
  assert(!/temperature/.test(OPENAI_CODE), "se envía temperature");
  assert(!/top_p/.test(OPENAI_CODE), "se envía top_p");
});

check("C4. la salida es estructurada y estricta, y se valida igual (§26)", () => {
  assert(/type: "json_schema"/.test(OPENAI_CODE), "no se pide salida estructurada");
  assert(/strict: true/.test(OPENAI_CODE), "el esquema no es estricto");
  assert(/additionalProperties/.test(OPENAI_CODE),
    "no se cierra el esquema para el modo estricto");
  assert(/JSON\.parse/.test(OPENAI_CODE), "no se interpreta la salida");
  assert(/validateAnswer/.test(stripTs(COPILOT)),
    "el orquestador dejó de validar la respuesta");
});

check("C5. hay tope de salida y de tiempo", () => {
  assert(/max_output_tokens/.test(OPENAI_CODE), "no hay tope de salida");
  assert(/timeout:/.test(OPENAI_CODE), "no hay tope de tiempo");
});

check("C6. una negativa del modelo se distingue de un fallo (§, taxonomía)", () => {
  assert(/kind: "refused"/.test(OPENAI_CODE), "no se contempla la negativa");
  assert(/kind: "timeout"/.test(OPENAI_CODE), "no se contempla el tiempo agotado");
  assert(/kind: "unavailable"/.test(OPENAI_CODE), "no se contempla la caída");
  assert(/kind: "invalid_output"/.test(OPENAI_CODE), "no se contempla la salida rota");
});

check("C7. se registra el consumo que el proveedor informa, sin inventar (§12)", () => {
  for (const campo of ["input_tokens", "output_tokens", "cached_tokens",
                       "reasoning_tokens", "total_tokens"]) {
    assert(new RegExp(campo).test(OPENAI_CODE), `no se lee ${campo}`);
  }
  assert(/\?\? null/.test(OPENAI_CODE), "un campo ausente no queda en null");
});

// ===========================================================================
console.log("\nD · LAS FUENTES: YA NO FALTA NINGUNA (§22)");
// ===========================================================================

/** El catálogo, leído de su propio INSERT: primera columna de cada fila. */
const CATALOGO_SQL = /insert into public\.quality_ai_sources[\s\S]*?;\n/.exec(MIG132)![0];
const DECLARADAS = [...CATALOGO_SQL.matchAll(/^\s*\('([a-z_]+)',/gm)].map((m) => m[1]);

check("D1. las diecinueve fuentes del catálogo tienen adaptador", () => {
  const registrados = new Set(
    [...ADAPTERS.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]));
  const catalogo = DECLARADAS;
  assert(catalogo.length >= 19, `el catálogo trae ${catalogo.length} fuentes, se esperaban 19`);
  const faltan = catalogo.filter((c) => !registrados.has(c));
  assert(faltan.length === 0, `sin adaptador: ${faltan.join(", ")}`);
});

check("D2. cada adaptador declara la misma semántica temporal que el catálogo", () => {
  const semantica = new Map(
    [...CATALOGO_SQL.matchAll(
      /^\s*\('([a-z_]+)',[^\n]*?'(?:open|people|anonymous|restricted)',\s*'(current|period|as_of)'/gm)]
      .map((m) => [m[1], m[2]]));
  assert(semantica.size === DECLARADAS.length,
    `se leyó la semántica de ${semantica.size} de ${DECLARADAS.length} fuentes`);
  const bloques = ADAPTERS.split("registerAdapter({").slice(1);
  for (const b of bloques) {
    const code = /code: "([a-z_]+)"/.exec(b)?.[1];
    const temporal = /temporal: "([a-z_]+)"/.exec(b)?.[1];
    if (!code || !semantica.has(code)) continue;
    assert(temporal === semantica.get(code),
      `${code}: el adaptador dice ${temporal} y el catálogo ${semantica.get(code)}`);
  }
});

check("D3. la voz del cliente sigue tras su interruptor", () => {
  const bloque = ADAPTERS.split("registerAdapter({")
    .find((b) => /code: "customer_feedback"/.test(b));
  assert(bloque && /feature: "customer"/.test(bloque),
    "las quejas no dependen del permiso de voz del cliente");
});

check("D4. el adaptador de documentos lee la revisión de la FECHA, no la de hoy (§24)", () => {
  const b = ADAPTERS.split("registerAdapter({")
    .find((x) => /code: "document_revision"/.test(x))!;
  assert(/temporal\.mode === "as_of"/.test(b), "no distingue la pregunta histórica");
  assert(/lte\("effective_from", corte\)/.test(b),
    "no acota por la vigencia de la revisión");
  assert(/content_snapshot/.test(b),
    "no lee el contenido congelado de la revisión");
  assert(/order\("effective_from", \{ ascending: false \}\)/.test(b),
    "no toma la más reciente anterior al corte");
});

check("D5. el documento va RECORTADO, no entero (§25)", () => {
  assert(/SECCIONES_POR_DOCUMENTO = \d+/.test(ADAPTERS), "no hay tope de secciones");
  assert(/CARACTERES_POR_SECCION = \d+/.test(ADAPTERS), "no hay tope de caracteres");
  const b = ADAPTERS.split("registerAdapter({")
    .find((x) => /code: "document_revision"/.test(x))!;
  assert(/slice\(0, SECCIONES_POR_DOCUMENTO\)/.test(b), "no se recortan las secciones");
  assert(/slice\(0, CARACTERES_POR_SECCION\)/.test(b), "no se recorta el texto");
  assert(/w\.limitation\(/.test(b), "recorta sin decirlo");
});

check("D6. el contenido del documento entra como MATERIAL, no como instrucción (§26)", () => {
  const b = ADAPTERS.split("registerAdapter({")
    .find((x) => /code: "document_revision"/.test(x))!;
  assert(/w\.note\(/.test(b), "el texto del documento no va como nota");
  assert(!/w\.fact\([^)]*sec\.content/.test(b),
    "el texto del documento se cuela como hecho calculado");
  assert(/tenantBlock\("TEXTOS REGISTRADOS EN TRAZALOOP"/.test(COPILOT),
    "las notas dejaron de ir en zona marcada");
});

check("D7. los recuentos los hace el servidor, no el modelo (§32)", () => {
  for (const code of ["action", "control", "knowledge_item", "customer_feedback",
                      "automation_rule", "objective"]) {
    const b = ADAPTERS.split("registerAdapter({").find((x) => new RegExp(`code: "${code}"`).test(x))!;
    assert(/filas\.length|\.filter\(/.test(b), `${code} no cuenta nada en el servidor`);
  }
});

// ===========================================================================
console.log("\nE · LOS TEMAS DE CLIENTES (GAP-03 de QUALITY-12)");
// ===========================================================================

check("E1. el modelo NO cuenta los comentarios de un tema", () => {
  assert(/No cuentes cuántos son/.test(SCHEMAS),
    "el esquema no le dice al modelo que no cuente");
  assert(/evidence_count = excluded\.evidence_count|coalesce\(array_length\(v_valid, 1\), 0\)/
    .test(MIG133), "el recuento no sale de la evidencia real");
});

check("E2. una cita de un tema fuera de rango se descarta (§21)", () => {
  assert(/n >= 1 && n <= maxReference/.test(SCHEMAS), "no se acotan las citas");
  const bloque = /const themes: AiTheme\[\] = \[\];[\s\S]*?\n  }\n/.exec(SCHEMAS);
  assert(bloque, "no hay limpieza de temas");
  assert(/if \(validas\.length === 0\) continue;/.test(bloque![0]),
    "un tema sin evidencia válida sigue pasando");
});

check("E3. la evidencia de un tema tiene que ser de ESA consulta", () => {
  assert(/and r\.run_id = p_run_id/.test(MIG133),
    "una referencia de otra consulta valdría como evidencia");
});

check("E4. los temas solo se guardan en la consulta de temas", () => {
  assert(/req\.useCase === "customer_themes" && respuesta\.themes\.length > 0/
    .test(stripTs(COPILOT)), "cualquier consulta podría escribir temas");
});

check("E5. un tema no identifica a nadie", () => {
  const tabla = /create table public\.quality_ai_customer_themes[\s\S]*?\n\);/.exec(MIG133)![0];
  for (const prohibido of ["respondent", "contact_id", "invitation", "email",
                           "customer_id", "response_id"]) {
    assert(!new RegExp(prohibido).test(tabla), `la tabla guarda ${prohibido}`);
  }
});

check("E6. confirmarlo o descartarlo es de una PERSONA (§43)", () => {
  assert(/reviewed_by = auth\.uid\(\)/.test(MIG133), "se resuelve sin firmar quién");
  assert(/quality_ai_customer_themes_reviewed_consistent/.test(MIG133),
    "un tema puede quedar resuelto sin nadie detrás");
});

check("E7. un tema no se borra: se descarta (§120)", () => {
  assert(/t_quality_ai_customer_themes_no_delete/.test(MIG133), "falta el freno al borrado");
  assert(/'proposed', 'confirmed', 'discarded'/.test(MIG133), "no hay estado de descarte");
});

// ===========================================================================
console.log("\nF · LA MIGRACIÓN 0133");
// ===========================================================================

check("F1. la 0132 no se ha tocado (§65)", () => {
  assert(!/QUALITY-12\.1/.test(MIG132), "la 0132 lleva contenido de QUALITY-12.1");
  assert(!/customer_themes|cached_input_tokens/.test(MIG132),
    "la 0132 fue editada para meter lo nuevo");
});

check("F2. la 0133 y la 0134 van detrás de la 0132, en orden", () => {
  const migraciones = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  const i = migraciones.indexOf("0133_quality_ai_copilot_completion.sql");
  assert(i > 0, "la 0133 no está");
  assert(migraciones[i - 1] === "0132_quality_ai_copilot.sql",
    "algo se coló entre la 0132 y la 0133");
  assert(migraciones[i + 1] === "0134_quality_ai_provider_call_truth.sql",
    "algo se coló entre la 0133 y la 0134");
  assert(i + 1 === migraciones.length - 1, "la 0134 no es la última");
});

check("F3. las tablas nuevas tienen RLS y nada se abre a anon", () => {
  for (const t of ["quality_ai_customer_themes", "quality_ai_customer_theme_evidence"]) {
    assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(MIG133),
      `${t} sin RLS`);
    assert(new RegExp(`revoke all on table public\\.${t}\\s+from anon, authenticated`).test(MIG133),
      `${t} no revoca antes de conceder`);
    assert(!new RegExp(`grant [a-z, ]+ on table public\\.${t}\\s+to [a-z, ]*anon`).test(MIG133),
      `${t} concede algo a anon`);
  }
});

check("F4. las tablas nuevas son de SOLO LECTURA: se escriben por RPC", () => {
  for (const t of ["quality_ai_customer_themes", "quality_ai_customer_theme_evidence"]) {
    const grants = [...MIG133.matchAll(
      new RegExp(`grant ([a-z, ]+) on table public\\.${t}\\s+to authenticated`, "g"))];
    assert(grants.length > 0, `${t} no concede nada`);
    for (const g of grants) {
      assert(g[1].trim() === "select", `${t} concede ${g[1].trim()}`);
    }
  }
});

check("F5. toda función definer nueva fija su search_path (§151)", () => {
  const funciones = [...MIG133.matchAll(
    /create or replace function public\.([a-z_]+)\([\s\S]*?\$\$;/g)];
  assert(funciones.length >= 3, `solo se encontraron ${funciones.length} funciones`);
  for (const f of funciones) {
    if (!/security definer/.test(f[0])) continue;
    assert(/set search_path = public/.test(f[0]),
      `${f[1]} es definer y no fija search_path`);
  }
});

check("F6. no hay dos versiones de quality_ai_complete_run", () => {
  assert(/drop function if exists public\.quality_ai_complete_run\(uuid, jsonb, text, integer, integer, integer\)/
    .test(MIG133), "la firma antigua sigue viva y la llamada quedaría ambigua");
});

check("F7. la vista de la serie no expone identidad", () => {
  const vista = /create or replace view public\.v_quality_ai_customer_theme_series[\s\S]*?;\n/
    .exec(MIG133)![0];
  for (const prohibido of ["actor_id", "question", "answer", "full_name", "email"]) {
    assert(!new RegExp(prohibido).test(vista), `la serie expone ${prohibido}`);
  }
  assert(/lag\(/.test(vista), "la serie no compara con el periodo anterior");
});



// ===========================================================================
console.log("\nG · LO QUE ENSEÑÓ LA PRUEBA HUMANA");
// ===========================================================================

check("G1. la 0133 no se editó para arreglar la 0134 (§append-only)", () => {
  assert(!/provider_called/.test(MIG133),
    "la 0133 fue editada con contenido de la 0134");
  assert(!/provider_called/.test(MIG132), "la 0132 fue editada");
});

check("G2. una consulta sin contexto NO se registra como llamada", () => {
  assert(/p_provider_called: false/.test(stripTs(COPILOT)),
    "el atajo sin contexto no marca que no se llamó");
  assert(/p_provider_called: true/.test(stripTs(COPILOT)),
    "la llamada real no se marca");
  assert(/provider_called boolean not null default true/.test(MIG134),
    "la columna no existe");
});

check("G3. la pantalla distingue «no se llamó» de «no hay proveedor»", () => {
  const ui = read("components/domain/quality/copilot/copilot.tsx");
  assert(/providerCalled === false/.test(ui),
    "la pantalla no distingue la consulta sin llamada");
  assert(/Sin proveedor de IA configurado/.test(ui),
    "se perdió el aviso de proveedor no configurado");
  assert(/answered_without_calling/.test(ui),
    "el consumo no separa lo que no costó nada");
});

check("G4. el consumo separa las llamadas reales de las que no lo fueron", () => {
  assert(/'provider_calls_this_month'/.test(MIG134), "no se cuentan las llamadas reales");
  assert(/'answered_without_calling'/.test(MIG134), "no se cuentan las que no llamaron");
});

check("G5. las fuentes se leen a la vez, no en fila india", () => {
  const b = stripTs(BUILDER);
  assert(/enTandas\(/.test(b), "no hay lectura concurrente");
  assert(/Promise\.all/.test(b), "no se espera en paralelo");
  assert(/LECTURAS_A_LA_VEZ = \d+/.test(b), "no hay tope de concurrencia");
});

check("G6. la numeración de las citas sigue siendo determinista", () => {
  const b = stripTs(BUILDER);
  // El volcado tiene que ir en el orden declarado y REMAPEAR las citas: si un
  // hecho conserva el número que tenía en su acumulador de origen, estaría
  // citando otra fuente.
  assert(/absorb\(propio\)/.test(b), "no se vuelca en orden");
  assert(/mapa\.set\(ordinal, this\.ref\(resto\)\)/.test(b),
    "no se remapean los números de cita al volcar");
  assert(/traducir\(f\.refs\)/.test(b) && /traducir\(n\.refs\)/.test(b),
    "hechos o notas conservan números de cita del acumulador de origen");
});

check("G7. leer en paralelo no relajó ningún permiso", () => {
  const b = stripTs(BUILDER);
  assert(!/service_role|SERVICE_ROLE/.test(b), "el constructor usa la clave de servicio");
  assert(/client \?\? await createServerClient\(\)/.test(b),
    "dejó de construirse con la sesión de quien pregunta");
  assert(!/security definer/i.test(b), "el constructor invoca algo definer");
});

// ===========================================================================
console.log("\nH · LA CADENA TEMPORAL, DE LA PANTALLA AL SERVIDOR");
// ---------------------------------------------------------------------------
// El defecto que encontró la segunda prueba humana: el servidor leía cuatro
// campos del formulario —`temporal_mode`, `as_of`, `period_start`,
// `period_end`— y la pantalla NO PINTABA NINGUNO. Toda consulta llegaba como
// «ahora», y una pregunta histórica respondía con el documento de hoy.
//
// Ninguna prueba lo vio porque todas montaban el alcance a mano y llamaban al
// constructor de contexto. Estas comprueban la costura.
// ===========================================================================

const UI = read("components/domain/quality/copilot/copilot.tsx");
const ACCIONES = read("server/actions/quality-ai.ts");
const PETICION = read("lib/domain/quality-ai-request.ts");

check("H1. la pantalla pinta los cuatro campos que el servidor lee", () => {
  // Los nombres viven en un único sitio; que la pantalla y el servidor los
  // compartan es lo que impide que vuelvan a divergir en silencio.
  for (const campo of ["temporal_mode", "as_of", "period_start", "period_end"]) {
    assert(new RegExp(`name="${campo}"`).test(UI),
      `la pantalla no pinta ningún control llamado ${campo}`);
    assert(new RegExp(`"${campo}"`).test(PETICION),
      `el servidor no lee ${campo}`);
  }
  assert(/AI_FORM_FIELDS/.test(PETICION), "los nombres de campo no están en un único sitio");
});

check("H2. el caso de uso se ELIGE, no viene fijado a la fuerza", () => {
  assert(/<select[\s\S]{0,200}name="use_case"/.test(UI),
    "el caso de uso no es un selector");
  assert(!/type="hidden" name="use_case"/.test(UI),
    "el caso de uso sigue siendo un campo oculto que nadie puede cambiar");
  assert(/USE_CASES\.map/.test(UI), "las opciones no salen de la lista cerrada");
});

check("H3. los tres modos temporales están ofrecidos", () => {
  for (const modo of ["current", "as_of", "period"]) {
    assert(new RegExp(`value="${modo}"`).test(UI), `falta el modo ${modo}`);
  }
});

check("H4. la lectura del alcance es una función aparte y comprobable", () => {
  assert(/export function readTemporal\(/.test(PETICION),
    "no se puede probar la lectura del alcance sin montar un servidor");
  assert(!/^import .*next/m.test(PETICION),
    "el módulo arrastra Next.js y volvería a no poder probarse");
  assert(/const temporal = readTemporal\(formData\)/.test(ACCIONES),
    "la acción no usa la función que se prueba");
  assert(/const useCase = readUseCase\(formData\)/.test(ACCIONES),
    "la acción no usa la lectura del caso de uso que se prueba");
});

check("H5. una fecha ausente NO se inventa", () => {
  // El tipo de retorno de la función también acaba en `}` a principio de línea,
  // así que se corta desde el cuerpo real: la primera llave de apertura.
  const cuerpo = PETICION.slice(PETICION.indexOf("export function readTemporal("));
  assert(/return fecha\s*\?[\s\S]{0,80}mode: "current"/.test(cuerpo),
    "sin fecha, el modo histórico sigue adelante con una fecha inventada");
  assert(/if \(!inicio && !fin\) return \{ mode: "current" \};/.test(cuerpo),
    "un periodo sin fechas no cae en «ahora»");
});

// ===========================================================================
console.log("\nI · LO QUE ENSEÑÓ LA SEGUNDA PRUEBA HUMANA");
// ===========================================================================

check("I1. un objetivo sin indicadores NO se presenta como objetivo cumplido", () => {
  const b = ADAPTERS.split("registerAdapter({").find((x) => /code: "objective"/.test(x))!;
  assert(/sinIndicadores/.test(b), "no se distingue el objetivo que no se mide");
  assert(/NO se[\s\S]{0,40}puede medir con datos/.test(b),
    "no se dice que su cumplimiento no se puede medir");
  assert(/w\.conflict\(/.test(b),
    "no se avisa de que sus ceros no son comparables con los indicadores sueltos");
  assert(/performance_explanation/.test(b),
    "se ignora el veredicto que la vista ya calcula");
});

check("I2. cero titulares se distingue de uno solo", () => {
  const b = ADAPTERS.split("registerAdapter({").find((x) => /code: "knowledge_item"/.test(x))!;
  assert(/titulares === 0/.test(b) && /titulares === 1/.test(b),
    "cero y uno se cuentan con la misma frase");
  assert(/peor que depender de una sola persona/.test(b),
    "no se dice que ningún titular es peor que uno solo");
});

check("I3. los marcadores de cita tienen UNA sola autoridad", () => {
  assert(/function sinMarcadores/.test(SCHEMAS),
    "el texto del modelo conserva sus propios marcadores de cita");
  for (const campo of ["summary", "statement", "detail"]) {
    assert(new RegExp(`sinMarcadores\\(fila\\.${campo}\\)|sinMarcadores\\(v\\.${campo}\\)`)
      .test(SCHEMAS), `${campo} no se limpia`);
  }
  assert(/references\.map\(\(n\) => \(/.test(UI),
    "la interfaz dejó de pintar las citas desde las referencias validadas");
});

check("I4. la respuesta separa lo citado de lo solo consultado", () => {
  assert(/function Fuentes\(/.test(UI), "no hay separación de fuentes");
  assert(/Fuentes citadas/.test(UI), "no se destacan las citadas");
  assert(/no se\n\s*citaron en la respuesta|no se citaron/.test(UI),
    "no se dice cuántas se consultaron sin citar");
});

console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
