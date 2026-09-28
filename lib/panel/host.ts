/**
 * Qué hacer con un request según a qué host llegó.
 *
 * El panel vive en su propio subdominio (`ADMIN_HOST`, p. ej.
 * `admin.jugosanima.com.uy`) y la tienda en el dominio principal.
 *
 * [decisión] Por qué un subdominio aparte.
 *
 * La cookie de sesión no lleva `domain` (y en producción tiene prefijo
 * `__Host-`), así que es de un solo host. Con el panel en su subdominio, la
 * sesión de admin nunca viaja a la tienda ni al revés: un XSS en una ficha de
 * producto no ve la sesión que puede exportar los datos de todos los clientes.
 *
 * [decisión] Las rutas del panel siguen siendo `/admin/...` también en el
 * subdominio. Sacarles el prefijo (admin.x/pedidos) obliga a reescribir en el
 * proxy, a tocar cada link y cada redirect del panel, y a mantener dos mapas de
 * URLs. El beneficio sería cosmético.
 *
 * [límite] Esto ordena el tráfico; NO es la barrera de autorización. Eso sigue
 * siendo `requerirAdmin()` en cada página, action y route handler.
 *
 * Sin `ADMIN_HOST` (por ejemplo en desarrollo) no se separa nada: el panel
 * funciona en `/admin` de cualquier host, como antes.
 *
 * Es una función pura, sin Next ni `process.env`, para poder testearla.
 */

export type DecisionHost =
  | { tipo: "seguir"; esHostPanel: boolean }
  | { tipo: "no-encontrado" }
  | { tipo: "redirigir"; url: string };

/** Rutas que son del panel y sólo existen en el subdominio. */
export function esRutaPanel(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  );
}

/**
 * Páginas de la tienda. En el subdominio del panel mandan al dominio
 * principal: ahí es donde tienen sentido y donde está la sesión del cliente.
 *
 * Lo que no está acá (login, recuperar, reset, verificar, /api/auth, los
 * estáticos) funciona en los dos hosts: el admin tiene que poder entrar y
 * recuperar su contraseña desde el subdominio.
 */
const RUTAS_TIENDA = ["/productos", "/carrito", "/checkout", "/pedido", "/registro"];

function esRutaTienda(pathname: string): boolean {
  return RUTAS_TIENDA.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/** `admin.x.com:3000` → `admin.x.com`, en minúsculas. */
function soloHostname(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

export function decidirPorHost(opciones: {
  /** Hostname del request, con o sin puerto. */
  host: string;
  pathname: string;
  search?: string;
  /** Hostname del panel. Vacío o ausente: no se separa nada. */
  hostPanel?: string;
  /** URL pública de la tienda, sin barra final (APP_URL). */
  urlTienda: string;
}): DecisionHost {
  const { pathname, search = "", urlTienda } = opciones;

  if (!opciones.hostPanel) return { tipo: "seguir", esHostPanel: false };

  const enPanel = soloHostname(opciones.host) === soloHostname(opciones.hostPanel);

  if (!enPanel) {
    /*
     * 404 y no redirect al subdominio: un redirect le confirma a cualquiera
     * que hay un panel y dónde está. El que lo usa ya sabe la dirección.
     */
    return esRutaPanel(pathname) ? { tipo: "no-encontrado" } : { tipo: "seguir", esHostPanel: false };
  }

  // La raíz del subdominio es el panel.
  if (pathname === "/") return { tipo: "redirigir", url: "/admin" };

  if (esRutaTienda(pathname)) {
    return { tipo: "redirigir", url: `${urlTienda.replace(/\/$/, "")}${pathname}${search}` };
  }

  return { tipo: "seguir", esHostPanel: true };
}

/** Header que el proxy agrega para que las páginas sepan en qué host están. */
export const HEADER_HOST_PANEL = "x-anima-panel";
