"use server";

import { revalidatePath } from "next/cache";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import { createServerClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";
import { normalizarIdentidad } from "@/lib/domain/identidad-normalizada";
import {
  POSITIONS_HEADER, POSITIONS_REQUIRED, POSITIONS_FORBIDDEN_HEADERS,
  POSITIONS_TEMPLATE_VERSION, LIMITES, dictaminar, plantillaCsv,
  type FilaCanonica, type Veredicto,
} from "@/lib/imports/positions";

/**
 * Trazaloop · STABILIZATION-04 · Importar cargos.
 *
 * DOS PASOS, Y EL PRIMERO NO ESCRIBE NADA DE NEGOCIO
 *
 *   validar → vista previa → (la persona mira y decide) → aplicar
 *
 * La vista previa deja constancia del intento en `import_jobs`/`import_job_rows`
 * —que es el marco que ya existe y no se duplica— pero NO crea ni un cargo.
 * Aplicar es una sola llamada a una función de la base, y una función es una
 * transacción: o entra la estructura entera o no entra nada.
 *
 * EL FORMATO NO MANDA. Este fichero convierte CSV en filas canónicas y se lo
 * pasa a `lib/imports/positions`, que no sabe qué es un CSV. Añadir `.xlsx`
 * mañana es escribir otro conversor aquí; ni la validación, ni la jerarquía, ni
 * los ciclos, ni la atomicidad se enteran.
 *
 * LA EMPRESA SALE DE LA SESIÓN. Nunca del archivo: `organization_id` está entre
 * los encabezados prohibidos y el trabajo se resuelve siempre contra la
 * organización activa, también al aplicar.
 */

export type ImportPositionsState = {
  error: string | null;
  jobId: string | null;
  veredicto: Veredicto | null;
  nombreArchivo: string | null;
};

export type ApplyPositionsState = {
  error: string | null;
  aplicados: number;
  hecho: boolean;
};

// Estados iniciales, SIN exportar: un módulo `"use server"` solo puede exportar
// funciones asíncronas, y exportar una constante desde aquí convierte cada
// lectura en una llamada al servidor. El invariante lo vigila una prueba, y
// aquí lo cazó: `APPLY_VACIO` estaba exportado y la pantalla lo importaba.
const VACIO: ImportPositionsState = {
  error: null, jobId: null, veredicto: null, nombreArchivo: null,
};
const APPLY_VACIO: ApplyPositionsState = { error: null, aplicados: 0, hecho: false };

/** Los mismos roles que el resto de la gestión de cargos. No se amplían. */
const ROLES = ["admin", "quality", "consultant"] as const;

type Puerta = { organizationId: string; roleCode: string };

async function puerta(): Promise<{ ok: Puerta | null; error: string | null }> {
  const acceso = await requireQualityForAction();
  if (acceso.org === null) return { ok: null, error: acceso.error };
  if (!(ROLES as readonly string[]).includes(acceso.org.roleCode)) {
    return { ok: null, error: "Tu rol no permite importar cargos en esta empresa." };
  }
  const puede = await checkQualityCanMutate();
  if (!puede.allowed) return { ok: null, error: puede.error };
  return {
    ok: { organizationId: acceso.org.organizationId, roleCode: acceso.org.roleCode },
    error: null,
  };
}

/** La plantilla, con su versión y el ejemplo de jerarquía. */
export async function downloadPositionsTemplateAction(): Promise<{
  filename: string; csv: string; version: string; error: string | null;
}> {
  const g = await puerta();
  if (!g.ok) return { filename: "", csv: "", version: "", error: g.error };
  return {
    filename: `trazaloop-cargos-${POSITIONS_TEMPLATE_VERSION}.csv`,
    csv: plantillaCsv(),
    version: POSITIONS_TEMPLATE_VERSION,
    error: null,
  };
}

/** Paso 1 · validar. Deja constancia del intento; no crea ni un cargo. */
export async function validatePositionsCsvAction(
  _prev: ImportPositionsState, formData: FormData
): Promise<ImportPositionsState> {
  const g = await puerta();
  if (!g.ok) return { ...VACIO, error: g.error };

  const archivo = formData.get("file");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ...VACIO, error: "Selecciona el archivo CSV con los cargos." };
  }
  const nombre = archivo.name.replace(/[^\w.\- ]+/g, "").slice(0, 120);
  if (!/\.csv$/i.test(nombre)) {
    return { ...VACIO, error: "El archivo tiene que ser un CSV. Guarda tu hoja de cálculo como CSV UTF-8." };
  }
  if (archivo.size > LIMITES.bytes) {
    return { ...VACIO, error: `El archivo supera ${LIMITES.bytes / (1024 * 1024)} MB.` };
  }

  const texto = await archivo.text();
  const filasCrudas = parseCsv(texto);
  if (filasCrudas.length === 0) return { ...VACIO, error: "El archivo está vacío." };

  const encabezado = (filasCrudas[0] ?? []).map((h) => h.trim().toLowerCase());
  if (encabezado.length > LIMITES.columnas) {
    return { ...VACIO, error: `El archivo trae ${encabezado.length} columnas; el máximo es ${LIMITES.columnas}.` };
  }
  const prohibida = encabezado.find((h) => POSITIONS_FORBIDDEN_HEADERS.includes(h));
  if (prohibida) {
    return { ...VACIO,
      error: `La columna «${prohibida}» no puede venir en el archivo: esos datos los pone el sistema.` };
  }
  const faltan = POSITIONS_REQUIRED.filter((c) => !encabezado.includes(c));
  if (faltan.length > 0) {
    return { ...VACIO,
      error: `Faltan columnas obligatorias: ${faltan.join(", ")}. Descarga la plantilla y vuelve a intentarlo.` };
  }

  const cuerpo = filasCrudas.slice(1).filter((f) => f.some((c) => c.trim() !== ""));
  if (cuerpo.length === 0) return { ...VACIO, error: "El archivo no tiene ninguna fila con datos." };
  if (cuerpo.length > LIMITES.filas) {
    return { ...VACIO, error: `El archivo trae ${cuerpo.length} filas; el máximo es ${LIMITES.filas}.` };
  }

  const canonicas: FilaCanonica[] = cuerpo.map((fila) => {
    const o: FilaCanonica = {};
    encabezado.forEach((col, i) => {
      if (POSITIONS_HEADER.includes(col)) o[col] = fila[i];
    });
    return o;
  });

  const supabase = await createServerClient();
  const { data: existentes } = await supabase
    .from("quality_positions")
    .select("name, code")
    .eq("organization_id", g.ok.organizationId);
  const previos = (existentes ?? []) as Array<{ name: string; code: string | null }>;

  const veredicto = dictaminar(canonicas, {
    nombresNormalizados: previos.map((p) => normalizarIdentidad(p.name)),
    codigos: previos.map((p) => p.code ?? "").filter(Boolean),
  });

  const { data: job, error: eJob } = await supabase
    .from("import_jobs")
    .insert({
      organization_id: g.ok.organizationId,
      entity: "positions",
      filename: nombre,
      total_rows: veredicto.total,
      inserted_rows: 0,
      skipped_rows: veredicto.errores,
      status: "validated",
      errors: { template_version: POSITIONS_TEMPLATE_VERSION },
    })
    .select("id").single();
  if (eJob || !job) return { ...VACIO, error: "No se pudo registrar la validación." };

  const { error: eFilas } = await supabase.from("import_job_rows").insert(
    veredicto.filas.map((d) => ({
      organization_id: g.ok!.organizationId,
      import_job_id: job.id as string,
      row_number: d.fila,
      status: d.estado,
      entity_type: "position",
      raw_data: canonicas[d.fila - 2] ?? {},
      normalized_data: {
        codigo: d.codigo, nombre_cargo: d.nombre, cargo_superior: d.superior,
        descripcion: (canonicas[d.fila - 2]?.descripcion ?? "").trim(),
        unidad: (canonicas[d.fila - 2]?.unidad ?? "").trim(),
      },
      errors: d.errores,
      warnings: d.avisos,
    }))
  );
  if (eFilas) return { ...VACIO, error: "No se pudo registrar el detalle de la validación." };

  return { error: null, jobId: job.id as string, veredicto, nombreArchivo: nombre };
}

