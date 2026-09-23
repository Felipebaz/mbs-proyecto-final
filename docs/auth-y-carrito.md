# Auth y carrito

Cómo levantar esto, qué decisiones hay detrás y qué falta.

## Puesta en marcha

### 1. Base de datos

Crear un proyecto en [Neon](https://neon.tech). **Región São Paulo (`sa-east-1`)**:
la sesión se valida contra la base en cada request, así que la latencia
servidor→DB se paga siempre.

```
Montevideo → São Paulo   ~30-40ms
Montevideo → Virginia    ~120-150ms
```

Copiar la connection string (la que dice `-pooler`) a `.env.local`.

### 2. Google OAuth

`console.cloud.google.com` → APIs & Services → Credentials → Create Credentials
→ OAuth client ID → Web application.

En **Authorized redirect URIs** va exactamente el mismo valor que
`GOOGLE_REDIRECT_URI`. Google hace match exacto: una barra de más y falla.

```
dev:  http://localhost:3000/api/auth/google/callback
prod: https://TU-DOMINIO/api/auth/google/callback
```

### 3. Variables

```bash
cp .env.example .env.local   # y completar
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # CRON_SECRET
```

### 4. Migrar y levantar

```bash
npm run db:migrate
npm run dev
```

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `lib/db/esquema.ts` | Tablas. Ni un precio vive acá |
| `lib/db/cliente.ts` | Conexión Neon, lazy (el build no necesita DB) |
| `lib/auth/password.ts` | Argon2id + hash señuelo contra timing |
| `lib/auth/sesion.ts` | Token opaco, cookie, ciclo de vida |
| `lib/auth/dal.ts` | El único lugar que pregunta quién está logueado |
| `lib/auth/google.ts` | OAuth: PKCE, state, vinculación de cuentas |
| `lib/auth/rate-limit.ts` | Cubetas en memoria por IP y por cuenta |
| `lib/carrito/calculo.ts` | Precio desde el catálogo. Puro, testeado |
| `lib/carrito/repositorio.ts` | Persistencia, carrito anónimo, fusión |
| `app/acciones/` | Server Actions (login, registro, carrito) |
| `app/api/auth/google/` | Ida y vuelta del flujo OAuth |
| `app/api/cron/limpieza/` | Purga de sesiones y carritos vencidos |

## Las decisiones

### Contraseñas: hasheadas, no cifradas

Cifrar es reversible — si se filtra la clave, se filtran todas. Argon2id con los
parámetros mínimos de OWASP (`m=19MiB, t=2, p=1`).

La contraseña **sí** viaja por la red, una vez, en el body de un POST sobre TLS.
No hay forma de evitarlo: el servidor tiene que verla para verificarla.
Hashearla en el navegador empeoraría las cosas — el hash pasaría a ser la
contraseña efectiva y quien lo intercepte lo reenvía tal cual.

### Sesiones: token opaco, no JWT

Un JWT no se revoca sin lista negra, y con lista negra ya tenés tabla de
sesiones. Con token opaco, cerrar sesión es un `DELETE`.

```
token = base64url(randomBytes(32))   → cookie
id    = sha256(token)                → base
```

sha256 y no Argon2 para el token: ya es aleatorio de 256 bits, no hay nada que
adivinar, y Argon2 sumaría ~50ms a cada request.

Cookie: `__Host-` + `HttpOnly` + `Secure` + `SameSite=Lax` + `Path=/`, sin
`Domain`. La autoridad de vencimiento es la columna `expira_en`, nunca la cookie.

### Google: los tres chequeos que no son opcionales

1. **`state`** contra la cookie → sin esto, un atacante te loguea en *su* cuenta
2. **origen del `id_token`** → lo trajimos nosotros del endpoint de Google con
   nuestro `client_secret`, por eso se puede decodificar sin verificar firma. Si
   llegara por cualquier otro camino, habría que verificar contra el JWKS
3. **`email_verified`** → sin esto, alguien crea una cuenta Google con el mail de
   un cliente y se lleva su cuenta

### Precios: sólo del catálogo

Del navegador llega SKU, cantidad y —para packs armables— qué eligió. **Nunca un
precio.** No hay ningún `<input type="hidden" name="precio">` en el proyecto, ni
lo puede haber. Cubierto por tests en `lib/carrito/calculo.test.ts`.

### PPR: por qué `cacheComponents: true`

El header muestra el carrito y si estás logueado, y eso lee cookies. Sin PPR,
una sola lectura de cookies vuelve dinámica **toda** la ruta: el catálogo entero
dejaría de prerenderizarse por mostrar un número al lado de "Carrito".

Con PPR, cada página tiene shell estático (`◐`) y la parte de sesión llega por
streaming. Las rutas que *son* la sesión (`/login`, `/carrito`, `/registro`)
declaran `export const instant = false`.

### CSP sin nonce

Una CSP con nonce es más fuerte pero fuerza render dinámico en toda la app, y
este sitio prerenderiza la landing y las 8 fichas. Sin nonce, `script-src`
necesita `'unsafe-inline'`.

Lo que igual queda cubierto, que es la mayor parte del riesgo real: no se puede
cargar un script **externo**, `object-src 'none'`, `base-uri 'self'`,
`form-action 'self'`, `frame-ancestors 'none'`. La defensa principal contra XSS
sigue siendo React, que escapa todo. **Regla: cero `dangerouslySetInnerHTML`.**

## OWASP Top 10 — dónde está cada cosa

| | Dónde |
|---|---|
| **A01** Access control | `lib/auth/dal.ts`; el carrito se resuelve por cookie/sesión del servidor, nunca por un id del formulario |
| **A02** Crypto | Argon2id para contraseñas, sha256 para tokens, HSTS |
| **A03** Injection | Drizzle parametriza; Zod en `lib/auth/validacion.ts`; CSP |
| **A04** Diseño inseguro | Precios desde el catálogo; topes de cantidad y de líneas |
| **A05** Misconfig | `next.config.ts`: CSP, HSTS, nosniff, frame-ancestors, Permissions-Policy, `poweredByHeader: false` |
| **A06** Deps vulnerables | `npm audit --omit=dev` = 0. Next se subió a 16.3.5 por un RCE crítico en 16.3.0 |
| **A07** Fallas de auth | Rate limit, hash señuelo contra timing, mensajes genéricos, sesión nueva en cada login |
| **A08** Integridad | Lockfile commiteado; sin scripts de CDN |
| **A09** Logging | El motivo real de un rechazo OAuth va al log, no a la URL |
| **A10** SSRF | No se fetchea ninguna URL que venga del usuario |

## Lo que falta

Esto **no** está terminado. En orden de importancia:

1. **Verificación de correo.** El registro crea la cuenta con
   `emailVerificado: false` y nadie manda el mail. Hoy: quien se registra con el
   mail de otro no puede hacer nada con eso (no vincula con Google sin
   `email_verified`), pero tampoco puede verificar el suyo.
2. **Aviso de registro duplicado.** Cuando el mail ya existe, la respuesta es
   genérica a propósito (no enumerar usuarios) — pero falta el mail que le
   avisaría al dueño legítimo. Hay un `TODO` en `app/acciones/auth.ts`.
3. **Reset de contraseña.** No existe. Un usuario que la olvida queda afuera.
4. **Checkout.** El carrito calcula el total pero no hay pedido ni pago. **Al
   cobrar hay que revalidar precio y stock de nuevo**, no confiar en lo que
   mostró el carrito.
5. **Rate limit distribuido.** El de ahora es por instancia: en serverless con N
   instancias, el atacante tiene N veces el presupuesto. Mover a Upstash Redis
   sin cambiar la firma de `consumir()`.
6. **Packs armables en la UI.** El cálculo y la validación están (`armarPack`),
   falta el componente para elegir el contenido.
7. **Gestión de sesiones.** La tabla guarda IP y user-agent para que el usuario
   pueda ver y cerrar sus sesiones. Falta la pantalla.
