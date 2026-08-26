import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { loadCompanyLogo } from "@/lib/db/company-logo";
import type { PrintOrganization } from "./print-model";

/**
 * Trazaloop · EXPORT-01 · La identidad de empresa de todos los PDF.
 *
 * UN solo sitio resuelve el nombre, la razón social, el NIT y el logo. Sin
 * esto, cada exportador acabaría leyendo la empresa a su manera y bastaría con
 * que uno olvidara comprobar la pertenencia para abrir un agujero.
 *
 * El logo NUNCA llega desde la petición: se resuelve con el resolutor seguro de
 * QUALITY-03.1, que parte del `organizationId` ya validado en servidor y lee la
 * ruta guardada en la propia fila de la empresa (§18, §52).
 *
 * Y si no hay logo, o no se puede leer, el PDF se genera igual con el nombre
 * como identidad (§20). Un adorno no puede romper un documento.
 *
 * EXPORT-01.2 (§10) · Pero se distingue «no hay logo» de «hay logo y no sirve».
 * La segunda situación viaja hasta el encabezado, que lo dice en una línea: una
 * empresa no puede arreglar un branding roto que nadie le señala.
 */
export async function organizationIdentity(organizationId: string): Promise<PrintOrganization> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("organizations")
    .select("name, legal_name, tax_id")
    .eq("id", organizationId)
    .maybeSingle();

  // Un fallo inesperado del almacenamiento no puede tumbar la descarga; se
  // trata como «hay algo y no se pudo usar», que es exactamente lo que es.
  const logo = await loadCompanyLogo(organizationId)
    .catch(() => ({ outcome: "unusable" as const, reason: "download_failed" as const }));

  return {
    name: (data?.name as string | null) ?? "Empresa",
    legalName: (data?.legal_name as string | null) ?? null,
    taxId: (data?.tax_id as string | null) ?? null,
    logo: logo.outcome === "ok" ? logo.image : null,
    logoUnusable: logo.outcome === "unusable",
  };
}
