/**
 * Trazaloop · EXPORT-01 · El contrato del registro de exportaciones.
 *
 * Tipos PUROS, sin `server-only`, para que una prueba estática pueda leer el
 * registro y comprobar que ninguna entidad se quedó sin declarar.
 */
import type { PrintDocument } from "./print-model";

export type ExportModule = "quality" | "trazadocs" | "cpr" | "textiles" | "core";

/** Qué rol hace falta. La autorización REAL la impone la base con RLS; esto es
 *  la primera puerta, no la única. */
export type ExportPermission = "member" | "manager" | "governor";

/** Un filtro que un listado admite. El navegador solo puede mandar valores de
 *  ESTE catálogo: nunca una consulta, nunca una tabla, nunca SQL (§13, §15). */
export type ExportFilterSpec = {
  key: string;
  label: string;
  /** `enum` restringe a `values`; `uuid` valida forma y pertenencia; `text` se
   *  limita en longitud y se usa solo para buscar. */
  kind: "enum" | "uuid" | "text" | "date";
  values?: readonly string[];
};

export type ExportKind = "detail" | "list" | "historical";

export type ExportRequest = {
  organizationId: string;
  roleCode: string;
  userId: string;
  /** Para `detail` e `historical`. */
  id?: string | null;
  /** Solo claves declaradas en `filters`, ya validadas. */
  filters: Record<string, string>;
  /** Momento de generación, inyectado para que las pruebas sean deterministas. */
  generatedAt: string;
  generatedByName: string | null;
};

export type ExportResult = {
  /**
   * El documento a imprimir. La forma normal: el adaptador describe y el
   * renderizador común dibuja.
   */
  document?: PrintDocument;
  /**
   * ESCAPE DOCUMENTADO, y solo para dos artefactos.
   *
   * El PDF del documento controlado y el de la Lista Maestra existían antes
   * de EXPORT-01, llevan meses en uso y están validados por 70 aserciones que
   * comprueban su contenido real. Reexpresarlos en el Print Model habría
   * cambiado su composición —espaciados, orden, cortes de página— sin ganar
   * nada para quien los usa, y §27 pide explícitamente que su comportamiento
   * validado permanezca.
   *
   * Así que lo que se unifica es el ACCESO —una sola clave, un solo endpoint,
   * una sola política de nombres y cabeceras— y no la composición. Los dos
   * comparten el mismo escritor y el mismo motor de página que el resto.
   *
   * No es una puerta abierta: solo el registro puede usarla, y una prueba
   * comprueba que ninguna definición nueva la utiliza.
   */
  buffer?: Buffer;
  /** Lo que va en el nombre del archivo. */
  filenameParts: { recordType: string; title: string; code?: string | null; stamp?: string | null };
};

/**
 * La definición de una exportación.
 *
 * `load` recibe una petición YA autorizada y devuelve el documento a imprimir,
 * o `null` si la entidad no existe para esta empresa — que es la misma
 * respuesta que si perteneciera a otra (§50).
 */
export type ExportDefinition = {
  key: string;
  module: ExportModule;
  /** La entidad de negocio, en el vocabulario del dominio. */
  entity: string;
  /** Cómo se llama el registro en el papel: «Riesgo», «Casos abiertos». */
  recordType: string;
  kind: ExportKind;
  permission: ExportPermission;
  orientation: "portrait" | "landscape";
  filters?: readonly ExportFilterSpec[];
  load: (req: ExportRequest) => Promise<ExportResult | null>;
};
