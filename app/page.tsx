import { redirect } from "next/navigation";

/**
 * Raíz: redirección simple SIN consultar Supabase.
 * El layout protegido de /dashboard exige sesión y redirige a /login si no
 * hay; así el build nunca depende de red ni de una sesión real.
 */
export default function Home() {
  redirect("/dashboard");
}
