import { describe, expect, it } from "vitest";
import { formatLista, formatPrecio, formatVolumen } from "./format";

/**
 * OJO con el espacio: Intl separa el símbolo del número con un espacio DURO
 * (U+00A0), no con el espacio de la barra espaciadora. Comparar contra
 * "$ 270" escrito a mano falla y el mensaje de error se ve idéntico.
 * Por eso se normaliza antes de comparar.
 */
const normalizar = (s: string) => s.replace(/ /g, " ");

describe("formatPrecio", () => {
  it("convierte centésimos a pesos", () => {
    expect(normalizar(formatPrecio(27000))).toBe("$ 270");
  });

  it("usa punto como separador de miles", () => {
    expect(normalizar(formatPrecio(120000))).toBe("$ 1.200");
  });

  it("no muestra decimales", () => {
    expect(formatPrecio(27050)).not.toContain(",");
  });

  it("soporta cero", () => {
    expect(normalizar(formatPrecio(0))).toBe("$ 0");
  });
});

describe("formatVolumen", () => {
  it("muestra ml por debajo del litro", () => {
    expect(formatVolumen(330)).toBe("330 ml");
  });

  it("pasa a litros a partir de 1000", () => {
    expect(formatVolumen(1000)).toBe("1 L");
  });

  it("usa coma decimal, como se escribe en Uruguay", () => {
    expect(formatVolumen(1650)).toBe("1,65 L");
  });

  it("910 sigue siendo ml: el corte es 1000, no 900", () => {
    expect(formatVolumen(910)).toBe("910 ml");
  });
});

describe("formatLista", () => {
  it("une el último con 'y'", () => {
    expect(formatLista(["Pepino", "Manzana", "Espinaca"])).toBe(
      "Pepino, Manzana y Espinaca",
    );
  });

  it("con dos items no mete coma", () => {
    expect(formatLista(["Jengibre", "Cúrcuma"])).toBe("Jengibre y Cúrcuma");
  });

  it("con uno lo devuelve tal cual", () => {
    expect(formatLista(["Limón"])).toBe("Limón");
  });

  it("con lista vacía devuelve string vacío y no rompe", () => {
    expect(formatLista([])).toBe("");
  });
});
