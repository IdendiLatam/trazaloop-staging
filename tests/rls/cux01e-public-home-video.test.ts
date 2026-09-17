import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  publicVideoDismissKey, PUBLIC_VIDEO_DISMISS_PREFIX,
} from "../../lib/domain/public-video-dismiss";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · COMMERCIAL-UX-01E · El vídeo de la portada.
 *
 *
 * QUÉ DEFIENDE ESTA SUITE
 *
 * Tres cosas que, si se rompen, no se notan hasta que es tarde.
 *
 *   1 · Que abrir un vídeo al público no abra el almacén de tutoriales. La
 *       tentación evidente —hacer público el bucket, o conceder las tablas— se
 *       paga una sola vez y para siempre.
 *
 *   2 · Que «no volver a mostrar» no condene al contenido futuro. Es el defecto
 *       que tiene hoy el vídeo de bienvenida de dentro: un booleano que
 *       significa «nunca más, aunque publiques otra cosa». En una portada eso
 *       sería publicar un vídeo nuevo y que no lo viera nadie de los que ya
 *       habían dicho que no al anterior — y no habría forma de enterarse.
 *
 *   3 · Que la portada siga siendo la portada si el vídeo falla.
 *
 * Correr: npm run test:cux01e
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

let passed = 0, failed = 0;
async function check(nombre: string, fn: () => Promise<void> | void) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }
const leer = (p: string) => readFileSync(p, "utf8");

/** Un SHA-256 con la forma que la tabla exige, determinista por semilla. */
function hex64(semilla: string): string {
  return createHash("sha256").update(semilla).digest("hex");
}

