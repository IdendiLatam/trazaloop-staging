/**
 * Trazaloop · PE-03B3 · Lo que se decide sin base ni navegador.
 *
 * Tres cosas: que el tope de 200 MB no vuelva por ninguna puerta, que una ruta
 * se resuelva a la clave correcta y no a la de una pantalla vecina, y que el
 * botón viva donde tiene que vivir.
 *
 * Correr: npm run test:pe03b3
 */
import { readFileSync, readdirSync } from "node:fs";

import {
  PAGE_KEYS, resolvePageKeyForPath, isKnownPageKey,
} from "../../lib/modules/page-keys";
import {
  validateTutorialFileDeclaration, TUTORIAL_UNAVAILABLE_MESSAGE,
  TUTORIAL_INFRASTRUCTURE_NOTE, TUTORIAL_PLAYBACK_TTL_SECONDS,
  TUTORIAL_UPLOAD_HORIZON_SECONDS, TUTORIAL_HASH_CHUNK_BYTES,
} from "../../lib/domain/tutorial-media";

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

const ACCION = leer("components/domain/tutorials/page-tutorial-action.tsx");
const SHELL = leer("app/(app)/(shell)/layout.tsx");
const PUERTA = leer("app/(app)/modules/page.tsx");
const SUBIDA = leer("components/domain/tutorials/tutorial-upload.tsx");
const INTEGRIDAD = leer("lib/db/tutorial-integrity.ts");
const REANUDABLE = leer("lib/storage/resumable-upload.ts");
const ACCIONES = leer("server/actions/tutorials.ts");
const LECTOR = leer("lib/db/tutorials.ts");

console.log("\nPE-03B3 · El tutorial de la pantalla, en el código\n");

// ===========================================================================
console.log("A · El tope de 200 MB no vuelve por ninguna puerta");
// ===========================================================================

check("A1. Ningún archivo se rechaza por grande", () => {
  for (const grande of [200 * 1024 * 1024, 200 * 1024 * 1024 + 1,
    1024 * 1024 * 1024, 30 * 1024 * 1024 * 1024]) {
    const r = validateTutorialFileDeclaration({
      filename: "x.mp4", mime: "video/mp4", sizeBytes: grande });
    assert(r.ok, `se rechazó un archivo de ${Math.round(grande / 1048576)} MB`);
  }
  // Vacío sigue sin ser un vídeo.
  assert(!validateTutorialFileDeclaration({
    filename: "x.mp4", mime: "video/mp4", sizeBytes: 0 }).ok,
    "se aceptó un archivo vacío");
});

