"use client";

import { useActionState } from "react";
import type { EstadoForm } from "@/app/acciones/auth";

/**
 * Formulario de un solo campo de correo: sirve para pedir el reset y para
 * reenviar la verificación.
 *
 * Los dos responden siempre lo mismo exista o no la cuenta, así que esta
 * pantalla nunca muestra "no encontramos esa dirección".
 */
export function FormCorreo({
  accion,
  etiquetaBoton,
}: {
  accion: (
    estado: EstadoForm | undefined,
    formData: FormData,
  ) => Promise<EstadoForm>;
  etiquetaBoton: string;
}) {
  const [estado, ejecutar, pendiente] = useActionState(accion, undefined);

  if (estado?.ok) {
    return (
      <p
        role="status"
        className="rounded-lg border border-foreground/15 bg-foreground/5 px-4 py-3 text-sm"
      >
        {estado.ok}
      </p>
    );
  }

  return (
    <form action={ejecutar} className="flex flex-col gap-4">
      {estado?.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm"
        >
          {estado.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="tu@correo.com"
          autoComplete="email"
          required
          className="rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-foreground"
        />
      </div>

      <button
        type="submit"
        disabled={pendiente}
        className="mt-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background disabled:opacity-60"
      >
        {pendiente ? "Un momento…" : etiquetaBoton}
      </button>
    </form>
  );
}
