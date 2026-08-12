# 07 · El Narrador — Documentación

**Cuándo:** al cerrar la primera versión.
**Estado:** 📋 Plantilla — necesita el proyecto construido

El lector real acá sos vos en 6 meses, cuando vuelvas a agregar los geles.

## Prompt

````
Actuá como un technical writer senior.

Generá documentación técnica para este proyecto:

## Proyecto
[nombre de la marca] — sitio público de jugos orgánicos prensados en frío.
Landing + catálogo + ficha de producto + carrito.

## Contexto
- Stack: Next.js (App Router), TypeScript, Tailwind
- Quién va a leer esto: yo mismo en 6 meses, cuando agregue la línea de geles

## Generá
### 1. README.md
- Qué problema resuelve el proyecto (2-3 frases)
- Requisitos previos y versiones
- Instalación paso a paso (que funcione copiando y pegando)
- Estructura del proyecto (árbol con descripción de cada carpeta clave)
- Variables de entorno (tabla: nombre, descripción, ejemplo, si es obligatoria)
- Cómo correr los tests

### 2. Una sección extra: "Cómo agregar un producto nuevo"
Paso a paso concreto para sumar un jugo, un shot o —a futuro— un gel, indicando
qué archivos tocar y qué campos completar.

### 3. Documentación inline
JSDoc para cada función pública: qué hace, parámetros, retorno, ejemplo de uso.

Tono directo y técnico. Sin relleno.
````

> **Antes de usarlo:** reemplazá `[nombre de la marca]` — todavía no me lo dijiste.

---

## Respuesta

No hay proyecto que documentar todavía: documentar código que no existe produce
un README que miente, y un README que miente es peor que no tener ninguno.

Lo que sí se puede dejar armado ahora: el esqueleto y las decisiones que hay que
capturar mientras las tomás, porque en 6 meses no te vas a acordar del **por qué**.

### Esqueleto del README

```md
# [Marca]

Sitio público de [marca], jugos orgánicos prensados en frío en Montevideo.
Landing, catálogo, ficha de producto y carrito. Los pedidos se cierran por
[canal de checkout].

## Requisitos
- Node.js ≥ 20 (probado en 24.19.0)
- npm 12

## Instalación
```bash
git clone [repo]
cd [carpeta]
npm install
npm run dev
```
→ http://localhost:3000

## Scripts
| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Turbopack) |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build |
| `npm run lint` | ESLint |
| `npm test` | Tests (Vitest) |

## Estructura
[árbol con una línea por carpeta clave]

## Variables de entorno
| Nombre | Descripción | Ejemplo | Obligatoria |
|---|---|---|---|
| … | … | … | … |

⚠️ Las que arrancan con `NEXT_PUBLIC_` quedan visibles en el JavaScript del
navegador. Nunca pongas un secreto ahí.

## Decisiones de arquitectura
[las 5 de 01-arquitecto.md, resumidas en una línea cada una, con link]
```

### La sección que de verdad importa: "Cómo agregar un producto nuevo"

Es la que vas a leer dentro de 6 meses. Se escribe cuando el catálogo esté
cerrado, y tiene que ser copiable sin pensar:

```md
## Cómo agregar un producto nuevo

### Un jugo o un shot
1. Poné la foto en `public/productos/[slug].jpg`
2. Agregá la entrada en `lib/catalogo/productos.ts` con `categoria: "jugos"`
   (o `"shots"`)
3. Un jugo lleva dos variantes (330ml y 910ml); un shot, una sola con
   `id: "unico"`
4. Si es un color nuevo, agregá el token en el `@theme` de `app/globals.css` y
   referencialo en `colorToken`
5. Listo: la ficha, el sitemap y el catálogo lo toman solos

### Un gel (tercera categoría)
1. Poné `activa: true` en `geles` dentro de `lib/catalogo/categorias.ts`
2. Agregá el producto con `categoria: "geles"`
3. Correé `npx tsc --noEmit`: TypeScript te va a marcar cada `switch` que no
   contempla la categoría nueva. Esa lista de errores **es** tu checklist de
   qué falta tocar.
```

Ese paso 3 es el que justifica la unión discriminada de
[01-arquitecto.md](01-arquitecto.md): el compilador te arma la lista de
pendientes en vez de que la busques a mano.

### Qué anotar mientras construís, no después

En 6 meses el código se lee solo. Lo que no se recupera es el **por qué**:

- Por qué el checkout es [WhatsApp / formulario / pasarela] y no otro
- Por qué el catálogo está en archivos y no en un CMS, y **cuál es la señal** de
  que llegó el momento de migrar
- Por qué los precios están en centésimos
- De dónde salen las fotos y en qué formato/tamaño tienen que venir
- Cómo se define el mínimo de compra por zona y quién decide ese número

Anotalo en un `DECISIONES.md` a medida que pasa. Reconstruirlo después nunca sale.
