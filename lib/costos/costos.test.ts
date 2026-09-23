import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Ingredientes, recetas, costos, rentabilidad y lista de compra, contra
 * Postgres real (PGlite).
 *
 * Lo central: que el historial de precios sirva para calcular el margen de una
 * semana con los costos de ESA semana, y que un costo incompleto se distinga de
 * un costo cero.
 */

const entorno = await (await import("@/lib/db/prueba")).baseDePrueba();
vi.mock("@/lib/db/cliente", () => ({ db: entorno.db }));

const { ingrediente, pedido, pedidoItem, precioIngrediente, receta } =
  await import("@/lib/db/esquema");
const { crearIngrediente, registrarPrecio, preciosVigentes, desactivarIngrediente } =
  await import("./ingredientes");
const { costoDe, guardarReceta } = await import("./recetas");
const { rentabilidad, semanaDe } = await import("./rentabilidad");
const { listaDeCompra } = await import("./compras");
const { PRODUCTOS } = await import("@/lib/catalogo/productos");
const { esPackFijo } = await import("@/types/producto");

const db = entorno.db;

const jugo = PRODUCTOS.find((p) => p.categoria === "jugos")!;
const SKU = jugo.variantes[0].sku;
const PRECIO_VENTA = jugo.variantes[0].precio;

beforeEach(async () => {
  await db.delete(pedido);
  await db.delete(receta);
  await db.delete(precioIngrediente);
  await db.delete(ingrediente);
});

afterAll(async () => {
  await entorno.cerrar();
});

/** Ingrediente con precio, listo para usar en una receta. */
async function conPrecio(nombre: string, precioPorUnidad: number, desde?: Date) {
  const ing = await crearIngrediente({ nombre, unidad: "g" });
  await registrarPrecio({ ingredienteId: ing.id, precioPorUnidad, desde });
  return ing;
}

async function pedidoPagado(
  sku: string,
  cantidad: number,
  precioUnitario: number,
  cuando = new Date(),
) {
  const [p] = await db
    .insert(pedido)
    .values({
      referencia: `ped_${Math.random().toString(36).slice(2, 12)}`,
      total: precioUnitario * cantidad,
      estado: "pagado",
      nombreEntrega: "Ana",
      telefono: "099123456",
      direccion: "Rivera 1234",
      creadoEn: cuando,
      pagadoEn: cuando,
    })
    .returning();

  await db.insert(pedidoItem).values({
    pedidoId: p.id,
    sku,
    descripcion: "Jugo de prueba",
    cantidad,
    precioUnitario,
    envaseUnitario: 2000,
    botellas: cantidad,
  });

  return p;
}

describe("historial de precios", () => {
  it("registrar un precio NO sobreescribe el anterior", async () => {
    const ing = await crearIngrediente({ nombre: "Naranja", unidad: "g" });

    await registrarPrecio({ ingredienteId: ing.id, precioPorUnidad: 10 });
    await registrarPrecio({ ingredienteId: ing.id, precioPorUnidad: 15 });

    /*
     * Es lo que permite calcular la rentabilidad de una semana con los costos
     * que regían esa semana. Con UPDATE, el margen de marzo se recalcularía con
     * los precios de hoy y el número dejaría de significar algo.
     */
    const filas = await db
      .select()
      .from(precioIngrediente)
      .where(eq(precioIngrediente.ingredienteId, ing.id));

    expect(filas).toHaveLength(2);
  });

  it("el vigente es el más reciente que ya empezó a regir", async () => {
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const ing = await crearIngrediente({ nombre: "Naranja", unidad: "g" });
    await registrarPrecio({ ingredienteId: ing.id, precioPorUnidad: 10, desde: ayer });
    // Un precio fechado en el futuro no rige todavía.
    await registrarPrecio({ ingredienteId: ing.id, precioPorUnidad: 99, desde: manana });

    expect((await preciosVigentes()).get(ing.id)).toBe(10);
  });

  it("consultado a una fecha pasada, devuelve el precio de entonces", async () => {
    const hace10dias = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const hace2dias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const ing = await crearIngrediente({ nombre: "Naranja", unidad: "g" });
    await registrarPrecio({ ingredienteId: ing.id, precioPorUnidad: 10, desde: hace10dias });
    await registrarPrecio({ ingredienteId: ing.id, precioPorUnidad: 20, desde: hace2dias });

    const hace5dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect((await preciosVigentes(hace5dias)).get(ing.id)).toBe(10);
    expect((await preciosVigentes()).get(ing.id)).toBe(20);
  });

  it("rechaza un precio que no sea entero", async () => {
    const ing = await crearIngrediente({ nombre: "Naranja", unidad: "g" });
    await expect(
      registrarPrecio({ ingredienteId: ing.id, precioPorUnidad: 10.5 }),
    ).rejects.toThrow(/entero/);
  });

  it("rechaza un precio negativo", async () => {
    const ing = await crearIngrediente({ nombre: "Naranja", unidad: "g" });
    await expect(
      registrarPrecio({ ingredienteId: ing.id, precioPorUnidad: -5 }),
    ).rejects.toThrow();
  });
});

