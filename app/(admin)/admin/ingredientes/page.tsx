import type { Metadata } from "next";
import {
  agregarIngrediente,
  cambiarPrecio,
  darDeBajaIngrediente,
} from "@/app/acciones/admin";
import { BotonAccion, CLASE_CAMPO, FormAdmin } from "@/components/admin/FormAdmin";
import { requerirAdmin } from "@/lib/auth/dal";
import { listarIngredientes } from "@/lib/costos/ingredientes";
import { UNIDADES } from "@/lib/db/esquema";
import { formatPrecio } from "@/lib/format";

export const instant = false;

export const metadata: Metadata = {
  title: "Ingredientes",
  robots: { index: false, follow: false },
};

export default async function IngredientesPage() {
  await requerirAdmin();
  const ingredientes = await listarIngredientes();

  const sinPrecio = ingredientes.filter((i) => i.activo && i.precioActual === null);

  return (
    <main>
      <h1 className="font-display text-3xl">Ingredientes</h1>
      <p className="mt-2 text-sm text-muted">
        Los precios no se sobreescriben: cada cambio queda en el historial. Es lo
        que permite ver el margen de una semana con los costos de esa semana.
      </p>

      {sinPrecio.length > 0 && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        >
          {sinPrecio.length} sin precio cargado. Mientras falten, el margen que
          muestra el panel está más alto que el real.
        </p>
      )}

      <section className="mt-8 rounded-2xl border border-foreground/10 p-5">
        <h2 className="font-display text-xl">Agregar ingrediente</h2>
        <div className="mt-4">
          <FormAdmin
            accion={agregarIngrediente}
            etiquetaBoton="Agregar"
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nombre" className="text-xs font-medium">
                Nombre
              </label>
              <input
                id="nombre"
                name="nombre"
                required
                placeholder="Naranja"
                className={CLASE_CAMPO}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="unidad" className="text-xs font-medium">
                Unidad
              </label>
              <select id="unidad" name="unidad" required className={CLASE_CAMPO}>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="proveedor" className="text-xs font-medium">
                Proveedor <span className="font-normal text-muted">(opcional)</span>
              </label>
              <input
                id="proveedor"
                name="proveedor"
                placeholder="Mercado Modelo"
                className={CLASE_CAMPO}
              />
            </div>
          </FormAdmin>
        </div>
        <p className="mt-3 text-xs text-muted">
          Siempre en unidad base: gramos, mililitros o unidades. Los kilos se
          convierten al cargar el precio.
        </p>
      </section>

      <div className="mt-8 flex flex-col gap-4">
        {ingredientes.map((i) => (
          <article
            key={i.id}
            className={`rounded-2xl border p-5 ${
              i.activo ? "border-foreground/10" : "border-foreground/5 opacity-60"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">
                {i.nombre}
                <span className="ml-2 text-xs text-muted">por {i.unidad}</span>
                {!i.activo && <span className="ml-2 text-xs">(de baja)</span>}
              </h3>

              <p className="text-sm tabular-nums">
                {i.precioActual === null ? (
                  <span className="text-amber-700">sin precio</span>
                ) : (
                  <>
                    {formatPrecio(i.precioActual)} / {i.unidad}
                    {i.notaPrecio && (
                      <span className="ml-2 text-xs text-muted">
                        ({i.notaPrecio})
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>

            {i.proveedor && (
              <p className="mt-1 text-xs text-muted">{i.proveedor}</p>
            )}

            {i.activo && (
              <div className="mt-4 flex flex-wrap items-end gap-4">
                <FormAdmin
                  accion={cambiarPrecio}
                  etiquetaBoton="Registrar precio"
                  className="flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="ingredienteId" value={i.id} />

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`monto-${i.id}`}
                      className="text-xs font-medium"
                    >
                      Pagué $
                    </label>
                    <input
                      id={`monto-${i.id}`}
                      name="montoPagado"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="900"
                      className={`${CLASE_CAMPO} w-28`}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`cant-${i.id}`}
                      className="text-xs font-medium"
                    >
                      por ({i.unidad})
                    </label>
                    <input
                      id={`cant-${i.id}`}
                      name="cantidadComprada"
                      type="number"
                      min="1"
                      required
                      placeholder="5000"
                      className={`${CLASE_CAMPO} w-28`}
                    />
                  </div>
                </FormAdmin>

                <BotonAccion
                  accion={darDeBajaIngrediente}
                  campos={{ ingredienteId: i.id }}
                  etiqueta="Dar de baja"
                  variante="suave"
                />
              </div>
            )}
          </article>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted">
        Se pide lo que pagaste y por cuánto, no el precio por gramo: nadie compra
        por gramo. La división la hace el servidor y queda anotada.
      </p>
    </main>
  );
}
