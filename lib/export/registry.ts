import "server-only";

import {
  qualityMapDetail, qualityPositionDetail, qualityPositionList,
  qualityProcessDetail, qualityProcessList,
} from "./adapters/quality-process";
import {
  qualityMethodologyDetail, qualityOpportunityDetail, qualityOpportunityList,
  qualityRiskDetail, qualityRiskList,
} from "./adapters/quality-risks";
import { qualityCaseDetail, qualityCaseList } from "./adapters/quality-cases";
import {
  qualityIndicatorDetail, qualityIndicatorList, qualityObjectiveDetail, qualityObjectiveList,
} from "./adapters/quality-performance";
import { qualityDocumentDetail, qualityMasterList } from "./adapters/quality-documents";
import {
  cprFamilyList, cprInputBatchDetail, cprMaterialList, cprOutputBatchDetail,
  cprProductList, cprProductionOrderDetail, cprProductionOrderList, cprSupplierList,
} from "./adapters/cpr";
import {
  textileEvidenceList, textileOutputLotDetail, textileProductDetail, textileProductList,
  textileProductionOrderDetail, textileSupplierList,
} from "./adapters/textiles";
import type { ExportDefinition } from "./registry-types";

/**
 * Trazaloop · EXPORT-01 · El registro CERRADO de exportaciones.
 *
 * POR QUÉ CERRADO
 *
 * La alternativa evidente sería un endpoint que acepte «qué tabla» y «qué
 * columnas» desde el navegador. Eso convierte el generador de PDF en un motor
 * de consultas arbitrarias: bastaría con pedir otra tabla, u otra empresa,
 * para sacar lo que no corresponde. Aquí el navegador solo puede nombrar una
 * CLAVE de esta lista; todo lo demás lo decide el servidor (§15, §53).
 *
 * Añadir una entidad exportable es añadir una entrada aquí. Una prueba
 * comprueba que todas las claves son únicas y que ninguna definición se quedó
 * sin permiso, sin cargador o sin tipo de registro.
 */
const DEFINITIONS: readonly ExportDefinition[] = [
  // Quality · sistema de gestión
  qualityProcessDetail, qualityProcessList,
  qualityPositionDetail, qualityPositionList,
  qualityMapDetail,
  // Quality · documentos
  qualityDocumentDetail, qualityMasterList,
  // Quality · desempeño
  qualityObjectiveDetail, qualityObjectiveList,
  qualityIndicatorDetail, qualityIndicatorList,
  // Quality · casos y acciones
  qualityCaseDetail, qualityCaseList,
  // Quality · riesgos y oportunidades
  qualityRiskDetail, qualityRiskList,
  qualityOpportunityDetail, qualityOpportunityList,
  qualityMethodologyDetail,
  // PCR
  cprProductionOrderDetail, cprProductionOrderList,
  cprOutputBatchDetail, cprInputBatchDetail,
  cprProductList, cprMaterialList, cprSupplierList, cprFamilyList,
  // Textiles
  textileProductDetail, textileProductList,
  textileProductionOrderDetail, textileOutputLotDetail,
  textileSupplierList, textileEvidenceList,
];

const BY_KEY = new Map(DEFINITIONS.map((d) => [d.key, d]));

export function listExportDefinitions(): readonly ExportDefinition[] {
  return DEFINITIONS;
}

/** Devuelve `null` para una clave inventada. Nunca lanza: un atacante no
 *  merece un mensaje distinto de quien se equivoca. */
export function findExportDefinition(key: string): ExportDefinition | null {
  return BY_KEY.get(key) ?? null;
}
