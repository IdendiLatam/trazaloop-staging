// Página pública y estática: qué hace y qué no hace Trazaloop.
//
// Superficie GENERAL de la plataforma (enlazada desde la portada, el shell
// autenticado, el registro y el login): describe Trazaloop como plataforma
// modular y sus módulos funcionales. No es una página del módulo CPR, así
// que no puede definir el producto entero por uno solo de sus módulos.
//
// Las normas NTC 6632:2022 y UNE-EN 15343:2008 pertenecen EXCLUSIVAMENTE a
// la descripción de Trazaloop CPR y nunca se atribuyen a Textiles.
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
          Trazaloop es una plataforma modular de trazabilidad y gestión de
          información técnica para empresas. Actualmente integra dos módulos
          funcionales:
        </p>
        <p>
          <strong>Trazaloop PCR</strong> permite organizar catálogos,
          proveedores, materiales, productos, evidencias, órdenes o corridas de
          producción y trazabilidad lote a lote. También apoya el cálculo y la
          documentación del contenido reciclado por lote producido, tomando
          como referencia los criterios de la NTC 6632:2022 y la UNE-EN
          15343:2008.
        </p>
        <p>
          <strong>Trazaloop Textiles</strong> permite gestionar la trazabilidad
          de productos textiles y de confección, composición de fibras,
          proveedores, materiales, órdenes, lotes, evidencias, criterios de
          circularidad y pasaportes técnicos textiles privados.
        </p>
        <p>
          Según las funciones disponibles en cada módulo, Trazaloop puede
          generar registros consolidados, snapshots, niveles de defendibilidad,
          documentos técnicos, dossiers y pasaportes que apoyan la gestión
          interna, la preparación documental y los procesos de auditoría o
          revisión técnica.
        </p>
        <p>
          <strong>Trazaloop no emite certificaciones.</strong> La plataforma no
          certifica productos ni procesos, no sustituye a los organismos de
          certificación y no garantiza la aceptación de la información durante
          una auditoría. Los cálculos, niveles de defendibilidad, dossiers,
          pasaportes y demás resultados son consolidados técnicos construidos a
          partir de la información registrada por cada empresa.
        </p>
        <p>
          <strong>Los resultados dependen de la información ingresada.</strong>{" "}
          La calidad, exactitud y utilidad de la trazabilidad, los cálculos y
          los documentos reflejan la calidad de los datos, evidencias,
          clasificaciones y validaciones que cada empresa registra y mantiene.
        </p>
        <p>
          <strong>
            La responsabilidad de la información corresponde a cada empresa.
          </strong>{" "}
          Cada organización es responsable de la veracidad, integridad,
          actualización y uso de los datos registrados, así como de las
          declaraciones o decisiones que realice a partir de los resultados
          generados por la plataforma.
        </p>
      </div>

      <footer className="mt-10 border-t border-hairline pt-4 text-xs text-ink-soft">
        <p>{APP_VERSION_LABEL}</p>
        <p className="mt-1">Última actualización de este texto: julio de 2026.</p>
        <p className="mt-3">
          <Link href="/legal/paquete" className="text-loop hover:underline">
            Documentos legales
          </Link>
          {" · "}
          <Link href="/login" className="text-loop hover:underline">
            Ir a iniciar sesión
          </Link>
        </p>
      </footer>
    </main>
  );
}
