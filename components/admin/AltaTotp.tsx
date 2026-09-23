"use client";

import { useState } from "react";
import { confirmarAltaTotp } from "@/app/acciones/2fa";
import { FormCodigo } from "./FormCodigo";

/**
 * Alta del segundo factor: QR, código de confirmación y códigos de respaldo.
 *
 * Los códigos de respaldo se muestran UNA sola vez. En la base se guarda su
 * sha256, así que ni nosotros los podemos volver a mostrar — si se pierden,
 * hay que generar unos nuevos.
 */
export function AltaTotp({ qr, secreto }: { qr: string; secreto: string }) {
  const [codigos, setCodigos] = useState<string[] | null>(null);

  if (codigos) {
    return (
      <div>
        <h2 className="font-display text-2xl">Guardá estos códigos</h2>
        <p className="mt-2 text-sm text-muted">
          Sirven para entrar si perdés el teléfono. Cada uno se usa una sola vez.
          <strong className="text-foreground"> No los vas a poder ver de nuevo.</strong>
        </p>

        <ul className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-foreground/15 p-4 font-mono text-sm">
          {codigos.map((c) => (
            <li key={c} className="tabular-nums">{c}</li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(codigos.join("\n"))}
          className="mt-4 rounded-full border border-foreground/20 px-4 py-2 text-xs"
        >
          Copiar al portapapeles
        </button>

        <a
          href="/admin"
          className="mt-6 block rounded-full bg-foreground px-5 py-3 text-center text-sm font-medium text-background"
        >
          Ya los guardé, ir al panel
        </a>
      </div>
    );
  }

  return (
    <div>
      <ol className="flex flex-col gap-6">
        <li>
          <p className="text-sm font-medium">1. Escaneá el código</p>
          <p className="mt-1 text-sm text-muted">
            Con Google Authenticator, 1Password, Authy o la que uses.
          </p>
          {/* El QR se genera en el servidor y llega como data URI: no se carga
              nada de afuera, así que la CSP no necesita excepciones.

              `next/image` no aplica acá: no puede optimizar un data URI —ya
              está embebido en el HTML— y sólo agregaría un componente cliente
              en el medio. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="Código QR para configurar el segundo factor"
            width={200}
            height={200}
            className="mt-4 rounded-xl border border-foreground/15 bg-white p-2"
          />
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted">
              No puedo escanear
            </summary>
            <p className="mt-2 break-all font-mono text-xs">{secreto}</p>
          </details>
        </li>

        <li>
          <p className="text-sm font-medium">2. Escribí el código que te muestra</p>
          <div className="mt-3">
            <FormCodigo
              accion={confirmarAltaTotp}
              etiqueta="Código de 6 dígitos"
              onCodigos={setCodigos}
            />
          </div>
        </li>
      </ol>
    </div>
  );
}