/** Paso 2 · aplicar. Una llamada, una transacción, todo o nada. */
export async function applyPositionsImportAction(
  _prev: ApplyPositionsState, formData: FormData
): Promise<ApplyPositionsState> {
  // Se vuelve a comprobar TODO. Que la vista previa lo hiciera hace un minuto
  // no dice nada del momento de escribir: el rol pudo cambiar, y el trabajo
  // pudo no ser de esta empresa.
  const g = await puerta();
  if (!g.ok) return { ...APPLY_VACIO, error: g.error };

  const jobId = String(formData.get("import_job_id") ?? "");
  if (!jobId) return { ...APPLY_VACIO, error: "Falta la importación a aplicar." };

  const supabase = await createServerClient();
  const { data: job } = await supabase
    .from("import_jobs")
    .select("id, entity, status")
    .eq("id", jobId)
    .eq("organization_id", g.ok.organizationId)
    .maybeSingle();
  if (!job || job.entity !== "positions" || job.status !== "validated") {
    return { ...APPLY_VACIO,
      error: "Esa importación no existe, no es de tu empresa o ya se aplicó." };
  }

  const { count: conErrores } = await supabase
    .from("import_job_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_job_id", jobId)
    .eq("organization_id", g.ok.organizationId)
    .eq("status", "error");
  if ((conErrores ?? 0) > 0) {
    return { ...APPLY_VACIO,
      error: "Corrige los errores del archivo y vuelve a validarlo antes de aplicar." };
  }

  const { data, error } = await supabase.rpc("quality_import_positions_apply", {
    p_job_id: jobId,
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("POSITION_HIERARCHY_CYCLE")) {
      return { ...APPLY_VACIO,
        error: "La jerarquía del archivo se cierra sobre sí misma. No se creó ningún cargo." };
    }
    if (m.includes("POSITION_PARENT_UNRESOLVED")) {
      return { ...APPLY_VACIO,
        error: "Un cargo superior del archivo no se pudo resolver. No se creó ningún cargo." };
    }
    if (m.includes("quality_positions_org_normalized_uniq")
        || m.includes("quality_positions_org_name_uniq")) {
      return { ...APPLY_VACIO,
        error: "Mientras revisabas, alguien creó un cargo con uno de esos nombres. "
             + "No se creó ninguno: vuelve a validar el archivo." };
    }
    if (m.includes("quality_positions_org_code_uniq")) {
      return { ...APPLY_VACIO,
        error: "Uno de los códigos del archivo ya existe en la empresa. No se creó ningún cargo." };
    }
    return { ...APPLY_VACIO, error: "No se pudo aplicar la importación. No se creó ningún cargo." };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.outcome !== "committed") {
    return { ...APPLY_VACIO, error: "Esa importación ya no se puede aplicar." };
  }

  revalidatePath("/quality/positions");
  return { error: null, aplicados: Number(r.created ?? 0), hecho: true };
}
