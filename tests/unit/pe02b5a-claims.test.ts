/**
 * Trazaloop · PE-02B5A · Lo que las respuestas de seguridad NO pueden decir.
 *
 * Una prueba de redacción es rara y aquí está justificada: estas quince
 * respuestas y la política de privacidad son afirmaciones públicas sobre
 * seguridad. Si alguien «mejora» una quitándole una salvedad, la convierte en
 * falsa — y eso no lo detecta ninguna otra prueba.
 *
 * Correr: npm run test:pe02b5a-claims
 */
import { readFileSync, existsSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const leer = (p: string) => readFileSync(p, "utf8");
const SEMILLA = leer("scripts/pe02b5a/seed-drafts.sql");
const POLITICA = leer("docs/legal/V1.1.0_PRIVACY_POLICY_SUCCESSOR_DRAFT.md");
const PROVEEDOR = leer("docs/platform-experience/PE_02B5A_AI_PROVIDER_POLICY.md");
const AUDITORIA = leer("docs/platform-experience/PE_02B5A_SECURITY_REVALIDATION.md");
/** Solo el texto que se va a leer: sin los comentarios del guion. */
const TEXTO_FAQ = SEMILLA.replace(/^\s*--.*$/gm, "");

console.log("\nPE-02B5A · Lo que no se puede afirmar\n");

// ===========================================================================
console.log("A · Sin ficción de marketing");
// ===========================================================================

check("A1. Ninguna respuesta promete lo imposible", () => {
  const prohibidas = [
    "100% segur", "100 % segur", "totalmente segur", "completamente segur",
    "imposible de vulnerar", "imposible de hackear", "inviolable",
    "riesgo cero", "sin riesgo", "grado militar", "military",
    "cifrado de extremo a extremo", "extremo a extremo",
    "conocimiento cero", "zero-knowledge", "privacidad absoluta",
    "nunca podrá", "jamás podrá acceder nadie",
  ];
  // Negarlas está bien —«no afirmamos cifrado de extremo a extremo» es
  // exactamente lo que hay que decir—; lo que no se puede es prometerlas.
  const t = TEXTO_FAQ.toLowerCase();
  for (const p of prohibidas) {
    const i = t.indexOf(p.toLowerCase());
    if (i < 0) continue;
    const contexto = t.slice(Math.max(0, i - 90), i + 20);
    assert(/\bno\b|tampoco|sin |ninguna medida/.test(contexto),
      `una respuesta promete «${p}»: «${contexto.trim()}»`);
  }
});

check("A2. Ni certificaciones que no existen", () => {
  const t = TEXTO_FAQ.toLowerCase();
  for (const p of ["soc 2", "iso 27001", "iso27001", "pci dss", "hipaa",
    "certificación de seguridad", "auditoría externa de seguridad",
    "prueba de intrusión", "pentest"]) {
    // Se admite NEGARLAS: «no tenemos certificaciones propias».
    const i = t.indexOf(p.toLowerCase());
    if (i < 0) continue;
    const contexto = t.slice(Math.max(0, i - 80), i + 40);
    assert(/\bno\b|tampoco|sin /.test(contexto),
      `se afirma «${p}» sin negarlo: «${contexto.trim()}»`);
  }
});

check("A3. Ni funciones de autenticación que no están", () => {
  const t = TEXTO_FAQ.toLowerCase();
  for (const p of ["segundo factor", "doble factor", "autenticación de dos",
    "inicio de sesión único"]) {
    const i = t.indexOf(p);
    if (i < 0) continue;
    const contexto = t.slice(Math.max(0, i - 90), i + 40);
    assert(/no ofrece|no hay|no dispone|no implementa|no tenemos/.test(contexto),
      `se menciona «${p}» sin decir que no existe`);
  }
});

// ===========================================================================
console.log("\nB · Las salvedades que no se pueden quitar");
// ===========================================================================

check("B1. La respuesta del equipo de Trazaloop lleva su salvedad", () => {
  const i = TEXTO_FAQ.indexOf("seguridad_equipo_trazaloop");
  assert(i > 0, "falta la respuesta sobre el equipo de Trazaloop");
  const respuesta = TEXTO_FAQ.slice(i, TEXTO_FAQ.indexOf("seguridad_archivos"));
  assert(/en la operación normal/i.test(respuesta),
    "la respuesta afirma en absoluto, sin acotar a la operación normal");
  assert(/infraestructura/i.test(respuesta),
    "no se dice que la administración de infraestructura implica acceso");
  assert(/respaldo/i.test(respuesta), "no se menciona que los respaldos contienen todo");
  assert(/verified_with_qualifier/.test(respuesta),
    "no está marcada como verificada CON salvedad");
});

check("B2. Y NO dice que nunca puedan acceder", () => {
  const t = TEXTO_FAQ.toLowerCase();
  for (const p of ["ni los administradores de trazaloop pueden acceder",
    "nunca pueden acceder", "no pueden acceder nunca", "ningún empleado puede acceder"]) {
    assert(!t.includes(p), `se afirma el absoluto «${p}»`);
  }
});

check("B3. Ni que todo acceso excepcional quede auditado", () => {
  const t = TEXTO_FAQ.toLowerCase();
  for (const p of ["todo acceso queda auditado", "todo acceso técnico queda",
    "cada acceso queda registrado", "todos los accesos quedan registrados"]) {
    assert(!t.includes(p), `se afirma «${p}» y no está verificado`);
  }
  // Lo que sí se dice, y con esas palabras.
  assert(/operaciones que se hacen a través de la plataforma quedan registradas/i
    .test(TEXTO_FAQ), "no se dice qué SÍ queda registrado");
});

check("B4. La respuesta del aislamiento admite lo que la empresa publica", () => {
  const i = TEXTO_FAQ.indexOf("seguridad_otra_empresa");
  const respuesta = TEXTO_FAQ.slice(i, TEXTO_FAQ.indexOf("seguridad_como_separa"));
  assert(/pasaporte|encuesta|compart/i.test(respuesta),
    "la respuesta del aislamiento no admite las superficies que la empresa publica");
  assert(!/nadie fuera de tu empresa (puede )?ve/i.test(respuesta),
    "se afirma el absoluto que sería falso al compartir un pasaporte");
});

// ===========================================================================
console.log("\nC · El proveedor de IA");
// ===========================================================================

check("C1. La retención se dice como «hasta», con sus excepciones", () => {
  const i = TEXTO_FAQ.indexOf("seguridad_retencion_proveedor");
  const respuesta = TEXTO_FAQ.slice(i, TEXTO_FAQ.indexOf("seguridad_modelo_sin_base"));
  assert(/hasta 30 días|HASTA 30 DÍAS/i.test(respuesta),
    "no se dice «hasta 30 días»");
  assert(/salvo que|excepcion/i.test(respuesta), "no se dicen las excepciones");
  assert(!/elimina inmediatamente|borra inmediatamente|no conserva nada/i.test(respuesta),
    "se promete borrado inmediato");
});

check("C2. `store:false` NO se describe como retención cero", () => {
  assert(/no (es|equivale) (lo mismo que |a )?un acuerdo de retención cero|no es lo mismo que un acuerdo de retención cero/i
    .test(TEXTO_FAQ), "no se aclara que pedir que no se almacene no es retención cero");
  const t = TEXTO_FAQ.toLowerCase();
  assert(!/retención cero (contratada|garantizada)/.test(t),
    "se afirma tener retención cero contratada");
  // Y el documento del proveedor lo deja escrito con la cita oficial.
  assert(/ZDR implica `store:false`, pero `store:false` NO implica ZDR/.test(PROVEEDOR),
    "el documento del proveedor no distingue ZDR de store:false");
});

check("C3. El entrenamiento se atribuye al proveedor, no a nosotros", () => {
  const i = TEXTO_FAQ.indexOf("seguridad_entrenamiento_modelos");
  const respuesta = TEXTO_FAQ.slice(i, TEXTO_FAQ.indexOf("seguridad_retencion_proveedor"));
  assert(/su documentación oficial|documentación oficial del proveedor/i.test(respuesta),
    "no se atribuye la afirmación al proveedor");
  assert(/salvo que el cliente lo autorice/i.test(respuesta),
    "se omite la salvedad del «salvo que se autorice»");
  assert(/external_policy_verification_required/.test(respuesta),
    "no está marcada como pendiente de verificación externa");
  // Y no se afirma el ajuste de NUESTRA cuenta.
  assert(!/Trazaloop no ha activado|no hemos activado el uso/i.test(respuesta),
    "se afirma el ajuste de la cuenta, que no consta");
});

check("C4. La fuente es oficial, y lleva fecha", () => {
  assert(/developers\.openai\.com/.test(TEXTO_FAQ), "no se cita la fuente oficial");
  assert(/2026-08-31/.test(TEXTO_FAQ), "no se fecha la comprobación");
  for (const malo of ["reddit", "medium.com", "blog", "stackoverflow"]) {
    assert(!TEXTO_FAQ.toLowerCase().includes(malo), `se cita una fuente no oficial: ${malo}`);
  }
});

check("C5. Y el documento del proveedor dice qué NO se pudo comprobar", () => {
  assert(/403/.test(PROVEEDOR), "no se dice que las páginas del encargo no respondieron");
  assert(/HUMAN_CONFIRMATION_REQUIRED/.test(PROVEEDOR),
    "no se marca lo que depende de una persona");
  assert(/no lleva fecha de última actualización/i.test(PROVEEDOR),
    "no se advierte que la página del proveedor no lleva fecha propia");
});

// ===========================================================================
console.log("\nD · Lo que la IA no hace");
// ===========================================================================

check("D1. Se afirma que el modelo no accede a la base", () => {
  assert(/no se conecta a la base de datos|no tiene acceso a la base/i.test(TEXTO_FAQ),
    "no se afirma que el modelo no accede a la base");
});

check("D2. Y que no decide nada formal", () => {
  const i = TEXTO_FAQ.indexOf("seguridad_ia_no_decide");
  const respuesta = TEXTO_FAQ.slice(i, TEXTO_FAQ.indexOf("seguridad_anonimato"));
  for (const p of ["aprueba", "cierra", "conformidad", "proveedores"]) {
    assert(respuesta.toLowerCase().includes(p), `no se dice que no ${p}`);
  }
});

check("D3. El anonimato se acota al modo anónimo", () => {
  const i = TEXTO_FAQ.indexOf("seguridad_anonimato");
  const respuesta = TEXTO_FAQ.slice(i, TEXTO_FAQ.indexOf("seguridad_publicar"));
  assert(/campaña identificada|modo anónimo de campaña/i.test(respuesta),
    "no se acota: parecería que toda encuesta es anónima");
});

// ===========================================================================
console.log("\nE · La política de privacidad sucesora");
// ===========================================================================

check("E1. Es un borrador y lo dice", () => {
  assert(/BORRADOR SUCESOR/.test(POLITICA), "no se declara borrador");
  assert(/No está vigente|no está vigente/.test(POLITICA), "no dice que no está vigente");
  assert(/\*\*Versión comercial:\*\* 1\.1/.test(POLITICA), "no declara la versión sucesora");
});

check("E2. No inventa identidad legal · la hereda de la v1.0 aprobada", () => {
  const aprobada = leer("docs/legal/V1.0.0_PRIVACY_AND_DATA_PROCESSING_POLICY_APPROVED.md");
  for (const dato of ["901835846-6", "contacto@idendi.org",
    "CORPORACIÓN INSTITUTO PARA EL DESARROLLO DEL ENTRETENIMIENTO DIGITAL"]) {
    assert(aprobada.includes(dato), `la v1.0 no traía «${dato}»`);
    assert(POLITICA.includes(dato), `la sucesora perdió «${dato}»`);
  }
  assert(!/\[TODO\]|\[PENDIENTE\]|XXXX|placeholder/i.test(POLITICA),
    "la sucesora tiene marcadores de relleno");
});

check("E3. Cubre los módulos que existen, y no los que no", () => {
  for (const m of ["Trazaloop CPR", "Trazaloop Textiles", "Trazaloop Quality",
    "Trazaloop Intelligence"]) {
    assert(POLITICA.includes(m), `la sucesora no menciona ${m}`);
  }
  assert(!/Trazaloop Construcción/.test(POLITICA),
    "la sucesora anuncia un módulo que no opera");
});

check("E4. Separa las tres capas de la IA", () => {
  const i = POLITICA.indexOf("## 18. Trazaloop Intelligence");
  assert(i > 0, "no hay sección de Intelligence");
  const seccion = POLITICA.slice(i, POLITICA.indexOf("## 19."));
  assert(/18\.1 Lo que hace la Corporación/.test(seccion), "falta la capa de Trazaloop");
  assert(/18\.2 Cómo está construida/.test(seccion), "falta la capa de la arquitectura");
  assert(/18\.3 Lo que hace el proveedor externo/.test(seccion), "falta la capa del proveedor");
  assert(!/La IA protege tus datos/i.test(POLITICA),
    "se colapsan las tres capas en una frase vacía");
});

check("E5. Y nombra al proveedor de IA entre los encargados", () => {
  const i = POLITICA.indexOf("## 11. Encargados");
  const seccion = POLITICA.slice(i, POLITICA.indexOf("## 12."));
  assert(/inteligencia artificial/i.test(seccion),
    "el proveedor de IA no figura entre los encargados — era el hueco de la v1.0");
  for (const p of ["Supabase", "Vercel"]) {
    assert(seccion.includes(p), `desapareció ${p} de los encargados`);
  }
});

check("E6. Dice lo que NO hay, en vez de callarlo", () => {
  // Sin el modificador de línea completa: la base del repositorio compila a
  // una versión de ECMAScript que no lo admite.
  const plano2 = POLITICA.replace(/\s+/g, " ");
  assert(/no ofrece hoy[^.]*segundo factor|segundo factor de autenticación/i.test(plano2),
    "no se advierte que no hay segundo factor");
  assert(/no implementa cifrado propio|no afirma/i.test(POLITICA),
    "no se aclara de quién es el cifrado");
  // El texto va justificado a 76 columnas, así que la frase se parte en dos
  // líneas: se compara sobre el texto con los saltos normalizados.
  const plano = POLITICA.replace(/\s+/g, " ");
  assert(/no declara\s+certificaciones de seguridad propias/i.test(plano),
    "no se dice que no hay certificaciones propias");
});

check("E7. Y admite lo que una empresa publica", () => {
  assert(/## 19\. Información que una empresa decide hacer pública/.test(POLITICA),
    "la sucesora no trata las superficies públicas");
  assert(/no es una excepción de seguridad|Esto no es una excepción/i.test(POLITICA),
    "no se aclara que compartir es una función, no un fallo");
});

// ===========================================================================
console.log("\nF · Procedencia y gobierno");
// ===========================================================================

check("F1. Cada respuesta dice en qué se apoya", () => {
  const llamadas = SEMILLA.split("select pg_temp.sembrar_faq_borrador(").slice(1);
  assert(llamadas.length === 15, `hay ${llamadas.length} respuestas y son 15`);
  for (const l of llamadas) {
    assert(/PE-02B5A|AI_PROVIDER_POLICY/.test(l),
      "una respuesta no cita dónde se comprobó lo que afirma");
  }
});

check("F2. La auditoría clasifica cada afirmación", () => {
  for (const estado of ["VERIFIED", "VERIFIED_WITH_QUALIFIER", "NOT_VERIFIED",
    "MUST_NOT_CLAIM", "EXTERNAL_POLICY_VERIFIED", "HUMAN_CONFIRMATION_REQUIRED"]) {
    assert(AUDITORIA.includes(estado), `la auditoría no usa el estado «${estado}»`);
  }
});

check("F3. Y vuelve a medir en vez de citar a PE-02A", () => {
  assert(/Medido el 2026-08-31/.test(AUDITORIA), "la auditoría no dice cuándo se midió");
  assert(/No se reutilizaron los números de PE-02A/i.test(AUDITORIA),
    "no queda dicho que se volvió a medir");
  assert(/289/.test(AUDITORIA) && /643/.test(AUDITORIA),
    "la auditoría no trae las medidas de hoy");
});

check("F4. El guion NO publica nada", () => {
  assert(!/faq_publish_entry|legal_publish_document|help_publish/.test(SEMILLA),
    "el guion de siembra publica contenido");
  assert(/'draft'/.test(SEMILLA), "el guion no crea borradores");
  assert(!/insert into public\.faq_entry_revisions/.test(SEMILLA),
    "el guion escribe revisiones a mano");
  assert(/status = 'draft'/.test(SEMILLA) || /nunca se toca el estado/i.test(SEMILLA),
    "el guion podría cambiar el estado de algo ya publicado");
});

check("F5. Y las confirmaciones humanas están listadas", () => {
  const p = "docs/platform-experience/PE_02B5A_HUMAN_CONFIRMATIONS.md";
  assert(existsSync(p), "no existe el documento de confirmaciones humanas");
  const doc = leer(p);
  for (const tema of ["proveedor", "entrenamiento", "retención"]) {
    assert(doc.toLowerCase().includes(tema), `no se pide confirmar «${tema}»`);
  }
});

console.log(`\nPE-02B5A · afirmaciones: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
