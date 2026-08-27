"use client";

import { useActionState, useState } from "react";
import {
  updateOrganizationProfileAction, type SettingsActionState,
} from "@/server/actions/settings";
import type { SectorOption, ProfileRow } from "@/lib/db/organization-profile";
import {
  ORG_PROFILE_LIMITS, parseProductsServices,
} from "@/lib/domain/organization-profile";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: SettingsActionState = { error: null };

const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink "
  + "placeholder:text-ink-soft/60 focus:border-loop";

/**
 * Trazaloop · QUALITY-12.2B · «A qué se dedica esta empresa».
 *
 * Cuatro campos, todos opcionales, todos cortos. No es un formulario de alta:
 * es algo que se completa cuando se tiene tiempo y que mejora la ayuda de
 * redacción. Por eso el aviso dice para qué sirve —nadie rellena un campo cuyo
 * propósito no entiende— y por eso ninguno es obligatorio aquí.
 *
 * Los topes se muestran mientras se escribe. Aparecen porque este perfil está
 * pensado para viajar junto al texto que alguien redacta: un párrafo de mil
 * palabras aquí no ayudaría más, ocuparía el sitio de lo que sí ayuda.
 */
export function OrganizationProfileForm({
  profile, sectors, canManage,
}: {
  profile: ProfileRow;
  sectors: SectorOption[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateOrganizationProfileAction, initial);
  const [actividad, setActividad] = useState(profile.primaryActivity ?? "");
  const [descripcion, setDescripcion] = useState(profile.description ?? "");
  const [productos, setProductos] = useState(profile.productsServices.join("\n"));

  const items = parseProductsServices(productos);

  if (!canManage) {
    return (
      <div className="space-y-3">
        <InfoAlert message="Tu rol permite consultar estos datos, pero no modificarlos." />
        <Resumen profile={profile} sectors={sectors} />
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />
      {state.success ? <InfoAlert message="Perfil actualizado correctamente." /> : null}

      <p className="text-xs text-ink-soft">
        Esto ayuda a Trazaloop a hablar el lenguaje de tu empresa cuando te
        acompañe a redactar documentos. Son datos sobre a qué te dedicas, no
        sobre cómo trabajas: nada de lo que escribas aquí se convierte en un
        registro de tu sistema de gestión.
      </p>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-ink">Sector</span>
        <select
          name="sector_code" defaultValue={profile.sectorCode ?? ""} className={inputClass}
        >
          <option value="">Sin especificar</option>
          {sectors.map((s) => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-ink">Actividad principal</span>
        <input
          name="primary_activity" value={actividad} maxLength={ORG_PROFILE_LIMITS.primaryActivity}
          onChange={(e) => setActividad(e.target.value)} className={inputClass}
          placeholder="Fabricación de envases plásticos a partir de resina reciclada"
        />
        <span className="block text-[11px] text-ink-soft">
          Una línea. {actividad.length}/{ORG_PROFILE_LIMITS.primaryActivity}
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-ink">Productos o servicios principales</span>
        <textarea
          name="products_services" rows={4} value={productos}
          onChange={(e) => setProductos(e.target.value)} className={inputClass}
          placeholder={"Uno por línea:\nEnvases para alimentos\nPreformas PET\nMaquila de soplado"}
        />
        <span className="block text-[11px] text-ink-soft">
          Uno por línea, los principales. {items.length}/{ORG_PROFILE_LIMITS.productItems}
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-ink">Descripción breve</span>
        <textarea
          name="organization_description" rows={3} value={descripcion}
          maxLength={ORG_PROFILE_LIMITS.description}
          onChange={(e) => setDescripcion(e.target.value)} className={inputClass}
          placeholder="Qué hace la empresa, para quién y desde dónde."
        />
        <span className="block text-[11px] text-ink-soft">
          {descripcion.length}/{ORG_PROFILE_LIMITS.description}
        </span>
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar perfil"}
      </Button>
    </form>
  );
}

function Resumen({ profile, sectors }: { profile: ProfileRow; sectors: SectorOption[] }) {
  const sector = sectors.find((s) => s.code === profile.sectorCode);
  const filas: [string, string][] = [
    ["Sector", sector?.name ?? "Sin especificar"],
    ["Actividad principal", profile.primaryActivity ?? "Sin especificar"],
    ["Productos o servicios", profile.productsServices.join(", ") || "Sin especificar"],
    ["Descripción", profile.description ?? "Sin especificar"],
  ];
  return (
    <dl className="space-y-2 text-sm">
      {filas.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-ink-soft">{k}</dt>
          <dd className="text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
