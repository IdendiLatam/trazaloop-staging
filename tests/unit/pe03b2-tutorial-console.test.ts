/**
 * Trazaloop · PE-03B2 · La consola, leída en el código.
 *
 * Lo que no se ve contra la base: que la navegación de plataforma la ofrezca,
 * que los bytes no vuelvan a atravesar Next.js, que subir no se anuncie como
 * publicar, y que ninguna acción se salte la puerta.
 *
 * Correr: npm run test:pe03b2
 */
import { readFileSync, existsSync } from "node:fs";

import {
  TUTORIAL_FILE_STATE_LABEL, TUTORIAL_PUBLICATION_LABEL, TUTORIAL_UPLOAD_STEP_LABEL,
  tutorialCoverageLabel, tutorialPublicationState, humanDuration, humanFileSize,
  tutorialUploadErrorMessage,
} from "../../lib/domain/tutorial-admin";
import { TUTORIAL_UNAVAILABLE_MESSAGE } from "../../lib/domain/tutorial-media";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");
const sinComentarios = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const REGISTRO = leer("lib/modules/registry.ts");
const LISTA = leer("app/(app)/platform/tutorials/page.tsx");
const FICHA = leer("app/(app)/platform/tutorials/[id]/page.tsx");
const SUBIDA = leer("components/domain/tutorials/tutorial-upload.tsx");
const FORMS = leer("components/domain/tutorials/tutorial-admin-forms.tsx");
const ACCIONES = leer("server/actions/tutorials-admin.ts");
const DB = leer("lib/db/tutorials-platform.ts");
const LIMPIEZA = leer("lib/db/tutorial-object-cleanup.ts");
const CONFIG = leer("next.config.ts");

console.log("\nPE-03B2 · La consola de tutoriales, en el código\n");

// ===========================================================================
console.log("A · Se llega");
// ===========================================================================

check("A1. Está en la navegación de plataforma", () => {
  assert(/\{ label: "Tutoriales", href: "\/platform\/tutorials" \}/.test(REGISTRO),
    "la consola no está en el menú de plataforma");
  // Y dentro del grupo de plataforma, no en el de empresa.
  const grupo = REGISTRO.slice(REGISTRO.indexOf("PLATFORM_GROUP"),
    REGISTRO.indexOf("NAV_TOP_LEVEL"));
  assert(grupo.includes("/platform/tutorials"),
    "la entrada está fuera del grupo de plataforma");
});

check("A2. Y ese grupo solo se pinta para personal de plataforma", () => {
  const nav = leer("components/layout/nav.tsx");
  assert(/showPlatform/.test(nav), "el menú no distingue al personal de plataforma");
  const shell = leer("app/(app)/(shell)/layout.tsx");
  assert(/showPlatform=\{platformStatus\.isStaff\}/.test(shell),
    "el shell no decide el menú de plataforma por el estado real");
});

check("A3. Las dos pantallas existen", () => {
  assert(existsSync("app/(app)/platform/tutorials/page.tsx"), "falta la lista");
  assert(existsSync("app/(app)/platform/tutorials/[id]/page.tsx"), "falta la ficha");
});

// ===========================================================================
console.log("\nB · Los bytes NO vuelven a pasar por Next.js");
// ===========================================================================

check("B1. La subida usa la URL firmada, no una Server Action", () => {
  assert(/uploadToSignedUrl/.test(SUBIDA),
    "la subida no usa el transporte directo a Storage");
  // El archivo jamás entra en un FormData que viaje al servidor.
  const codigo = sinComentarios(SUBIDA);
  assert(!/formData\.append\([^)]*file/i.test(codigo),
    "el archivo viaja dentro de un FormData de Server Action");
  assert(!/new FormData/.test(codigo) || !/\.set\([^)]*File/i.test(codigo),
    "el archivo viaja en un FormData");
});

check("B2. Y next.config.ts sigue sin bodySizeLimit", () => {
  assert(!/bodySizeLimit\s*:/.test(sinComentarios(CONFIG)),
    "se reintrodujo el límite de cuerpo: los vídeos volverían a pasar por Vercel");
});

