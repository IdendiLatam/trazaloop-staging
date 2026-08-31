/**
 * Trazaloop · PE-03B1 · Lo que se decide sin tocar la base.
 *
 * Tres cosas: que los tres filtros de formato hagan cada uno su trabajo, que la
 * ruta no dependa nunca del nombre del archivo, y que la migración y el
 * registro de claves de PE-02 sigan diciendo lo mismo.
 *
 * Correr: npm run test:pe03b1
 */
import { readFileSync } from "node:fs";

import {
  TUTORIAL_MAX_FILE_BYTES, TUTORIAL_MIME_TYPES, TUTORIAL_PLAYBACK_TTL_SECONDS,
  TUTORIAL_SIGNATURE_PREFIX_BYTES, TUTORIAL_UNAVAILABLE_MESSAGE,
  detectTutorialSignature, isTutorialMimeType, safeTutorialFilename,
  signatureMatchesMime, tutorialObjectPath, validateTutorialFileDeclaration,
} from "../../lib/domain/tutorial-media";
import { PAGE_KEYS, isKnownPageKey } from "../../lib/modules/page-keys";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const MIGRACION = readFileSync(
  "supabase/migrations/0159_platform_tutorial_media_foundation.sql", "utf8");

/** Un MP4 mínimo: cuatro bytes de tamaño y el átomo «ftyp» en el desplazamiento 4. */
function mp4Sintetico(relleno = 64): Uint8Array {
  const b = new Uint8Array(12 + relleno);
  b.set([0x00, 0x00, 0x00, 0x18], 0);
  b.set([0x66, 0x74, 0x79, 0x70], 4);          // ftyp
  b.set([0x69, 0x73, 0x6f, 0x6d], 8);          // isom
  return b;
}
/** Un WebM mínimo: la cabecera EBML de Matroska. */
function webmSintetico(relleno = 64): Uint8Array {
  const b = new Uint8Array(4 + relleno);
  b.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  return b;
}

console.log("\nPE-03B1 · Los cimientos del tutorial, en el código\n");

// ===========================================================================
console.log("A · Los tres filtros, y por qué son tres");
// ===========================================================================

check("A1. Un vídeo normal pasa", () => {
  const r = validateTutorialFileDeclaration({
    filename: "procesos.mp4", mime: "video/mp4", sizeBytes: 12 * 1024 * 1024 });
  assert(r.ok, `se rechazó un vídeo correcto: ${!r.ok ? r.message : ""}`);
});

check("A2. Un archivo vacío no", () => {
  for (const size of [0, -1]) {
    const r = validateTutorialFileDeclaration({
      filename: "x.mp4", mime: "video/mp4", sizeBytes: size });
    assert(!r.ok, `se aceptó un archivo de ${size} bytes`);
  }
});

check("A3. Doscientos megas sí; uno más, no", () => {
  const justo = validateTutorialFileDeclaration({
    filename: "x.mp4", mime: "video/mp4", sizeBytes: TUTORIAL_MAX_FILE_BYTES });
  assert(justo.ok, "se rechazó un archivo de exactamente 200 MB");
  const pasado = validateTutorialFileDeclaration({
    filename: "x.mp4", mime: "video/mp4", sizeBytes: TUTORIAL_MAX_FILE_BYTES + 1 });
  assert(!pasado.ok, "se aceptó un archivo de más de 200 MB");
  assert(TUTORIAL_MAX_FILE_BYTES === 200 * 1024 * 1024,
    `el tope es ${TUTORIAL_MAX_FILE_BYTES} y la decisión humana fueron 200 MB`);
});

check("A4. Un formato que el navegador no reproduce, tampoco", () => {
  for (const mime of ["video/quicktime", "video/x-msvideo", "application/pdf",
    "video/ogg", "image/png"]) {
    const r = validateTutorialFileDeclaration({
      filename: "x.mp4", mime, sizeBytes: 1000 });
    assert(!r.ok, `se aceptó «${mime}»`);
  }
  assert(TUTORIAL_MIME_TYPES.length === 2, "la lista de formatos creció sin decidirlo");
  assert(isTutorialMimeType("video/mp4") && isTutorialMimeType("video/webm"),
    "se perdió uno de los dos formatos admitidos");
});

