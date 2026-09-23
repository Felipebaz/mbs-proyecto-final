import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verificarTotp } from "@/app/acciones/2fa";
import { FormCodigo } from "@/components/admin/FormCodigo";
import { usuarioActual } from "@/lib/auth/dal";

export const instant = false;

export const metadata: Metadata = {
  title: "Verificar identidad",
  robots: { index: false, follow: false },
};

export default async function VerificarPage({
  searchParams,
}: PageProps<"/admin/2fa/verificar">) {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "admin") redirect("/");
  if (!usuario.totpActivadoEn) redirect("/admin/2fa/alta");

  const { motivo } = await searchParams;
  const esReautenticacion = motivo === "reautenticar";

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 sm:px-8">
      <h1 className="font-display text-3xl">
        {esReautenticacion ? "Confirmá que sos vos" : "Verificá tu identidad"}
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-muted">
        {esReautenticacion
          ? "Lo que vas a hacer no se puede deshacer, así que te lo pedimos de nuevo."
          : "Abrí tu app de autenticación y escribí el código."}
      </p>

      <div className="mt-8">
        <FormCodigo
          accion={verificarTotp}
          etiqueta="Código"
          ayuda="También podés usar uno de tus códigos de respaldo."
        />
      </div>
    </main>
  );
}