check("B3. Las acciones solo mueven mensajes cortos", () => {
  // Reservar, finalizar y avisar del fallo. Ninguna recibe bytes.
  for (const accion of ["reserveTutorialUploadAction", "finalizeTutorialUploadAction"]) {
    assert(ACCIONES.includes(accion), `falta la acción ${accion}`);
  }
  // Se buscan los TIPOS en la firma, no la palabra suelta: «File» vive dentro
  // de `validateTutorialFileDeclaration`, y buscarla a secas convertiría el
  // nombre de una función en un fallo.
  const firmas = [...sinComentarios(ACCIONES).matchAll(/:\s*(File|Blob|ArrayBuffer|FormData)\b/g)];
  const conArchivo = firmas.filter((m) => m[1] !== "FormData");
  assert(conArchivo.length === 0,
    `una acción declara recibir ${conArchivo.map((m) => m[1]).join(", ")}`);
});

// ===========================================================================
console.log("\nC · Subir no es publicar, y se dice");
// ===========================================================================

check("C1. El último paso de la subida se llama «Listo para revisar»", () => {
  assert(TUTORIAL_UPLOAD_STEP_LABEL.done === "Listo para revisar",
    `el paso final se llama «${TUTORIAL_UPLOAD_STEP_LABEL.done}»`);
  const etiquetas = Object.values(TUTORIAL_UPLOAD_STEP_LABEL).join(" ").toLowerCase();
  assert(!etiquetas.includes("publicad"),
    "un paso de la subida se anuncia como publicación");
});

check("C2. Y el formulario lo dice con todas las letras", () => {
  assert(/no publica/i.test(SUBIDA),
    "el formulario de subida no advierte de que subir no publica");
});

check("C3. Publicar pide confirmación, y explica qué cambia", () => {
  assert(/confirmando/.test(FORMS), "publicar no pide confirmación");
  assert(/todo el mundo verá esta|todo el mundo/i.test(FORMS),
    "la confirmación no dice que cambia lo que ve la gente");
});

check("C4. La lista distingue publicada, sin publicar y sin vídeo", () => {
  assert(tutorialCoverageLabel({ current: {}, candidate: null }).tone === "ok",
    "con vídeo no se marca como tal");
  assert(tutorialCoverageLabel({ current: null, candidate: {} }).tone === "pending",
    "una candidata no se distingue");
  const sin = tutorialCoverageLabel({ current: null, candidate: null });
  assert(sin.tone === "none", "sin vídeo no se distingue");
  // Y no se llama defecto a lo que es normal.
  assert(!/falta|incomplet|error|pendiente de/i.test(sin.text),
    `«${sin.text}» presenta como fallo que una pantalla no tenga vídeo todavía`);
});

check("C5. El estado se dice con palabras, no solo con color", () => {
  const visible = sinComentarios(LISTA);
  assert(/cobertura\.text/.test(visible), "la lista no escribe el estado");
  // Y en la ficha, cada versión lleva su etiqueta.
  assert(/TUTORIAL_PUBLICATION_LABEL\[estado\]/.test(FICHA),
    "la historia no escribe el estado de cada versión");
  assert(TUTORIAL_PUBLICATION_LABEL.published === "Publicada",
    "el estado publicado no se llama «Publicada»");
  assert(TUTORIAL_PUBLICATION_LABEL.candidate === "Sin publicar",
    "una candidata no se llama «Sin publicar»");
});

// ===========================================================================
console.log("\nD · «Usar nuevamente», no «reactivar»");
// ===========================================================================

check("D1. La acción se llama por lo que hace", () => {
  assert(/Usar nuevamente/.test(FORMS), "no existe la acción de volver a usar un vídeo");
  // Sobre el CÓDIGO, no sobre los comentarios: la cabecera de este componente
  // explica precisamente por qué no se llama «reactivar», y buscar la palabra a
  // secas convertiría esa explicación en un fallo. Es la tercera vez que este
  // repositorio tropieza con lo mismo.
  const visible = sinComentarios(FORMS);
  assert(!/Reactivar|Restaurar/i.test(visible),
    "un botón insinúa que la historia se reescribe");
});

