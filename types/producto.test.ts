import { describe, expect, it } from "vitest";
import {
  diasDePack,
  dosisPorBotella,
  esJugo,
  esPack,
  esPackArmable,
  esPackFijo,
  esShot,
  precioDesde,
  precioPorDosis,
  precioTotal,
  varianteDefault,
  type Jugo,
  type Shot,
  type Variante,
  type VariantePack,
} from "./producto";

/**
 * Fixtures propias, no el catálogo real.
 *
 * Si estos tests usaran PRODUCTOS, cambiar un precio en productos.ts rompería
 * tests que no tienen nada que ver con precios. Se testea la FUNCIÓN, no el dato.
 */
const variante = (over: Partial<Variante> = {}): Variante => ({
  id: "330ml",
  nombre: "330 ml",
  volumenMl: 330,
  precio: 25000,
  envase: 2000,
  sku: "TEST-330",
  disponible: true,
  ...over,
});

const jugo: Jugo = {
  slug: "jugo-test",
  nombre: "Jugo Test",
  categoria: "jugos",
  tagline: "",
  descripcion: "",
  colorToken: "--color-jugo-verde",
  ingredientes: ["Pepino"],
  beneficios: [],
  imagenes: [],
  variantes: [
    variante(),
    variante({ id: "910ml", volumenMl: 910, precio: 50000, envase: 3000, sku: "TEST-910" }),
  ],
  varianteDefaultId: "330ml",
  destacado: false,
};

const shot: Shot = {
  slug: "shot-test",
  nombre: "Shot Test",
  categoria: "shots",
  tagline: "",
  descripcion: "",
  colorToken: "--color-shot-curcuma",
  ingredientes: ["Jengibre"],
  beneficios: [],
  dosisMl: 55,
  imagenes: [],
  variantes: [variante({ precio: 35000, sku: "SHOT-330" })],
  varianteDefaultId: "330ml",
  destacado: false,
};

describe("precioTotal", () => {
  it("suma contenido + envase: es lo que se cobra en la puerta", () => {
    expect(precioTotal(variante())).toBe(27000);
  });

  it("un envase caro sube el total aunque el contenido no cambie", () => {
    expect(precioTotal(variante({ envase: 10000 }))).toBe(35000);
  });
});

describe("precioDesde", () => {
  it("devuelve la variante más barata, con envase incluido", () => {
    // 330: 25000+2000 = 27000. 910: 50000+3000 = 53000.
    expect(precioDesde(jugo)).toBe(27000);
  });

  it("no asume que la más barata sea la primera de la lista", () => {
    const invertido: Jugo = {
      ...jugo,
      variantes: [
        variante({ id: "910ml", precio: 50000, envase: 3000, sku: "X-910" }),
        variante({ id: "330ml", precio: 25000, envase: 2000, sku: "X-330" }),
      ],
    };
    expect(precioDesde(invertido)).toBe(27000);
  });
});

describe("varianteDefault", () => {
  it("devuelve la que marca varianteDefaultId", () => {
    expect(varianteDefault(jugo).id).toBe("330ml");
  });

  it("si el default apunta a una variante inexistente, cae en la primera", () => {
    // Sin este fallback, la ficha renderizaría undefined y rompería en runtime.
    const roto: Jugo = { ...jugo, varianteDefaultId: "no-existe" };
    expect(varianteDefault(roto).id).toBe("330ml");
  });
});

describe("dosis del shot", () => {
  it("redondea para abajo: no se sirve media dosis", () => {
    // 330 / 55 = 6 exactas
    expect(dosisPorBotella(shot, shot.variantes[0])).toBe(6);
  });

  it("con una botella que no divide justo, sobra y no se cuenta", () => {
    // 350 / 55 = 6,36 → 6
    expect(dosisPorBotella(shot, variante({ volumenMl: 350 }))).toBe(6);
  });

  it("precioPorDosis reparte el total (con envase) entre las dosis", () => {
    // (35000 + 2000) / 6 = 6166,67 → 6167
    expect(precioPorDosis(shot, shot.variantes[0])).toBe(6167);
  });
});

describe("type guards", () => {
  it("distinguen jugo de shot", () => {
    expect(esJugo(jugo)).toBe(true);
    expect(esShot(jugo)).toBe(false);
    expect(esShot(shot)).toBe(true);
  });

  it("un jugo no es pack, ni fijo ni armable", () => {
    expect(esPack(jugo)).toBe(false);
    expect(esPackFijo(jugo)).toBe(false);
    expect(esPackArmable(jugo)).toBe(false);
  });
});

describe("diasDePack", () => {
  it("una botella por día", () => {
    const v: VariantePack = { ...variante({ sku: "PACK-5" }), id: "5", botellas: 5 };
    expect(diasDePack(v)).toBe(5);
  });
});
