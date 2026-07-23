/**
 * Trazaloop · T9F.5B.1 · CORRECCIÓN DE LOS BLOQUEADORES PREVIOS A QA.
 *
 * Tres hallazgos de la revisión independiente del paquete T9F.5B:
 *   B1 · Los finalizers server-only resolvían el acceso comercial con
 *        `resolve_organization_module_access`, que depende de `auth.uid()`.
 *        Bajo service_role `auth.uid()` es NULL ⇒ toda finalización legítima
 *        habría fallado con MODULE_ACCESS_BLOCKED / not_member.
 *   B2 · Los archivos CPR/TrazaDocs seguían viajando dentro de FormData hacia
 *        Server Actions, cuyo límite por defecto (1 MB) hacía imposible A14.
 *   B3 · La política ante "tamaño físico > reserva" era inconsistente entre
 *        SQL (permitía ampliación) y TypeScript (exigía igualdad).
 *
 * NATURALEZA: pruebas PURAS y ESTRUCTURALES. No ejecutan PostgreSQL, no
 * ejercen RLS y no tocan Storage. NO demuestran que un ataque esté PROTEGIDO.
 *
 * Correr: npx tsx tests/unit/t9f5b1-pre-qa-correction.test.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  maxCprUploadFileBytes,
  validateCprUploadedObject,
} from "../../lib/domain/cpr-file-verification";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stripSql = (s: string) => s.replace(/--[^\n]*/g, "");

const MIG101 = stripSql(read("supabase/migrations/0101_t9f1_module_access_hardening.sql"));
const MIG100 = read("supabase/migrations/0100_organization_module_access_modes_and_demo_trial.sql");
const ACTION_EVIDENCES = read("server/actions/evidences.ts");
const ACTION_MASTER = read("server/actions/trazadocs-master.ts");
const VERIFY = read("server/actions/cpr-upload-verification.ts");
const DIRECT = read("lib/storage/direct-upload.ts");
const NEXT_CONFIG = read("next.config.ts");
const FORM_EVIDENCES = read("components/domain/evidences/forms.tsx");
const FORM_UPLOAD = read("components/domain/trazadocs/upload-file-document-form.tsx");
const FORM_REPLACE = read("components/domain/trazadocs/file-document-edit-forms.tsx");
const ADVERSARIAL = read("tests/rls/t9f5-adversarial-attacks.test.ts");
const DOMAIN = read("lib/domain/cpr-file-verification.ts");

function sqlFn(name: string): string {
  const head = `create or replace function public.${name}(`;
  const i = MIG101.indexOf(head);
  if (i === -1) throw new Error(`0101: no existe ${name}`);
  const j = MIG101.indexOf("create or replace function public.", i + head.length);
  return MIG101.slice(i, j === -1 ? MIG101.length : j);
}
function tsFn(source: string, name: string): string {
  const i = source.indexOf(`export async function ${name}`);
  if (i === -1) throw new Error(`no existe ${name}`);
  const j = source.indexOf("export async function", i + 10);
  return source.slice(i, j === -1 ? source.length : j);
}

// ===========================================================================
console.log("\nTrazaloop · T9F.5B.1 §B1 — auth.uid() frente a p_actor_id bajo service_role\n");

check("B1. Ningún finalizer server-only usa ya el resolver dependiente de auth.uid()", () => {
  for (const fn of [
    "finalize_evidence_attachment_server",
    "assert_trazadoc_finalize_preconditions",
  ]) {
    const body = sqlFn(fn);
    assert(
      !body.includes("resolve_organization_module_access("),
      `${fn}: no debe llamar al resolver que depende de auth.uid()`
    );
    assert(
      body.includes("resolve_module_access_for_actor("),
      `${fn}: debe resolver el acceso con el ACTOR EXPLÍCITO`
    );
    assert(
      /resolve_module_access_for_actor\([^)]*p_actor_id\)/.test(body.replace(/\s+/g, " ")),
      `${fn}: el actor real debe viajar como argumento`
    );
  }
});

check("B1. Los finalizers de TrazaDocs delegan en las precondiciones con actor", () => {
  for (const fn of [
    "finalize_trazadoc_file_document_initial_version_server",
    "replace_trazadoc_file_document_server",
  ]) {
    const body = sqlFn(fn);
    assert(
      body.includes("assert_trazadoc_finalize_preconditions(") && body.includes("p_actor_id"),
      `${fn}: pasa el actor explícito a las precondiciones`
    );
  }
});

