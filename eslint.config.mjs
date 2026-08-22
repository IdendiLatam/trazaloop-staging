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
  {
    // Un parámetro con guion bajo delante es una declaración explícita del
    // autor: «esto lo exige la firma y no lo uso». El repositorio ya lo hace
    // en toda server action (`_prev`, la firma que impone useActionState), así
    // que la regla debe reconocer la convención en vez de avisar de algo que
    // ya está dicho. Sin esta línea, la única forma de silenciarlo sería usar
    // el parámetro para nada, que es peor.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