const PROYECCION = ["tutorial_id", "version_id", "version_number", "title",
                    "description", "duration_seconds", "mime_type", "has_poster"];

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, params: unknown[] = []) => (await pg.query(sql, params)).rows;
  await q("set role postgres");

  const comoAnon = async <T>(sql: string): Promise<{ ok: true; filas: T[] }
                                                  | { ok: false; error: string }> => {
    await q("begin");
    try {
      await q("set local role anon");
      const filas = await q(sql);
      await q("rollback"); await q("set role postgres");
      return { ok: true, filas: filas as T[] };
    } catch (e) {
      await q("rollback"); await q("set role postgres");
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  const sello = Date.now();
  const creados: string[] = [];

  /** Un vídeo de portada de mentira, publicado como lo publica la consola. */
  const crearPortada = async (titulo: string, versiones: number) => {
    const [t] = await q(
      `insert into platform_tutorials (tutorial_type, page_key, module_key, title, status)
       values ('public_home', null, null, $1, 'active') returning id`, [titulo]);
    creados.push(t.id as string);
    let ultima = "";
    for (let n = 1; n <= versiones; n += 1) {
      // La anterior se cierra, como hace la sucesión de versiones real.
      await q(`update platform_tutorial_versions set effective_to = now()
                where tutorial_id = $1 and effective_to is null`, [t.id]);
      const [v] = await q(
        `insert into platform_tutorial_versions
           (tutorial_id, version_number, bucket_id, object_path, original_filename,
            declared_mime, declared_size_bytes, real_mime, real_size_bytes,
            content_hash, file_state, title, upload_expires_at, verified_at,
            effective_from, published_at)
         values ($1, $2, 'tutorial-media', $3, 'v.mp4', 'video/mp4', 1024,
                 'video/mp4', 1024, $4, 'verified', $5, now() + interval '1 hour',
                 now(), now(), now())
         returning id`,
        [t.id, n, `${t.id}/${sello}/v${n}.mp4`,
         // 64 hexadecimales: la tabla exige la forma de un SHA-256 de verdad,
         // y hace bien — un hash con otra forma no es un hash.
         hex64(`${sello}-${titulo}-${n}`), `${titulo} v${n}`]);
      ultima = v.id as string;
    }
    return { tutorialId: t.id as string, versionId: ultima };
  };

  /**
   * Recoger el fixture.
   *
   * Una versión PUBLICADA no se borra: un disparador lo impide, para que se
   * pueda saber qué vídeo se veía en una fecha. Es correcto y no se toca — así
   * que para retirar lo que esta batería inventó se desactivan los disparadores
   * durante el borrado, y se vuelven a activar acto seguido.
   *
   * Se desactivan para LIMPIAR, nunca para comprobar: ninguna aserción de aquí
   * corre con ellos apagados, o estaría comprobando otro producto.
   */
  const limpiar = async () => {
    await q("set session_replication_role = replica");
    try {
      for (const id of creados) {
        await q(`delete from platform_tutorial_versions where tutorial_id = $1`, [id]);
        await q(`delete from platform_tutorials where id = $1`, [id]);
      }
    } finally {
      await q("set session_replication_role = origin");
    }
    creados.length = 0;
  };

  /** Retira el vídeo de portada activo, para poder poner otro. */
  const retirar = async (id: string) =>
    q(`update platform_tutorials set status='retired' where id=$1`, [id]);

  /**
   * Deja EXACTAMENTE uno activo.
   *
   * Cada comprobación empieza llamando a esto, para que ninguna dependa de en
   * qué estado la dejó la anterior. La primera versión de esta batería no lo
   * hacía: falló una comprobación, dejó dos activos a medias y las tres
   * siguientes se cayeron con «duplicate key» — un error que no tenía nada que
   * ver con lo que estaban comprobando y que costó más leer que arreglar.
   */
  const soloActivo = async (id: string | null) => {
    await q(`update platform_tutorials set status='retired'
              where tutorial_type='public_home' and status='active'`);
    if (id !== null) {
      await q(`update platform_tutorials set status='active' where id=$1`, [id]);
    }
  };

  // Se aparta lo que hubiera de verdad para que el fixture mande, y se repone
  // al terminar. Nada de esto toca contenido real: solo su estado `status`.
  const realesApartados = (await q(
    `update platform_tutorials set status = 'retired'
      where tutorial_type = 'public_home' and status = 'active' returning id`))
    .map((r) => String(r.id));

  console.log("\n1 · SIN VÍDEO PUBLICADO, NO HAY AVISO");

  await check("1A. La vista pública no devuelve nada", async () => {
    const r = await comoAnon<{ n: number }>(
      "select count(*)::int n from public.v_public_home_video");
    assert(r.ok, `denegado: ${!r.ok && r.error}`);
    assert(r.ok && Number(r.filas[0].n) === 0,
      `hay ${r.ok && r.filas[0].n} vídeos de portada y no debería haber ninguno`);
  });

  console.log("\n2 · CON VÍDEO VIGENTE, SE DESCUBRE SIN SESIÓN");

  const uno = await crearPortada("CUX01E Alpha", 1);

  await check("2A. anon lo ve", async () => {
    const r = await comoAnon<{ tutorial_id: string; version_number: number }>(
      "select tutorial_id, version_number from public.v_public_home_video");
    assert(r.ok, `denegado: ${!r.ok && r.error}`);
    assert(r.ok && r.filas.length === 1, `devolvió ${r.ok && r.filas.length} filas`);
    assert(r.ok && r.filas[0].tutorial_id === uno.tutorialId, "no es el vídeo creado");
  });

  await check("2B. Y un autenticado ve exactamente lo mismo", async () => {
    await q("begin");
    await q("set local role authenticated");
    await q(`select set_config('request.jwt.claims',
               json_build_object('sub', gen_random_uuid()::text,
                                 'role','authenticated')::text, true)`);
    const filas = await q("select tutorial_id from public.v_public_home_video");
    await q("rollback"); await q("set role postgres");
    assert(filas.length === 1 && String(filas[0].tutorial_id) === uno.tutorialId,
      "el autenticado ve algo distinto que el anónimo");
  });

  await check("2C. Solo la proyección declarada · ni una columna más", async () => {
    const cols = (await q(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='v_public_home_video'`))
      .map((r) => String(r.column_name)).sort();
    assert(JSON.stringify(cols) === JSON.stringify([...PROYECCION].sort()),
      `la vista expone: ${cols.join(", ")}`);
  });

  await check("2D. Y NUNCA la ruta del fichero, la huella ni la autoría", async () => {
    for (const prohibida of ["object_path", "poster_path", "content_hash",
                             "bucket_id", "uploaded_by", "published_by",
                             "change_note", "original_filename", "upload_expires_at"]) {
      assert(!PROYECCION.includes(prohibida), `«${prohibida}» está declarada`);
      const [f] = await q(
        `select count(*)::int n from information_schema.columns
          where table_schema='public' and table_name='v_public_home_video'
            and column_name = $1`, [prohibida]);
      assert(Number(f.n) === 0, `«${prohibida}» sale por la vista pública`);
    }
  });

  console.log("\n3 · Y NADA MÁS · LO INTERNO SIGUE CERRADO");

  await check("3A. anon no puede leer las tablas de tutoriales", async () => {
    for (const t of ["platform_tutorials", "platform_tutorial_versions"]) {
      const r = await comoAnon(`select 1 from public.${t} limit 1`);
      assert(!r.ok, `anon puede leer ${t}`);
    }
  });

  await check("3B. Ni la vista interna de tutoriales vigentes", async () => {
    const r = await comoAnon<{ n: number }>(
      "select count(*)::int n from public.v_tutorial_current");
    // Puede estar concedida, pero su propio filtro exige sesión: el resultado
    // tiene que ser vacío en cualquier caso.
    assert(!r.ok || Number(r.filas[0].n) === 0,
      "sin sesión se ven tutoriales internos");
  });

  await check("3C. Ni resolver la ruta de ningún medio", async () => {
    for (const fn of ["public_home_video_object_path()",
                      "tutorial_current_object_path(uuid)"]) {
      const [f] = await q(
        `select has_function_privilege('anon', $1, 'EXECUTE') puede`, [`public.${fn}`]);
      assert(f.puede === false, `anon puede ejecutar ${fn}`);
    }
  });

  await check("3D. Y no puede escribir", async () => {
    const i = await comoAnon(
      "insert into public.v_public_home_video (title) values ('pirata')");
    assert(!i.ok, "anon puede escribir en la vista pública");
    const filas = await q(
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p')
          and (has_table_privilege('anon', c.oid,'INSERT')
            or has_table_privilege('anon', c.oid,'UPDATE')
            or has_table_privilege('anon', c.oid,'DELETE'))`);
    assert(filas.length === 0,
      `escribibles sin sesión: ${filas.map((f) => f.relname).join(", ")}`);
  });

  await check("3E. El bucket del medio sigue privado", async () => {
    const [b] = await q(
      `select public from storage.buckets where id = 'tutorial-media'`);
    assert(b !== undefined && b.public === false,
      "el almacén de tutoriales se hizo público para enseñar un vídeo");
  });

  console.log("\n4 · NI BORRADORES NI VERSIONES QUE NO TOCAN");

  await check("4A. Una versión sin publicar NO sale", async () => {
    const [v] = await q(
      `insert into platform_tutorial_versions
         (tutorial_id, version_number, bucket_id, object_path, original_filename,
          declared_mime, declared_size_bytes, real_mime, real_size_bytes,
          content_hash, file_state, title, upload_expires_at, verified_at)
       values ($1, 99, 'tutorial-media', $2, 'x.mp4', 'video/mp4', 10,
               'video/mp4', 10, $3, 'verified', 'candidata',
               now() + interval '1 hour', now())
       returning id`, [uno.tutorialId, `${uno.tutorialId}/${sello}/candidata.mp4`,
                       hex64(`candidata-${sello}`)]);
    const r = await comoAnon<{ version_id: string }>(
      "select version_id from public.v_public_home_video");
    assert(r.ok && r.filas.every((f) => f.version_id !== String(v.id)),
      "una versión sin publicar sale por la vista pública");
    await q(`delete from platform_tutorial_versions where id = $1`, [v.id]);
  });

  await check("4B. Un fichero sin verificar no se puede ni publicar", async () => {
    // La primera versión de esta comprobación intentaba PUBLICAR una versión sin
    // verificar para ver si salía por la vista. No pudo: el esquema lo impide
    // antes, con `tutorial_versions_publish_requires_verified_check`.
    //
    // Es mejor noticia que la que buscaba. Significa que «no se enseña un vídeo
    // que no pasó la verificación» no depende del filtro de la vista pública:
    // ese estado NO EXISTE. Así que se comprueba lo que de verdad protege — que
    // publicarlo sea imposible— y, además, que mientras esté sin verificar no
    // salga.
    await soloActivo(null);
    const [t] = await q(
      `insert into platform_tutorials (tutorial_type, title, status)
       values ('public_home', 'CUX01E SinVerificar', 'active') returning id`);
    creados.push(t.id as string);

    // Sin verificar y sin publicar: una candidata, que es como nace todo.
    const [v] = await q(
      `insert into platform_tutorial_versions
         (tutorial_id, version_number, bucket_id, object_path, original_filename,
          declared_mime, declared_size_bytes, file_state, upload_expires_at)
       values ($1, 1, 'tutorial-media', $2, 'v.mp4', 'video/mp4', 10,
               'uploaded', now() + interval '1 hour')
       returning id`, [t.id, `${t.id}/${sello}/pendiente.mp4`]);

    const r = await comoAnon<{ n: number }>(
      "select count(*)::int n from public.v_public_home_video");
    assert(r.ok && Number(r.filas[0].n) === 0,
      "se ofrece un vídeo cuya versión todavía no está publicada");

    // Y publicarla sin verificarla es imposible, no solo invisible.
    let rechazado = false;
    try {
      await q(`update platform_tutorial_versions
                  set effective_from = now(), published_at = now() where id = $1`, [v.id]);
    } catch { rechazado = true; }
    assert(rechazado,
      "se pudo publicar un vídeo cuyo fichero no pasó la verificación");

    await soloActivo(uno.tutorialId);
  });

  await check("4C. Un tutorial retirado tampoco", async () => {
    await soloActivo(uno.tutorialId);
    await retirar(uno.tutorialId);
    const r = await comoAnon<{ n: number }>(
      "select count(*)::int n from public.v_public_home_video");
    assert(r.ok && Number(r.filas[0].n) === 0, "un tutorial retirado sigue saliendo");
    await soloActivo(uno.tutorialId);
  });

  await check("4D. Y los vídeos internos NO se cuelan en la portada", async () => {
    await soloActivo(uno.tutorialId);
    // El de bienvenida y los de pantalla existen y son de dentro. Si la vista
    // no filtrara por emplazamiento, saldrían a la calle.
    const r = await comoAnon<{ tutorial_id: string }>(
      "select tutorial_id from public.v_public_home_video");
    const internos = (await q(
      `select id from platform_tutorials where tutorial_type in ('page','welcome')`))
      .map((f) => String(f.id));
    assert(r.ok && r.filas.every((f) => !internos.includes(f.tutorial_id)),
      "un vídeo interno se está enseñando en la portada");
  });

  console.log("\n5 · COMO MUCHO UNO");

  await check("5A. La base impide dos activos a la vez", async () => {
    await soloActivo(uno.tutorialId);
    let rechazado = false;
    try {
      await q(`insert into platform_tutorials (tutorial_type, title, status)
               values ('public_home', 'CUX01E Segundo', 'active')`);
    } catch { rechazado = true; }
    assert(rechazado, "se pudieron tener dos vídeos de portada activos");
  });

  await check("5B. Pero retirar uno deja crear otro", async () => {
    // Es la diferencia entre «uno a la vez» y «uno para siempre». Lo segundo
    // impediría sustituir el vídeo por otro distinto.
    await soloActivo(null);
    const otro = await crearPortada("CUX01E Beta", 1);
    assert(otro.tutorialId !== uno.tutorialId, "no se pudo crear el sustituto");
    // Se retira el sustituto en vez de borrarlo: la historia de una versión
    // publicada no se borra, y esta batería no va a ser la excepción.
    await soloActivo(uno.tutorialId);
  });

  console.log("\n6 · LA VERSIÓN NUEVA VUELVE A APARECER");

  await check("6A. La clave del descarte lleva tutorial Y versión", () => {
    // Si llevara solo el tutorial, publicar la v2 no se vería. Si llevara solo
    // la versión, otro tutorial podría nacer invisible.
    const k = publicVideoDismissKey({ tutorialId: "T", versionId: "V" });
    assert(k.includes("T") && k.includes("V"), `la clave es «${k}»`);
    assert(k.startsWith(PUBLIC_VIDEO_DISMISS_PREFIX), "la clave no lleva prefijo propio");
  });

  await check("6B. Descartar la v1 NO descarta la v2", async () => {
    await soloActivo(null);
    const dos = await crearPortada("CUX01E Gamma", 2);
    // Se simula lo que guarda el navegador al pulsar «No volver a mostrar».
    const almacen = new Set<string>();
    const v1 = await q(
      `select id from platform_tutorial_versions
        where tutorial_id=$1 and version_number=1`, [dos.tutorialId]);
    almacen.add(publicVideoDismissKey({
      tutorialId: dos.tutorialId, versionId: String(v1[0].id) }));

    const vigente = publicVideoDismissKey({
      tutorialId: dos.tutorialId, versionId: dos.versionId });
    assert(!almacen.has(vigente),
      "el descarte de la v1 esconde la v2: el contenido nuevo nacería invisible");
    // Y la v2 es la que la vista ofrece: la sucesión funciona de verdad.
    const r = await comoAnon<{ version_id: string }>(
      "select version_id from public.v_public_home_video");
    assert(r.ok && r.filas.length === 1 && r.filas[0].version_id === dos.versionId,
      "la vista no ofrece la versión vigente tras publicar la segunda");
    await soloActivo(uno.tutorialId);
  });

  await check("6C. Y cambiar de tutorial también vuelve a aparecer", () => {
    const almacen = new Set([publicVideoDismissKey(
      { tutorialId: "viejo", versionId: "v1" })]);
    assert(!almacen.has(publicVideoDismissKey(
      { tutorialId: "nuevo", versionId: "v1" })),
      "un tutorial distinto hereda el descarte del anterior");
  });

  await check("6D. La clave no lleva identidad de nadie", () => {
    const k = publicVideoDismissKey({ tutorialId: "T", versionId: "V" });
    for (const fuga of ["@", "user", "email", "org", "session", "token"]) {
      assert(!k.includes(fuga), `la clave lleva «${fuga}»: ${k}`);
    }
  });

  console.log("\n7 · EL CÓDIGO · LO QUE NO SE PUEDE PEDIR");

  await check("7A. La firma no acepta parámetros · no hay qué pedirle", () => {
    // La defensa más fuerte contra «fírmame este otro»: no existe el argumento.
    const lib = leer("lib/db/public-home-video.ts");
    assert(/export async function signPublicHomeVideo\(\): Promise/.test(lib),
      "la firma acepta parámetros: se le puede pedir otro vídeo");
    const accion = leer("server/actions/public-home-video.ts");
    assert(/requestPublicHomeVideoAction\(\): Promise/.test(accion),
      "la acción pública acepta parámetros");
    assert(/public_home_video_object_path/.test(lib),
      "la firma no resuelve la ruta por la función acotada");
    assert(!/tutorial_current_object_path/.test(lib),
      "la firma pública usa el resolutor general, que acepta una versión cualquiera");
  });

  await check("7B. El cliente administrativo NO sale al navegador", () => {
    const sospechosos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const ruta = join(dir, e);
        if (statSync(ruta).isDirectory()) { recorrer(ruta); continue; }
        if (!/\.tsx?$/.test(e)) continue;
        const src = leer(ruta);
        if (!/^["']use client["']/m.test(src)) continue;
        if (/createAdminClient|SERVICE_ROLE/.test(src)) sospechosos.push(ruta);
      }
    };
    for (const r of ["app", "components"]) recorrer(r);
    assert(sospechosos.length === 0,
      `componentes de cliente con identidad de servidor: ${sospechosos.join(", ")}`);
    assert(/^import "server-only";/m.test(leer("lib/db/public-home-video.ts")),
      "el lector del vídeo no está marcado como server-only");
  });

  await check("7C. La portada no espera por el vídeo para pintarse", () => {
    const p = leer("app/page.tsx");
    assert(/readPublicHomeVideo\(\)/.test(p), "la portada no lee el vídeo");
    assert(!/signPublicHomeVideo|requestPublicHomeVideoAction/.test(p),
      "la portada firma el medio en el render: descargaría el vídeo a quien lo descartó");
    assert(/videoPortada !== null \? \(/.test(p),
      "sin vídeo la portada no contempla no pintar el aviso");
  });

  await check("7D. Y si el medio falla, la portada sigue en pie", () => {
    const c = leer("components/domain/commercial/home-video-popup.tsx");
    assert(/if \(r\.url === null\) \{ setFallo\(true\); return; \}/.test(c),
      "un medio que no se puede servir no se contempla");
    assert(/if \(!abierto \|\| medio === null \|\| fallo\) return null;/.test(c),
      "el modal se pinta sin medio");
  });

  await check("7E. Sin reproducción automática", () => {
    const player = leer("components/domain/tutorials/tutorial-player.tsx");
    assert(!/autoPlay/.test(player.replace(/\/\*[\s\S]*?\*\//g, "")),
      "el reproductor arranca solo");
    const c = leer("components/domain/commercial/home-video-popup.tsx");
    assert(!/autoPlay|autoplay/.test(c), "el popup fuerza reproducción automática");
  });

  await check("7F. Cerrar NO persiste · «no volver a mostrar» SÍ", () => {
    const c = leer("components/domain/commercial/home-video-popup.tsx");
    const cerrar = c.slice(c.indexOf("const cerrar ="), c.indexOf("const noMostrarMas"));
    assert(!/localStorage/.test(cerrar),
      "cerrar escribe en el almacenamiento: convierte «ahora no» en «nunca»");
    const nunca = c.slice(c.indexOf("const noMostrarMas"), c.indexOf("const renovar"));
    assert(/localStorage\.setItem\(clave/.test(nunca),
      "«no volver a mostrar» no recuerda nada");
  });

  await check("7G. Y no se reutiliza el interruptor del vídeo interno", () => {
    // `welcome_video_suppressed` significa «nunca más, aunque publiques otra
    // cosa». Aquí eso condenaría al contenido futuro.
    for (const f of ["components/domain/commercial/home-video-popup.tsx",
                     "lib/domain/public-video-dismiss.ts",
                     "lib/db/public-home-video.ts",
                     "server/actions/public-home-video.ts"]) {
      const src = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      assert(!/welcome_video_suppressed|suppressWelcomeVideo/.test(src),
        `${f} reutiliza el interruptor del vídeo de bienvenida`);
    }
  });

  console.log("\n8 · LA CONSOLA ES LA MISMA");

  await check("8A. Se reutiliza /platform/tutorials", () => {
    const p = leer("app/(app)/platform/tutorials/page.tsx");
    assert(/public_home/.test(p), "la consola no contempla el vídeo de portada");
    assert(/CreatePublicHomeVideoForm/.test(p), "no se puede crear desde la consola");
  });

  await check("8B. Sin segunda tubería de subida ni de publicación", () => {
    const acciones = leer("server/actions/tutorials-admin.ts");
    const nueva = acciones.slice(acciones.indexOf("createPublicHomeTutorialAction"),
                                 acciones.indexOf("createPublicHomeTutorialAction") + 900);
    for (const prohibido of ["createSignedUploadUrl", "content_hash", "real_mime",
                             "storage.from"]) {
      assert(!new RegExp(prohibido).test(nueva),
        `la creación del vídeo de portada duplica ${prohibido}`);
    }
    assert(/requirePlatformStaff/.test(nueva), "la creación no exige superadministración");
  });

  console.log("\n9 · LA SUPERFICIE PÚBLICA, DECLARADA");

  await check("9A. Siete relaciones, exactamente", async () => {
    await soloActivo(uno.tutorialId);
    const nombres = (await q(
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p','v','m','f')
          and has_table_privilege('anon', c.oid,'SELECT') order by 1`))
      .map((f) => String(f.relname));
    assert(JSON.stringify(nombres) === JSON.stringify([
      "legal_documents", "v_faq_public", "v_faq_public_categories",
      "v_public_home_video", "v_public_plan_catalog", "v_public_plan_limits",
      "v_public_trial_policy"]),
      `legibles sin sesión: ${nombres.join(", ")}`);
  });

  await check("9B. Y el documento de seguridad lo declara", () => {
    const doc = leer("docs/security/PUBLIC-ANON-EXECUTE-AUDIT-01.md");
    assert(/\*\*Estado:\*\*\s*CERRADA/.test(doc), "la auditoría dejó de estar cerrada");
    assert(/v_public_home_video/.test(doc),
      "el documento no declara la vista del vídeo de portada");
    assert(/siete relaciones/i.test(doc),
      "el documento no está al día con la superficie pública real");
  });

  // ── limpieza ───────────────────────────────────────────────────────────────
  await limpiar();
  for (const id of realesApartados) {
    await q(`update platform_tutorials set status='active' where id=$1`, [id]);
  }
  const [resto] = await q(
    `select count(*)::int n from platform_tutorials where title like 'CUX01E%'`);
  if (Number(resto.n) !== 0) console.log(`  ⚠ quedaron ${resto.n} fixtures sin borrar`);

  await pg.end();
  console.log(`\nCOMMERCIAL-UX-01E · vídeo de portada: ${passed} en verde, ${failed} en rojo`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
