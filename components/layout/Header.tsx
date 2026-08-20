import Link from "next/link";

/**
 * Header del sitio. Vive en layout.tsx, así que aparece en todas las rutas.
 *
 * Sin menú hamburguesa: son dos links. Un hamburguesa para esto es un
 * componente cliente, estado y accesibilidad a mano, para esconder 2 links
 * que entran de sobra en 375px.
 */
export function Header() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
        <Link
          href="/"
          className="font-display text-xl tracking-tight"
          aria-label="Anima — ir al inicio"
        >
          Anima
        </Link>

        <nav aria-label="Principal">
          <ul className="flex items-center gap-6 text-sm">
            <li>
              <Link
                href="/productos"
                className="underline-offset-4 hover:underline"
              >
                Productos
              </Link>
            </li>
            <li>
              <Link
                href="/#sobre-nosotros"
                className="underline-offset-4 hover:underline"
              >
                Sobre nosotros
              </Link>
            </li>
            {/* TODO carrito: acá va <CartIndicator />, el primer componente
                cliente del proyecto. Necesita el Context del carrito. */}
          </ul>
        </nav>
      </div>
    </header>
  );
}
