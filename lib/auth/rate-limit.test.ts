import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumir, liberar, LIMITES, verificarConfiguracion, _test } from "./rate-limit";

/**
 * Estos tests corren contra el limitador en memoria: no hay credenciales de
 * Upstash en el entorno de test, y `consumir` cae solo a memoria cuando faltan.
 *
 * Lo que se verifica acá es la política —cuántos intentos, por cuánto tiempo,
 * qué claves se aíslan entre sí—, que es la misma en las dos implementaciones.
 */

beforeEach(() => {
  _test.reiniciar();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("consumir", () => {
  it("usa memoria cuando no hay credenciales de Upstash", () => {
    expect(_test.hayUpstash()).toBe(false);
  });

  it("deja pasar hasta el máximo y después corta", async () => {
    const max = LIMITES.loginPorCuenta.maximo;

    for (let i = 0; i < max; i++) {
      expect((await consumir("loginPorCuenta", "ana@x.com")).permitido).toBe(true);
    }
    expect((await consumir("loginPorCuenta", "ana@x.com")).permitido).toBe(false);
  });

  it("cuenta cada identificador por separado", async () => {
    for (let i = 0; i < LIMITES.loginPorCuenta.maximo; i++) {
      await consumir("loginPorCuenta", "ana@x.com");
    }

    expect((await consumir("loginPorCuenta", "ana@x.com")).permitido).toBe(false);
    // Que a Ana la bloqueen no puede dejar afuera a Beto.
    expect((await consumir("loginPorCuenta", "beto@x.com")).permitido).toBe(true);
  });

  it("cada límite lleva su propio contador", async () => {
    for (let i = 0; i < LIMITES.loginPorCuenta.maximo; i++) {
      await consumir("loginPorCuenta", "ana@x.com");
    }
    expect((await consumir("loginPorCuenta", "ana@x.com")).permitido).toBe(false);

    // Gastar los intentos de login no puede consumir los de reset: son ataques
    // distintos y se cuentan aparte.
    expect((await consumir("resetPorCuenta", "ana@x.com")).permitido).toBe(true);
  });

  it("dice cuánto falta para reintentar", async () => {
    for (let i = 0; i < LIMITES.resetPorCuenta.maximo; i++) {
      await consumir("resetPorCuenta", "ana@x.com");
    }

    const r = await consumir("resetPorCuenta", "ana@x.com");
    expect(r.permitido).toBe(false);
    expect(r.esperaSegundos).toBeGreaterThan(0);
    expect(r.esperaSegundos).toBeLessThanOrEqual(
      LIMITES.resetPorCuenta.ventanaMs / 1000,
    );
  });

  it("se libera sola cuando pasa la ventana", async () => {
    vi.useFakeTimers();

    for (let i = 0; i < LIMITES.loginPorCuenta.maximo; i++) {
      await consumir("loginPorCuenta", "ana@x.com");
    }
    expect((await consumir("loginPorCuenta", "ana@x.com")).permitido).toBe(false);

    vi.advanceTimersByTime(LIMITES.loginPorCuenta.ventanaMs + 1000);
    expect((await consumir("loginPorCuenta", "ana@x.com")).permitido).toBe(true);
  });
});

describe("liberar", () => {
  it("borra el contador tras un login exitoso", async () => {
    for (let i = 0; i < LIMITES.loginPorCuenta.maximo; i++) {
      await consumir("loginPorCuenta", "ana@x.com");
    }
    expect((await consumir("loginPorCuenta", "ana@x.com")).permitido).toBe(false);

    // Si entró bien, los intentos fallidos de antes no cuentan más.
    await liberar("loginPorCuenta", "ana@x.com");
    expect((await consumir("loginPorCuenta", "ana@x.com")).permitido).toBe(true);
  });
});

describe("LIMITES", () => {
  it("el de cuenta es más apretado que el de IP", () => {
    /*
     * Es lo que frena el credential stuffing. El de IP tiene que ser generoso
     * porque atrás de un NAT hay muchas personas legítimas; el de cuenta tiene
     * que ser bajo porque nadie escribe mal su contraseña veinte veces.
     */
    expect(LIMITES.loginPorCuenta.maximo).toBeLessThan(LIMITES.loginPorIp.maximo);
    expect(LIMITES.resetPorCuenta.maximo).toBeLessThan(LIMITES.resetPorIp.maximo);
  });

  it("todos tienen ventana y máximo razonables", () => {
    for (const [nombre, limite] of Object.entries(LIMITES)) {
      expect(limite.maximo, nombre).toBeGreaterThan(0);
      expect(limite.ventanaMs, nombre).toBeGreaterThanOrEqual(60_000);
    }
  });
});

describe("verificarConfiguracion", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("en producción exige Upstash", () => {
    // `vi.stubEnv` y no `Object.defineProperty`: `process.env` rechaza
    // descriptores de propiedad en Node.
    vi.stubEnv("NODE_ENV", "production");

    /*
     * Sin esto, producción se queda con el limitador en memoria y nadie se
     * entera: parece que hay rate limit y no lo hay. Es por instancia y se
     * reinicia en cada deploy, así que en serverless prácticamente no limita.
     */
    expect(() => verificarConfiguracion()).toThrow(/UPSTASH/);
  });

  it("fuera de producción no exige nada", () => {
    expect(() => verificarConfiguracion()).not.toThrow();
  });
});
