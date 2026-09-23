"use client";

import { useActionState } from "react";
import { cambiarCantidad } from "@/app/acciones/carrito";
import { formatPrecio } from "@/lib/format";

/**
 * Una línea del carrito. Cliente por `useActionState`, para no recargar en cada
 * cambio de cantidad.
 *
 * El formulario manda SKU, huella y cantidad. El precio que se muestra lo
 * calculó el servidor y viaja de ida nomás: si el navegador lo editara, no
 * cambiaría nada, porque el servidor lo vuelve a calcular desde el catálogo.
 */

export interface LineaVista {
  sku: string;
  huella: string;
  nombre: string;
  variante: string;
  cantidad: number;
  subtotal: number;
  configuracion: readonly string[] | null;
}

export function LineaCarrito({ linea }: { linea: LineaVista }) {
  const [estado, ejecutar, pendiente] = useActionState(cambiarCantidad, undefined);

  return (
    <li className="flex flex-wrap items-center gap-4 border-b border-foreground/10 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{linea.nombre}</p>
        <p className="text-sm text-muted">{linea.variante}</p>
        {linea.configuracion?.length ? (
          <p className="mt-1 text-xs text-muted">
            Lleva: {linea.configuracion.join(", ")}
          </p>
        ) : null}
        {estado?.error && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {estado.error}
          </p>
        )}
      </div>

      <form action={ejecutar} className="flex items-center gap-2">
        <input type="hidden" name="sku" value={linea.sku} />
        <input type="hidden" name="huella" value={linea.huella} />

        <label htmlFor={`cant-${linea.sku}-${linea.huella}`} className="sr-only">
          Cantidad de {linea.nombre}
        </label>
        <input
          id={`cant-${linea.sku}-${linea.huella}`}
          name="cantidad"
          type="number"
          min={0}
          max={50}
          defaultValue={linea.cantidad}
          disabled={pendiente}
          className="w-16 rounded-lg border border-foreground/20 bg-transparent px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-full border border-foreground/20 px-3 py-1.5 text-xs transition-colors hover:bg-foreground/5 disabled:opacity-50"
        >
          Actualizar
        </button>
      </form>

      <p className="w-24 text-right tabular-nums">{formatPrecio(linea.subtotal)}</p>

      {/* Quitar es poner la cantidad en 0: una sola acción del lado servidor. */}
      <form action={ejecutar}>
        <input type="hidden" name="sku" value={linea.sku} />
        <input type="hidden" name="huella" value={linea.huella} />
        <input type="hidden" name="cantidad" value="0" />
        <button
          type="submit"
          disabled={pendiente}
          className="text-xs text-muted underline underline-offset-4 disabled:opacity-50"
        >
          Quitar
        </button>
      </form>
    </li>
  );
}
