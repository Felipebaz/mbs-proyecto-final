# Variables de entorno — detalle operativo

> **Este archivo NO se versiona** (`*.local.md` está en `.gitignore`).
> Tampoco lleva valores reales: describe dónde se saca cada credencial y cómo
> se rota. Para pasárselo a alguien del equipo, mandáselo por un canal privado.
>
> La lista de variables sin detalle operativo vive en `.env.example`, que sí se
> versiona.

## Cómo leer esto

Por cada variable: **qué es**, **dónde se saca**, **cómo se rota**, **qué se
rompe si falta** y **en qué entornos de Vercel va**.

---

## `DATABASE_URL`

**Qué es.** Cadena de conexión a Postgres en Neon. Incluye usuario, contraseña,
host y `sslmode=require`.

**Dónde se saca.** console.neon.tech → proyecto → Connection Details. Copiar la
que dice **`-pooler`** en el host: es el endpoint con pool. Sin el pooler, cada
invocación serverless abre una conexión directa y se agota el límite.

**Región: `sa-east-1` (São Paulo).** La sesión se valida contra la base en cada
request, así que la latencia servidor→DB se paga siempre. Montevideo→São Paulo
son ~30-40 ms; Montevideo→Virginia, ~120-150 ms.

**Cómo se rota.** Neon → Roles → Reset password. Genera una cadena nueva; hay
que actualizarla en Vercel en los tres entornos y redeployar. La cadena vieja
deja de andar en el momento.

**Qué se rompe si falta.** Todo lo que toque la base: login, registro, carrito.
El *build* no se rompe — `lib/db/cliente.ts` conecta en la primera query, no al
importar, justamente para que CI pueda compilar sin base.

**Vercel.** Los tres entornos, con bases distintas:
- Production → base de producción
- Preview → una branch de Neon (Neon tiene branching: sale gratis y aísla los
  datos de prueba de los reales)
- Development → la misma branch de preview, o una local

---

## `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`

**Qué es.** Credenciales del cliente OAuth. El `CLIENT_ID` es público (viaja en
la URL de autorización); el `CLIENT_SECRET` **no** — es lo que prueba que la
petición al endpoint de token es nuestra.

**Dónde se saca.** console.cloud.google.com → APIs & Services → Credentials →
Create Credentials → OAuth client ID → Web application.

**Cómo se rota.** En la misma pantalla, "Add secret" genera uno nuevo y deja el
viejo vivo un tiempo: se puede rotar sin cortar el servicio. Actualizar en
Vercel, redeployar, y recién ahí borrar el viejo.

**Qué se rompe si falta.** `lib/auth/google.ts` tira al construir el cliente, o
sea que el botón "Continuar con Google" devuelve error 500. El login con
contraseña sigue funcionando.

**Vercel.** Los tres entornos. Conviene un cliente OAuth **distinto** para
producción que para preview: así una credencial de preview filtrada no toca las
cuentas reales.

---

## `GOOGLE_REDIRECT_URI`

**Qué es.** A dónde vuelve Google después del consentimiento.

**Dónde se saca.** No se "saca": se declara. Tiene que estar **idéntica** en dos
lugares: esta variable y "Authorized redirect URIs" en Google Console. Google
hace match exacto de string — una barra final de más y el flujo falla con
`redirect_uri_mismatch`.

```
dev:      http://localhost:3000/api/auth/google/callback
preview:  https://<deploy>.vercel.app/api/auth/google/callback
prod:     https://<dominio>/api/auth/google/callback
```

**Qué se rompe si falta.** Mismo que las credenciales de Google.

**Vercel.** Distinta por entorno. **Ojo con preview:** Vercel genera una URL
nueva por deploy, y no se pueden registrar todas en Google. Opciones: usar la
URL estable de la rama (`<proyecto>-git-<rama>.vercel.app`) o un dominio fijo de
preview.

---

## `CRON_SECRET`

**Qué es.** Token que autoriza `GET /api/cron/limpieza`, que purga sesiones
vencidas y carritos abandonados.

