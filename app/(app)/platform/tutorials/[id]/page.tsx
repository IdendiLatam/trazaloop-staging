export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import { getTutorialDetailAction } from "@/server/actions/tutorials-admin";
import { TutorialUploadForm } from "@/components/domain/tutorials/tutorial-upload";
import {
  CandidateMetadataForm, PublishVersionForm, UnpublishTutorialForm,
  RestoreVersionForm, DiscardCandidateForm, VersionPreview, ReactivateTutorialForm,
} from "@/components/domain/tutorials/tutorial-admin-forms";
import { PAGE_KEYS } from "@/lib/modules/page-keys";
import {
  TUTORIAL_CONSOLE_UNAVAILABLE, TUTORIAL_FILE_STATE_LABEL,
  TUTORIAL_PUBLICATION_LABEL, tutorialPublicationState,
  humanFileSize, humanDuration,
} from "@/lib/domain/tutorial-admin";

export const metadata = { title: "Tutorial · Plataforma" };

const fecha = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })
    : "—";

/**
 * Trazaloop · PE-03B2 · La ficha de un tutorial.
 *
 * Tres bloques, en el orden en que se usan: lo que se está viendo, lo que está
 * listo para publicarse, y la historia. Subir va arriba del todo porque es lo
 * que se viene a hacer.
 */
