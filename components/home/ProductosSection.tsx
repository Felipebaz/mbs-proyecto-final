import Link from "next/link";
import { ProductCard } from "@/components/producto/ProductCard";
import { getProductosDestacados } from "@/lib/catalogo/queries";

/**
 * El carrusel no lleva JavaScript: overflow-x + scroll-snap resuelven dedo,
 * trackpad, rueda y teclado. Toda la sección queda en el servidor.
 */
export async function ProductosSection() {
  const productos = await getProductosDestacados();

  if (productos.length === 0) return null;

  return (
    <section
      id="productos"
      aria-labelledby="productos-titulo"
      className="panel reveal overflow-hidden"
    >
      <div className="mx-auto mb-6 flex w-full max-w-6xl items-baseline justify-between gap-4 px-5 sm:px-8 lg:max-w-[75%]">
        <h2 id="productos-titulo" className="font-display text-3xl sm:text-4xl">
          Productos
        </h2>
        <Link
          href="/productos"
          className="text-sm underline underline-offset-4 hover:no-underline"
        >
          Ver todos <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>

      {/* tabIndex + role=group: hace el carrusel scrolleable con las flechas
          del teclado. Sin esto solo se navega tabulando card por card. */}
      <div
        role="group"
        aria-labelledby="productos-titulo"
        tabIndex={0}
        className="mx-auto flex w-full max-w-6xl snap-x snap-mandatory gap-4
                   overflow-x-auto px-5 pb-4 focus:outline-none
                   focus-visible:ring-2 focus-visible:ring-foreground sm:px-8
                   lg:max-w-[75%] [scrollbar-width:thin]"
      >
        {/* El ancho y el snap viven acá, no en la card: la misma card se usa
            en la grilla de /productos, donde el ancho lo pone la grilla.
            El carrusel se acota al 75% en desktop — el ancho está en el
            contenedor y en la fila del título, para que arranquen alineados. */}
        {productos.map((producto) => (
          <div
            key={producto.slug}
            className="w-[85vw] max-w-[340px] flex-none snap-start sm:w-[340px]"
          >
            <ProductCard producto={producto} mostrarPrecio={false} />
          </div>
        ))}
      </div>
    </section>
  );
}
