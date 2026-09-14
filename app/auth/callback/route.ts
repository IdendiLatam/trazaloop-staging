import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { postAuthDestinationPath } from "@/lib/domain/team";
import { getPostAuthDestinationAction } from "@/server/actions/team";
import { getMyLegalAcceptanceStatusAction } from "@/server/actions/legal";

/**
 * Callback de Supabase Auth para el flujo PKCE.
 *
 * Aquí llegan DOS caminos y no se tratan igual:
 *
 *   · recuperación de contraseña — `next=/reset-password`. Se canjea el código
 *     y se manda a poner la contraseña nueva. Sin cambios respecto a antes.
 *
 *   · confirmación de cuenta — PROD-LAUNCH-01E. Antes ni siquiera llegaba
 *     aquí: `signUp` no enviaba `emailRedirectTo`, así que el enlace del correo
 *     iba al Site URL y la persona aterrizaba en la portada pública con un
 *     `?code=` que allí no consume nadie.
 *
 *
 * POR QUÉ EL DESTINO POR OMISIÓN YA NO ES `/login`
 *
 * Porque para entonces la sesión YA está puesta: el código se canjeó dos
 * líneas antes. Mandar a `/login` a alguien con sesión válida le enseña un
 * formulario que no necesita —esa pantalla no rebota a quien ya entró— y le
 * pide la contraseña por segunda vez el día que se registra.
 *
 * El destino lo deciden las MISMAS dos piezas que usa el inicio de sesión
 * normal (`redirectPostAuth`): primero la aceptación legal, que es una puerta
 * obligatoria, y después el destino canónico. No hay una segunda lógica de
 * destino, y sobre todo no sale de la URL.
 *
 *
 * QUÉ NO SE ACEPTA
 *
 * `next` sigue siendo una lista CERRADA de un solo elemento. Cualquier otro
 * valor se ignora en silencio y se cae al destino calculado en servidor: si
 * esta ruta admitiera una URL cualquiera, sería un redirector abierto firmado
 * por nuestro propio dominio.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const esRecuperacion = next === "/reset-password";

  // Sin código no hay nada que canjear. La recuperación vuelve a pedirse; una
  // confirmación sin código es un enlace ya usado o caducado, y para eso el
  // sitio correcto es el acceso.
  if (!code) {
    return NextResponse.redirect(
      new URL(esRecuperacion ? "/forgot-password" : "/login", url.origin));
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(esRecuperacion ? "/forgot-password" : "/login", url.origin));
  }

  if (esRecuperacion) {
    return NextResponse.redirect(new URL("/reset-password", url.origin));
  }

  // Cuenta confirmada y sesión puesta: se entra por la puerta de siempre.
  const legal = await getMyLegalAcceptanceStatusAction();
  if (!legal.hasAcceptedAll) {
    return NextResponse.redirect(new URL("/legal/accept", url.origin));
  }
  const destino = postAuthDestinationPath(await getPostAuthDestinationAction());
  return NextResponse.redirect(new URL(destino, url.origin));
}
