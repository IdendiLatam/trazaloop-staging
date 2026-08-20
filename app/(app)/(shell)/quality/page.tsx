// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-01 · Inicio del módulo.
//
// Presenta el recorrido real del sprint en el orden en que se hace: primero
// los cargos (sin ellos un proceso no tiene propietario), luego los procesos,
// luego el mapa. Los contadores son datos reales de la empresa activa; nada
// aquí es un número de ejemplo.

import Link from "next/link";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { getQualitySummary } from "@/lib/db/quality-processes";

function Card({
  href,
  step,
  title,
  description,
  meta,
  cta,
}: {
  href: string;
  step: string;
  title: string;
  description: string;
  meta: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-lg border border-loop/30 bg-loop/5 p-4 transition-colors hover:border-loop"
    >
      <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
        {step}
      </span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-ink-soft">{description}</span>
      <span className="text-xs font-medium text-ink">{meta}</span>
      <span className="text-sm font-medium text-loop">{cta} →</span>
    </Link>
  );
}

export default async function QualityHomePage() {
  const org = await requireQualityModule();
  const summary = await getQualitySummary(org.organizationId);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Módulos · Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Trazaloop Quality</h1>
        <p className="text-sm text-ink-soft">
          Gestión de procesos del sistema de calidad: cargos responsables, procesos con
          revisiones vigentes, entradas y salidas, relaciones entre procesos y un mapa
          publicable. Cada versión publicada queda fija y consultable.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Cómo se construye</h2>

        <Card
          href="/quality/positions"
          step="Paso 1"
          title="Cargos"
          description="El responsable de un proceso es un cargo, no una persona. Cuando alguien cambia de puesto, el proceso conserva su propietario y la historia queda registrada."
          meta={
            summary.positions === 0
              ? "Aún no hay cargos definidos."
              : `${summary.positions} ${summary.positions === 1 ? "cargo definido" : "cargos definidos"}.`
          }
          cta="Gestionar cargos"
        />

        <Card
          href="/quality/processes"
          step="Paso 2"
          title="Procesos"
          description="Propósito, alcance, entradas, salidas y relaciones con otros procesos. Se trabaja sobre un borrador y se publica cuando está listo."
          meta={
            summary.processes === 0
              ? "Aún no hay procesos."
              : `${summary.processes} ${summary.processes === 1 ? "proceso" : "procesos"} · ${summary.publishedProcesses} con versión publicada.`
          }
          cta="Gestionar procesos"
        />

        <Card
          href="/quality/map"
          step="Paso 3"
          title="Mapa de procesos"
          description="Los procesos organizados por categoría. Al publicarlo se convierte en la versión oficial: deja de ser editable y queda consultable tal cual."
          meta={
            summary.hasPublishedMap
              ? "Hay un mapa publicado vigente."
              : summary.maps === 0
                ? "Aún no hay mapa."
                : "Mapa en preparación, todavía sin publicar."
          }
          cta="Ver el mapa"
        />

        <Card
          href="/quality/documents"
          step="Documentación"
          title="Documentos"
          description="El espacio documental de Quality: procedimientos, políticas e instructivos, con los mismos estados y versiones de TrazaDocs. No necesita ningún otro módulo."
          meta={
            summary.documents === 0
              ? "Aún no hay documentos de Quality."
              : `${summary.documents} ${summary.documents === 1 ? "documento" : "documentos"} de Quality.`
          }
          cta="Ir a Documentos"
        />
      </section>

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Sobre las versiones publicadas</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Publicar cierra la versión: su contenido, sus entradas y sus salidas quedan tal
          como estaban ese día y no se pueden modificar. Para cambiar algo se abre una
          revisión nueva, que parte de una copia de la vigente. Las versiones anteriores no
          se borran, de modo que siempre se puede responder qué regía en una fecha dada.
        </p>
      </section>
    </div>
  );
}
