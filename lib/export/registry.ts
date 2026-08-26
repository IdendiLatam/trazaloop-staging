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
import {
  coreCompanyDetail, coreSupportTicketDetail, coreSupportTicketList, coreTeamList,
} from "./adapters/core";
import {
  qualityActionDetail, qualityActionList, qualityControlDetail, qualityControlList,
  qualityPeriodClosureList, qualityRiskAssessmentDetail,
} from "./adapters/quality-work";
import {
  qualityDocumentRevisionDetail, qualityMapVersionDetail, qualityMeasurementDetail,
  qualityMethodologyVersionDetail, qualityProcessRevisionDetail, qualityTaskList,
} from "./adapters/quality-history";
import { textilesDocumentDetail, trazadocsDocumentDetail } from "./adapters/quality-documents";
import { textilesMasterList, trazadocsMasterList } from "./adapters/trazadocs";
import {
  cprCustomerRequirementList, cprDiagnosticDetail, cprDossierDetail, cprDossierList,
  cprEvidenceList, cprEvidenceMatrixDetail, cprExerciseDetail, cprExerciseList,
  cprInputBatchList, cprMaterialDetail, cprOutputBatchList, cprProductDetail,
  cprRecycledContentDetail, cprRecycledContentList, cprSupplierDetail,
  cprSupportCalculationDetail,
} from "./adapters/cpr-extended";
import {
  textilesCircularityDetail, textilesCircularityList, textilesCollectionList,
  textilesComponentList, textilesDiagnosticDetail, textilesEvidenceDetail,
  textilesFiberList, textilesInputLotDetail, textilesInputLotList,
  textilesMaterialList, textilesOutputLotList, textilesOutsourcedProcessList,
  textilesPassportDetail, textilesPassportList, textilesProcessList,
  textilesProductionOrderList,
  textilesReferenceDetail,
} from "./adapters/textiles-extended";
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

  // ------------------------------------------------------------------
  // EXPORT-01.1 · lo que faltaba para que PENDING sea 0
  // ------------------------------------------------------------------

  // Transversal (no pertenece a ningún módulo: pertenece a la cuenta)
  coreCompanyDetail, coreTeamList,
  coreSupportTicketDetail, coreSupportTicketList,

  // Quality · entidades con identidad propia que no tenían papel propio
  qualityActionDetail, qualityActionList,
  qualityControlDetail, qualityControlList,
  qualityRiskAssessmentDetail,
  qualityPeriodClosureList, qualityTaskList,

  // Quality · los registros que SÍ son del pasado
  qualityProcessRevisionDetail, qualityMapVersionDetail,
  qualityDocumentRevisionDetail, qualityMeasurementDetail,
  qualityMethodologyVersionDetail,

  // TrazaDocs · mismo motor documental, otro módulo
  trazadocsDocumentDetail, trazadocsMasterList,
  textilesDocumentDetail, textilesMasterList,

  // PCR · el resto
  cprProductDetail, cprMaterialDetail, cprSupplierDetail,
  cprInputBatchList, cprOutputBatchList,
  cprCustomerRequirementList, cprEvidenceList,
  cprRecycledContentDetail, cprRecycledContentList,
  cprSupportCalculationDetail, cprEvidenceMatrixDetail,
  cprDossierDetail, cprDossierList,
  cprExerciseDetail, cprExerciseList,
  cprDiagnosticDetail,

  // Textiles · el resto
  textilesReferenceDetail, textilesCollectionList,
  textilesFiberList, textilesMaterialList, textilesComponentList,
  textilesProcessList, textilesOutsourcedProcessList,
  textilesInputLotDetail, textilesInputLotList,
  textilesProductionOrderList, textilesOutputLotList,
  textilesEvidenceDetail,
  textilesCircularityDetail, textilesCircularityList,
  textilesPassportDetail, textilesPassportList, textilesDiagnosticDetail,
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
