"use client";

import { useState, useTransition } from "react";
import {
  createPromotionAction, publishPromotionAction, retirePromotionAction,
  createPromotionCodeAction, retirePromotionCodeAction,
} from "@/server/actions/promotions-console";
import type { PromotionRow, RedemptionRow } from "@/lib/db/promotions-console";
import { longDate } from "@/lib/domain/billing-display";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

/**
 * Trazaloop · PE-05B6C · Campañas y cupones, sin abrir la base.
 *
 * EL CICLO ENTERO CABE AQUÍ: crear el borrador, darle un código, publicar, ver
 * quién lo usó y retirarlo. Nadie debería necesitar SQL para repartir un cupón,
 * y quien lo necesita acaba pidiéndoselo a quien sí sabe, que es como se cuelan
 * los errores caros.
 *
 * Y una cosa que la pantalla dice en voz alta porque la base la impone:
 * publicar es irreversible. Desde ese momento las condiciones no se editan; se
 * retira y se publica una sucesora.
 */

const campo =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink "
  + "placeholder:text-ink-soft/60 focus:border-loop";

const ESTADO: Record<PromotionRow["status"], string> = {
  draft: "Borrador", active: "Publicada", retired: "Retirada",
};
const pct = (bps: number) => `${(bps / 100).toLocaleString("es-CO")} %`;