check("A2. No queda ningún tope de aplicación en el código vivo", () => {
  // Se recorren los ficheros de producto. No los documentos ni las pruebas:
  // ahí el número aparece contando su historia, y borrarlo sería reescribirla.
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`)
      : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
  const vivos = [...walk("lib"), ...walk("components"), ...walk("server"), ...walk("app")]
    .filter((f) => /tutorial|Tutorial/.test(f) || /tutorial/i.test(leer(f)));

  for (const f of vivos) {
    const codigo = sinComentarios(leer(f));
    // Cualquier comparación de tamaño contra una constante grande.
    const topes = [...codigo.matchAll(/(\d+)\s*\*\s*1024\s*\*\s*1024/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n >= 50);
    assert(topes.length === 0,
      `${f} compara contra un tope de ${topes.join(", ")} MB`);
    assert(!/209715200|524288000|1073741824/.test(codigo),
      `${f} tiene un tope de tamaño escrito en bytes`);
    assert(!/MAX_FILE_BYTES|maxFileSize|maxSizeBytes/i.test(codigo),
      `${f} declara un tamaño máximo`);
  }
});

check("A3. Ni la migración 0160 lo sustituye por otro número", () => {
  const m = leer("supabase/migrations/0160_platform_tutorial_unbounded_media.sql");
  const codigo = m.replace(/^\s*--.*$/gm, "");
  assert(/check \(declared_size_bytes > 0\)/.test(codigo), "el CHECK conserva un techo");
  assert(!/declared_size_bytes <=|real_size_bytes <=/.test(codigo),
    "queda una comparación de tamaño con un techo");
  assert(/file_size_limit = null/.test(codigo), "el cubo conserva un tope propio");
});

check("A4. Y la copia no promete «ilimitado», que sería falso", () => {
  assert(!/ilimitad/i.test(SUBIDA), "la consola promete tamaño ilimitado");
  assert(TUTORIAL_INFRASTRUCTURE_NOTE.includes("No hay un límite de tamaño definido por Trazaloop"),
    "no se distingue el límite del producto del de la infraestructura");
  assert(/capacidad técnica del servicio/.test(TUTORIAL_INFRASTRUCTURE_NOTE),
    "no se dice de quién es el límite que sí existe");
  assert(SUBIDA.includes("TUTORIAL_INFRASTRUCTURE_NOTE"),
    "la consola no explica de dónde viene el límite que queda");
});

check("A5. Y no hay ninguna validación de duración", () => {
  for (const f of ["lib/domain/tutorial-media.ts", "lib/domain/tutorial-admin.ts",
    "lib/db/tutorials-platform.ts", "server/actions/tutorials-admin.ts",
    "components/domain/tutorials/tutorial-upload.tsx"]) {
    const codigo = sinComentarios(leer(f));
    assert(!/maxDuration|MAX_DURATION|duration\s*[<>]/i.test(codigo),
      `${f} valida la duración de un vídeo`);
  }
});

// ===========================================================================
console.log("\nB · La memoria no crece con el vídeo");
// ===========================================================================

check("B1. La verificación lee en flujo, no en un búfer", () => {
  const codigo = sinComentarios(INTEGRIDAD);
  assert(/createHash\("sha256"\)/.test(codigo), "no se usa un resumen incremental");
  assert(/getReader\(\)/.test(codigo), "no se lee en flujo");
  // Y NO se carga el archivo entero. Esta es la comprobación del tramo.
  assert(!/arrayBuffer\(\)/.test(codigo),
    "la verificación llama a arrayBuffer(): carga el vídeo entero en memoria");
  assert(!/\.download\(/.test(codigo),
    "usa .download(), que devuelve un Blob ya materializado en memoria");
});

check("B2. Y quien la llama tampoco carga el archivo", () => {
  const plataforma = sinComentarios(leer("lib/db/tutorials-platform.ts"));
  const finalizar = plataforma.slice(
    plataforma.indexOf("export async function finalizeTutorialUpload"),
    plataforma.indexOf("async function marcarFallida"));
  assert(!/arrayBuffer|\.download\(/.test(finalizar),
    "la finalización sigue cargando el archivo entero");
  assert(/verifyTutorialObject/.test(finalizar),
    "la finalización no usa la verificación en flujo");
});

check("B3. El pico está acotado por el trozo, y el trozo es pequeño", () => {
  assert(TUTORIAL_HASH_CHUNK_BYTES <= 1024 * 1024,
    `el trozo de lectura son ${TUTORIAL_HASH_CHUNK_BYTES} bytes`);
  // El de subida se lee del propio módulo: importarlo aquí arrastraría código
  // de cliente a una prueba pura.
  const trozoSubida = Number(
    /RESUMABLE_CHUNK_BYTES = (\d+) \* 1024 \* 1024/.exec(REANUDABLE)?.[1] ?? "0");
  assert(trozoSubida > 0 && trozoSubida <= 16,
    `el trozo de subida son ${trozoSubida} MB`);
});

check("B4. El navegador tampoco lee el vídeo entero", () => {
  const codigo = sinComentarios(REANUDABLE);
  assert(/file\.slice\(/.test(codigo), "no se trocea el archivo");
  assert(!/await input\.file\.arrayBuffer|readAsArrayBuffer/.test(codigo),
    "el navegador materializa el vídeo entero");
});

// ===========================================================================
console.log("\nC · El transporte reanudable, y su frontera");
// ===========================================================================

check("C1. Se usa el extremo reanudable, no una sola petición", () => {
  assert(/upload\/resumable/.test(REANUDABLE), "no se usa el extremo reanudable");
  assert(/Tus-Resumable/.test(REANUDABLE), "no se declara el protocolo");
  assert(/method: "PATCH"/.test(REANUDABLE), "no se envían trozos");
  assert(!/uploadToSignedUrl/.test(sinComentarios(SUBIDA)),
    "la consola sigue subiendo con una sola petición firmada");
});

check("C2. El desplazamiento lo dice el SERVIDOR, no la cuenta local", () => {
  // Es el mismo principio que arregló la sonda de QA: la verdad la tiene el
  // servidor, no el flujo.
  assert(/method: "HEAD"/.test(REANUDABLE),
    "no se le pregunta al servidor por dónde iba");
  assert(/upload-offset/.test(REANUDABLE), "no se lee el desplazamiento del servidor");
  const codigo = sinComentarios(REANUDABLE);
  assert(/respuesta\.headers\.get\("upload-offset"\)/.test(codigo),
    "el desplazamiento no se toma de la respuesta");
});

check("C3. Se autentica con la sesión, no con una credencial de servicio", () => {
  const codigo = sinComentarios(REANUDABLE) + sinComentarios(SUBIDA);
  assert(!/service_role|SERVICE_ROLE|createAdminClient/.test(codigo),
    "el navegador maneja una credencial de servicio");
  assert(/accessToken/.test(REANUDABLE), "no se usa el testigo de la sesión");
  assert(/getSession\(\)/.test(SUBIDA), "la consola no toma la sesión de la persona");
});

check("C4. Y la reserva sigue siendo la frontera", () => {
  const acciones = sinComentarios(leer("server/actions/tutorials-admin.ts"));
  const reservar = acciones.slice(acciones.indexOf("reserveTutorialUploadAction"));
  assert(/isSuperadmin/.test(reservar.slice(0, 600)),
    "reservar dejó de exigir superadministrador");
  // El navegador no propone la ruta: la recibe.
  assert(/reserva\.objectPath/.test(SUBIDA), "el navegador no usa la ruta reservada");
  assert(!/objectPath:\s*`/.test(sinComentarios(SUBIDA)),
    "el navegador construye la ruta por su cuenta");
});