export default async function PlatformTutorialDetailPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { detail, canManage, unavailable } = await getTutorialDetailAction(id);

  if (unavailable) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/platform/tutorials" className="text-sm text-loop hover:underline">
          ← Tutoriales
        </Link>
        <div role="status" className="rounded-lg border border-amber/40 bg-amber/5 p-4">
          <p className="text-sm font-medium text-ink">No se pudo consultar este tutorial</p>
          <p className="mt-1 text-sm text-ink-soft">{TUTORIAL_CONSOLE_UNAVAILABLE}</p>
        </div>
      </div>
    );
  }
  if (!detail) notFound();

  const { tutorial, versions } = detail;
  // COMMERCIAL-UX-01E.1 · Los tres emplazamientos, cada uno con su nombre.
  //
  // Antes eran dos, y todo lo que no colgaba de una pantalla se rotulaba
  // «Vídeo de bienvenida». Con el vídeo de portada eso pasó a ser falso: la
  // ficha del vídeo público decía que era la bienvenida.
  const nombrePantalla = tutorial.pageKey
    ? PAGE_KEYS.find((p) => p.key === tutorial.pageKey)?.label ?? tutorial.pageKey
    : tutorial.tutorialType === "public_home"
      ? "Vídeo de la portada pública"
      : "Vídeo de bienvenida";

  const publicada = versions.find((v) => v.effectiveFrom && !v.effectiveTo) ?? null;
  const candidatas = versions.filter((v) => v.effectiveFrom === null && v.fileState === "verified");
  const fallidas = versions.filter((v) => v.fileState === "failed");
  const pendientes = versions.filter((v) => v.fileState === "reserved" || v.fileState === "uploaded");
  const historicas = versions.filter((v) => v.effectiveFrom && v.effectiveTo);

  const periodo = (v: { effectiveFrom: string | null; effectiveTo: string | null }) =>
    v.effectiveFrom
      ? `del ${fecha(v.effectiveFrom)}${v.effectiveTo ? ` al ${fecha(v.effectiveTo)}` : " a hoy"}`
      : "sin publicar";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link href="/platform/tutorials" className="text-sm text-loop hover:underline">
          ← Tutoriales
        </Link>
      </div>

      <header className="space-y-1">
        <p className="eyebrow">
          {tutorial.tutorialType === "welcome" ? "Bienvenida"
            : tutorial.tutorialType === "public_home" ? "Portada pública"
            : "Tutorial de pantalla"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{nombrePantalla}</h1>
        <p className="text-sm text-ink-soft">{tutorial.title}</p>
        {tutorial.pageKey ? (
          <p className="text-xs text-ink-soft">
            Clave de pantalla: <code className="text-xs">{tutorial.pageKey}</code> ·
            no cambia aunque la pantalla cambie de dirección.
          </p>
        ) : null}
      </header>

      {/* ================================================================ */}
      <section className="space-y-3">
        <h2 className="eyebrow">Versión publicada</h2>
        {publicada ? (
          <div className="space-y-4 rounded-lg border border-loop/40 bg-loop/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  Versión {publicada.versionNumber}
                  {publicada.title ? ` · ${publicada.title}` : ""}
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  Publicada el {fecha(publicada.publishedAt)}
                  {publicada.publishedByName ? ` por ${publicada.publishedByName}` : ""}.
                  Esto es lo que ve la gente ahora.
                </p>
              </div>
            </div>
            {publicada.description ? (
              <p className="text-sm text-ink">{publicada.description}</p>
            ) : null}
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-soft">
              <div><dt className="inline font-medium text-ink">Archivo: </dt>
                <dd className="inline">{publicada.originalFilename}</dd></div>
              <div><dt className="inline font-medium text-ink">Tamaño: </dt>
                <dd className="inline">{humanFileSize(publicada.realSizeBytes)}</dd></div>
              <div><dt className="inline font-medium text-ink">Duración: </dt>
                <dd className="inline">{humanDuration(publicada.durationSeconds)}</dd></div>
              {publicada.changeNote ? (
                <div className="basis-full"><dt className="inline font-medium text-ink">Nota: </dt>
                  <dd className="inline">{publicada.changeNote}</dd></div>
              ) : null}
            </dl>
            <VersionPreview versionId={publicada.id}
              etiqueta={`la versión ${publicada.versionNumber}`} />
            {canManage ? <UnpublishTutorialForm tutorialId={tutorial.id} /> : null}
          </div>
        ) : (
          <div className="rounded-lg border border-hairline bg-paper p-5">
            <p className="text-sm font-medium text-ink">Sin vídeo publicado</p>
            <p className="mt-1 text-sm text-ink-soft">
              Quien abra esta pantalla lee: «Este tutorial está en actualización y
              estará disponible pronto». No es un fallo — es lo que corresponde
              mientras no haya vídeo.
            </p>
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {tutorial.status === "retired" ? (
        <section className="space-y-3">
          <h2 className="eyebrow">Tutorial retirado</h2>
          <div className="rounded-lg border border-hairline bg-paper p-5">
            {canManage ? (
              <ReactivateTutorialForm tutorialId={tutorial.id} />
            ) : (
              <p className="text-sm text-ink-soft">
                Este tutorial está retirado: no se ve en ninguna parte, y su
                historia se conserva.
              </p>
            )}
          </div>
        </section>
      ) : canManage ? (
        <section className="space-y-3">
          <h2 className="eyebrow">Subir</h2>
          <TutorialUploadForm tutorialId={tutorial.id} />
        </section>
      ) : null}

      {/* ================================================================ */}
      {candidatas.length > 0 ? (
        <section className="space-y-3">
          <h2 className="eyebrow">Listas para revisar</h2>
          <p className="text-sm text-ink-soft">
            Verificadas y <strong className="font-medium text-ink">sin publicar</strong>:
            nadie las ve todavía.
          </p>
          {candidatas.map((v) => (
            <div key={v.id} className="space-y-4 rounded-lg border border-hairline bg-surface p-5">
              <div>
                <p className="text-sm font-semibold text-ink">
                  Versión {v.versionNumber}
                  {v.restoredFromVersionId ? " · repone un vídeo anterior" : ""}
                </p>
                <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-soft">
                  <div><dt className="inline font-medium text-ink">Archivo: </dt>
                    <dd className="inline">{v.originalFilename}</dd></div>
                  <div><dt className="inline font-medium text-ink">Tamaño: </dt>
                    <dd className="inline">{humanFileSize(v.realSizeBytes)}</dd></div>
                  <div><dt className="inline font-medium text-ink">Estado: </dt>
                    <dd className="inline">{TUTORIAL_FILE_STATE_LABEL[v.fileState]}</dd></div>
                  {v.uploadedByName ? (
                    <div><dt className="inline font-medium text-ink">Subida por: </dt>
                      <dd className="inline">{v.uploadedByName}</dd></div>
                  ) : null}
                </dl>
              </div>

              <VersionPreview versionId={v.id} etiqueta={`la versión ${v.versionNumber}`} />

              {canManage ? (
                <>
                  <details className="rounded-lg border border-hairline bg-paper p-4">
                    <summary className="cursor-pointer text-sm font-medium text-ink">
                      Título, descripción y nota
                    </summary>
                    <div className="mt-3">
                      <CandidateMetadataForm
                        tutorialId={tutorial.id} versionId={v.id}
                        title={v.title} description={v.description} changeNote={v.changeNote} />
                    </div>
                  </details>
                  <div className="flex flex-wrap items-center gap-4">
                    <PublishVersionForm
                      tutorialId={tutorial.id} versionId={v.id}
                      versionNumber={v.versionNumber} hayVigente={publicada !== null} />
                    <DiscardCandidateForm
                      tutorialId={tutorial.id} versionId={v.id}
                      versionNumber={v.versionNumber} />
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {/* ================================================================ */}
      {pendientes.length > 0 || fallidas.length > 0 ? (
        <section className="space-y-3">
          <h2 className="eyebrow">Subidas sin terminar</h2>
          <p className="text-sm text-ink-soft">
            Reservas que no llegaron a convertirse en una versión. No se ven en
            ninguna parte y no se pueden publicar.
          </p>
          <ul className="space-y-2">
            {[...pendientes, ...fallidas].map((v) => (
              <li key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-paper p-4">
                <div>
                  <p className="text-sm text-ink">
                    Versión {v.versionNumber} · {TUTORIAL_FILE_STATE_LABEL[v.fileState]}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {v.originalFilename} · reservada hasta {fecha(v.uploadExpiresAt)}
                  </p>
                </div>
                {canManage ? (
                  <DiscardCandidateForm tutorialId={tutorial.id} versionId={v.id}
                    versionNumber={v.versionNumber} />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ================================================================ */}
      <section className="space-y-3">
        <h2 className="eyebrow">Historia</h2>
        {historicas.length === 0 && !publicada ? (
          <p className="rounded-lg border border-hairline bg-paper p-4 text-sm text-ink-soft">
            Este tutorial no ha publicado ninguna versión todavía.
          </p>
        ) : (
          <ul className="space-y-2">
            {versions.filter((v) => v.effectiveFrom !== null).map((v) => {
              const estado = tutorialPublicationState(v);
              return (
                <li key={v.id} className="rounded-lg border border-hairline bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        Versión {v.versionNumber}
                        {v.title ? ` · ${v.title}` : ""}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-soft">
                        Publicada {periodo(v)}
                        {v.publishedByName ? ` · por ${v.publishedByName}` : ""}
                      </p>
                      {v.restoredFromVersionId ? (
                        <p className="mt-0.5 text-xs text-ink-soft">
                          Repone el vídeo de una versión anterior.
                        </p>
                      ) : null}
                      {v.changeNote ? (
                        <p className="mt-1 text-sm text-ink">«{v.changeNote}»</p>
                      ) : null}
                      <p className="mt-1 text-xs text-ink-soft">
                        {v.originalFilename} · {humanFileSize(v.realSizeBytes)}
                        {v.contentHash ? ` · ${v.contentHash.slice(0, 12)}…` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-hairline bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                      {TUTORIAL_PUBLICATION_LABEL[estado]}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    <VersionPreview versionId={v.id}
                      etiqueta={`la versión ${v.versionNumber}`} />
                    {canManage && estado === "historical" ? (
                      <RestoreVersionForm
                        tutorialId={tutorial.id} versionId={v.id}
                        versionNumber={v.versionNumber} periodo={periodo(v)} />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-sm text-ink-soft">
          Nada de esto se borra. Una versión publicada queda con su periodo, y
          volver a usar su vídeo crea una versión nueva en lugar de reescribir la
          antigua.
        </p>
      </section>
    </div>
  );
}
