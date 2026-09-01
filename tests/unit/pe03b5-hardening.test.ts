/**
 * Trazaloop · PE-03B5 · El endurecimiento, revalidado antes de cerrar.
 *
 * Todo lo que este tramo defiende son INVARIANTES que ya se ganaron y que
 * podrían perderse sin que nadie lo note: que no vuelva un tope de producto,
 * que el vídeo no se cargue entero en memoria, que ninguna credencial de
 * servicio se extienda a otra acción, que los tutoriales no toquen el plan ni
 * la cuota de nadie.
 *
 * Un invariante se pierde en silencio. Por eso se vigilan leyendo, y por eso
 * esta suite está en `test:all`.
 *
 * Correr: npm run test:pe03b5-hardening
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  TUTORIAL_PLAYBACK_TTL_SECONDS, TUTORIAL_UPLOAD_HORIZON_SECONDS,
  TUTORIAL_INFRASTRUCTURE_NOTE, TUTORIAL_UNAVAILABLE_MESSAGE,
  TUTORIAL_HASH_CHUNK_BYTES,
} from "../../lib/domain/tutorial-media";
import { RESUMABLE_CHUNK_BYTES } from "../../lib/storage/resumable-upload";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");
const sinComentarios = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*--.*$/gm, "");

/** Todos los ficheros del subsistema de tutoriales. */
function ficherosDeTutoriales(): string[] {
  const fuera: string[] = [];
  const raices = ["lib/db", "lib/domain", "lib/storage", "server/actions",
    "components/domain/tutorials"];
  for (const raiz of raices) {
    if (!existsSync(raiz)) continue;
    for (const n of readdirSync(raiz)) {
      const p = join(raiz, n);
      if (statSync(p).isDirectory()) continue;
      if (/tutorial|welcome|resumable|user-preferences/.test(n)) fuera.push(p);
    }
  }
  return fuera;
}
const FICHEROS = ficherosDeTutoriales();
const TODO = FICHEROS.map(leer).join("\n");
const MIGRACIONES = ["0159_platform_tutorial_media_foundation.sql",
  "0160_platform_tutorial_unbounded_media.sql", "0161_user_product_preferences.sql"]
  .map((f) => leer(`supabase/migrations/${f}`)).join("\n");

console.log("\nPE-03B5 · Endurecimiento\n");
console.log(`  ficheros del subsistema vigilados: ${FICHEROS.length}\n`);

// ===========================================================================
console.log("A · Ningún tope de producto, por ninguna puerta");
// ===========================================================================

check("A1. Ninguna constante de tamaño máximo en el subsistema", () => {
  const codigo = sinComentarios(TODO);
  for (const patron of [/MAX_(FILE|SIZE|UPLOAD|VIDEO|MEDIA)/, /TUTORIAL_MAX_/,
    /\b(200|500|1024|2048)\s*\*\s*1024\s*\*\s*1024\b/]) {
    const m = codigo.match(patron);
    assert(!m, `vuelve un tope de producto: «${m?.[0]}»`);
  }
});

check("A2. La ÚLTIMA migración que toca el tamaño no impone techo", () => {
  // Se mira 0160 sola, no las tres concatenadas.
  //
  // Las migraciones son acumulativas: el texto de 0159 conserva el tope de
  // 200 MB porque ASÍ FUE, y buscarlo en la suma de todas encuentra historia,
  // no estado. Confundir las dos cosas es el error que este repositorio evita
  // en los datos y que aquí estuve a punto de cometer en las pruebas.
  //
  // El estado REAL de la base lo comprueba `pe03b5-integrated` contra
  // `pg_constraint`, que es donde se puede comprobar de verdad.
  const s0160 = sinComentarios(leer(
    "supabase/migrations/0160_platform_tutorial_unbounded_media.sql"));
  const topes = [...s0160.matchAll(/(declared_size_bytes|real_size_bytes)\s*(<=|<)\s*(\d+)/g)];
  assert(topes.length === 0,
    `0160 reintrodujo un techo: ${topes.map((m) => m[0]).join(", ")}`);
  assert(/declared_size_bytes > 0/.test(s0160),
    "0160 perdió la comprobación de archivo vacío");
  // Y no hay ninguna migración POSTERIOR que lo devuelva.
  const posteriores = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql") && f.slice(0, 4) > "0160");
  for (const f of posteriores) {
    const sql = sinComentarios(leer(`supabase/migrations/${f}`));
    assert(!/(declared_size_bytes|real_size_bytes)\s*(<=|<)\s*\d/.test(sql),
      `${f} volvió a poner un techo de tamaño`);
  }
});

