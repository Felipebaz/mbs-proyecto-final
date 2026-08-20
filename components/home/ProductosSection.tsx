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
      className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8"
    >
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 id="productos-titulo" className="font-display text-2xl sm:text-3xl">
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
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4
                   focus:outline-none focus-visible:ring-2
                   focus-visible:ring-foreground [scrollbar-width:thin]"
      >
        {productos.map((producto) => (
          <ProductCard key={producto.slug} producto={producto} />
        ))}
      </div>
    </section>
  );
}
