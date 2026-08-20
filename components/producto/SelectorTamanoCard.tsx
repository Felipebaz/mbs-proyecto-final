"use client";

import { useState } from "react";
import { formatPrecio } from "@/lib/format";
import { precioTotal, type Variante } from "@/types/producto";

/**
 * Selector de tamaño de la card. PRIMER componente cliente del proyecto.
 *
 * Es "use client" por una sola razón: useState. Elegir un tamaño y ver el
 * precio cambiar no puede pasar en el servidor — no hay ida y vuelta, pasa
 * en la máquina del usuario.
 *
 * Todo lo demás de la card sigue siendo servidor. Se aísla acá para que el
 * JavaScript que baja al navegador sean estos botones y nada más.
 */

interface SelectorTamanoCardProps {
  variantes: readonly Variante[];
  varianteDefaultId: string;
  /** Para el aria-label: "Tamaño de Jugo Verde", no un "Tamaño" suelto. */
  nombreProducto: string;
}

export function SelectorTamanoCard({
  variantes,
  varianteDefaultId,
  nombreProducto,
}: SelectorTamanoCardProps) {
  const [seleccionadaId, setSeleccionadaId] = useState(varianteDefaultId);

  const seleccionada =
    variantes.find((v) => v.id === seleccionadaId) ?? variantes[0];

  return (
    // z-10: la card entera está tapada por el stretched link de "Comprar".
    // Sin esto los botones quedan abajo de esa capa y no se pueden clickear.
    <div className="relative z-10">
      <div
        role="group"
        aria-label={`Tamaño de ${nombreProducto}`}
        className="flex gap-1.5"
      >
        {variantes.map((variante) => {
          const activa = variante.id === seleccionada.id;
          return (
            <button
              key={variante.id}
              type="button"
              onClick={() => setSeleccionadaId(variante.id)}
              disabled={!variante.disponible}
              // aria-pressed dice si está apretado. Sin esto un lector de
              // pantalla lee dos botones iguales sin saber cuál está activo.
              aria-pressed={activa}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors
                disabled:cursor-not-allowed disabled:opacity-40 ${
                  activa
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground"
                }`}
            >
              {variante.nombre}
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-sm font-medium">
        {formatPrecio(precioTotal(seleccionada))}
      </p>
    </div>
  );
}