check("A3. Y el cubo no declara ninguno", () => {
  const sql = sinComentarios(MIGRACIONES);
  assert(/set file_size_limit = null/.test(sql),
    "el cubo de tutoriales volvió a declarar un tope propio");
});

check("A4. Ninguna comprobación de duración decide nada", () => {
  const codigo = sinComentarios(TODO);
  assert(!/duration_seconds\s*[<>]=?\s*\d/.test(codigo),
    "se compara la duración con un número");
  assert(!/durationSeconds\s*[<>]=?\s*\d/.test(codigo), "ídem, en el dominio");
  // En la base, el estado real lo comprueba `pe03b5-integrated`: 0159 declara
  // `duration_seconds > 0` para que una duración informada sea creíble, y eso
  // NO es un máximo. Buscar el patrón en el texto no distingue las dos cosas.
});

check("A5. La copia dice de quién es el límite, y no promete «ilimitado»", () => {
  assert(/no hay un límite de tamaño definido por trazaloop/i
    .test(TUTORIAL_INFRASTRUCTURE_NOTE), "la copia cambió de sentido");
  assert(/capacidad técnica del servicio/i.test(TUTORIAL_INFRASTRUCTURE_NOTE),
    "la copia no dice de quién es el límite real");
  assert(!/ilimitad/i.test(TUTORIAL_INFRASTRUCTURE_NOTE),
    "la copia promete «ilimitado», que es falso");
  assert(!/\d+\s*(MB|GB|MiB|GiB)/i.test(TUTORIAL_INFRASTRUCTURE_NOTE),
    "la copia da un número como si fuera una regla del producto");
});

check("A6. Y el techo del proveedor no se promete como contrato", () => {
  // Se puede DOCUMENTAR lo que se midió; lo que no se puede es prometerlo en
  // una pantalla, porque el proveedor lo cambia cuando quiere.
  const visible = FICHEROS.filter((f) => f.includes("components/"))
    .map(leer).map(sinComentarios).join("\n");
  assert(!/48[.,]8|52428800000|GiB/.test(visible),
    "una pantalla promete la capacidad del proveedor");
});

// ===========================================================================
console.log("\nB · La memoria no crece con el vídeo");
// ===========================================================================

