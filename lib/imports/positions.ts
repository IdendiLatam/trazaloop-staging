import { normalizarIdentidad } from "@/lib/domain/identidad-normalizada";

/**
 * Trazaloop · STABILIZATION-04 · Las reglas de negocio del importador de cargos.
 *
 * POR QUÉ ESTE FICHERO NO SABE QUÉ ES UN CSV
 *
 * Recibe FILAS CANÓNICAS —un arreglo de objetos con las claves de la plantilla—
 * y devuelve un dictamen. Quién las produjo no le importa. Hoy las produce un
 * lector de CSV; el día que haga falta `.xlsx` bastará con un adaptador que
 * entregue las mismas filas, y nada de lo que hay aquí —validación, duplicados,
 * jerarquía, ciclos, vista previa— tendrá que reescribirse.
 *
 * Y no toca la base: es lógica pura, así que se puede ejercitar entera sin
 * levantar Postgres.
 */

export const POSITIONS_TEMPLATE_VERSION = "cargos-v1";

export type ColumnaPlantilla = {
  key: string;
  required: boolean;
  description: string;
};

/**
 * LA PLANTILLA, decidida contra el esquema real y no contra una idea.
 *
 * `codigo` es el código del cargo que la tabla YA tenía (`quality_positions.code`,
 * con unicidad propia por empresa). Sirve para dos cosas a la vez: se guarda, y
 * es lo que una fila usa para señalar a su superior. Inventar un segundo código
 * «solo de importación» habría añadido una columna que nadie más entiende.
 *
 * `unidad` escribe en `org_unit`, la columna de texto que usa hoy el alta
 * manual. Resolver contra `quality_org_units` es otra conversación: obligaría a
 * crear unidades desde el archivo o a rechazar filas por un catálogo que el
 * usuario todavía no ha montado.
 *
 * Competencias, perfil versionado, funciones, personas y asignaciones NO están:
 * son V2 declarada, no un olvido.
 */
export const POSITIONS_TEMPLATE: ColumnaPlantilla[] = [
  { key: "codigo", required: true,
    description: "Código del cargo, único en la empresa. Es lo que usan otras filas para señalarlo como superior." },
  { key: "nombre_cargo", required: true,
    description: "Nombre del cargo. Dos nombres que solo se diferencian en mayúsculas, espacios o acentos son el mismo cargo." },
  { key: "cargo_superior", required: false,
    description: "Código del cargo del que depende. Vacío si no depende de ninguno." },
  { key: "descripcion", required: false,
    description: "Descripción breve del cargo (opcional)." },
  { key: "unidad", required: false,
    description: "Área o unidad a la que pertenece, en texto (opcional)." },
];

export const POSITIONS_HEADER = POSITIONS_TEMPLATE.map((c) => c.key);
export const POSITIONS_REQUIRED = POSITIONS_TEMPLATE.filter((c) => c.required).map((c) => c.key);

/** Lo que el archivo NUNCA puede gobernar. La empresa sale de la sesión. */
export const POSITIONS_FORBIDDEN_HEADERS = [
  "id", "organization_id", "organization id", "org_id", "organizationid",
  "created_by", "created_at", "updated_at", "normalized_name",
  "parent_position_id", "org_unit_id", "position_id",
];

export const LIMITES = {
  filas: 5000,
  columnas: 25,
  bytes: 2 * 1024 * 1024,
  largoCampo: 300,
  largoDescripcion: 2000,
} as const;

export type FilaCanonica = Record<string, string | undefined>;

export type Dictamen = {
  fila: number;
  codigo: string;
  nombre: string;
  superior: string;
  estado: "valid" | "warning" | "error";
  errores: string[];
  avisos: string[];
};

export type Veredicto = {
  filas: Dictamen[];
  total: number;
  validas: number;
  errores: number;
  avisos: number;
  /** Los enlaces que se crearían, ya resueltos por código. */
  relaciones: Array<{ hijo: string; padre: string }>;
};

/**
 * UNA CELDA NO ES UNA FÓRMULA.
 *
 * Un valor que empieza por `=`, `+`, `-` o `@` es, para una hoja de cálculo,
 * una fórmula. Aquí es texto y nada más — pero se rechaza en los campos donde
 * esa forma no significa nada, porque casi siempre es un archivo mal exportado
 * o alguien intentando que el fichero haga algo al abrirlo en otro sitio.
 *
 * La misma regla vale al GENERAR: la plantilla y los informes se escapan, para
 * no convertirnos en el problema de quien los abra.
 */
const ARRANQUE_PELIGROSO = /^[=+\-@\t\r]/;

export function pareceFormula(valor: string): boolean {
  return ARRANQUE_PELIGROSO.test(valor);
}