check("C5. Y la caducidad de la reserva ya no es un plazo de subida", () => {
  assert(TUTORIAL_UPLOAD_HORIZON_SECONDS >= 3600,
    `el horizonte son ${TUTORIAL_UPLOAD_HORIZON_SECONDS} s: sigue pareciendo un plazo de subida`);
  const m = leer("supabase/migrations/0160_platform_tutorial_unbounded_media.sql");
  const fn = m.slice(m.indexOf("function public.tutorial_media_has_reservation"));
  assert(!/upload_expires_at/.test(fn.slice(0, fn.indexOf("$$;"))),
    "la política de escritura sigue mirando el reloj");
});

// ===========================================================================
console.log("\nD · De una ruta a su clave, sin confundir pantallas");
// ===========================================================================

check("D1. Cada pantalla registrada se resuelve a SU clave", () => {
  for (const e of PAGE_KEYS) {
    const concreta = e.route.replace(/\[[^\]]+\]/g, "abc123");
    const resuelta = resolvePageKeyForPath(concreta);
    assert(resuelta === e.key,
      `«${concreta}» se resolvió a «${resuelta}» y debía ser «${e.key}»`);
  }
});

check("D2. Un listado y su ficha NO comparten tutorial", () => {
  // Es la confusión que una comparación por prefijo produciría: la ficha de un
  // proceso recibiría el vídeo del listado, que es un vídeo de otra pantalla.
  assert(resolvePageKeyForPath("/quality/processes") === "quality.processes",
    "el listado no se resuelve");
  assert(resolvePageKeyForPath("/quality/processes/abc") === "quality.processes.detail",
    "la ficha recibe el tutorial del listado");
});

