"use client";

import { useState } from "react";
import Link from "next/link";
import {
  computeQualityMapLayout,
  shouldShowAllEdgeLabels,
  type MapLayoutEdgeInput,
  type MapLayoutNodeInput,
} from "@/lib/domain/quality-map-layout";

/**
 * Trazaloop Quality · QUALITY-01.2 · El mapa de procesos, dibujado.
 *
 * Hasta ahora el mapa era una lista de tarjetas agrupadas por categoría: decía
 * qué procesos hay y de qué tipo son, pero no quién alimenta a quién. Las
 * relaciones ya estaban registradas en cada proceso —salida de origen, entrada
 * de destino— y no se aprovechaban en ninguna parte. Capture once, reuse many
 * times: aquí se reutilizan.
 *
 * Qué se dibuja y por qué así:
 *
 *  · Las BANDAS por categoría se conservan. Son la lectura gerencial de
 *    QUALITY-01 y siguen siendo correctas.
 *  · Las FLECHAS salen de las relaciones configuradas, jamás de un trazo hecho
 *    a mano. Nadie vuelve a dibujar lo que ya registró.
 *  · Las ETIQUETAS «salida → entrada» se muestran completas mientras el mapa
 *    se lee sin saturarse; a partir de ahí solo al señalar o seleccionar, para
 *    que un mapa con muchas relaciones siga siendo legible.
 *  · SELECCIONAR un proceso resalta lo que recibe y lo que entrega, atenúa el
 *    resto y abre un detalle lateral con los nombres exactos.
 *  · Debajo del dibujo va SIEMPRE la lista de relaciones en texto. Un diagrama
 *    puede resultar apretado en una pantalla estrecha; la lista no falla nunca,
 *    se puede leer con un lector de pantalla y dice la dirección con palabras.
 */

type NodeInput = MapLayoutNodeInput & {
  processStatus: string;
  ownerPositionName: string | null;
};

const INCOMING_COLOR = "#B45309"; // ámbar: lo que ENTRA
const OUTGOING_COLOR = "#0F766E"; // verde: lo que SALE
const NEUTRAL_COLOR = "#94A3B8";

