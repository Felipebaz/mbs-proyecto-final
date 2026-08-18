/**
 * Modelo de dominio del catálogo.
 *
 * Regla central: el tamaño es una variante del producto, no un producto
 * aparte. Un shot es simplemente un producto con una sola variante, así que
 * jugos y shots comparten card, ficha, ruta y carrito.
 */

/** Agregar una categoría acá propaga el tipo a todo el catálogo. */
export const CATEGORIAS = ["jugos", "shots", "packs"] as const;
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
  /** Contenido, con IVA. Sin el envase. */
  precio: PrecioUYU;
  /** Botella de vidrio. Depende del envase físico, no del producto. */
  envase: PrecioUYU;
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
  /** Trago sugerido. Las dosis por botella se calculan, no se escriben. */
  dosisMl: number;
}

/**
 * Un pack no tiene receta propia: es un envoltorio sobre variantes que ya
 * existen. Por eso `contenido` en vez de `ingredientes`, y por eso el ahorro
 * se calcula contra el catálogo en vez de escribirse a mano.
 */
export interface Pack extends ProductoBase {
  categoria: "packs";
  /** Días que cubre, a una botella por día. */
  dias: number;
  /** Qué trae adentro, por SKU de variante. */
  contenido: readonly LineaPack[];
}

export interface LineaPack {
  sku: Variante["sku"];
  cantidad: number;
}

export type Producto = Jugo | Shot | Pack;

export const esJugo = (p: Producto): p is Jugo => p.categoria === "jugos";
export const esShot = (p: Producto): p is Shot => p.categoria === "shots";
export const esPack = (p: Producto): p is Pack => p.categoria === "packs";

/** Botellas que trae el pack. Suma las cantidades, no las líneas. */
export function botellasPorPack(pack: Pack): number {
  return pack.contenido.reduce((total, l) => total + l.cantidad, 0);
}

export function varianteDefault(p: Producto): Variante {
  return (
    p.variantes.find((v) => v.id === p.varianteDefaultId) ?? p.variantes[0]
  );
}

/** Lo que efectivamente se cobra: contenido + envase. */
export function precioTotal(v: Variante): PrecioUYU {
  return v.precio + v.envase;
}

/** "Rinde 6 dosis". Se recalcula solo si cambia la botella o el trago. */
export function dosisPorBotella(shot: Shot, v: Variante): number {
  return Math.floor(v.volumenMl / shot.dosisMl);
}

/** El argumento de venta: cuánto sale cada trago, envase incluido. */
export function precioPorDosis(shot: Shot, v: Variante): PrecioUYU {
  return Math.round(precioTotal(v) / dosisPorBotella(shot, v));
}

export function precioDesde(p: Producto): PrecioUYU {
  return Math.min(...p.variantes.map(precioTotal));
}
