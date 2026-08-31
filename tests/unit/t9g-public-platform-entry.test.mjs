import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const landing = readFileSync(resolve("app/page.tsx"), "utf8");
const authLayout = readFileSync(resolve("app/(auth)/layout.tsx"), "utf8");

// PE-02B3 · La portada dejó de pintar cuatro tarjetas iguales y pasó a la
// jerarquía que PE-01 congeló: Quality arriba, los especializados debajo. Con
// eso, los nombres y las frases dejaron de escribirse aquí y salen del catálogo
// a través de `lib/modules/entry.ts`.
//
// Las cinco exigencias de T9G no cambian —la portada lee el catálogo canónico,
// el kill switch de Textiles se evalúa en servidor, la tarjeta exige estado
// funcional Y kill switch, el estado se pinta dinámicamente y lo funcional
// lleva al acceso compartido—; lo que cambia es dónde se comprueban. Antes se
// comparaban líneas de importación literales, y eso convertía cualquier
// reorganización en un fallo aunque la promesa siguiera cumplida.

check(
  landing.includes('from "@/lib/modules/entry"')
    && landing.includes("heroModule()")
    && landing.includes("specializedModules()"),
  "La portada debe leer el catálogo comercial canónico."
);

check(
  readFileSync(resolve("lib/modules/entry.ts"), "utf8")
    .includes('from "@/lib/modules/catalog"'),
  "La fuente que usa la portada debe apoyarse en el catálogo comercial."
);

check(
  landing.includes(
    'import { isTextilesModuleEnabled } from "@/lib/modules/textiles";'
  ),
  "La portada debe evaluar el kill switch de Textiles en servidor."
);

check(
  landing.includes('status === "functional"')
    && landing.includes("isTextilesModuleEnabled()"),
  "Textiles debe exigir estado funcional y kill switch activo."
);

check(
  landing.includes('activo ? "Disponible" : "Próximamente"'),
  "La tarjeta de Textiles debe mostrar un estado dinámico."
);

check(
  !authLayout.includes("NTC 6632 · UNE-EN 15343"),
  "El login compartido no debe presentarse únicamente como CPR."
);

check(
  !authLayout.includes(
    "Pasa de declarar contenido reciclado a poder demostrarlo."
  ),
  "El login compartido no debe conservar el mensaje exclusivo de CPR."
);

check(
  !authLayout.includes("Trazaloop CPR · beta controlada"),
  "El pie del login debe identificar la plataforma general."
);

check(
  authLayout.includes("Plataforma modular de trazabilidad"),
  "El login debe comunicar la identidad modular de Trazaloop."
);

console.log("✓ Portada y autenticación usan identidad modular.");
console.log("✓ Textiles depende del catálogo funcional y del kill switch.");
