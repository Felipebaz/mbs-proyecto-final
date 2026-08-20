import Link from "next/link";

/**
 * Footer del sitio.
 *
 * Los contactos son constantes vacías a propósito: mientras no haya número ni
 * cuenta reales, se muestra el texto sin link. Un link a un WhatsApp
 * inexistente es peor que no tener link.
 */
const WHATSAPP = ""; // TODO: "https://wa.me/598XXXXXXXX"
const INSTAGRAM = ""; // TODO: "https://instagram.com/..."

const ANIO = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="mt-8 border-t border-border">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 sm:grid-cols-3 sm:px-8">
        <div>
          <h2 className="font-display text-sm uppercase tracking-wide text-muted">
            Navegación
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/productos" className="underline-offset-4 hover:underline">
                Productos
              </Link>
            </li>
            <li>
              <Link href="/#sobre-nosotros" className="underline-offset-4 hover:underline">
                Sobre nosotros
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-display text-sm uppercase tracking-wide text-muted">
            Redes
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              {INSTAGRAM ? (
                <a href={INSTAGRAM} className="underline-offset-4 hover:underline">
                  Instagram
                </a>
              ) : (
                <span className="text-muted">Instagram</span>
              )}
            </li>
            <li>
              {WHATSAPP ? (
                <a href={WHATSAPP} className="underline-offset-4 hover:underline">
                  WhatsApp
                </a>
              ) : (
                <span className="text-muted">WhatsApp</span>
              )}
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-display text-sm uppercase tracking-wide text-muted">
            Entrega
          </h2>
          {/* TODO zonas: falta definir barrios, días de reparto y mínimo de
              compra. Sale del mismo dato que va a usar el carrito. */}
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Montevideo. Entregamos en el día, en vidrio retornable.
          </p>
        </div>
      </div>

      <div className="border-t border-border">
        <p className="mx-auto w-full max-w-6xl px-5 py-6 text-xs text-muted sm:px-8">
          © {ANIO} Anima. Jugos orgánicos prensados en frío.
        </p>
      </div>
    </footer>
  );
}
