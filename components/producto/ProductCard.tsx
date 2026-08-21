import Link from "next/link";
import { Precio } from "@/components/producto/Precio";
import { ProductoSimbolo } from "@/components/producto/ProductoSimbolo";
import { SelectorTamanoCard } from "@/components/producto/SelectorTamanoCard";
import { formatLista } from "@/lib/format";
import {
  esJugo,
  esPack,
  precioTotal,
  varianteDefault,
  type Producto,
  type Variante,
} from "@/types/producto";

interface ProductCardProps {
  producto: Producto;
  /**
   * En la landing el carrusel es una vidriera: nombre, qué lleva y "Comprar".
   * El precio y el selector de tamaño son decisión de compra, y esa
   * conversación pasa en /productos y en la ficha.
   */
  mostrarPrecio?: boolean;
}

/**
 * La más barata, para el "desde $X". Devuelve la variante entera y no solo el
 * número, porque el precio se muestra desglosado en contenido + envase.
 */
function varianteMasBarata(producto: Producto): Variante {
  return producto.variantes.reduce(
    (masBarata, v) => (precioTotal(v) < precioTotal(masBarata) ? v : masBarata),
    varianteDefault(producto),
  );
}

/** Los packs no tienen ingredientes propios: mezclan jugos que sí los tienen. */
function descripcionCorta(producto: Producto): string {
  return esPack(producto) ? producto.tagline : formatLista(producto.ingredientes);
}

export function ProductCard({
  producto,
  mostrarPrecio = true,
}: ProductCardProps) {
  return (
    <article
      className="group relative flex h-56 w-full overflow-hidden rounded-lg
                 border border-border bg-white transition-shadow
                 focus-within:ring-2 focus-within:ring-foreground
                 hover:shadow-lg"
    >
      {/* Mitad izquierda: el color real del producto, a alto completo.
          Va inline porque el token viene del dato — Tailwind no puede generar
          una clase a partir de un valor dinámico.

          TODO fotos: cuando existan los archivos de /public/productos/, el
          <ProductoSimbolo> se reemplaza por un <Image fill
          sizes="(max-width: 640px) 40vw, 155px"
          className="object-cover mix-blend-multiply" /> con producto.imagenes[0].
          El color de fondo queda igual, detrás. */}
      <div
        className="w-[45%] flex-none p-4"
        style={{ backgroundColor: `var(${producto.colorToken})` }}
      >
        <ProductoSimbolo producto={producto} />
      </div>

      {/* Mitad derecha: centrada verticalmente */}
      <div className="flex flex-1 flex-col justify-center gap-2 p-5">
        <h3 className="font-display text-lg leading-tight">{producto.nombre}</h3>

        {/* Sin precio sobra alto: la descripción respira una línea más. */}
        <p
          className={`text-sm leading-relaxed text-muted ${
            mostrarPrecio ? "line-clamp-2" : "line-clamp-3"
          }`}
        >
          {descripcionCorta(producto)}
        </p>

        {/* Solo los jugos eligen tamaño en la card: son los únicos con dos
            presentaciones del mismo contenido. El resto muestra su precio.
            (El pack armable también tiene 2 variantes, pero elegir 4 o 5
            botellas es una decisión de la ficha, no de la card.) */}
        {!mostrarPrecio ? null : esJugo(producto) &&
          producto.variantes.length > 1 ? (
          <SelectorTamanoCard
            variantes={producto.variantes}
            varianteDefaultId={producto.varianteDefaultId}
            nombreProducto={producto.nombre}
          />
        ) : (
          <Precio
            variante={varianteMasBarata(producto)}
            desde={producto.variantes.length > 1}
          />
        )}

        {/* Stretched link: el ::after cubre la card entera, así todo el bloque
            es clickable pero hay un solo elemento focusable. */}
        <Link
          href={`/productos/${producto.slug}`}
          className="mt-1 self-start text-sm font-medium underline
                     underline-offset-4 after:absolute after:inset-0
                     after:content-[''] focus:outline-none"
        >
          Comprar <span aria-hidden="true">&rarr;</span>
          <span className="sr-only"> {producto.nombre}</span>
        </Link>
      </div>
    </article>
  );
}
