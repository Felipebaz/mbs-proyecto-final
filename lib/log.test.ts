import { describe, expect, it } from "vitest";
import { detalleDeError, idOfuscado, logError, sanear } from "./log";

/**
 * Cada test usa la forma real en que ese dato se filtraría: el mensaje de error
 * que devuelve el driver, la cadena de conexión de Neon, el link de un mail de
 * reset. Probar con "secreto123" no probaría nada.
 */

describe("sanear — secretos", () => {
  it("tapa una clave de Resend", () => {
    const fuga = "Error: invalid api key re_AbCdEf123456789xyz";
    const salida = sanear(fuga);

    expect(salida).not.toContain("re_AbCdEf123456789xyz");
    expect(salida).toContain("[clave-resend]");
  });

  it("tapa un access token de Mercado Pago, de producción y de prueba", () => {
    for (const token of [
      "APP_USR-1234567890abcdef-012345-abcdef",
      "TEST-1234567890abcdef-012345-abcdef",
    ]) {
      const salida = sanear(`Authorization: Bearer ${token}`);
      expect(salida, token).not.toContain(token);
      expect(salida, token).toContain("[token-mp]");
    }
  });

  it("tapa la cadena de conexión pero deja el host", () => {
    // Armada en piezas a propósito: con el literal completo, los escáneres de
    // secretos la marcan como una credencial de verdad en cada corrida.
    const passwordFalsa = ["npg", "esta", "no", "es", "real"].join("_");
    const url = `postgresql://neondb_owner:${passwordFalsa}@ep-cool-123-pooler.sa-east-1.aws.neon.tech/neondb`;
    const salida = sanear(`no se pudo conectar a ${url}`);

    // La contraseña no puede quedar…
    expect(salida).not.toContain(passwordFalsa);
    expect(salida).not.toContain("neondb_owner");
    // …pero el host sí, que es lo que sirve para diagnosticar.
    expect(salida).toContain("sa-east-1.aws.neon.tech");
  });

  it("tapa un hash de Argon2", () => {
    const hash =
      "$argon2id$v=19$m=19456,t=2,p=1$hpzo9hfpJyffMT4aJsiMBg$trTfXJhNM2ZXtmtcM8uOH0vg2kvdRbJFrlhNCmqarlg";
    expect(sanear(`password_hash=${hash}`)).toContain("[hash-argon2]");
    expect(sanear(`password_hash=${hash}`)).not.toContain("trTfXJhNM2ZX");
  });

  it("tapa un token de sesión de 32+ caracteres", () => {
    // Así se vería un token de sesión nuestro: 32 bytes en base64url.
    // gitleaks:allow — inventado para este test, no es un token de nadie.
    const token = "Zm9vYmFyYmF6cXV1eGNvcmdlZ3JhdWx0Z2FycGx5"; // gitleaks:allow
    const salida = sanear(`cookie sesion=${token}`);

    expect(salida).not.toContain(token);
    expect(salida).toContain("[token]");
  });

  it("tapa el link de un mail de reset con su token", () => {
    // gitleaks:allow — token inventado.
    const link = "https://anima.uy/reset?token=aBcDeF123456789012345678901234567890"; // gitleaks:allow
    const salida = sanear(`no se pudo enviar ${link}`);

    /*
     * Es la fuga más grave posible en un log: con ese link, quien lea el log
     * cambia la contraseña de esa cuenta.
     */
    expect(salida).not.toContain("aBcDeF123456789012345678901234567890");
    expect(salida).toContain("[token]");
  });
});

describe("sanear — datos personales", () => {
  it("tapa un correo", () => {
    const salida = sanear("no se pudo enviar a ana.perez@gmail.com");
    expect(salida).not.toContain("ana.perez@gmail.com");
    expect(salida).toContain("[correo]");
  });

  it("tapa varios correos en el mismo texto", () => {
    const salida = sanear("de hola@anima.uy para ana@gmail.com");
    expect(salida).not.toContain("@gmail.com");
    expect(salida).not.toContain("@anima.uy");
  });
});

