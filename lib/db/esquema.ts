import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Esquema de auth y carrito.
 *
 * Regla que atraviesa todo el archivo: acá no vive ni un precio. Los precios
 * salen del catálogo en cada cálculo (`lib/catalogo`). Si se guardara el precio
 * en la línea del carrito, bastaría con que el cliente mande uno para comprar
 * un pack de $2.400 por $1. Lo único que el navegador elige es SKU y cantidad.
 */

/* ------------------------------------------------------------- identidad */

export const usuario = pgTable("usuario", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Siempre en minúsculas: se normaliza al escribir. La alternativa era el tipo
  // `citext`, pero eso obliga a un CREATE EXTENSION y ata el esquema a Postgres.
  email: text("email").notNull().unique(),

  // Google nos dice si verificó el mail. Con registro por contraseña arranca en
  // false hasta que el usuario confirme. Importa para vincular cuentas: ver
  // `lib/auth/google.ts`.
  emailVerificado: boolean("email_verificado").notNull().default(false),

  nombre: text("nombre"),

  // NULL = usuario que solo entra por Google y nunca definió contraseña.
  // Nunca se expone fuera de `lib/auth/password.ts`.
  passwordHash: text("password_hash"),

  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // El código normaliza a minúsculas antes de escribir. Esto lo hace cumplir
  // igual si alguien inserta a mano o si mañana aparece otro camino de
  // escritura: dos filas "Ana@x.com" y "ana@x.com" serían dos cuentas para la
  // misma persona y el UNIQUE no las vería.
  check("usuario_email_minusculas", sql`${t.email} = lower(${t.email})`),
]);

export const cuentaOauth = pgTable(
  "cuenta_oauth",
  {
    proveedor: text("proveedor").notNull(), // 'google'

    // El `sub` del id_token, NO el email. El mail de una cuenta Google puede
    // cambiar; el sub no. Indexar por mail haría que un cambio de mail rompa el
    // vínculo o —peor— lo reapunte a otra persona.
    proveedorUsuarioId: text("proveedor_usuario_id").notNull(),

    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuario.id, { onDelete: "cascade" }),

    creadaEn: timestamp("creada_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.proveedor, t.proveedorUsuarioId] }),
    index("cuenta_oauth_usuario_idx").on(t.usuarioId),
  ],
);

/* -------------------------------------------------------------- sesiones */

export const sesion = pgTable(
  "sesion",
  {
    // sha256(token) en hex. El token en claro sólo existe en la cookie del
    // navegador: si se filtra esta tabla, lo que hay son hashes que no se
    // pueden revertir a tokens usables.
    //
    // Es PK a propósito: validar una sesión tiene que ser un único lookup por
    // índice primario, porque corre en cada request.
    id: text("id").primaryKey(),

    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuario.id, { onDelete: "cascade" }),

    // La autoridad de vencimiento es esta columna, nunca el Max-Age de la
    // cookie: la cookie la controla el cliente.
    expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),

    creadaEn: timestamp("creada_en", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Para que el usuario pueda ver y cerrar sesiones, y para investigar abusos.
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    // Cerrar todas las sesiones de un usuario (cambio de contraseña) tiene que
    // ser barato.
    index("sesion_usuario_idx").on(t.usuarioId),
    index("sesion_expira_idx").on(t.expiraEn),
  ],
);

/* -------------------------------------------------------------- carrito */

export const carrito = pgTable(
  "carrito",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Exactamente una de las dos está seteada. Anónimo: cookieId. Logueado:
    // usuarioId. Al loguearse, el anónimo se funde en el del usuario y se borra.
    usuarioId: uuid("usuario_id")
      .references(() => usuario.id, { onDelete: "cascade" })
      .unique(),

    // sha256 del token de carrito anónimo, mismo criterio que la sesión.
    cookieId: text("cookie_id").unique(),

    actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("carrito_actualizado_idx").on(t.actualizadoEn),
    // Exactamente uno de los dos. Un carrito con ambos sería de dos personas a
    // la vez; uno sin ninguno es una fila huérfana que nadie puede recuperar.
    check(
      "carrito_un_solo_dueno",
      sql`(${t.usuarioId} is null) != (${t.cookieId} is null)`,
    ),
  ],
);

export const carritoLinea = pgTable(
  "carrito_linea",
  {
    carritoId: uuid("carrito_id")
      .notNull()
      .references(() => carrito.id, { onDelete: "cascade" }),

    // Identifica producto + variante de una sola vez: `validarCatalogo()`
    // garantiza que un SKU no se repite entre productos.
    sku: text("sku").notNull(),

    // Para packs armables: los SKUs que eligió el cliente. NULL en el resto.
    configuracion: jsonb("configuracion").$type<string[] | null>(),

    // sha256 de `configuracion` normalizada, '' cuando es NULL. Existe sólo
    // para poder poner la clave primaria acá: dos packs armables del mismo SKU
    // con contenido distinto son dos líneas, con el mismo contenido son una.
    huella: text("huella").notNull().default(""),

    // smallint + tope en la capa de dominio: `cantidad` viene del navegador.
    cantidad: smallint("cantidad").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.carritoId, t.sku, t.huella] }),
    // El tope real lo pone `sanearCantidad`, pero esto es la última red: si un
    // día aparece un camino de escritura que no pasa por ahí, la base lo frena.
    check("carrito_linea_cantidad", sql`${t.cantidad} between 1 and 50`),
  ],
);

export type Usuario = typeof usuario.$inferSelect;
export type Sesion = typeof sesion.$inferSelect;
export type CarritoLinea = typeof carritoLinea.$inferSelect;
