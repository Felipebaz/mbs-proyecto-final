"use client";

import { useState } from "react";
import { guardarRecetaAccion } from "@/app/acciones/admin";
import { CLASE_CAMPO, FormAdmin } from "./FormAdmin";

export interface IngredienteOpcion {
  readonly id: string;
  readonly nombre: string;
  readonly unidad: string;
}

export interface LineaInicial {
  readonly ingredienteId: string;
  readonly cantidad: number;
}

/**
 * Editor de la receta de un SKU.
 *
 * El estado vive acá porque agregar y quitar filas sin ir al servidor es lo que
 * hace usable cargar una receta de seis ingredientes. Al enviar, las filas se
 * serializan a un campo oculto y la acción del servidor las revalida.
 */
export function EditorReceta({
  sku,
  ingredientes,
  iniciales,
}: {
  readonly sku: string;
  readonly ingredientes: readonly IngredienteOpcion[];
  readonly iniciales: readonly LineaInicial[];
}) {
  const [lineas, setLineas] = useState<LineaInicial[]>(
    iniciales.length > 0 ? [...iniciales] : [],
  );

  const disponibles = ingredientes.filter(
    (i) => !lineas.some((l) => l.ingredienteId === i.id),
  );

  function agregar(ingredienteId: string) {
    if (!ingredienteId) return;
    setLineas((previas) => [...previas, { ingredienteId, cantidad: 1 }]);
  }

  function cambiarCantidad(ingredienteId: string, cantidad: number) {
    setLineas((previas) =>
      previas.map((l) => (l.ingredienteId === ingredienteId ? { ...l, cantidad } : l)),
    );
  }

  function quitar(ingredienteId: string) {
    setLineas((previas) => previas.filter((l) => l.ingredienteId !== ingredienteId));
  }

  return (
    <FormAdmin accion={guardarRecetaAccion} etiquetaBoton="Guardar receta">
      <input type="hidden" name="sku" value={sku} />
      {/* Serializado: la acción lo parsea y valida cada línea. */}
      <input
        type="hidden"
        name="lineas"
        value={lineas.map((l) => `${l.ingredienteId}:${l.cantidad}`).join("\n")}
      />

      {lineas.length === 0 ? (
        <p className="text-sm text-muted">
          Sin receta. Mientras no tenga, el costo de este producto es desconocido
          —no cero— y no entra en la lista de compra.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lineas.map((l) => {
            const ing = ingredientes.find((i) => i.id === l.ingredienteId);
            return (
              <li key={l.ingredienteId} className="flex items-center gap-2 text-sm">
                <span className="min-w-36 flex-1">{ing?.nombre ?? l.ingredienteId}</span>

                <label className="sr-only" htmlFor={`cant-${sku}-${l.ingredienteId}`}>
                  Cantidad de {ing?.nombre}
                </label>
                <input
                  id={`cant-${sku}-${l.ingredienteId}`}
                  type="number"
                  min={1}
                  value={l.cantidad}
                  onChange={(e) =>
                    cambiarCantidad(l.ingredienteId, Number(e.target.value))
                  }
                  className={`${CLASE_CAMPO} w-24`}
                />
                <span className="w-12 text-xs text-muted">{ing?.unidad}</span>

                <button
                  type="button"
                  onClick={() => quitar(l.ingredienteId)}
                  className="text-xs text-muted underline underline-offset-4"
                >
                  quitar
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {disponibles.length > 0 && (
        <div className="mt-2">
          <label htmlFor={`agregar-${sku}`} className="sr-only">
            Agregar ingrediente
          </label>
          <select
            id={`agregar-${sku}`}
            value=""
            onChange={(e) => agregar(e.target.value)}
            className={CLASE_CAMPO}
          >
            <option value="">+ agregar ingrediente…</option>
            {disponibles.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nombre} ({i.unidad})
              </option>
            ))}
          </select>
        </div>
      )}
    </FormAdmin>
  );
}