export function QualityMapCanvas({
  bands,
  nodes,
  edges,
  frozen,
}: {
  bands: { categoryCode: string; label: string; nodes: NodeInput[] }[];
  nodes: NodeInput[];
  edges: MapLayoutEdgeInput[];
  /** true cuando lo que se muestra es el snapshot de una versión publicada. */
  frozen: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const layout = computeQualityMapLayout({ bands, edges });
  const nodeById = new Map(nodes.map((n) => [n.processId, n]));
  const showAllLabels = shouldShowAllEdgeLabels(layout.edges.length);

  const focus = selected ?? hovered;
  const incomingOf = (processId: string) =>
    layout.edges.filter((e) => e.targetProcessId === processId);
  const outgoingOf = (processId: string) =>
    layout.edges.filter((e) => e.sourceProcessId === processId);

  type EdgeRole = "neutral" | "incoming" | "outgoing" | "dimmed";

  function edgeRole(edge: { sourceProcessId: string; targetProcessId: string }): EdgeRole {
    if (focus === null) return "neutral";
    if (edge.sourceProcessId === focus) return "outgoing";
    if (edge.targetProcessId === focus) return "incoming";
    return "dimmed";
  }

  const colorFor = (role: EdgeRole) =>
    role === "incoming" ? INCOMING_COLOR : role === "outgoing" ? OUTGOING_COLOR : NEUTRAL_COLOR;
  const markerFor = (role: EdgeRole) =>
    role === "incoming" ? "incoming" : role === "outgoing" ? "outgoing" : "neutral";

  const selectedNode = selected ? nodeById.get(selected) ?? null : null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-hairline bg-surface p-2">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width="100%"
          style={{ maxWidth: layout.width, height: "auto" }}
          role="img"
          aria-label="Mapa de procesos con las relaciones entre ellos"
        >
          <defs>
            {[
              ["neutral", NEUTRAL_COLOR],
              ["incoming", INCOMING_COLOR],
              ["outgoing", OUTGOING_COLOR],
            ].map(([key, color]) => (
              <marker
                key={key}
                id={`quality-arrow-${key}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
              </marker>
            ))}
          </defs>

          {/* Bandas por categoría */}
          {layout.bands.map((band) => (
            <text
              key={band.categoryCode}
              x={band.labelX}
              y={band.labelY}
              className="fill-ink-soft"
              style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}
            >
              {band.label.toUpperCase()}
            </text>
          ))}

          {/* Flechas: DEBAJO de los bloques, para que nunca los tapen */}
          {layout.edges.map((edge) => {
            const role = edgeRole(edge);
            const dimmed = role === "dimmed";
            return (
              <path
                key={edge.id}
                d={edge.path}
                fill="none"
                stroke={colorFor(role)}
                strokeWidth={role === "neutral" || dimmed ? 1.4 : 2.2}
                markerEnd={`url(#quality-arrow-${markerFor(role)})`}
                opacity={dimmed ? 0.18 : 1}
              />
            );
          })}

          {/* Bloques */}
          {layout.nodes.map((node) => {
            const data = nodeById.get(node.processId);
            const isFocus = focus === node.processId;
            const related =
              focus !== null &&
              layout.edges.some(
                (e) =>
                  (e.sourceProcessId === focus && e.targetProcessId === node.processId) ||
                  (e.targetProcessId === focus && e.sourceProcessId === node.processId)
              );
            const dimmed = focus !== null && !isFocus && !related;
            const retired = data?.processStatus === "retired";
            return (
              <g
                key={node.processId}
                opacity={dimmed ? 0.35 : 1}
                onMouseEnter={() => setHovered(node.processId)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected((s) => (s === node.processId ? null : node.processId))}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={8}
                  className={isFocus ? "fill-loop/10" : "fill-paper"}
                  stroke={isFocus ? OUTGOING_COLOR : "#CBD5E1"}
                  strokeWidth={isFocus ? 2 : 1}
                  strokeDasharray={retired ? "4 3" : undefined}
                />
                <text
                  x={node.centerX}
                  y={node.y + 26}
                  textAnchor="middle"
                  className="fill-ink"
                  style={{ fontSize: 12, fontWeight: 600 }}
                >
                  {truncate(node.processName, 26)}
                </text>
                <text
                  x={node.centerX}
                  y={node.y + 42}
                  textAnchor="middle"
                  className="fill-ink-soft"
                  style={{ fontSize: 10 }}
                >
                  {truncate(
                    [node.processCode, data?.ownerPositionName ?? "Sin cargo propietario"]
                      .filter(Boolean)
                      .join(" · "),
                    32
                  )}
                </text>
                {retired ? (
                  <text
                    x={node.centerX}
                    y={node.y + 56}
                    textAnchor="middle"
                    className="fill-ink-soft"
                    style={{ fontSize: 9, fontStyle: "italic" }}
                  >
                    retirado
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* Y las etiquetas ENCIMA de todo: son texto pequeño y cualquier
              bloque que las cubriera las volvería ilegibles. */}
          {layout.edges.map((edge) => {
            const role = edgeRole(edge);
            if (role === "dimmed") return null;
            if (!showAllLabels && role === "neutral") return null;
            return (
              <EdgeLabel
                key={`label-${edge.id}`}
                x={edge.labelX}
                y={edge.labelY}
                text={edge.label}
                color={colorFor(role)}
              />
            );
          })}
        </svg>
      </div>

      <p className="text-xs text-ink-soft">
        Las flechas salen de las relaciones registradas en cada proceso: no se dibujan a mano.
        {frozen
          ? " Esta versión está publicada, así que muestra las relaciones tal como estaban el día en que se publicó."
          : " Este borrador refleja las relaciones vigentes ahora mismo."}
        {layout.edges.length > 0
          ? " Pulsa un proceso para ver de quién recibe y a quién entrega."
          : null}
      </p>

      {/* Detalle del proceso seleccionado */}
      {selectedNode ? (
        <aside className="rounded-lg border border-loop/40 bg-loop/5 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{selectedNode.processName}</h3>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[11px] text-ink-soft hover:text-ink"
            >
              Cerrar
            </button>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <FlowList
              title="Recibe de"
              color={INCOMING_COLOR}
              items={incomingOf(selectedNode.processId).map((e) => ({
                id: e.id,
                processName: nodeById.get(e.sourceProcessId)?.processName ?? "—",
                label: e.label,
              }))}
              emptyLabel="Ningún proceso del mapa lo alimenta."
            />
            <FlowList
              title="Entrega a"
              color={OUTGOING_COLOR}
              items={outgoingOf(selectedNode.processId).map((e) => ({
                id: e.id,
                processName: nodeById.get(e.targetProcessId)?.processName ?? "—",
                label: e.label,
              }))}
              emptyLabel="No alimenta a ningún proceso del mapa."
            />
          </div>
          <Link
            href={`/quality/processes/${selectedNode.processId}`}
            className="mt-2 inline-block text-xs font-medium text-loop hover:underline"
          >
            Abrir la ficha del proceso →
          </Link>
        </aside>
      ) : null}

      {/* La misma verdad, en texto. Nunca depende de que el dibujo quepa. */}
      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Relaciones del mapa
        </h3>
        {layout.edges.length === 0 ? (
          <p className="text-xs text-ink-soft">
            Todavía no hay relaciones entre los procesos del mapa. Se registran en la ficha de cada
            proceso, en «Relaciones con otros procesos», y aparecen aquí solas.
          </p>
        ) : (
          <ul className="space-y-1">
            {layout.edges.map((e) => (
              <li key={e.id} className="rounded-md border border-hairline bg-paper px-2 py-1.5 text-xs">
                <span className="font-medium">
                  {nodeById.get(e.sourceProcessId)?.processName ?? "—"}
                </span>
                <span className="text-ink-soft"> — {e.label} → </span>
                <span className="font-medium">
                  {nodeById.get(e.targetProcessId)?.processName ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {layout.danglingEdgeCount > 0 ? (
          <p className="text-xs text-ink-soft">
            Hay {layout.danglingEdgeCount}{" "}
            {layout.danglingEdgeCount === 1 ? "relación más" : "relaciones más"} cuyo otro extremo
            no está colocado en este mapa. No se dibujan porque no habría a dónde llevarlas.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function FlowList({
  title,
  color,
  items,
  emptyLabel,
}: {
  title: string;
  color: string;
  items: { id: string; processName: string; label: string }[];
  emptyLabel: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-ink-soft">{emptyLabel}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((i) => (
            <li key={i.id} className="text-xs">
              <span className="font-medium">{i.processName}</span>
              <span className="block text-ink-soft">{i.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Etiqueta de flecha con fondo, para que se lea aunque cruce otra línea. El
 *  texto completo queda en <title>, de modo que truncarlo no pierda nada. */
function EdgeLabel({ x, y, text, color }: { x: number; y: number; text: string; color: string }) {
  const shown = truncate(text, 44);
  const width = shown.length * 5.4 + 10;
  return (
    <g>
      <title>{text}</title>
      <rect
        x={x - width / 2}
        y={y - 8}
        width={width}
        height={15}
        rx={4}
        className="fill-surface"
        opacity={0.94}
      />
      <text x={x} y={y + 3} textAnchor="middle" style={{ fontSize: 9.5, fill: color }}>
        {shown}
      </text>
    </g>
  );
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
