import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cifrar, descifrar, igualesEnTiempoConstante } from "./cifrado";

const CLAVE = randomBytes(32).toString("base64");

beforeEach(() => {
  vi.stubEnv("CLAVE_CIFRADO", CLAVE);
});

describe("cifrar y descifrar", () => {
  it("da la vuelta completa", () => {
    const secreto = "JBSWY3DPEHPK3PXP";
    expect(descifrar(cifrar(secreto))).toBe(secreto);
  });

  it("el texto cifrado no contiene el original", () => {
    const secreto = "JBSWY3DPEHPK3PXP";
    expect(cifrar(secreto)).not.toContain(secreto);
  });

  it("dos veces lo mismo da textos distintos (IV aleatorio)", () => {
    const a = cifrar("mismo secreto");
    const b = cifrar("mismo secreto");

    /*
     * Con GCM, reusar un IV con la misma clave rompe la confidencialidad por
     * completo. Que dos cifrados del mismo texto difieran es la señal de que
     * el IV se está generando por llamada.
     */
    expect(a).not.toBe(b);
    expect(descifrar(a)).toBe(descifrar(b));
  });

  it("detecta que el texto cifrado fue manipulado", () => {
    const paquete = cifrar("JBSWY3DPEHPK3PXP");
    const [iv, cifrado, tag] = paquete.split(".");

    // Se cambia un byte del cuerpo dejando iv y tag intactos.
    const alterado = [iv, "X" + cifrado.slice(1), tag].join(".");

    /*
     * Esto es lo que aporta GCM sobre CBC: alguien que pueda escribir en la
     * base no puede modificar el secreto y hacer que el descifrado devuelva
     * otra cosa en silencio. Falla.
     */
    expect(() => descifrar(alterado)).toThrow();
  });

  it("detecta un tag de autenticación cambiado", () => {
    const [iv, cifrado] = cifrar("secreto").split(".");
    const tagFalso = randomBytes(16).toString("base64url");

    expect(() => descifrar([iv, cifrado, tagFalso].join("."))).toThrow();
  });

  it("no descifra con otra clave", () => {
    const paquete = cifrar("JBSWY3DPEHPK3PXP");

    vi.stubEnv("CLAVE_CIFRADO", randomBytes(32).toString("base64"));

    // Es el punto de cifrar: si se filtra la base pero no la clave, los
    // secretos no sirven para generar códigos.
    expect(() => descifrar(paquete)).toThrow();
  });

  it("rechaza un formato inválido", () => {
    expect(() => descifrar("no-tiene-puntos")).toThrow(/formato/i);
    expect(() => descifrar("a.b")).toThrow(/formato/i);
  });

  it("anda con texto largo y con acentos", () => {
    const texto = "ñandú ✓ ".repeat(200);
    expect(descifrar(cifrar(texto))).toBe(texto);
  });
});

describe("validación de la clave", () => {
  it("exige que exista", () => {
    vi.stubEnv("CLAVE_CIFRADO", "");
    expect(() => cifrar("x")).toThrow(/CLAVE_CIFRADO/);
  });

  it("exige 32 bytes: una clave corta es cifrado débil en silencio", () => {
    vi.stubEnv("CLAVE_CIFRADO", randomBytes(16).toString("base64"));
    expect(() => cifrar("x")).toThrow(/32/);
  });
});

describe("igualesEnTiempoConstante", () => {
  it("compara bien", () => {
    expect(igualesEnTiempoConstante("123456", "123456")).toBe(true);
    expect(igualesEnTiempoConstante("123456", "123457")).toBe(false);
  });

  it("largos distintos dan false sin tirar", () => {
    // `timingSafeEqual` tira si los largos difieren; el largo en sí no es
    // secreto, así que se compara antes.
    expect(igualesEnTiempoConstante("123", "123456")).toBe(false);
    expect(igualesEnTiempoConstante("", "x")).toBe(false);
  });
});
