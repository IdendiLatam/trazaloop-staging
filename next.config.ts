import type { NextConfig } from "next";

/**
 * Sprint 8.1 · Endurecimiento del build: "Collecting build traces" lento o
 * sin terminar.
 *
 * Next.js usa @vercel/nft para determinar, por cada ruta, qué archivos hay
 * que incluir en su bundle de servidor. Por defecto INFIERE la raíz de ese
 * rastreo caminando hacia arriba en el árbol de directorios hasta
 * encontrar un lockfile — en entornos con estructuras de carpetas fuera de
 * lo común (CI, contenedores, symlinks, checkouts anidados) esa inferencia
 * puede terminar arrastrando carpetas ajenas al proyecto al rastreo,
 * haciéndolo mucho más lento o, en casos extremos, dejarlo sin terminar
 * (documentado ampliamente por la comunidad de Next.js para "Collecting
 * build traces" en distintas versiones, incluida la 16.x).
 *
 * outputFileTracingRoot y outputFileTracingExcludes son ESTABLES desde
 * Next.js 15 (ya no experimental) y Vercel los respeta igual: no rompen
 * el despliegue, solo acotan el trabajo de rastreo a lo que el proyecto
 * realmente necesita.
 */
const nextConfig: NextConfig = {
  // Fija la raíz del rastreo al propio proyecto: nunca infiere hacia
  // arriba, sea cual sea la estructura de carpetas del entorno donde corra
  // el build.
  outputFileTracingRoot: process.cwd(),

  // Excluye del rastreo carpetas que ninguna ruta de la app necesita en su
  // bundle de servidor: tests, scripts administrativos (que sí usan `pg`,
  // devDependency pesada y ajena a las rutas), migraciones SQL y
  // documentación. Reduce el trabajo de "Collecting build traces" sin
  // tocar qué se incluye para las rutas reales.
  outputFileTracingExcludes: {
    "/*": [
      "./tests/**/*",
      "./scripts/**/*",
      "./supabase/**/*",
      "./docs/**/*",
      "./.git/**/*",
    ],
  },
};

export default nextConfig;
