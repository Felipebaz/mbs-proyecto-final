import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  decidirPorHost,
  esRutaPanel,
  HEADER_HOST_PANEL,
} from "@/lib/panel/host";

/**
 * Dos trabajos: separar el panel de la tienda por host (ver
 * `lib/panel/host.ts`) y poner una CSP estricta con nonce en el panel.
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
  const { pathname, search } = request.nextUrl;

  const decision = decidirPorHost({
    host: request.headers.get("host") ?? request.nextUrl.host,
    pathname,
    search,
    hostPanel: process.env.ADMIN_HOST,
    urlTienda: process.env.APP_URL ?? "http://localhost:3000",
  });

  if (decision.tipo === "no-encontrado") {
    // Reescribir a una ruta que no existe da el 404 normal de la app.
    return NextResponse.rewrite(new URL("/_no-existe", request.url));
  }
  if (decision.tipo === "redirigir") {
    const destino = new URL(decision.url, request.url);

    /*
     * Next vuelve relativo todo `Location` cuyo host coincida con el de
     * `request.url`. En desarrollo ese host es siempre `localhost:3000`,
     * aunque se haya entrado por `admin.localhost`, así que el redirect a la
     * tienda llegaría como `/carrito` y el navegador se quedaría en el panel,
     * en loop. En ese caso se deja pasar: es sólo orden, no seguridad.
     * En Vercel `request.url` trae el host real y no pasa.
     */
    const seriaLoop =
      destino.host === request.nextUrl.host && destino.pathname === pathname;

    if (!seriaLoop) return NextResponse.redirect(destino);
  }

  /*
   * El header lo pone SIEMPRE el proxy, pisando lo que haya mandado el
   * cliente: si no, cualquiera podría decirle a la página que está en el
   * panel. Igual sólo cambia qué se muestra en el login, nunca un permiso.
   */
  const headers = new Headers(request.headers);
  headers.delete(HEADER_HOST_PANEL);
  // Un redirect que no se hizo (ver arriba) sólo sale del subdominio del panel.
  const esHostPanel = decision.tipo === "seguir" ? decision.esHostPanel : true;
  if (esHostPanel) headers.set(HEADER_HOST_PANEL, "1");

  if (!esRutaPanel(pathname)) {
    return NextResponse.next({ request: { headers } });
  }

  return conCspDelPanel(headers);
}

function conCspDelPanel(headers: Headers) {
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
 * Todo menos los estáticos: para separar la tienda del panel por host, el
 * proxy tiene que ver también las rutas de la tienda. No consulta la base ni
 * hace I/O, así que correr en cada request cuesta microsegundos.
 *
 * El matcher tiene que ser literal: Next lo lee en tiempo de build para armar
 * el ruteo, así que no acepta una variable.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
