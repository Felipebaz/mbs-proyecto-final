"use client";

import { useActionState } from "react";
import type { EstadoForm } from "@/app/acciones/auth";

/**
 * Formulario de login y de registro.
 *
 * Es cliente sólo por `useActionState`: hace falta para mostrar el error que
 * devuelve la acción sin recargar. La validación de verdad ocurre en el
 * servidor — esto es comodidad, no una frontera.
 *
 * `autoComplete` no es cosmético: sin los valores correctos, los gestores de
 * contraseñas no ofrecen guardar ni completar, y la gente termina eligiendo
 * contraseñas que pueda recordar, que son las malas.
 */

type Accion = (
  estado: EstadoForm | undefined,
  formData: FormData,
) => Promise<EstadoForm>;

interface Props {
  accion: Accion;
  modo: "login" | "registro";
}

export function FormAuth({ accion, modo }: Props) {
  const [estado, ejecutar, pendiente] = useActionState(accion, undefined);
  const esRegistro = modo === "registro";

  return (
    <form action={ejecutar} className="flex flex-col gap-4">
      {estado?.error && (
        // role="alert" para que el lector de pantalla lo anuncie al aparecer.
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm"
        >
          {estado.error}
        </p>
      )}

      {esRegistro && (
        <Campo
          id="nombre"
          etiqueta="Nombre"
          type="text"
          autoComplete="name"
          errores={estado?.errores?.nombre}
        />
      )}

      <Campo
        id="email"
        etiqueta="Correo"
        type="email"
        autoComplete="email"
        errores={estado?.errores?.email}
      />

      <Campo
        id="password"
        etiqueta="Contraseña"
        type="password"
        // "new-password" le dice al gestor que ofrezca generar una;
        // "current-password" que complete la guardada.
        autoComplete={esRegistro ? "new-password" : "current-password"}
        ayuda={esRegistro ? "Al menos 12 caracteres." : undefined}
        errores={estado?.errores?.password}
      />

      <button
        type="submit"
        disabled={pendiente}
        className="mt-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity disabled:opacity-60"
      >
        {pendiente ? "Un momento…" : esRegistro ? "Crear cuenta" : "Entrar"}
      </button>
    </form>
  );
}

interface CampoProps {
  id: string;
  etiqueta: string;
  type: string;
  autoComplete: string;
  ayuda?: string;
  errores?: string[];
}

function Campo({ id, etiqueta, type, autoComplete, ayuda, errores }: CampoProps) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = errores?.length ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required
        // Le dice al lector de pantalla que el campo está mal y cuál es el
        // mensaje. Sin esto, el error sólo se ve.
        aria-invalid={errores?.length ? true : undefined}
        aria-describedby={[idError, idAyuda].filter(Boolean).join(" ") || undefined}
        className="rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-foreground"
      />
      {ayuda && (
        <p id={idAyuda} className="text-xs text-muted">
          {ayuda}
        </p>
      )}
      {errores?.length ? (
        <p id={idError} className="text-xs text-red-600">
          {errores.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
