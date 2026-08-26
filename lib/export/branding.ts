import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { loadCompanyLogoForPdf } from "@/lib/db/company-logo";
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
 */
export async function organizationIdentity(organizationId: string): Promise<PrintOrganization> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("organizations")
    .select("name, legal_name, tax_id")
    .eq("id", organizationId)
    .maybeSingle();

  const logo = await loadCompanyLogoForPdf(organizationId).catch(() => null);

  return {
    name: (data?.name as string | null) ?? "Empresa",
    legalName: (data?.legal_name as string | null) ?? null,
    taxId: (data?.tax_id as string | null) ?? null,
    logo: logo?.image ?? null,
  };
}
