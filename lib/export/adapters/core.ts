import "server-only";

import { getCompanySettings } from "@/lib/db/settings";
import { listInvitations, listMembers } from "@/lib/db/team";
import {
  getSupportTicketSummary, listSupportTicketHistory, listSupportTicketMessages,
  listSupportTickets,
} from "@/lib/db/support";
import { ROLE_LABEL } from "@/lib/domain/team";
import {
  TICKET_CATEGORY_LABEL, TICKET_MODULE_LABEL, TICKET_PRIORITY_LABEL, TICKET_STATUS_LABEL,
} from "@/lib/domain/support";
import type { ExportDefinition, ExportResult } from "../registry-types";
import { currentStateNote, fields, paragraph, requiredField, section, table, timeline } from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * EXPORT-01.1 · Objetos transversales: la empresa, su equipo y su soporte.
 *
 * No pertenecen a Quality, ni a PCR, ni a Textiles: pertenecen a la cuenta.
 * Por eso su módulo es `core` y el endpoint no les exige entitlement de
 * ningún módulo — pero sí sesión, rol y RLS, como a todo lo demás.
 */
const SYSTEM = "Trazaloop · datos de la empresa";
const SYSTEM_SUPPORT = "Trazaloop · soporte";

const MEMBER_STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  suspended: "Suspendido",
  revoked: "Retirado",
};

const INVITATION_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  expired: "Vencida",
  revoked: "Revocada",
};

const day = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 10) : "—";

/* -------------------------------------------------------------------------
 * Datos de la empresa (§9, §10)
 * ---------------------------------------------------------------------- */

/**
 * La ficha de identidad de la empresa.
 *
 * Lo que NO lleva es tan importante como lo que lleva: nada de facturación
 * interna, ni identificadores de autenticación, ni datos de plataforma, ni
 * ningún campo que el usuario no vea ya en su propia pantalla de ajustes. Un
 * PDF no concede permisos nuevos (EX-10), y esta ficha es la que más tentación
 * daría de colar metadatos «útiles».
 *
 * El encabezado usa el MISMO motor de identidad que el resto: logo resuelto en
 * servidor desde el bucket privado de esa empresa, o el nombre si no hay
 * logo. No hay excepción recursiva por ser este el documento de la empresa.
 */
