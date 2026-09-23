import { describe, expect, it } from "vitest";
import { hashearPassword, verificarPassword } from "./password";

/**
 * Tests lentos a propósito: Argon2 está configurado para tardar. Si algún día
 * este archivo corre rápido, es que alguien bajó los parámetros.
 */
describe("hashearPassword", () => {
  it("produce un hash Argon2id con los parámetros de OWASP", async () => {
    const hash = await hashearPassword("una contraseña larga y tranquila");

    // m=19456 KiB (19 MiB), t=2, p=1. Si esto cambia sin querer, el test cae.
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it("nunca guarda la contraseña en claro", async () => {
    const plano = "MiContraseñaSuperSecreta2026";
    const hash = await hashearPassword(plano);

    expect(hash).not.toContain(plano);
  });

  it("dos veces la misma contraseña da hashes distintos (salt aleatorio)", async () => {
    const plano = "la misma contraseña de siempre";
    const a = await hashearPassword(plano);
    const b = await hashearPassword(plano);

    // Sin salt por hash, dos clientes con la misma contraseña tendrían la misma
    // fila y una rainbow table los rompe a los dos juntos.
    expect(a).not.toBe(b);
    expect(await verificarPassword(a, plano)).toBe(true);
    expect(await verificarPassword(b, plano)).toBe(true);
  });
});

describe("verificarPassword", () => {
  it("acepta la correcta y rechaza la incorrecta", async () => {
    const hash = await hashearPassword("contraseña verdadera 123");

    expect(await verificarPassword(hash, "contraseña verdadera 123")).toBe(true);
    expect(await verificarPassword(hash, "contraseña verdadera 124")).toBe(false);
    expect(await verificarPassword(hash, "")).toBe(false);
  });

  it("con hash null devuelve false, no rompe", async () => {
    // Pasa cuando el usuario no existe, o cuando entra sólo por Google.
    expect(await verificarPassword(null, "lo que sea")).toBe(false);
  });

  it("con un hash corrupto devuelve false en vez de tirar", async () => {
    // Un 500 con stack trace acá le contaría al atacante cómo guardamos esto.
    expect(await verificarPassword("no soy un hash", "lo que sea")).toBe(false);
  });

  it("tarda parecido exista o no el usuario", async () => {
    const hash = await hashearPassword("contraseña de alguien real");

    const medir = async (fn: () => Promise<unknown>) => {
      const t = performance.now();
      await fn();
      return performance.now() - t;
    };

    // Descarta la primera medición: el señuelo se calcula una sola vez y la
    // primera llamada paga ese hash extra.
    await verificarPassword(null, "x");

    const existente = await medir(() => verificarPassword(hash, "incorrecta"));
    const inexistente = await medir(() => verificarPassword(null, "incorrecta"));

    /*
     * Sin el hash señuelo, "usuario inexistente" volvería en microsegundos y
     * "contraseña incorrecta" en decenas de milisegundos: esa diferencia le
     * dice a cualquiera qué correos son clientes nuestros, que es justo lo que
     * el mensaje de error genérico intenta esconder.
     *
     * Margen ancho porque es una medición de tiempo en CI compartido: lo que
     * se quiere detectar es un orden de magnitud, no un 20%.
     */
    const ratio = Math.max(existente, inexistente) / Math.min(existente, inexistente);
    expect(ratio).toBeLessThan(5);
  });
});
