export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-08 · Ficha del cliente.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listCustomerContacts, listCustomerOverview, listFeedback, listMetricSeries,
} from "@/lib/db/quality-customer-voice";
import { getDeletionEligibility } from "@/lib/db/lifecycle";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canManageCustomerVoice } from "@/lib/domain/quality-customer-voice";
import { CustomerFileView } from "@/components/domain/quality/customer-voice/customer-file";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Ficha de cliente" };

export default async function CustomerFilePage(
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;
  const org = await requireQualityModule();

  // Si RLS no entrega la ficha, la respuesta es la misma que si no existiera.
  const all = await listCustomerOverview(org.organizationId, {});
  const customer = all.find((c) => c.profileId === profileId);
  if (!customer) notFound();

  const supabase = await createServerClient();
  const [contacts, feedback, positions, eligibility] = await Promise.all([
    listCustomerContacts(org.organizationId, customer.partyId),
    listFeedback(org.organizationId, { customerId: profileId }),
    listQualityPositions(org.organizationId),
    getDeletionEligibility("customer", profileId),
  ]);

  // §43/§87 · SOLO respuestas identificadas. Se filtran por el modo de la
  // campaña, no por si la fila lleva cliente: una respuesta anónima no lo
  // lleva, pero la comprobación tiene que ser explícita para que se vea.
  const { data: rawResponses } = await supabase
    .from("quality_survey_responses")
    .select("id, campaign_id, version_id, status, submitted_at, respondent_kind, customer_id, contact_id, respondent_name, source, superseded_by")
    .eq("organization_id", org.organizationId)
    .eq("customer_id", profileId)
    .eq("status", "submitted");
  const campaignIds = [...new Set((rawResponses ?? []).map((r) => r.campaign_id as string))];
  const { data: camps } = campaignIds.length > 0
    ? await supabase.from("quality_survey_campaigns")
        .select("id, anonymity_mode")
        .eq("organization_id", org.organizationId).in("id", campaignIds)
    : { data: [] as Record<string, unknown>[] };
  const identified = new Set((camps ?? [])
    .filter((c) => c.anonymity_mode === "identified").map((c) => c.id as string));

  const responses = (rawResponses ?? [])
    .filter((r) => identified.has(r.campaign_id as string))
    .map((r) => ({
      id: r.id as string,
      campaignId: r.campaign_id as string,
      versionId: r.version_id as string,
      status: r.status as "draft" | "submitted" | "void",
      submittedAt: (r.submitted_at as string | null) ?? null,
      respondentKind: r.respondent_kind as "anonymous" | "contact" | "customer" | "named" | "user",
      customerId: (r.customer_id as string | null) ?? null,
      customerName: customer.legalName,
      contactId: (r.contact_id as string | null) ?? null,
      contactName: null,
      respondentName: (r.respondent_name as string | null) ?? null,
      source: r.source as string,
      supersededBy: (r.superseded_by as string | null) ?? null,
    }));

  const allSeries = await listMetricSeries(org.organizationId);
  const metrics = allSeries.filter((m) => campaignIds.includes(m.campaignId)
    && identified.has(m.campaignId));

  return (
    <div className="max-w-5xl">
      <CustomerFileView
        customer={customer}
        contacts={contacts}
        feedback={feedback}
        responses={responses}
        metrics={metrics}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))}
        eligibility={eligibility}
        canManage={canManageCustomerVoice(org.roleCode)}
      />
    </div>
  );
}
