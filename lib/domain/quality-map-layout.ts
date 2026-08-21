/**
 * Trazaloop Quality · QUALITY-01.2 · Disposición del mapa de procesos.
 *
 * Lógica PURA: entra la lista de bloques y de relaciones, sale dónde va cada
 * cosa. Ni React, ni DOM, ni medir elementos en el navegador.
 *
 * Por qué se calcula y no se deja al flujo de CSS: las flechas necesitan
 * coordenadas. Con los bloques colocados por el navegador habría que medirlos
 * después de pintarlos, redibujar al cambiar el tamaño y aceptar que la
 * primera pintada sale sin flechas. Con la posición calculada, el SVG se
 * renderiza correcto desde el servidor, se escala solo (viewBox) y —lo que más
 * importa— la disposición se puede PROBAR sin navegador.
 *
 * El mapa conserva las bandas por categoría de QUALITY-01 (Estratégicos,
 * Misionales, Apoyo, Sistema) y añade encima el flujo real entre procesos.
 */

export const MAP_NODE_WIDTH = 190;
export const MAP_NODE_HEIGHT = 64;

const COLUMN_GAP = 36;
const ROW_GAP = 28;
// Alto de la franja del nombre de la banda. También es el espacio en el que se
// escriben los textos de las flechas horizontales, que no caben en el hueco
// entre dos bloques contiguos.
const BAND_LABEL_HEIGHT = 30;
const BAND_BOTTOM_PADDING = 18;
const BAND_GAP = 22;
const CANVAS_PADDING = 18;
const MAX_COLUMNS = 3;

export type MapLayoutNodeInput = {
  processId: string;
  processName: string;
  processCode: string | null;
  categoryCode: string;
  sortOrder: number;
};

export type MapLayoutEdgeInput = {
  id: string;
  sourceProcessId: string;
  targetProcessId: string;
  sourceOutputName: string | null;
  targetInputName: string | null;
  informationItem: string | null;
};

