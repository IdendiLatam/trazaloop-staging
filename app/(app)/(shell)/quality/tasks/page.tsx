// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-02 · Mis tareas.
//
// La bandeja es TRANSVERSAL en la base (work_tasks / work_alerts, sin prefijo
// de dominio): esta pantalla es la primera que la consume, y los dominios que
// vengan después —acciones correctivas, auditorías, riesgos— aparecerán aquí
// sin crear una bandeja paralela.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { listMyTasks, listMyAlerts } from "@/lib/db/document-control";
import { isPendingTask } from "@/lib/domain/work-inbox";
import { QualityTasksView } from "@/components/domain/quality/tasks-view";

export const metadata = { title: "Mis tareas" };

export default async function QualityTasksPage() {
  const org = await requireQualityModule();
  const { user } = await requireSession();

  const [tasks, alerts] = await Promise.all([
    listMyTasks(org.organizationId, user.id, { includeClosed: true }),
    listMyAlerts(org.organizationId, user.id),
  ]);

  const toRow = (t: (typeof tasks)[number]) => ({
    id: t.id,
    taskType: t.taskType,
    status: t.status,
    title: t.title,
    description: t.description,
    documentId: t.subjectId,
    documentCode: t.documentCode,
    subjectType: t.subjectType,
    moduleKey: t.subjectModuleKey,
    createdAt: t.createdAt,
  });

  return (
    <QualityTasksView
      tasks={tasks.filter((t) => isPendingTask(t.status)).map(toRow)}
      closedTasks={tasks.filter((t) => !isPendingTask(t.status)).slice(0, 10).map(toRow)}
      alerts={alerts.map((a) => ({
        id: a.id,
        alertType: a.alertType,
        severity: a.severity,
        title: a.title,
        message: a.message,
        documentId: a.subjectId,
        subjectType: a.subjectType,
        moduleKey: a.subjectModuleKey,
        createdAt: a.createdAt,
      }))}
    />
  );
}
