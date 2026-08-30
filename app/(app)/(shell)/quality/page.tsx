// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-13B4 · Portada del módulo.
//
// LA PORTADA VIEJA Y POR QUÉ CAMBIA
//
// Preguntaba a doce dominios, cada uno con su forma de contar, y enseñaba diez
// bloques del mismo tamaño más siete tarjetas de «cómo se construye». Tres
// problemas, y los tres los nombró QUALITY-13A:
//
//   1 · sin contrato común, dos dominios podían contar el mismo problema y la
//       portada lo enseñaba dos veces sin saberlo;
//   2 · decía «3 vencidas» y no llevaba a ninguna de las tres;
//   3 · faltaba Contexto entero, el dominio más reciente.
//
// Ahora la atención se pregunta UNA vez, a la consulta convergida de B3, y los
// cargadores que quedan sirven solo para el contexto administrativo —cuántos
// procesos, cuántos objetivos activos—, que responde «dónde entro» y no es una
// señal de nada.
//
// La composición vive en `lib/db/quality-home.ts` y las decisiones en
// `lib/domain/quality-home.ts`: esta página resuelve permisos, lee los filtros
// y monta. No decide nada.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { listMyTasks } from "@/lib/db/document-control";
import { loadQualityHome } from "@/lib/db/quality-home";
import { parseFilters } from "@/lib/domain/quality-home";
import { summarizeInbox, summaryLines } from "@/lib/domain/work-inbox";
import { QualityHomeView } from "@/components/domain/quality/home-view";

export const metadata = { title: "Trazaloop Quality" };

export default async function QualityHomePage({
  searchParams,
}: {
  searchParams: Promise<{ dominio?: string; proceso?: string }>;
}) {
  const org = await requireQualityModule();
  const { user } = await requireSession();
  const filters = parseFilters(await searchParams);

  const [home, tasks] = await Promise.all([
    loadQualityHome({
      organizationId: org.organizationId,
      domain: filters.domain,
      processId: filters.processId,
    }),
    // Otra pregunta: qué me toca a MÍ. La asignación de una tarea es un dato
    // real —`assignee_profile_id`—, no una deducción de propiedad a partir del
    // usuario, que es lo que QI-12 prohíbe.
    listMyTasks(org.organizationId, user.id),
  ]);

  const inbox = summarizeInbox(tasks.map((t) => ({ taskType: t.taskType, status: t.status })));

  return (
    <QualityHomeView
      home={home}
      filters={filters}
      personalLines={summaryLines(inbox)}
    />
  );
}
