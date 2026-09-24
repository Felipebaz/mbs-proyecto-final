import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * CSP estricta con nonce, sólo para el panel.
 *
 * [decisión] Por qué acá y no para todo el sitio.
 *
 * Una CSP con nonce es más fuerte que la estática de `next.config.ts` —elimina
 * `'unsafe-inline'`, y con eso la posibilidad de que una inyección de HTML
 * ejecute un `<script>`—. Pero generar un nonce por request obliga a render
 * dinámico, y el catálogo prerenderiza la landing y las 8 fichas de producto.
 *
 * El panel ya es 100% dinámico: lee sesión en cada request. Así que ahí la CSP
 * con nonce no cuesta nada, y es donde más vale — es la parte de la app con los
 * datos de todos los clientes y los números del negocio.
 *
 * El resto del sitio sigue con la CSP estática de `next.config.ts`, que igual
 * bloquea scripts externos, `object-src`, `base-uri` y `form-action`.
 *
 * [límite] Esto NO es una barrera de autorización. El proxy no consulta la base
 * ni valida sesiones: `requerirAdmin()` lo hace, dentro de cada página, cada
 * server action y cada route handler. El proxy corre en cada request —incluidos
 * los prefetch— y una consulta acá se pagaría en todos.
 */

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const enDesarrollo = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    /*
     * 'strict-dynamic' hace que un script con nonce válido pueda cargar otros;
     * es lo que permite que la hidratación de Next funcione sin listar hashes.
     * En desarrollo hace falta 'unsafe-eval' porque React usa eval para
     * reconstruir los stacks de error del servidor. En producción no.
     */
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${enDesarrollo ? " 'unsafe-eval'" : ""}`,
    // Tailwind v4 inyecta estilos inline; el nonce no alcanza para los estilos
    // que genera React, así que acá se mantiene 'unsafe-inline'. Un estilo
    // inyectado puede desfigurar la página, no ejecutar código.
    "style-src 'self' 'unsafe-inline'",
    // `data:` para el QR del segundo factor, que se genera en el servidor.
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  // El header en el request es lo que deja a Next pasarle el nonce a sus
  // propios scripts de hidratación.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const respuesta = NextResponse.next({ request: { headers } });
  respuesta.headers.set("Content-Security-Policy", csp);

  /*
   * Aislamiento de origen, sólo para el panel.
   *
   * COOP corta la referencia `window.opener`, así que una pestaña abierta desde
   * acá no puede manipular esta. COEP y CORP cierran las lecturas cruzadas que
   * habilitan los ataques de canal lateral tipo Spectre.
   *
   * Van sólo acá porque COEP rompe cualquier recurso de terceros sin CORS — en
   * el sitio público eso sería un problema el día que entre un pixel de
   * analítica o un mapa embebido; en el panel no hay nada de afuera.
   */
  respuesta.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  respuesta.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  respuesta.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  return respuesta;
}

/**
 * Sólo el panel. El matcher tiene que ser literal: Next lo lee en tiempo de
 * build para armar el ruteo, así que no acepta una variable.
 */
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
