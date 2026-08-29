export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-12.3B3A · Partes interesadas.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getSummary, listCategories, listGroups, monitoringForAssessments,
  searchAssessments, searchExternalParties,
} from "@/lib/db/quality-interested-parties";
import {
  canManageInterestedParties, interestedPartiesHint,
  RELEVANCE_STATES, REVIEW_STATES, SUBJECT_KINDS,
  type RelevanceState, type ReviewState, type SubjectKind,
} from "@/lib/domain/quality-interested-parties";
import { SectionHint } from "@/components/ui/section-hint";
import { InterestedPartiesSubnav } from "@/components/domain/quality/interested-parties/subnav";
import { InterestedPartiesSummaryCards } from "@/components/domain/quality/interested-parties/summary-cards";
import { InterestedPartiesList } from "@/components/domain/quality/interested-parties/parties-list";
import { NewPartyPanel } from "@/components/domain/quality/interested-parties/new-party-panel";

export const metadata = { title: "Partes interesadas" };

const BASE = "/quality/context/interested-parties";

/** Un valor de la URL solo se usa si pertenece al vocabulario. Lo que no
 *  reconoce se ignora, en vez de llegar a la consulta y fallar allí. */
function pick<T extends readonly string[]>(
  value: string | undefined, allowed: T
): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T[number]) : undefined;
}

export default async function InterestedPartiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const org = await requireQualityModule();
  const sp = await searchParams;
  const uno = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const q = uno("q") ?? "";
  const categoria = uno("categoria");
  const tipo = pick(uno("tipo"), SUBJECT_KINDS);
  const pertinencia = pick(uno("pertinencia"), RELEVANCE_STATES);
  const revision = pick(uno("revision"), [...REVIEW_STATES, "no_strategy"] as const);
  const entidad = uno("entidad") ?? "";
  const canManage = canManageInterestedParties(org.roleCode);

  const [pagina, summary, categories, groups, parties] = await Promise.all([
    searchAssessments(org.organizationId, {
      q, page: uno("page"), categoryId: categoria,
      subjectKind: tipo as SubjectKind | undefined,
      relevance: pertinencia as RelevanceState | undefined,
      reviewState: revision as ReviewState | "no_strategy" | undefined,
    }),
    getSummary(org.organizationId),
    listCategories(org.organizationId),
    listGroups(org.organizationId),
    canManage ? searchExternalParties(org.organizationId, entidad) : Promise.resolve([]),
  ]);

  const monitoring = await monitoringForAssessments(
    org.organizationId, pagina.rows.map((r) => r.id));

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Partes interesadas</h1>
          <SectionHint hint={interestedPartiesHint("overview")} />
        </div>
        <p className="text-sm text-ink-soft">
          Identificar, comprender y gestionar las partes interesadas y sus necesidades,
          expectativas y requisitos pertinentes. Lo que aquí se registra es lo que la empresa
          ha decidido y por qué; nada de esto acredita nada por sí solo.
        </p>
      </header>

      <InterestedPartiesSubnav current="parties" />

      <InterestedPartiesSummaryCards summary={summary} basePath={BASE} />

      {canManage ? (
        <NewPartyPanel
          categories={categories}
          groups={groups}
          parties={parties}
          partySearch={entidad}
          basePath={BASE}
        />
      ) : null}

      <InterestedPartiesList
        rows={pagina.rows}
        monitoring={monitoring}
        categories={categories}
        total={pagina.total}
        page={pagina.page}
        pageSize={pagina.pageSize}
        basePath={BASE}
        params={{ q, categoria, tipo, pertinencia, revision }}
        canManage={canManage}
      />
    </div>
  );
}
