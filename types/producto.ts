/**
 * Modelo de dominio del catálogo.
 *
 * Regla central: el tamaño es una variante del producto, no un producto
 * aparte. Un shot es simplemente un producto con una sola variante, así que
 * jugos y shots comparten card, ficha, ruta y carrito.
 */

/** Agregar una categoría acá propaga el tipo a todo el catálogo. */
export const CATEGORIAS = ["jugos", "shots"] as const;
export type CategoriaId = (typeof CATEGORIAS)[number];

export interface Categoria {
  id: CategoriaId;
  nombre: string;
  /** Copy del header de catálogo cuando el filtro está activo. */
  descripcion: string;
  orden: number;
  /** false = no se muestra en el filtro ni en el sitemap. */
  activa: boolean;
}

/** Centésimos de peso uruguayo. Entero: nada de floats con plata. */
export type PrecioUYU = number;

/**
 * Presentación comprable. Es la unidad real de compra: lo que va al carrito
 * es siempre una variante, nunca un producto "pelado".
 */
export interface Variante {
  id: string;
  /** Etiqueta del selector de tamaño: "330 ml". */
  nombre: string;
  volumenMl: number;
  precio: PrecioUYU;
  sku: string;
  disponible: boolean;
}

export interface ImagenProducto {
  src: string;
  alt: string;
  width: number;
  height: number;
}

/** Campos comunes a toda línea de producto, presente y futura. */
interface ProductoBase {
  /** Identificador canónico y segmento de URL. */
  slug: string;
  nombre: string;
  /** Una línea, para la card del carrusel. */
  tagline: string;
  /** Párrafo de la ficha. */
  descripcion: string;
  /** Color real del producto, como token CSS. Ver globals.css. */
  colorToken: string;
  imagenes: ImagenProducto[];
  /** Siempre ≥1: el compilador impide un producto que no se pueda comprar. */
  variantes: readonly [Variante, ...Variante[]];
  varianteDefaultId: Variante["id"];
  /** Aparece en el carrusel de la landing. */
  destacado: boolean;
  seo?: { titulo?: string; descripcion?: string };
}

export interface Jugo extends ProductoBase {
  categoria: "jugos";
  ingredientes: string[];
  beneficios: string[];
}

export interface Shot extends ProductoBase {
  categoria: "shots";
  ingredientes: string[];
  beneficios: string[];
  dosisSugerida: string;
}

export type Producto = Jugo | Shot;

export const esJugo = (p: Producto): p is Jugo => p.categoria === "jugos";
export const esShot = (p: Producto): p is Shot => p.categoria === "shots";

export function varianteDefault(p: Producto): Variante {
  return (
    p.variantes.find((v) => v.id === p.varianteDefaultId) ?? p.variantes[0]
  );
}

export function precioDesde(p: Producto): PrecioUYU {
  return Math.min(...p.variantes.map((v) => v.precio));
}
