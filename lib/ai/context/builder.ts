import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { aiConfig } from "../config";
import { emptyPack, type ContextFact, type ContextNote, type ContextPack,
         type ContextRef, type TemporalScope } from "./types";

/**
 * Trazaloop · QUALITY-12 · §9 · El Constructor de Contexto Autorizado.
 *
 * LA REGLA QUE SOSTIENE TODO EL SPRINT
 *
 * El modelo NO consulta la base. Nunca. Le llega un paquete que este módulo
 * construyó con la SESIÓN de quien pregunta —el cliente normal, con su RLS
 * puesta (§13)— y con adaptadores tipados que sabían de antemano qué campos
 * podían leer (§11).
 *
 * Consecuencias, todas deliberadas:
 *
 *   · No hay SQL generado por el modelo, porque no hay dónde ejecutarlo (§10).
 *   · Lo que la persona no puede ver, no entra: ni como dato ni como resumen
 *     (§14, §15). No hay «modo IA» que salte permisos.
 *   · Los datos de otra empresa no entran porque la RLS no los devuelve, y
 *     además cada consulta va acotada por `organization_id` (§16).
 *   · Los números los calcula el código (§58). El modelo no cuenta filas.
 *
 * EL PRESUPUESTO
 *
 * El contexto tiene un tope de caracteres (§73). Cuando se llena, se recorta y
 * se dice que se recortó: es preferible una respuesta que admite que miró una
 * parte a una que se calla que no lo miró todo.
 */

export type ContextRequest = {
  organizationId: string;
  useCase: string;
  question: string;
  temporal: TemporalScope;
  /** §49 · Desde dónde se abrió el Copilot, si se abrió desde algo. */
  pinned?: { type: string; id: string } | null;
  /** §78 · Qué usos tiene encendidos la empresa. */
  allow: { people: boolean; customer: boolean };
};

type Db = Awaited<ReturnType<typeof createServerClient>>;

/** Un acumulador que numera las referencias y vigila el presupuesto. */
export class ContextWriter {
  private refs: ContextRef[] = [];
  private facts: ContextFact[] = [];
  private notes: ContextNote[] = [];
  private sources = new Set<string>();
  private limitations: string[] = [];
  private conflicts: string[] = [];
  private chars = 0;
  private truncated = false;
  private readonly budget: number;

  constructor(budget: number) { this.budget = budget; }

  get full(): boolean { return this.chars >= this.budget; }
  get refCount(): number { return this.refs.length; }

  /** Añade una fuente y devuelve su número de cita. */
  ref(r: Omit<ContextRef, "ordinal">): number {
    const existente = this.refs.find(
      (x) => x.sourceCode === r.sourceCode && x.entityId === r.entityId
             && x.label === r.label);
    if (existente) return existente.ordinal;
    if (this.full) { this.truncated = true; return 0; }
    const ordinal = this.refs.length + 1;
    this.refs.push({ ...r, ordinal });
    this.sources.add(r.sourceCode);
    this.chars += r.label.length + 40;
    return ordinal;
  }

  fact(statement: string, refs: number[]): void {
    if (this.full) { this.truncated = true; return; }
    const validos = refs.filter((n) => n > 0);
    this.facts.push({ statement, refs: validos });
    this.chars += statement.length + 12;
  }

  note(title: string, body: string, refs: number[]): void {
    if (this.full) { this.truncated = true; return; }
    const recorte = body.length > 800 ? `${body.slice(0, 800)}…` : body;
    this.notes.push({ title, body: recorte, refs: refs.filter((n) => n > 0) });
    this.chars += recorte.length + title.length + 12;
  }

  limitation(text: string): void {
    if (!this.limitations.includes(text)) this.limitations.push(text);
  }

  conflict(text: string): void {
    if (!this.conflicts.includes(text)) this.conflicts.push(text);
  }

  pack(temporal: TemporalScope): ContextPack {
    return {
      refs: this.refs, facts: this.facts, notes: this.notes,
      sourcesUsed: [...this.sources], temporalLimitations: this.limitations,
      conflicts: this.conflicts, temporal,
      truncated: this.truncated, charCount: this.chars,
    };
  }
}

export type ContextAdapter = {
  code: string;
  /** §78 · Qué interruptor de la empresa hace falta, si hace falta alguno. */
  feature?: "people" | "customer";
  /** Para qué casos de uso aporta algo. `*` significa siempre que quepa. */
  useCases: string[];
  /** §22 · Qué sabe hacer con el tiempo. */
  temporal: "current" | "period" | "as_of";
  load(db: Db, req: ContextRequest, w: ContextWriter): Promise<void>;
};

const ADAPTERS: ContextAdapter[] = [];

export function registerAdapter(a: ContextAdapter): void {
  if (!ADAPTERS.some((x) => x.code === a.code)) ADAPTERS.push(a);
}

export function registeredAdapters(): ContextAdapter[] {
  return [...ADAPTERS];
}

/**
 * Construye el paquete. Es lo único que el resto del sistema llama, y lo hace
 * SIEMPRE con la sesión de quien pregunta.
 */
export async function buildContext(
  req: ContextRequest, client?: Db
): Promise<ContextPack> {
  const db = client ?? await createServerClient();
  const cfg = aiConfig();
  const w = new ContextWriter(cfg.contextBudgetChars);

  const aplicables = ADAPTERS.filter((a) => {
    if (a.feature === "people" && !req.allow.people) return false;
    if (a.feature === "customer" && !req.allow.customer) return false;
    return a.useCases.includes("*") || a.useCases.includes(req.useCase);
  });

  for (const a of aplicables) {
    if (w.full) break;
    // §22 · Una fuente que no sabe reconstruir el pasado NO se inventa: se
    // declara la limitación y se sigue.
    if (req.temporal.mode === "as_of" && a.temporal !== "as_of") {
      w.limitation(
        `«${a.code}» no reconstruye su estado en una fecha pasada: lo que se muestra de esa fuente es su estado actual.`);
    }
    try {
      await a.load(db, req, w);
    } catch {
      // Una fuente que falla no tumba la consulta: se responde con lo que hay
      // y el nivel de evidencia lo refleja.
      w.limitation(`No se pudo leer «${a.code}» en esta consulta.`);
    }
  }

  return w.pack(req.temporal);
}

/** Vacío, para cuando ni siquiera hay que preguntar. */
export function noContext(temporal: TemporalScope): ContextPack {
  return emptyPack(temporal);
}
