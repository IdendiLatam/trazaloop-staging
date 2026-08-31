import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-02B4 · La ayuda contextual que lee el producto.
 *
 * SE CARGA POR PANTALLA, NO POR BOTÓN.
 *
 * Es la exigencia central del tramo (§25) y conviene decir por qué: una pantalla
 * de Quality tiene once botones «i». Si cada uno pidiera su texto, abrirla
 * costaría once consultas, y el día que alguien añada el duodécimo costaría
 * doce, sin que nadie se dé cuenta hasta que la pantalla vaya lenta.
 *
 * Aquí se pide UNA vez, por `page_key`, y se devuelve un mapa. Añadir botones a
 * una pantalla no añade consultas.
 *
 * Sin cliente administrativo. La ayuda se lee por `v_help_effective`, que ya
 * filtra publicada, vigente y con sesión.
 */

type Db = SupabaseClient;

async function db(client?: Db): Promise<Db> {
  return client ?? ((await createServerClient()) as unknown as Db);
}

/** Lo que se pinta. Ni una columna de gobierno editorial. */
export type HelpContent = {
  title: string;
  explanation: string;
  example: string | null;
  technicalReference: string | null;
};

/**
 * La ayuda de una pantalla, por elemento.
 *
 * La clave del mapa es `"tipo:objetivo"` —`"field:relevance"`— porque un campo y
 * una sección pueden llamarse igual sin ser lo mismo, y la identidad de la base
 * ya los distingue así.
 */
export type PageHelp = Record<string, HelpContent>;

/**
 * Tres resultados, no dos.
 *
 * §16 y §24: un fallo de lectura NO puede leerse como «esta pantalla no tiene
 * ayuda configurada». Son cosas distintas y la pantalla hace cosas distintas con
 * cada una.
 */
export type HelpRead =
  | { status: "ok"; help: PageHelp }
  | { status: "unavailable" };

export function helpKey(targetKind: string, targetKey: string): string {
  return `${targetKind}:${targetKey}`;
}

/**
 * UNA consulta por pantalla. El resto es mapear en memoria.
 *
 * `language` existe hoy solo para no cerrar la puerta a traducir: la revisión
 * lleva idioma desde el primer día, y «la vigente» es «la vigente en este
 * idioma». No hay selector, y no lo habrá hasta que haya algo que seleccionar.
 */
export async function getPageHelp(
  pageKey: string, language = "es", client?: Db
): Promise<HelpRead> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("v_help_effective")
    .select("target_kind, target_key, title, explanation, example, technical_reference")
    .eq("page_key", pageKey)
    .eq("language", language);

  if (error) return { status: "unavailable" };

  const help: PageHelp = {};
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    help[helpKey(String(r.target_kind), String(r.target_key))] = {
      title: String(r.title),
      explanation: String(r.explanation),
      example: (r.example as string | null) ?? null,
      technicalReference: (r.technical_reference as string | null) ?? null,
    };
  }
  return { status: "ok", help };
}

/**
 * La ayuda de VARIAS pantallas de una vez.
 *
 * Para una pantalla compuesta —una ficha que embebe bloques de otra— sigue
 * siendo una sola consulta. Se ofrece antes de que alguien resuelva ese caso
 * llamando `getPageHelp` en un bucle, que es como nacen los N+1.
 */
export async function getHelpForPages(
  pageKeys: readonly string[], language = "es", client?: Db
): Promise<HelpRead & { byPage?: Record<string, PageHelp> }> {
  if (pageKeys.length === 0) return { status: "ok", help: {}, byPage: {} };
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("v_help_effective")
    .select("page_key, target_kind, target_key, title, explanation, example, technical_reference")
    .in("page_key", [...pageKeys])
    .eq("language", language);

  if (error) return { status: "unavailable" };

  const byPage: Record<string, PageHelp> = {};
  const help: PageHelp = {};
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const page = String(r.page_key);
    const k = helpKey(String(r.target_kind), String(r.target_key));
    const contenido: HelpContent = {
      title: String(r.title),
      explanation: String(r.explanation),
      example: (r.example as string | null) ?? null,
      technicalReference: (r.technical_reference as string | null) ?? null,
    };
    byPage[page] = { ...(byPage[page] ?? {}), [k]: contenido };
    help[k] = contenido;
  }
  return { status: "ok", help, byPage };
}
