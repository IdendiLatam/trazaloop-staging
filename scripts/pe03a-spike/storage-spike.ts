/**
 * Trazaloop · PE-03A · Sonda de arquitectura de Storage.
 *
 * Mide, en vez de suponer, lo que decide el diseño de los tutoriales: si un cubo
 * PRIVADO sirve vídeo con búsqueda. La respuesta —206 Partial Content con el
 * rango correcto— es lo que permite no tener que elegir un cubo público.
 *
 * SOLO CONTRA EL STACK LOCAL, y se comprueba antes de escribir nada. Sube un
 * objeto de prueba con cliente administrativo y lo retira en un `finally`; nadie
 * quiere eso apuntando a un entorno con datos reales, ni siquiera de QA.
 *
 * Correr: npx tsx scripts/pe03a-spike/storage-spike.ts
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
loadEnv({ path: ".env.local" });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// La barrera. Un cliente administrativo apuntando a Staging por una variable
// mal puesta es exactamente el accidente que esto impide.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(URL ?? "")) {
  console.error(`Esta sonda solo corre contra el stack local. Apunta a: ${URL}`);
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function main() {
  const bucket = "organization-assets";
  const ruta = `00000000-0000-0000-0000-000000000000/pe03a-spike-${randomUUID()}.mp4`;
  // 3 MB de bytes deterministas: basta para medir semántica HTTP.
  const bytes = Buffer.alloc(3 * 1024 * 1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;

  const { error: eUp } = await admin.storage.from(bucket)
    .upload(ruta, bytes, { contentType: "video/mp4", upsert: false });
  if (eUp) { console.error("subida:", eUp.message); process.exit(1); }
  console.log(`objeto de prueba: ${(bytes.length / 1024 / 1024).toFixed(0)} MB · video/mp4`);

  try {
    // ── 1 · URL firmada
    const { data: firmada, error: eF } = await admin.storage.from(bucket)
      .createSignedUrl(ruta, 60);
    if (eF || !firmada) { console.error("firmar:", eF?.message); return; }
    console.log("\n── 1 · URL firmada ──");
    console.log("  forma:", firmada.signedUrl.replace(URL, "<base>").split("?")[0],
      "?token=<jwt>");

    // ── 2 · GET completo
    const completo = await fetch(firmada.signedUrl);
    console.log("\n── 2 · GET completo ──");
    console.log("  estado:", completo.status);
    for (const h of ["content-type", "content-length", "accept-ranges",
      "content-disposition", "cache-control", "etag"]) {
      console.log(`  ${h}: ${completo.headers.get(h) ?? "(ausente)"}`);
    }
    await completo.arrayBuffer();

    // ── 3 · Petición de rango (lo que hace un <video> al buscar)
    console.log("\n── 3 · Range: bytes=1048576-2097151 (busca al segundo tercio) ──");
    const rango = await fetch(firmada.signedUrl, { headers: { Range: "bytes=1048576-2097151" } });
    console.log("  estado:", rango.status, rango.status === 206 ? "· 206 Partial Content ✔" : "· NO parcial ✘");
    console.log("  content-range:", rango.headers.get("content-range") ?? "(ausente)");
    console.log("  content-length:", rango.headers.get("content-length"));
    const trozo = Buffer.from(await rango.arrayBuffer());
    console.log("  bytes recibidos:", trozo.length);
    console.log("  contenido correcto:", trozo[0] === (1048576 % 251) ? "sí ✔" : "NO ✘");

    // ── 4 · Rango abierto, que es el primero que manda un <video>
    console.log("\n── 4 · Range: bytes=0- (la primera petición de un <video>) ──");
    const abierto = await fetch(firmada.signedUrl, { headers: { Range: "bytes=0-" } });
    console.log("  estado:", abierto.status);
    console.log("  content-range:", abierto.headers.get("content-range") ?? "(ausente)");
    await abierto.arrayBuffer();

    // ── 5 · ¿Caduca de verdad?
    const { data: corta } = await admin.storage.from(bucket).createSignedUrl(ruta, 1);
    await new Promise((r) => setTimeout(r, 2500));
    const caducada = await fetch(corta!.signedUrl);
    console.log("\n── 5 · URL firmada caducada (1 s, esperados 2,5 s) ──");
    console.log("  estado:", caducada.status, caducada.status >= 400 ? "· rechazada ✔" : "· SIGUE SIRVIENDO ✘");

    // ── 6 · Sin firma
    const desnuda = await fetch(`${URL}/storage/v1/object/${bucket}/${ruta}`);
    console.log("\n── 6 · Sin firma y sin sesión ──");
    console.log("  estado:", desnuda.status, desnuda.status >= 400 ? "· denegado ✔" : "· ABIERTO ✘");

    // ── 7 · ¿Se puede leer con la sesión, sin firmar? (vía /authenticated)
    const anonCli = createClient(URL, ANON, { auth: { persistSession: false } });
    const { error: eAnon } = await anonCli.storage.from(bucket).download(ruta);
    console.log("\n── 7 · Descarga con clave anónima sin sesión ──");
    console.log("  resultado:", eAnon ? `denegado ✔ (${eAnon.message})` : "PERMITIDO ✘");

    // ── 8 · ¿Cuánto tarda firmar? (coste por reproducción)
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) await admin.storage.from(bucket).createSignedUrl(ruta, 60);
    console.log("\n── 8 · Coste de firmar ──");
    console.log(`  10 firmas en ${Date.now() - t0} ms`);
  } finally {
    await admin.storage.from(bucket).remove([ruta]);
    console.log("\nobjeto de prueba retirado.");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
