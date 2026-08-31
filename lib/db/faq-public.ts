import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-02B3 · Lo que lee quien consulta la FAQ.
 *
 * Es la capa del PRODUCTO, no la de la consola. Solo toca las tres vistas de
 * 0155 —publicada, vigente y del público que corresponda— y por tanto:
 *
 *   · no ve borradores;
 *   · no ve revisiones cerradas;
 *   · no ve procedencia interna, autores ni notas de cambio.
 *
 * No porque este archivo se acuerde de excluirlos, sino porque las vistas no los
 * contienen. Es la diferencia entre una promesa y una barrera.
 *
 * Sin cliente administrativo, y no puede haberlo: la puerta pública es una
 * vista con permiso de lectura, y `service_role` aquí solo serviría para
 * saltarse algo.
 */

type Db = SupabaseClient;

async function db(client?: Db): Promise<Db> {
  return client ?? ((await createServerClient()) as unknown as Db);
}

/**
 * Quién pregunta. NO es «qué tiene contratado»: es «tiene sesión o no».
 *
 * La distinción importa y se repite en cada función de este archivo porque es
 * la que §11 del encargo llama crítica: que una empresa no tenga Textiles no le
 * oculta la documentación sobre Textiles. Lo único que amplía lo que se lee es
 * haber iniciado sesión.
 */
export type FaqAudience = "public" | "authenticated";

const VISTA: Record<FaqAudience, string> = {
  public: "v_faq_public",
  authenticated: "v_faq_authenticated",
};

/** Las columnas que la pantalla necesita. Ni una más. */
const CAMPOS =
  "slug, category_code, category_label, category_order, entry_order,"
  + " is_featured, scope, module_keys, language, question, answer_short,"
  + " answer_long, published_at";

export type FaqAnswer = {
  slug: string;
  categoryCode: string;
  categoryLabel: string;
  question: string;
  answerShort: string;
  answerLong: string | null;
  isFeatured: boolean;
  moduleKeys: string[];
  publishedAt: string | null;
};

export type FaqCategoryForReaders = {
  code: string;
  label: string;
  entries: number;
};

/**
 * Tres resultados posibles, no dos.
 *
 * «No se pudo consultar» y «no hay resultados» son cosas distintas y la pantalla
 * las cuenta distinto (§12). Un buscador que dice «no encontramos preguntas»
 * cuando lo cierto es que la consulta falló hace que alguien deje de buscar.
 */
export type FaqRead<T> = { status: "ok"; data: T } | { status: "unavailable" };

function mapAnswer(r: Record<string, unknown>): FaqAnswer {
  return {
    slug: String(r.slug),
    categoryCode: String(r.category_code),
    categoryLabel: String(r.category_label),
    question: String(r.question),
    answerShort: String(r.answer_short),
    answerLong: (r.answer_long as string | null) ?? null,
    isFeatured: Boolean(r.is_featured),
    moduleKeys: (r.module_keys as string[] | null) ?? [],
    publishedAt: (r.published_at as string | null) ?? null,
  };
}

export type FaqQuery = {
  audience: FaqAudience;
  search?: string | null;
  categoryCode?: string | null;
  moduleKey?: string | null;
  page?: number;
  pageSize?: number;
};

export const FAQ_READER_PAGE_SIZE = 20;

/**
 * La búsqueda, en el SERVIDOR y en español.
 *
 * Usa `search_document`, la columna generada de 0155: se calcula a partir de la
 * pregunta y las dos respuestas, así que no puede quedar desincronizada del
 * contenido. `websearch` es el analizador que entiende lo que la gente escribe
 * de verdad —comillas, `or`, un signo menos— sin que haya que enseñárselo.
 *
 * No se traen todas las preguntas para filtrarlas en el navegador: eso
 * funcionaría con treinta y dejaría de funcionar con trescientas, y además
 * expondría a quien no tiene sesión el texto de lo que no debería leer.
 */
