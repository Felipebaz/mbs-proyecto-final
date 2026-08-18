import { CATEGORIAS_DATA } from "./categorias";
import { PRODUCTOS } from "./productos";
import type {
  Categoria,
  CategoriaId,
  Producto,
  Variante,
} from "@/types/producto";
import { CATEGORIAS } from "@/types/producto";

/**
 * Única puerta de entrada al catálogo. Los componentes nunca importan
 * productos.ts directo.
 *
 * Son async aunque hoy resuelvan en memoria: cuando el catálogo se mude a un
 * CMS o a una base, la firma no cambia y no hay que tocar ningún componente.
 */

export async function getProductos(): Promise<Producto[]> {
  return [...PRODUCTOS];
}

export async function getProductoBySlug(
  slug: string,
): Promise<Producto | null> {
  return PRODUCTOS.find((p) => p.slug === slug) ?? null;
}

export async function getProductosPorCategoria(
  categoria: CategoriaId,
): Promise<Producto[]> {
  return PRODUCTOS.filter((p) => p.categoria === categoria);
}

/** Los del carrusel de la landing. */
export async function getProductosDestacados(): Promise<Producto[]> {
  return PRODUCTOS.filter((p) => p.destacado);
}

/** Para generateStaticParams: prerenderiza toda ficha de producto. */
export async function getSlugs(): Promise<string[]> {
  return PRODUCTOS.map((p) => p.slug);
}

/** Solo las categorías activas, ordenadas. Alimenta el filtro del catálogo. */
export async function getCategorias(): Promise<Categoria[]> {
  return CATEGORIAS.map((id) => CATEGORIAS_DATA[id])
    .filter((c) => c.activa)
    .sort((a, b) => a.orden - b.orden);
}

/** Valida un ?categoria= de la URL antes de usarlo como filtro. */
export function esCategoriaValida(valor: string): valor is CategoriaId {
  return (CATEGORIAS as readonly string[]).includes(valor);
}

export async function getVariante(
  slug: string,
  varianteId: string,
): Promise<{ producto: Producto; variante: Variante } | null> {
  const producto = await getProductoBySlug(slug);
  if (!producto) return null;

  const variante = producto.variantes.find((v) => v.id === varianteId);
  if (!variante) return null;

  return { producto, variante };
}
