export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06.1 · Onboarding del sistema de gestión.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { getOnboarding } from "@/lib/db/quality-onboarding";
import { canManagePeople } from "@/lib/domain/quality-people";
import { OnboardingView } from "@/components/domain/quality/people/onboarding";

export const metadata = { title: "Onboarding" };

export default async function QualityOnboardingPage(
  { params }: { params: Promise<{ personId: string; assignmentId: string }> }
) {
  const { personId, assignmentId } = await params;
  const org = await requireQualityModule();

  const view = await getOnboarding(org.organizationId, assignmentId);
  // Si la asignación no existe, si es de otra empresa, o si quien mira no puede
  // abrir la ficha de esa persona, la respuesta es la misma. Y la ruta lleva el
  // identificador de la persona, así que se comprueba que corresponda: un
  // onboarding no puede alcanzarse desde la ficha de otra persona.
  if (!view || view.person.id !== personId) notFound();

  return (
    <div className="max-w-5xl">
      <OnboardingView view={view} canManage={canManagePeople(org.roleCode)} />
    </div>
  );
}