export type MapLayoutNode = MapLayoutNodeInput & {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type MapLayoutBand = {
  categoryCode: string;
  label: string;
  labelX: number;
  labelY: number;
};

export type MapLayoutEdge = {
  id: string;
  sourceProcessId: string;
  targetProcessId: string;
  /** «Materia prima aprobada → Materia prima», ya compuesto para pintar. */
  label: string;
  path: string;
  labelX: number;
  labelY: number;
};

export type MapLayout = {
  width: number;
  height: number;
  bands: MapLayoutBand[];
  nodes: MapLayoutNode[];
  edges: MapLayoutEdge[];
  /** Relaciones cuyos dos extremos NO están ambos en el mapa: no se dibujan,
   *  pero conviene poder decirlo en vez de que desaparezcan en silencio. */
  danglingEdgeCount: number;
};

/** Etiqueta legible de una relación: qué sale y en qué entra. */
export function describeEdge(edge: MapLayoutEdgeInput): string {
  const from = edge.sourceOutputName ?? edge.informationItem;
  const to = edge.targetInputName;
  if (from && to) return `${from} → ${to}`;
  if (from) return from;
  if (to) return `→ ${to}`;
  return "Relación";
}

/** Un punto de anclaje del borde de un bloque. */
type Anchor = { x: number; y: number; dx: number; dy: number };

function anchors(node: MapLayoutNode): Record<"top" | "bottom" | "left" | "right", Anchor> {
  return {
    top: { x: node.centerX, y: node.y, dx: 0, dy: -1 },
    bottom: { x: node.centerX, y: node.y + node.height, dx: 0, dy: 1 },
    left: { x: node.x, y: node.centerY, dx: -1, dy: 0 },
    right: { x: node.x + node.width, y: node.centerY, dx: 1, dy: 0 },
  };
}

/**
 * Elige por dónde sale y por dónde entra la flecha.
 *
 * Regla simple y predecible: si los dos bloques están a la misma altura, la
 * flecha va de costado; si uno está por encima del otro, va de arriba abajo.
 * Sale siempre por la cara que mira al destino, de modo que ninguna flecha
 * atraviesa el bloque del que nace.
 */
function chooseAnchors(source: MapLayoutNode, target: MapLayoutNode): { from: Anchor; to: Anchor } {
  const a = anchors(source);
  const b = anchors(target);
  const sameRow = Math.abs(source.centerY - target.centerY) < MAP_NODE_HEIGHT;
  if (sameRow) {
    return source.centerX <= target.centerX
      ? { from: a.right, to: b.left }
      : { from: a.left, to: b.right };
  }
  return source.centerY < target.centerY
    ? { from: a.bottom, to: b.top }
    : { from: a.top, to: b.bottom };
}

/**
 * Curva de la flecha. `fan` separa las relaciones que unen el mismo par de
 * bloques: sin él se superpondrían exactamente y donde hay tres flujos
 * distintos se vería uno solo — justo lo que el encargo pide evitar.
 */
function buildPath(from: Anchor, to: Anchor, fan: number): { path: string; midX: number; midY: number } {
  const distance = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const pull = Math.max(18, Math.min(110, distance * 0.45));

  // La separación es PERPENDICULAR a la recta origen→destino, y la misma para
  // los dos puntos de control. Aplicarla a la normal de cada extremo —que
  // apuntan en sentidos opuestos— curvaba la línea pero dejaba el punto medio
  // exactamente donde estaba: dos relaciones entre el mismo par acababan con
  // la etiqueta superpuesta, que es justo lo que la separación viene a evitar.
  const spread = fan * 26;
  const perpX = (-(to.y - from.y) / distance) * spread;
  const perpY = ((to.x - from.x) / distance) * spread;

  const c1 = { x: from.x + from.dx * pull + perpX, y: from.y + from.dy * pull + perpY };
  const c2 = { x: to.x + to.dx * pull + perpX, y: to.y + to.dy * pull + perpY };

  // Punto medio exacto de la cúbica en t = 0.5.
  const midX = (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8;
  const midY = (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8;

  return {
    path: `M ${round(from.x)} ${round(from.y)} C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(to.x)} ${round(to.y)}`,
    midX: round(midX),
    midY: round(midY),
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Ordena los bloques de UNA banda siguiendo el flujo: quien alimenta va antes
 * que quien recibe.
 *
 * Sin esto los bloques salían en orden alfabético, y en el caso más común del
 * encargo —Compras, Producción, Despachos— eso pone Despachos EN MEDIO: la
 * flecha de Compras a Producción tiene que cruzar por encima del bloque que
 * está entre ambos y el mapa se lee al revés de como funciona la empresa.
 *
 * Es una ordenación por niveles (Kahn): nivel 0 los que no reciben de nadie
 * dentro de la banda, y cada uno después va un nivel más allá que su
 * alimentador. Si hubiera un ciclo —A alimenta a B y B a A, que es legítimo en
 * un sistema de gestión— los que queden sin resolver conservan el orden que
 * traían: se prefiere un mapa correcto y estable a uno «perfecto» que dependa
 * de por dónde se empiece a mirar.
 */
function orderBandByFlow<T extends MapLayoutNodeInput>(
  nodes: readonly T[],
  edges: readonly MapLayoutEdgeInput[]
): T[] {
  const inBand = new Set(nodes.map((n) => n.processId));
  const internal = edges.filter(
    (e) =>
      inBand.has(e.sourceProcessId) &&
      inBand.has(e.targetProcessId) &&
      e.sourceProcessId !== e.targetProcessId
  );
  if (internal.length === 0) return [...nodes];

  const rank = new Map<string, number>(nodes.map((n) => [n.processId, 0]));
  const pending = new Map<string, number>();
  for (const id of inBand) pending.set(id, 0);
  for (const e of internal) pending.set(e.targetProcessId, (pending.get(e.targetProcessId) ?? 0) + 1);

  const queue = [...inBand].filter((id) => (pending.get(id) ?? 0) === 0);
  let resolved = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    resolved += 1;
    for (const e of internal.filter((x) => x.sourceProcessId === id)) {
      rank.set(e.targetProcessId, Math.max(rank.get(e.targetProcessId) ?? 0, (rank.get(id) ?? 0) + 1));
      const left = (pending.get(e.targetProcessId) ?? 0) - 1;
      pending.set(e.targetProcessId, left);
      if (left === 0) queue.push(e.targetProcessId);
    }
  }
  // Ciclo: se conserva el orden de entrada, que ya es determinista.
  if (resolved < inBand.size) return [...nodes];

  const original = new Map(nodes.map((n, i) => [n.processId, i]));
  return [...nodes].sort(
    (a, b) =>
      (rank.get(a.processId) ?? 0) - (rank.get(b.processId) ?? 0) ||
      original.get(a.processId)! - original.get(b.processId)!
  );
}

/** ¿El punto cae dentro de algún bloque? Las etiquetas no deben aterrizar ahí. */
function collidingNode(nodes: readonly MapLayoutNode[], x: number, y: number): MapLayoutNode | null {
  return (
    nodes.find(
      (n) => x >= n.x - 6 && x <= n.x + n.width + 6 && y >= n.y - 6 && y <= n.y + n.height + 6
    ) ?? null
  );
}

/**
 * Coloca bloques y flechas.
 *
 * `bands` llega ya ordenado y agrupado por quien llama (groupMapNodesByCategory
 * de lib/domain/quality-processes), para no duplicar aquí el orden canónico de
 * las cuatro categorías ni el criterio de las categorías propias de la empresa.
 */
export function computeQualityMapLayout(input: {
  bands: readonly { categoryCode: string; label: string; nodes: readonly MapLayoutNodeInput[] }[];
  edges: readonly MapLayoutEdgeInput[];
  columns?: number;
}): MapLayout {
  const columns = Math.max(1, input.columns ?? MAX_COLUMNS);
  const contentWidth = columns * MAP_NODE_WIDTH + (columns - 1) * COLUMN_GAP;
  const width = contentWidth + CANVAS_PADDING * 2;

  const nodes: MapLayoutNode[] = [];
  const bands: MapLayoutBand[] = [];
  let cursorY = CANVAS_PADDING;

  for (const band of input.bands) {
    bands.push({
      categoryCode: band.categoryCode,
      label: band.label,
      labelX: CANVAS_PADDING,
      labelY: cursorY + 12,
    });
    const top = cursorY + BAND_LABEL_HEIGHT;

    const rows = Math.max(1, Math.ceil(band.nodes.length / columns));
    const ordered = orderBandByFlow(band.nodes, input.edges);
    ordered.forEach((node, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      // Los bloques de la última fila se centran: una banda con un solo
      // proceso se lee mejor centrada que pegada a la izquierda.
      const itemsInRow = Math.min(columns, band.nodes.length - row * columns);
      const rowWidth = itemsInRow * MAP_NODE_WIDTH + (itemsInRow - 1) * COLUMN_GAP;
      const rowStart = CANVAS_PADDING + (contentWidth - rowWidth) / 2;

      const x = rowStart + column * (MAP_NODE_WIDTH + COLUMN_GAP);
      const y = top + row * (MAP_NODE_HEIGHT + ROW_GAP);
      nodes.push({
        ...node,
        x: round(x),
        y: round(y),
        width: MAP_NODE_WIDTH,
        height: MAP_NODE_HEIGHT,
        centerX: round(x + MAP_NODE_WIDTH / 2),
        centerY: round(y + MAP_NODE_HEIGHT / 2),
      });
    });

    cursorY =
      top + rows * MAP_NODE_HEIGHT + (rows - 1) * ROW_GAP + BAND_BOTTOM_PADDING + BAND_GAP;
  }

  const height = Math.max(cursorY - BAND_GAP + CANVAS_PADDING, CANVAS_PADDING * 2);

  const nodeById = new Map(nodes.map((n) => [n.processId, n]));
  const fanCounter = new Map<string, number>();
  const edges: MapLayoutEdge[] = [];
  let danglingEdgeCount = 0;

  for (const edge of input.edges) {
    const source = nodeById.get(edge.sourceProcessId);
    const target = nodeById.get(edge.targetProcessId);
    if (!source || !target || source.processId === target.processId) {
      danglingEdgeCount += 1;
      continue;
    }
    // Las relaciones entre el mismo par se abren en abanico a ambos lados.
    const pairKey = [edge.sourceProcessId, edge.targetProcessId].sort().join("|");
    const seen = fanCounter.get(pairKey) ?? 0;
    fanCounter.set(pairKey, seen + 1);
    const fan = seen === 0 ? 0 : Math.ceil(seen / 2) * (seen % 2 === 1 ? 1 : -1);

    const { from, to } = chooseAnchors(source, target);
    const { path, midX, midY } = buildPath(from, to, fan);

    // Dónde cabe el texto de la flecha.
    //
    // Entre dos bloques de la MISMA fila solo hay el hueco de la columna, y
    // «Materia prima aprobada → Materia prima» no cabe ahí: se salía por
    // ambos lados y aterrizaba encima del nombre de los procesos vecinos. Por
    // eso el texto de una flecha horizontal se coloca por ENCIMA de la fila,
    // donde tiene todo el ancho de la banda para él.
    //
    // Una flecha vertical, en cambio, cruza el espacio entre bandas: ahí el
    // punto medio es justo el sitio correcto.
    // `seen` (0, 1, 2…) apila los textos de varias relaciones entre el mismo
    // par: sin él, dos flechas horizontales entre los mismos bloques
    // escribirían su texto exactamente en el mismo sitio.
    const horizontal = from.dy === 0 && to.dy === 0;
    const labelX = midX;
    let labelY = horizontal ? round(Math.min(source.y, target.y) - 9 - seen * 14) : midY;

    // Y si aun así cayera sobre un bloque, se aparta al borde más cercano. Si
    // no encuentra sitio se queda donde está: la lista de relaciones que va
    // debajo del dibujo dice lo mismo y nunca falla.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const clash = collidingNode(nodes, labelX, labelY);
      if (!clash) break;
      const above = labelY <= clash.y + clash.height / 2;
      labelY = round(above ? clash.y - 12 : clash.y + clash.height + 12);
    }

    edges.push({
      id: edge.id,
      sourceProcessId: edge.sourceProcessId,
      targetProcessId: edge.targetProcessId,
      label: describeEdge(edge),
      path,
      labelX,
      labelY,
    });
  }

  return { width, height, bands, nodes, edges, danglingEdgeCount };
}

/**
 * ¿Conviene mostrar TODAS las etiquetas de las flechas a la vez?
 *
 * Con pocas relaciones, verlas escritas es justo lo que hace útil el mapa. A
 * partir de cierto número el dibujo se vuelve ilegible y las etiquetas pasan a
 * mostrarse solo al señalar o seleccionar. El umbral vive aquí, con el resto de
 * la disposición, y no repartido por el componente.
 */
export const EDGE_LABEL_LIMIT = 6;

export function shouldShowAllEdgeLabels(edgeCount: number): boolean {
  return edgeCount > 0 && edgeCount <= EDGE_LABEL_LIMIT;
}
