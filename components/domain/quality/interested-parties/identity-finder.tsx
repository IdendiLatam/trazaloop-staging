"use client";

import { useState, useTransition } from "react";
import { searchIdentitiesAction } from "@/server/actions/quality-interested-parties";

/**
 * Trazaloop · STABILIZATION-03 · Buscar una identidad ANTES de crearla otra vez.
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN EL LISTADO
 *
 * Los duplicados no nacen en el listado: nacen en el alta. El buscador del
 * listado consulta ANÁLISIS, así que una parte recién registrada y todavía sin
 * analizar no aparecía por ninguna parte —medido: «Comunidad» devolvía 0 con el
 * colectivo ya creado—. Quien no la encontraba la volvía a crear, y la base la
 * aceptaba porque no había ninguna unicidad sobre el nombre.
 *
 * Esto busca IDENTIDADES, con o sin análisis, comparando contra la misma
 * columna normalizada sobre la que manda el índice único: lo que la unicidad
 * considera «el mismo nombre» es exactamente lo que aquí se encuentra. De ahí
 * salen sin esfuerzo el ser insensible a mayúsculas y a acentos.
 *
 * Incluye las retiradas a propósito: si «Empresa ABC» está retirada, lo útil no
 * es dejar que se cree otra, es enseñarla y que se decida reactivarla.
 */
type Fila = {
  id: string; kind: "external_party" | "group";
  name: string; status: string; taxId: string | null; hasAssessment: boolean;
};

const ETIQUETA_ESTADO: Record<string, string> = {
  active: "activa", inactive: "inactiva", retired: "retirada",
};

export function IdentityFinder() {
  const [q, setQ] = useState("");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [pendiente, empezar] = useTransition();

  function buscar() {
    const termino = q.trim();
    if (termino.length < 2) { setFilas(null); return; }
    empezar(async () => {
      const r = await searchIdentitiesAction(termino, { includeRetired: true });
      setFilas((r.rows ?? []) as Fila[]);
    });
  }

  return (
    <div className="space-y-2 rounded-md border border-hairline bg-canvas/40 p-3">
      <p className="text-xs text-ink-soft">
        Antes de registrar una entidad nueva, comprueba si ya existe. La búsqueda
        no distingue mayúsculas ni acentos, e incluye las retiradas.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
          placeholder="Buscar una parte interesada ya registrada"
          aria-label="Buscar una parte interesada ya registrada"
          className="min-w-48 flex-1 rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
        />
        <button
          type="button" onClick={buscar} disabled={pendiente}
          className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:border-loop disabled:opacity-60"
        >
          {pendiente ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {filas === null ? null : filas.length === 0 ? (
        <p className="text-xs text-ink-soft">
          Ninguna identidad registrada coincide. Puedes crearla abajo.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {filas.map((f) => (
            <li key={f.id} className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium text-ink">{f.name}</span>
              <span className="text-xs text-ink-soft">
                {f.kind === "external_party" ? "entidad externa" : "colectivo"}
                {" · "}{ETIQUETA_ESTADO[f.status] ?? f.status}
                {f.taxId ? ` · ${f.taxId}` : ""}
                {f.hasAssessment ? " · ya analizada" : " · sin análisis"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
