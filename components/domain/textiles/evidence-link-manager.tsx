"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";
import {
  TEXTILE_EVIDENCE_ENTITY_TYPE_LABEL,
  TEXTILE_EVIDENCE_LINK_TYPES,
  TEXTILE_EVIDENCE_LINK_TYPE_LABEL,
} from "@/lib/domain/textiles-evidences";

/**
 * Trazaloop · Sprint T5 (Textil) · Vínculos evidencia ↔ entidad textil.
 * Las opciones por tipo llegan del servidor; la validación mismo-tenant
 * real vive en la action, la FK compuesta y el trigger polimórfico.
 */

type ActionResult = { error: string | null };

export type LinkRowView = {
  id: string;
  entityType: string;
  entityLabel: string | null;
  linkType: string;
  notes: string | null;
};

export function TextileEvidenceLinkManager({
  evidenceId,
  entityOptions,
  links,
  addAction,
  removeAction,
}: {
  evidenceId: string;
  /** Opciones por tipo de entidad (solo los tipos con selector disponible). */
  entityOptions: Record<string, { id: string; label: string }[]>;
  links: LinkRowView[];
  addAction: (
    evidenceId: string,
    input: { entityType: string; entityId: string; linkType: string; notes?: string }
  ) => Promise<ActionResult>;
  removeAction: (linkId: string, evidenceId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const availableTypes = useMemo(
    () => Object.keys(entityOptions).filter((t) => (entityOptions[t] ?? []).length > 0),
    [entityOptions]
  );
  const [entityType, setEntityType] = useState<string>(availableTypes[0] ?? "reference");
  const [entityId, setEntityId] = useState("");
  const [linkType, setLinkType] = useState<string>("general_support");
  const [notes, setNotes] = useState("");

  const options = entityOptions[entityType] ?? [];

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await addAction(evidenceId, { entityType, entityId, linkType, notes });
      if (res.error) {
        setError(res.error);
        return;
      }
      setEntityId("");
      setNotes("");
      router.refresh();
    });
  }

  function remove(linkId: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeAction(linkId, evidenceId);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <ErrorAlert message={error} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tipo de entidad</span>
          <select
            value={entityType}
            disabled={pending}
            onChange={(e) => {
              setEntityType(e.target.value);
              setEntityId("");
            }}
            className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5"
          >
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {TEXTILE_EVIDENCE_ENTITY_TYPE_LABEL[t as keyof typeof TEXTILE_EVIDENCE_ENTITY_TYPE_LABEL] ?? t}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Entidad</span>
          <select
            value={entityId}
            disabled={pending}
            onChange={(e) => setEntityId(e.target.value)}
            className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5"
          >
            <option value="">— Selecciona —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tipo de vínculo</span>
          <select
            value={linkType}
            disabled={pending}
            onChange={(e) => setLinkType(e.target.value)}
            className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5"
          >
            {TEXTILE_EVIDENCE_LINK_TYPES.map((t) => (
              <option key={t} value={t}>
                {TEXTILE_EVIDENCE_LINK_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Notas</span>
          <input
            type="text"
            value={notes}
            disabled={pending}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5"
          />
        </label>
      </div>
      <Button type="button" disabled={pending || !entityId} onClick={add} className="w-fit">
        Vincular
      </Button>

      {links.length === 0 ? (
        <p className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-xs text-amber">
          Esta evidencia aún no está vinculada a ningún producto, referencia, material o
          proveedor.
        </p>
      ) : (
        <ul className="space-y-2">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-paper p-3 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium">
                  {TEXTILE_EVIDENCE_ENTITY_TYPE_LABEL[l.entityType as keyof typeof TEXTILE_EVIDENCE_ENTITY_TYPE_LABEL] ?? l.entityType}
                  {": "}
                  {l.entityLabel ?? l.id}
                </span>
                <span className="block text-xs text-ink-soft">
                  {TEXTILE_EVIDENCE_LINK_TYPE_LABEL[l.linkType as keyof typeof TEXTILE_EVIDENCE_LINK_TYPE_LABEL] ?? l.linkType}
                  {l.notes ? ` · ${l.notes}` : ""}
                </span>
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(l.id)}
                className="shrink-0 rounded-md border border-hairline bg-surface px-3 py-1 text-xs font-medium hover:border-danger"
              >
                Quitar vínculo
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
