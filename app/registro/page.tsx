import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { registrarse } from "@/app/acciones/auth";
import { BotonGoogle } from "@/components/auth/BotonGoogle";
import { FormAuth } from "@/components/auth/FormAuth";
import { Separador } from "@/components/auth/Separador";
import { usuarioActual } from "@/lib/auth/dal";

/**
 * Ruta bloqueante: no hay shell estático que valga.
 *
 * Con `cacheComponents`, Next prerenderiza el shell de cada página y exige que
 * lo que lee cookies esté dentro de <Suspense>. Acá lo que lee cookies decide
 * la página entera —si ya hay sesión, esto redirige—, así que no hay nada útil
 * que mostrar antes de saberlo. `instant = false` dice justamente eso.
 */
export const instant = false;

export const metadata: Metadata = {
  title: "Crear cuenta",
  robots: { index: false, follow: false },
};

export default async function RegistroPage() {
  if (await usuarioActual()) redirect("/");

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 sm:px-8">
      <h1 className="font-display text-3xl">Crear cuenta</h1>
      <p className="mt-2 text-sm text-muted">
        Lo que tengas en el carrito se guarda al crearla.
      </p>

      <div className="mt-8">
        <BotonGoogle />
      </div>

      <Separador />

      <FormAuth accion={registrarse} modo="registro" />

      <p className="mt-6 text-sm text-muted">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Entrá
        </Link>
      </p>
    </main>
  );
}
