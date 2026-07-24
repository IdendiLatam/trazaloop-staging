import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const landing = readFileSync(resolve("app/page.tsx"), "utf8");
const authLayout = readFileSync(resolve("app/(auth)/layout.tsx"), "utf8");

check(
  landing.includes(
    'import { getCommercialModuleByKey } from "@/lib/modules/catalog";'
  ),
  "La portada debe leer el catálogo comercial canónico."
);

check(
  landing.includes(
    'import { isTextilesModuleEnabled } from "@/lib/modules/textiles";'
  ),
  "La portada debe evaluar el kill switch de Textiles en servidor."
);

check(
  landing.includes(
    'textilesModule?.status === "functional" && isTextilesModuleEnabled()'
  ),
  "Textiles debe exigir estado funcional y kill switch activo."
);

check(
  landing.includes(
    'textilesAvailable ? "Disponible" : "Próximamente"'
  ),
  "La tarjeta de Textiles debe mostrar un estado dinámico."
);

check(
  landing.includes("href={entryHref}"),
  "La tarjeta funcional debe dirigir al acceso compartido de Trazaloop."
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
