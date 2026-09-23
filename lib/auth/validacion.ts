import { z } from "zod";

/**
 * Esquemas de entrada. Todo lo que llega del navegador —FormData, query,
 * headers— es texto que escribió un desconocido hasta que pasa por acá.
 */

export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254) // RFC 5321
  .pipe(z.email({ message: "Ese correo no parece válido." }));

/**
 * Largo mínimo 12 y nada de reglas de composición.
 *
 * NIST 800-63B desaconseja exigir mayúscula + número + símbolo: empuja a la
 * gente a "Password1!" y a repetir la misma clave en todos lados. El largo es
 * lo que realmente cuesta romper.
 *
 * Máximo 128: Argon2 no trunca, pero sin tope alguien manda 10 MB y nos hace
 * gastar 10 MB de hashing por request.
 */
export const Password = z
  .string()
  .min(12, { message: "Al menos 12 caracteres." })
  .max(128, { message: "Máximo 128 caracteres." });

export const RegistroSchema = z.object({
  nombre: z.string().trim().min(2, { message: "¿Cómo te llamás?" }).max(80),
  email: Email,
  password: Password,
});

export const LoginSchema = z.object({
  email: Email,
  password: z.string().min(1, { message: "Escribí tu contraseña." }).max(128),
});

export const RecuperarSchema = z.object({
  email: Email,
});

export const ResetSchema = z.object({
  // El token viaja en la URL. Se acota el largo para no pasarle a sha256 un
  // megabyte que alguien mandó a mano.
  token: z.string().trim().min(10).max(200),
  password: Password,
});

export const ReenviarSchema = z.object({
  email: Email,
});

/**
 * Datos de entrega del checkout.
 *
 * Todo lo que llega acá es texto que escribió alguien: se acota el largo para
 * que nadie guarde un megabyte en la columna "notas", y se recorta el espacio
 * en blanco para que " " no pase como dirección.
 */
export const EntregaSchema = z.object({
  nombre: z.string().trim().min(2, { message: "¿A nombre de quién?" }).max(80),
  telefono: z
    .string()
    .trim()
    .min(8, { message: "Un teléfono con al menos 8 dígitos." })
    .max(20)
    .regex(/^[\d\s+()-]+$/, { message: "Sólo números y + ( ) -" }),
  direccion: z
    .string()
    .trim()
    .min(8, { message: "Calle, número y apartamento si tenés." })
    .max(300),
  notas: z.string().trim().max(500).optional(),
  devueltas: z.coerce.number().int().min(0).max(200).default(0),
});

export const AgregarSchema = z.object({
  sku: z.string().trim().min(1).max(40),
  cantidad: z.coerce.number().int().min(1).max(50),
  configuracion: z.array(z.string().max(40)).max(14).optional(),
});

export const ActualizarSchema = z.object({
  sku: z.string().trim().min(1).max(40),
  huella: z.string().max(400).default(""),
  cantidad: z.coerce.number().int().min(0).max(50),
});
