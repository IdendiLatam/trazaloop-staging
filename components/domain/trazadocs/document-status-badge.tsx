import { DOCUMENT_STATUS_LABEL, type DocumentStatus } from "@/lib/domain/trazadocs";

const TONE: Record<DocumentStatus, string> = {
  draft: "border-hairline bg-paper text-ink-soft",
  in_review: "border-amber/40 bg-amber/10 text-amber",
  approved: "border-loop/30 bg-loop/5 text-loop-deep",
  obsolete: "border-danger/30 bg-danger/5 text-danger",
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[status]}`}>
      {DOCUMENT_STATUS_LABEL[status]}
    </span>
  );
}
