"use client";

import { useActionState } from "react";
import { irAPagar, type EstadoCheckout } from "@/app/acciones/checkout";

/**
 * Datos de entrega y botón de pagar.
 *
 * No hay ningún campo con el precio ni con el total, ni siquiera oculto. El
 * servidor recalcula todo desde el catálogo al crear el pedido: un
 * `<input type="hidden" name="total">` sería la puerta para pagar $1.
 */
export function FormCheckout({ devueltas }: { devueltas: number }) {
  const [estado, ejecutar, pendiente] = useActionState<
    EstadoCheckout | undefined,
    FormData
  >(irAPagar, undefined);

  return (
    <form action={ejecutar} className="flex flex-col gap-4">
      <input type="hidden" name="devueltas" value={devueltas} />

      {estado?.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm"
        >
          {estado.error}
        </p>
      )}

      <Campo
        id="nombre"
        etiqueta="A nombre de"
        placeholder="Ana Pérez"
        autoComplete="name"
        errores={estado?.errores?.nombre}
      />
      <Campo
        id="telefono"
        etiqueta="Teléfono"
        type="tel"
        placeholder="099 123 456"
        autoComplete="tel"
        errores={estado?.errores?.telefono}
      />
      <Campo
        id="direccion"
        etiqueta="Dirección"
        placeholder="Calle, número y apartamento"
        autoComplete="street-address"
        errores={estado?.errores?.direccion}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notas" className="text-sm font-medium">
          Notas <span className="font-normal text-muted">(opcional)</span>
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={2}
          maxLength={500}
          placeholder="Timbre roto, dejar en portería…"
          className="rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-foreground"
        />
      </div>

      <button
        type="submit"
        disabled={pendiente}
        className="mt-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background disabled:opacity-60"
      >
        {pendiente ? "Llevándote a pagar…" : "Ir a pagar"}
      </button>

      <p className="text-xs text-muted">
        Te llevamos a Mercado Pago. Nosotros no vemos ni guardamos los datos de
        tu tarjeta.
      </p>
    </form>
  );
}

function Campo({
  id,
  etiqueta,
  type = "text",
  placeholder,
  autoComplete,
  errores,
}: {
  id: string;
  etiqueta: string;
  type?: string;
  placeholder: string;
  autoComplete: string;
  errores?: string[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        aria-invalid={errores?.length ? true : undefined}
        aria-describedby={errores?.length ? `${id}-error` : undefined}
        className="rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-foreground"
      />
      {errores?.length ? (
        <p id={`${id}-error`} className="text-xs text-red-600">
          {errores.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
