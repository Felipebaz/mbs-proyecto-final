import { describe, expect, it } from "vitest";
import { armarPack, opcionesPack } from "./pack-armable";
import { getProductos } from "./queries";
import { esPackArmable, precioTotal, type PackArmable } from "@/types/producto";

/**
 * armarPack es la función más importante del proyecto para testear: es la que
 * decide si lo que armó el cliente es legal. Todo lo demás muestra datos;
 * esta toma una decisión con plata de por medio.
 */

async function packArmable(): Promise<PackArmable> {
  const pack = (await getProductos()).find(esPackArmable);
  if (!pack) throw new Error("El catálogo no tiene ningún pack armable.");
  return pack;
}

describe("armarPack — happy path", () => {
  it("acepta una selección con la cantidad exacta de botellas", async () => {
    const pack = await packArmable();
    const resultado = armarPack(pack, "5", [
      { sku: "JV-330", cantidad: 2 },
      { sku: "JN-330", cantidad: 2 },
      { sku: "JR-330", cantidad: 1 },
    ]);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.pack.botellas).toBe(5);
    expect(resultado.pack.lineas).toHaveLength(3);
  });

  it("acepta las 5 botellas del mismo jugo", async () => {
    const pack = await packArmable();
    const resultado = armarPack(pack, "5", [{ sku: "JABC-330", cantidad: 5 }]);
    expect(resultado.ok).toBe(true);
  });

  it("el precio sale de la variante, no de lo que eligió el cliente", async () => {
    // Dos selecciones distintas, misma cantidad → mismo precio. Si esto
    // fallara, el cliente podría abaratar el pack eligiendo otros jugos.
    const pack = await packArmable();
    const a = armarPack(pack, "5", [{ sku: "JV-330", cantidad: 5 }]);
    const b = armarPack(pack, "5", [
      { sku: "JR-330", cantidad: 3 },
      { sku: "JABC-330", cantidad: 2 },
    ]);

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.pack.total).toBe(b.pack.total);
    expect(a.pack.total).toBe(precioTotal(pack.variantes.find((v) => v.id === "5")!));
  });

  it("armar el pack sale menos que comprar las botellas sueltas", async () => {
    const pack = await packArmable();
    const r = armarPack(pack, "5", [{ sku: "JV-330", cantidad: 5 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.ahorro).toBeGreaterThan(0);
    expect(r.pack.ahorro).toBe(r.pack.precioSuelto - r.pack.total);
  });
});

describe("armarPack — cantidades que no cierran", () => {
  it("rechaza si faltan botellas y dice cuántas", async () => {
    const pack = await packArmable();
    const r = armarPack(pack, "5", [{ sku: "JV-330", cantidad: 3 }]);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores.join(" ")).toContain("2");
  });

  it("rechaza si sobran botellas", async () => {
    const pack = await packArmable();
    const r = armarPack(pack, "4", [{ sku: "JV-330", cantidad: 6 }]);
    expect(r.ok).toBe(false);
  });

  it("rechaza una selección vacía", async () => {
    const pack = await packArmable();
    expect(armarPack(pack, "5", []).ok).toBe(false);
  });

  it("rechaza cantidad cero", async () => {
    const pack = await packArmable();
    const r = armarPack(pack, "5", [
      { sku: "JV-330", cantidad: 5 },
      { sku: "JN-330", cantidad: 0 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rechaza cantidad negativa: sumaría restando botellas", async () => {
    const pack = await packArmable();
    const r = armarPack(pack, "5", [
      { sku: "JV-330", cantidad: 7 },
      { sku: "JN-330", cantidad: -2 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rechaza cantidad decimal", async () => {
    const pack = await packArmable();
    const r = armarPack(pack, "5", [{ sku: "JV-330", cantidad: 2.5 }]);
    expect(r.ok).toBe(false);
  });
});

describe("armarPack — entradas inválidas", () => {
  it("rechaza un SKU que no existe en el catálogo", async () => {
    const pack = await packArmable();
    const r = armarPack(pack, "5", [{ sku: "NO-EXISTE", cantidad: 5 }]);
    expect(r.ok).toBe(false);
  });

  it("rechaza un SKU real pero no elegible para este pack", async () => {
    // El 910 existe, pero un pack es de botellas de 330.
    const pack = await packArmable();
    const r = armarPack(pack, "5", [{ sku: "JV-910", cantidad: 5 }]);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores.join(" ")).toContain("JV-910");
  });

  it("rechaza el mismo SKU repetido en dos líneas", async () => {
    const pack = await packArmable();
    const r = armarPack(pack, "5", [
      { sku: "JV-330", cantidad: 2 },
      { sku: "JV-330", cantidad: 3 },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rechaza un tamaño de pack inexistente y lista los válidos", async () => {
    const pack = await packArmable();
    const r = armarPack(pack, "99", [{ sku: "JV-330", cantidad: 5 }]);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores[0]).toContain("5");
  });

  it("acumula varios errores en vez de cortar en el primero", async () => {
    const pack = await packArmable();
    const r = armarPack(pack, "5", [
      { sku: "NO-EXISTE", cantidad: 1 },
      { sku: "JV-910", cantidad: 1 },
    ]);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores.length).toBeGreaterThan(1);
  });
});

describe("opcionesPack", () => {
  it("devuelve una opción por cada SKU elegible", async () => {
    const pack = await packArmable();
    expect(opcionesPack(pack)).toHaveLength(pack.skusElegibles.length);
  });

  it("arranca todo en cero: el cliente todavía no eligió nada", async () => {
    const pack = await packArmable();
    expect(opcionesPack(pack).every((o) => o.cantidad === 0)).toBe(true);
  });
});