export async function searchFaq(
  q: FaqQuery, client?: Db
): Promise<FaqRead<{ rows: FaqAnswer[]; total: number }>> {
  const supabase = await db(client);
  const pageSize = q.pageSize ?? FAQ_READER_PAGE_SIZE;
  const page = Math.max(1, q.page ?? 1);

  let consulta = supabase.from(VISTA[q.audience]).select(CAMPOS, { count: "exact" });

  const texto = (q.search ?? "").trim();
  if (texto.length > 0) {
    consulta = consulta.textSearch("search_document", texto, {
      config: "spanish", type: "websearch",
    });
  }
  if (q.categoryCode) consulta = consulta.eq("category_code", q.categoryCode);
  if (q.moduleKey) consulta = consulta.contains("module_keys", [q.moduleKey]);

  const { data, error, count } = await consulta
    .order("is_featured", { ascending: false })
    .order("category_order")
    .order("entry_order")
    .order("slug")
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) return { status: "unavailable" };
  return {
    status: "ok",
    data: {
      rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(mapAnswer),
      total: count ?? 0,
    },
  };
}

/**
 * Las categorías que tienen algo que enseñar a QUIEN PREGUNTA.
 *
 * La vista `v_faq_public_categories` de 0155 solo cuenta lo público, así que
 * sirve para el visitante y se queda corta para quien tiene sesión. En vez de
 * añadir una segunda vista por una cuenta, se pide una proyección mínima —una
 * columna, la categoría— y se agrupa aquí.
 *
 * Es UNA consulta, y devuelve tantas cadenas cortas como preguntas publicadas
 * haya. Con un catálogo de FAQ eso son decenas: el día que sean miles, esto se
 * convierte en una vista y este comentario se borra.
 *
 * Una categoría sin preguntas NO se ofrece: un menú que lleva a una pantalla
 * vacía es una promesa que la pantalla no cumple.
 */
export async function listFaqCategoriesForReaders(
  audience: FaqAudience, client?: Db
): Promise<FaqRead<FaqCategoryForReaders[]>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from(VISTA[audience])
    .select("category_code, category_label, category_order");
  if (error) return { status: "unavailable" };

  const cuenta = new Map<string, FaqCategoryForReaders & { order: number }>();
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const code = String(r.category_code);
    const actual = cuenta.get(code);
    if (actual) actual.entries += 1;
    else cuenta.set(code, {
      code, label: String(r.category_label), entries: 1,
      order: Number(r.category_order ?? 0),
    });
  }
  return {
    status: "ok",
    data: [...cuenta.values()]
      .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
      .map(({ code, label, entries }) => ({ code, label, entries })),
  };
}

/** Las destacadas. Quién lo está lo decide el superadministrador, no esta capa. */
export async function listFeaturedFaq(
  audience: FaqAudience, limit = 5, client?: Db
): Promise<FaqRead<FaqAnswer[]>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from(VISTA[audience]).select(CAMPOS)
    .eq("is_featured", true)
    .order("category_order").order("entry_order").order("slug")
    .limit(limit);
  if (error) return { status: "unavailable" };
  return {
    status: "ok",
    data: ((data ?? []) as unknown as Record<string, unknown>[]).map(mapAnswer),
  };
}

/**
 * Una respuesta por su identificador estable.
 *
 * `slug` no se deriva del texto de la pregunta: reformularla —«¿Puede otra
 * empresa ver mis datos?» pasa a «…mi información?»— no rompe el enlace que
 * alguien guardó. Es la razón por la que 0155 separó identidad y texto.
 *
 * Devuelve `null` cuando no hay ninguna con ese identificador VISIBLE para
 * quien pregunta. Que no se vea puede significar que no existe, que es un
 * borrador, que se retiró o que exige sesión: desde fuera son lo mismo a
 * propósito, porque distinguirlas sería contar qué hay ahí dentro.
 */
export async function getFaqAnswerBySlug(
  audience: FaqAudience, slug: string, client?: Db
): Promise<FaqRead<FaqAnswer | null>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from(VISTA[audience]).select(CAMPOS).eq("slug", slug).maybeSingle();
  if (error) return { status: "unavailable" };
  if (!data) return { status: "ok", data: null };
  return {
    status: "ok",
    data: mapAnswer(data as unknown as Record<string, unknown>),
  };
}

/** Las demás de su categoría, para seguir leyendo sin volver atrás. */
export async function listRelatedFaq(
  audience: FaqAudience, categoryCode: string, exceptSlug: string, client?: Db
): Promise<FaqRead<FaqAnswer[]>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from(VISTA[audience]).select(CAMPOS)
    .eq("category_code", categoryCode).neq("slug", exceptSlug)
    .order("entry_order").order("slug").limit(6);
  if (error) return { status: "unavailable" };
  return {
    status: "ok",
    data: ((data ?? []) as unknown as Record<string, unknown>[]).map(mapAnswer),
  };
}
