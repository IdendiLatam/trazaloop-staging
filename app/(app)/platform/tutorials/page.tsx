export const dynamic = "force-dynamic";

import Link from "next/link";

import { listTutorialsAction } from "@/server/actions/tutorials-admin";
import {
  CreateTutorialForm, CreatePublicHomeVideoForm, RetireFromHomeForm,
} from "@/components/domain/tutorials/tutorial-admin-forms";
import { PAGE_KEYS, PAGE_KEY_EXCLUSIONS } from "@/lib/modules/page-keys";
import { COMMERCIAL_MODULES } from "@/lib/modules/catalog";
import {
  TUTORIAL_CONSOLE_UNAVAILABLE, TUTORIAL_FILE_STATE_LABEL, tutorialCoverageLabel,
} from "@/lib/domain/tutorial-admin";

export const metadata = { title: "Tutoriales · Plataforma" };

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Trazaloop · PE-03B2 · La consola de tutoriales.
 *
 * Los filtros se resuelven en el SERVIDOR, como en la consola de ayuda: filtrar
 * en el navegador sobre una lista parcial enseña «tres resultados» cuando hay
 * treinta, y nadie lo nota hasta que falta uno.
 *
 * La lista se arma con TRES consultas, no una por fila. Ver
 * `listTutorialsForConsole`.
 */
