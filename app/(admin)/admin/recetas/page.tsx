import type { Metadata } from "next";
import Link from "next/link";
import { EditorReceta } from "@/components/admin/EditorReceta";
import { requerirAdmin } from "@/lib/auth/dal";
import { getProductos } from "@/lib/catalogo/queries";
import { listarIngredientes } from "@/lib/costos/ingredientes";
import { costoDe } from "@/lib/costos/recetas";
import { formatPrecio } from "@/lib/format";
import { esPackFijo, precioTotal } from "@/types/producto";

export const instant = false;

export const metadata: Metadata = {
  title: "Recetas",
  robots: { index: false, follow: false },
};

export default async function RecetasPage() {
  await requerirAdmin();

  const [productos, ingredientes] = await Promise.all([
    getProductos(),
    listarIngredientes(),
  ]);

  const activos = ingredientes.filter((i) => i.activo);

  /*
   * Los packs no llevan receta propia: lo que se produce son los jugos que
   * traen. Cargarles una duplicaría el costo — se contaría la receta del pack
   * más la de cada botella.
   */
  const conReceta = productos.filter((p) => !esPackFijo(p) && p.categoria !== "packs");

  const fichas = await Promise.all(
    conReceta.flatMap((p) =>
      p.variantes.map(async (v) => ({
        sku: v.sku,
        nombre: `${p.nombre} ${v.nombre}`,
        precioVenta: v.precio,
        precioConEnvase: precioTotal(v),
        costo: await costoDe(v.sku),
      })),
    ),
  );

  return (
    <main>
      <h1 className="font-display text-3xl">Recetas</h1>
      <p className="mt-2 text-sm text-muted">
        Cuánto lleva cada botella. De acá sale el costo, y del costo la
        rentabilidad y la lista de compra.
      </p>

      {activos.length === 0 && (
        <p className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Primero hay que{" "}
          <Link href="/admin/ingredientes" className="underline">
            cargar ingredientes
          </Link>
          .
        </p>
      )}

      <div className="mt-8 flex flex-col gap-6">
        {fichas.map((f) => {
          const margen = f.precioVenta - f.costo.costo;
          const porcentaje =
            f.precioVenta > 0
              ? Math.round((margen / f.precioVenta) * 1000) / 10
              : null;

          return (
            <article
              key={f.sku}
              className="rounded-2xl border border-foreground/10 p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">
                  {f.nombre}
                  <span className="ml-2 font-mono text-xs text-muted">{f.sku}</span>
                </h2>

                <p className="text-sm tabular-nums">
                  {f.costo.incompleto ? (
                    <span className="text-amber-700">
                      costo incompleto
                      {f.costo.faltanPrecios.length > 0 &&
                        ` — sin precio: ${f.costo.faltanPrecios.join(", ")}`}
                    </span>
                  ) : (
                    <>
                      cuesta {formatPrecio(f.costo.costo)} · se vende a{" "}
                      {formatPrecio(f.precioVenta)} ·{" "}
                      <strong>margen {porcentaje}%</strong>
                    </>
                  )}
                </p>
              </div>

              <div className="mt-4">
                <EditorReceta
                  sku={f.sku}
                  ingredientes={activos.map((i) => ({
                    id: i.id,
                    nombre: i.nombre,
                    unidad: i.unidad,
                  }))}
                  iniciales={f.costo.lineas.map((l) => ({
                    ingredienteId: l.ingredienteId,
                    cantidad: l.cantidad,
                  }))}
                />
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-muted">
        Los packs no aparecen acá: no llevan receta propia. Lo que se produce son
        los jugos que traen, y el costo del pack sale de sumar esos.
      </p>
    </main>
  );
}
