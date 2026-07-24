import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy de sesión (convención Next 16, antes "middleware"): refresca los tokens de Supabase Auth en cada
 * petición para que los Server Components siempre vean una sesión válida.
 * No implementa autorización (eso lo hacen requireSession + RLS).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Clave PÚBLICA (siempre sujeta a RLS). Nombre vigente
  // NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, con respaldo temporal en el
  // heredado NEXT_PUBLIC_SUPABASE_ANON_KEY — misma jerarquía que
  // lib/supabase/server.ts y lib/supabase/browser.ts. Aquí NUNCA entra una
  // clave secreta.
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresca la sesión si es necesario (importante: getUser, no getSession).
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Todo excepto estáticos e imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
