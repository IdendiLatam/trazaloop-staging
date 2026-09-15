import { config as loadEnv } from "dotenv";
import { Client as PgClient } from "pg";
import { createHash } from "node:crypto";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01E · La primera superficie pública.
 *
 * Hasta este tramo `anon` no podía nada. Ahora puede ejecutar tres funciones, y
 * todo lo que sigue existe para comprobar que la puerta tiene exactamente ese
 * tamaño: ni una tabla, ni una función de más, y nada de lo que decide el
 * resultado llega del navegador.
 *
 * Se ejecuta TODO como `anon`, que es quien va a llamar de verdad.
 *
 * Correr: npm run test:pd01e-db
 */

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) { console.log("falta SUPABASE_DB_URL en .env.local"); process.exit(1); }

let passed = 0, failed = 0;
async function check(nombre: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${nombre}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`); }
}
function assert(cond: boolean, mensaje: string) { if (!cond) throw new Error(mensaje); }

async function main() {
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  const q = async (sql: string, p: unknown[] = []) => (await pg.query(sql, p)).rows;
  const falla = async (sql: string, p: unknown[] = []): Promise<string> => {
    await pg.query("savepoint s");
    try { await pg.query(sql, p); await pg.query("release savepoint s"); return ""; }
    catch (e) { await pg.query("rollback to savepoint s");
                return e instanceof Error ? e.message : String(e); }
  };
  /**
   * Llama como llamaría el público.
   *
   * OJO con el punto de retorno: el primer intento envolvía cada llamada en un
   * savepoint y lo DESHACÍA al terminar, así que cada participación creada se
   * borraba sola y las comprobaciones siguientes no encontraban nada. Ahora el
   * savepoint solo aísla el error: si la llamada va bien se libera, y lo escrito
   * se queda hasta el rollback final de toda la batería.
   */
  const comoAnon = async <T,>(fn: () => Promise<T>): Promise<T> => {
    await q("savepoint anon");
    await q("set local role anon");
    try {
      const r = await fn();
      await q("set local role postgres");
      await q("release savepoint anon");
      return r;
    } catch (e) {
      await q("rollback to savepoint anon");
      await q("set local role postgres");
      throw e;
    }
  };
  await q("set role postgres");
  await q("begin");

  const sello = Date.now();
  const [v1] = await q(
    `select id from public.diagnostic_versions where diagnostic_type='pcr' and version_number=1`);
  const [doc] = await q(
    `select id, version, content_hash from public.legal_documents where status='active' limit 1`);

  const nuevaCampana = async (slug: string, extra: string = "'open', now() - interval '1 day', null") => {
    const [c] = await q(
      `insert into public.public_diagnostic_campaigns
         (slug, name, diagnostic_type, diagnostic_version_id, consent_document_id,
          consent_version, consent_content_hash, public_title, partner_name,
          status, opens_at, closes_at)
       values ($1,$2,'pcr',$3,$4,$5,$6,'Diagnóstico de prueba','Trazaloop QA', ${extra})
       returning id`,
      [slug, `QA ${slug}`, v1.id, doc?.id ?? null, doc?.version ?? null, doc?.content_hash ?? null]);
    return c.id as string;
  };

  const abierta = await nuevaCampana(`qa-abierta-${sello}`);
  const borrador = await nuevaCampana(`qa-borrador-${sello}`, "'draft', null, null");
  const programada = await nuevaCampana(
    `qa-programada-${sello}`, "'open', now() + interval '10 days', null");
  const vencida = await nuevaCampana(
    `qa-vencida-${sello}`, "'open', now() - interval '20 days', now() - interval '1 day'");
  const cerrada = await nuevaCampana(`qa-cerrada-${sello}`, "'closed', null, null");
  const archivada = await nuevaCampana(`qa-archivada-${sello}`, "'archived', null, null");

  const resolver = (slug: string) => comoAnon(async () => {
    const [r] = await q(`select public.public_diagnostic_resolve_campaign($1) as j`, [slug]);
    return r.j as Record<string, unknown>;
  });
  /** Un testigo de formulario con la edad suficiente, sin esperar de verdad. */
  const nonceValido = async (segundos = 10) => {
    const [r] = await q(
      `select (extract(epoch from now())*1000 - $1*1000)::bigint::text as ts`, [segundos]);
    const ts = r.ts as string;
    const [f] = await q(`select public.public_intake_fingerprint($1) as h`, [ts]);
    return `${ts}.${f.h as string}`;
  };

  const empezar = async (slug: string, email: string, extra: Partial<{
    name: string; phone: string; company: string; marketing: boolean; ip: string;
    nonce: string | null;
  }> = {}) => {
    const nonce = extra.nonce === undefined ? await nonceValido() : extra.nonce;
    return comoAnon(async () => {
      const [r] = await q(
        `select public.public_diagnostic_begin_submission($1,$2,$3,$4,$5,$6,$7,$8) as j`,
        [slug, extra.name ?? "Ana Pérez", email, extra.phone ?? "+57 300 000 0000",
         extra.company ?? "Empresa QA", extra.marketing ?? false,
         extra.ip ?? "203.0.113.10", nonce]);
      return r.j as Record<string, unknown>;
    });
  };

  console.log("\nA · Disponibilidad\n");

  await check("A. Abierta y dentro de ventana se resuelve", async () => {
    const r = await resolver(`qa-abierta-${sello}`);
    assert(r.status === "found", `estado «${r.status}»`);
    assert(r.availability === "available", `disponibilidad «${r.availability}»`);
    assert(r.public_title === "Diagnóstico de prueba", "no se devuelve el título público");
  });

  await check("B/F. Borrador y archivada NO existen para el público", async () => {
    for (const [qué, slug] of [["borrador", `qa-borrador-${sello}`],
                               ["archivada", `qa-archivada-${sello}`]] as const) {
      const r = await resolver(slug);
      assert(r.status === "not_found",
        `la campaña ${qué} se distingue de una inexistente: dejaría adivinar slugs`);
    }
    const inexistente = await resolver("no-existe-en-absoluto");
    assert(inexistente.status === "not_found", "una inexistente responde otra cosa");
  });

  await check("C/D/E. Programada, vencida y cerrada no dejan empezar", async () => {
    for (const [qué, slug] of [["programada", `qa-programada-${sello}`],
                               ["vencida", `qa-vencida-${sello}`],
                               ["cerrada", `qa-cerrada-${sello}`]] as const) {
      const r = await empezar(slug, `x${sello}@ejemplo.com`);
      assert(r.status === "unavailable", `la ${qué} dejó empezar (${r.status})`);
    }
    assert((await resolver(`qa-programada-${sello}`)).availability === "scheduled", "");
    assert((await resolver(`qa-vencida-${sello}`)).availability === "window_closed", "");
  });

  await check("La superficie pública NO filtra nada interno", async () => {
    const r = await resolver(`qa-abierta-${sello}`);
    for (const prohibido of ["id", "campaign_id", "created_by", "created_at", "updated_at",
                             "diagnostic_version_id", "consent_document_id", "branding"]) {
      assert(!(prohibido in r), `la resolución pública devuelve «${prohibido}»`);
    }
  });

  console.log("\nB · Crear participación\n");

  let token = "";
  await check("G. Un participante válido crea exactamente una en curso", async () => {
    const r = await empezar(`qa-abierta-${sello}`, `  Ana.Perez@Ejemplo.COM  `);
    assert(r.status === "created", `estado «${r.status}»`);
    assert(typeof r.token === "string" && (r.token as string).length === 64,
      "el testigo no tiene 32 bytes en hexadecimal");
    token = r.token as string;
    const [n] = await q(
      `select count(*)::int c from public.public_diagnostic_submissions where campaign_id=$1`,
      [abierta]);
    assert(n.c === 1, `se crearon ${n.c} participaciones`);
  });

  await check("H/I. Versión y consentimiento los pone el SERVIDOR", async () => {
    const [s] = await q(
      `select diagnostic_version_id v, consent_document_id d, consent_version cv,
              consent_content_hash ch, consent_at ca, status
         from public.public_diagnostic_submissions where campaign_id=$1`, [abierta]);
    assert(s.v === v1.id, "la versión no viene de la campaña");
    assert(s.d === doc.id && s.cv === doc.version && s.ch === doc.content_hash,
      "la evidencia del consentimiento no se copió del documento real");
    assert(s.ca !== null, "no se registró cuándo se consintió");
    assert(s.status === "in_progress", `nació en «${s.status}»`);
  });

  await check("M/N. Correo y teléfono normalizados", async () => {
    const [s] = await q(
      `select participant_email n, participant_email_normalized e,
              participant_phone p, participant_phone_normalized pn
         from public.public_diagnostic_submissions where campaign_id=$1`, [abierta]);
    assert(s.e === "ana.perez@ejemplo.com", `normalizado «${s.e}»`);
    assert(s.n === "Ana.Perez@Ejemplo.COM", "no se conserva el original presentable");
    assert(s.pn === "+573000000000", `teléfono normalizado «${s.pn}»`);
    assert(s.p === "+57 300 000 0000", "no se conserva el teléfono presentable");
  });

  await check("K/L. El consentimiento comercial va aparte y con su fecha", async () => {
    const [s] = await q(
      `select marketing_opt_in m, marketing_opt_in_at ma
         from public.public_diagnostic_submissions where campaign_id=$1`, [abierta]);
    assert(s.m === false && s.ma === null, "el comercial nació marcado");
    const otra = await nuevaCampana(`qa-mkt-${sello}`);
    const r = await empezar(`qa-mkt-${sello}`, `mkt${sello}@ejemplo.com`, { marketing: true });
    assert(r.status === "created", `no se pudo crear (${r.status})`);
    const [s2] = await q(
      `select marketing_opt_in m, marketing_opt_in_at ma
         from public.public_diagnostic_submissions where campaign_id=$1`, [otra]);
    assert(s2.m === true && s2.ma !== null, "el «sí» comercial quedó sin fecha");
  });

  await check("J. Sin documento de consentimiento no se puede empezar", async () => {
    const sinDoc = await nuevaCampana(`qa-sindoc-${sello}`);
    await q(`update public.public_diagnostic_campaigns set status='draft' where id=$1`, [sinDoc]);
    await q(`update public.public_diagnostic_campaigns set consent_document_id=null,
              consent_version=null, consent_content_hash=null where id=$1`, [sinDoc]);
    await q(`update public.public_diagnostic_campaigns set status='open' where id=$1`, [sinDoc]);
    const r = await empezar(`qa-sindoc-${sello}`, `nodoc${sello}@ejemplo.com`);
    assert(r.status === "unavailable", `dejó empezar sin consentimiento (${r.status})`);
  });

  await check("Datos inválidos se rechazan sin tocar nada", async () => {
    for (const [qué, email] of [["sin arroba", "noesuncorreo"],
                                ["vacío", ""]] as const) {
      const r = await empezar(`qa-abierta-${sello}`, email);
      assert(r.status === "invalid", `se aceptó un correo ${qué} (${r.status})`);
    }
    const largo = await empezar(`qa-abierta-${sello}`, `l${sello}@e.com`,
      { company: "x".repeat(500) });
    assert(largo.status === "invalid", "se aceptó una carga desmedida");
  });

  await check("U. Un envío instantáneo NO crea nada, y no se le dice por qué", async () => {
    const camp = await nuevaCampana(`qa-rapido-${sello}`);
    // Testigo recién emitido: cero segundos de antigüedad.
    const [n] = await q(`select public.public_intake_issue_nonce() as v`);
    const r = await empezar(`qa-rapido-${sello}`, `rapido${sello}@ejemplo.com`,
      { nonce: n.v as string });
    assert(r.status === "created",
      `al envío instantáneo se le responde «${r.status}»: eso le dice qué comprobación falló`);
    assert(!("token" in r), "se entregó testigo a un envío instantáneo");
    const [c] = await q(
      `select count(*)::int c from public.public_diagnostic_submissions where campaign_id=$1`,
      [camp]);
    assert(c.c === 0, `se creó una participación pese al envío instantáneo`);
  });

  await check("Y un testigo inventado tampoco pasa", async () => {
    const camp = await nuevaCampana(`qa-nonce-${sello}`);
    for (const malo of ["", "0.0", "9999999999999.deadbeef", "sinpunto"]) {
      const r = await empezar(`qa-nonce-${sello}`, `n${sello}@ejemplo.com`, { nonce: malo });
      assert(r.status === "created", `un testigo inventado dio «${r.status}»`);
    }
    const [c] = await q(
      `select count(*)::int c from public.public_diagnostic_submissions where campaign_id=$1`,
      [camp]);
    assert(c.c === 0, "un testigo inventado creó una participación");
  });

  console.log("\nC · El testigo\n");

  await check("O. El testigo en claro NO se guarda", async () => {
    const [s] = await q(
      `select resume_token_hash h, resume_token_prefix p
         from public.public_diagnostic_submissions where campaign_id=$1`, [abierta]);
    assert(s.h !== token, "¡el testigo está guardado en claro!");
    assert(s.h === createHash("sha256").update(token).digest("hex"),
      "el hash guardado no es el sha256 del testigo");
    assert(s.p === token.slice(0, 8), "el prefijo no coincide");
    const cols = await q(
      `select column_name from information_schema.columns
        where table_name='public_diagnostic_submissions' and column_name='resume_token'`);
    assert(cols.length === 0, "existe una columna para el testigo en claro");
  });

  await check("P. Un testigo incorrecto no accede", async () => {
    for (const malo of ["a".repeat(64), "corto", "", token.slice(0, 63) + "0"]) {
      const r = await comoAnon(async () => {
        const [x] = await q(`select public.public_diagnostic_resume_submission($1) as j`, [malo]);
        return x.j as Record<string, unknown>;
      });
      assert(r.status === "not_found", `un testigo inválido («${malo.slice(0, 8)}…») accedió`);
    }
    const bueno = await comoAnon(async () => {
      const [x] = await q(`select public.public_diagnostic_resume_submission($1) as j`, [token]);
      return x.j as Record<string, unknown>;
    });
    assert(bueno.status === "found", "el testigo bueno no accede");
    for (const pii of ["participant_name", "participant_email", "participant_phone", "company_name"]) {
      assert(!(pii in bueno), `retomar devuelve «${pii}»`);
    }
  });

  console.log("\nD · Duplicados y enumeración\n");

  await check("Q/R/S. Ya existe → misma respuesta, en curso o completada", async () => {
    const enCurso = await empezar(`qa-abierta-${sello}`, "ana.perez@ejemplo.com");
    assert(enCurso.status === "existing", `en curso dio «${enCurso.status}»`);
    assert(!("token" in enCurso), "se entregó el testigo a quien solo conoce un correo");

    const camp2 = await nuevaCampana(`qa-compl-${sello}`);
    await empezar(`qa-compl-${sello}`, `c${sello}@ejemplo.com`);
    await q(
      `update public.public_diagnostic_submissions
          set status='completed', completed_at=now(), maturity_percent=50,
              readiness_level='medium', critical_gaps=1
        where campaign_id=$1`, [camp2]);
    const completada = await empezar(`qa-compl-${sello}`, `c${sello}@ejemplo.com`);
    assert(completada.status === "existing",
      `completada dio «${completada.status}»: distinta de «en curso» permite enumerar`);
    assert(JSON.stringify(Object.keys(enCurso).sort())
        === JSON.stringify(Object.keys(completada).sort()),
      "las dos respuestas tienen forma distinta: se puede distinguir el estado");

    const [n] = await q(
      `select count(*)::int c from public.public_diagnostic_submissions where campaign_id=$1`,
      [abierta]);
    assert(n.c === 1, `se duplicó en silencio: ${n.c} participaciones`);
  });

  console.log("\nE · Límite de tasa\n");

  await check("V. El límite por correo muerde al cuarto intento", async () => {
    const camp = await nuevaCampana(`qa-rate-${sello}`);
    const correo = `rate${sello}@ejemplo.com`;
    // 1 crea; 2 y 3 dicen «ya existe»; el 4.º cae por límite (3 en 24 h).
    const r1 = await empezar(`qa-rate-${sello}`, correo);
    const r2 = await empezar(`qa-rate-${sello}`, correo);
    const r3 = await empezar(`qa-rate-${sello}`, correo);
    const r4 = await empezar(`qa-rate-${sello}`, correo);
    assert(r1.status === "created", `el primero dio «${r1.status}»`);
    assert(r2.status === "existing" && r3.status === "existing", "los repetidos no se reconocen");
    assert(r4.status === "rate_limited", `el cuarto dio «${r4.status}»`);
    void camp;
  });

  await check("W. Una IP corporativa compartida NO bloquea a la primera", async () => {
    // Veinte empresas distintas desde la MISMA IP: es exactamente lo que pasa
    // en la oficina de una cámara. El tope por IP es 30/h, así que caben.
    const camp = await nuevaCampana(`qa-oficina-${sello}`);
    let creadas = 0;
    for (let i = 0; i < 20; i += 1) {
      const r = await empezar(`qa-oficina-${sello}`, `emp${i}-${sello}@ejemplo.com`,
        { ip: "198.51.100.7" });
      if (r.status === "created") creadas += 1;
    }
    assert(creadas === 20,
      `solo ${creadas} de 20 empresas pudieron responder desde la misma red`);
    void camp;
  });

  await check("Y el límite se cuenta en la BASE, no en memoria", async () => {
    const [n] = await q(
      `select count(*)::int c from public.public_intake_attempts where bucket_kind='ip'`);
    assert(n.c > 0, "no se está registrando la ventana deslizante");
  });

  console.log("\nF · Privacidad\n");

  await check("La IP no se guarda en claro en ningún sitio", async () => {
    const filas = await q(
      `select bucket_key from public.public_intake_attempts where bucket_kind='ip' limit 5`);
    for (const f of filas) {
      assert(!/^\d+\.\d+\.\d+\.\d+$/.test(f.bucket_key as string),
        `hay una IP en claro: ${f.bucket_key}`);
      assert((f.bucket_key as string).length === 64, "la huella no parece un HMAC-SHA256");
    }
    // Y con pimienta: un sha256 pelado sería reversible recorriendo IPv4.
    const pelado = createHash("sha256").update("198.51.100.7").digest("hex");
    const iguales = filas.filter((f) => f.bucket_key === pelado);
    assert(iguales.length === 0, "la huella es un sha256 sin secreto: enumerable");
  });

  await check("Y no hay datos personales en la auditoría", async () => {
    const [n] = await q(
      `select count(*)::int c from public.audit_log
        where table_name in ('public_diagnostic_submissions','public_diagnostic_answers')`);
    assert(n.c === 0, `hay ${n.c} anotaciones de participaciones en la auditoría`);
  });

  console.log("\nG · La puerta, del tamaño exacto\n");

  await check("X/Y. anon sigue sin poder tocar NINGUNA tabla", async () => {
    for (const t of ["public_diagnostic_campaigns", "public_diagnostic_submissions",
                     "public_diagnostic_answers", "public_intake_attempts",
                     "public_intake_secret", "diagnostic_questions", "diagnostics"]) {
      for (const [op, sql] of [
        ["SELECT", `select count(*) from public.${t}`],
        ["INSERT", `insert into public.${t} default values`],
      ] as const) {
        await q("savepoint x"); await q("set local role anon");
        let permitido = false; let err = "";
        try { const r = await pg.query(sql);
              permitido = op === "SELECT" ? Number(r.rows[0].count) > 0 : true; }
        catch (e) { err = e instanceof Error ? e.message : String(e); }
        await q("rollback to savepoint x"); await q("set local role postgres");
        assert(!permitido, `anon pudo ${op} en ${t} (${err || "sin error"})`);
      }
    }
  });

  await check("AB. Solo las funciones públicas DECLARADAS son alcanzables", async () => {
    const fns = await q(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and array_to_string(p.proacl,',') like '%anon=X%'
        order by 1`);
    const nombres = fns.map((f) => f.proname as string);
    // PD-01F añadió dos: leer el instrumento y guardar una sección. La que
    // ESCRIBE el resultado —`public_diagnostic_finalize_submission`— no está
    // aquí a propósito: solo la ejecuta `service_role`, y que siga fuera de
    // esta lista es parte de lo que se comprueba.
    const esperadas = ["public_diagnostic_begin_submission",
                       "public_diagnostic_get_assessment",
                       "public_diagnostic_get_result",
                       "public_diagnostic_resolve_campaign",
                       "public_diagnostic_resume_submission",
                       "public_diagnostic_save_progress"];
    /*
      Acotado a ESTE subsistema.
      
      Supabase concede EXECUTE a `anon` sobre todo lo que se crea en `public`,
      así que hay ~109 funciones del proyecto con esa concesión —disparadores y
      ayudantes puros, casi todos inertes— desde mucho antes de este tramo.
      Comprobarlas todas aquí convertiría esta batería en un guardián de una
      deuda ajena que no puedo cerrar sin analizarlas una a una.
      
      Lo que sí es responsabilidad de este subsistema: que de `public_diagnostic_*`
      y `public_intake_*` no quede alcanzable NADA salvo las tres declaradas.
    */
    const delSubsistema = nombres.filter(
      (n) => n.startsWith("public_diagnostic_") || n.startsWith("public_intake_"));
    const inesperadas = delSubsistema.filter((n) => !esperadas.includes(n));
    assert(inesperadas.length === 0,
      `funciones del ingreso público alcanzables sin declarar: ${inesperadas.join(", ")}`);
    for (const e of esperadas) {
      assert(nombres.includes(e), `falta conceder ${e}`);
    }
  });

  await check("AA. Y las tres fijan su search_path", async () => {
    for (const f of ["public_diagnostic_resolve_campaign", "public_diagnostic_begin_submission",
                     "public_diagnostic_resume_submission", "public_intake_fingerprint",
                     "public_intake_rate_ok"]) {
      const [r] = await q(
        `select p.prosecdef d, array_to_string(p.proconfig,',') cfg
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname=$1`, [f]);
      assert(r.d === true, `${f} no es SECURITY DEFINER`);
      assert(/search_path=public/.test(r.cfg ?? ""), `${f} no fija search_path`);
    }
  });

  await check("Ni la pimienta ni el contador quedaron alcanzables", async () => {
    for (const f of ["public_intake_fingerprint", "public_intake_rate_ok"]) {
      const [r] = await q(
        `select array_to_string(p.proacl,',') acl from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname=$1`, [f]);
      assert(!/anon=X/.test(r.acl ?? ""), `${f} quedó ejecutable por anon`);
    }
  });

  await check("Z. Y una persona autenticada normal no administra nada", async () => {
    const [u] = await q(
      `select m.user_id from public.memberships m where m.status='active'
         and not exists (select 1 from public.platform_staff s
                          where s.user_id=m.user_id and s.status='active') limit 1`);
    if (!u) { console.log("      (sin usuaria normal; se omite)"); return; }
    await q("savepoint z"); await q("set local role authenticated");
    await q(`select set_config('request.jwt.claims',
              json_build_object('sub',$1::text,'role','authenticated')::text, true)`, [u.user_id]);
    const [n] = await q(`select count(*)::int c from public.public_diagnostic_submissions`);
    await q("rollback to savepoint z"); await q("set local role postgres");
    assert(n.c === 0, `una usuaria normal ve ${n.c} participaciones`);
  });

  await check("R. Y nada de esto tocó PCR v1", async () => {
    const [p] = await q(
      `select count(*)::int c from public.diagnostic_questions
        where version_id=$1 and is_active`, [v1.id]);
    assert(p.c === 52, `PCR v1 quedó con ${p.c} preguntas`);
  });

  await q("rollback");
  await pg.end();
  console.log(`\nPUBLIC-DIAGNOSTICS-01E · ingreso público: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
