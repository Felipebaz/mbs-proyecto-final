import { describe, expect, it } from "vitest";
import { escaparCampo, fechaCsv, generarCsv, montoCsv } from "./csv";

/**
 * El test importante acá es el de inyección de fórmulas. Los demás son de
 * formato.
 */

describe("escaparCampo", () => {
  it("envuelve todo en comillas", () => {
    expect(escaparCampo("hola")).toBe('"hola"');
  });

  it("duplica las comillas internas (RFC 4180)", () => {
    expect(escaparCampo('dijo "hola"')).toBe('"dijo ""hola"""');
  });

  it("deja pasar comas y saltos de línea sin romper la fila", () => {
    // Van adentro de las comillas, así que no cortan el campo.
    expect(escaparCampo("Rivera 1234, apto 5")).toBe('"Rivera 1234, apto 5"');
    expect(escaparCampo("línea 1\nlínea 2")).toBe('"línea 1\nlínea 2"');
  });

  it("null y undefined dan campo vacío", () => {
    expect(escaparCampo(null)).toBe("");
    expect(escaparCampo(undefined)).toBe("");
  });

  it("los números van como texto entre comillas", () => {
    expect(escaparCampo(1320)).toBe('"1320"');
    expect(escaparCampo(0)).toBe('"0"');
  });
});

describe("inyección de fórmulas", () => {
  /*
   * Una celda que arranca con =, +, - o @ se EJECUTA al abrir el archivo en
   * Excel, LibreOffice o Google Sheets. El nombre y las notas de un pedido los
   * escribió un desconocido en el checkout, así que esto no es hipotético.
   */
  it("neutraliza una fórmula en el nombre del cliente", () => {
    const malicioso = '=HYPERLINK("http://sitio-malo","Cobrar acá")';
    const escapado = escaparCampo(malicioso);

    // El apóstrofo le dice a la planilla "esto es texto".
    expect(escapado.startsWith("\"'=")).toBe(true);
  });

  it("neutraliza los cuatro prefijos peligrosos", () => {
    for (const prefijo of ["=", "+", "-", "@"]) {
      const escapado = escaparCampo(`${prefijo}CMD()`);
      expect(escapado, prefijo).toContain(`'${prefijo}`);
    }
  });

  it("neutraliza tabulaciones y retornos al inicio", () => {
    // Algunas planillas los usan para escapar del campo.
    expect(escaparCampo("\t=1+1")).toContain("'\t");
    expect(escaparCampo("\r=1+1")).toContain("'\r");
  });

  it("NO toca un texto normal que contenga un signo igual", () => {
    // El guión de un teléfono o un igual en el medio de una nota no es fórmula.
    const escapado = escaparCampo("2+2 es igual a 4");
    expect(escapado).toBe('"2+2 es igual a 4"');
    expect(escapado).not.toContain("'");
  });

  it("un teléfono que arranca con + queda neutralizado", () => {
    // Es un falso positivo aceptable: mejor "'+598 99 123 456" que ejecutar.
    expect(escaparCampo("+598 99 123 456")).toContain("'+598");
  });
});

describe("generarCsv", () => {
  const filas = [
    { nombre: "Ana", total: 132000 },
    { nombre: "Beto", total: 56000 },
  ];

  const columnas = [
    { encabezado: "Cliente", valor: (f: (typeof filas)[0]) => f.nombre },
    { encabezado: "Total", valor: (f: (typeof filas)[0]) => montoCsv(f.total) },
  ];

  it("arma encabezado y filas con CRLF", () => {
    const csv = generarCsv(filas, columnas);

    expect(csv).toContain('"Cliente","Total"');
    expect(csv).toContain('"Ana","1320.00"');
    expect(csv).toContain("\r\n");
  });

  it("arranca con BOM para que Excel en Windows lea UTF-8", () => {
    // Sin el BOM, "ñandú" se abre como "Ã±andÃº" y el export parece roto.
    expect(generarCsv(filas, columnas).charCodeAt(0)).toBe(0xfeff);
  });

  it("con cero filas devuelve sólo el encabezado", () => {
    const csv = generarCsv([], columnas);
    // BOM + encabezado + CRLF final.
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(1);
  });
});

describe("montoCsv", () => {
  it("convierte centésimos a un número que la planilla suma", () => {
    expect(montoCsv(132000)).toBe("1320.00");
    expect(montoCsv(5)).toBe("0.05");
    expect(montoCsv(0)).toBe("0.00");
  });

  it("no pierde centésimos en el camino", () => {
    expect(montoCsv(132055)).toBe("1320.55");
  });
});

describe("fechaCsv", () => {
  it("usa un formato que las planillas ordenan bien", () => {
    // ISO-ish (sv-SE): 2026-03-15 14:30. El formato dd/mm se ordena mal.
    const fecha = fechaCsv(new Date("2026-03-15T17:30:00Z"));
    expect(fecha).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("null da vacío", () => {
    expect(fechaCsv(null)).toBe("");
  });
});
