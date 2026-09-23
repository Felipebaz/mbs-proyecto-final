import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
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

/** Roles. Se amplía acá y en el CHECK de la tabla, nunca sólo en el tipo. */
export const ROLES = ["cliente", "admin"] as const;
export type Rol = (typeof ROLES)[number];

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

  /*
   * Arranca siempre en 'cliente' y NINGÚN formulario ni server action lo toca.
   *
   * Es la regla que sostiene todo el panel: si un campo `rol` llegara desde un
   * formulario, cualquiera se haría admin mandando el POST a mano. Se cambia
   * sólo desde `npm run admin:promover`, que corre contra la base y exige
   * acceso a las credenciales de producción.
   */
  rol: text("rol").$type<Rol>().notNull().default("cliente"),

  /*
   * Secreto TOTP, CIFRADO con AES-256-GCM (ver lib/auth/cifrado.ts).
   *
   * A diferencia de una contraseña, esto no se puede hashear: el servidor
   * necesita el valor original para calcular el código de 6 dígitos. Por eso
   * se cifra: si se filtra la base, sin la clave —que vive en el entorno, no
   * en la base— los secretos no sirven para generar códigos.
   */
  totpSecreto: text("totp_secreto"),

  /** NULL = no terminó de activar el segundo factor. */
  totpActivadoEn: timestamp("totp_activado_en", { withTimezone: true }),

  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // El código normaliza a minúsculas antes de escribir. Esto lo hace cumplir
  // igual si alguien inserta a mano o si mañana aparece otro camino de
  // escritura: dos filas "Ana@x.com" y "ana@x.com" serían dos cuentas para la
  // misma persona y el UNIQUE no las vería.
  check("usuario_email_minusculas", sql`${t.email} = lower(${t.email})`),
  // Última red: un UPDATE a mano con un rol inventado no entra.
  check("usuario_rol", sql`${t.rol} in ('cliente', 'admin')`),
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

    /**
     * Cuándo pasó el segundo factor en ESTA sesión. NULL = no lo pasó.
     *
     * Vive en la sesión y no en el usuario a propósito: el segundo factor
     * prueba quién sos en este dispositivo, ahora. Si viviera en el usuario,
     * validarlo una vez dejaría entrar a todas las sesiones, incluida la que
     * abrió el que te robó la contraseña.
     */
    factor2En: timestamp("factor2_en", { withTimezone: true }),

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

/* ------------------------------------------------- tokens de correo */

/** Los dos motivos por los que hoy se manda un link con token. */
export const TIPOS_TOKEN = ["verificacion", "reset"] as const;
export type TipoToken = (typeof TIPOS_TOKEN)[number];

export const tokenCorreo = pgTable(
  "token_correo",
  {
    // sha256(token) en hex, igual que en `sesion`. El token en claro sólo
    // existe dentro del mail: si se filtra esta tabla, lo que hay son hashes
    // que no se pueden revertir a un link usable.
    id: text("id").primaryKey(),

    tipo: text("tipo").$type<TipoToken>().notNull(),

    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuario.id, { onDelete: "cascade" }),

    expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),

    // NULL = sin usar. No se borra la fila al consumirlo: queda como registro
    // de que ese token ya se gastó, y reusarlo falla de forma explícita.
    usadoEn: timestamp("usado_en", { withTimezone: true }),

    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Invalidar todos los tokens de reset de un usuario tiene que ser barato:
    // se hace en cada cambio de contraseña.
    index("token_correo_usuario_idx").on(t.usuarioId, t.tipo),
    index("token_correo_expira_idx").on(t.expiraEn),
    check(
      "token_correo_tipo",
      sql`${t.tipo} in ('verificacion', 'reset')`,
    ),
  ],
);

export type TokenCorreo = typeof tokenCorreo.$inferSelect;

/* --------------------------------------------------------------- pedidos */

/** De dónde salió el pedido. 'manual' es el que carga el admin por WhatsApp. */
export const ORIGENES_PEDIDO = ["web", "manual"] as const;
export type OrigenPedido = (typeof ORIGENES_PEDIDO)[number];

/**
 * Estados del pedido.
 *
 * `pendiente` es el estado inicial: el pedido existe pero nadie pagó. Sólo el
 * webhook, después de consultarle a Mercado Pago, puede moverlo a `pagado`.
 * La página de retorno del cliente NO puede: cualquiera puede abrir esa URL.
 */