check("B1. La verificación sigue leyendo en flujo", () => {
  const integridad = sinComentarios(leer("lib/db/tutorial-integrity.ts"));
  assert(/createHash\("sha256"\)/.test(integridad), "no se calcula SHA-256 incremental");
  assert(/getReader\(\)/.test(integridad), "no se lee en flujo");
  assert(/hash\.update\(value\)/.test(integridad), "el resumen no se alimenta trozo a trozo");
  assert(!/arrayBuffer\(\)/.test(integridad), "se materializa el archivo entero");
  assert(!/\.download\(/.test(integridad), "se usa .download(), que devuelve un Blob completo");
});

check("B2. Y quien la llama tampoco carga el archivo", () => {
  const plataforma = sinComentarios(leer("lib/db/tutorials-platform.ts"));
  assert(!/arrayBuffer\(\)/.test(plataforma), "la finalización materializa el archivo");
  assert(/verifyTutorialObject\(/.test(plataforma), "no se usa la verificación en flujo");
});

check("B3. El trozo declarado sigue siendo pequeño", () => {
  assert(TUTORIAL_HASH_CHUNK_BYTES <= 256 * 1024,
    `el trozo del resumen son ${TUTORIAL_HASH_CHUNK_BYTES} bytes`);
});

check("B4. Y el navegador no lee el vídeo entero para subirlo", () => {
  const reanudable = sinComentarios(leer("lib/storage/resumable-upload.ts"));
  assert(/file\.slice\(/.test(reanudable), "no se trocea el archivo");
  assert(!/await file\.arrayBuffer\(\)/.test(reanudable),
    "el navegador materializa el vídeo entero");
  assert(RESUMABLE_CHUNK_BYTES > 0 && RESUMABLE_CHUNK_BYTES <= 16 * 1024 * 1024,
    `el trozo de subida son ${RESUMABLE_CHUNK_BYTES} bytes`);
});

// ===========================================================================
console.log("\nC · El transporte reanudable, y su frontera");
// ===========================================================================

check("C1. Se sigue usando el extremo reanudable", () => {
  const reanudable = sinComentarios(leer("lib/storage/resumable-upload.ts"));
  assert(/upload\/resumable/.test(reanudable), "no se usa el extremo reanudable");
  assert(/Upload-Offset/i.test(reanudable), "no se envía el desplazamiento");
});

check("C2. Y el desplazamiento lo dice el SERVIDOR", () => {
  const reanudable = sinComentarios(leer("lib/storage/resumable-upload.ts"));
  assert(/method: "HEAD"/.test(reanudable),
    "al reintentar no se pregunta al servidor por dónde iba");
  assert(/upload-offset/i.test(reanudable), "no se lee el desplazamiento real");
});

check("C3. Ninguna credencial de servicio baja al navegador", () => {
  const cliente = FICHEROS.filter((f) => f.includes("components/") || f.includes("lib/storage/"))
    .map(leer).map(sinComentarios).join("\n");
  assert(!/SERVICE_ROLE|service_role|createAdminClient/.test(cliente),
    "el navegador maneja una credencial de servicio");
  assert(/access_token/.test(sinComentarios(leer("components/domain/tutorials/tutorial-upload.tsx"))),
    "la subida dejó de autenticarse con la sesión de la persona");
});

check("C4. La reserva sigue siendo la frontera, y el reloj NO", () => {
  // 0160 es la que manda: se lee ella, no la suma de las tres. La definición
  // VIVA en la base la comprueba `pe03b5-integrated` con `pg_get_functiondef`.
  const s0160 = sinComentarios(leer(
    "supabase/migrations/0160_platform_tutorial_unbounded_media.sql"));
  const i = s0160.indexOf("function public.tutorial_media_has_reservation");
  assert(i > -1, "0160 dejó de redefinir el predicado de la reserva");
  const cuerpo = s0160.slice(i, s0160.indexOf("$;", i) + 2);
  assert(/file_state in \('reserved', 'uploaded'\)/.test(cuerpo),
    "la política dejó de exigir una reserva");
  assert(!/upload_expires_at/.test(cuerpo),
    "el reloj de la reserva volvió al predicado que autoriza escribir");
});

check("C5. Y el horizonte de la reserva no es un plazo de subida", () => {
  assert(TUTORIAL_UPLOAD_HORIZON_SECONDS >= 60 * 60,
    `el horizonte son ${TUTORIAL_UPLOAD_HORIZON_SECONDS} s: demasiado corto`);
  const dominio = leer("lib/domain/tutorial-media.ts");
  assert(!/TUTORIAL_UPLOAD_TTL/.test(dominio),
    "vuelve a llamarse TTL: eso es lo que hacía pensar que era un plazo de subida");
});

// ===========================================================================
console.log("\nD · La reproducción");
// ===========================================================================

check("D1. El plazo sigue siendo de seguridad, no una comodidad", () => {
  assert(TUTORIAL_PLAYBACK_TTL_SECONDS === 2 * 60 * 60,
    `el plazo son ${TUTORIAL_PLAYBACK_TTL_SECONDS} s`);
  assert(TUTORIAL_PLAYBACK_TTL_SECONDS < TUTORIAL_UPLOAD_HORIZON_SECONDS,
    "el plazo de lectura alcanzó al horizonte de la reserva");
});

check("D2. Se renueva antes de vencer, y conserva el segundo", () => {
  const reproductor = sinComentarios(leer("components/domain/tutorials/tutorial-player.tsx"));
  assert(/setTimeout/.test(reproductor), "no se programa la renovación");
  assert(/expiresInSeconds \* 0\.1/.test(reproductor), "no hay margen antes del vencimiento");
  assert(/el\.currentTime = segundo/.test(reproductor), "no se vuelve al segundo");
  assert(/loadedmetadata/.test(reproductor), "se vuelve al segundo demasiado pronto");
});

check("D3. Se firma solo la VIGENTE, y nunca una que se pida", () => {
  const lector = sinComentarios(leer("lib/db/tutorials.ts"));
  assert(!/versionId\??:\s*string/.test(
    lector.slice(lector.indexOf("export async function signTutorialPlayback"),
      lector.indexOf("export async function signTutorialPlayback") + 300)),
    "la firma acepta un identificador de versión de quien llama");
  assert(/tutorial_current_object_path/.test(lector),
    "la ruta no la resuelve la función que solo devuelve la vigente");
  const acciones = sinComentarios(leer("server/actions/tutorials.ts"))
    + sinComentarios(leer("server/actions/welcome.ts"));
  assert(!/versionId/.test(acciones), "una acción de cliente maneja versiones");
});

check("D4. Y no se firma nada al pintar una pantalla", () => {
  const accion = sinComentarios(leer("components/domain/tutorials/page-tutorial-action.tsx"));
  const cuerpo = accion.slice(accion.indexOf("export function PageTutorialAction"),
    accion.indexOf("function TutorialDialog"));
  assert(!/getTutorialForPageAction\(/.test(cuerpo),
    "se pregunta por el vídeo al pintar la pantalla");
  assert(!/signTutorial|createSignedUrl/.test(cuerpo), "se firma al pintar");
});

// ===========================================================================
console.log("\nE · Las averías no se presentan como ausencias");
// ===========================================================================

check("E1. El tutorial de pantalla distingue las TRES respuestas", () => {
  const acciones = sinComentarios(leer("server/actions/tutorials.ts"));
  for (const estado of ["ready", "no_video", "unavailable"]) {
    assert(new RegExp(`status: "${estado}"`).test(acciones), `falta el estado «${estado}»`);
  }
  // Cada retorno lleva SU mensaje. Se comprueba emparejando estado y mensaje en
  // la misma expresión, no por cercanía en el fichero: dos ramas contiguas se
  // «tocan» y una heurística de proximidad las confunde.
  const retornos = [...acciones.matchAll(/status: "(\w+)", message: (\w+)/g)]
    .map((m) => [m[1], m[2]] as [string, string]);
  for (const [estado, mensaje] of retornos) {
    if (estado === "unavailable") {
      assert(mensaje !== "TUTORIAL_UNAVAILABLE_MESSAGE",
        "una avería se cuenta como que no hay tutorial");
    }
    if (estado === "no_video") {
      assert(mensaje === "TUTORIAL_UNAVAILABLE_MESSAGE",
        `«no_video» responde con «${mensaje}» y no con la copia congelada`);
    }
  }
  assert(retornos.some(([e]) => e === "unavailable"), "no se devuelve ninguna avería");
  assert(retornos.some(([e]) => e === "no_video"), "no se devuelve ninguna ausencia");
});

check("E2. La copia congelada sigue siendo la misma", () => {
  assert(TUTORIAL_UNAVAILABLE_MESSAGE
    === "Este tutorial está en actualización y estará disponible pronto",
    `la copia congelada cambió: «${TUTORIAL_UNAVAILABLE_MESSAGE}»`);
});

check("E3. La bienvenida NO tiene estado de avería · y es deliberado", () => {
  const bienvenida = sinComentarios(leer("server/actions/welcome.ts"));
  assert(!/"unavailable"/.test(bienvenida),
    "la bienvenida presenta averías, y eso la convierte en una puerta");
  assert(/suprimida !== false/.test(bienvenida),
    "una lectura fallida de la preferencia se trata como «no la suprimió»");
});

check("E4. Y nada de esto rompe la pantalla", () => {
  for (const f of FICHEROS.filter((x) => x.includes("components/"))) {
    const codigo = sinComentarios(leer(f));
    assert(!/\bthrow new\b/.test(codigo), `${f} lanza desde el navegador`);
  }
});

// ===========================================================================
console.log("\nF · Nada técnico llega a la pantalla del cliente");
// ===========================================================================

check("F1. Ni rutas, ni resúmenes, ni identificadores", () => {
  const cliente = sinComentarios(leer("components/domain/tutorials/page-tutorial-action.tsx"))
    + sinComentarios(leer("components/domain/tutorials/welcome-video.tsx"))
    + sinComentarios(leer("server/actions/tutorials.ts"))
    + sinComentarios(leer("server/actions/welcome.ts"));
  for (const interno of ["objectPath", "object_path", "contentHash", "content_hash",
    "storage_path", "uploadedBy", "publishedBy", "versionId"]) {
    assert(!new RegExp(`\\b${interno}\\b`).test(cliente),
      `la pantalla del cliente maneja «${interno}»`);
  }
});

check("F2. Ni vocabulario de infraestructura", () => {
  const visible = sinComentarios(leer("components/domain/tutorials/page-tutorial-action.tsx"))
    + sinComentarios(leer("components/domain/tutorials/welcome-video.tsx"));
  // Se buscan en el TEXTO que se pinta, no en el código: `TutorialPlayer` es un
  // nombre de componente y no lo lee nadie.
  const textos = [...visible.matchAll(/>([^<>{}]{8,})</g)].map((m) => m[1]).join(" ");
  for (const jerga of ["TUS", "RLS", "signed", "URL firmada", "Storage", "bucket", "SHA"]) {
    assert(!new RegExp(`\\b${jerga}\\b`, "i").test(textos),
      `un texto visible dice «${jerga}»`);
  }
});

check("F3. Y el error del almacenamiento no se enseña en crudo", () => {
  const subida = sinComentarios(leer("components/domain/tutorials/tutorial-upload.tsx"));
  assert(/tutorialUploadErrorMessage\(/.test(subida),
    "el error de Storage se muestra sin traducir");
});

// ===========================================================================
console.log("\nG · La credencial de servicio no se ha extendido");
// ===========================================================================

check("G1. Sigue habiendo UN solo módulo que la usa", () => {
  const usan = FICHEROS.filter((f) => /createAdminClient/.test(leer(f)));
  assert(usan.length === 1, `la usan ${usan.length} módulos: ${usan.join(", ")}`);
  assert(usan[0] === "lib/db/tutorial-object-cleanup.ts",
    `la usa un módulo inesperado: ${usan[0]}`);
});

check("G2. Y una sola acción la invoca, tras comprobar el papel", () => {
  const admin = sinComentarios(leer("server/actions/tutorials-admin.ts"));
  const invocaciones = (admin.match(/removeDiscardedTutorialObject\(/g) ?? []).length;
  assert(invocaciones === 1, `se invoca ${invocaciones} veces`);
  const i = admin.indexOf("export async function discardCandidateAction");
  const j = admin.indexOf("removeDiscardedTutorialObject(");
  assert(i > -1 && j > i, "la invocación no está dentro de discardCandidateAction");
  const cuerpo = admin.slice(i, j);
  assert(/isSuperadmin/.test(cuerpo), "no se comprueba el papel antes de invocarla");
  assert(/effective_from !== null/.test(cuerpo),
    "no se comprueba que la versión nunca se publicó");
});

check("G3. Y antes de borrar se comprueba que nadie referencia el objeto", () => {
  const limpieza = sinComentarios(leer("lib/db/tutorial-object-cleanup.ts"));
  const i = limpieza.indexOf('.from("platform_tutorial_versions")');
  const j = limpieza.indexOf(".remove(");
  assert(i > -1 && j > i, "se borra sin comprobar referencias antes");
  assert(/still_referenced/.test(limpieza), "no se distingue «lo usa otro»");
});

check("G4. El cubo sigue sin política de DELETE", () => {
  const sql = sinComentarios(MIGRACIONES);
  const politicas = [...sql.matchAll(/create policy\s+(\S+)\s+on storage\.objects\s+for (\w+)/gi)];
  const borrado = politicas.filter((m) => m[2].toLowerCase() === "delete");
  assert(borrado.length === 0,
    `el cubo tiene política de DELETE: ${borrado.map((m) => m[1]).join(", ")}`);
});

// ===========================================================================
console.log("\nH · Ni planes, ni cuotas, ni PE-04");
// ===========================================================================

check("H1. El subsistema no consulta ninguna tabla comercial", () => {
  const codigo = sinComentarios(TODO);
  for (const rastro of ["organization_modules", "organization_subscriptions", "plan_code",
    "access_mode", "entitlement", "storage_limit", "quota", "coupon", "payment"]) {
    assert(!new RegExp(`\\b${rastro}\\b`, "i").test(codigo),
      `el subsistema de tutoriales toca «${rastro}»`);
  }
});

check("H2. Y los medios de tutorial NO cuentan en la cuota de ninguna empresa", () => {
  // La vista de uso suma evidencias, logo, archivos de TrazaDocs y evidencias
  // textiles. Si alguien sumara `platform_tutorial_versions`, un vídeo de la
  // plataforma consumiría el plan de un cliente.
  const migraciones = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
  for (const f of migraciones) {
    const sql = leer(`supabase/migrations/${f}`);
    if (!/v_organization_plan_usage|storage_used_bytes/.test(sql)) continue;
    const vistas = sql.split("create or replace view").slice(1)
      .filter((v) => /storage_used_bytes/.test(v));
    for (const v of vistas) {
      assert(!/platform_tutorial|tutorial-media/.test(v),
        `${f} suma medios de tutorial a la cuota de empresa`);
    }
  }
});

check("H3. Los medios de tutorial son contenido de PLATAFORMA", () => {
  // Se miran las sentencias `create table`, no el fichero entero: 0159 explica
  // en su cabecera POR QUÉ no lleva `organization_id`, y buscar la palabra a
  // secas convierte esa explicación en un fallo.
  const sql = MIGRACIONES;
  for (const trozo of sql.split(/create table\s+/i).slice(1)) {
    const cuerpo = trozo.slice(0, trozo.indexOf(");"));
    if (!/platform_tutorial|user_preferences/.test(cuerpo.slice(0, 80))) continue;
    assert(!/organization_id/.test(sinComentarios(cuerpo)),
      `«${cuerpo.slice(0, 60).trim()}» cuelga de una empresa`);
  }
});

console.log(`\nPE-03B5 · endurecimiento: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
