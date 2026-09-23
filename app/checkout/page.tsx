import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormCheckout } from "@/components/carrito/FormCheckout";
import { usuarioActual } from "@/lib/auth/dal";
import { obtenerCarrito } from "@/lib/carrito/repositorio";
import { formatPrecio } from "@/lib/format";

export const instant = false;

export const metadata: Metadata = {
  title: "Finalizar compra",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  searchParams,
}: PageProps<"/checkout">) {
  const { devueltas } = await searchParams;
  const botellasDevueltas = Number(devueltas) || 0;

  const [carrito, usuario] = await Promise.all([
    obtenerCarrito(botellasDevueltas),
    usuarioActual(),
  ]);

  if (carrito.lineas.length === 0) redirect("/carrito");

  /*
   * Estas dos guardas son de UX, no de seguridad: evitan que alguien llene el
   * formulario para que después lo rebote. La barrera de verdad está en
   * `irAPagar()`, que llama a `exigirEmailVerificado()` — la server action es
   * un POST alcanzable sin pasar por esta pantalla.
   */
  if (!usuario) redirect("/login?destino=/checkout");
  if (!usuario.emailVerificado) redirect("/verificar/pendiente");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl sm:text-4xl">Finalizar compra</h1>

      <section className="mt-8 rounded-2xl border border-foreground/10 p-6">
        <h2 className="font-display text-xl">Tu pedido</h2>

        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {carrito.lineas.map((l) => (
            <li key={`${l.sku}:${l.huella}`} className="flex justify-between gap-4">
              <span>
                {l.cantidad > 1 && <span className="text-muted">{l.cantidad}× </span>}
                {l.producto.nombre} {l.variante.nombre}
              </span>
              <span className="tabular-nums">{formatPrecio(l.subtotal)}</span>
            </li>
          ))}

          {carrito.envases.totalEnvase > 0 && (
            <li className="flex justify-between gap-4 text-muted">
              <span>Envases ({carrito.envases.botellas} botellas)</span>
              <span className="tabular-nums">
                {formatPrecio(carrito.envases.totalEnvase)}
              </span>
            </li>
          )}
        </ul>

        <div className="mt-4 flex justify-between border-t border-foreground/10 pt-3 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{formatPrecio(carrito.total)}</span>
        </div>

        <Link
          href="/carrito"
          className="mt-4 inline-block text-xs text-muted underline underline-offset-4"
        >
          Cambiar el carrito
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl">¿Dónde te lo dejamos?</h2>
        <div className="mt-4">
          <FormCheckout devueltas={carrito.envases.devueltasAplicadas} />
        </div>
      </section>
    </main>
  );
}