export const ESTADOS_PEDIDO = [
  "pendiente",
  "pagado",
  "rechazado",
  "cancelado",
  "reembolsado",
  "entregado",
] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const pedido = pgTable(
  "pedido",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Lo que viaja a Mercado Pago como `external_reference` y vuelve en la
     * notificación. Es público —aparece en URLs y en el panel de MP—, así que
     * es un id aleatorio y no un número correlativo: con `pedido-3` cualquiera
     * deduce cuántas ventas hubo y prueba `pedido-4`.
     */
    referencia: text("referencia").notNull().unique(),

    // NULL para pedidos manuales de alguien sin cuenta.
    usuarioId: uuid("usuario_id").references(() => usuario.id, {
      onDelete: "set null",
    }),

    origen: text("origen").$type<OrigenPedido>().notNull().default("web"),
    estado: text("estado").$type<EstadoPedido>().notNull().default("pendiente"),

    /**
     * Total en centésimos, calculado por el servidor desde el catálogo.
     * Entero: en float, 1100.10 + 2200.20 no da lo que tiene que dar.
     */
    total: integer("total").notNull(),
    moneda: text("moneda").notNull().default("UYU"),

    // Datos de entrega. Se piden en el checkout y se guardan planos: si mañana
    // el cliente cambia su dirección, el pedido viejo tiene que seguir
    // diciendo a dónde se mandó.
    nombreEntrega: text("nombre_entrega").notNull(),
    telefono: text("telefono").notNull(),
    direccion: text("direccion").notNull(),
    notas: text("notas"),

    /** Botellas que el cliente devuelve. Descuenta envases. */
    botellasDevueltas: smallint("botellas_devueltas").notNull().default(0),

    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    pagadoEn: timestamp("pagado_en", { withTimezone: true }),
  },
  (t) => [
    index("pedido_usuario_idx").on(t.usuarioId),
    index("pedido_estado_idx").on(t.estado, t.creadoEn),
    check("pedido_total_no_negativo", sql`${t.total} >= 0`),
    check(
      "pedido_estado",
      sql`${t.estado} in ('pendiente','pagado','rechazado','cancelado','reembolsado','entregado')`,
    ),
    check("pedido_origen", sql`${t.origen} in ('web','manual')`),
  ],
);

/**
 * Las líneas del pedido, con el precio CONGELADO al momento de comprar.
 *
 * Es la diferencia con el carrito: el carrito recalcula desde el catálogo en
 * cada carga, el pedido no. Si mañana sube el jugo verde, un pedido de ayer
 * tiene que seguir diciendo lo que la persona pagó — para el reclamo, para la
 * contabilidad y para el cálculo de rentabilidad de la FASE 5.
 */
export const pedidoItem = pgTable(
  "pedido_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedido.id, { onDelete: "cascade" }),

    sku: text("sku").notNull(),
    /** Copia del nombre: si el producto se da de baja, el pedido sigue legible. */
    descripcion: text("descripcion").notNull(),

    cantidad: smallint("cantidad").notNull(),
    /** Precio unitario en centésimos, sin envase. Congelado. */
    precioUnitario: integer("precio_unitario").notNull(),
    /** Envase de UNA botella, en centésimos. Congelado. */
    envaseUnitario: integer("envase_unitario").notNull(),
    /** Botellas que aporta esta línea. Un pack de 5 aporta 5. */
    botellas: smallint("botellas").notNull(),

    /** Para packs armables: qué eligió el cliente. */
    configuracion: jsonb("configuracion").$type<string[] | null>(),
  },
  (t) => [
    index("pedido_item_pedido_idx").on(t.pedidoId),
    check("pedido_item_cantidad", sql`${t.cantidad} between 1 and 50`),
    check("pedido_item_precio", sql`${t.precioUnitario} >= 0`),
  ],
);

/**
 * Pagos de Mercado Pago.
 *
 * Una fila por id de pago de MP. El UNIQUE es lo que hace idempotente al
 * webhook: MP reintenta la misma notificación varias veces —y a veces manda
 * dos a la vez—, así que sin esto un pedido se marcaría pagado dos veces.
 */
export const pago = pgTable(
  "pago",
  {
    /** El id del pago en Mercado Pago. UNIQUE: es la clave de idempotencia. */
    idPagoMp: text("id_pago_mp").primaryKey(),

    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedido.id, { onDelete: "cascade" }),

    /** Estado crudo de MP: approved, pending, in_process, rejected, refunded... */
    estado: text("estado").notNull(),
    /** Detalle de MP, útil para entender un rechazo. */
    detalleEstado: text("detalle_estado"),

    /** En centésimos, para comparar contra `pedido.total` sin redondeos. */
    monto: integer("monto").notNull(),
    moneda: text("moneda").notNull(),

    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("pago_pedido_idx").on(t.pedidoId)],
);

