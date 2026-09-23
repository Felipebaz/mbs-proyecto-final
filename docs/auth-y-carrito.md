# Seguridad, auth y panel

Cómo levantar esto, qué decisiones hay detrás y qué falta.

> El nombre del archivo quedó de cuando sólo cubría auth y carrito. Hoy cubre
> todo: pagos, panel, segundo factor y operación.

## Puesta en marcha

### 1. Base de datos — Neon

Crear un proyecto en [Neon](https://neon.tech), **región São Paulo
(`sa-east-1`)**: la sesión se valida contra la base en cada request, así que la
latencia servidor→DB se paga siempre.

```
Montevideo → São Paulo   ~30-40ms
Montevideo → Virginia    ~120-150ms
```

Copiar la connection string **con `-pooler` en el host**.

### 2. Upstash Redis

[console.upstash.com](https://console.upstash.com) → Redis → Create Database,
también en São Paulo. De la pestaña **REST API** salen las dos variables.

En producción son obligatorias: sin ellas la app **no arranca**.

### 3. Google OAuth

`console.cloud.google.com` → APIs & Services → Credentials → OAuth client ID →
Web application. La redirect URI va **exactamente igual** que `GOOGLE_REDIRECT_URI`.

### 4. Resend

[resend.com](https://resend.com) → Domains → Add Domain, y cargar SPF, DKIM y
DMARC. Sin eso los mails rebotan o caen en spam.

### 5. Mercado Pago

`mercadopago.com.uy/developers` → Tus integraciones → tu aplicación.
**Credenciales** da `MP_ACCESS_TOKEN`; **Webhooks** da `MP_WEBHOOK_SECRET` (son
cosas distintas, se confunden seguido) y es donde se configura la URL:

```
https://TU-DOMINIO/api/webhooks/mercadopago
```

### 6. Claves generadas

```bash
cp .env.example .env.local

# CRON_SECRET y CLAVE_CIFRADO
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 7. Migrar, levantar, promoverse

```bash
npm run db:migrate
npm run dev
npm run admin:promover -- tu@correo.com
```

Entrás a `/admin`, activás el segundo factor, y guardás los 8 códigos de
respaldo. **Esa es la única vez que se ven.**

Después: cargar ingredientes con precio → cargar recetas. Recién ahí la
rentabilidad y la lista de compra dicen algo.

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `lib/db/esquema.ts` | Todas las tablas. Ni un precio de venta vive acá |
| `lib/db/cliente.ts` | Conexión Neon, lazy (el build no necesita base) |
| `lib/auth/password.ts` | Argon2id + hash señuelo contra timing |
| `lib/auth/sesion.ts` | Token opaco, cookie, ciclo de vida, 2FA por sesión |
| `lib/auth/tokens.ts` | Tokens de un solo uso para verificación y reset |
| `lib/auth/totp.ts` | Segundo factor y códigos de respaldo |
| `lib/auth/cifrado.ts` | AES-256-GCM para el secreto TOTP |
| `lib/auth/dal.ts` | Único lugar que decide quién sos y qué podés |
| `lib/auth/google.ts` | OAuth: PKCE, state, vinculación segura |
| `lib/auth/rate-limit.ts` | Upstash, con memoria como respaldo local |
| `lib/email/` | Proveedor detrás de una interfaz; Resend, consola, falso |
| `lib/carrito/` | Cálculo puro + persistencia; precios del catálogo |
| `lib/pagos/` | `ProveedorPago` + Mercado Pago |
| `lib/pedidos/` | Crear, procesar el pago, administrar |
| `lib/costos/` | Ingredientes, recetas, rentabilidad, lista de compra |
| `lib/auditoria.ts` | Bitácora sólo-inserción |
| `lib/log.ts` | Saneamiento de logs: sin datos personales ni secretos |
| `lib/csv.ts` | Export con protección contra inyección de fórmulas |
| `proxy.ts` | CSP con nonce, sólo para el panel |
| `instrumentation.ts` | Falla al arrancar si falta configuración crítica |

## Las decisiones

### Contraseñas: hasheadas, no cifradas

Argon2id con los mínimos de OWASP (`m=19MiB, t=2, p=1`). Cifrar sería reversible.

La contraseña **sí** viaja por la red, una vez, en un POST sobre TLS. No hay
alternativa: el servidor tiene que verla para verificarla. Hashearla en el
navegador empeora — el hash pasa a ser la contraseña efectiva.

**La excepción:** el secreto TOTP se **cifra**, no se hashea. El servidor lo
necesita en claro para calcular el código esperado. AES-256-GCM, clave en el
entorno.

### Sesiones: token opaco, no JWT

Un JWT no se revoca sin lista negra, y con lista negra ya tenés tabla de
sesiones. Con token opaco, cerrar sesión es un `DELETE`.

```
token = base64url(randomBytes(32))   → cookie
id    = sha256(token)                → base
```

sha256 y no Argon2: el token ya es aleatorio de 256 bits.

Cookie `__Host-` + `HttpOnly` + `Secure` + `SameSite=Lax` + `Path=/`, sin
`Domain`. **La autoridad de vencimiento es la columna `expira_en`**, nunca la
cookie.

| | Cliente | Admin |
|---|---|---|
| Duración | 30 días, se desliza | **8 h, sin renovarse** |
| Segundo factor | no | obligatorio, por sesión |

Una sesión de cliente robada compra jugos; una de admin ve todo y cambia precios.

### El registro no inicia sesión

Es lo único que hace real la promesa de no enumerar usuarios. Con auto-login,
un correo nuevo te deja adentro y uno existente no — y esa diferencia delata
quiénes son clientes, por más genérico que sea el mensaje.

### Google: los tres chequeos que no son opcionales

1. **`state`** contra la cookie → sin esto te loguean en la cuenta del atacante
2. **origen del `id_token`** → lo trajimos nosotros con nuestro `client_secret`;
   por eso se puede decodificar sin verificar firma. Si llegara por otro camino,
   habría que verificar contra el JWKS
3. **`email_verified`** → sin esto, alguien crea una cuenta Google con el correo
   de un cliente y se lleva su cuenta

### Precios: sólo del catálogo

Del navegador llega SKU, cantidad y —para packs armables— qué eligió. **Nunca un
precio.** No hay ningún `<input type="hidden" name="precio">` en el proyecto.

El pedido manual del panel pasa por el **mismo `crearPedido`**, así los números
son comparables.

### Pagos: tres barreras

1. firma HMAC con tolerancia de timestamp (corta replays)
2. el estado se **consulta** a Mercado Pago, no se lee del cuerpo
3. el monto tiene que coincidir con el total del pedido

La página de retorno **sólo lee**. Los parámetros con los que MP devuelve al
cliente los escribe cualquiera abriendo la URL a mano.

Idempotencia por PK sobre `id_pago_mp` + transición condicional.

### Sin stock

Anima prepara a pedido: toma los pedidos y después compra. No hay inventario
que reservar. Lo único que se revalida al pagar es que la variante siga
`disponible`.

### Precios de ingredientes: historial, no UPDATE

Cada cambio es una fila con su fecha. Es lo que permite ver el margen de una
semana con los costos de esa semana.

**Un costo incompleto no es un costo cero.** Un costo desconocido mostrado como
cero da margen del 100%, y sobre eso alguien baja un precio. El panel lo avisa
en cada pantalla.

### Bitácora inmutable

Trigger en Postgres que hace **fallar** `UPDATE` y `DELETE`. Sin foreign key a
`usuario`: con `on delete set null`, borrar un usuario dispara un UPDATE interno
que el trigger rechaza, y entonces ningún usuario se podría borrar.

### CSP: estática en el sitio, con nonce en el panel

Una CSP con nonce obliga a render dinámico. El catálogo prerenderiza la landing
y las 8 fichas, así que ahí va la estática — que igual bloquea scripts externos,
`object-src`, `base-uri` y `form-action`.

El panel ya es dinámico y tiene los datos de todos los clientes: ahí va la CSP
con nonce, sin `'unsafe-inline'`, más COOP/COEP/CORP (`proxy.ts`).

**La defensa principal contra XSS sigue siendo React, que escapa todo.
Regla: cero `dangerouslySetInnerHTML`.**

### Logs sin datos personales

Todo pasa por `lib/log.ts`, que tapa correos, tokens, claves de API, cadenas de
conexión y hashes. Los correos van como `idOfuscado()` — 8 caracteres de sha256:
alcanza para correlacionar, no para identificar.

Los logs se guardan más tiempo que los datos y viajan a terceros. Y un error de
un SDK puede traer adentro la petición completa con el token y los datos del
cliente: por eso nunca se serializa el error entero.

## OWASP Top 10 — dónde está cada cosa

| | Dónde |
|---|---|
| **A01** Access control | `lib/auth/dal.ts`; `requerirAdmin()` en cada acción y route handler, con un test por cada uno |
| **A02** Crypto | Argon2id, sha256 para tokens, AES-256-GCM para el secreto TOTP, HSTS |
| **A03** Injection | Drizzle parametriza; Zod en cada borde; CSP; CSV a prueba de fórmulas |
| **A04** Diseño inseguro | Precios del catálogo; el registro no enumera; la página de retorno no marca pagos |
| **A05** Misconfig | `next.config.ts` + `proxy.ts`; `instrumentation.ts` no deja arrancar sin Redis |
| **A06** Deps | `npm audit --omit=dev` en CI + Dependabot semanal |
| **A07** Fallas de auth | Rate limit distribuido, hash señuelo, mensajes genéricos, sesión nueva en cada login, 2FA obligatorio para admin |
| **A08** Integridad | Lockfile commiteado; gitleaks en pre-commit y en CI; sin scripts de CDN |
| **A09** Logging | Bitácora inmutable + `lib/log.ts` |
| **A10** SSRF | No se fetchea ninguna URL que venga del usuario |

## Operación

### Backups y recuperación (Neon)

Neon hace **PITR** (point-in-time recovery): se puede restaurar la base a
cualquier instante dentro de la ventana de retención.

**Hay que verificar la ventana en la consola**: el plan gratuito da pocos días.
Para un negocio que factura, conviene un plan con retención más larga.

Neon → proyecto → Settings → **History retention**.

**Restaurar** no pisa nada: crea una rama nueva desde ese momento. El
procedimiento es crear la rama, mirar que los datos estén bien, y recién ahí
apuntar la aplicación.

**Probar la restauración antes de necesitarla.** Un backup que nunca se
restauró no se sabe si sirve.

Lo que **no** cubre Neon: un `DELETE` mal hecho se recupera con PITR, pero sólo
si alguien se da cuenta dentro de la ventana. La bitácora ayuda a detectarlo.

### Cron

`vercel.json` agenda `/api/cron/limpieza` a las 4 AM: purga sesiones vencidas,
carritos abandonados y tokens de correo viejos.

### Qué alertar

Estas líneas de log significan que algo se rompió en silencio:

| Patrón | Qué pasa |
|---|---|
| `[auditoria] NO SE PUDO REGISTRAR` | Se están haciendo cambios sin dejar rastro |
| `[rate-limit] Redis no respondió` | El rate limit está abierto |
| `[email] no se pudo enviar` | Nadie puede verificar cuentas ni recuperar contraseñas |
| `[mercadopago] notificación rechazada` | Firma inválida: config rota, o alguien probando |
| `[mercadopago] no se aplicó el pago` | **Monto que no coincide.** Mirarlo siempre |

### Rotación de credenciales

En `docs/entorno.local.md`, por variable. Lo importante: **`CLAVE_CIFRADO` no se
puede rotar sin más** — al cambiarla, todos los admins tienen que volver a dar
de alta el segundo factor.

## Lo que falta

1. **Packs armables en la UI.** El cálculo y la validación están (`armarPack`,
   con tests), falta el componente para que el cliente elija el contenido. Hoy
   un pack armable no se puede comprar desde la web.
2. **Gestión de sesiones.** La tabla guarda IP y user-agent para que el usuario
   pueda ver y cerrar sus sesiones abiertas. Falta la pantalla.
3. **Fotos de producto.** Hay un `TODO` en la ficha; el símbolo ocupa el lugar.
4. **Passkeys como segunda opción de 2FA.** Se eligió TOTP por recuperación; el
   esquema no impide agregar WebAuthn al lado.
5. **Correo de confirmación de pedido.** El webhook marca el pedido pagado pero
   no avisa por mail. El cliente ve la confirmación sólo en pantalla.
6. **Probar el flujo real de Mercado Pago.** Toda la lógica está testeada, pero
   nunca corrió contra el sandbox de MP. **Hacerlo antes de cobrarle a alguien.**