**Dónde se saca.** Se genera:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**Cómo se rota.** Generar otro, actualizarlo en Vercel y redeployar. Vercel Cron
manda el header automáticamente si la variable se llama `CRON_SECRET`.

**Qué se rompe si falta.** El endpoint devuelve **404 a todo** (404 y no 401: no
hace falta confirmarle a nadie que existe). La limpieza deja de correr y las
tablas `sesion` y `carrito` crecen sin techo. No rompe el sitio, se degrada de a
poco.

**Vercel.** Producción sí. Preview no hace falta: no hay cron ahí.

---

---

## `RESEND_API_KEY`

**Qué es.** Clave de API de Resend, el proveedor de correo transaccional
(verificación, reset, avisos de seguridad).

**Dónde se saca.** resend.com → API Keys → Create API Key. Permiso **Sending
access** alcanza; no le des Full access.

**Antes hace falta verificar el dominio:** Resend → Domains → Add Domain, y
cargar los registros DNS que pide (SPF, DKIM y DMARC) donde tengas el dominio.
Sin eso los mails caen en spam o rebotan.

**Cómo se rota.** Crear una clave nueva, actualizarla en Vercel, redeployar, y
recién ahí borrar la vieja. Resend permite varias activas a la vez, así que la
rotación no corta el servicio.

**Qué se rompe si falta.** En desarrollo, nada: los correos se imprimen en la
terminal (`ProveedorConsola`). En producción, `lib/email/index.ts` **tira a
propósito**: sin correo nadie verifica su cuenta ni recupera la contraseña, y
esa falla en silencio es peor que un error ruidoso.

**Vercel.** Producción y preview. En preview conviene una clave distinta y, si
se puede, un dominio de prueba: así un error en preview no ensucia la
reputación de envío del dominio real.

---

## `EMAIL_FROM`

**Qué es.** El remitente. Formato `Nombre <direccion@dominio>`.

**Dónde se saca.** Se elige. El dominio tiene que ser uno verificado en Resend.
Para probar sin dominio propio sirve `onboarding@resend.dev`, que Resend deja
usar sin verificar nada.

**Cómo se rota.** Cambiar el valor. Si cambia el dominio, verificarlo primero en
Resend.

**Qué se rompe si falta.** Lo mismo que `RESEND_API_KEY`: el proveedor real sólo
se arma si están las dos.

**Vercel.** Los tres entornos. Conviene que preview diga algo como
`Anima (preview) <...>` para no confundir un mail de prueba con uno real.

---

## `APP_URL`

**Qué es.** La URL pública del sitio, sin barra final. Con esto se arman los
links de los correos.

**Dónde se saca.** Se declara. `http://localhost:3000` en desarrollo, el dominio
en producción.

**Por qué no se deriva del request.** El header `Host` lo controla quien manda
la petición. Si el link de reset se armara con él, un `Host: sitio-atacante.com`
haría que el mail —que sale de nuestro servidor, con nuestro dominio, con toda
la confianza que eso da— lleve a la víctima a un sitio del atacante con un token
válido en la URL. Tiene que venir de configuración.

**Qué se rompe si falta.** En desarrollo cae a `http://localhost:3000`. En
producción tira al arrancar el envío.

**Vercel.** Los tres entornos. En preview, la URL estable de la rama
(`<proyecto>-git-<rama>.vercel.app`) y no la de cada deploy, que cambia siempre.

---

## Reglas que valen para todas

1. **Ninguna lleva prefijo `NEXT_PUBLIC_`.** Ese prefijo mete el valor en el
   bundle del navegador. Todo lo de acá es secreto de servidor.
2. **`.env.local` nunca se commitea.** Está cubierto por `.env*` en
   `.gitignore`, y el hook de `gitleaks` es la segunda red.
3. **Si un secreto llega a entrar al repo: rotarlo.** Reescribir el historial no
   alcanza — quien haya clonado ya se lo llevó.
