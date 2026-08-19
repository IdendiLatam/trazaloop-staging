import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Q0.3H · Artefactos GENERADOS por el stack local de Supabase
    // (`supabase start` / `supabase db reset`). No son código del proyecto:
    // `.temp/` guarda los secretos efímeros del stack y `.branches/` el estado
    // de rama del CLI. Al levantar el entorno local ESLint los analizaba y
    // producía ~186 problemas que ocultaban el único hallazgo real.
    //
    // NO se ignora `supabase/migrations/**` ni `supabase/config.toml`: son
    // archivos del repositorio y deben seguir cubiertos.
    "supabase/.temp/**",
    "supabase/.branches/**",
  ]),
]);

export default eslintConfig;
