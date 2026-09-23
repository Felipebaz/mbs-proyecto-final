import { describe, expect, it } from "vitest";
import { PRODUCTOS } from "@/lib/catalogo/productos";
import { esPackArmable, esPackFijo } from "@/types/producto";
import {
  CANTIDAD_MAXIMA,
  calcularCarrito,
  huellaDe,
  sanearCantidad,
} from "./calculo";

/**
 * Lo que se testea acá es la regla que sostiene el negocio: el precio sale del
 * catálogo, nunca de lo que mande el navegador.
 */

// Un jugo cualquiera con más de una variante, tomado del catálogo real. Si el
// catálogo cambia, el test sigue valiendo.
const jugo = PRODUCTOS.find((p) => p.categoria === "jugos")!;
const varianteJugo = jugo.variantes[0];

describe("sanearCantidad", () => {
  it("rechaza lo que no es un entero positivo", () => {
    expect(sanearCantidad(-5)).toBe(0);
    expect(sanearCantidad(0)).toBe(0);
    expect(sanearCantidad(NaN)).toBe(0);
    // Infinity no es finito: cae a 0, no al máximo. Es lo seguro — un carrito
    // vacío es mejor que uno con 50 unidades que nadie pidió.
    expect(sanearCantidad(Infinity)).toBe(0);
    expect(sanearCantidad("abc")).toBe(0);
    expect(sanearCantidad(null)).toBe(0);
    expect(sanearCantidad(undefined)).toBe(0);
  });

  it("trunca decimales hacia abajo", () => {
    expect(sanearCantidad(2.9)).toBe(2);
  });

  it("topea: sin esto una cantidad enorme desborda el total", () => {
    expect(sanearCantidad(1_000_000)).toBe(CANTIDAD_MAXIMA);
    expect(sanearCantidad("999999")).toBe(CANTIDAD_MAXIMA);
  });
});

describe("huellaDe", () => {
  it("no distingue el orden: elegir A,B es el mismo pack que B,A", () => {
    expect(huellaDe(["b", "a"])).toBe(huellaDe(["a", "b"]));
  });

  it("vacío y null dan la misma huella", () => {
    expect(huellaDe(null)).toBe("");
    expect(huellaDe([])).toBe("");
  });
});

describe("calcularCarrito — el precio sale del catálogo", () => {
  it("usa el precio de la variante, no uno pasado por parámetro", () => {
    const r = calcularCarrito([{ sku: varianteJugo.sku, cantidad: 2 }]);

    expect(r.lineas).toHaveLength(1);
    expect(r.subtotal).toBe(varianteJugo.precio * 2);
  });

  it("ignora campos de más: no hay forma de inyectar un precio", () => {
    // Así llegaría un POST manipulado.
    const malicioso = {
      sku: varianteJugo.sku,
      cantidad: 1,
      precio: 1,
      subtotal: 1,
      total: 1,
    } as unknown as { sku: string; cantidad: number };

    const r = calcularCarrito([malicioso]);
    expect(r.subtotal).toBe(varianteJugo.precio);
    expect(r.total).toBe(varianteJugo.precio + varianteJugo.envase);
  });

  it("rechaza un SKU que no existe en vez de cobrar cero", () => {
    const r = calcularCarrito([{ sku: "NO-EXISTE", cantidad: 1 }]);

    expect(r.lineas).toHaveLength(0);
    expect(r.rechazadas).toHaveLength(1);
    expect(r.total).toBe(0);
  });

  it("descarta cantidad 0 sin dejar línea", () => {
    const r = calcularCarrito([{ sku: varianteJugo.sku, cantidad: 0 }]);
    expect(r.lineas).toHaveLength(0);
    expect(r.rechazadas).toHaveLength(0);
  });

  it("topea la cantidad al máximo", () => {
    const r = calcularCarrito([{ sku: varianteJugo.sku, cantidad: 10_000 }]);
    expect(r.lineas[0].cantidad).toBe(CANTIDAD_MAXIMA);
  });
});

describe("calcularCarrito — envases", () => {
  it("cobra un envase por botella cuando no devolvés nada", () => {
    const r = calcularCarrito([{ sku: varianteJugo.sku, cantidad: 3 }]);

    expect(r.envases.botellas).toBe(3);
    expect(r.envases.totalEnvase).toBe(varianteJugo.envase * 3);
    expect(r.total).toBe(r.subtotal + r.envases.totalEnvase);
  });

  it("perdona un envase por botella devuelta", () => {
    const r = calcularCarrito([{ sku: varianteJugo.sku, cantidad: 3 }], 2);

    expect(r.envases.devueltasAplicadas).toBe(2);
    expect(r.envases.totalEnvase).toBe(varianteJugo.envase);
  });

  it("devolver de más no genera saldo a favor", () => {
    const r = calcularCarrito([{ sku: varianteJugo.sku, cantidad: 1 }], 10);

    expect(r.envases.totalEnvase).toBe(0);
    expect(r.envases.devueltasSobrantes).toBe(9);
    expect(r.total).toBe(r.subtotal);
    expect(r.total).toBeGreaterThan(0);
  });

  it("un pack cuenta como sus botellas, no como una", () => {
    const pack = PRODUCTOS.find(esPackFijo);
    if (!pack) return;

    const v = pack.variantes[0];
    const r = calcularCarrito([{ sku: v.sku, cantidad: 1 }]);

    // Si el pack contara como una botella sola, el cliente devolvería una y se
    // le perdonaría el envase de las cinco.
    expect(r.envases.botellas).toBe(v.botellas);
    expect(r.envases.totalEnvase).toBe(v.envase);
  });
});

describe("calcularCarrito — packs armables", () => {
  const armable = PRODUCTOS.find(esPackArmable);

  it("rechaza un pack armable sin configuración", () => {
    if (!armable) return;
    const r = calcularCarrito([{ sku: armable.variantes[0].sku, cantidad: 1 }]);

    expect(r.lineas).toHaveLength(0);
    expect(r.rechazadas[0].motivo).toMatch(/elijas/i);
  });

  it("rechaza SKUs que no son elegibles para ese pack", () => {
    if (!armable) return;
    const v = armable.variantes[0];

    const r = calcularCarrito([
      {
        sku: v.sku,
        cantidad: 1,
        configuracion: Array.from({ length: v.botellas }, () => "NO-ELEGIBLE"),
      },
    ]);

    expect(r.lineas).toHaveLength(0);
    expect(r.rechazadas).toHaveLength(1);
  });

  it("acepta una selección válida y cobra el precio del pack", () => {
    if (!armable) return;
    const v = armable.variantes[0];
    const elegido = armable.skusElegibles[0];

    const r = calcularCarrito([
      {
        sku: v.sku,
        cantidad: 1,
        configuracion: Array.from({ length: v.botellas }, () => elegido),
      },
    ]);

    expect(r.lineas).toHaveLength(1);
    // El precio del pack, no la suma de los sueltos: para eso está el pack.
    expect(r.subtotal).toBe(v.precio);
  });
});
