import Link from "next/link";
import { hasDetailRoute, temporalLabel, type ContextItem, type ContextSection, type TemporalScope }
  from "@/lib/domain/quality-integration";
import {
  SECTION_NOTE, arrangeCockpit, processAttention, requirementLinkLabel, sectionDisplay,
  sectionTemporalLabel, severityLabel, stateLabel, temporalNotice, visibleCount,
} from "@/lib/domain/quality-process-cockpit";
import type { DerivedItem, DerivedSection, RequirementDetail }
  from "@/lib/db/quality-process-cockpit";

/**
 * Trazaloop · QUALITY-13B2 · El mirador del proceso.
 *
 * RESPONDE DOS PREGUNTAS Y NINGUNA MÁS
 *
 *   · ¿qué significa este proceso dentro del sistema de gestión?
 *   · ¿qué requiere atención a su alrededor?
 *
 * Y las responde **mirando**, no editando. Ni un formulario, ni un botón de
 * alta, ni un editor incrustado de riesgos: cada dominio se trabaja en su
 * pantalla, y aquí se llega a ella. Un mirador que edita deja de ser un mirador
 * y se convierte en quince pantallas apiladas, que es el riesgo que el propio
 * plan de 13A marcó para este tramo.
 *
 * ESTE COMPONENTE NO DECIDE NADA
 *
 * El orden de los bloques, el texto de cada estado vacío, qué pide atención y
 * cuándo hay que avisar de que se mezclan dos momentos: todo viene resuelto de
 * `lib/domain/quality-process-cockpit.ts`, y los datos de
 * `lib/db/quality-process-cockpit.ts`. Aquí solo se pinta.
 *
 * LO QUE NUNCA SE ENSEÑA
 *
 *   · El motivo técnico de un fallo. Trae dentro el mensaje del motor, y quien
 *     mira la pantalla no puede hacer nada con «PGRST301».
 *   · Un recuento de una sección que el rol no puede ver. Ni el número, ni las
 *     etiquetas, ni que exista una sola fila.
 *   · Un cero donde lo que hubo fue un fallo o una denegación. Esa fue la
 *     mentira de 12.2F y no se repite.
 */

// ---------------------------------------------------------------------------
// Piezas pequeñas
// ---------------------------------------------------------------------------

/** El recuento. Se enseña solo cuando se sabe; `null` no pinta nada. */
function Count({ n }: { n: number | null }) {
  if (n === null) return null;
  return (
    <span className="shrink-0 rounded-full border border-hairline bg-paper px-2 py-0.5 text-[11px] tabular-nums text-ink-soft">
      {n}
    </span>
  );
}

/**
 * Cuántos piden atención. Texto además del color: quien no distingue colores
 * tiene que poder leerlo igual.
 */
function AttentionCount({ n, label }: { n: number | null; label: string }) {
  if (n === null || n <= 0) return null;
  return (
    <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
      {n} {label}
    </span>
  );
}

/**
 * Una fila de la muestra.
 *
 * Solo enlaza si el sujeto tiene ficha propia. Un hallazgo, una competencia o
 * un requisito viven dentro de otra pantalla, y darle a cada uno un enlace al
 * listado de su dominio pondría cuatro enlaces idénticos seguidos fingiendo que
 * llevan a sitios distintos. Para eso ya está el «Ver todos» de la sección.
 */
