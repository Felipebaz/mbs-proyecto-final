import type { Metadata } from "next";
import { crearPedidoManual } from "@/app/acciones/admin";
import { CLASE_CAMPO, FormAdmin } from "@/components/admin/FormAdmin";
import { requerirAdmin } from "@/lib/auth/dal";
import { getProductos } from "@/lib/catalogo/queries";
import { formatPrecio } from "@/lib/format";
import { precioTotal } from "@/types/producto";

export const instant = false;

export const metadata: Metadata = {
  title: "Cargar pedido",
  robots: { index: false, follow: false },
};

/**
 * Carga manual de un pedido tomado por WhatsApp o teléfono.
 *
 * Pasa por el MISMO `crearPedido` que el checkout web, así que los precios
 * salen del catálogo también acá. Un camino aparte sería un segundo lugar donde
 * el precio se escribe a mano, y el número de la rentabilidad dejaría de ser
 * comparable entre pedidos web y manuales.
 */
export default async function NuevoPedidoPage() {
  await requerirAdmin();
  const productos = await getProductos();

  return (
    <main>
      <h1 className="font-display text-3xl">Cargar pedido</h1>
      <p className="mt-2 text-sm text-muted">
        Para los que llegan por WhatsApp o por teléfono. Queda pendiente de pago;
        cuando cobres, lo marcás pagado desde la lista.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
        <FormAdmin accion={crearPedidoManual} etiquetaBoton="Crear pedido">
          <Campo id="nombre" etiqueta="Nombre" placeholder="Ana Pérez" />
          <Campo id="telefono" etiqueta="Teléfono" placeholder="099 123 456" />
          <Campo
            id="direccion"
            etiqueta="Dirección"
            placeholder="Calle, número, apartamento"
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="lineas" className="text-sm font-medium">
              Qué lleva
            </label>
            <textarea
              id="lineas"
              name="lineas"
              required
              rows={6}
              placeholder={"JG-VD-330 2\nJG-NJ-910 1"}
              className={`${CLASE_CAMPO} font-mono`}
            />
            <p className="text-xs text-muted">
              Un SKU por línea, con la cantidad. Los SKUs están en la tabla de al
              lado.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="devueltas" className="text-sm font-medium">
              Botellas que devuelve
            </label>
            <input
              id="devueltas"
              name="devueltas"
              type="number"
              min={0}
              max={200}
              defaultValue={0}
              className={`${CLASE_CAMPO} w-24`}
            />
            <p className="text-xs text-muted">
              Descuenta el envase, empezando por el más caro.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="notas" className="text-sm font-medium">
              Notas <span className="font-normal text-muted">(opcional)</span>
            </label>
            <textarea
              id="notas"
              name="notas"
              rows={2}
              maxLength={500}
              className={CLASE_CAMPO}
            />
          </div>
        </FormAdmin>

        <aside className="rounded-2xl border border-foreground/10 p-4">
          <h2 className="text-sm font-medium">SKUs</h2>
          <ul className="mt-3 flex flex-col gap-2 text-xs">
            {productos.flatMap((p) =>
              p.variantes.map((v) => (
                <li key={v.sku} className="flex justify-between gap-2">
                  <span className="font-mono">{v.sku}</span>
                  <span className="text-right text-muted">
                    {p.nombre} {v.nombre}
                    <br />
                    <span className="tabular-nums">
                      {formatPrecio(precioTotal(v))}
                    </span>
                  </span>
                </li>
              )),
            )}
          </ul>
        </aside>
      </div>
    </main>
  );
}

function Campo({
  id,
  etiqueta,
  placeholder,
}: {
  id: string;
  etiqueta: string;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        placeholder={placeholder}
        required
        className={CLASE_CAMPO}
      />
    </div>
  );
}