export const coreCompanyDetail: ExportDefinition = {
  key: "core.company.detail",
  module: "core",
  entity: "Datos de la empresa",
  recordType: "Datos de la empresa",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La ficha de empresa no versiona sus cambios: el dominio guarda el valor " +
    "vigente, no la serie de valores anteriores. Reconstruir «cómo se llamaba " +
    "en marzo» exigiría un historial que no existe.",
  async load(req): Promise<ExportResult | null> {
    const [settings, org] = await Promise.all([
      getCompanySettings(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    if (!settings) return null;

    // Un campo vacío se omite; los cuatro de identidad se muestran siempre,
    // porque su ausencia también es información para quien audita.
    const identidad = fields([
      requiredField("Nombre", settings.name),
      requiredField("Razón social", settings.legalName),
      requiredField("Identificación", settings.taxId),
      requiredField("País", settings.country),
    ], 2);

    const contacto = fields([
      requiredField("Correo de contacto", settings.contactEmail),
      requiredField("Teléfono", settings.phone),
      requiredField("Ciudad", settings.city),
      requiredField("Sitio web", settings.website),
    ], 2);

    return {
      filenameParts: {
        recordType: "Datos-de-la-empresa",
        title: settings.name,
        stamp: req.generatedAt.slice(0, 10),
      },
      document: {
        recordType: "Datos de la empresa",
        title: settings.name,
        subtitle: settings.legalName && settings.legalName !== settings.name
          ? settings.legalName
          : null,
        organization: org,
        systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        sections: [
          section("Identidad", identidad),
          section("Contacto", contacto,
            paragraph(settings.address, false)),
          section("Imagen corporativa", fields([
            requiredField(
              "Logo",
              settings.logoStoragePath ? "Cargado" : "Sin logo cargado"
            ),
          ], 1)),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Equipo (§2 del inventario)
 * ---------------------------------------------------------------------- */

export const coreTeamList: ExportDefinition = {
  key: "core.team.list",
  module: "core",
  entity: "Equipo",
  recordType: "Equipo",
  kind: "list",
  permission: "governor",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La membresía guarda estado y fecha de alta, no la serie completa de " +
    "cambios de rol. El listado retrata quién está y con qué rol hoy.",
  filters: [
    { key: "estado", label: "Estado", kind: "enum", values: ["active", "suspended", "revoked"] },
  ],
  async load(req): Promise<ExportResult | null> {
    const [all, invitations, org] = await Promise.all([
      listMembers(req.organizationId),
      listInvitations(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);

    const applied: { label: string; value: string }[] = [];
    let members = all;
    if (req.filters.estado) {
      members = members.filter((m) => m.status === req.filters.estado);
      applied.push({
        label: "Estado",
        value: MEMBER_STATUS_LABEL[req.filters.estado] ?? req.filters.estado,
      });
    }

    return {
      filenameParts: { recordType: "Equipo", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Equipo",
        title: "Equipo de la empresa",
        organization: org,
        systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        appliedFilters: applied,
        recordCount: members.length,
        sections: [
          section("Miembros", table(
            [{ header: "Persona", width: 3 }, { header: "Correo", width: 3.5 },
             { header: "Rol", width: 2 }, { header: "Estado", width: 1.5 },
             { header: "Desde", width: 1.5 }],
            members.map((m) => [
              m.fullName ?? "—",
              m.email,
              ROLE_LABEL[m.roleCode] ?? m.roleCode,
              MEMBER_STATUS_LABEL[m.status] ?? m.status,
              day(m.memberSince),
            ]),
            "No hay miembros con ese filtro."
          )),
          section("Invitaciones", table(
            [{ header: "Correo", width: 4 }, { header: "Rol", width: 2 },
             { header: "Estado", width: 2 }, { header: "Vence", width: 2 }],
            // El token NUNCA sale en el papel: es una credencial de un solo uso.
            invitations.map((i) => [
              i.email,
              ROLE_LABEL[i.roleCode] ?? i.roleCode,
              INVITATION_STATUS_LABEL[i.status] ?? i.status,
              day(i.expiresAt),
            ]),
            "No hay invitaciones registradas."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Soporte
 * ---------------------------------------------------------------------- */

export const coreSupportTicketDetail: ExportDefinition = {
  key: "core.support-ticket.detail",
  module: "core",
  entity: "Ticket de soporte",
  recordType: "Ticket de soporte",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const ticket = await getSupportTicketSummary(req.organizationId, req.id);
    if (!ticket) return null;

    const [messages, history, org] = await Promise.all([
      listSupportTicketMessages(ticket.ticketId),
      listSupportTicketHistory(ticket.ticketId),
      organizationIdentity(req.organizationId),
    ]);

    // Las notas internas de la plataforma no son del cliente: no se imprimen.
    const visibles = messages.filter((m) => !m.isInternalNote);

    return {
      filenameParts: {
        recordType: "Ticket-de-soporte",
        title: ticket.subject,
        code: ticket.ticketId.slice(0, 8),
      },
      document: {
        recordType: "Ticket de soporte",
        title: ticket.subject,
        code: ticket.ticketId.slice(0, 8),
        badges: [
          { text: TICKET_STATUS_LABEL[ticket.status] ?? ticket.status, tone: "info" },
          { text: TICKET_PRIORITY_LABEL[ticket.priority] ?? ticket.priority, tone: "neutral" },
        ],
        organization: org,
        systemLine: SYSTEM_SUPPORT,
        orientation: "portrait",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Categoría", TICKET_CATEGORY_LABEL[ticket.category] ?? ticket.category),
            requiredField("Módulo", TICKET_MODULE_LABEL[ticket.relatedModule] ?? ticket.relatedModule),
            requiredField("Abierto por", ticket.createdByName),
            requiredField("Abierto el", day(ticket.createdAt)),
            requiredField("Primera respuesta", day(ticket.firstResponseAt)),
            requiredField("Resuelto el", day(ticket.resolvedAt)),
          ], 2)),
          section("Descripción", paragraph(ticket.description)),
          section("Conversación", table(
            [{ header: "Cuándo", width: 1.6 }, { header: "Quién", width: 2 },
             { header: "Mensaje", width: 6 }],
            visibles.map((m) => [
              day(m.createdAt),
              m.authorName ?? (m.authorType === "platform" ? "Soporte Trazaloop" : "—"),
              m.body,
            ]),
            "Este ticket todavía no tiene mensajes."
          )),
          section("Historial de estado", timeline(
            history.map((h) => ({
              title: `${h.fromStatus ? `${TICKET_STATUS_LABEL[h.fromStatus] ?? h.fromStatus} → ` : ""}${TICKET_STATUS_LABEL[h.toStatus] ?? h.toStatus}`,
              when: day(h.createdAt),
              who: h.changedByName,
              detail: h.changeNote,
            })),
            "Sin cambios de estado registrados."
          )),
        ],
      },
    };
  },
};

export const coreSupportTicketList: ExportDefinition = {
  key: "core.support-ticket.list",
  module: "core",
  entity: "Tickets de soporte",
  recordType: "Tickets de soporte",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "Un listado retrata el estado de los tickets hoy. La historia de cada uno " +
    "vive en su propia ficha, que sí es histórica.",
  filters: [
    { key: "estado", label: "Estado", kind: "text" },
  ],
  async load(req): Promise<ExportResult | null> {
    const [all, org] = await Promise.all([
      listSupportTickets(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const applied: { label: string; value: string }[] = [];
    let rows = all;
    if (req.filters.estado) {
      rows = rows.filter((t) => t.status === req.filters.estado);
      applied.push({
        label: "Estado",
        value: TICKET_STATUS_LABEL[req.filters.estado as keyof typeof TICKET_STATUS_LABEL] ?? req.filters.estado,
      });
    }
    return {
      filenameParts: { recordType: "Tickets-de-soporte", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Tickets de soporte",
        title: "Tickets de soporte",
        organization: org,
        systemLine: SYSTEM_SUPPORT,
        orientation: "landscape",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        appliedFilters: applied,
        recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Asunto", width: 4 }, { header: "Categoría", width: 2 },
           { header: "Módulo", width: 2 }, { header: "Prioridad", width: 1.5 },
           { header: "Estado", width: 1.8 }, { header: "Abierto", width: 1.5 },
           { header: "Resuelto", width: 1.5 }],
          rows.map((t) => [
            t.subject,
            TICKET_CATEGORY_LABEL[t.category] ?? t.category,
            TICKET_MODULE_LABEL[t.relatedModule] ?? t.relatedModule,
            TICKET_PRIORITY_LABEL[t.priority] ?? t.priority,
            TICKET_STATUS_LABEL[t.status] ?? t.status,
            day(t.createdAt),
            day(t.resolvedAt),
          ]),
          "No hay tickets con ese filtro."
        )), section(null, currentStateNote(req.generatedAt))],
      },
    };
  },
};