check("A5. Y la extensión tiene que corresponder al tipo", () => {
  const cruzado = validateTutorialFileDeclaration({
    filename: "video.webm", mime: "video/mp4", sizeBytes: 1000 });
  assert(!cruzado.ok, "se aceptó un .webm declarado como mp4");
  const sinExtension = validateTutorialFileDeclaration({
    filename: "video", mime: "video/mp4", sizeBytes: 1000 });
  assert(!sinExtension.ok, "se aceptó un archivo sin extensión");
});

check("A6. La firma binaria reconoce lo que es de verdad", () => {
  assert(detectTutorialSignature(mp4Sintetico()) === "mp4", "no se reconoció un MP4");
  assert(detectTutorialSignature(webmSintetico()) === "webm", "no se reconoció un WebM");
  for (const impostor of [
    new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),                 // %PDF-
    new Uint8Array([0x89, 0x50, 0x4e, 0x47]),                       // PNG
    new Uint8Array([0x50, 0x4b, 0x03, 0x04]),                       // ZIP
    new Uint8Array(0),
    new Uint8Array([0x00]),
  ]) {
    assert(detectTutorialSignature(impostor) === "unknown",
      "se reconoció como vídeo algo que no lo es");
  }
});

check("A7. Y el archivo que MIENTE en su nombre y su tipo se cae aquí", () => {
  // Extensión .mp4, tipo declarado video/mp4, y bytes de PDF. Los dos primeros
  // filtros lo dejan pasar: solo el tercero lo detiene.
  const declarado = validateTutorialFileDeclaration({
    filename: "tutorial.mp4", mime: "video/mp4", sizeBytes: 5000 });
  assert(declarado.ok, "el archivo mentiroso no llegó al tercer filtro");
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  assert(!signatureMatchesMime(detectTutorialSignature(pdf), "video/mp4"),
    "un PDF renombrado a .mp4 pasaría la comprobación de firma");
});

check("A8. La firma se decide con un prefijo, no con el archivo entero", () => {
  // Leer 200 MB en memoria para mirar doce bytes convertiría cada subida en un
  // pico de memoria del servidor.
  assert(TUTORIAL_SIGNATURE_PREFIX_BYTES <= 65536,
    `el prefijo son ${TUTORIAL_SIGNATURE_PREFIX_BYTES} bytes y eso ya no es un prefijo`);
  const grande = mp4Sintetico(TUTORIAL_SIGNATURE_PREFIX_BYTES);
  assert(detectTutorialSignature(grande.slice(0, TUTORIAL_SIGNATURE_PREFIX_BYTES)) === "mp4",
    "el prefijo no basta para reconocer un MP4");
});

// ===========================================================================
console.log("\nB · La ruta no la decide quien sube");
// ===========================================================================

check("B1. El nombre se limpia, y nunca escapa de su carpeta", () => {
  for (const peligroso of ["../../../etc/passwd", "..\\..\\x", "a/b/c.mp4",
    "  espacios y ñ.mp4", "<script>.mp4", "%2e%2e%2f.mp4"]) {
    const seguro = safeTutorialFilename(peligroso, "video/mp4");
    assert(!seguro.includes("/"), `«${seguro}» conserva una barra`);
    assert(!seguro.includes("\\"), `«${seguro}» conserva una contrabarra`);
    assert(!seguro.includes(".."), `«${seguro}» conserva un salto de carpeta`);
    assert(/^[a-z0-9._-]+$/.test(seguro), `«${seguro}» tiene caracteres inesperados`);
  }
});

check("B2. Y siempre acaba con la extensión de su tipo", () => {
  assert(safeTutorialFilename("cosa", "video/mp4").endsWith(".mp4"), "falta .mp4");
  assert(safeTutorialFilename("cosa", "video/webm").endsWith(".webm"), "falta .webm");
  assert(safeTutorialFilename("", "video/mp4") === "video.mp4",
    "un nombre vacío no produce un nombre utilizable");
});

