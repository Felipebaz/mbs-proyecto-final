import type { ProveedorPago } from "./tipos";

export type * from "./tipos";

/**
 * Punto único de acceso al proveedor de pagos.
 *
 * Nadie importa Mercado Pago directo: cuando entre Handy, se cambia acá y el
 * checkout no se toca.
 */

let proveedor: ProveedorPago | null = null;

/** Para tests: inyecta un proveedor falso. */
export function usarProveedorPago(p: ProveedorPago | null) {
  proveedor = p;
}

export async function obtenerProveedorPago(): Promise<ProveedorPago> {
  if (proveedor) return proveedor;

  // Import dinámico: el SDK no se carga si los tests inyectaron el falso.
  const { ProveedorMercadoPago } = await import("./mercadopago");
  proveedor = new ProveedorMercadoPago();
  return proveedor;
}
