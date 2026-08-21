import { formatPrecio } from "@/lib/format";
import { precioTotal, type Variante } from "@/types/producto";

interface PrecioProps {
  variante: Variante;
  /** Antepone "desde" cuando el producto tiene más de un tamaño. */
  desde?: boolean;
  /** Tamaño del total. La ficha lo va a querer más grande que la card. */
  tamano?: "sm" | "lg";
}

/**
 * Precio con el envase desglosado.
 *
 * Arriba va lo que se paga (contenido + envase) porque es el número con el que
 * el cliente decide. Abajo, en chico, de dónde sale. Mostrar solo $250 y
 * cobrar $270 en la puerta es la forma más barata de perder un cliente.
 *
 * "solo la primera vez": el envase se cancela devolviendo la botella, uno a
 * uno. La cuenta la hace lib/carrito/envases.ts; acá solo se anticipa, porque
 * en la card todavía no se sabe cuántas botellas trae el cliente.
 */
export function Precio({ variante, desde = false, tamano = "sm" }: PrecioProps) {
  return (
    <div>
      <p className={tamano === "lg" ? "text-2xl font-medium" : "text-sm font-medium"}>
        {desde ? <span className="font-normal text-muted">desde </span> : null}
        {formatPrecio(precioTotal(variante))}
      </p>
      <p className="text-xs text-muted">
        {formatPrecio(variante.precio)} + {formatPrecio(variante.envase)} de
        envase, solo la primera vez
      </p>
    </div>
  );
}
