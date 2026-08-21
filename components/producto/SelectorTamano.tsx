"use client";

import { useState } from "react";
import { Precio } from "@/components/producto/Precio";
import { type Variante } from "@/types/producto";

/**
 * Selector de tamaño. El único componente cliente del catálogo.
 *
 * Es "use client" por una sola razón: useState. Elegir un tamaño y ver el
 * precio cambiar no puede pasar en el servidor — no hay ida y vuelta, pasa
 * en la máquina del usuario.
 *
 * Todo lo que lo rodea sigue siendo servidor. Se aísla acá para que el
 * JavaScript que baja al navegador sean estos botones y nada más.
 *
 * Lo usan la card (chico) y la ficha (grande) con el mismo estado.
 */

interface SelectorTamanoProps {
  variantes: readonly Variante[];
  varianteDefaultId: string;
  /** Para el aria-label: "Tamaño de Jugo Verde", no un "Tamaño" suelto. */
  nombreProducto: string;
  /** "sm" en la card, "lg" en la ficha. */
  tamano?: "sm" | "lg";
}

export function SelectorTamano({
  variantes,
  varianteDefaultId,
  nombreProducto,
  tamano = "sm",
}: SelectorTamanoProps) {
  const grande = tamano === "lg";
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
        className={grande ? "flex gap-2" : "flex gap-1.5"}
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
              className={`rounded-full border transition-colors
                disabled:cursor-not-allowed disabled:opacity-40 ${
                  grande ? "px-5 py-2 text-sm" : "px-2.5 py-1 text-xs"
                } ${
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

      <div className={grande ? "mt-4" : "mt-1.5"}>
        <Precio variante={seleccionada} tamano={tamano} />
      </div>
    </div>
  );
}
