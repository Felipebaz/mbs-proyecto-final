import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryFilter } from "@/components/producto/CategoryFilter";
import { ProductCard } from "@/components/producto/ProductCard";
import {
  esCategoriaValida,
  getCategorias,
  getProductos,
} from "@/lib/catalogo/queries";
import type { Producto } from "@/types/producto";

export const metadata: Metadata = {
  title: "Productos",
  description:
    "Jugos prensados en frío, shots y packs semanales. Todo orgánico, en vidrio retornable, con entrega en Montevideo.",
};

function Grilla({ productos }: { productos: readonly Producto[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {productos.map((producto) => (
        <li key={producto.slug}>
          <ProductCard producto={producto} />
        </li>
      ))}
    </ul>
  );
}

export default async function ProductosPage({
  searchParams,
}: PageProps<"/productos">) {
  // En esta versión de Next, searchParams es una Promise: hay que esperarla.
  const { categoria } = await searchParams;

  // Un ?categoria= inventado da 404 y no una página vacía: si devolviera 200
  // con cero productos, Google la indexaría como página buena.
  if (typeof categoria === "string" && !esCategoriaValida(categoria)) {
    notFound();
  }

  const filtro = typeof categoria === "string" ? categoria : null;
  const [productos, categorias] = await Promise.all([
    getProductos(),
    getCategorias(),
  ]);

  const activa = filtro && esCategoriaValida(filtro) ? filtro : null;
  const categoriaActiva = activa
    ? categorias.find((c) => c.id === activa)
    : null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl sm:text-4xl">
        {categoriaActiva ? categoriaActiva.nombre : "Productos"}
      </h1>

      <p className="mt-3 max-w-2xl leading-relaxed text-muted">
        {categoriaActiva
          ? categoriaActiva.descripcion
          : "Prensados en frío el mismo día, sin pasteurizar y sin azúcar agregada. En vidrio retornable."}
      </p>

      <CategoryFilter categorias={categorias} activa={activa} />

      {/* Sin filtro se muestran todas las categorías, cada una con su título.
          Con filtro, una sola grilla: el título ya lo dice el <h1>. */}
      {activa ? (
        <div className="mt-10">
          <Grilla productos={productos.filter((p) => p.categoria === activa)} />
        </div>
      ) : (
        categorias.map((c) => {
          const deLaCategoria = productos.filter((p) => p.categoria === c.id);
          if (deLaCategoria.length === 0) return null;

          return (
            <section key={c.id} aria-labelledby={`cat-${c.id}`} className="mt-12">
              <h2 id={`cat-${c.id}`} className="font-display text-2xl">
                {c.nombre}
              </h2>
              <p className="mt-1 mb-5 text-sm text-muted">{c.descripcion}</p>
              <Grilla productos={deLaCategoria} />
            </section>
          );
        })
      )}
    </main>
  );
}
