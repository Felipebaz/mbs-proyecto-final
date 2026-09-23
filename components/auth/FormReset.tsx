"use client";

import { useActionState } from "react";
import { cambiarPassword, type EstadoForm } from "@/app/acciones/auth";

/**
 * Elegir contraseña nueva. El token viaja en un campo oculto; la acción lo
 * valida y lo consume del lado servidor, así que acá no hay nada que confiar.
 */
export function FormReset({ token }: { token: string }) {
  const [estado, ejecutar, pendiente] = useActionState<
    EstadoForm | undefined,
    FormData
  >(cambiarPassword, undefined);

  return (
    <form action={ejecutar} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      {estado?.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm"
        >
          {estado.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña nueva
        </label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Elegí una contraseña larga"
          // "new-password" hace que el gestor ofrezca generar una.
          autoComplete="new-password"
          required
          aria-invalid={estado?.errores?.password ? true : undefined}
          aria-describedby="password-ayuda"
          className="rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-foreground"
        />
        <p id="password-ayuda" className="text-xs text-muted">
          Al menos 12 caracteres.
        </p>
        {estado?.errores?.password && (
          <p className="text-xs text-red-600">
            {estado.errores.password.join(" ")}
          </p>
        )}
      </div>

      <p className="text-xs text-muted">
        Al cambiarla se cierran todas tus sesiones abiertas.
      </p>

      <button
        type="submit"
        disabled={pendiente}
        className="mt-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
