"use client";

import { useActionState } from "react";
import { agregar } from "@/app/acciones/carrito";

/**
 * Agrega una variante al carrito.
 *
 * Lo único que manda es el SKU y la cantidad. El precio no aparece en ningún
 * campo del formulario, ni oculto: el servidor lo busca en el catálogo. Un
 * `<input type="hidden" name="precio">` sería la puerta para comprar un pack de
 * $1.100 por $1.
 */
export function BotonAgregar({
  sku,
  nombre,
  disponible,
}: {
  sku: string;
  nombre: string;
  disponible: boolean;
}) {
  const [estado, ejecutar, pendiente] = useActionState(agregar, undefined);

  if (!disponible) {
    return (
      <p className="rounded-full border border-foreground/20 px-5 py-3 text-center text-sm text-muted">
        Sin stock por ahora
      </p>
    );
  }

  return (
    <form action={ejecutar} className="flex flex-col gap-2">
      <input type="hidden" name="sku" value={sku} />
      <input type="hidden" name="cantidad" value="1" />

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity disabled:opacity-60"
      >
        {pendiente ? "Agregando…" : "Agregar al carrito"}
      </button>

      {estado?.error && (
        <p role="alert" className="text-xs text-red-600">
          {estado.error}
        </p>
      )}
      {estado?.ok && (
        <p role="status" className="text-xs text-muted">
          {nombre} agregado. <a href="/carrito" className="underline">Ver carrito</a>
        </p>
      )}
    </form>
  );
}
