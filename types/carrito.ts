import type { PrecioUYU, Producto, Variante } from "./producto";

/**
 * Lo que se persiste en localStorage: identificadores, nunca objetos.
 * Nombre y precio se releen del catálogo al hidratar, así un carrito viejo
 * no le cobra a nadie el precio del mes pasado.
 */
export interface LineaCarrito {
  productoSlug: Producto["slug"];
  varianteId: Variante["id"];
  cantidad: number;
}

/** Lo que ve la UI: la línea ya resuelta contra el catálogo. */
export interface LineaResuelta extends LineaCarrito {
  producto: Producto;
  variante: Variante;
  subtotal: PrecioUYU;
}

export interface ZonaEntrega {
  id: string;
  nombre: string;
  costoEnvio: PrecioUYU;
  /** Debajo de este subtotal no se puede confirmar el pedido. */
  minimoCompra: PrecioUYU;
  /** Días en que se reparte: ["martes", "viernes"]. */
  diasEntrega: string[];
}

export interface EstadoCarrito {
  lineas: LineaCarrito[];
  zonaId: ZonaEntrega["id"] | null;
}

export interface TotalesCarrito {
  subtotal: PrecioUYU;
  envio: PrecioUYU;
  total: PrecioUYU;
  /** Cuánto falta para llegar al mínimo de la zona. 0 si ya se alcanzó. */
  faltaParaMinimo: PrecioUYU;
  cantidadItems: number;
}