check("B1. El helper valida actor, membresía ACTIVA y replica la semántica de 0100", () => {
  const fn = sqlFn("resolve_module_access_for_actor");
  const required: Array<[string, string]> = [
    ["actor_required", "el actor es obligatorio"],
    ["actor_not_found", "el actor debe existir en auth.users"],
    ["from public.memberships m", "comprueba la membresía explícitamente"],
    ["m.user_id = p_actor_id", "la membresía es la del ACTOR, no la de auth.uid()"],
    ["m.status = 'active'", "solo membresía ACTIVA"],
    ["not_member", "un no-miembro se rechaza igual que en 0100"],
    ["coming_soon", "módulo no funcional"],
    ["not_assigned", "módulo no asignado"],
    ["v_row.enabled", "enabled = true"],
    ["access_mode", "access_mode válido"],
    ["demo_expired", "Demo vencido"],
    ["access_expires_at", "vencimiento por la hora de la BD"],
  ];
  for (const [needle, why] of required) {
    assert(fn.includes(needle), `falta en el helper: ${why} (${needle})`);
  }
  // Solo el CUERPO de la función (el COMMENT ON sí menciona auth.uid() para
  // explicar por qué existe este helper).
  const body = fn.slice(fn.indexOf("as $$"), fn.indexOf("$$;"));
  assert(!body.includes("auth.uid()"), "el cuerpo del helper JAMÁS simula ni consulta auth.uid()");
});

check("B1. El helper es server-only y 0100 queda intacto", () => {
  assert(
    MIG101.includes(
      "revoke all on function public.resolve_module_access_for_actor(uuid, text, uuid) from public, anon, authenticated;"
    ),
    "el helper debe estar revocado a authenticated"
  );
  assert(
    MIG101.includes(
      "grant execute on function public.resolve_module_access_for_actor(uuid, text, uuid) to service_role;"
    ),
    "solo service_role"
  );
  // El resolver de 0100 no se redefine ni se debilita en 0101.
  assert(
    !MIG101.includes("create or replace function public.resolve_organization_module_access"),
    "0101 no redefine el resolver de 0100"
  );
  assert(
    MIG100.includes("if not (is_org_member(p_organization_id) or is_platform_superadmin()) then"),
    "0100 conserva su guard original para las llamadas de authenticated"
  );
});

// ===========================================================================
console.log("\nTrazaloop · T9F.5B.1 §B2 — transporte: carga directa sin File en Server Actions\n");