/** Un valor listo para escribirse en un CSV sin que otra hoja lo interprete. */
export function celdaSegura(valor: string): string {
  const v = pareceFormula(valor) ? `'${valor}` : valor;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const limpiar = (v: string | undefined): string =>
  (v ?? "").replace(/\s+/g, " ").trim();

/**
 * El dictamen completo del archivo. NO escribe nada: dice qué pasaría.
 *
 * `existentes` son las identidades que ya hay en la empresa, normalizadas, para
 * poder decir «este cargo ya existe» antes de intentarlo. No sustituye a la
 * unicidad de la base —entre la vista previa y la aplicación puede aparecer
 * otro—: solo evita que el usuario descubra el choque al final.
 */
export function dictaminar(
  filas: FilaCanonica[],
  existentes: { nombresNormalizados: string[]; codigos: string[] } = { nombresNormalizados: [], codigos: [] }
): Veredicto {
  const yaNombres = new Set(existentes.nombresNormalizados);
  const yaCodigos = new Set(existentes.codigos.map((c) => c.toLowerCase()));

  const vistosNombre = new Map<string, number>();
  const vistosCodigo = new Map<string, number>();
  const dictamenes: Dictamen[] = [];

  filas.forEach((cruda, i) => {
    const numero = i + 2;                 // +2: la 1 es el encabezado
    const codigo = limpiar(cruda.codigo);
    const nombre = limpiar(cruda.nombre_cargo);
    const superior = limpiar(cruda.cargo_superior);
    const descripcion = limpiar(cruda.descripcion);
    const unidad = limpiar(cruda.unidad);
    const errores: string[] = [];
    const avisos: string[] = [];

    if (!codigo) errores.push("Falta el código del cargo.");
    if (!nombre) errores.push("Falta el nombre del cargo.");

    for (const [campo, valor, tope] of [
      ["código", codigo, LIMITES.largoCampo],
      ["nombre", nombre, LIMITES.largoCampo],
      ["cargo superior", superior, LIMITES.largoCampo],
      ["unidad", unidad, LIMITES.largoCampo],
      ["descripción", descripcion, LIMITES.largoDescripcion],
    ] as const) {
      if (valor.length > tope) errores.push(`El ${campo} supera ${tope} caracteres.`);
      if (valor && pareceFormula(valor)) {
        errores.push(`El ${campo} empieza por un signo que una hoja de cálculo leería como fórmula.`);
      }
    }

    const clave = normalizarIdentidad(nombre);
    if (clave) {
      if (yaNombres.has(clave)) errores.push("CARGO_DUPLICADO · ya existe un cargo con ese nombre en la empresa.");
      const antes = vistosNombre.get(clave);
      if (antes) errores.push(`Ese cargo ya aparece en la fila ${antes} de este archivo.`);
      else vistosNombre.set(clave, numero);
    }

    const codigoClave = codigo.toLowerCase();
    if (codigoClave) {
      if (yaCodigos.has(codigoClave)) errores.push("CODIGO_DUPLICADO · ese código ya existe en la empresa.");
      const antes = vistosCodigo.get(codigoClave);
      if (antes) errores.push(`Ese código ya aparece en la fila ${antes} de este archivo.`);
      else vistosCodigo.set(codigoClave, numero);
    }

    if (superior && superior.toLowerCase() === codigoClave) {
      errores.push("Un cargo no puede ser su propio superior.");
    }

    dictamenes.push({
      fila: numero, codigo, nombre, superior,
      estado: errores.length ? "error" : avisos.length ? "warning" : "valid",
      errores, avisos,
    });
  });

  // El superior se resuelve contra los códigos DEL ARCHIVO, así que el orden de
  // las filas deja de importar: la fila 1 puede depender de la fila 3.
  const porCodigo = new Map<string, Dictamen>();
  for (const d of dictamenes) if (d.codigo) porCodigo.set(d.codigo.toLowerCase(), d);

  for (const d of dictamenes) {
    if (!d.superior) continue;
    if (!porCodigo.has(d.superior.toLowerCase())) {
      d.errores.push(`El cargo superior «${d.superior}» no está en el archivo.`);
      d.estado = "error";
    }
  }

  // Y los ciclos, antes de escribir nada. Se sube por la cadena de superiores
  // desde cada fila; si se vuelve a pisar la misma, hay ciclo.
  for (const d of dictamenes) {
    if (d.estado === "error" || !d.superior) continue;
    const camino = new Set<string>([d.codigo.toLowerCase()]);
    let actual = d.superior.toLowerCase();
    let pasos = 0;
    while (actual) {
      if (camino.has(actual)) {
        d.errores.push("La jerarquía se cierra sobre sí misma: subiendo por los superiores se vuelve a este cargo.");
        d.estado = "error";
        break;
      }
      camino.add(actual);
      pasos += 1;
      if (pasos > 100) {
        d.errores.push("La cadena de superiores es demasiado profunda.");
        d.estado = "error";
        break;
      }
      const siguiente = porCodigo.get(actual);
      actual = siguiente?.superior?.toLowerCase() ?? "";
    }
  }

  const relaciones = dictamenes
    .filter((d) => d.estado !== "error" && d.superior)
    .map((d) => ({ hijo: d.codigo, padre: d.superior }));

  return {
    filas: dictamenes,
    total: dictamenes.length,
    validas: dictamenes.filter((d) => d.estado !== "error").length,
    errores: dictamenes.filter((d) => d.estado === "error").length,
    avisos: dictamenes.filter((d) => d.estado === "warning").length,
    relaciones,
  };
}

/** La plantilla descargable: encabezado, un ejemplo que enseña la jerarquía. */
export function plantillaCsv(): string {
  const ejemplo = [
    ["DIR", "Dirección General", "", "Responde por el sistema de gestión.", "Dirección"],
    ["COORD-CAL", "Coordinación de Calidad", "DIR", "Coordina el SGC.", "Calidad"],
    ["ANALISTA-CAL", "Analista de Calidad", "COORD-CAL", "", "Calidad"],
  ];
  const lineas = [
    POSITIONS_HEADER.join(","),
    ...ejemplo.map((f) => f.map(celdaSegura).join(",")),
  ];
  // BOM: sin él, Excel abre el archivo en la codificación del sistema y
  // «Coordinación de Producción» aparece con la tilde rota. Con él, Excel
  // reconoce UTF-8 sin preguntar nada.
  return "﻿" + lineas.join("\r\n") + "\r\n";
}