check("D3. Una pantalla sin clave no admite tutorial · y eso no es un fallo", () => {
  for (const ruta of ["/login", "/register", "/legal/accept", "/faq", "/privacy",
    "/terms", "/platform/tutorials", "/quality", "/team", "/settings/company",
    "/no/existe"]) {
    assert(resolvePageKeyForPath(ruta) === null,
      `«${ruta}» resolvió a «${resolvePageKeyForPath(ruta)}» y no debería tener tutorial`);
  }
});

check("D4. Los módulos no se contagian entre sí", () => {
  const quality = resolvePageKeyForPath("/quality/risks");
  assert(quality?.startsWith("quality."), `«/quality/risks» → ${quality}`);
  const cpr = resolvePageKeyForPath("/recycled-content");
  assert(cpr?.startsWith("cpr."), `«/recycled-content» → ${cpr}`);
  const textiles = resolvePageKeyForPath("/textiles/passports");
  assert(textiles?.startsWith("textiles."), `«/textiles/passports» → ${textiles}`);
  // Y ninguna ruta de un módulo cae en la clave de otro.
  for (const e of PAGE_KEYS) {
    const concreta = e.route.replace(/\[[^\]]+\]/g, "x");
    const k = resolvePageKeyForPath(concreta);
    assert(k?.split(".")[0] === e.module,
      `«${concreta}» cayó en el módulo ${k?.split(".")[0]} en vez de ${e.module}`);
  }
});

check("D5. Y no se creó una segunda familia de claves", () => {
  const codigo = sinComentarios(ACCION) + sinComentarios(ACCIONES);
  assert(/resolvePageKeyForPath/.test(codigo), "no se usa el registro de PE-02");
  assert(!/tutorialKey|videoKey|TUTORIAL_PAGES/.test(codigo),
    "hay una segunda familia de claves para tutoriales");
  for (const e of PAGE_KEYS) assert(isKnownPageKey(e.key), `«${e.key}» no se reconoce`);
});

// ===========================================================================
console.log("\nE · El botón, donde tiene que estar");
// ===========================================================================

