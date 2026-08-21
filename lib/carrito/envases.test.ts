import { describe, expect, it } from "vitest";
import { calcularEnvases, type LineaConEnvase } from "./envases";

const jugo330: LineaConEnvase = { sku: "JV-330", envase: 2000, cantidad: 1 };
const jugo910: LineaConEnvase = { sku: "JV-910", envase: 3000, cantidad: 1 };
const pack5: LineaConEnvase = { sku: "PACK-LV-5", envase: 10000, cantidad: 1 };

describe("sin devolver nada", () => {
  it("cobra el envase de cada botella", () => {
    const r = calcularEnvases([jugo330, jugo910], 0);
    expect(r.totalEnvase).toBe(5000);
    expect(r.ahorro).toBe(0);
  });

  it("multiplica por la cantidad de la línea", () => {
    const r = calcularEnvases([{ ...jugo330, cantidad: 3 }], 0);
    expect(r.botellas).toBe(3);
    expect(r.totalEnvase).toBe(6000);
  });

  it("un carrito vacío no cobra nada", () => {
    const r = calcularEnvases([], 0);
    expect(r.totalEnvase).toBe(0);
    expect(r.botellas).toBe(0);
  });
});

describe("devolviendo botellas", () => {
  it("una botella devuelta cancela un envase", () => {
    const r = calcularEnvases([{ ...jugo330, cantidad: 2 }], 1);
    expect(r.totalEnvase).toBe(2000);
    expect(r.ahorro).toBe(2000);
  });

  it("devolver tantas como se lleva deja el envase en cero", () => {
    const r = calcularEnvases([{ ...jugo330, cantidad: 3 }], 3);
    expect(r.totalEnvase).toBe(0);
    expect(r.devueltasAplicadas).toBe(3);
  });

  it("perdona primero el envase más caro", () => {
    // 910 ($30) + 330 ($20), devuelve 1 → queda por pagar el de $20.
    const r = calcularEnvases([jugo330, jugo910], 1);
    expect(r.totalEnvase).toBe(2000);
    expect(r.ahorro).toBe(3000);
  });

  it("el orden de las líneas no cambia el resultado", () => {
    const a = calcularEnvases([jugo330, jugo910], 1);
    const b = calcularEnvases([jugo910, jugo330], 1);
    expect(a.totalEnvase).toBe(b.totalEnvase);
  });

  it("el envase del pack también se puede cancelar", () => {
    const r = calcularEnvases([pack5], 1);
    expect(r.totalEnvase).toBe(0);
  });
});

describe("devoluciones que no dan plata", () => {
  it("devolver de más no genera saldo a favor", () => {
    const r = calcularEnvases([{ ...jugo330, cantidad: 2 }], 10);
    expect(r.totalEnvase).toBe(0);
    // Sin este tope, el total del carrito se iría a negativo.
    expect(r.totalEnvase).toBeGreaterThanOrEqual(0);
  });

  it("informa cuántas devoluciones sobraron, para poder avisarle al cliente", () => {
    const r = calcularEnvases([{ ...jugo330, cantidad: 2 }], 5);
    expect(r.devueltasAplicadas).toBe(2);
    expect(r.devueltasSobrantes).toBe(3);
  });

  it("devolver con el carrito vacío no rompe ni acredita nada", () => {
    const r = calcularEnvases([], 4);
    expect(r.totalEnvase).toBe(0);
    expect(r.ahorro).toBe(0);
    expect(r.devueltasSobrantes).toBe(4);
  });
});

describe("entradas sucias — vienen de un input, nunca confiar", () => {
  it("ignora un número negativo de devoluciones", () => {
    const r = calcularEnvases([jugo330], -3);
    expect(r.totalEnvase).toBe(2000);
    expect(r.devueltasAplicadas).toBe(0);
  });

  it("redondea para abajo las devoluciones decimales", () => {
    const r = calcularEnvases([{ ...jugo330, cantidad: 3 }], 2.9);
    expect(r.devueltasAplicadas).toBe(2);
  });

  it("NaN se trata como cero", () => {
    const r = calcularEnvases([jugo330], Number.NaN);
    expect(r.totalEnvase).toBe(2000);
  });

  it("una cantidad negativa en una línea no resta botellas", () => {
    const r = calcularEnvases([jugo330, { ...jugo910, cantidad: -5 }], 0);
    expect(r.botellas).toBe(1);
    expect(r.totalEnvase).toBe(2000);
  });
});

describe("invariantes", () => {
  it("el ahorro nunca supera lo que se cobraría sin devolver", () => {
    const r = calcularEnvases([jugo330, jugo910, pack5], 99);
    expect(r.ahorro).toBe(r.totalSinDevolver);
    expect(r.totalEnvase).toBe(0);
  });

  it("total + ahorro siempre da el total sin devolver", () => {
    const r = calcularEnvases([jugo330, jugo910, { ...pack5, cantidad: 2 }], 2);
    expect(r.totalEnvase + r.ahorro).toBe(r.totalSinDevolver);
  });
});
