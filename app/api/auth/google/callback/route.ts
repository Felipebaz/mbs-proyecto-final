import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { fusionarCarritoAnonimo } from "@/lib/carrito/repositorio";
import { completarLoginGoogle, ErrorOauth } from "@/lib/auth/google";
import { crearSesion, escribirCookieSesion } from "@/lib/auth/sesion";

/**
 * Vuelta de Google.
 *
 * Todo lo que llega en la query lo puso el navegador, no Google: cualquiera
 * puede abrir esta URL a mano. Lo que hace confiable al flujo es que el `state`
 * coincida con la cookie que escribimos al salir, y que el id_token lo vayamos
 * a buscar nosotros al endpoint de Google con nuestro client_secret.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // El usuario apretó "Cancelar" en la pantalla de Google.
  const errorDeGoogle = params.get("error");
  if (errorDeGoogle) {
    return redirigir(request, "/login?error=cancelado");
  }

  try {
    const { usuario, destino } = await completarLoginGoogle(
      params.get("code"),
      params.get("state"),
    );

    const h = await headers();

    // Sesión nueva en cada login: nunca se reusa la anterior.
    const { token, expiraEn } = await crearSesion(usuario.id, {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent"),
    });
    await escribirCookieSesion(token, expiraEn);

    await fusionarCarritoAnonimo(usuario.id);

    return redirigir(request, destino);
  } catch (e) {
    if (e instanceof ErrorOauth) {
      // El motivo real va al log del servidor, no a la URL del navegador: los
      // detalles de por qué falló una validación de seguridad no le sirven al
      // usuario y sí a quien esté probando.
      console.warn("[auth] callback de Google rechazado:", e.message);
      return redirigir(request, "/login?error=google");
    }
    throw e;
  }
}

/**
 * `destino` ya viene validado como ruta interna desde la cookie; se resuelve
 * contra el origen del request y no contra un header que pueda venir falseado.
 */
function redirigir(request: NextRequest, destino: string) {
  return NextResponse.redirect(new URL(destino, request.nextUrl.origin));
}
