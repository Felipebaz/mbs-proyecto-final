import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad (OWASP A05: configuración insegura).
 *
 * [decisión] CSP estática, sin nonce.
 *
 * La CSP con nonce es más fuerte, pero obliga a generar un nonce por request,
 * y eso fuerza render dinámico en TODA la app. Este sitio prerenderiza la
 * landing y las 8 fichas de producto en el build; pasarlas a dinámicas para
 * endurecer scripts que hoy no existen es un mal negocio.
 *
 * Lo que se pierde sin nonce: `script-src` necesita 'unsafe-inline' porque Next
 * inyecta scripts inline para la hidratación. O sea que una inyección de HTML
 * podría ejecutar un `<script>` inline.
 *
 * Lo que igual queda cubierto, y es la mayor parte del riesgo real:
 *   - no se puede cargar un script EXTERNO (que es como se entrega casi todo
 *     payload de XSS serio)
 *   - `object-src 'none'` mata los plugins
 *   - `base-uri 'self'` impide reescribir la base de las URLs relativas
 *   - `form-action 'self'` impide que un form inyectado postee credenciales
 *     a un servidor ajeno
 *   - `frame-ancestors 'none'` mata el clickjacking
 *
 * La defensa principal contra XSS sigue siendo React, que escapa todo por
 * defecto. La regla que lo sostiene: cero `dangerouslySetInnerHTML`.
 *
 * Cuando haya rutas dinámicas donde valga la pena (checkout con datos de pago),
 * se agrega CSP con nonce SÓLO para esas, vía `proxy.ts` con matcher.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  // Tailwind v4 inyecta estilos inline en dev; en prod son archivos.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  // next/font descarga las fuentes en el build y las sirve desde nuestro
  // dominio: no hace falta abrir fonts.gstatic.com.
  "font-src 'self'",
  // Sólo a nosotros mismos. Google OAuth es un redirect del navegador, no un
  // fetch nuestro desde el cliente, así que no necesita estar acá.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  /**
   * Prerender parcial (PPR), que en Next 16 viene con `cacheComponents`.
   *
   * Hace falta por el header: muestra el carrito y si estás logueado, y eso
   * lee cookies. Sin PPR, una sola lectura de cookies en el árbol vuelve
   * dinámica TODA la ruta — el catálogo entero dejaría de prerenderizarse por
   * mostrar un número al lado de "Carrito".
   *
   * Con esto, Next prerenderiza el shell estático de cada página y la parte
   * que depende de la sesión llega por streaming. Ver `SesionNav.tsx`.
   */
  cacheComponents: true,

  // Un stack trace en una respuesta le dibuja el mapa del servidor a cualquiera.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },

          // HSTS: una vez que el navegador la vio, no vuelve a intentar HTTP.
          // Cierra el downgrade en la primera visita de la próxima vez.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },

          // Sin esto, el navegador adivina el tipo de un archivo por su
          // contenido: un .txt subido por un usuario puede terminar ejecutándose
          // como JavaScript.
          { key: "X-Content-Type-Options", value: "nosniff" },

          // Redundante con frame-ancestors, para navegadores viejos.
          { key: "X-Frame-Options", value: "DENY" },

          // Que la URL completa no se filtre a terceros por el Referer. Importa
          // en /carrito y en las de cuenta.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          // No usamos nada de esto: apagarlo evita que un script inyectado sí.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