check("E1. En la barra del shell, no en 147 cabeceras", () => {
  assert(/<PageTutorialAction \/>/.test(SHELL), "el shell no tiene el botón");
  // Y no se repitió por las páginas.
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`)
      : e.name === "page.tsx" ? [`${dir}/${e.name}`] : []);
  const conBoton = walk("app").filter((f) => /PageTutorialAction/.test(leer(f)));
  assert(conBoton.length <= 1,
    `el botón se repitió en ${conBoton.length} páginas: ${conBoton.join(", ")}`);
  // La única admitida es la puerta, que está fuera del shell.
  if (conBoton.length === 1) {
    assert(conBoton[0].includes("modules"),
      `el botón se puso a mano en ${conBoton[0]}`);
  }
});

check("E2. Se llama «Ver video tutorial»", () => {
  assert(/>\s*Ver video tutorial\s*</.test(ACCION),
    "el botón no se llama como la decisión congelada");
});

check("E3. En una pantalla sin clave el botón NO se pinta", () => {
  assert(/if \(!pageKey\) return null;/.test(ACCION),
    "el botón aparece en pantallas que no admiten tutorial");
});

check("E4. Y no se firma nada al pintar la pantalla", () => {
  // Sin la cabecera de imports: `getTutorialForPageAction` se importa arriba y
  // buscarla a secas convertiría el propio import en un fallo.
  const codigo = sinComentarios(ACCION);
  const cuerpo = codigo.slice(codigo.indexOf("export function PageTutorialAction"));
  const antesDelDialogo = cuerpo.slice(0, cuerpo.indexOf("function TutorialDialog"));
  assert(!/getTutorialForPageAction\(/.test(antesDelDialogo),
    "se pregunta por el vídeo al pintar la pantalla");
  assert(/setAbiertoEn\(pathname\)/.test(antesDelDialogo), "el botón no abre nada");
});

check("E5. Cambiar de pantalla cierra el diálogo", () => {
  // Se DERIVA de la ruta en vez de apagarse con un efecto: se guarda en qué
  // pantalla se abrió y se compara al pintar. Un efecto que cambia estado por
  // esto es un renderizado en cascada, y React avisa con razón.
  assert(/const abierto = abiertoEn === pathname/.test(ACCION),
    "el cierre al navegar no se deriva de la ruta");
  assert(/setAbiertoEn\(pathname\)/.test(ACCION), "abrir no recuerda en qué pantalla");
  assert(!/useEffect\([^)]*setAbierto\b/.test(ACCION),
    "se apaga el diálogo desde un efecto");
});

check("E6. Y «Ayuda» sigue donde estaba, sin convertirse en un menú", () => {
  assert(/href="\/faq"/.test(SHELL), "se perdió la entrada de Ayuda");
  assert(!/dropdown|Menu|<details/i.test(
    SHELL.slice(SHELL.indexOf("PageTutorialAction"), SHELL.indexOf("ModuleSwitcher"))),
    "Ayuda y el tutorial se metieron en un desplegable");
});

// ===========================================================================
console.log("\nF · Lo que se muestra, y lo que no");
// ===========================================================================

check("F1. Sin vídeo se dice la copia congelada, y no se pinta reproductor", () => {
  assert(ACCION.includes("TUTORIAL_UNAVAILABLE_MESSAGE"),
    "el diálogo no usa el mensaje congelado");
  assert(TUTORIAL_UNAVAILABLE_MESSAGE
    === "Este tutorial está en actualización y estará disponible pronto",
    "el mensaje congelado cambió");
  // El <video> solo existe en la rama «ready».
  const ready = ACCION.slice(ACCION.indexOf('estado.status === "unavailable"'));
  assert(/<video/.test(ready), "no hay reproductor en la rama con vídeo");
  const sinVideo = ACCION.slice(ACCION.indexOf('estado.status === "no_video"'),
    ACCION.indexOf('estado.status === "unavailable"'));
  assert(!/<video/.test(sinVideo), "se pinta un reproductor cuando no hay vídeo");
});

check("F2. Una avería NO se presenta como ausencia de tutorial", () => {
  // La regla de siempre: sin dato no es cero.
  assert(/status: "unavailable"/.test(ACCIONES), "no se distingue la avería");
  assert(/status: "no_video"/.test(ACCIONES), "no se distingue la ausencia");
  const acc = sinComentarios(ACCIONES);
  assert(!/unavailable[\s\S]{0,80}TUTORIAL_UNAVAILABLE_MESSAGE/.test(acc),
    "una avería se cuenta como que no hay tutorial");
});

check("F3. No se enseña ningún dato interno", () => {
  const codigo = sinComentarios(ACCION) + sinComentarios(ACCIONES);
  for (const interno of ["versionId", "objectPath", "contentHash", "sha256",
    "uploadedBy", "publishedBy", "storage_path", "expiresAt"]) {
    assert(!new RegExp(`${interno}\\s*[},)]`).test(codigo),
      `la pantalla del cliente maneja «${interno}»`);
  }
  // Y lo que sí se muestra son dos cosas.
  assert(/estado\.title/.test(ACCION) && /estado\.description/.test(ACCION),
    "no se muestran el título y la descripción");
});

check("F4. Sin reproducción automática, y con teclado", () => {
  assert(!/autoPlay|autoplay/.test(ACCION), "el vídeo arranca solo");
  assert(/<video\b[\s\S]{0,140}controls/.test(ACCION), "no se usa el reproductor nativo");
  assert(/e\.key === "Escape"/.test(ACCION), "Escape no cierra");
  assert(/role="dialog"/.test(ACCION) && /aria-modal="true"/.test(ACCION),
    "el diálogo no se anuncia como tal");
  assert(/devolverFoco/.test(ACCION), "el foco no vuelve al cerrar");
});

// ===========================================================================
console.log("\nG · Renovar no es alargar");
// ===========================================================================

check("G1. Hay renovación, y conserva el segundo en el que iba", () => {
  assert(/renewTutorialPlaybackAction/.test(ACCION), "no se renueva la autorización");
  assert(/currentTime/.test(ACCION), "la renovación no conserva la posición");
  assert(/el\.currentTime = segundo/.test(ACCION),
    "no se vuelve al segundo en el que estaba");
  assert(/reproduciendo/.test(ACCION), "no se conserva si estaba reproduciendo");
  assert(/loadedmetadata/.test(ACCION),
    "se vuelve al segundo antes de que el navegador sepa la duración: lo ignoraría");
});

check("G2. Y el plazo NO se subió a un número enorme", () => {
  // Subir el plazo a un día sería dejar el enlace vivo un día para no tener que
  // escribir la renovación.
  assert(TUTORIAL_PLAYBACK_TTL_SECONDS === 2 * 60 * 60,
    `el plazo son ${TUTORIAL_PLAYBACK_TTL_SECONDS} s y se congeló en 2 horas`);
  assert(TUTORIAL_PLAYBACK_TTL_SECONDS < 6 * 60 * 60,
    "el plazo dejó de ser de seguridad para ser una comodidad");
});

check("G3. Se renueva ANTES de vencer, no al fallar", () => {
  assert(/expiresInSeconds \* 0\.1|margen/.test(ACCION),
    "la renovación espera al vencimiento");
  assert(/setTimeout/.test(ACCION), "no se programa la renovación");
});

check("G4. Y la renovación firma la MISMA versión vigente", () => {
  const acc = sinComentarios(ACCIONES);
  const renovar = acc.slice(acc.indexOf("renewTutorialPlaybackAction"));
  assert(/signTutorialPlayback/.test(renovar), "la renovación no usa la vía canónica");
  assert(!/versionId/.test(renovar),
    "la renovación acepta un identificador de versión: sería una llave");
});

// ===========================================================================
console.log("\nH · Ni un plan por el camino");
// ===========================================================================

check("H1. Ver un tutorial no consulta ningún plan", () => {
  for (const [nombre, src] of [["el lector", LECTOR], ["las acciones", ACCIONES],
    ["el botón", ACCION]]) {
    const codigo = sinComentarios(src);
    // Sin las clases de estilo: `w-full` y `max-w-full` contienen «full», y
    // buscarlo a secas convierte una clase de Tailwind en una consulta de plan.
    const sinClases = codigo.replace(/className="[^"]*"/g, "");
    for (const rastro of ["access_mode", "plan_code", "entitlement",
      "module_access", "demo", "full", "extra"]) {
      assert(!new RegExp(`\\b${rastro}\\b`, "i").test(sinClases),
        `${nombre} consulta «${rastro}»`);
    }
  }
});

check("H2. Solo la versión VIGENTE sale por esta vía", () => {
  const codigo = sinComentarios(LECTOR);
  assert(/v_tutorial_current/.test(codigo), "no se lee de la vista de lo vigente");
  assert(!/effective_to|candidate|historical/.test(codigo),
    "el lector del producto sabe de candidatas o históricas");
  const acc = sinComentarios(ACCIONES);
  assert(!/signTutorialPreview/.test(acc),
    "la vía del producto puede firmar una vista previa de plataforma");
});

console.log(`\nPE-03B3 · tutorial de pantalla: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