describe("costoDe", () => {
  it("suma cantidad × precio de cada ingrediente", async () => {
    const naranja = await conPrecio("Naranja", 10); // 10 centésimos por gramo
    const jengibre = await conPrecio("Jengibre", 50);

    await guardarReceta(SKU, [
      { ingredienteId: naranja.id, cantidad: 400 }, // 4000
      { ingredienteId: jengibre.id, cantidad: 10 }, // 500
    ]);

    const costo = await costoDe(SKU);

    expect(costo.costo).toBe(4500);
    expect(costo.incompleto).toBe(false);
    expect(costo.lineas).toHaveLength(2);
  });

  it("un SKU SIN receta es incompleto, no costo cero", async () => {
    const costo = await costoDe(SKU);

    /*
     * La diferencia importa: un costo desconocido mostrado como cero da un
     * margen del 100%, y sobre eso alguien decide bajar el precio.
     */
    expect(costo.costo).toBe(0);
    expect(costo.incompleto).toBe(true);
  });

  it("un ingrediente SIN precio marca el costo como incompleto", async () => {
    const naranja = await conPrecio("Naranja", 10);
    const sinPrecio = await crearIngrediente({ nombre: "Menta", unidad: "g" });

    await guardarReceta(SKU, [
      { ingredienteId: naranja.id, cantidad: 400 },
      { ingredienteId: sinPrecio.id, cantidad: 5 },
    ]);

    const costo = await costoDe(SKU);

    expect(costo.incompleto).toBe(true);
    expect(costo.faltanPrecios).toEqual(["Menta"]);
    // Suma lo que puede, pero avisa que está incompleto.
    expect(costo.costo).toBe(4000);
  });

  it("calculado a una fecha pasada usa los precios de entonces", async () => {
    const hace10dias = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const naranja = await conPrecio("Naranja", 10, hace10dias);
    await guardarReceta(SKU, [{ ingredienteId: naranja.id, cantidad: 400 }]);

    // La naranja subió hoy.
    await registrarPrecio({ ingredienteId: naranja.id, precioPorUnidad: 30 });

    const hace5dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect((await costoDe(SKU, hace5dias)).costo).toBe(4000);
    expect((await costoDe(SKU)).costo).toBe(12000);
  });
});

describe("guardarReceta", () => {
  it("reemplaza la receta entera", async () => {
    const a = await conPrecio("Naranja", 10);
    const b = await conPrecio("Jengibre", 50);

    await guardarReceta(SKU, [{ ingredienteId: a.id, cantidad: 400 }]);
    await guardarReceta(SKU, [{ ingredienteId: b.id, cantidad: 20 }]);

    const costo = await costoDe(SKU);
    expect(costo.lineas).toHaveLength(1);
    expect(costo.lineas[0].nombre).toBe("Jengibre");
  });

  it("rechaza un SKU que no está en el catálogo", async () => {
    const a = await conPrecio("Naranja", 10);
    await expect(
      guardarReceta("NO-EXISTE", [{ ingredienteId: a.id, cantidad: 1 }]),
    ).rejects.toThrow(/catálogo/);
  });

  it("rechaza cantidades cero o negativas", async () => {
    const a = await conPrecio("Naranja", 10);
    await expect(
      guardarReceta(SKU, [{ ingredienteId: a.id, cantidad: 0 }]),
    ).rejects.toThrow(/mayores que cero/);
  });

  it("una receta vacía deja el SKU sin receta", async () => {
    const a = await conPrecio("Naranja", 10);
    await guardarReceta(SKU, [{ ingredienteId: a.id, cantidad: 400 }]);

    await guardarReceta(SKU, []);
    expect((await costoDe(SKU)).incompleto).toBe(true);
  });
});

describe("desactivarIngrediente", () => {
  it("lo desactiva sin romper las recetas que lo usan", async () => {
    const naranja = await conPrecio("Naranja", 10);
    await guardarReceta(SKU, [{ ingredienteId: naranja.id, cantidad: 400 }]);

    await desactivarIngrediente(naranja.id);

    /*
     * Borrarlo haría incalculable el costo de los pedidos viejos que lo
     * llevaban. La receta y el costo siguen funcionando.
     */
    expect((await costoDe(SKU)).costo).toBe(4000);

    const [ing] = await db
      .select()
      .from(ingrediente)
      .where(eq(ingrediente.id, naranja.id));
    expect(ing.activo).toBe(false);
  });
});

