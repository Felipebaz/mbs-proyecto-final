import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { iniciarLoginGoogle } from "@/lib/auth/google";
import { consumir } from "@/lib/auth/rate-limit";

/**
 * Arranque del login con Google.
 *
 * Es GET y no POST a propósito: es una navegación top-level, que es lo que
 * `SameSite=Lax` permite y lo que necesita el flujo. No muta nada del lado
 * nuestro más que escribir las cookies de estado, que son de un solo uso y
 * duran 10 minutos.
 */
export async function GET(request: NextRequest) {
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sin-ip";

  // Cada request escribe cookies y quema un state. Sin tope, es un generador
  // gratis de trabajo para el servidor.
  if (!(await consumir("oauthPorIp", ip)).permitido) {
    return new NextResponse("Demasiados intentos.", { status: 429 });
  }

  // `destino` se valida dentro de `iniciarLoginGoogle`: sólo rutas internas.
  // Sin eso, ?destino=https://sitio-falso.com nos convierte en open redirect.
  const destino = request.nextUrl.searchParams.get("destino");

  const url = await iniciarLoginGoogle(destino);
  return NextResponse.redirect(url);
}
