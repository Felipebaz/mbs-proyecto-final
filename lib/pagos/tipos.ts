/**
 * Interfaz del proveedor de pagos.
 *
 * Existe para que el checkout no dependa de Mercado Pago. Cuando entre Handy,
 * es otra implementación de esto y el flujo de compra no se toca.
 */

export interface ItemPago {
  sku: string;
  descripcion: string;
  cantidad: number;
  /** Unitario en CENTÉSIMOS. La conversión a la unidad del proveedor vive
   *  dentro de cada implementación, nunca en el dominio. */
  precioUnitario: number;
}

export interface DatosPago {
  /** `external_reference`: viaja al proveedor y vuelve en la notificación. */
  referencia: string;
  items: readonly ItemPago[];
  /** En centésimos. Tiene que dar igual que la suma de los items. */
  total: number;
  moneda: string;
  /** Correo del comprador, para que el proveedor lo precargue. */
  email?: string;
  /** A dónde vuelve el cliente después de pagar. */
  urlRetorno: string;
  /** A dónde manda el proveedor las notificaciones servidor a servidor. */
  urlNotificacion: string;
}

export interface PagoCreado {
  /** A dónde redirigir al cliente para que pague. */
  urlPago: string;
  /** Id de la preferencia/intención en el proveedor. Para rastrear. */
  idExterno: string;
}

/**
 * Estados normalizados.
 *
 * Cada proveedor tiene su vocabulario; el dominio conoce sólo estos cinco.
 * Traducir es responsabilidad de la implementación.
 */
export type EstadoPago =
  | "aprobado"
  | "pendiente"
  | "rechazado"
  | "reembolsado"
  | "contracargo";

export interface EstadoConsultado {
  idPago: string;
  estado: EstadoPago;
  /** Estado crudo del proveedor. Se guarda para poder depurar. */
  estadoCrudo: string;
  detalle?: string;
  /** En centésimos, para comparar contra el total del pedido. */
  monto: number;
  moneda: string;
  /** El `external_reference` que mandamos al crear el pago. */
  referencia: string | null;
}

export type ResultadoWebhook =
  | { valido: true; idPago: string; tipo: string }
  | { valido: false; motivo: string };

export interface EntradaWebhook {
  /** Headers crudos del request. */
  headers: Headers;
  /** Query string del request. */
  query: URLSearchParams;
  /** Cuerpo ya parseado. */
  cuerpo: unknown;
}

export interface ProveedorPago {
  nombre: string;

  /** Crea la intención de pago y devuelve a dónde mandar al cliente. */
  crearPago(datos: DatosPago): Promise<PagoCreado>;

  /**
   * Verifica que la notificación venga de verdad del proveedor.
   *
   * No confía en el cuerpo: sólo dice si la firma es válida y qué id de pago
   * habría que ir a consultar.
   */
  verificarWebhook(entrada: EntradaWebhook): ResultadoWebhook;

  /**
   * Consulta el estado real contra la API del proveedor.
   *
   * Es el único lugar del que sale un estado de pago confiable: el cuerpo de la
   * notificación lo puede escribir cualquiera.
   */
  consultarEstado(idPago: string): Promise<EstadoConsultado>;
}
