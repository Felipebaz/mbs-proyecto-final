import { formatPrecio } from "@/lib/format";
import { type Variante } from "@/types/producto";

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
 * Arriba va el precio del jugo. Abajo, el envase.
 *
 * [decisión] El envase NO se suma al número grande porque no es un precio
 * recurrente: se paga la primera vez y después se cancela devolviendo la
 * botella, uno a uno. El cliente que vuelve paga exactamente el número de
 * arriba. La cuenta la hace lib/carrito/envases.ts.
 *
 * [decisión] "envase retornable" y no "envase" a secas: la palabra sola dice
 * que se recupera, que es un pilar de la marca. El monto va explícito para
 * que el total de la primera compra no sorprenda en la puerta.
 *
 * La contra asumida: en la primera compra el total del carrito va a ser mayor
 * que la suma de los números grandes. Por eso el carrito TIENE que mostrar el
 * envase como línea aparte y visible — si aparece recién en la puerta, la
 * decisión de acá arriba se convierte en una sorpresa desagradable.
 */
export function Precio({ variante, desde = false, tamano = "sm" }: PrecioProps) {
  return (
    <div>
      <p className={tamano === "lg" ? "text-2xl font-medium" : "text-sm font-medium"}>
        {desde ? <span className="font-normal text-muted">desde </span> : null}
        {formatPrecio(variante.precio)}
      </p>
      <p className="text-xs text-muted">
        + {formatPrecio(variante.envase)} de envase retornable
      </p>
    </div>
  );
}