export default async function PlatformTutorialsPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await searchParams;
  const filtros = {
    search: uno(params.q) || null,
    moduleKey: uno(params.modulo) || null,
    tutorialType: uno(params.tipo) || null,
    coverage: uno(params.cobertura) || null,
  };
  const { rows, canManage, unavailable } = await listTutorialsAction(filtros);

  const nombrePantalla = (key: string | null) =>
    (key ? PAGE_KEYS.find((p) => p.key === key)?.label : null) ?? key ?? "—";

  const conTutorial = new Set(rows.map((r) => r.pageKey).filter(Boolean) as string[]);
  const disponibles = PAGE_KEYS
    .filter((p) => !conTutorial.has(p.key))
    .map((p) => ({ key: p.key, label: p.label }));

  const bienvenida = rows.filter((r) => r.tutorialType === "welcome");
  const portada = rows.filter((r) => r.tutorialType === "public_home");
  // COMMERCIAL-UX-01E.2 · ACTIVO y RETIRADO no son lo mismo, y confundirlos
  // cerraba el paso: la sección enseñaba el retirado, daba por hecho que ya
  // había uno y escondía el formulario. Resultado: quitabas el vídeo de la
  // portada y te quedabas sin poder poner otro.
  const portadaActiva = portada.filter((r) => r.status === "active");
  const portadaRetirada = portada.filter((r) => r.status !== "active");
  const dePagina = rows.filter((r) => r.tutorialType === "page");

  // La cobertura se cuenta sobre el REGISTRO, no sobre lo que hay: lo que
  // interesa saber es cuántas pantallas registradas tienen vídeo, no qué
  // porcentaje de los tutoriales creados lo tiene.
  const conVideo = dePagina.filter((r) => r.current).length;

  // PE-03B4 · La cobertura, POR MÓDULO.
  //
  // El total solo decía «cuántas». Con 152 pantallas registradas eso ya no
  // ayuda a decidir por dónde seguir grabando: lo que hace falta saber es qué
  // módulo va por detrás.
  const creadoPorClave = new Map(dePagina.map((r) => [r.pageKey, r]));
  const porModulo = [
    ...COMMERCIAL_MODULES.map((m) => ({ key: m.key, name: m.name })),
    { key: "platform", name: "Transversal" },
  ]
    .map((m) => {
      const pantallas = PAGE_KEYS.filter((p) => p.module === m.key);
      const creados = pantallas.filter((p) => creadoPorClave.has(p.key));
      return {
        ...m,
        pantallas: pantallas.length,
        conTutorial: creados.length,
        conVideo: creados.filter((p) => creadoPorClave.get(p.key)?.current).length,
      };
    })
    // Un módulo sin ninguna pantalla registrada no se enseña: sería una fila de
    // ceros que no dice nada. Construcción todavía no tiene producto.
    .filter((m) => m.pantallas > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Plataforma</p>
        <h1 className="text-2xl font-semibold tracking-tight">Tutoriales</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Los vídeos que explican cada pantalla, y el de bienvenida. Se suben y se
          publican desde aquí, sin desplegar. Subir un vídeo{" "}
          <strong className="font-medium text-ink">no lo publica</strong>: primero
          se revisa.
        </p>
      </header>

      {unavailable ? (
        <div role="status" className="rounded-lg border border-amber/40 bg-amber/5 p-4">
          <p className="text-sm font-medium text-ink">No se pudo consultar la lista</p>
          <p className="mt-1 text-sm text-ink-soft">{TUTORIAL_CONSOLE_UNAVAILABLE}</p>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="eyebrow">Cobertura</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-hairline bg-surface p-4">
            <p className="text-2xl font-semibold text-ink">{PAGE_KEYS.length}</p>
            <p className="text-sm text-ink-soft">pantallas en el registro</p>
          </div>
          <div className="rounded-lg border border-hairline bg-surface p-4">
            <p className="text-2xl font-semibold text-ink">{dePagina.length}</p>
            <p className="text-sm text-ink-soft">con tutorial creado</p>
          </div>
          <div className="rounded-lg border border-hairline bg-surface p-4">
            <p className="text-2xl font-semibold text-ink">{conVideo}</p>
            <p className="text-sm text-ink-soft">con vídeo publicado</p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">Cobertura de tutoriales por módulo</caption>
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wider text-ink-soft">
                <th scope="col" className="px-4 py-2 font-semibold">Módulo</th>
                <th scope="col" className="px-4 py-2 font-semibold">Pantallas</th>
                <th scope="col" className="px-4 py-2 font-semibold">Con tutorial</th>
                <th scope="col" className="px-4 py-2 font-semibold">Con vídeo</th>
                <th scope="col" className="px-4 py-2 font-semibold">Sin vídeo</th>
              </tr>
            </thead>
            <tbody>
              {porModulo.map((m) => (
                <tr key={m.key} className="border-b border-hairline last:border-0">
                  <th scope="row" className="px-4 py-2 text-left font-medium text-ink">
                    {m.name}
                  </th>
                  <td className="code px-4 py-2">{m.pantallas}</td>
                  <td className="code px-4 py-2">{m.conTutorial}</td>
                  <td className="code px-4 py-2">{m.conVideo}</td>
                  <td className="code px-4 py-2">{m.pantallas - m.conVideo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-ink-soft">
          Que una pantalla no tenga vídeo no es un fallo: mientras no lo tenga,
          dice que el tutorial está en actualización.
        </p>
        <p className="text-sm text-ink-soft">
          Hay además{" "}
          <strong className="font-medium text-ink">{PAGE_KEY_EXCLUSIONS.length}</strong>{" "}
          pantallas excluidas a propósito —autenticación, textos legales,
          superficies de impresión y esta misma consola—, y no cuentan como
          cobertura pendiente.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="eyebrow">Buscar y filtrar</h2>
        <form method="get" className="grid gap-3 rounded-lg border border-hairline bg-surface p-4 sm:grid-cols-3">
          <label className="block sm:col-span-3">
            <span className="mb-1.5 block text-sm font-medium text-ink">Pantalla o nombre</span>
            <input name="q" type="search" defaultValue={filtros.search ?? ""}
              placeholder="parte de la clave de pantalla o del nombre"
              className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:border-loop" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Módulo</span>
            <select name="modulo" defaultValue={filtros.moduleKey ?? ""}
              className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:border-loop">
              <option value="">Todos</option>
              {COMMERCIAL_MODULES.map((m) => (
                <option key={m.key} value={m.key}>{m.name}</option>
              ))}
              <option value="platform">Transversal</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Tipo</span>
            <select name="tipo" defaultValue={filtros.tutorialType ?? ""}
              className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:border-loop">
              <option value="">Todos</option>
              <option value="page">Tutorial de pantalla</option>
              <option value="welcome">Vídeo de bienvenida</option>
              <option value="public_home">Vídeo de la portada pública</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Estado del vídeo</span>
            <select name="cobertura" defaultValue={filtros.coverage ?? ""}
              className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:border-loop">
              <option value="">Todos</option>
              <option value="con_video">Con vídeo publicado</option>
              <option value="con_candidata">Con una versión sin publicar</option>
              <option value="sin_video">Sin vídeo todavía</option>
            </select>
          </label>
          <div className="flex items-end gap-2 sm:col-span-3">
            <button type="submit"
              className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium hover:border-loop">
              Filtrar
            </button>
            <Link href="/platform/tutorials"
              className="text-sm text-ink-soft hover:text-loop hover:underline">
              Limpiar
            </Link>
          </div>
        </form>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* COMMERCIAL-UX-01E · El de la portada va primero porque es el único
          que ve gente de fuera, y el único del que conviene saber de un
          vistazo si está publicado. */}
      <section className="space-y-3">
        <h2 className="eyebrow">Vídeo de la portada pública</h2>
        <p className="text-sm text-ink-soft">
          Se enseña en un aviso de la portada a quien todavía no ha entrado.
          Solo puede haber uno activo: para cambiarlo, publícale una versión
          nueva —y a quien ya lo hubiera descartado le volverá a aparecer— o
          retira éste antes de crear otro.
        </p>
        {portadaActiva.length === 0 ? (
          <div className="rounded-lg border border-hairline bg-paper p-4">
            <p className="text-sm text-ink-soft">
              No hay ninguno activo. Mientras no lo haya, la portada no enseña
              ningún aviso.
            </p>
            <CreatePublicHomeVideoForm />
          </div>
        ) : (
          portadaActiva.map((r) => (
            <div key={r.id} className="space-y-2">
              <FilaTutorial row={r} nombre="Portada pública" />
              {/* Quitar la identidad, no solo su vídeo: mientras siga activa
                  ocupa el único hueco de portada y no se puede poner otra. */}
              <RetireFromHomeForm tutorialId={r.id} />
            </div>
          ))
        )}

        {/* Los retirados se enseñan, pero aparte y sin acciones: son historia.
            Mezclarlos con el activo fue justamente lo que cerró el paso. */}
        {portadaRetirada.length > 0 ? (
          <details className="rounded-lg border border-hairline bg-paper p-4">
            <summary className="cursor-pointer text-sm text-ink-soft">
              {portadaRetirada.length} retirado(s) · su historia se conserva
            </summary>
            <div className="mt-3 space-y-2">
              {portadaRetirada.map((r) => (
                <FilaTutorial key={r.id} row={r} nombre="Portada pública · retirado" />
              ))}
            </div>
          </details>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="eyebrow">Vídeo de bienvenida</h2>
        {bienvenida.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-paper p-4 text-sm text-ink-soft">
            No aparece con los filtros actuales.
          </p>
        ) : (
          bienvenida.map((r) => <FilaTutorial key={r.id} row={r} nombre="Bienvenida a Trazaloop" />)
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="eyebrow">Tutoriales de pantalla</h2>
        {dePagina.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-paper p-4 text-sm text-ink-soft">
            {filtros.search || filtros.moduleKey || filtros.coverage
              ? "Ninguno coincide con esos filtros."
              : "Todavía no hay ningún tutorial de pantalla. Crea el primero abajo."}
          </p>
        ) : (
          <ul className="space-y-2">
            {dePagina.map((r) => (
              <li key={r.id}>
                <FilaTutorial row={r} nombre={nombrePantalla(r.pageKey)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {canManage ? (
        <section className="space-y-3">
          <h2 className="eyebrow">Crear un tutorial de pantalla</h2>
          <div className="rounded-lg border border-hairline bg-surface p-5">
            <CreateTutorialForm pages={disponibles} />
          </div>
        </section>
      ) : (
        <p className="rounded-lg border border-hairline bg-paper p-4 text-sm text-ink-soft">
          Tu cuenta puede consultar los tutoriales y su historia, pero no subir ni
          publicar vídeos.
        </p>
      )}
    </div>
  );
}

function FilaTutorial({
  row, nombre,
}: {
  row: Awaited<ReturnType<typeof listTutorialsAction>>["rows"][number];
  nombre: string;
}) {
  const cobertura = tutorialCoverageLabel(row);
  const tono = cobertura.tone === "ok"
    ? "border-loop/40 bg-loop/5 text-loop-deep"
    : cobertura.tone === "pending"
      ? "border-amber/40 bg-amber/5 text-ink"
      : "border-hairline bg-paper text-ink-soft";

  return (
    <Link href={`/platform/tutorials/${row.id}`}
      className="block rounded-lg border border-hairline bg-surface p-4 hover:border-loop">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{nombre}</p>
          {row.pageKey ? (
            <p className="mt-0.5 truncate text-xs text-ink-soft">{row.pageKey}</p>
          ) : null}
          <p className="mt-1 text-sm text-ink-soft">{row.title}</p>
        </div>
        {/* El estado se dice con palabras, no solo con un color. */}
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tono}`}>
          {cobertura.text}
        </span>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-soft">
        <div>
          <dt className="inline font-medium text-ink">Publicada: </dt>
          <dd className="inline">
            {row.current ? `versión ${row.current.versionNumber}` : "ninguna"}
          </dd>
        </div>
        {row.candidate ? (
          <div>
            <dt className="inline font-medium text-ink">Sin publicar: </dt>
            <dd className="inline">
              versión {row.candidate.versionNumber} ·{" "}
              {TUTORIAL_FILE_STATE_LABEL[row.candidate.fileState] ?? row.candidate.fileState}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="inline font-medium text-ink">Historia: </dt>
          <dd className="inline">
            {row.publishedCount === 0 ? "sin publicaciones"
              : `${row.publishedCount} publicación(es)`}
          </dd>
        </div>
        {row.failedCount > 0 ? (
          <div>
            <dt className="inline font-medium text-ink">Subidas fallidas: </dt>
            <dd className="inline">{row.failedCount}</dd>
          </div>
        ) : null}
        {row.status === "retired" ? (
          <div><dd className="inline font-medium text-ink">Tutorial retirado</dd></div>
        ) : null}
      </dl>
    </Link>
  );
}
