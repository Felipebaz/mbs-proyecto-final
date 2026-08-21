import { describe, expect, it } from "vitest";
import {
  ahorroPack,
  esCategoriaValida,
  getCategorias,
  getContenidoPack,
  getProductoBySlug,
  getProductos,
  getProductosDestacados,
  getProductosPorCategoria,
  getSlugs,
  getVariante,
  precioSueltoPack,
  validarCatalogo,
} from "./queries";
import { esPackFijo, precioTotal } from "@/types/producto";

/**
 * Estos tests SÍ corren contra el catálogo real, a diferencia de los de
 * producto.test.ts. Son la red que avisa si un dato quedó mal cargado.
 */

describe("validarCatalogo", () => {
  it("el catálogo no tiene errores", () => {
    // El más importante de la suite. Caza SKU duplicado, SKU inventado en un
    // pack, y packs que dicen 5 botellas y traen 4 — cosas que TypeScript no
    // puede ver porque un SKU es un string cualquiera.
    expect(validarCatalogo()).toEqual([]);
  });
});

describe("getProductos", () => {
  it("devuelve productos", async () => {
    expect((await getProductos()).length).toBeGreaterThan(0);
  });

  it("devuelve una copia: mutarla no ensucia el catálogo", async () => {
    const primera = await getProductos();
    primera.pop();
    expect((await getProductos()).length).toBe(primera.length + 1);
  });
});

describe("getProductoBySlug", () => {
  it("encuentra por slug", async () => {
    expect((await getProductoBySlug("jugo-verde"))?.nombre).toBe("Jugo Verde");
  });

  it("devuelve null si no existe, en vez de romper", async () => {
    // La ficha usa esto para decidir el 404.
    expect(await getProductoBySlug("jugo-inventado")).toBeNull();
  });

  it("distingue mayúsculas: el slug es literal", async () => {
    expect(await getProductoBySlug("Jugo-Verde")).toBeNull();
  });
});

describe("getSlugs", () => {
  it("no repite: dos productos con el mismo slug serían la misma URL", async () => {
    const slugs = await getSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("hay uno por producto", async () => {
    expect((await getSlugs()).length).toBe((await getProductos()).length);
  });
});

describe("getProductosPorCategoria", () => {
  it("solo trae los de esa categoría", async () => {
    const jugos = await getProductosPorCategoria("jugos");
    expect(jugos.length).toBeGreaterThan(0);
    expect(jugos.every((p) => p.categoria === "jugos")).toBe(true);
  });

  it("las categorías no se pisan entre sí", async () => {
    const [jugos, shots, packs] = await Promise.all([
      getProductosPorCategoria("jugos"),
      getProductosPorCategoria("shots"),
      getProductosPorCategoria("packs"),
    ]);
    const total = jugos.length + shots.length + packs.length;
    expect(total).toBe((await getProductos()).length);
  });
});

describe("getProductosDestacados", () => {
  it("todos los que devuelve están marcados como destacados", async () => {
    const destacados = await getProductosDestacados();
    expect(destacados.every((p) => p.destacado)).toBe(true);
  });
});

describe("getCategorias", () => {
  it("vienen ordenadas por el campo orden", async () => {
    const ordenes = (await getCategorias()).map((c) => c.orden);
    expect(ordenes).toEqual([...ordenes].sort((a, b) => a - b));
  });

  it("no devuelve categorías inactivas", async () => {
    expect((await getCategorias()).every((c) => c.activa)).toBe(true);
  });
});

describe("esCategoriaValida", () => {
  it("acepta las que existen", () => {
    expect(esCategoriaValida("jugos")).toBe(true);
    expect(esCategoriaValida("packs")).toBe(true);
  });

  it("rechaza cualquier otra cosa: esto es lo que decide el 404", () => {
    expect(esCategoriaValida("geles")).toBe(false);
    expect(esCategoriaValida("")).toBe(false);
    expect(esCategoriaValida("JUGOS")).toBe(false);
  });
});

describe("getVariante", () => {
  it("encuentra producto + variante", async () => {
    const r = await getVariante("jugo-verde", "910ml");
    expect(r?.variante.volumenMl).toBe(910);
  });

  it("null si el producto no existe", async () => {
    expect(await getVariante("no-existe", "330ml")).toBeNull();
  });

  it("null si la variante no existe en ese producto", async () => {
    expect(await getVariante("jugo-verde", "2000ml")).toBeNull();
  });
});

describe("packs fijos", () => {
  /**
   * Recorre TODOS los packs, no el primero.
   *
   * La versión anterior usaba .find() y solo miraba uno: se le podía subir el
   * precio al Pack ABC hasta que costara más que suelto y la suite daba verde.
   * Un test que mira una muestra no protege al resto.
   */
  async function packs() {
    const encontrados = (await getProductos()).filter(esPackFijo);
    if (encontrados.length === 0) {
      throw new Error("El catálogo no tiene ningún pack fijo.");
    }
    return encontrados;
  }

  it("el contenido de cada pack resuelve a productos reales", async () => {
    for (const pack of await packs()) {
      const contenido = await getContenidoPack(pack);
      expect(contenido.length, pack.slug).toBeGreaterThan(0);
      expect(contenido.every((l) => l.cantidad > 0), pack.slug).toBe(true);
    }
  });

  it("las botellas del contenido coinciden con las que promete cada variante", async () => {
    for (const pack of await packs()) {
      const contenido = await getContenidoPack(pack);
      const botellas = contenido.reduce((t, l) => t + l.cantidad, 0);
      for (const v of pack.variantes) {
        expect(v.botellas, `${pack.slug} / ${v.id}`).toBe(botellas);
      }
    }
  });

  it("todo pack sale más barato que comprar suelto — si no, no es un pack", async () => {
    // Invariante de negocio, no de código: si el ahorro da negativo, le estás
    // cobrando de más al que compra el pack.
    for (const pack of await packs()) {
      const suelto = await precioSueltoPack(pack);
      expect(suelto, pack.slug).toBeGreaterThan(precioTotal(pack.variantes[0]));
      expect(await ahorroPack(pack), pack.slug).toBeGreaterThan(0);
    }
  });

  it("ahorro = precio suelto − precio del pack", async () => {
    for (const pack of await packs()) {
      const suelto = await precioSueltoPack(pack);
      expect(await ahorroPack(pack), pack.slug).toBe(
        suelto - precioTotal(pack.variantes[0]),
      );
    }
  });
});