check("B3. La ruta lleva el tutorial y la versión, en ese orden", () => {
  const ruta = tutorialObjectPath("11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222", "video.mp4");
  const partes = ruta.split("/");
  assert(partes.length === 3, `la ruta tiene ${partes.length} segmentos y son 3`);
  assert(partes[0] === "11111111-1111-1111-1111-111111111111", "el primero no es el tutorial");
  assert(partes[1] === "22222222-2222-2222-2222-222222222222", "el segundo no es la versión");
  // Y es lo que hace imposible sobrescribir: dos versiones no comparten ruta.
  const otra = tutorialObjectPath("11111111-1111-1111-1111-111111111111",
    "33333333-3333-3333-3333-333333333333", "video.mp4");
  assert(ruta !== otra, "dos versiones del mismo tutorial comparten ruta");
});

check("B4. La base limpia el nombre igual que el código", () => {
  // Si las dos limpiezas divergieran, la ruta que reserva la base y la que el
  // navegador cree que va a escribir dejarían de coincidir.
  assert(/regexp_replace\(coalesce\(btrim\(p_filename\)/.test(MIGRACION),
    "la reserva de la base ya no limpia el nombre del archivo");
  assert(MIGRACION.includes("[^a-zA-Z0-9._-]+"),
    "la base ya no usa la misma lista de caracteres admitidos");
  assert(MIGRACION.includes("left(v_seguro, 80)"),
    "la base ya no recorta el nombre a 80 caracteres");
});

// ===========================================================================
console.log("\nC · El registro de claves de PE-02, sin una segunda familia");
// ===========================================================================

check("C1. La migración usa el MISMO patrón de clave que el código", () => {
  const patronCodigo = "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$";
  assert(MIGRACION.includes(patronCodigo.replace(/\\\\/g, "\\")) ||
    MIGRACION.includes("^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$"),
    "la migración comprueba la forma de la clave con otro patrón");
});

check("C2. Y no se creó un registro de claves para tutoriales", () => {
  for (const sospechoso of ["tutorial_page_keys", "tutorial_pages",
    "create table public.page_keys"]) {
    assert(!MIGRACION.includes(sospechoso),
      `la migración crea una segunda familia de claves: ${sospechoso}`);
  }
  assert(MIGRACION.includes("lib/modules/page-keys.ts"),
    "la migración no dice dónde está el registro canónico");
});

check("C3. La migración dice EN VOZ ALTA lo que el CHECK no puede saber", () => {
  // Una prueba que afirmara que la base valida la clave contra el registro
  // sería falsa. La migración lo advierte para que nadie lo lea de más.
  assert(/no puede saber si\s*\n?-- esa clave existe en el registro/.test(MIGRACION)
    || MIGRACION.includes("no puede saber si"),
    "la migración no advierte del límite del CHECK de page_key");
});

check("C4. Y las claves del registro siguen bien formadas", () => {
  assert(PAGE_KEYS.length >= 10, `el registro tiene ${PAGE_KEYS.length} claves`);
  for (const e of PAGE_KEYS) {
    assert(isKnownPageKey(e.key), `«${e.key}» no se reconoce a sí misma`);
    assert(e.key.split(".")[0] === e.module,
      `«${e.key}» no empieza por su módulo «${e.module}»`);
  }
});

// ===========================================================================
console.log("\nD · Lo que la migración promete");
// ===========================================================================

check("D1. Sin organization_id, y por eso fuera de toda cuota", () => {
  // Se miran las DEFINICIONES de columna, no el texto: los comentarios de la
  // migración explican precisamente que no lo tiene, y buscar la palabra a
  // secas convertiría esa explicación en un fallo.
  const tablas = MIGRACION.slice(MIGRACION.indexOf("create table public.platform_tutorials"),
    MIGRACION.indexOf("-- 3 · LA INMUTABILIDAD"));
  const columnas = tablas.split("\n")
    .filter((l) => !l.trim().startsWith("--") && !l.trim().startsWith("'"));
  assert(!columnas.some((l) => /^\s+organization_id\s/.test(l)),
    "una tabla de tutoriales tiene organization_id: contaría contra la cuota de alguien");
  assert(!/references public\.organizations/.test(tablas),
    "una tabla de tutoriales apunta a organizations");
});

check("D2. El cubo es privado, y con sus dos topes declarados", () => {
  assert(/insert into storage\.buckets[\s\S]{0,200}'tutorial-media'[\s\S]{0,120}false/
    .test(MIGRACION), "el cubo de tutoriales no se crea privado");
  assert(MIGRACION.includes("200 * 1024 * 1024,\n        array['video/mp4', 'video/webm']")
    || /file_size_limit[\s\S]{0,200}200 \* 1024 \* 1024/.test(MIGRACION),
    "el cubo no declara el tope de tamaño");
  assert(MIGRACION.includes("on conflict (id) do nothing"),
    "la creación del cubo no es idempotente: un replay la rompería");
});

check("D3. Sin política de UPDATE ni de DELETE sobre el cubo", () => {
  const politicas = MIGRACION.split("create policy").slice(1)
    .filter((p) => p.includes("tutorial_media"));
  assert(politicas.length >= 2, "faltan políticas del cubo");
  for (const p of politicas) {
    assert(!/for update/i.test(p.split("\n").slice(0, 3).join(" ")),
      "hay una política de UPDATE sobre el cubo: permitiría sobrescribir un vídeo");
    assert(!/for delete/i.test(p.split("\n").slice(0, 3).join(" ")),
      "hay una política de DELETE de cliente sobre el cubo");
  }
});

check("D4. Y la migración NO dice que la política de Storage sea la barrera", () => {
  // PE-03A comprobó que una URL firmada no pasa por la política INSERT. Escribir
  // lo contrario daría tranquilidad donde no la hay.
  assert(/autoriza por sí misma|AUTORIZA POR SÍ MISMA/i.test(MIGRACION),
    "la migración no recoge el hallazgo de que una URL firmada autoriza sola");
  assert(/no protege la URL DESPUÉS de firmarla|no es lo que impide/i.test(MIGRACION),
    "la migración no dice dónde está de verdad la frontera de autorización");
});

check("D5. La bienvenida existe, es única, y no tiene clave de pantalla", () => {
  assert(MIGRACION.includes("platform_tutorials_welcome_uniq"),
    "nada impide que haya dos vídeos de bienvenida");
  assert(/tutorial_type = 'welcome' and page_key is null/.test(MIGRACION),
    "la bienvenida podría colgar de una clave de pantalla inventada");
  assert(/values \('welcome', null, null, 'Bienvenida a Trazaloop'\)/.test(MIGRACION),
    "no se crea la identidad de la bienvenida");
});

check("D6. El plazo de reproducción es el medido, no uno inventado", () => {
  assert(TUTORIAL_PLAYBACK_TTL_SECONDS === 2 * 60 * 60,
    `el plazo son ${TUTORIAL_PLAYBACK_TTL_SECONDS} s y PE-03A recomendó 2 horas`);
});

check("D7. El mensaje de «sin tutorial» es el congelado", () => {
  assert(TUTORIAL_UNAVAILABLE_MESSAGE
    === "Este tutorial está en actualización y estará disponible pronto",
    `el mensaje es «${TUTORIAL_UNAVAILABLE_MESSAGE}»`);
});

check("D8. Y no se reintrodujo el límite de cuerpo de las Server Actions", () => {
  // Los bytes de un vídeo no pueden atravesar Next.js. T9E.1 lo cerró y esto
  // vigila que PE-03 no lo reabra por comodidad.
  const config = readFileSync("next.config.ts", "utf8");
  assert(!/bodySizeLimit\s*:/.test(config.replace(/\/\*[\s\S]*?\*\//g, "")),
    "next.config.ts vuelve a fijar bodySizeLimit: los vídeos pasarían por Vercel");
});

console.log(`\nPE-03B1 · cimientos: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