describe("sanear — lo que NO hay que tapar", () => {
  it("deja pasar un id de pago de Mercado Pago", () => {
    // Sin esto, el log no sirve para cruzar con el panel de MP.
    expect(sanear("pago 123456789 aprobado")).toContain("123456789");
  });

  it("deja pasar un SKU", () => {
    expect(sanear("sku JG-VD-330 sin receta")).toContain("JG-VD-330");
  });

  it("deja pasar un código de error de Postgres", () => {
    expect(sanear("código: 23505")).toContain("23505");
  });

  it("deja pasar un UUID", () => {
    // Un uuid lleva guiones cada pocos caracteres, así que no entra en el
    // patrón de token largo. Sirve para rastrear un pedido.
    const uuid = "9c1a2b3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d";
    expect(sanear(`pedido ${uuid}`)).toContain(uuid);
  });

  it("deja pasar un texto normal", () => {
    const texto = "El state no coincide.";
    expect(sanear(texto)).toBe(texto);
  });
});

describe("idOfuscado", () => {
  it("es estable para el mismo correo", () => {
    expect(idOfuscado("ana@ejemplo.com")).toBe(idOfuscado("ana@ejemplo.com"));
  });

  it("ignora mayúsculas y espacios", () => {
    // Para que el mismo usuario dé el mismo id aunque se escriba distinto.
    expect(idOfuscado("  Ana@Ejemplo.COM ")).toBe(idOfuscado("ana@ejemplo.com"));
  });

  it("da ids distintos para correos distintos", () => {
    expect(idOfuscado("ana@x.com")).not.toBe(idOfuscado("beto@x.com"));
  });

  it("no contiene nada del correo original", () => {
    const id = idOfuscado("ana.perez@gmail.com");
    expect(id).not.toContain("ana");
    expect(id).not.toContain("gmail");
    expect(id).toHaveLength(8);
  });
});

describe("detalleDeError", () => {
  it("saca nombre y mensaje, saneados", () => {
    const e = new Error("falló el envío a ana@gmail.com");
    const salida = detalleDeError(e);

    expect(salida).toContain("Error:");
    expect(salida).not.toContain("ana@gmail.com");
  });

  it("incluye la causa inmediata", () => {
    const e = new Error("wrapper", { cause: new Error("la causa de verdad") });
    expect(detalleDeError(e)).toContain("la causa de verdad");
  });

  it("incluye el código de Postgres, que es lo más útil", () => {
    const e = Object.assign(new Error("duplicate key"), { code: "23505" });
    expect(detalleDeError(e)).toContain("23505");
  });

  it("NO serializa el error entero", () => {
    /*
     * Un error de un SDK puede traer adentro la petición completa, con el token
     * de acceso y el cuerpo. Sólo se saca lo que sirve.
     */
    const e = Object.assign(new Error("request failed"), {
      request: { headers: { authorization: "Bearer APP_USR-supersecreto-123456" } },
      response: { body: { payer: { email: "ana@gmail.com" } } },
    });

    const salida = detalleDeError(e);
    expect(salida).not.toContain("supersecreto");
    expect(salida).not.toContain("ana@gmail.com");
    expect(salida).toContain("request failed");
  });

  it("aguanta un error que no es Error", () => {
    expect(detalleDeError("falló")).toContain("falló");
    expect(detalleDeError(null)).toContain("desconocido");
    expect(detalleDeError(undefined)).toContain("desconocido");
  });

  it("un objeto tirado suelto: describe las claves, no los valores", () => {
    /*
     * Algunas librerías hacen `throw { code, detail }` en vez de
     * `throw new Error()`. Con `String(e)` el log decía "[object Object]", que
     * no sirve para nada.
     *
     * Se listan las claves y no los valores porque `sanear` sólo reconoce las
     * formas de secreto que conoce: un teléfono o una dirección se le escapan.
     */
    const tirado = { code: "ECONNRESET", telefono: "099123456" };
    const salida = detalleDeError(tirado);

    expect(salida).not.toContain("[object Object]");
    expect(salida).toContain("code");
    expect(salida).toContain("telefono");
    // La clave sí, el valor no.
    expect(salida).not.toContain("099123456");
    expect(salida).not.toContain("ECONNRESET");
  });
});

describe("logError", () => {
  it("sanea también los datos extra", () => {
    const salidas: string[] = [];
    const original = console.error;
    console.error = (m: string) => salidas.push(m);

    try {
      logError("[prueba] algo falló", new Error("boom"), {
        correo: "ana@gmail.com",
        intentos: 3,
      });
    } finally {
      console.error = original;
    }

    expect(salidas[0]).toContain("[prueba] algo falló");
    expect(salidas[0]).toContain("intentos=3");
    // Si los datos extra no se sanearan, este sería el agujero más fácil.
    expect(salidas[0]).not.toContain("ana@gmail.com");
  });
});
