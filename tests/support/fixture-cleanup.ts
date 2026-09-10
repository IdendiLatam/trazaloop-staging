import type { SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClientCtor } from "pg";
import type { Client as PgClient } from "pg";

/**
 * Trazaloop · TEST-HYGIENE-01 · Que una suite se lleve lo que trajo.
 *
 * EL DEFECTO QUE ESTO CIERRA, Y LO QUE COSTÓ
 *
 * `mp0184` y `mp0185` limpiaban con una lista de borrados escrita a mano, en un
 * orden que no puede funcionar, y sin mirar el resultado de ninguno. Medido:
 *
 *   mp0184 → +6 organizaciones, +6 usuarios, +6 suscripciones, +6 periodos,
 *            +6 pagos, +6 intentos, +6 presupuestos, +6 medios de pago
 *   mp0185 → +6 organizaciones, +6 usuarios, +1 suscripción, +1 periodo…
 *
 * Y es UNA sola causa con cuatro síntomas encadenados: las filas de facturación
 * no se borran → la organización no se puede borrar → el perfil tampoco →
 * `auth.admin.deleteUser` devuelve 500. Comprobado: al intentar borrar un
 * usuario que quedó vivo, seguían apuntando a su perfil `organizations`,
 * `organization_subscriptions`, `subscription_plan_history`,
 * `billing_subscriptions`, `billing_quotes` y `billing_checkout_intents`.
 *
 * No es un detalle de orden: es que NADIE MIRABA. `supabase-js` devuelve el
 * error en el resultado, así que un `delete()` que falla es indistinguible de
 * uno que funciona si no se lee. Esa basura acabó rompiendo una prueba de otro
 * tramo tres sprints después —`PE-05B6D · A3` contaba cobros de empresas
 * ajenas— y costó dos series de diez ejecuciones clasificarlo.
 *
 * CÓMO LIMPIA ESTO
 *
 * No con una lista. Con el GRAFO de claves ajenas que la propia base declara,
 * punto de retorno por tabla y repitiendo mientras se avance: el orden lo decide
 * Postgres, no una lista que caduca con la próxima migración. Sin `TRUNCATE` y
 * sin desactivar restricciones globalmente.
 *
 * Y devuelve lo que sobrevivió, para que la suite pueda ponerse ROJA por su
 * propia basura en vez de dejarla para el siguiente.
 */

export type Fixtures = {
  /** Las organizaciones que creó la suite. */
  orgs: string[];
  /** Los usuarios de Auth que creó la suite. */
  personas: string[];
  /** Las tasas de cambio sintéticas que abrió. Se RETIRAN, no se borran: 0182
   *  no deja borrar historia financiera, ni siendo de prueba. */
  fxIds?: string[];
};

export type Residuo = {
  organizaciones: number;
  personas: number;
  porTabla: Record<string, number>;
  fxActivas: number;
  /** Lo que no se pudo borrar, con su motivo. Vacío = limpieza completa. */
  problemas: string[];
};

/**
 * Lo que hay que soltar ANTES del barrido, o ningún orden funciona.
 *
 * Las cuatro primeras son referencias circulares: un periodo apunta a su pago y
 * un pago a su periodo, un presupuesto a su suscripción y un intento a la misma.
 *
 * La última no es circular, es un invariante DIFERIDO: `billing_subscriptions`
 * tiene un disparador que al CONFIRMAR exige que toda suscripción viva tenga
 * periodo. Borrando los periodos dentro de la misma transacción, cualquier
 * suscripción que sobreviva hace saltar `SUBSCRIPTION_WITHOUT_PERIOD` justo en
 * el `commit` y tumba la limpieza entera. Pasarlas a `ended` —que no es un
 * estado vivo— desactiva esa comprobación sin tocar la regla, y son filas de
 * fixture que van a desaparecer dos líneas más abajo.
 */
const SOLTAR = [
  "update public.billing_subscriptions set status = 'ended' where organization_id = any($1::uuid[])",
  "update public.billing_subscription_periods set settled_payment_id = null where organization_id = any($1::uuid[])",
  "update public.billing_quotes set subscription_id = null where organization_id = any($1::uuid[])",
  "update public.billing_checkout_intents set billing_subscription_id = null where organization_id = any($1::uuid[])",
  "update public.billing_subscriptions set billing_provider_plan_id = null where organization_id = any($1::uuid[])",
  "update public.quality_positions set parent_position_id = null where organization_id = any($1::uuid[])",
];

/**
 * Borra todo lo que cuelga de esas organizaciones, las organizaciones, y las
 * personas de Auth. Devuelve lo que quedó.
 *
 * El disparador de `billing_provider_cycles` es append-only y no deja borrar ni
 * al propietario: se baja SOLO dentro de esta transacción y solo para los
 * fixtures propios, y se vuelve a subir antes de confirmar. Sin eso, una suite
 * que reconcilie un ciclo no puede limpiar lo suyo.
 */
