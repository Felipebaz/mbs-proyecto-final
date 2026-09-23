import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

/**
 * Bitácora contra Postgres real (PGlite).
 *
 * El test central es el de inmutabilidad: una bitácora que se puede editar o
 * borrar no es evidencia de nada.
 */

const entorno = await (await import("@/lib/db/prueba")).baseDePrueba();
vi.mock("@/lib/db/cliente", () => ({ db: entorno.db }));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-forwarded-for": "203.0.113.7", "user-agent": "Prueba/1.0" }),
}));

const { auditoria, usuario } = await import("@/lib/db/esquema");
const { registrar, leerAuditoria } = await import("./auditoria");

const db = entorno.db;

async function crearAdmin(email: string) {
  const [u] = await db
    .insert(usuario)
    .values({ email, rol: "admin" })
    .returning();
  return u;
}

/** Recorre la cadena de `cause`: Drizzle envuelve el error del driver. */
async function violacion(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    let texto = "";
    let actual: unknown = e;
    while (actual instanceof Error) {
      texto += ` ${actual.message}`;
      actual = actual.cause;
    }
    return texto;
  }
  throw new Error("Se esperaba que la base rechazara esto, y lo aceptó.");
}

beforeEach(async () => {
  // La bitácora no se puede borrar con DELETE (ese es el punto), así que se
  // vacía con TRUNCATE, que no dispara el trigger de fila.
  await db.execute(sql`truncate table auditoria`);
  await db.delete(usuario);
});

afterAll(async () => {
  await entorno.cerrar();
});

describe("registrar", () => {
  it("guarda quién, qué, cuándo y desde dónde", async () => {
    const jefa = await crearAdmin("jefa@ejemplo.com");

    await registrar(jefa, {
      accion: "precio_cambiado",
      objetivo: "JG-VD-330",
      detalle: { antes: 56000, despues: 58000 },
    });

    const [fila] = await db.select().from(auditoria);

    expect(fila.usuarioId).toBe(jefa.id);
    expect(fila.accion).toBe("precio_cambiado");
    expect(fila.objetivo).toBe("JG-VD-330");
    expect(fila.detalle).toEqual({ antes: 56000, despues: 58000 });
    expect(fila.ip).toBe("203.0.113.7");
    expect(fila.ocurridoEn).toBeInstanceOf(Date);
  });

  it("el registro sobrevive intacto al borrado del usuario", async () => {
    const jefa = await crearAdmin("jefa@ejemplo.com");
    await registrar(jefa, { accion: "datos_exportados" });

    await db.delete(usuario).where(eq(usuario.id, jefa.id));

    const [fila] = await db.select().from(auditoria);

    /*
     * Sin foreign key, borrar al usuario no toca esta fila: queda el id
     * —ahora colgado, apuntando a nadie— y el correo copiado al lado.
     *
     * Es lo que se quiere de una bitácora: el registro sobrevive intacto a que
     * se borre el autor. Con `cascade` se habría borrado el rastro; con
     * `set null` el borrado del usuario sería imposible, porque el UPDATE
     * interno choca contra el trigger de sólo-inserción.
     */
    expect(fila.usuarioId).toBe(jefa.id);
    expect(fila.usuarioEmail).toBe("jefa@ejemplo.com");
    expect(fila.accion).toBe("datos_exportados");
  });

  it("NO tira si falla escribir", async () => {
    const inexistente = {
      id: "00000000-0000-0000-0000-000000000000",
      email: "fantasma@ejemplo.com",
    };

    /*
     * Que no se pueda cambiar el estado de un pedido porque la bitácora está
     * caída sería peor que perder una línea de bitácora. La contracara es que
     * el fallo queda sólo en el log, por eso ahí el mensaje es ruidoso.
     */
    await expect(
      registrar(inexistente, { accion: "pedido_estado_cambiado" }),
    ).resolves.toBeUndefined();
  });

  it("rechaza una acción que no está en la lista", async () => {
    const jefa = await crearAdmin("jefa@ejemplo.com");

    const mensaje = await violacion(
      db.insert(auditoria).values({
        usuarioId: jefa.id,
        accion: "borrar_todo" as "datos_exportados",
      }),
    );

    expect(mensaje).toMatch(/auditoria_accion/);
  });
});

describe("inmutabilidad", () => {
  it("NO se puede modificar una fila", async () => {
    const jefa = await crearAdmin("jefa@ejemplo.com");
    await registrar(jefa, { accion: "precio_cambiado", objetivo: "JG-VD-330" });

    const [fila] = await db.select().from(auditoria);

    /*
     * Sin el trigger, quien tenga las credenciales de la aplicación puede
     * reescribir el rastro de lo que hizo — que es exactamente lo que haría
     * alguien que no quiere que se vea.
     */
    const mensaje = await violacion(
      db
        .update(auditoria)
        .set({ objetivo: "OTRO-SKU" })
        .where(eq(auditoria.id, fila.id)),
    );

    expect(mensaje).toMatch(/solo-insercion/);

    const [sinTocar] = await db.select().from(auditoria);
    expect(sinTocar.objetivo).toBe("JG-VD-330");
  });

  it("NO se puede borrar una fila", async () => {
    const jefa = await crearAdmin("jefa@ejemplo.com");
    await registrar(jefa, { accion: "datos_exportados" });

    const mensaje = await violacion(db.delete(auditoria));

    expect(mensaje).toMatch(/solo-insercion/);
    expect(await db.select().from(auditoria)).toHaveLength(1);
  });
});

describe("leerAuditoria", () => {
  it("devuelve lo más nuevo primero", async () => {
    const jefa = await crearAdmin("jefa@ejemplo.com");

    await registrar(jefa, { accion: "precio_cambiado", objetivo: "primero" });
    await new Promise((r) => setTimeout(r, 5));
    await registrar(jefa, { accion: "precio_cambiado", objetivo: "segundo" });

    const filas = await leerAuditoria();
    expect(filas[0].objetivo).toBe("segundo");
  });

  it("topea el límite aunque se pida más", async () => {
    const jefa = await crearAdmin("jefa@ejemplo.com");
    await registrar(jefa, { accion: "datos_exportados" });

    // Sin tope, una consulta al panel podría traerse la tabla entera a memoria.
    const filas = await leerAuditoria({ limite: 99_999 });
    expect(filas.length).toBeLessThanOrEqual(500);
  });

  it("filtra por usuario", async () => {
    const jefa = await crearAdmin("jefa@ejemplo.com");
    const otro = await crearAdmin("otro@ejemplo.com");

    await registrar(jefa, { accion: "datos_exportados" });
    await registrar(otro, { accion: "datos_exportados" });

    const filas = await leerAuditoria({ usuarioId: jefa.id });
    expect(filas).toHaveLength(1);
    expect(filas[0].usuarioId).toBe(jefa.id);
  });
});