describe("rentabilidad", () => {
  it("calcula margen sobre lo cobrado", async () => {
    const naranja = await conPrecio("Naranja", 10);
    await guardarReceta(SKU, [{ ingredienteId: naranja.id, cantidad: 400 }]); // 4000

    await pedidoPagado(SKU, 2, PRECIO_VENTA);

    const { desde, hasta } = semanaDe(new Date());
    const r = await rentabilidad(desde, hasta);

    expect(r.ingresos).toBe(PRECIO_VENTA * 2);
    expect(r.costos).toBe(8000);
    expect(r.margen).toBe(PRECIO_VENTA * 2 - 8000);
    expect(r.pedidos).toBe(1);
  });

  it("IGNORA los pedidos pendientes: no son ventas", async () => {
    const naranja = await conPrecio("Naranja", 10);
    await guardarReceta(SKU, [{ ingredienteId: naranja.id, cantidad: 400 }]);

    const [p] = await db
      .insert(pedido)
      .values({
        referencia: "ped_pendiente",
        total: PRECIO_VENTA,
        estado: "pendiente",
        nombreEntrega: "Ana",
        telefono: "099",
        direccion: "x",
      })
      .returning();

    await db.insert(pedidoItem).values({
      pedidoId: p.id,
      sku: SKU,
      descripcion: "Jugo",
      cantidad: 1,
      precioUnitario: PRECIO_VENTA,
      envaseUnitario: 2000,
      botellas: 1,
    });

    const { desde, hasta } = semanaDe(new Date());
    // Contar lo pendiente infla el número sobre el que se decide subir precios.
    expect((await rentabilidad(desde, hasta)).ingresos).toBe(0);
  });

  it("el ENVASE no cuenta como producto", async () => {
    const naranja = await conPrecio("Naranja", 10);
    await guardarReceta(SKU, [{ ingredienteId: naranja.id, cantidad: 400 }]);

    const p = await pedidoPagado(SKU, 1, PRECIO_VENTA);
    await db.insert(pedidoItem).values({
      pedidoId: p.id,
      sku: "ENVASE",
      descripcion: "Envases",
      cantidad: 1,
      precioUnitario: 2000,
      envaseUnitario: 0,
      botellas: 0,
    });

    const { desde, hasta } = semanaDe(new Date());
    const r = await rentabilidad(desde, hasta);

    // El envase se cobra y se devuelve: no es margen.
    expect(r.ingresos).toBe(PRECIO_VENTA);
    expect(r.porSku.map((f) => f.sku)).not.toContain("ENVASE");
  });

  it("marca como incompleto el margen de un SKU sin receta", async () => {
    await pedidoPagado(SKU, 1, PRECIO_VENTA);

    const { desde, hasta } = semanaDe(new Date());
    const r = await rentabilidad(desde, hasta);

    expect(r.skusIncompletos).toBe(1);
    expect(r.porSku[0].incompleto).toBe(true);
  });

  it("usa los costos que regían cuando se vendió", async () => {
    const hace10dias = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const naranja = await conPrecio("Naranja", 10, hace10dias);
    await guardarReceta(SKU, [{ ingredienteId: naranja.id, cantidad: 400 }]);

    await pedidoPagado(SKU, 1, PRECIO_VENTA, hace10dias);

    // La naranja se triplicó después de esa venta.
    await registrarPrecio({ ingredienteId: naranja.id, precioPorUnidad: 30 });

    const { desde, hasta } = semanaDe(hace10dias);
    const r = await rentabilidad(desde, hasta);

    // Si usara el precio de hoy, el margen de esa semana se distorsionaría.
    expect(r.costos).toBe(4000);
  });

  it("deja primero lo que menos margen deja", async () => {
    const naranja = await conPrecio("Naranja", 10);
    const caro = await conPrecio("Trufa", 5000);

    const otroSku = jugo.variantes[1]?.sku ?? SKU;
    if (otroSku === SKU) return;

    await guardarReceta(SKU, [{ ingredienteId: naranja.id, cantidad: 100 }]);
    await guardarReceta(otroSku, [{ ingredienteId: caro.id, cantidad: 100 }]);

    await pedidoPagado(SKU, 1, PRECIO_VENTA);
    await pedidoPagado(otroSku, 1, jugo.variantes[1].precio);

    const { desde, hasta } = semanaDe(new Date());
    const r = await rentabilidad(desde, hasta);

    // Es lo que hay que mirar primero.
    expect(r.porSku[0].sku).toBe(otroSku);
  });
});

