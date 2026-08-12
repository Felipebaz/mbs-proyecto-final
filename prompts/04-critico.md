# 04 · El Crítico — Code review

**Cuándo:** antes de mergear cada feature.
**Estado:** 📋 Plantilla — necesita código real. Abajo, el checklist con el que
se va a revisar.

## Prompt

````
Actuá como un code reviewer senior exigente pero constructivo. Revisá este código
como si fuera un Pull Request.

## Código
```
[pegá el código]
```

## Contexto
- Stack: Next.js App Router + TypeScript + Tailwind
- Qué hace: [descripción breve]
- Es código de: [componente de landing / ficha de producto / lógica de carrito]

## Analizá cada dimensión
1. Seguridad: ¿hay secrets expuestos al cliente? ¿variables de entorno mal marcadas
   como públicas? ¿validación de inputs en el carrito/checkout?
2. Rendimiento y SEO: ¿imágenes optimizadas (next/image)? ¿se manda JS al cliente
   que podría ser Server Component? ¿la metadata está bien puesta?
3. Código limpio: responsabilidad única, nombres descriptivos, duplicación
4. Patrones y estructura: ¿coherente con las convenciones de Next App Router?
5. Manejo de errores: edge cases (producto inexistente, carrito vacío, stock)
6. Accesibilidad: contraste, alt text, navegación por teclado

## Formato
Por dimensión: Estado (Bien / Mejorable / Problema). Si hay problema: qué, dónde,
y el código corregido. Cerrá con los 3 cambios de mayor impacto.
````

---

## Respuesta

Sin código todavía. Lo que sigue es el criterio concreto contra el que se va a
revisar en **este** proyecto: qué cuenta como "Bien" en cada dimensión. Sirve de
autochequeo antes de pedir el review.

### 1 · Seguridad

| ✅ Bien | 🚩 Problema |
|---|---|
| Nada sensible con prefijo `NEXT_PUBLIC_` | Un token o API key con `NEXT_PUBLIC_` — queda en el JS que descarga cualquiera |
| Cantidades del carrito validadas: entero, ≥1, con tope | `cantidad` que acepta negativos, decimales o `NaN` |
| El precio se lee del catálogo del servidor | El precio llega desde el cliente y se confía en él |
| `.env*` en `.gitignore` (ya está) | Credenciales commiteadas |

La regla del carrito: **el precio nunca viaja desde el cliente**. El cliente manda
qué y cuánto (`slug`, `varianteId`, `cantidad`); el precio lo resuelve el servidor
contra el catálogo. Si no, cualquiera edita el localStorage y se compra un 910ml
a $1.

### 2 · Rendimiento y SEO

Es la dimensión crítica: el objetivo del sitio es que te encuentren buscando
"jugos orgánicos Montevideo".

- **`next/image` siempre**, nunca `<img>`. Con `sizes` cuando usás `fill`, y
  `priority` **solo** en la imagen del hero (o la primera card visible).
- **`"use client"` justificado.** Si un componente no tiene estado, efecto ni
  handler de evento, no debería ser cliente. Test rápido: `curl -s localhost:3000
  | grep "<texto que tiene que estar>"` — si no aparece, no estás renderizando en
  el servidor y Google tampoco lo ve.
- **Metadata por ruta.** `generateMetadata` en `/productos/[slug]`, con
  `openGraph` — es lo que decide cómo se ve el link cuando lo mandás por WhatsApp
  o lo pegás en Instagram. Sin eso, el preview sale en blanco.
- **`generateStaticParams`** en la ficha: las 4 fichas se prerenderizan en build.
- **JSON-LD `Product`** en la ficha, con precio y disponibilidad. Es lo que
  habilita el resultado enriquecido en Google.
- **Fuentes vía `next/font`** (ya está en `layout.tsx`), nunca por `<link>` a
  Google Fonts: evita el salto de layout.

### 3 · Código limpio

- Ningún componente importa `lib/catalogo/productos.ts` directo — todo por
  `queries.ts`.
- Cero `any`. Cero `as` para callar al compilador; si hace falta, el tipo está mal.
- La lógica de plata vive en `lib/carrito/calculos.ts` como funciones puras, no
  desperdigada en componentes.
- Formateo de precio solo con `formatPrecio()`. Si ves `precio / 100` en un
  componente, ya se duplicó.

### 4 · Patrones y estructura

- Server Component por defecto; `"use client"` lo más abajo posible en el árbol.
- `params` y `searchParams` **awaiteados** (Next 16).
- Estado que le importa al usuario → en la URL (`?categoria=`), no en `useState`.
- Componentes ubicados por dominio: `home/`, `producto/`, `carrito/`, `ui/`.

### 5 · Manejo de errores

Edge cases que tienen que estar resueltos:

| Caso | Comportamiento esperado |
|---|---|
| Slug inexistente (`/productos/jugo-azul`) | `notFound()` → 404 real, no una página rota |
| `?categoria=` con valor inventado | Se ignora y muestra todo, sin romper |
| Carrito vacío | Estado vacío con CTA a `/productos`, no una tabla en blanco |
| Producto en el carrito que ya no existe | Se filtra al hidratar y se avisa qué se sacó |
| Variante que pasó a `disponible: false` | Se bloquea la compra y se dice por qué |
| Subtotal debajo del mínimo de la zona | Se bloquea y se muestra cuánto falta |

### 6 · Accesibilidad

- `alt` descriptivo en toda foto de producto. `alt=""` solo si es puramente
  decorativa.
- Contraste ≥ 4.5:1. **Ojo con la paleta**: texto sobre el naranja del jugo o
  sobre crema queda flojo. Verificalo, no lo estimes a ojo.
- El carrusel se navega con teclado (contenedor con `tabIndex={0}`).
- Los botones de cantidad son `<button>` reales, con `aria-label` ("Aumentar
  cantidad de Jugo Verde"), no `<div onClick>`.
- El foco se ve siempre: nunca `outline: none` sin reemplazo.
- Cambios dinámicos (agregar al carrito) anunciados con `aria-live`.

### Los 3 chequeos que más rinden

1. **`curl -s localhost:3000 | grep "Jugo"`** — si no aparece el contenido, no hay
   SEO. Todo lo demás es secundario a esto.
2. **Buscar `"use client"` en el repo** — cada aparición tiene que tener una razón
   nombrable. Si no la tiene, sacala.
3. **Lighthouse en `/productos/[slug]`** — es la página que va a recibir el
   tráfico de búsqueda. Mirá Performance, Accessibility y SEO.
