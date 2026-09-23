import { connection, NextResponse, type NextRequest } from "next/server";
import { registrar } from "@/lib/auditoria";
import { requerirReautenticacion } from "@/lib/auth/dal";
import { rentabilidad, semanaDe } from "@/lib/costos/rentabilidad";
import { cabecerasCsv, generarCsv, montoCsv } from "@/lib/csv";

/**
 * Rentabilidad en CSV.
 *
 * Exige reautenticación: son los márgenes y los costos del negocio. No lleva
 * datos de clientes, pero es la información que menos convendría que saliera.
 */
export async function GET(request: NextRequest) {
  await connection();
  const admin = await requerirReautenticacion(15);

  const referencia = request.nextUrl.searchParams.get("semana");
  const { desde, hasta } = semanaDe(
    referencia ? new Date(referencia) : new Date(),
  );

  const r = await rentabilidad(desde, hasta);

  const csv = generarCsv(r.porSku, [
    { encabezado: "SKU", valor: (f) => f.sku },
    { encabezado: "Producto", valor: (f) => f.descripcion },
    { encabezado: "Unidades", valor: (f) => f.unidades },
    { encabezado: "Ingresos", valor: (f) => montoCsv(f.ingresos) },
    { encabezado: "Costos", valor: (f) => montoCsv(f.costos) },
    { encabezado: "Margen", valor: (f) => montoCsv(f.margen) },
    {
      encabezado: "Margen %",
      valor: (f) => (f.margenPorcentaje === null ? "" : f.margenPorcentaje),
    },
    {
      // Que quede en el archivo: un margen calculado con ingredientes sin
      // precio está inflado, y sobre esto se decide si subir precios.
      encabezado: "Costo incompleto",
      valor: (f) => (f.incompleto ? "SÍ" : ""),
    },
  ]);

  await registrar(admin, {
    accion: "datos_exportados",
    objetivo: "rentabilidad",
    detalle: {
      filas: r.porSku.length,
      semana: desde.toISOString().slice(0, 10),
      skusIncompletos: r.skusIncompletos,
    },
  });

  return new NextResponse(csv, {
    headers: cabecerasCsv(
      `anima-rentabilidad-${desde.toISOString().slice(0, 10)}.csv`,
    ),
  });
}
