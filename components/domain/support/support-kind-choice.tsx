"use client";

import { useState } from "react";
import type { SupportEntitlement } from "@/lib/db/support-entitlements";

/**
 * Trazaloop · PE-04B5 · Qué necesitas.
 *
 * La categoría dice DE QUÉ va el ticket. Esto dice QUÉ SE PIDE, que es lo único
 * que decide si consume uno de los casos incluidos. Se pregunta explícitamente
 * porque deducirlo de la etiqueta que el cliente eligió para el tema sería
 * deducir un derecho comercial de una palabra suya.
 *
 * Y se dice la verdad ANTES de escribir nada: si el plan no incluye orientación
 * funcional, la opción aparece deshabilitada y explicada, no oculta. Esconderla
 * dejaría a alguien preguntándose por qué su duda de uso nunca se responde.
 */
export function SupportKindChoice({ entitlement }: { entitlement: SupportEntitlement | null }) {
  const [kind, setKind] = useState<"technical" | "functional_guidance">("technical");

  const incluida = entitlement?.functionalGuidanceAllowed === true;
  const restantes = entitlement?.functionalCasesRemaining ?? null;
  const limite = entitlement?.functionalCasesLimit ?? null;
  const agotado = incluida && restantes !== null && restantes <= 0;
  const noSeSabe = entitlement === null || entitlement.state === "UNAVAILABLE";

  return (
    <fieldset className="space-y-2 rounded-md border border-hairline p-3">
      <legend className="px-1 text-sm font-medium text-ink">¿Qué necesitas?</legend>
      <input type="hidden" name="support_kind" value={kind} />

      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="radio"
          name="support_kind_choice"
          className="mt-1"
          checked={kind === "technical"}
          onChange={() => setKind("technical")}
        />
        <span>
          <span className="font-medium text-ink">Reportar un problema técnico</span>
          <span className="block text-xs text-ink-soft">
            Algo de Trazaloop no funciona: una pantalla falla, una carga no termina, un
            resultado da error. Disponible en todos los planes y no consume casos.
          </span>
        </span>
      </label>

      <label
        className={`flex items-start gap-2 text-sm ${
          incluida && !agotado ? "cursor-pointer" : "cursor-not-allowed opacity-70"
        }`}
      >
        <input
          type="radio"
          name="support_kind_choice"
          className="mt-1"
          disabled={!incluida || agotado}
          checked={kind === "functional_guidance"}
          onChange={() => setKind("functional_guidance")}
        />
        <span>
          <span className="font-medium text-ink">Orientación funcional</span>
          <span className="block text-xs text-ink-soft">
            Ayuda para entender o usar Trazaloop: dónde se configura algo, cómo funciona una
            función, qué significa un resultado.
          </span>
          {noSeSabe ? (
            <span className="mt-1 block text-xs text-ink-soft">
              No se pudo comprobar qué incluye tu plan ahora mismo. Reportar un problema técnico
              sigue disponible.
            </span>
          ) : incluida ? (
            <span className="mt-1 block text-xs text-ink-soft">
              Incluida en tu plan: {restantes ?? 0} de {limite ?? 0} casos disponibles este mes.
              {agotado ? " Vuelven a estar disponibles al empezar el mes siguiente." : null}
              {" "}Objetivo de respuesta inicial: 1 día hábil.
            </span>
          ) : (
            // Se explica, no se vende: la compra es de PE-05 y aquí no hay
            // ningún botón que lleve a pagar.
            <span className="mt-1 block text-xs text-ink-soft">
              Disponible con el plan Extra. Con tu plan tienes la FAQ, la ayuda de cada pantalla,
              los tutoriales e Intelligence dentro de tu cuota.
            </span>
          )}
        </span>
      </label>
    </fieldset>
  );
}