check("D2. Y explica las tres cosas antes de hacerla", () => {
  const bloque = FORMS.slice(FORMS.indexOf("RestoreVersionForm"));
  assert(/De dónde sale/i.test(bloque), "no dice de qué versión sale");
  assert(/Qué va a pasar/i.test(bloque), "no dice qué se va a crear");
  assert(/Lo que NO pasa/i.test(bloque), "no dice qué NO cambia");
  assert(/no se toca|no se reabre/i.test(bloque),
    "no aclara que el periodo antiguo no se toca");
  assert(/sin publicar/i.test(bloque), "no dice que la versión nueva nace sin publicar");
});

// ===========================================================================
console.log("\nE · La puerta, en cada acción");
// ===========================================================================

check("E1. Todas las acciones pasan por requirePlatformStaff", () => {
  const exportadas = [...ACCIONES.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert(exportadas.length >= 8, `solo hay ${exportadas.length} acciones`);
  for (const nombre of exportadas) {
    const i = ACCIONES.indexOf(`export async function ${nombre}`);
    const fin = ACCIONES.indexOf("\nexport async function", i + 1);
    const cuerpo = ACCIONES.slice(i, fin === -1 ? undefined : fin);
    assert(/requirePlatformStaff\(\)/.test(cuerpo),
      `«${nombre}» no pasa por la puerta de plataforma`);
  }
});

check("E2. Y las que escriben exigen superadministrador", () => {
  for (const nombre of ["createTutorialAction", "reserveTutorialUploadAction",
    "finalizeTutorialUploadAction", "publishTutorialVersionAction",
    "unpublishTutorialAction", "restoreTutorialVersionAction",
    "discardCandidateAction", "saveCandidateMetadataAction"]) {
    const i = ACCIONES.indexOf(`export async function ${nombre}`);
    assert(i > 0, `falta ${nombre}`);
    const fin = ACCIONES.indexOf("\nexport async function", i + 1);
    const cuerpo = ACCIONES.slice(i, fin === -1 ? undefined : fin);
    assert(/isSuperadmin/.test(cuerpo), `«${nombre}» no comprueba superadministrador`);
  }
});

check("E3. Las de lectura NO lo exigen · soporte ve", () => {
  for (const nombre of ["listTutorialsAction", "getTutorialDetailAction",
    "previewTutorialVersionAction"]) {
    const i = ACCIONES.indexOf(`export async function ${nombre}`);
    const fin = ACCIONES.indexOf("\nexport async function", i + 1);
    const cuerpo = ACCIONES.slice(i, fin === -1 ? undefined : fin);
    assert(!/if \(!isSuperadmin\) return/.test(cuerpo),
      `«${nombre}» impide leer a soporte`);
  }
});

// ===========================================================================
console.log("\nF · El cliente administrativo, y su única excepción");
// ===========================================================================

check("F1. La administración normal NO usa cliente administrativo", () => {
  for (const [nombre, src] of [["las acciones", ACCIONES], ["la capa de datos", DB]]) {
    assert(!/createAdminClient/.test(sinComentarios(src)),
      `${nombre} usa el cliente administrativo en el camino normal`);
    assert(!/service_role|SERVICE_ROLE/.test(sinComentarios(src)),
      `${nombre} menciona service_role`);
  }
});

check("F2. La excepción está aislada, declarada y acotada", () => {
  assert(/createAdminClient/.test(LIMPIEZA),
    "el módulo de limpieza no usa el cliente administrativo");
  // Y solo lo importa la acción de descartar.
  const importadores = [ACCIONES].filter((s) => s.includes("tutorial-object-cleanup"));
  assert(importadores.length === 1, "el módulo de limpieza se usa desde más sitios");
  // Comprueba que nadie más referencie el objeto antes de tocarlo. Una versión
  // repuesta comparte objeto con la original.
  assert(/still_referenced/.test(LIMPIEZA),
    "la limpieza no comprueba si otra versión referencia el objeto");
});

check("F3. Y el navegador nunca recibe una credencial", () => {
  assert(!/SERVICE_ROLE|service_role/.test(SUBIDA),
    "el componente de subida menciona service_role");
  // Lo único que baja es un token para una ruta y un rato.
  assert(/reserva\.token/.test(SUBIDA), "el navegador no usa el token de la reserva");
  assert(!/createAdminClient/.test(SUBIDA), "el navegador usa el cliente administrativo");
});

// ===========================================================================
console.log("\nG · La consulta, acotada");
// ===========================================================================

check("G1. La lista no hace una consulta por fila", () => {
  const fn = DB.slice(DB.indexOf("export async function listTutorialsForConsole"),
    DB.indexOf("export type TutorialVersionDetail"));
  const consultas = (fn.match(/supabase\s*\n?\s*\.from\(|supabase\.from\(/g) ?? []).length;
  assert(consultas <= 2, `la lista tiene ${consultas} consultas escritas`);
  // Y ninguna dentro de un bucle.
  assert(!/for\s*\([^)]*\)\s*\{[\s\S]{0,400}?\.from\(/.test(fn),
    "hay una consulta dentro de un bucle");
});

check("G2. La historia se carga en la ficha, no en la lista", () => {
  const lista = DB.slice(DB.indexOf("listTutorialsForConsole"),
    DB.indexOf("export type TutorialVersionDetail"));
  assert(!/change_note|content_hash/.test(lista),
    "la lista arrastra datos que solo necesita la ficha");
});

check("G3. Y la vista previa se firma al pulsar, no al pintar", () => {
  // Firmar cuesta. Una ficha con cinco versiones no debe firmar cinco vídeos
  // que nadie va a abrir.
  const bloque = FORMS.slice(FORMS.indexOf("export function VersionPreview"));
  assert(/onClick=\{async/.test(bloque), "la vista previa se firma sin que nadie la pida");
  assert(!/useEffect/.test(bloque), "la vista previa se firma al montar el componente");
});

// ===========================================================================
console.log("\nH · El reproductor y el vídeo");
// ===========================================================================

check("H1. Es el <video> del navegador, sin librería", () => {
  assert(/<video\b[\s\S]{0,120}controls/.test(FORMS), "no se usa el reproductor nativo");
  const pkg = JSON.parse(leer("package.json"));
  const deps = Object.keys(pkg.dependencies ?? {});
  for (const libreria of ["video.js", "plyr", "react-player", "hls.js", "shaka-player"]) {
    assert(!deps.includes(libreria), `se instaló una librería de vídeo: ${libreria}`);
  }
});

check("H2. Y no se reproduce solo", () => {
  assert(!/autoPlay|autoplay/.test(FORMS),
    "el reproductor arranca solo: un vídeo con sonido en una oficina se cierra, no se ve");
});

check("H3. El campo de archivo tiene etiqueta y acepta solo lo que se admite", () => {
  assert(/Archivo de vídeo/.test(SUBIDA), "el campo de archivo no tiene etiqueta");
  assert(/accept="video\/mp4,video\/webm,\.mp4,\.webm"/.test(SUBIDA),
    "el campo acepta formatos que no se pueden reproducir");
  assert(/role="status"[\s\S]{0,80}aria-live/.test(SUBIDA),
    "el estado de la subida no se anuncia");
  // Y no hay interacción exclusiva de arrastrar y soltar.
  assert(!/onDrop|dragover/i.test(SUBIDA),
    "la subida depende de arrastrar y soltar");
});

// ===========================================================================
console.log("\nI · Lo que se le enseña a quien falla");
// ===========================================================================

check("I1. El error del almacenamiento no se enseña en crudo", () => {
  const traducidos = [
    ["The signed URL has expired", "caduc"],
    ["new row violates row-level security policy", "rechazó"],
    ["Payload too large", "200 MB"],
    ["invalid mime type", "MP4 o WebM"],
  ];
  for (const [crudo, esperado] of traducidos) {
    const m = tutorialUploadErrorMessage(crudo);
    assert(m.toLowerCase().includes(esperado.toLowerCase()),
      `«${crudo}» se traduce a «${m}»`);
    assert(!m.includes("row-level") && !m.includes("policy"),
      "el mensaje filtra detalles internos");
  }
});

check("I2. Y sin dato NO se dice cero", () => {
  assert(humanDuration(null) === "—", "una duración desconocida se muestra como cero");
  assert(humanDuration(0) === "—", "una duración cero se muestra como un tiempo");
  assert(humanFileSize(null) === "—", "un tamaño desconocido se muestra como cero");
  assert(humanDuration(125) === "2:05", `125 s se muestran como «${humanDuration(125)}»`);
});

check("I3. Sin vídeo, la ficha dice el mensaje congelado", () => {
  // El texto va partido en varias líneas dentro del JSX, así que se compara
  // sobre el contenido con los espacios normalizados.
  const plano = FICHA.replace(/\s+/g, " ");
  assert(plano.includes("Este tutorial está en actualización y estará disponible pronto"),
    "la ficha no dice qué lee la gente cuando no hay vídeo");
  assert(TUTORIAL_UNAVAILABLE_MESSAGE
    === "Este tutorial está en actualización y estará disponible pronto",
    "el mensaje congelado cambió");
  assert(/No es un fallo/i.test(FICHA),
    "la ficha presenta como fallo que una pantalla no tenga vídeo todavía");
});

check("I4. Los estados del archivo se nombran para quien mira", () => {
  assert(TUTORIAL_FILE_STATE_LABEL.verified === "Verificado",
    "el estado verificado no se traduce");
  assert(TUTORIAL_FILE_STATE_LABEL.reserved === "Esperando el archivo",
    "una reserva sin archivo no se explica");
  for (const v of Object.values(TUTORIAL_FILE_STATE_LABEL)) {
    assert(!/^[a-z_]+$/.test(v), `«${v}» es el valor de la columna, no una etiqueta`);
  }
});

// ===========================================================================
console.log("\nJ · Lo que este tramo NO hace");
// ===========================================================================

check("J1. Sin botón en las pantallas de producto · eso es B3", () => {
  const shell = leer("app/(app)/(shell)/layout.tsx");
  assert(!/Ver video tutorial|tutorial/i.test(sinComentarios(shell)),
    "el shell ya tiene el botón de tutorial: eso es B3");
});

check("J2. Sin ventana de bienvenida · eso es B4", () => {
  const puerta = leer("app/(app)/modules/page.tsx");
  assert(!/welcome|bienvenida/i.test(sinComentarios(puerta)),
    "la puerta ya muestra la bienvenida: eso es B4");
});

check("J3. Sin preferencias por persona · eso es B4", () => {
  const migraciones = leer("supabase/migrations/0159_platform_tutorial_media_foundation.sql");
  assert(!/user_preferences|no_volver_a_mostrar|dismissed/i.test(migraciones),
    "ya hay tabla de preferencias: eso es B4");
});

check("J4. Y nada comercial", () => {
  for (const src of [ACCIONES, DB, LISTA, FICHA, FORMS, SUBIDA]) {
    for (const rastro of ["plan_code", "access_mode", "entitlement", "precio", "pricing"]) {
      assert(!new RegExp(`\\b${rastro}\\b`, "i").test(sinComentarios(src)),
        `la consola de tutoriales toca «${rastro}»`);
    }
  }
});

// ===========================================================================
console.log("\nK · El estado, derivado y no inventado");
// ===========================================================================

check("K1. La publicación se deriva de las fechas", () => {
  assert(tutorialPublicationState({ effectiveFrom: null, effectiveTo: null }) === "candidate",
    "sin fecha de inicio no se considera candidata");
  assert(tutorialPublicationState({ effectiveFrom: "x", effectiveTo: null }) === "published",
    "con inicio y sin cierre no se considera publicada");
  assert(tutorialPublicationState({ effectiveFrom: "x", effectiveTo: "y" }) === "historical",
    "con cierre no se considera histórica");
});

check("K2. Y no hay una columna de estado de publicación que mantener", () => {
  const mig = leer("supabase/migrations/0159_platform_tutorial_media_foundation.sql");
  const tabla = mig.slice(mig.indexOf("create table public.platform_tutorial_versions"),
    mig.indexOf("-- COMO MUCHO UNA VERSIÓN VIGENTE"));
  assert(!/publication_state|publish_status/.test(tabla),
    "hay una columna de estado de publicación, que podría contradecir a las fechas");
});

console.log(`\nPE-03B2 · consola (código): ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