check("B2. Ninguna Server Action CPR/TrazaDocs recibe ya un File ni un FormData de carga", () => {
  for (const [label, src, fns] of [
    ["evidencias", ACTION_EVIDENCES, ["beginEvidenceUploadAction", "finalizeEvidenceUploadAction"]],
    [
      "trazadocs",
      ACTION_MASTER,
      [
        "beginFileDocumentUploadAction",
        "finalizeFileDocumentUploadAction",
        "beginFileDocumentReplaceAction",
        "finalizeFileDocumentReplaceAction",
      ],
    ],
  ] as const) {
    for (const fn of fns) {
      const body = tsFn(src, fn);
      assert(!/as File/.test(body), `${label}/${fn}: no debe extraer un File`);
      assert(!/formData\.get\("file"\)/.test(body), `${label}/${fn}: no debe leer el archivo del formulario`);
      assert(!/\.arrayBuffer\(\)/.test(body), `${label}/${fn}: los bytes no atraviesan la Server Action`);
      assert(!/\.upload\(/.test(body), `${label}/${fn}: el PUT no ocurre en la Server Action`);
    }
  }
});

check("B2. Begin recibe SOLO metadata y devuelve intentId, bucketId y objectPath", () => {
  assert(
    /file: \{ name: string; sizeBytes: number; mimeType: string \}/.test(ACTION_EVIDENCES),
    "evidencias: el contrato de begin describe metadata, no bytes"
  );
  assert(
    /file: \{ name: string; sizeBytes: number; mimeType: string \}/.test(ACTION_MASTER),
    "trazadocs: idem"
  );
  for (const [src, fn] of [
    [ACTION_EVIDENCES, "beginEvidenceUploadAction"],
    [ACTION_MASTER, "beginFileDocumentUploadAction"],
    [ACTION_MASTER, "beginFileDocumentReplaceAction"],
  ] as const) {
    const body = tsFn(src, fn);
    assert(body.includes("beginCprStorageUpload("), `${fn}: crea el intent durable`);
    assert(body.includes("intentId: begin.intent.intentId"), `${fn}: devuelve el intentId`);
    assert(body.includes("bucketId: begin.intent.bucketId"), `${fn}: devuelve el bucket`);
    assert(body.includes("objectPath: begin.intent.objectPath"), `${fn}: devuelve la ruta EXACTA`);
  }
});

check("B2. Finalize recibe SOLO el intentId: ni tamaño, ni MIME, ni bucket, ni ruta del cliente", () => {
  for (const [src, fn] of [
    [ACTION_EVIDENCES, "finalizeEvidenceUploadAction"],
    [ACTION_MASTER, "finalizeFileDocumentUploadAction"],
    [ACTION_MASTER, "finalizeFileDocumentReplaceAction"],
  ] as const) {
    const body = tsFn(src, fn);
    const signature = body.slice(0, body.indexOf(")"));
    assert(signature.includes("intentId: string"), `${fn}: recibe el intentId`);
    assert(!/sizeBytes|mimeType|bucketId|objectPath/.test(signature), `${fn}: no recibe datos físicos del cliente`);
    assert(body.includes("getOwnCprUploadIntent("), `${fn}: los datos salen del intent (server-only)`);
    assert(body.includes("verifyCprUploadedObject("), `${fn}: verifica el objeto físico`);
  }
});

check("B2. El intent solo se lee para su dueño y su organización (server-only)", () => {
  const db = read("lib/db/storage-intents.ts");
  const fn = db.slice(db.indexOf("export async function getOwnCprUploadIntent"));
  assert(fn.includes('.eq("created_by", actorId)'), "el intent debe pertenecer al actor");
  assert(fn.includes('.eq("organization_id", organizationId)'), "y a su organización activa");
  assert(fn.includes("createAdminClient()"), "la tabla está revocada a authenticated: lectura server-only");
});

check("B2. El PUT lo hace el navegador con la SESIÓN del usuario, contra la ruta del intent", () => {
  assert(DIRECT.includes('"use client"'), "el módulo de carga directa es de cliente");
  assert(DIRECT.includes("createBrowserClient()"), "usa la sesión autenticada (anon key + JWT)");
  assert(DIRECT.includes("upsert: false"), "un reemplazo es un objeto NUEVO, jamás un upsert (A03)");
  assert(
    /No se usa una signed upload URL|NO se usa una signed upload URL/.test(DIRECT),
    "queda documentado por qué no se usa URL firmada (no pasaría por la política INSERT)"
  );
  for (const [label, form] of [
    ["evidencias", FORM_EVIDENCES],
    ["trazadocs alta", FORM_UPLOAD],
    ["trazadocs reemplazo", FORM_REPLACE],
  ] as const) {
    assert(form.includes("uploadFileToIntentPath("), `${label}: el formulario sube directo a Storage`);
    assert(!/useActionState\((begin|upload|replace|create)/.test(form), `${label}: el archivo ya no va por useActionState`);
  }
});

check("B2. Compensación completa: fallo de PUT, de verificación, de finalize y abandono", () => {
  for (const [label, form] of [
    ["evidencias", FORM_EVIDENCES],
    ["trazadocs alta", FORM_UPLOAD],
    ["trazadocs reemplazo", FORM_REPLACE],
  ] as const) {
    assert(/cancel(Evidence|FileDocument)UploadAction\(/.test(form), `${label}: cancela si el PUT falla`);
  }
  assert(VERIFY.includes("compensateFailedCprUpload"), "existe la compensación compartida");
  const comp = VERIFY.slice(VERIFY.indexOf("export async function compensateFailedCprUpload"));
  assert(comp.includes("cancelCprStorageUpload("), "cancela la reserva");
  assert(comp.includes("resolveCprUploadIntentObject("), "intenta el retiro CONFIRMADO server-only");
  assert(
    /los bytes SIGUEN contando|siguen contando/.test(VERIFY),
    "sin confirmación, los bytes siguen contabilizados"
  );
  // Idempotencia: begin acepta idempotencyKey en los tres flujos.
  for (const [src, fn] of [
    [ACTION_EVIDENCES, "beginEvidenceUploadAction"],
    [ACTION_MASTER, "beginFileDocumentUploadAction"],
    [ACTION_MASTER, "beginFileDocumentReplaceAction"],
  ] as const) {
    assert(tsFn(src, fn).includes("idempotencyKey"), `${fn}: admite clave de idempotencia`);
  }
});

check("B2. next.config.ts NO eleva serverActions.bodySizeLimit", () => {
  assert(!/bodySizeLimit\s*:/.test(NEXT_CONFIG), "no debe reintroducirse el límite elevado");
  assert(!/serverActions\s*:\s*\{/.test(NEXT_CONFIG), "no debe reaparecer la configuración de serverActions");
});

check("B2. Secuencia lógica de tamaños admitidos por plan (2 MB, 10 MB, 22 MB, >25 MB, CPR >20 MB)", () => {
  const MB = 1024 * 1024;
  // Documentos TrazaDocs
  assert(2 * MB <= maxCprUploadFileBytes("trazadoc_initial", "demo")!, "2 MB en Demo: permitido");
  assert(10 * MB <= maxCprUploadFileBytes("trazadoc_initial", "demo")!, "10 MB en Demo: permitido (límite exacto)");
  assert(22 * MB > maxCprUploadFileBytes("trazadoc_initial", "demo")!, "22 MB en Demo: RECHAZADO");
  assert(22 * MB <= maxCprUploadFileBytes("trazadoc_initial", "full")!, "22 MB en Full: permitido");
  assert(22 * MB <= maxCprUploadFileBytes("trazadoc_replace", "extra")!, "22 MB en Extra: permitido");
  assert(26 * MB > maxCprUploadFileBytes("trazadoc_initial", "full")!, "26 MB en Full: RECHAZADO");
  // Evidencia CPR conserva su máximo propio
  assert(20 * MB <= maxCprUploadFileBytes("evidence", "full")!, "20 MB de evidencia CPR: permitido");
  assert(21 * MB > maxCprUploadFileBytes("evidence", "extra")!, "21 MB de evidencia CPR: RECHAZADO");
});

// ===========================================================================
console.log("\nTrazaloop · T9F.5B.1 §B3 — política canónica: tamaño físico frente a reserva\n");

check("B3. POLÍTICA CANÓNICA = RECHAZO ESTRICTO, idéntica en SQL y TypeScript", () => {
  // SQL: ambos finalizers exigen igualdad exacta.
  for (const fn of ["finalize_evidence_attachment_server", "assert_trazadoc_finalize_preconditions"]) {
    const body = sqlFn(fn);
    assert(
      /if p_real_size_bytes <> v_intent\.expected_size_bytes then/.test(body),
      `${fn}: exige tamaño real == reservado`
    );
    assert(body.includes("OBJECT_SIZE_MISMATCH"), `${fn}: rechaza con OBJECT_SIZE_MISMATCH`);
  }
  // TypeScript: la misma regla, sin ampliación.
  assert(
    validateCprUploadedObject({
      expectedSizeBytes: 1024 * 1024,
      expectedMimeType: "application/pdf",
      realSizeBytes: 5 * 1024 * 1024,
      realMimeType: "application/pdf",
    }) !== null,
    "TS: un objeto mayor que la reserva se rechaza"
  );
  assert(
    validateCprUploadedObject({
      expectedSizeBytes: 4096,
      expectedMimeType: "application/pdf",
      realSizeBytes: 2048,
      realMimeType: "application/pdf",
    }) !== null,
    "TS: un objeto menor que la reserva también se rechaza (igualdad estricta)"
  );
  assert(
    validateCprUploadedObject({
      expectedSizeBytes: 4096,
      expectedMimeType: "application/pdf",
      realSizeBytes: 4096,
      realMimeType: "application/pdf",
    }) === null,
    "TS: la carga legítima (real == reservado) pasa"
  );
  // No debe quedar rastro de la política de ampliación.
  assert(
    !/amplía la reserva|ampliación de reserva en finalize/i.test(DOMAIN),
    "el dominio no describe una política de ampliación"
  );
});

check("B3. Un objeto mayor que su reserva NO concede capacidad ficticia aunque no se finalice", () => {
  const snap = sqlFn("module_storage_snapshot");
  // Las reservas ACTIVAS y los intents no resueltos cuentan por el MAYOR
  // entre el tamaño declarado y el FÍSICO real leído de storage.objects.
  const occurrences = (snap.match(/greatest\(\s*g\.expected_size_bytes/g) ?? []).length;
  assert(occurrences >= 2, "el snapshot debe usar greatest(declarado, físico) en reservas y en no resueltos");
  assert(
    (snap.match(/left join storage\.objects o/g) ?? []).length >= 2,
    "el snapshot debe leer el tamaño físico real de storage.objects"
  );
  assert(
    snap.includes("(o.metadata ->> 'size')::bigint"),
    "el tamaño físico se lee de la metadata del objeto"
  );
});

check("B3. El escenario 1 MB reservado / 5 MB físico está preparado para QA", () => {
  assert(
    ADVERSARIAL.includes('scenario("A06b"'),
    "debe existir el escenario de contabilidad sin finalize"
  );
  const i = ADVERSARIAL.indexOf('scenario("A06b"');
  const body = ADVERSARIAL.slice(i, ADVERSARIAL.indexOf('scenario("A07"', i));
  assert(/1 \* 1024 \* 1024|1024 \* 1024/.test(body), "reserva de 1 MB");
  assert(/5 \* 1024 \* 1024/.test(body), "objeto físico de 5 MB");
  assert(
    /no ejecuta finalize|sin finalize|NO se finaliza/i.test(body),
    "el escenario NO ejecuta finalize"
  );
  assert(
    /storage_used_bytes|storage_reserved_bytes|capacidad/i.test(body),
    "consulta uso y capacidad"
  );
});

// ===========================================================================
console.log("\nTrazaloop · T9F.5B.1 §B4 — suite adversarial sin falsos positivos\n");

check("B4. A08 exige la CAUSA concreta y falla ante un not_member por service_role", () => {
  const i = ADVERSARIAL.indexOf('scenario("A08"');
  assert(i !== -1, "existe A08");
  const body = ADVERSARIAL.slice(i, ADVERSARIAL.indexOf('scenario("A09"', i));
  assert(
    /not_member/.test(body),
    "A08 debe detectar explícitamente un falso not_member"
  );
  assert(
    /QUOTA|FILE_SIZE/.test(body),
    "A08 debe exigir la causa esperada (cuota o tope del plan actual)"
  );
});

check("B4. A14 prueba también el finalize, no solo begin y upload", () => {
  const i = ADVERSARIAL.indexOf('scenario("A14"');
  const body = ADVERSARIAL.slice(i);
  assert(
    /finalize_trazadoc_file_document_initial_version_server/.test(body),
    "A14 debe llegar hasta la finalización real"
  );
  assert(/22 \* 1024 \* 1024/.test(body), "archivo determinista de 22 MB");
});

check("B4. A07 queda preparada para ejercer la verificación de firma del servidor", () => {
  const i = ADVERSARIAL.indexOf('scenario("A07"');
  const body = ADVERSARIAL.slice(i, ADVERSARIAL.indexOf('scenario("A08"', i));
  assert(
    /firma|signature/i.test(body),
    "A07 debe describir la verificación de firma binaria"
  );
  assert(
    /Server Action|flujo real/i.test(body),
    "A07 debe indicar que QA ejerza el flujo real de la aplicación"
  );
});

// ===========================================================================
console.log("\nTrazaloop · T9F.5B.1 §B5 — limpieza del paquete y alcance\n");

check("B5. El paquete no incluye artefactos accidentales", () => {
  // tsconfig.tsbuildinfo lo regenera cualquier `tsc` local: lo que se exige es
  // que esté IGNORADO y excluido del empaquetado, no que nunca exista.
  const ignore = read(".gitignore");
  assert(/tsbuildinfo/.test(ignore), ".gitignore debe cubrir tsbuildinfo");
  const stray = readdirSync(process.cwd()).filter((f) => f.startsWith("-name"));
  assert(stray.length === 0, `archivos accidentales presentes: ${stray.join(", ")}`);
  assert(/^-name\*$/m.test(ignore), ".gitignore debe cubrir los artefactos de `find` mal citados");
});

check("B5. Sigue sin existir 0102 y 0100 no se modifica", () => {
  const files = readdirSync(join(process.cwd(), "supabase/migrations"));
  assert(!files.some((f) => f.startsWith("0102")), "no debe existir ninguna migración 0102");
  assert(
    MIG100.includes("create or replace function public.resolve_organization_module_access"),
    "0100 conserva su resolver original"
  );
});

check("B5. Textiles no se modifica: conserva su transporte y su tope propio", () => {
  const textilesForm = read("components/domain/textiles/evidence-upload-form.tsx");
  assert(textilesForm.includes("uploadFileDirectly("), "Textiles conserva su PUT con URL firmada");
  assert(!textilesForm.includes("uploadFileToIntentPath("), "Textiles no adopta el transporte CPR");
  const beginTex = sqlFn("begin_textile_evidence_upload_v2");
  assert(beginTex.includes("20 * 1024 * 1024"), "Textiles conserva su tope propio de 20 MB");
});

// ---------------------------------------------------------------------------
console.log(`\nT9F.5B.1 unit/estructural: ${passed} ✔, ${failed} ✘\n`);
if (failed > 0) {
  console.error("Resultado: en rojo. Los bloqueadores previos a QA NO están cerrados.");
  process.exit(1);
}
console.log(
  "Bloqueadores corregidos en código. La clasificación de A01–A18 sigue dependiendo\n" +
    "de la ejecución adversarial T9F.5C sobre Supabase QA real.\n"
);
