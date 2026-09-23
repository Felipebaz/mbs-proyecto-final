import Link from "next/link";
import { salir } from "@/app/acciones/auth";
import { usuarioActual } from "@/lib/auth/dal";
import { obtenerCarrito } from "@/lib/carrito/repositorio";

/**
 * La parte del header que depende de quién sos.
 *
 * Está separada del Header a propósito: lee cookies, y cualquier lectura de
 * cookies en el árbol de render vuelve dinámica a toda la ruta. Aislada acá y
 * envuelta en <Suspense>, el resto de la página se sigue prerenderizando y esto
 * llega por streaming. El catálogo no paga el costo de tener sesión.
 */
export async function SesionNav() {
  const [usuario, carrito] = await Promise.all([
    usuarioActual(),
    obtenerCarrito(),
  ]);

  return (
    <>
      <li>
        <Link href="/carrito" className="underline-offset-4 hover:underline">
          Carrito
          {carrito.unidades > 0 && (
            <span className="ml-1.5 rounded-full bg-foreground px-1.5 py-0.5 text-xs text-background tabular-nums">
              {carrito.unidades}
            </span>
          )}
        </Link>
      </li>

      {usuario ? (
        <li>
          {/* Logout es un POST, no un link: un GET que muta estado lo dispara
              cualquier <img src> de otra página. */}
          <form action={salir}>
            <button type="submit" className="underline-offset-4 hover:underline">
              Salir
            </button>
          </form>
        </li>
      ) : (
        <li>
          <Link href="/login" className="underline-offset-4 hover:underline">
            Entrar
          </Link>
        </li>
      )}
    </>
  );
}

/** Lo que se ve mientras la sesión viaja. Mismo ancho, para que no salte. */
export function SesionNavFallback() {
  return (
    <li aria-hidden="true" className="text-muted">
      Carrito
    </li>
  );
}