/**
 * Bitácora de notificaciones recibidas.
 *
 * Se escribe ANTES de procesar y se responde 200 enseguida: Mercado Pago corta
 * a los 22 segundos y una notificación sin responder se reintenta. Además deja
 * rastro de los intentos con firma inválida, que es lo que se querría mirar si
 * alguien está probando el endpoint.
 */
export const eventoPago = pgTable(
  "evento_pago",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `x-request-id` de MP. Sirve para cruzar con su panel. */
    requestId: text("request_id"),
    tipo: text("tipo"),
    idPagoMp: text("id_pago_mp"),
    firmaValida: boolean("firma_valida").notNull(),
    /** Por qué se rechazó, cuando se rechazó. */
    motivoRechazo: text("motivo_rechazo"),
    procesadoEn: timestamp("procesado_en", { withTimezone: true }),
    recibidoEn: timestamp("recibido_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("evento_pago_recibido_idx").on(t.recibidoEn)],
);

export type Pedido = typeof pedido.$inferSelect;
export type PedidoItem = typeof pedidoItem.$inferSelect;
export type Pago = typeof pago.$inferSelect;

/* --------------------------------------------- códigos de respaldo 2FA */

/**
 * Códigos de un solo uso para entrar cuando no está el teléfono.
 *
 * Se guarda el sha256, igual que las sesiones: son aleatorios de 80 bits, así
 * que no hay nada que adivinar por fuerza bruta y Argon2 no agregaría nada.
 *
 * Sin esto, perder el teléfono es perder el acceso al negocio.
 */
export const codigoRespaldo = pgTable(
  "codigo_respaldo",
  {
    id: text("id").primaryKey(), // sha256(codigo)
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuario.id, { onDelete: "cascade" }),
    usadoEn: timestamp("usado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("codigo_respaldo_usuario_idx").on(t.usuarioId)],
);

/* ------------------------------------------------------------ auditoría */

/** Qué se registra. Se amplía acá y en el CHECK. */
export const ACCIONES_AUDITADAS = [
  "precio_cambiado",
  "pedido_estado_cambiado",
  "datos_exportados",
  "rol_cambiado",
  "2fa_activado",
  "2fa_desactivado",
  "login_admin",
] as const;
export type AccionAuditada = (typeof ACCIONES_AUDITADAS)[number];

/**
 * Bitácora de acciones sensibles. SÓLO INSERCIÓN.
 *
 * Una migración agrega un trigger que hace fallar cualquier UPDATE o DELETE.
 * Sin eso, quien tenga acceso a la base puede borrar el rastro de lo que hizo
 * —que es exactamente lo que haría alguien que no quiere que se vea—, y la
 * bitácora deja de servir como evidencia.
 */
export const auditoria = pgTable(
  "auditoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /*
     * SIN foreign key a propósito.
     *
     * Una bitácora inmutable no puede tener referencias a datos que cambian.
     * Con `on delete set null`, borrar un usuario dispara un UPDATE interno
     * sobre esta tabla — y el trigger de sólo-inserción lo rechaza, así que
     * el usuario no se puede borrar nunca más. Con `cascade` sería peor:
     * borrar al autor borraría el rastro de lo que hizo, que es justo lo que
     * haría alguien que no quiere que se vea.
     *
     * Entonces se guarda el id suelto, sin integridad referencial, y el correo
     * se copia al lado. Es desnormalización deliberada: lo normal en una
     * bitácora.
     */
    usuarioId: uuid("usuario_id"),

    /** Copia del correo al momento de la acción. Sobrevive al borrado. */
    usuarioEmail: text("usuario_email"),

    accion: text("accion").$type<AccionAuditada>().notNull(),

    /** Sobre qué: un id de pedido, un SKU. */
    objetivo: text("objetivo"),

    /** Detalle libre: valor anterior y nuevo, cuántas filas se exportaron. */
    detalle: jsonb("detalle").$type<Record<string, unknown> | null>(),

    ip: text("ip"),
    userAgent: text("user_agent"),

    ocurridoEn: timestamp("ocurrido_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("auditoria_ocurrido_idx").on(t.ocurridoEn),
    index("auditoria_usuario_idx").on(t.usuarioId, t.ocurridoEn),
    index("auditoria_accion_idx").on(t.accion, t.ocurridoEn),
    check(
      "auditoria_accion",
      sql`${t.accion} in ('precio_cambiado','pedido_estado_cambiado','datos_exportados','rol_cambiado','2fa_activado','2fa_desactivado','login_admin')`,
    ),
  ],
);

export type Auditoria = typeof auditoria.$inferSelect;

export type Usuario = typeof usuario.$inferSelect;
export type Sesion = typeof sesion.$inferSelect;
export type CarritoLinea = typeof carritoLinea.$inferSelect;
