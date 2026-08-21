import type { PrecioUYU } from "@/types/producto";

/**
 * Envases: se cobran solo si el cliente no trae botellas para cambiar.
 *
 * Regla del negocio: el cambio es UNO A UNO. Cada botella que el cliente
 * devuelve cancela el envase de una botella que se lleva. El envase se cobra
 * entonces la primera vez y nunca más, mientras siga devolviendo.
 *
 * [decisión] Cuando las botellas devueltas no alcanzan para todas, se perdonan
 * los envases MÁS CAROS primero. El cliente que devuelve una sola botella
 * teniendo un 910 ($30) y un 330 ($20) ahorra $30, no $20.
 *
 * Es a favor del cliente y no del negocio, a propósito: la diferencia son
 * $10 y la alternativa es explicarle por qué le perdonamos el envase barato.
 * Para cambiarlo a "por tamaño", el cambio es el sort de abajo.
 *
 * NO hay devolución de plata: devolver más botellas de las que se compran no
 * genera saldo a favor. El sobrante se ignora y se informa aparte.
 */

export interface LineaConEnvase {
  sku: string;
  /** Precio del envase de UNA botella de esta línea. */
  envase: PrecioUYU;
  cantidad: number;
}

export interface ResultadoEnvases {
  /** Botellas que se llevan. */
  botellas: number;
  /** Cuántas de las devueltas se pudieron aplicar. */
  devueltasAplicadas: number;
  /** Devueltas que sobraron: no dan plata ni crédito. */
  devueltasSobrantes: number;
  /** Lo que se cobra de envase después de aplicar las devoluciones. */
  totalEnvase: PrecioUYU;
  /** Lo que se cobraría sin devolver nada. Para mostrar el "antes". */
  totalSinDevolver: PrecioUYU;
  /** La diferencia entre los dos: el argumento para traer las botellas. */
  ahorro: PrecioUYU;
}

/**
 * @param devueltas Cuántas botellas trae el cliente. Viene de un input, así
 * que puede llegar negativa, decimal o `NaN`: se sanea acá y no en la UI.
 */
export function calcularEnvases(
  lineas: readonly LineaConEnvase[],
  devueltas: number,
): ResultadoEnvases {
  // Una entrada por botella física: es lo que se perdona de a una.
  const envases: PrecioUYU[] = [];
  for (const linea of lineas) {
    const cantidad = Math.max(0, Math.floor(linea.cantidad));
    for (let i = 0; i < cantidad; i++) envases.push(linea.envase);
  }

  // Más caro primero: así se perdonan esos.
  envases.sort((a, b) => b - a);

  const totalSinDevolver = envases.reduce((total, e) => total + e, 0);

  const pedidas = Number.isFinite(devueltas)
    ? Math.max(0, Math.floor(devueltas))
    : 0;
  const aplicadas = Math.min(pedidas, envases.length);

  const totalEnvase = envases
    .slice(aplicadas)
    .reduce((total, e) => total + e, 0);

  return {
    botellas: envases.length,
    devueltasAplicadas: aplicadas,
    devueltasSobrantes: pedidas - aplicadas,
    totalEnvase,
    totalSinDevolver,
    ahorro: totalSinDevolver - totalEnvase,
  };
}
