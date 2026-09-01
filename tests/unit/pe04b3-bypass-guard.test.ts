/**
 * Trazaloop · PE-04B3 · Guardia de puertas laterales de almacenamiento.
 *
 * Misma idea que el guardia de cobertura de tutoriales de PE-03: no comprueba
 * que el código de hoy esté bien —eso lo hacen las otras suites—, sino que
 * MAÑANA nadie pueda añadir una escritura a un bucket de cliente sin pasar por
 * la reserva. Cada camino de escritura tiene que estar aquí declarado y decir
 * por dónde reserva. Si aparece uno nuevo, esta prueba se pone roja y hay que
 * decidir a conciencia, no por descuido.
 *
 * El caso que lo motiva es real: `uploadFileDocumentFile` subía a
 * `trazadocs-documents` sin intent y sin reserva, no la llamaba nadie, y llevaba
 * sprints ahí esperando a que alguien la usara.
 *
 * Correr: npm run test:pe04b3-bypass
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const RAICES = ["lib", "server", "app", "components"];

/** Buckets cuyos bytes se le cobran a la EMPRESA. */
const BUCKETS_DE_CLIENTE = ["evidences", "trazadocs-documents", "organization-assets"] as const;
/** Buckets de la PLATAFORMA: contenido del producto, fuera de la cuota. */
const BUCKETS_DE_PLATAFORMA = ["tutorial-media"] as const;

/** Toda escritura de bytes a Storage que el repositorio tiene permitida. */
const CAMINOS_PERMITIDOS: {
  archivo: string; bucket: string; reserva: string;
}[] = [
  {
    archivo: "lib/storage/direct-upload.ts",
    bucket: "(el que reservó el intent)",
    reserva:
      "begin_cpr_storage_upload · la ruta la decide la base y la política INSERT de Storage exige un intent propio y vigente",
  },
  {
    archivo: "lib/db/settings.ts",
    bucket: "organization-assets",
    reserva:
      "organization_storage_guard_logo · mismo lock por empresa y misma contabilidad que los módulos (PE-04B3)",
  },
  {
    archivo: "lib/db/textiles-evidences.ts",
    bucket: "evidences",
    reserva: "begin_textile_evidence_upload_v2 · intent con bytes reservados antes de emitir la URL firmada",
  },
  {
    archivo: "lib/db/tutorials-platform.ts",
    bucket: "tutorial-media",
    reserva: "NO APLICA · bucket de plataforma, no se le cobra a ninguna empresa",
  },
  {
    archivo: "lib/storage/resumable-upload.ts",
    bucket: "tutorial-media",
    reserva: "NO APLICA · bucket de plataforma (TUS de tutoriales)",
  },
];

// Se persiguen las cuatro maneras de escribir bytes que existen en el
// repositorio: el cliente de storage-js, la URL firmada, TUS por
// `storage/v1/upload/resumable` y cualquier POST/PUT directo a `storage/v1/object`.
// Un `fetch` a mano al endpoint de Storage cuenta igual que una llamada al SDK.
const ESCRITURA =
  /\.upload\s*\(|createSignedUploadUrl|uploadToSignedUrl|createResumableUpload|storage\/v1\/upload\/resumable|storage\/v1\/object/;

function archivos(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) archivos(ruta, salida);
    else if (/\.tsx?$/.test(entrada)) salida.push(ruta);
  }
  return salida;
}

/** Quita comentarios de línea y de bloque: una MENCIÓN en un comentario no es
 *  una escritura, y confundirlas es cómo un guardia se vuelve ruido. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\*\s.*$/gm, "");
}

console.log("\nPE-04B3 · Guardia de puertas laterales\n");

const todos = RAICES.flatMap((r) => archivos(r));
const permitidos = new Set(CAMINOS_PERMITIDOS.map((c) => c.archivo));

check("1. Ninguna escritura a Storage fuera de los caminos declarados", () => {
  const intrusos: string[] = [];
  for (const ruta of todos) {
    if (permitidos.has(ruta)) continue;
    const src = sinComentarios(readFileSync(ruta, "utf8"));
    if (ESCRITURA.test(src)) {
      const linea = src.split("\n").findIndex((l) => ESCRITURA.test(l)) + 1;
      intrusos.push(`${ruta}:${linea}`);
    }
  }
  assert(
    intrusos.length === 0,
    `escriben bytes a Storage sin estar declarados: ${intrusos.join(", ")}. ` +
      "Si es legítimo, añádelo a CAMINOS_PERMITIDOS diciendo por dónde reserva."
  );
});

check("2. Cada camino declarado sigue existiendo y sigue escribiendo", () => {
  for (const c of CAMINOS_PERMITIDOS) {
    const src = sinComentarios(readFileSync(c.archivo, "utf8"));
    assert(ESCRITURA.test(src),
      `${c.archivo} ya no escribe a Storage: sobra en la lista (o alguien movió la escritura a otro sitio)`);
  }
});

check("3. Ningún camino de cliente cambió de bucket a escondidas", () => {
  for (const c of CAMINOS_PERMITIDOS) {
    if (!(BUCKETS_DE_CLIENTE as readonly string[]).includes(c.bucket)) continue;
    const src = readFileSync(c.archivo, "utf8");
    assert(src.includes(`"${c.bucket}"`),
      `${c.archivo} ya no nombra el bucket declarado «${c.bucket}»`);
  }
});

check("4. Ningún camino de cliente escribe en un bucket de plataforma", () => {
  for (const c of CAMINOS_PERMITIDOS) {
    if (!(BUCKETS_DE_CLIENTE as readonly string[]).includes(c.bucket)) continue;
    for (const plataforma of BUCKETS_DE_PLATAFORMA) {
      assert(!readFileSync(c.archivo, "utf8").includes(`"${plataforma}"`),
        `${c.archivo} toca el bucket de plataforma «${plataforma}»`);
    }
  }
});

check("5. Los caminos de plataforma NO tocan buckets de cliente", () => {
  for (const c of CAMINOS_PERMITIDOS) {
    if (!(BUCKETS_DE_PLATAFORMA as readonly string[]).includes(c.bucket)) continue;
    for (const cliente of BUCKETS_DE_CLIENTE) {
      assert(!readFileSync(c.archivo, "utf8").includes(`"${cliente}"`),
        `${c.archivo} es de plataforma pero escribe en «${cliente}», que sí se le cobra a alguien`);
    }
  }
});

check("6. `uploadFileDocumentFile` sigue retirada", () => {
  const src = readFileSync("lib/db/trazadocs-master.ts", "utf8");
  assert(!/export async function uploadFileDocumentFile/.test(src),
    "volvió la función que subía a trazadocs-documents sin intent ni reserva");
});

console.log(`\nPE-04B3 · guardia: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