function Row({ item, sectionKey, extra }: {
  item: ContextItem; sectionKey: string; extra?: React.ReactNode;
}) {
  const estado = stateLabel(sectionKey, item.state);
  const gravedad = severityLabel(sectionKey, item.severity);
  // El cargador puede decir que ESTA fila no abre ficha aunque su tipo sí la
  // tenga: es el caso del documento que pertenece a otro módulo.
  const abre = item.linksToDetail ?? hasDetailRoute(item.subjectKind);
  const nombre = abre ? (
    <Link href={item.href} className="font-medium text-loop hover:underline">
      {item.label}
    </Link>
  ) : (
    <span className="font-medium">{item.label}</span>
  );
  return (
    <li className="rounded-md border border-hairline bg-paper px-2 py-1.5 text-[11px]">
      <span className="block min-w-0 break-words">{nombre}</span>
      {estado || gravedad ? (
        <span className="block text-ink-soft">
          {[estado, gravedad].filter(Boolean).join(" · ")}
        </span>
      ) : null}
      {extra}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Una sección
// ---------------------------------------------------------------------------

function SectionCard({ section, requirements }: {
  section: ContextSection; requirements: RequirementDetail[];
}) {
  const display = sectionDisplay(section);
  const nota = SECTION_NOTE[section.key];
  const porRequisito = new Map(requirements.map((r) => [r.requirementId, r]));
  const idSeccion = `cockpit-sec-${section.key}`;

  return (
    <article
      aria-labelledby={idSeccion}
      className="flex flex-col gap-2 rounded-lg border border-hairline bg-paper p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 id={idSeccion} className="min-w-0 flex-1 text-xs font-semibold">
          {section.label}
        </h4>
        <AttentionCount n={section.attentionCount} label="por atender" />
        <Count n={visibleCount(section)} />
      </div>

      <p className="text-[11px] text-ink-soft">{sectionTemporalLabel(section)}</p>

      {display.kind === "items" ? (
        <ul className="space-y-1">
          {section.items.map((it) => (
            <Row
              key={it.subjectId}
              item={it}
              sectionKey={section.key}
              extra={
                section.key === "requirements" && porRequisito.has(it.subjectId) ? (
                  <span className="block text-ink-soft">
                    {porRequisito.get(it.subjectId)!.partyLabel ?? "Parte interesada"}
                    {" · "}
                    {requirementLinkLabel(porRequisito.get(it.subjectId)!.linkKind)}
                  </span>
                ) : null
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-ink-soft">{display.text}</p>
      )}

      {nota ? <p className="text-[11px] text-ink-soft">{nota}</p> : null}

      {/* Nunca se ofrece el destino de un dominio que este rol no puede ver:
          sería una puerta a una pantalla que va a rechazarle. */}
      {display.kind === "no_access" ? null : (
        <Link
          href={section.href}
          className="mt-auto inline-flex w-fit items-center text-[11px] font-medium text-loop hover:underline"
        >
          Ver {section.label.toLowerCase()}
        </Link>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Lo derivado
// ---------------------------------------------------------------------------

function DerivedRow({ item }: { item: DerivedItem }) {
  const nombre = hasDetailRoute(item.subjectKind) ? (
    <Link href={item.href} className="font-medium text-loop hover:underline">
      {item.label}
    </Link>
  ) : (
    <span className="font-medium">{item.label}</span>
  );
  return (
    <li className="rounded-md border border-hairline bg-paper px-2 py-1.5 text-[11px]">
      <span className="block min-w-0 break-words">{nombre}</span>
      <span className="block text-ink-soft">{item.via}</span>
      {item.detail ? <span className="block text-ink-soft">{item.detail}</span> : null}
    </li>
  );
}

function DerivedCard({ section }: { section: DerivedSection }) {
  const idSeccion = `cockpit-der-${section.key}`;
  return (
    <article
      aria-labelledby={idSeccion}
      className="flex flex-col gap-2 rounded-lg border border-hairline bg-paper p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 id={idSeccion} className="min-w-0 flex-1 text-xs font-semibold">
          {section.label}
        </h4>
        <Count n={section.status === "ok" ? section.count : null} />
      </div>
      {section.status === "ok" ? (
        <ul className="space-y-1">
          {section.items.map((it) => <DerivedRow key={it.id} item={it} />)}
        </ul>
      ) : (
        <p className="text-[11px] text-ink-soft">
          {section.status === "not_visible"
            ? "Tu rol no da acceso a este dominio."
            : "No fue posible cargar esta sección."}
        </p>
      )}
      <p className="text-[11px] text-ink-soft">{section.note}</p>
      {section.status === "not_visible" ? null : (
        <Link
          href={section.href}
          className="mt-auto inline-flex w-fit items-center text-[11px] font-medium text-loop hover:underline"
        >
          Ver {section.label.toLowerCase()}
        </Link>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// El mirador
// ---------------------------------------------------------------------------

export function QualityProcessCockpit({
  processId,
  sections,
  requirements,
  derived,
  viewScope,
}: {
  processId: string;
  sections: ContextSection[];
  requirements: RequirementDetail[];
  derived: DerivedSection[];
  /** Qué momento describe el proceso que se está viendo. Si no coincide con el
   *  de las secciones, se dice: es la diferencia entre informar y afirmar. */
  viewScope: TemporalScope;
}) {
  const bloques = arrangeCockpit(sections);
  const atencion = processAttention(processId, sections);
  const aviso = temporalNotice(viewScope, sections);
  const incompleto = sections.some((s) => s.status !== "ok");

  return (
    <section
      aria-labelledby="cockpit-title"
      className="space-y-4 rounded-lg border border-hairline bg-surface p-4"
    >
      <div>
        <h2 id="cockpit-title" className="text-sm font-semibold">
          El proceso en el sistema de gestión
        </h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Lo que hay alrededor de este proceso, con el enlace a donde se trabaja.
          Aquí no se edita ninguno de esos dominios: cada uno se gestiona en su pantalla.
        </p>
      </div>

      {aviso ? (
        <p className="rounded-md border border-hairline bg-paper px-3 py-2 text-xs text-ink-soft">
          {aviso}
        </p>
      ) : null}

      {incompleto ? (
        <p className="rounded-md border border-hairline bg-paper px-3 py-2 text-xs text-ink-soft">
          Falta parte del contexto: alguna sección no se pudo leer o tu rol no llega a ella.
          Lo que se ve es cierto; no está todo.
        </p>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Qué requiere atención                                              */}
      {/* ------------------------------------------------------------------ */}
      {atencion.length > 0 ? (
        <section aria-labelledby="cockpit-atencion" className="space-y-2">
          <h3 id="cockpit-atencion" className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Requiere atención
          </h3>
          <ul className="space-y-1">
            {atencion.map((a) => (
              <li
                key={a.dedupeKey}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px]"
              >
                <span className="min-w-0">
                  <span className="font-medium">{a.reason}</span>
                  <span className="block text-ink-soft">
                    {a.label} · {temporalLabel(a.temporal)}
                  </span>
                </span>
                <Link href={a.href} className="shrink-0 font-medium text-loop hover:underline">
                  Ver
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink-soft">
            Sale del estado de cada dominio, y la cifra es la suya —no la de las filas que se
            ven aquí—. Un indicador fuera de meta no aparece: eso lo determina su dominio.
          </p>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Los bloques                                                        */}
      {/* ------------------------------------------------------------------ */}
      {bloques.map(({ block, sections: propias }) => (
        <section key={block.key} aria-labelledby={`cockpit-b-${block.key}`} className="space-y-2">
          <div>
            <h3
              id={`cockpit-b-${block.key}`}
              className="text-xs font-semibold uppercase tracking-wide text-ink-soft"
            >
              {block.title}
            </h3>
            <p className="text-[11px] text-ink-soft">{block.hint}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {propias.map((s) => (
              <SectionCard key={s.key} section={s} requirements={requirements} />
            ))}
          </div>
        </section>
      ))}

      {/* ------------------------------------------------------------------ */}
      {/* Lo derivado · QI-23                                                */}
      {/* ------------------------------------------------------------------ */}
      {derived.length > 0 ? (
        <section aria-labelledby="cockpit-derivado" className="space-y-2">
          <div>
            <h3
              id="cockpit-derivado"
              className="text-xs font-semibold uppercase tracking-wide text-ink-soft"
            >
              Relacionado indirectamente
            </h3>
            <p className="text-[11px] text-ink-soft">
              Ni el proveedor ni la retroalimentación de cliente guardan a qué proceso
              pertenecen, y no se les añade. Esto se deduce de lo que ya es cierto, y cada
              fila dice por qué camino llegó.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {derived.map((d) => <DerivedCard key={d.key} section={d} />)}
          </div>
        </section>
      ) : null}
    </section>
  );
}
