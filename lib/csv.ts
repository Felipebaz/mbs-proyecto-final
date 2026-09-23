/**
 * Generación de CSV.
 *
 * Dos cosas que parecen detalles y no lo son: el escapado de comillas y la
 * protección contra inyección de fórmulas.
 */

/**
 * Prefijos que Excel, LibreOffice y Google Sheets interpretan como fórmula.
 *
 * Una celda que arranca con `=`, `+`, `-` o `@` se EJECUTA al abrir el archivo.
 * Un cliente que se llame `=HYPERLINK("http://sitio-malo","Cobrar")` termina
 * como un link activo en la planilla de quien abra el export — y con funciones
 * como WEBSERVICE, en una filtración de datos.
 *
 * El nombre viene de un campo que llenó un desconocido en el checkout, así que
 * esto no es paranoia.
 */
const PELIGROSOS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Escapa un valor para CSV.
 *
 * - comillas dobles duplicadas y el campo entre comillas (RFC 4180)
 * - un apóstrofo delante si empieza con algo que una planilla ejecutaría
 */
export function escaparCampo(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  let texto = String(valor);

  // El apóstrofo le dice a la planilla "esto es texto". Va ANTES de envolver en
  // comillas, así queda adentro del campo.
  if (PELIGROSOS.some((p) => texto.startsWith(p))) {
    texto = `'${texto}`;
  }

  // Siempre entre comillas: evita pensar en qué separador o salto de línea
  // trae el contenido.
  return `"${texto.replace(/"/g, '""')}"`;
}

export interface ColumnaCsv<T> {
  encabezado: string;
  valor: (fila: T) => unknown;
}

export function generarCsv<T>(
  filas: readonly T[],
  columnas: readonly ColumnaCsv<T>[],
): string {
  const lineas = [columnas.map((c) => escaparCampo(c.encabezado)).join(",")];

  for (const fila of filas) {
    lineas.push(columnas.map((c) => escaparCampo(c.valor(fila))).join(","));
  }

  /*
   * CRLF por el RFC 4180, y BOM al principio.
   *
   * El BOM es lo que hace que Excel en Windows entienda que el archivo es UTF-8.
   * Sin él, "ñandú" se abre como "Ã±andÃº" y el export parece roto.
   */
  return `﻿${lineas.join("\r\n")}\r\n`;
}

/** Centésimos a un número que una planilla pueda sumar. */
export function montoCsv(centesimos: number): string {
  return (centesimos / 100).toFixed(2);
}

/** Fecha en un formato que las planillas ordenan bien. */
export function fechaCsv(fecha: Date | null): string {
  if (!fecha) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Montevideo",
  }).format(fecha);
}

/** Cabeceras para que el navegador descargue en vez de mostrar. */
export function cabecerasCsv(nombreArchivo: string): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    // `attachment` fuerza la descarga. Sin esto, un CSV puede renderizarse en
    // el navegador, y un archivo con contenido de usuarios servido desde
    // nuestro dominio es superficie de XSS que no hace falta tener.
    "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    // Nunca cacheado: son datos de clientes y cambian todo el tiempo.
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
}