export async function limpiarFixtures(
  pg: PgClient, admin: SupabaseClient, fixtures: Fixtures
): Promise<Residuo> {
  const { orgs, personas, fxIds = [] } = fixtures;
  const problemas: string[] = [];

  if (orgs.length > 0) {
    const { rows: conOrg } = await pg.query(
      `select c.relname as tabla from pg_constraint k
         join pg_class c on c.oid = k.conrelid
         join pg_class r on r.oid = k.confrelid
         join pg_namespace n on n.oid = c.relnamespace
        where k.contype = 'f' and n.nspname = 'public'
          and r.relname = 'organizations' and c.relname <> 'organizations'`);
    const tablas: string[] = conOrg.map((r: { tabla: string }) => r.tabla);

    await pg.query("begin");
    const tieneCiclos = await pg.query(
      "select to_regclass('public.billing_provider_cycles') as t");
    const conCiclos = tieneCiclos.rows[0].t !== null;
    if (conCiclos) {
      await pg.query(`alter table public.billing_provider_cycles
                        disable trigger billing_provider_cycle_is_append_only_trg`);
    }

    for (const q of SOLTAR) {
      await pg.query("savepoint p");
      try { await pg.query(q, [orgs]); await pg.query("release savepoint p"); }
      catch { await pg.query("rollback to savepoint p"); }
    }

    let quedan = [...tablas];
    for (let vuelta = 0; vuelta < 12 && quedan.length > 0; vuelta += 1) {
      const fallaron: string[] = [];
      for (const t of quedan) {
        await pg.query("savepoint s");
        try {
          await pg.query(`delete from public.${t} where organization_id = any($1::uuid[])`, [orgs]);
          await pg.query("release savepoint s");
        } catch { await pg.query("rollback to savepoint s"); fallaron.push(t); }
      }
      if (fallaron.length === quedan.length) break;
      quedan = fallaron;
    }

    await pg.query("savepoint o");
    try {
      await pg.query("delete from public.organizations where id = any($1::uuid[])", [orgs]);
      await pg.query("release savepoint o");
    } catch (e) {
      await pg.query("rollback to savepoint o");
      problemas.push(`organizations: ${(e as Error).message.slice(0, 120)}`);
    }

    if (conCiclos) {
      await pg.query(`alter table public.billing_provider_cycles
                        enable trigger billing_provider_cycle_is_append_only_trg`);
    }
    await pg.query("commit");
  }

  // --- Las personas, y por qué no basta con `deleteUser` ---------------------
  //
  // Van DESPUÉS de la organización: mientras su perfil esté referenciado,
  // `deleteUser` devuelve 500 y el usuario sobrevive.
  //
  // Pero hay filas que NO cuelgan de ninguna organización y sí de la persona.
  // TEST-HYGIENE-02 lo midió: ocho suites dejaban miles de usuarios huérfanos y
  // la causa era UNA sola en las ocho — `user_legal_acceptances`, dos filas por
  // persona, porque quien crea una empresa acepta los documentos legales. Nadie
  // las borraba, así que el 500 era inevitable y nadie miraba el resultado.
  //
  // Se resuelve por el CATÁLOGO, no por una lista: se borran las filas de las
  // tablas cuya clave ajena a `profiles` se llama literalmente `user_id`, que
  // son las que pertenecen a la persona y no a otra cosa. Las columnas de
  // autoría —`created_by`, `assigned_by`, `published_by`…— NO se tocan: esas
  // filas son de una organización, no del usuario, y borrarlas por el autor
  // destruiría datos ajenos.
  if (personas.length > 0) {
    const { rows: propias } = await pg.query(
      `select c.relname as tabla, a.attname as columna
         from pg_constraint k
         join pg_class c on c.oid = k.conrelid
         join pg_class r on r.oid = k.confrelid
         join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
         join pg_namespace n on n.oid = c.relnamespace
        where k.contype = 'f' and n.nspname = 'public'
          and r.relname = 'profiles' and a.attname = 'user_id'`);
    // Sin punto de retorno: este bloque corre FUERA de la transacción del
    // barrido —ya se confirmó— y `savepoint` fuera de una transacción es un
    // error 25P01 que tumbaba la limpieza entera. En autoconfirmación cada
    // sentencia va sola, así que una que falle no ensucia a las demás.
    for (const { tabla, columna } of propias as Array<{ tabla: string; columna: string }>) {
      try {
        await pg.query(`delete from public.${tabla} where ${columna} = any($1::uuid[])`, [personas]);
      } catch (e) {
        problemas.push(`${tabla}: ${(e as Error).message.slice(0, 90)}`);
      }
    }
  }

  for (const uid of personas) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (!error) continue;
    // Si aun así no se puede, se dice QUÉ lo impide. Un «500» a secas obliga a
    // repetir el diagnóstico entero cada vez; el nombre de la tabla lo resuelve
    // en un vistazo.
    const bloquean = await quienBloquea(pg, uid);
    problemas.push(`auth.users ${uid.slice(0, 8)}: ${error.message || error.status}`
      + (bloquean.length ? ` · lo impiden ${bloquean.join(", ")}` : ""));
  }

  for (const id of fxIds) {
    const { error } = await admin.from("commercial_fx_rates")
      .update({ status: "retired" }).eq("id", id);
    if (error) problemas.push(`commercial_fx_rates ${id.slice(0, 8)}: ${error.message}`);
  }

  return { ...(await contarResiduo(pg, admin, fixtures)), problemas };
}

