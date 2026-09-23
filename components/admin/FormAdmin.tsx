"use client";

import { useActionState } from "react";
import type { EstadoAdmin } from "@/app/acciones/admin";

type Accion = (
  estado: EstadoAdmin | undefined,
  formData: FormData,
) => Promise<EstadoAdmin>;

/**
 * Envoltura de formulario para el panel: muestra el error o el ok que devuelve
 * la acción, sin recargar.
 *
 * Es cliente sólo por `useActionState`. La validación y la autorización de
 * verdad están en la acción del servidor.
 */
export function FormAdmin({
  accion,
  children,
  etiquetaBoton,
  className,
}: {
  readonly accion: Accion;
  readonly children: React.ReactNode;
  readonly etiquetaBoton: string;
  readonly className?: string;
}) {
  const [estado, ejecutar, pendiente] = useActionState(accion, undefined);

  return (
    <form action={ejecutar} className={className ?? "flex flex-col gap-3"}>
      {estado?.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
        >
          {estado.error}
        </p>
      )}
      {estado?.ok && (
        <p
          role="status"
          className="rounded-lg border border-foreground/15 bg-foreground/5 px-3 py-2 text-sm"
        >
          {estado.ok}
        </p>
      )}

      {children}

      <button
        type="submit"
        disabled={pendiente}
        className="self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : etiquetaBoton}
      </button>
    </form>
  );
}

/** Botón que dispara una acción con campos ocultos. Para cambios de estado. */
export function BotonAccion({
  accion,
  campos,
  etiqueta,
  variante = "normal",
}: {
  readonly accion: Accion;
  readonly campos: Readonly<Record<string, string>>;
  readonly etiqueta: string;
  readonly variante?: "normal" | "suave";
}) {
  const [estado, ejecutar, pendiente] = useActionState(accion, undefined);

  return (
    <form action={ejecutar} className="inline">
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}

      <button
        type="submit"
        disabled={pendiente}
        title={estado?.error ?? undefined}
        className={
          variante === "suave"
            ? "rounded-full border border-foreground/20 px-3 py-1 text-xs disabled:opacity-50"
            : "rounded-full bg-foreground px-3 py-1 text-xs text-background disabled:opacity-50"
        }
      >
        {pendiente ? "…" : etiqueta}
      </button>

      {estado?.error && (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {estado.error}
        </span>
      )}
    </form>
  );
}

export const CLASE_CAMPO =
  "rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground";
