import { timingSafeEqual } from "node:crypto";
import { connection, NextResponse, type NextRequest } from "next/server";
import { purgarCarritosAbandonados } from "@/lib/carrito/repositorio";
import { purgarSesionesVencidas } from "@/lib/auth/sesion";
import { purgarTokensVencidos } from "@/lib/auth/tokens";

/**
 * Limpieza periódica. Sin esto, `sesion` crece con cada login que nunca cerró
 * sesión y `carrito` con cada bot que agregó algo una vez.
 *
 * En Vercel se agenda con `vercel.json`:
 *   { "crons": [{ "path": "/api/cron/limpieza", "schedule": "0 4 * * *" }] }
 */
function autorizado(request: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;

  const recibido = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!recibido) return false;

  // Comparación de tiempo constante: `===` sale antes en el primer byte
  // distinto, y esa diferencia de microsegundos deja adivinar el token byte a
  // byte. Los Buffer tienen que medir igual o `timingSafeEqual` tira.
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  // Sin esto, con `cacheComponents` Next prerenderiza esta ruta en el build y
  // sirve para siempre la respuesta congelada: el cron correría contra un 404
  // cacheado y la limpieza no pasaría nunca. Se ve en `next build` como ○
  // (Static) en vez de ƒ (Dynamic).
  await connection();

  if (!autorizado(request)) {
    // 404 y no 401: no hace falta confirmarle a nadie que este endpoint existe.
    return new NextResponse("Not found", { status: 404 });
  }

  await purgarSesionesVencidas();
  await purgarCarritosAbandonados();
  await purgarTokensVencidos();

  return NextResponse.json({ ok: true, momento: new Date().toISOString() });
}