/**
 * Qué filas siguen apuntando al perfil de esa persona. Solo se llama cuando
 * `deleteUser` ya ha fallado: recorrer todas las claves ajenas a `profiles`
 * cuesta, y no tiene sentido pagarlo cuando todo va bien.
 */
async function quienBloquea(pg: PgClient, uid: string): Promise<string[]> {
  const { rows: refs } = await pg.query(
    `select c.relname as tabla, a.attname as columna
       from pg_constraint k
       join pg_class c on c.oid = k.conrelid
       join pg_class r on r.oid = k.confrelid
       join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
       join pg_namespace n on n.oid = c.relnamespace
      where k.contype = 'f' and n.nspname = 'public' and r.relname = 'profiles'`);
  const bloquean: string[] = [];
  for (const { tabla, columna } of refs as Array<{ tabla: string; columna: string }>) {
    try {
      const { rows } = await pg.query(
        `select count(*)::int n from public.${tabla} where ${columna} = $1`, [uid]);
      if (rows[0].n > 0) bloquean.push(`${tabla}.${columna}=${rows[0].n}`);
    } catch { /* una tabla sin permiso no es una pista */ }
  }
  return bloquean;
}

/** Qué queda de esos fixtures. Se llama después de limpiar, y también sola. */
export async function contarResiduo(
  pg: PgClient, admin: SupabaseClient, fixtures: Fixtures
): Promise<Omit<Residuo, "problemas">> {
  const { orgs, personas, fxIds = [] } = fixtures;
  const porTabla: Record<string, number> = {};

  if (orgs.length > 0) {
    for (const t of ["billing_subscriptions", "billing_subscription_periods",
                     "billing_payments", "billing_checkout_intents", "billing_quotes",
                     "billing_payment_methods", "organization_plan_assignments",
                     "organization_modules", "memberships"]) {
      try {
        const { rows } = await pg.query(
          `select count(*)::int n from public.${t} where organization_id = any($1::uuid[])`, [orgs]);
        if (rows[0].n > 0) porTabla[t] = rows[0].n;
      } catch { /* la tabla puede no existir en una base más vieja */ }
    }
  }

  let organizaciones = 0;
  if (orgs.length > 0) {
    const { rows } = await pg.query(
      "select count(*)::int n from public.organizations where id = any($1::uuid[])", [orgs]);
    organizaciones = rows[0].n as number;
  }

  let vivas = 0;
  for (const uid of personas) {
    const { data } = await admin.auth.admin.getUserById(uid);
    if (data?.user) vivas += 1;
  }

  let fxActivas = 0;
  if (fxIds.length > 0) {
    const { rows } = await pg.query(
      "select count(*)::int n from public.commercial_fx_rates where id = any($1::uuid[]) and status = 'active'",
      [fxIds]);
    fxActivas = rows[0].n;
  }

  return { organizaciones, personas: vivas, porTabla, fxActivas };
}

/** El resumen legible que una suite pone en su aserto cuando algo sobrevive. */
export function describirResiduo(r: Residuo): string {
  const partes: string[] = [];
  if (r.organizaciones) partes.push(`${r.organizaciones} organizaciones`);
  if (r.personas) partes.push(`${r.personas} usuarios`);
  if (r.fxActivas) partes.push(`${r.fxActivas} tasas activas`);
  for (const [t, n] of Object.entries(r.porTabla)) partes.push(`${n} en ${t}`);
  if (r.problemas.length) partes.push(`· ${r.problemas.join(" · ")}`);
  return partes.join(", ") || "nada";
}

/**
 * Borrar SOLO personas, para las suites que ya saben limpiar su organización.
 *
 * Es el caso de las ocho que midió TEST-HYGIENE-02: su barrido de la empresa
 * funcionaba —dejaban cero organizaciones— y aun así acumulaban miles de
 * usuarios, porque `user_legal_acceptances` guarda dos filas por persona que no
 * cuelgan de ninguna organización y nadie las borraba.
 *
 * Devuelve la lista de problemas: vacía si se llevó a todas. Quien la llama
 * tiene que ponerse rojo si no lo está, que es lo que faltaba.
 */
