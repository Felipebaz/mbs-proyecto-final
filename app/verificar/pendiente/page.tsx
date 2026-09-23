import type { Metadata } from "next";
import Link from "next/link";
import { reenviarVerificacion } from "@/app/acciones/auth";
import { FormCorreo } from "@/components/auth/FormCorreo";

export const metadata: Metadata = {
  title: "Verificá tu correo",
  robots: { index: false, follow: false },
};

export default function PendientePage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 sm:px-8">
      <h1 className="font-display text-3xl">Verificá tu correo</h1>
      <p className="mt-2 text-sm text-muted">
        Para hacer un pedido necesitamos confirmar tu dirección. Si no te llegó
        el correo, te lo reenviamos.
      </p>

      <div className="mt-8">
        <FormCorreo
          accion={reenviarVerificacion}
          etiquetaBoton="Reenviar verificación"
        />
      </div>

      <p className="mt-6 text-sm text-muted">
        Revisá también la carpeta de spam.{" "}
        <Link href="/productos" className="underline underline-offset-4">
          Seguir mirando productos
        </Link>
      </p>
    </main>
  );
}