export function PromotionsConsole({
  promotions, redemptions, canManage,
}: {
  promotions: PromotionRow[] | null;
  redemptions: RedemptionRow[] | null;
  canManage: boolean;
}) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [confirmar, setConfirmar] = useState<{ tipo: "publicar" | "retirar"; id: string } | null>(null);
  const [codigoNuevo, setCodigoNuevo] = useState<Record<string, string>>({});

  const lanzar = (fn: () => Promise<{ error: string | null }>, hecho: string) =>
    empezar(async () => {
      setError(null); setAviso(null);
      const r = await fn();
      if (r.error) setError(r.error); else { setAviso(hecho); setConfirmar(null); }
    });

  if (promotions === null) {
    return (
      <p className="text-sm text-ink-soft">
        No pudimos leer las campañas. Vuelve a intentarlo en un momento.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <ErrorAlert message={error} /> : null}
      {aviso ? <InfoAlert message={aviso} /> : null}
      {!canManage ? (
        <InfoAlert message="Estás viendo esto en solo lectura: crear y retirar campañas corresponde a la administración de plataforma." />
      ) : null}

      {canManage ? (
        creando
          ? <FormularioCampana
              pendiente={pendiente}
              onCancelar={() => setCreando(false)}
              onCrear={(datos) => lanzar(() => createPromotionAction(datos),
                "Campaña creada en borrador. Añádele un código y publícala.")} />
          : <Button type="button" onClick={() => setCreando(true)}>
              Nueva campaña
            </Button>
      ) : null}

      {promotions.length === 0 ? (
        <p className="text-sm text-ink-soft">Todavía no hay campañas.</p>
      ) : (
        <div className="space-y-3">
          {promotions.map((p) => (
            <article key={p.id} className="rounded-lg border border-hairline bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-medium">{p.name}</h3>
                {/* El estado va en palabras, no solo en color. */}
                <span className="rounded-full border border-hairline px-2 py-0.5 text-xs">
                  {ESTADO[p.status]}
                </span>
                {p.program === "institutional_full" ? (
                  <span className="text-xs text-ink-soft">Programa institucional</span>
                ) : null}
              </div>
              {p.description ? (
                <p className="pt-1 text-sm text-ink-soft">{p.description}</p>
              ) : null}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 pt-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-ink-soft">Descuento</dt>
                  <dd className="font-medium">{pct(p.discountBasisPoints)}</dd></div>
                <div><dt className="text-xs text-ink-soft">Techo</dt>
                  <dd>{p.maxDiscountBasisPoints === null ? "—" : pct(p.maxDiscountBasisPoints)}</dd></div>
                <div><dt className="text-xs text-ink-soft">Planes</dt>
                  <dd>{p.eligiblePlanCodes.join(", ")}</dd></div>
                <div><dt className="text-xs text-ink-soft">Periodicidad</dt>
                  <dd>{p.eligibleIntervals.map((i) => i === "annual" ? "anual" : "mensual").join(", ")}</dd></div>
                <div><dt className="text-xs text-ink-soft">Inicio</dt>
                  <dd>{longDate(p.startsAt)}</dd></div>
                <div><dt className="text-xs text-ink-soft">Fin</dt>
                  <dd>{p.endsAt ? longDate(p.endsAt) : "sin fin"}</dd></div>
                <div><dt className="text-xs text-ink-soft">Canjes</dt>
                  <dd>{p.redemptions}{p.maxRedemptions ? ` de ${p.maxRedemptions}` : ""}</dd></div>
                <div><dt className="text-xs text-ink-soft">Por empresa</dt>
                  <dd>{p.maxPerOrganization}</dd></div>
              </dl>

              <div className="space-y-2 pt-3">
                <p className="text-xs font-medium text-ink-soft">Códigos</p>
                {p.codes.length === 0 ? (
                  <p className="text-sm text-ink-soft">Ninguno todavía.</p>
                ) : (
                  <ul className="space-y-1">
                    {p.codes.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono">{c.code}</span>
                        <span className="text-xs text-ink-soft">
                          {c.status === "active" ? "activo" : "retirado"} · {c.redemptions} canjes
                        </span>
                        {canManage && c.status === "active" ? (
                          <button type="button" disabled={pendiente}
                            className="text-xs underline"
                            onClick={() => lanzar(() => retirePromotionCodeAction(c.id),
                              "Código retirado. Los canjes que hubo siguen intactos.")}>
                            Retirar
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && p.status !== "retired" ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <label className="sr-only" htmlFor={`codigo-${p.id}`}>
                      Código nuevo para {p.name}
                    </label>
                    <input id={`codigo-${p.id}`} className={`${campo} w-48`}
                      placeholder="ANDI40" value={codigoNuevo[p.id] ?? ""}
                      onChange={(e) => setCodigoNuevo(
                        { ...codigoNuevo, [p.id]: e.target.value.toUpperCase() })} />
                    <Button type="button" disabled={pendiente || !(codigoNuevo[p.id] ?? "").trim()}
                      onClick={() => lanzar(
                        () => createPromotionCodeAction(p.id, codigoNuevo[p.id] ?? ""),
                        "Código creado.")}>
                      Añadir código
                    </Button>
                  </div>
                ) : null}
              </div>

              {canManage ? (
                <div className="flex flex-wrap gap-2 pt-3">
                  {confirmar?.id === p.id ? (
                    <div className="w-full space-y-2 rounded-md border border-hairline bg-canvas p-3">
                      <p className="text-sm">
                        {confirmar.tipo === "publicar"
                          ? "Al publicarla, sus condiciones quedan fijas: para cambiar el "
                            + "descuento, los planes o la periodicidad habrá que retirarla y "
                            + "publicar otra."
                          : "Retirarla impide canjes NUEVOS. Lo ya canjeado no se toca: ni el "
                            + "descuento aplicado, ni lo que ya renueva con él."}
                      </p>
                      <div className="flex gap-2">
                        <Button type="button" disabled={pendiente}
                          onClick={() => lanzar(
                            () => confirmar.tipo === "publicar"
                              ? publishPromotionAction(p.id) : retirePromotionAction(p.id),
                            confirmar.tipo === "publicar" ? "Campaña publicada." : "Campaña retirada.")}>
                          {pendiente ? "Guardando…" : "Confirmar"}
                        </Button>
                        <Button type="button" onClick={() => setConfirmar(null)}>Volver</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {p.status === "draft" ? (
                        <Button type="button"
                          onClick={() => setConfirmar({ tipo: "publicar", id: p.id })}>
                          Publicar
                        </Button>
                      ) : null}
                      {p.status !== "retired" ? (
                        <Button type="button"
                          onClick={() => setConfirmar({ tipo: "retirar", id: p.id })}>
                          Retirar
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Canjes</h3>
        {redemptions === null ? (
          <p className="text-sm text-ink-soft">No pudimos leer los canjes.</p>
        ) : redemptions.length === 0 ? (
          <p className="text-sm text-ink-soft">Todavía nadie ha usado un cupón.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-ink-soft">
                  <th className="py-2 pr-3 font-medium">Empresa</th>
                  <th className="py-2 pr-3 font-medium">Campaña</th>
                  <th className="py-2 pr-3 font-medium">Código</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 pr-3 font-medium">Descuento</th>
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => (
                  <tr key={r.id} className="border-b border-hairline/60">
                    <td className="py-2 pr-3">
                      {r.organizationName ?? r.organizationId.slice(0, 8)}
                    </td>
                    <td className="py-2 pr-3">{r.promotionName}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.code}</td>
                    <td className="py-2 pr-3">
                      {r.planCode} · {r.billingInterval === "annual" ? "anual" : "mensual"}
                    </td>
                    <td className="py-2 pr-3">
                      {r.discountBasisPoints === null ? "—" : pct(r.discountBasisPoints)}
                    </td>
                    <td className="py-2 pr-3">{longDate(r.redeemedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** El formulario de alta. Todo con etiqueta, y el techo explicado. */
function FormularioCampana({ pendiente, onCrear, onCancelar }: {
  pendiente: boolean;
  onCrear: (datos: Parameters<typeof createPromotionAction>[0]) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [programa, setPrograma] = useState("general");
  const [porcentaje, setPorcentaje] = useState("20");
  const [planes, setPlanes] = useState<string[]>(["full"]);
  const [intervalos, setIntervalos] = useState<string[]>(["monthly", "annual"]);
  const [techo, setTecho] = useState("");
  const [fin, setFin] = useState("");
  const [maxCanjes, setMaxCanjes] = useState("");

  const alternar = (lista: string[], v: string, set: (x: string[]) => void) =>
    set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  const institucional = programa === "institutional_full";
  const bps = Math.round(Number(porcentaje.replace(",", ".")) * 100);
  const listo = nombre.trim().length >= 3 && bps > 0 && bps <= 10000
    && planes.length > 0 && intervalos.length > 0;

  return (
    <div className="space-y-4 rounded-lg border border-hairline bg-canvas p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Nombre</span>
          <input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Convenio ANDI 2026" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Descripción</span>
          <input className={campo} value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)} placeholder="Opcional" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Programa</span>
          <select className={campo} value={programa}
            onChange={(e) => {
              setPrograma(e.target.value);
              if (e.target.value === "institutional_full") setPlanes(["full"]);
            }}>
            <option value="general">General</option>
            <option value="institutional_full">Institucional · gremios y cámaras</option>
          </select>
          {institucional ? (
            <span className="block text-xs text-ink-soft">
              Solo Full, y hasta el 40 %. No tiene que ser 40: puede ser 10, 25 o 30.
            </span>
          ) : null}
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Descuento (%)</span>
          <input className={campo} inputMode="decimal" value={porcentaje}
            onChange={(e) => setPorcentaje(e.target.value)} />
        </label>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Planes elegibles</legend>
          {["full", "extra"].map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={planes.includes(p)}
                disabled={institucional && p === "extra"}
                onChange={() => alternar(planes, p, setPlanes)} />
              {p}
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Periodicidad</legend>
          {[["monthly", "Mensual"], ["annual", "Anual"]].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={intervalos.includes(v)}
                onChange={() => alternar(intervalos, v, setIntervalos)} />
              {l}
            </label>
          ))}
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Techo máximo (%)</span>
          <input className={campo} inputMode="decimal" value={techo}
            onChange={(e) => setTecho(e.target.value)}
            placeholder={institucional ? "40 por defecto" : "Sin techo"} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Fin</span>
          <input className={campo} type="date" value={fin}
            onChange={(e) => setFin(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Máximo de canjes</span>
          <input className={campo} inputMode="numeric" value={maxCanjes}
            onChange={(e) => setMaxCanjes(e.target.value.replace(/\D/g, ""))}
            placeholder="Sin límite" />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!listo || pendiente}
          onClick={() => onCrear({
            name: nombre.trim(),
            description: descripcion.trim() || null,
            program: programa,
            discountBasisPoints: bps,
            eligiblePlanCodes: planes,
            eligibleIntervals: intervalos,
            maxDiscountBasisPoints: techo.trim()
              ? Math.round(Number(techo.replace(",", ".")) * 100) : null,
            startsAt: new Date().toISOString(),
            endsAt: fin ? new Date(`${fin}T23:59:59Z`).toISOString() : null,
            maxRedemptions: maxCanjes ? Number(maxCanjes) : null,
            maxPerOrganization: 1,
          })}>
          {pendiente ? "Creando…" : "Crear en borrador"}
        </Button>
        <Button type="button" onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  );
}