export async function limpiarPersonas(
  admin: SupabaseClient, personas: string[],
  opciones: { cliente?: PgClient; autoriaInmutable?: string[] } = {}
): Promise<string[]> {
  const { cliente, autoriaInmutable = [] } = opciones;
  if (personas.length === 0) return [];
  const problemas: string[] = [];
  // La conexión directa se abre aquí si no la traen: obligar a cada suite a
  // gestionar un cliente de Postgres solo para limpiar sería repartir por siete
  // ficheros una plomería que no es suya.
  const propia = cliente === undefined;
  const pg = cliente ?? new PgClientCtor({ connectionString: process.env.SUPABASE_DB_URL });
  if (propia) await pg.connect();
  try {

  await admin.from("platform_staff").delete().in("user_id", personas);

  const { rows: propias } = await pg.query(
    `select c.relname as tabla, a.attname as columna
       from pg_constraint k
       join pg_class c on c.oid = k.conrelid
       join pg_class r on r.oid = k.confrelid
       join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
       join pg_namespace n on n.oid = c.relnamespace
      where k.contype = 'f' and n.nspname = 'public'
        and r.relname = 'profiles' and a.attname = 'user_id'`);
  for (const { tabla, columna } of propias as Array<{ tabla: string; columna: string }>) {
    try {
      await pg.query(`delete from public.${tabla} where ${columna} = any($1::uuid[])`, [personas]);
    } catch (e) {
      problemas.push(`${tabla}: ${(e as Error).message.slice(0, 90)}`);
    }
  }

  // --- La AUTORÍA no se borra: se suelta -----------------------------------
  //
  // Quedan filas que la persona CREÓ pero que no son suyas y que no deben
  // desaparecer: una tasa de cambio se retira y se conserva porque 0182 no deja
  // borrar historia financiera, y una revisión de plan publicada es catálogo.
  // Sus columnas de autoría apuntan al perfil y bloquean el borrado.
  //
  // La única salida correcta es soltar el puntero, no la fila: la columna es
  // anulable, la fila sobrevive intacta, y lo único que se pierde es «quién lo
  // creó», que iba a ser un usuario de prueba inexistente de todas formas.
  // Borrar la fila por su autor destruiría datos que no son del fixture.
  const { rows: autoria } = await pg.query(
    `select c.relname as tabla, a.attname as columna
       from pg_constraint k
       join pg_class c on c.oid = k.conrelid
       join pg_class r on r.oid = k.confrelid
       join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
       join pg_namespace n on n.oid = c.relnamespace
      where k.contype = 'f' and n.nspname = 'public'
        and r.relname = 'profiles' and a.attname <> 'user_id'
        and not a.attnotnull`);
  for (const { tabla, columna } of autoria as Array<{ tabla: string; columna: string }>) {
    try {
      const { rowCount } = await pg.query(
        `update public.${tabla} set ${columna} = null where ${columna} = any($1::uuid[])`,
        [personas]);
      void rowCount;
    } catch { /* una tabla protegida por disparador se reporta abajo, al fallar */ }
  }

  for (const uid of personas) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (!error) continue;
    const bloquean = await quienBloquea(pg, uid);
    // Una excepción DECLARADA no es una excepción silenciada. Hay filas que el
    // producto congela a propósito —una revisión de plan publicada guarda quién
    // la publicó y 0162 no deja reescribirlo— y ahí no hay salida buena: o se
    // conserva el usuario, o se falsea la historia del catálogo. La suite que
    // lo provoca lo declara por su nombre; cualquier OTRO bloqueo sigue
    // poniéndola roja.
    const soloDeclarados = bloquean.length > 0 && bloquean.every((b) =>
      autoriaInmutable.some((permitido) => b.startsWith(permitido)));
    if (soloDeclarados) continue;
    problemas.push(`auth.users ${uid.slice(0, 8)}: ${error.message || error.status}`
      + (bloquean.length ? ` · lo impiden ${bloquean.join(", ")}` : ""));
  }

  // Y se COMPRUEBA: que `deleteUser` no devuelva error no demuestra que se haya
  // ido. Lo demuestra preguntarlo.
  for (const uid of personas) {
    const { data } = await admin.auth.admin.getUserById(uid);
    if (!data?.user) continue;
    const bloquean = await quienBloquea(pg, uid);
    const soloDeclarados = bloquean.length > 0 && bloquean.every((b) =>
      autoriaInmutable.some((permitido) => b.startsWith(permitido)));
    if (!soloDeclarados) problemas.push(`auth.users ${uid.slice(0, 8)}: sigue viva`);
  }

  return problemas;
  } finally {
    if (propia) await pg.end();
  }
}
