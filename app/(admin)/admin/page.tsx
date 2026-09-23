import type { Metadata } from "next";
import Link from "next/link";
import { requerirAdmin } from "@/lib/auth/dal";
import { listaDeCompra } from "@/lib/costos/compras";
import { rentabilidad, semanaDe } from "@/lib/costos/rentabilidad";
import { resumenPedidos } from "@/lib/pedidos/administrar";
import { formatPrecio } from "@/lib/format";

export const instant = false;

export const metadata: Metadata = {
  title: "Panel",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const admin = await requerirAdmin();

  const { desde, hasta } = semanaDe(new Date());
  const [resumen, semana, compra] = await Promise.all([
    resumenPedidos(),
    rentabilidad(desde, hasta),
    listaDeCompra(desde, hasta),
  ]);

  const pendientes = resumen.find((r) => r.estado === "pendiente");
  const pagados = resumen.find((r) => r.estado === "pagado");

  return (
    <main>
      <h1 className="font-display text-3xl">Resumen</h1>
      <p className="mt-1 text-sm text-muted">
        Hola, {admin.nombre ?? admin.email}. Semana del{" "}
        {desde.toLocaleDateString("es-UY", { day: "numeric", month: "long" })}.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta
          titulo="A preparar"
          valor={String((pagados?.cantidad ?? 0) + (pendientes?.cantidad ?? 0))}
          detalle={`${pagados?.cantidad ?? 0} pagados, ${pendientes?.cantidad ?? 0} sin confirmar`}
          href="/admin/pedidos"
        />
        <Tarjeta
          titulo="Vendido esta semana"
          valor={formatPrecio(semana.ingresos)}
          detalle={`${semana.pedidos} ${semana.pedidos === 1 ? "pedido" : "pedidos"}`}
          href="/admin/rentabilidad"
        />
        <Tarjeta
          titulo="Margen"
          valor={
            semana.margenPorcentaje === null ? "—" : `${semana.margenPorcentaje}%`
          }
          detalle={
            semana.skusIncompletos > 0
              ? `⚠ ${semana.skusIncompletos} sin costo completo`
              : formatPrecio(semana.margen)
          }
          href="/admin/rentabilidad"
        />
        <Tarjeta
          titulo="Compra estimada"
          valor={formatPrecio(compra.costoTotal)}
          detalle={
            compra.faltanPrecios.length > 0
              ? `⚠ faltan ${compra.faltanPrecios.length} precios`
              : `${compra.lineas.length} ingredientes`
          }
          href="/admin/compras"
        />
      </div>

      {(semana.skusIncompletos > 0 || compra.skusSinReceta.length > 0) && (
        <section
          role="status"
          className="mt-8 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm"
        >
          <p className="font-medium">Hay datos que faltan cargar</p>
          <ul className="mt-2 list-inside list-disc text-muted">
            {compra.skusSinReceta.length > 0 && (
              <li>
                {compra.skusSinReceta.length} productos vendidos sin receta:{" "}
                <Link href="/admin/recetas" className="underline">
                  cargarlas
                </Link>
              </li>
            )}
            {compra.faltanPrecios.length > 0 && (
              <li>
                Sin precio: {compra.faltanPrecios.slice(0, 5).join(", ")}
                {compra.faltanPrecios.length > 5 && "…"}{" "}
                <Link href="/admin/ingredientes" className="underline">
                  cargar
                </Link>
              </li>
            )}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Mientras falten, el margen que ves está más alto que el real.
          </p>
        </section>
      )}
    </main>
  );
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  href,
}: {
  titulo: string;
  valor: string;
  detalle: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-foreground/10 p-5 transition-colors hover:border-foreground/30"
    >
      <p className="text-xs uppercase tracking-wide text-muted">{titulo}</p>
      <p className="mt-2 font-display text-2xl tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-muted">{detalle}</p>
    </Link>
  );
}
