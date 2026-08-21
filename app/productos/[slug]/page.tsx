import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Precio } from "@/components/producto/Precio";
import { ProductoSimbolo } from "@/components/producto/ProductoSimbolo";
import { SelectorTamano } from "@/components/producto/SelectorTamano";
import { CATEGORIAS_DATA } from "@/lib/catalogo/categorias";
import { opcionesPack } from "@/lib/catalogo/pack-armable";
import {
  ahorroPack,
  getContenidoPack,
  getProductoBySlug,
  getSlugs,
  precioSueltoPack,
} from "@/lib/catalogo/queries";
import { formatPrecio, formatVolumen } from "@/lib/format";
import {
  dosisPorBotella,
  esJugo,
  esPackArmable,
  esPackFijo,
  esShot,
  precioPorDosis,
  precioTotal,
  varianteDefault,
  type PackArmable,
  type PackFijo,
  type Producto,
  type Shot,
} from "@/types/producto";

/**
 * Ficha de producto. Una sola ruta para jugos, shots y packs: el tipo
 * discriminado decide qué bloques se muestran. Cuando entre una categoría
 * nueva, la ruta ya funciona.
 */

/** Prerenderiza las 8 fichas en el build. Ninguna se arma en el request. */
export async function generateStaticParams() {
  return (await getSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/productos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const producto = await getProductoBySlug(slug);
  if (!producto) return { title: "Producto no encontrado" };

  return {
    title: producto.seo?.titulo ?? producto.nombre,
    description: producto.seo?.descripcion ?? producto.tagline,
  };
}

/* ---------------------------------------------------------------- bloques */

function Lista({ titulo, items }: { titulo: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="font-display text-sm uppercase tracking-wide text-muted">
        {titulo}
      </h2>
      <ul className="mt-3 space-y-1.5 text-sm leading-relaxed">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="text-jugo-verde">
              &bull;
            </span>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Cuánto rinde el shot: la dosis se calcula, nunca se escribe a mano. */
function BloqueDosis({ shot }: { shot: Shot }) {
  const variante = varianteDefault(shot);
  const dosis = dosisPorBotella(shot, variante);

  return (
    <section className="mt-10 rounded-lg border border-border p-5">
      <h2 className="font-display text-sm uppercase tracking-wide text-muted">
        Cuánto rinde
      </h2>
      <p className="mt-3 leading-relaxed">
        Un trago de {shot.dosisMl} ml por día. La botella de{" "}
        {formatVolumen(variante.volumenMl)} rinde{" "}
        <strong>{dosis} dosis</strong>, a{" "}
        {formatPrecio(precioPorDosis(shot, variante))} cada una.
      </p>
    </section>
  );
}

/** Qué trae el pack y cuánto se ahorra contra comprarlo botella por botella. */
async function BloqueContenidoPack({ pack }: { pack: PackFijo }) {
  const [contenido, suelto, ahorro] = await Promise.all([
    getContenidoPack(pack),
    precioSueltoPack(pack),
    ahorroPack(pack),
  ]);

  return (
    <section className="mt-10 rounded-lg border border-border p-5">
      <h2 className="font-display text-sm uppercase tracking-wide text-muted">
        Qué trae
      </h2>
      <ul className="mt-3 space-y-1.5 text-sm">
        {contenido.map((linea) => (
          <li key={linea.variante.sku} className="flex justify-between gap-4">
            <span>
              {linea.cantidad} × {linea.producto.nombre}{" "}
              <span className="text-muted">{linea.variante.nombre}</span>
            </span>
            <span className="text-muted">
              {formatPrecio(precioTotal(linea.variante) * linea.cantidad)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-border pt-3 text-sm">
        Comprado suelto: <s className="text-muted">{formatPrecio(suelto)}</s>{" "}
        <span className="font-medium text-jugo-verde">
          Ahorrás {formatPrecio(ahorro)}
        </span>
      </p>
    </section>
  );
}

/** Los jugos entre los que se puede elegir. Armarlo pasa en el carrito. */
function BloqueArmable({ pack }: { pack: PackArmable }) {
  // opcionesPack resuelve cada SKU elegible a su producto real: si mañana se
  // agrega un jugo a skusElegibles, aparece acá sin tocar este archivo.
  const opciones = opcionesPack(pack);
  const cantidades = pack.variantes.map((v) => v.botellas).join(" o ");

  return (
    <section className="mt-10 rounded-lg border border-border p-5">
      <h2 className="font-display text-sm uppercase tracking-wide text-muted">
        Cómo se arma
      </h2>
      <p className="mt-3 text-sm leading-relaxed">
        Elegís {cantidades} botellas entre estos jugos, en la combinación que
        quieras. Mismo precio que los packs ya armados.
      </p>

      <ul className="mt-4 flex flex-wrap gap-2">
        {opciones.map((opcion) => (
          <li
            key={opcion.variante.sku}
            className="rounded-full border border-border px-3 py-1 text-sm"
          >
            {opcion.nombreProducto}{" "}
            <span className="text-muted">{opcion.variante.nombre}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm text-muted">
        La selección se hace al agregarlo al carrito.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ ficha */

export default async function ProductoPage({
  params,
}: PageProps<"/productos/[slug]">) {
  const { slug } = await params;
  const producto: Producto | null = await getProductoBySlug(slug);
  if (!producto) notFound();

  const categoria = CATEGORIAS_DATA[producto.categoria];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
      <nav aria-label="Miga de pan" className="text-sm text-muted">
        <Link href="/productos" className="underline-offset-4 hover:underline">
          Productos
        </Link>
        <span aria-hidden="true"> / </span>
        <Link
          href={`/productos?categoria=${producto.categoria}`}
          className="underline-offset-4 hover:underline"
        >
          {categoria.nombre}
        </Link>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        {/* TODO fotos: acá va la galería. El símbolo ocupa el lugar exacto. */}
        <div
          className="aspect-square rounded-lg p-12"
          style={{ backgroundColor: `var(${producto.colorToken})` }}
        >
          <ProductoSimbolo producto={producto} />
        </div>

        <div>
          <h1 className="font-display text-3xl sm:text-4xl">
            {producto.nombre}
          </h1>
          <p className="mt-2 text-lg text-muted">{producto.tagline}</p>

          <div className="mt-6">
            {producto.variantes.length > 1 ? (
              <SelectorTamano
                variantes={producto.variantes}
                varianteDefaultId={producto.varianteDefaultId}
                nombreProducto={producto.nombre}
                tamano="lg"
              />
            ) : (
              <Precio variante={varianteDefault(producto)} tamano="lg" />
            )}
          </div>

          {/* TODO carrito: este botón queda inerte hasta que exista el
              carrito. No se saca porque define el layout de la ficha. */}
          <button
            type="button"
            disabled
            className="mt-6 w-full rounded-full bg-foreground px-6 py-3
                       text-sm font-medium text-background disabled:opacity-40
                       sm:w-auto"
          >
            Agregar al carrito
          </button>

          <p className="mt-8 leading-relaxed">{producto.descripcion}</p>
        </div>
      </div>

      {/* Bloques por tipo. TypeScript sabe qué campos existen en cada rama. */}
      {esJugo(producto) || esShot(producto) ? (
        <div className="grid gap-x-10 sm:grid-cols-2">
          <Lista titulo="Ingredientes" items={producto.ingredientes} />
          <Lista titulo="Por qué" items={producto.beneficios} />
        </div>
      ) : null}

      {esShot(producto) ? <BloqueDosis shot={producto} /> : null}
      {esPackFijo(producto) ? <BloqueContenidoPack pack={producto} /> : null}
      {esPackArmable(producto) ? <BloqueArmable pack={producto} /> : null}
    </main>
  );
}
