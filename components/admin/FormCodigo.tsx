"use client";

import { useActionState } from "react";
import type { EstadoFactor2 } from "@/app/acciones/2fa";

/** Campo de código de 6 dígitos, o de respaldo. */
export function FormCodigo({
  accion,
  etiqueta,
  ayuda,
  onCodigos,
}: {
  accion: (
    estado: EstadoFactor2 | undefined,
    formData: FormData,
  ) => Promise<EstadoFactor2>;
  etiqueta: string;
  ayuda?: string;
  onCodigos?: (codigos: string[]) => void;
}) {
  const [estado, ejecutar, pendiente] = useActionState(accion, undefined);

  if (estado?.codigosRespaldo && onCodigos) {
    onCodigos(estado.codigosRespaldo);
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
        <label htmlFor="codigo" className="text-sm font-medium">
          {etiqueta}
        </label>
        <input
          id="codigo"
          name="codigo"
          type="text"
          // `one-time-code` hace que iOS y Android ofrezcan el código del
          // teclado sin que haya que ir a buscarlo a la app.
          autoComplete="one-time-code"
          inputMode="numeric"
          placeholder="123456"
          required
          maxLength={20}
          autoFocus
          className="rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 font-mono text-lg tracking-widest outline-none focus:border-foreground"
        />
        {ayuda && <p className="text-xs text-muted">{ayuda}</p>}
      </div>

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background disabled:opacity-60"
      >
        {pendiente ? "Verificando…" : "Verificar"}
      </button>
    </form>
  );
}
