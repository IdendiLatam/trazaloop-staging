// Índice del paquete jurídico de Trazaloop v1.0.
//
// Página estática de la sección legal. Presenta el paquete APROBADO y
// vigente desde el 27 de julio de 2026, y da acceso a los seis documentos:
//   · los DOS documentos versionados (términos y política) se consultan en
//     /terms y /privacy, que los leen de `legal_documents`. Aquí solo se
//     enlaza — nunca se guarda una segunda copia de su articulado;
//   · los TRES textos servidos por la aplicación (aviso de privacidad,
//     autorización de registro y aviso de cookies) se muestran aquí;
//   · el anexo de tratamiento para clientes empresariales se entrega por
//     contrato, a solicitud.
//
// Los documentos auxiliares NO adoptados en la v1.0 (mercadeo, política de
// conservación, auditoría de huecos) no se listan: no son políticas
// vigentes.
import Link from "next/link";
import {
  LEGAL_OPERATOR,
  LEGAL_PACKAGE_APPROVED,
  LEGAL_PACKAGE_DOCUMENTS,
  LEGAL_PACKAGE_EFFECTIVE_DATE,
  LEGAL_PACKAGE_VERSION,
  LEGAL_TECH_PROVIDERS,
  ESSENTIAL_COOKIES_PURPOSES,
  ESSENTIAL_COOKIES_INVENTORY,
  PRIVACY_NOTICE_FULL,
  REGISTRATION_AUTHORIZATION_TEXT,
} from "@/lib/domain/legal-package";
import {
  LEGAL_ACCEPT_TERMS_CHECKBOX_TEXT,
  LEGAL_ACCEPT_PRIVACY_CHECKBOX_TEXT,
} from "@/lib/domain/legal";

export const metadata = { title: "Documentos legales — Trazaloop" };

const DELIVERY_LABEL: Record<string, string> = {
  versioned_document: "Documento versionado que se acepta al entrar",
  static_text: "Texto informativo de la plataforma",
  on_request: "Se entrega por contrato, a solicitud",
};

export default function LegalPackagePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="eyebrow">Documentos legales</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Paquete jurídico de Trazaloop v{LEGAL_PACKAGE_VERSION}
      </h1>

      {LEGAL_PACKAGE_APPROVED ? (
        <div className="mt-6 rounded-md border border-hairline bg-surface px-4 py-3 text-sm text-ink-soft">
          <p className="font-medium text-ink">
            Paquete v{LEGAL_PACKAGE_VERSION} vigente desde el{" "}
            {LEGAL_PACKAGE_EFFECTIVE_DATE}.
          </p>
          <p className="mt-2">
            Estos son los documentos legales vigentes de Trazaloop. Los
            términos de uso y la política de privacidad se aceptan al entrar
            en la plataforma y quedan registrados con su versión, fecha y
            hora.
          </p>
          <p className="mt-2">
            Consulta los documentos vigentes:{" "}
            <Link href="/terms" className="text-loop hover:underline">
              Términos de uso
            </Link>{" "}
            ·{" "}
            <Link href="/privacy" className="text-loop hover:underline">
              Política de privacidad
            </Link>
            .
          </p>
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-tight">Quién opera Trazaloop</h2>
        <dl className="mt-3 space-y-1 text-sm text-ink">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-soft">Razón social:</dt>
            <dd>{LEGAL_OPERATOR.legalName}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-soft">NIT:</dt>
            <dd>{LEGAL_OPERATOR.taxId}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-soft">Domicilio:</dt>
            <dd>
              {LEGAL_OPERATOR.address}, {LEGAL_OPERATOR.domicile}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-soft">Privacidad y habeas data:</dt>
            <dd>{LEGAL_OPERATOR.privacyEmail}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-soft">Soporte de la plataforma:</dt>
            <dd>{LEGAL_OPERATOR.supportEmail}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-soft">Teléfono:</dt>
            <dd>{LEGAL_OPERATOR.phone}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-soft">Sitio:</dt>
            <dd>{LEGAL_OPERATOR.website}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-tight">Documentos del paquete</h2>
        <ul className="mt-3 space-y-4 text-sm">
          {LEGAL_PACKAGE_DOCUMENTS.map((doc) => (
            <li key={doc.slug} className="border-t border-hairline pt-3">
              <p className="font-medium text-ink">
                {doc.route ? (
                  <Link href={doc.route} className="text-loop hover:underline">
                    {doc.title}
                  </Link>
                ) : (
                  doc.title
                )}
              </p>
              <p className="mt-1 text-ink-soft">{doc.summary}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {DELIVERY_LABEL[doc.delivery]}
                {doc.delivery === "on_request"
                  ? ` · solicítalo en ${LEGAL_OPERATOR.privacyEmail}`
                  : null}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-tight">Aviso de privacidad</h2>
        {PRIVACY_NOTICE_FULL.map((parrafo, i) => (
          <p key={i} className="mt-3 text-sm text-ink-soft">
            {parrafo}
          </p>
        ))}
        <p className="mt-3 text-sm text-ink-soft">
          La política completa está en{" "}
          <Link href="/privacy" className="text-loop hover:underline">
            /privacy
          </Link>
          .
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-tight">
          Autorización para el tratamiento de datos
        </h2>
        <p className="mt-3 text-sm text-ink-soft">
          Al entrar en la plataforma se presentan dos casillas separadas y
          ambas obligatorias, ninguna premarcada. No existe casilla de
          mercadeo: en esta versión no se realizan comunicaciones comerciales
          automatizadas.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-ink">
          <li>· {LEGAL_ACCEPT_TERMS_CHECKBOX_TEXT}</li>
          <li>· {LEGAL_ACCEPT_PRIVACY_CHECKBOX_TEXT}</li>
        </ul>
        <p className="mt-3 text-sm text-ink-soft">{REGISTRATION_AUTHORIZATION_TEXT}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-tight">
          Cookies y tecnologías estrictamente necesarias
        </h2>
        <p className="mt-3 text-sm text-ink-soft">
          Trazaloop utiliza cookies y mecanismos equivalentes imprescindibles
          para {ESSENTIAL_COOKIES_PURPOSES.join(", ")}. No se utilizan cookies
          de analítica ni de publicidad, por lo que no existe un mecanismo de
          preferencias opcionales.
        </p>
        <ul className="mt-3 space-y-3 text-sm text-ink-soft">
          {ESSENTIAL_COOKIES_INVENTORY.map((c) => (
            <li key={c.name}>
              <span className="text-ink">{c.name}</span> — {c.origin} · {c.purpose}{" "}
              Duración: {c.duration}.
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-tight">Proveedores tecnológicos</h2>
        <ul className="mt-3 space-y-1 text-sm text-ink-soft">
          {LEGAL_TECH_PROVIDERS.map((p) => (
            <li key={p.name}>
              <span className="text-ink">{p.name}</span> — {p.service}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-ink-soft">
          Puede existir tratamiento o transmisión internacional de información,
          sujeto a las medidas contractuales, técnicas y legales aplicables.
        </p>
      </section>

      <footer className="mt-10 border-t border-hairline pt-4 text-xs text-ink-soft">
        <p>
          Para solicitar cualquiera de estos documentos o ejercer tus derechos,
          escribe a {LEGAL_OPERATOR.privacyEmail}.
        </p>
        <p className="mt-3">
          <Link href="/legal" className="text-loop hover:underline">
            Acerca de Trazaloop
          </Link>
        </p>
      </footer>
    </main>
  );
}
