// Página pública y estática: qué hace y qué no hace Trazaloop (Sprint 5E).
import Link from "next/link";
import { APP_VERSION_LABEL } from "@/lib/version";

export const metadata = { title: "Acerca de Trazaloop" };

export default function LegalPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="eyebrow">Acerca de Trazaloop</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Qué hace Trazaloop y qué no
      </h1>

      <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink">
        <p>
          Trazaloop es una herramienta de gestión de información técnica para
          empresas transformadoras de plásticos: organiza catálogos,
          evidencias, trazabilidad lote a lote y el cálculo de contenido
          reciclado por lote producido conforme a criterios de las normas
          técnicas NTC 6632:2022 y UNE-EN 15343:2008, con snapshots
          inmutables, niveles de defendibilidad y dossiers técnicos
          imprimibles como preparación frente a auditorías y revisión de
          cumplimiento normativo.
        </p>
        <p>
          <strong>Trazaloop no emite certificaciones.</strong> Los resultados,
          niveles de defendibilidad y dossiers que produce la plataforma son
          consolidados técnicos basados en la información registrada por la
          empresa; no constituyen por sí mismos una certificación ni un
          pronunciamiento de terceros.
        </p>
        <p>
          <strong>Los resultados dependen de la información ingresada.</strong>{" "}
          La calidad del cálculo y de la trazabilidad refleja la calidad de
          los datos, evidencias y validaciones que cada empresa registra y
          mantiene.
        </p>
        <p>
          <strong>La responsabilidad del uso es del usuario.</strong> Cada
          empresa es responsable del uso que haga de la plataforma, de la
          veracidad de su información y de las declaraciones que realice a
          partir de ella.
        </p>
      </div>

      <footer className="mt-10 border-t border-hairline pt-4 text-xs text-ink-soft">
        <p>{APP_VERSION_LABEL}</p>
        <p className="mt-1">Última actualización de este texto: julio de 2026.</p>
        <p className="mt-3">
          <Link href="/login" className="text-loop hover:underline">
            Ir a iniciar sesión
          </Link>
        </p>
      </footer>
    </main>
  );
}
