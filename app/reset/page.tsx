import type { Metadata } from "next";
import Link from "next/link";
import { FormReset } from "@/components/auth/FormReset";

export const instant = false;

export const metadata: Metadata = {
  title: "Elegir contraseña",
  robots: { index: false, follow: false },
};

/**
 * El token sólo se pasa al formulario. No se valida acá a propósito: validarlo
 * al mostrar la página lo consumiría, y entonces el formulario se enviaría con
 * un token ya gastado. Se valida y se consume en la acción, en un solo paso
 * atómico.
 */
export default async function ResetPage({ searchParams }: PageProps<"/reset">) {
  const { token } = await searchParams;

  if (typeof token !== "string" || token.length < 10) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 sm:px-8">
        <h1 className="font-display text-3xl">Link incompleto</h1>
        <p className="mt-3 text-sm text-muted">
          Copiá el link entero del correo, o pedí uno nuevo.
        </p>
        <Link
          href="/recuperar"
          className="mt-8 inline-block rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background"
        >
          Pedir link nuevo
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 sm:px-8">
      <h1 className="font-display text-3xl">Elegí una contraseña</h1>
      <div className="mt-8">
        <FormReset token={token} />
      </div>
    </main>
  );
}
