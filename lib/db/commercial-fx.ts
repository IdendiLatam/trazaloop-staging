import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-05B6F · El tipo de cambio comercial, del lado del servidor.
 *
 * No es la tasa del mercado, y decirlo importa: es una tasa ADMINISTRATIVA que
 * la plataforma decide y fecha. El cliente tiene que poder ver el importe
 * exacto antes de pagar, y una API de divisas caída no puede impedir vender.
 *
 * Esta capa transporta. Quien comprueba solapes, inmutabilidad y permiso es la
 * base, con las primitivas de 0182.
 */

export type FxRateRow = {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rateMicros: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Derivada de las fechas, no escrita a mano. */
  situation: "vigente" | "programada" | "historica" | "retirada";
  /** Si ya fijó algún precio: entonces es intocable. */
  usedForPricing: boolean;
  note: string | null;
};

export async function listFxRates(): Promise<FxRateRow[] | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("v_commercial_fx_rates")
    .select("id, base_currency, quote_currency, rate_micros, effective_from,"
      + " effective_to, situacion, ya_puso_precios, note")
    .order("effective_from", { ascending: false });
  if (error) return null;
  type Fila = {
    id: string; base_currency: string; quote_currency: string; rate_micros: number;
    effective_from: string; effective_to: string | null; situacion: string;
    ya_puso_precios: boolean; note: string | null;
  };
  return ((data ?? []) as unknown as Fila[]).map((r) => ({
    id: r.id,
    baseCurrency: r.base_currency,
    quoteCurrency: r.quote_currency,
    rateMicros: Number(r.rate_micros),
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    situation: r.situacion as FxRateRow["situation"],
    usedForPricing: r.ya_puso_precios === true,
    note: r.note,
  }));
}
