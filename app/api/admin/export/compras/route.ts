import { connection, NextResponse, type NextRequest } from "next/server";
import { registrar } from "@/lib/auditoria";
import { requerirAdmin } from "@/lib/auth/dal";
import { listaDeCompra } from "@/lib/costos/compras";
import { semanaDe } from "@/lib/costos/rentabilidad";
import { cabecerasCsv, generarCsv, montoCsv } from "@/lib/csv";

/**
 * Lista de compra en CSV, para llevar al mercado.
 *
 * No exige reautenticación: no lleva datos de clientes, sólo cantidades de
 * fruta. Pedir el segundo factor para imprimir una lista de compras sería
 * fricción sin nada del otro lado.
 */
export async function GET(request: NextRequest) {
  await connection();
  const admin = await requerirAdmin();

  const referencia = request.nextUrl.searchParams.get("semana");
  const { desde, hasta } = semanaDe(
    referencia ? new Date(referencia) : new Date(),
  );

  const lista = await listaDeCompra(desde, hasta);

  const csv = generarCsv(lista.lineas, [
    { encabezado: "Proveedor", valor: (l) => l.proveedor ?? "Sin asignar" },
    { encabezado: "Ingrediente", valor: (l) => l.nombre },
    { encabezado: "Unidad", valor: (l) => l.unidad },
    { encabezado: "Confirmado", valor: (l) => l.cantidadConfirmada },
    { encabezado: "Pendiente", valor: (l) => l.cantidadPendiente },
    { encabezado: "Total a comprar", valor: (l) => l.cantidadTotal },
    {
      encabezado: "Costo estimado",
      valor: (l) => (l.costoEstimado === null ? "sin precio" : montoCsv(l.costoEstimado)),
    },
  ]);

  await registrar(admin, {
    accion: "datos_exportados",
    objetivo: "lista-de-compra",
    detalle: {
      filas: lista.lineas.length,
      semana: desde.toISOString().slice(0, 10),
    },
  });

  return new NextResponse(csv, {
    headers: cabecerasCsv(
      `anima-compras-${desde.toISOString().slice(0, 10)}.csv`,
    ),
  });
}