describe("semanaDe", () => {
  it("arranca el lunes", () => {
    // 2026-03-18 es miércoles.
    const { desde, hasta } = semanaDe(new Date("2026-03-18T15:00:00"));
    expect(desde.getDay()).toBe(1);
    expect(hasta.getTime() - desde.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("un domingo cae en la semana que arrancó el lunes anterior", () => {
    // El domingo cierra la semana, no la abre.
    const { desde } = semanaDe(new Date("2026-03-22T15:00:00"));
    expect(desde.getDate()).toBe(16);
  });
});

describe("listaDeCompra", () => {
  it("suma los ingredientes de lo que hay que producir", async () => {
    const naranja = await conPrecio("Naranja", 10);
    await guardarReceta(SKU, [{ ingredienteId: naranja.id, cantidad: 400 }]);

    await pedidoPagado(SKU, 3, PRECIO_VENTA);

    const { desde, hasta } = semanaDe(new Date());
    const lista = await listaDeCompra(desde, hasta);

    expect(lista.lineas).toHaveLength(1);
    expect(lista.lineas[0].cantidadConfirmada).toBe(1200);
    expect(lista.lineas[0].costoEstimado).toBe(12000);
  });

  it("separa lo confirmado de lo pendiente", async () => {
    const naranja = await conPrecio("Naranja", 10);
    await guardarReceta(SKU, [{ ingredienteId: naranja.id, cantidad: 100 }]);

    await pedidoPagado(SKU, 1, PRECIO_VENTA);

    const [p] = await db
      .insert(pedido)
      .values({
        referencia: "ped_pend",
        total: PRECIO_VENTA,
        estado: "pendiente",
        nombreEntrega: "Beto",
        telefono: "099",
        direccion: "x",
      })
      .returning();

    await db.insert(pedidoItem).values({
      pedidoId: p.id,
      sku: SKU,
      descripcion: "Jugo",
      cantidad: 2,
      precioUnitario: PRECIO_VENTA,
      envaseUnitario: 2000,
      botellas: 2,
    });

    const { desde, hasta } = semanaDe(new Date());
    const lista = await listaDeCompra(desde, hasta);

    /*
     * Los pendientes se incluyen pero se muestran aparte: todavía pueden
     * concretarse, y quedarse corto de fruta es peor que comprar de más.
     */
    expect(lista.lineas[0].cantidadConfirmada).toBe(100);
    expect(lista.lineas[0].cantidadPendiente).toBe(200);
    expect(lista.lineas[0].cantidadTotal).toBe(300);
  });

  it("expande un pack fijo a los jugos que trae", async () => {
    const pack = PRODUCTOS.find(esPackFijo);
    if (!pack) return;

    const naranja = await conPrecio("Naranja", 10);

    // Receta para cada jugo del pack, ninguna para el pack en sí.
    for (const linea of pack.contenido) {
      await guardarReceta(linea.sku, [{ ingredienteId: naranja.id, cantidad: 100 }]);
    }

    await pedidoPagado(pack.variantes[0].sku, 1, pack.variantes[0].precio);

    const { desde, hasta } = semanaDe(new Date());
    const lista = await listaDeCompra(desde, hasta);

    /*
     * Sin la expansión, la lista de compra ignora todo lo vendido en packs — que
     * es buena parte de las ventas — y se produce de menos.
     */
    const botellas = pack.contenido.reduce((t, l) => t + l.cantidad, 0);
    expect(lista.lineas[0].cantidadConfirmada).toBe(botellas * 100);
  });

  it("avisa de los SKUs vendidos que no tienen receta", async () => {
    await pedidoPagado(SKU, 1, PRECIO_VENTA);

    const { desde, hasta } = semanaDe(new Date());
    const lista = await listaDeCompra(desde, hasta);

    // Sin avisar, la lista se vería correcta y faltaría comprar.
    expect(lista.skusSinReceta).toContain(SKU);
    expect(lista.lineas).toHaveLength(0);
  });

  it("avisa de los ingredientes sin precio", async () => {
    const sinPrecio = await crearIngrediente({ nombre: "Menta", unidad: "g" });
    await guardarReceta(SKU, [{ ingredienteId: sinPrecio.id, cantidad: 5 }]);

    await pedidoPagado(SKU, 1, PRECIO_VENTA);

    const { desde, hasta } = semanaDe(new Date());
    const lista = await listaDeCompra(desde, hasta);

    expect(lista.faltanPrecios).toEqual(["Menta"]);
    expect(lista.lineas[0].costoEstimado).toBeNull();
  });
});
