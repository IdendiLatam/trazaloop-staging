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
import {
  qualityCompetenceMatrixDetail, qualityCompetenceMatrixHistorical,
  qualityCompetencyDetail, qualityCompetencyList, qualityOrgChartDetail,
  qualityOrgUnitList, qualityPersonCompetenceDetail, qualityPersonDetail,
  qualityPersonList, qualityPositionHoldersHistorical, qualityPositionProfileDetail,
} from "./adapters/quality-people";
import {
  qualityDevelopmentNeedList, qualityDevelopmentPlanDetail, qualityDevelopmentPlanList,
  qualityEffectivenessDetail, qualityKnowledgeDetail, qualityKnowledgeList,
  qualityLearningActivityDetail, qualityLearningActivityList, qualityLessonDetail,
  qualityLessonList, qualityPerformanceCycleDetail, qualityPerformanceEvaluationDetail,
  qualityTransferPlanDetail,
} from "./adapters/quality-development";
import { qualityOnboardingDetail } from "./adapters/quality-onboarding";
import {
  qualityApprovedSupplierList, qualitySupplierApprovalDetail,
  qualitySupplierApprovalHistorical, qualitySupplierCategoryList,
  qualitySupplierCriticalityDetail, qualitySupplierDetail,
  qualitySupplierEvaluationDetail, qualitySupplierEvaluationList, qualitySupplierList,
  qualitySupplierPerformanceDetail, qualitySupplierReevaluationList,
  qualitySupplierRequirementList, qualitySupplierSiteDetail,
} from "./adapters/quality-suppliers";
import {
  qualityCampaignList, qualityCampaignReport, qualityComplaintDetail, qualityComplaintList,
  qualityCustomerDetail, qualityCustomerList, qualityFeedbackDetail, qualityFeedbackList,
  qualityResponseDetail, qualitySatisfactionReport, qualitySurveyDetail, qualitySurveyList,
  qualitySurveyVersionDetail, qualityVoiceReviewDetail, qualityVoiceTrend,
} from "./adapters/quality-customer-voice";
import {
  qualityAuditAgendaDetail, qualityAuditChecklistDetail, qualityAuditDetail,
  qualityAuditExecutionDetail, qualityAuditFindingDetail, qualityAuditFindingList,
  qualityAuditFollowupList, qualityAuditList, qualityAuditPlanDetail,
  qualityAuditProgramDetail, qualityAuditProgramList, qualityAuditReportDetail,
} from "./adapters/quality-audits";
import {
  qualityManagementReviewAgenda, qualityManagementReviewDecisionList,
  qualityManagementReviewDetail, qualityManagementReviewFollowUp,
  qualityManagementReviewInputs, qualityManagementReviewList,
  qualityManagementReviewMinutes, qualityManagementReviewReport,
} from "./adapters/quality-management-review";
import {
  qualityAutomationRuleDetail, qualityAutomationRuleList,
  qualityAutomationRunDetail, qualityAutomationRunList,
  qualityAutomationSignalDetail, qualityAutomationSignalList,
} from "./adapters/quality-automation";
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

  // ------------------------------------------------------------------
  // QUALITY-06 · personas, competencia, desarrollo y conocimiento
  //
  // Entran con el resto y por la misma puerta: una clave del registro, un
  // nombre documental fijado aquí y el encabezado corporativo de EXPORT-01.2.
  // Ninguna de estas exportaciones tiene endpoint propio.
  // ------------------------------------------------------------------
  qualityOrgUnitList, qualityOrgChartDetail,
  qualityPositionProfileDetail, qualityPositionHoldersHistorical,
  qualityPersonDetail, qualityPersonList,
  qualityCompetencyDetail, qualityCompetencyList,
  qualityCompetenceMatrixDetail, qualityCompetenceMatrixHistorical,
  qualityPersonCompetenceDetail,
  qualityDevelopmentNeedList,
  qualityDevelopmentPlanDetail, qualityDevelopmentPlanList,
  qualityLearningActivityDetail, qualityLearningActivityList,
  qualityEffectivenessDetail,
  qualityPerformanceCycleDetail, qualityPerformanceEvaluationDetail,
  qualityKnowledgeDetail, qualityKnowledgeList, qualityTransferPlanDetail,
  qualityLessonDetail, qualityLessonList,

  // ------------------------------------------------------------------
  // QUALITY-06.1 · el onboarding, que es una VISTA derivada y no una tabla
  // ------------------------------------------------------------------
  qualityOnboardingDetail,

  // ------------------------------------------------------------------
  // QUALITY-07 · proveedores, criticidad, evaluación y reevaluación
  //
  // Ninguno de estos papeles dice «proveedor aprobado» a secas: la aprobación
  // se imprime por ALCANCE, porque una afirmación más amplia que la decisión
  // que documenta es exactamente lo que se enseña en una auditoría creyendo
  // que dice lo que no dice.
  // ------------------------------------------------------------------
  qualitySupplierDetail, qualitySupplierList,
  qualityApprovedSupplierList,
  qualitySupplierSiteDetail,
  qualitySupplierCategoryList, qualitySupplierRequirementList,
  qualitySupplierEvaluationDetail, qualitySupplierEvaluationList,
  qualitySupplierCriticalityDetail,
  qualitySupplierApprovalDetail, qualitySupplierApprovalHistorical,
  qualitySupplierReevaluationList, qualitySupplierPerformanceDetail,

  // ------------------------------------------------------------------
  // QUALITY-08 · voz del cliente, satisfacción, retroalimentación y quejas
  //
  // Dos reglas atraviesan los quince. Ninguno llama «no conformidad» a una
  // queja: eso convertiría un hecho en una clasificación que nadie decidió. Y
  // ninguno revela la identidad de quien respondió una campaña anónima —el
  // documento individual de esas respuestas ni siquiera se genera—, porque un
  // PDF no concede privilegios y tampoco rompe una promesa.
  // ------------------------------------------------------------------
  qualityCustomerDetail, qualityCustomerList,
  qualitySurveyDetail, qualitySurveyList, qualitySurveyVersionDetail,
  qualityCampaignList, qualityCampaignReport,
  qualityResponseDetail,
  qualityFeedbackDetail, qualityFeedbackList,
  qualityComplaintDetail, qualityComplaintList,
  qualitySatisfactionReport, qualityVoiceTrend, qualityVoiceReviewDetail,

  // ------------------------------------------------------------------
  // QUALITY-09 · programa, auditoría, ejecución, hallazgos e informe
  //
  // Tres reglas atraviesan los doce. Ninguno certifica nada: Trazaloop
  // administra auditorías y la certificación la concede un organismo
  // acreditado, que no es esto. Ninguno llama «no conformidad» a un hallazgo,
  // ni siquiera al que el auditor propuso como posible. Y el INFORME se
  // imprime desde su instantánea, no desde el estado de hoy: reimprimirlo
  // dentro de dos años devuelve lo que decía entonces.
  // ------------------------------------------------------------------
  qualityAuditProgramDetail, qualityAuditProgramList,
  qualityAuditDetail, qualityAuditList,
  qualityAuditPlanDetail, qualityAuditAgendaDetail,
  qualityAuditChecklistDetail, qualityAuditExecutionDetail,
  qualityAuditFindingDetail, qualityAuditFindingList,
  qualityAuditReportDetail, qualityAuditFollowupList,

  // ------------------------------------------------------------------
  // QUALITY-10 · revisión por la dirección
  //
  // Cuatro reglas atraviesan los ocho. El ACTA se imprime desde su
  // instantánea —la revisión de 2027 reimpresa en 2029 devuelve 2027—.
  // Ninguno confunde decisión con acción: las dos columnas van separadas y
  // el papel explica por qué los números no coinciden. Ninguno escribe cero
  // donde no hubo medición. Y ninguno rompe el anonimato de QUALITY-08,
  // porque lo único que este dominio guarda de los clientes son agregados.
  // ------------------------------------------------------------------
  qualityManagementReviewList, qualityManagementReviewDetail,
  qualityManagementReviewAgenda, qualityManagementReviewInputs,
  qualityManagementReviewDecisionList, qualityManagementReviewReport,
  qualityManagementReviewMinutes, qualityManagementReviewFollowUp,

  // ------------------------------------------------------------------
  // QUALITY-11 · automatización determinística y observación
  //
  // Cuatro reglas atraviesan los seis. Todos explican POR QUÉ pasó lo que
  // pasó, campo a campo: una señal que no se explica no vale nada. La ficha
  // de regla imprime TODAS sus versiones, porque una señal de hace un año se
  // lee con la versión que la emitió, no con la de hoy. Ninguno afirma que
  // la plataforma decidió nada: la automatización observa, avisa y encarga
  // trabajo —declarar, aprobar, aceptar y cerrar siguen siendo de personas—.
  // Y ninguno rompe el anonimato de QUALITY-08 ni convierte la observación
  // de competencias en vigilancia de personas.
  // ------------------------------------------------------------------
  qualityAutomationRuleList, qualityAutomationRuleDetail,
  qualityAutomationSignalList, qualityAutomationSignalDetail,
  qualityAutomationRunList, qualityAutomationRunDetail,
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
