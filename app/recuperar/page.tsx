import type { Metadata } from "next";
import Link from "next/link";
import { pedirReset } from "@/app/acciones/auth";
import { FormCorreo } from "@/components/auth/FormCorreo";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  robots: { index: false, follow: false },
};

export default function RecuperarPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 sm:px-8">
      <h1 className="font-display text-3xl">Recuperar contraseña</h1>
      <p className="mt-2 text-sm text-muted">
        Te mandamos un link para elegir una nueva. Vence en 30 minutos.
      </p>

      <div className="mt-8">
        <FormCorreo accion={pedirReset} etiquetaBoton="Mandarme el link" />
      </div>

      <p className="mt-6 text-sm text-muted">
        <Link href="/login" className="underline underline-offset-4">
          Volver a entrar
        </Link>
      </p>
    </main>
  );
}
