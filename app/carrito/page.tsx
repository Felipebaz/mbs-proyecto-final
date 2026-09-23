import type { Metadata } from "next";
import Link from "next/link";
import { LineaCarrito, type LineaVista } from "@/components/carrito/LineaCarrito";
import { usuarioActual } from "@/lib/auth/dal";
import { obtenerCarrito } from "@/lib/carrito/repositorio";
import { formatPrecio } from "@/lib/format";

/**
 * Ruta bloqueante: el carrito ES la sesión.
 *
 * A diferencia del catálogo, acá no hay shell que sirva sin saber quién sos:
 * la página entera son las líneas del carrito de esta persona.
 */
export const instant = false;

export const metadata: Metadata = {
  title: "Tu carrito",
  robots: { index: false, follow: false },
};

/**
 * El carrito no exige sesión: el visitante anónimo compra igual y al entrar se
 * le funde lo que tenía. Por eso acá no hay `exigirUsuario()`.
 *
 * Todos los precios salen de `obtenerCarrito()`, que los recalcula desde el
 * catálogo en cada carga. Nada de lo que muestra esta página viene del cliente.
 */
export default async function CarritoPage({
  searchParams,
}: PageProps<"/carrito">) {
  const { devueltas } = await searchParams;

  // Viene de un input: puede llegar negativo, decimal o basura. `calcularEnvases`
  // lo sanea, pero convertirlo acá evita pasarle un string.
  const botellasDevueltas = Number(devueltas) || 0;

  const [carrito, usuario] = await Promise.all([
    obtenerCarrito(botellasDevueltas),
    usuarioActual(),
  ]);

  const lineas: LineaVista[] = carrito.lineas.map((l) => ({
    sku: l.sku,
    huella: l.huella,
    nombre: l.producto.nombre,
    variante: l.variante.nombre,
    cantidad: l.cantidad,
    subtotal: l.subtotal,
    configuracion: l.configuracion,
  }));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl sm:text-4xl">Tu carrito</h1>

      {carrito.rechazadas.length > 0 && (
        <div
          role="status"
          className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <p>Sacamos algunas cosas que ya no están disponibles:</p>
          <ul className="mt-1 list-inside list-disc">
            {carrito.rechazadas.map((r) => (
              <li key={r.sku}>
                {r.sku} — {r.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lineas.length === 0 ? (
        <div className="mt-10">
          <p className="text-muted">Todavía no agregaste nada.</p>
          <Link
            href="/productos"
            className="mt-4 inline-block rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background"
          >
            Ver productos
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-8">
            {lineas.map((linea) => (
              <LineaCarrito key={`${linea.sku}:${linea.huella}`} linea={linea} />
            ))}
          </ul>

          <section className="mt-8 rounded-2xl border border-foreground/10 p-6">
            <h2 className="font-display text-xl">Total</h2>

            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <Fila etiqueta="Jugos" valor={formatPrecio(carrito.subtotal)} />

              <Fila
                etiqueta={`Envases (${carrito.envases.botellas} ${
                  carrito.envases.botellas === 1 ? "botella" : "botellas"
                })`}
                valor={formatPrecio(carrito.envases.totalEnvase)}
              />

              {/* El argumento para traer las botellas: se muestra sólo cuando
                  efectivamente ahorró algo. */}
              {carrito.envases.ahorro > 0 && (
                <Fila
                  etiqueta={`Devolvés ${carrito.envases.devueltasAplicadas}`}
                  valor={`− ${formatPrecio(carrito.envases.ahorro)}`}
                />
              )}

              <div className="mt-2 flex justify-between border-t border-foreground/10 pt-3 text-base font-medium">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPrecio(carrito.total)}</dd>
              </div>
            </dl>

            {carrito.envases.devueltasSobrantes > 0 && (
              <p className="mt-3 text-xs text-muted">
                Traés {carrito.envases.devueltasSobrantes} botella
                {carrito.envases.devueltasSobrantes === 1 ? "" : "s"} de más.
                No generan saldo, pero te las recibimos igual.
              </p>
            )}
          </section>

          <Link
            href={`/checkout${botellasDevueltas > 0 ? `?devueltas=${botellasDevueltas}` : ""}`}
            className="mt-6 block rounded-full bg-foreground px-5 py-3 text-center text-sm font-medium text-background"
          >
            Finalizar compra
          </Link>

          {!usuario && (
            <p className="mt-6 text-sm text-muted">
              <Link
                href="/login?destino=/carrito"
                className="underline underline-offset-4"
              >
                Entrá
              </Link>{" "}
              para que el carrito te siga en otro dispositivo. Lo que tenés acá
              no se pierde.
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{etiqueta}</dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}
