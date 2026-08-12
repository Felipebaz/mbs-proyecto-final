# 02 · El Constructor — Generación de código

**Cuándo:** una vez definida la arquitectura, sección por sección.
**Estado:** ✅ Respondido para la sección Productos

Clave: **no pidas "hacé la landing"** — pedí una pieza por vez, con el detalle de
diseño ya definido. Repetís el mismo esqueleto cambiando la sección: hero,
pilares de marca, beneficios, sobre nosotros, footer, ficha de producto, carrito.

## Prompt

````
Actuá como un desarrollador senior especializado en TypeScript con Next.js
(App Router) y Tailwind.

Necesito que implementes lo siguiente:

## Funcionalidad
La sección "Productos" de la landing: un título "Productos" con un link
"Ver todos →" alineado a la derecha en la misma línea. Debajo, un carrusel
horizontal (scroll) de cards de producto. Cada card se divide en dos mitades
verticales: a la izquierda la foto ocupando todo el alto de la card (con el fondo
del contenedor tomando el color real del jugo), y a la derecha, centrado
verticalmente, el nombre del producto, sus ingredientes y un CTA "Comprar" que
navega a /productos/[slug].

## Contexto técnico
- Stack: Next.js App Router, TypeScript, Tailwind
- Datos: [pegá acá el tipo Producto que definiste en el paso 01]
- Convenciones del proyecto: [las que haya definido el Arquitecto]

## Requisitos del código
1. Código listo para producción, no ejemplos simplificados
2. Server Component por defecto; marcá "use client" solo donde haya interactividad real
3. Responsive: en mobile el carrusel tiene que seguir funcionando bien
4. Accesible: navegación por teclado en el carrusel, alt text en las fotos
5. Tipado completo, sin any
6. Comentarios SOLO donde la lógica no sea obvia

## Formato de entrega
Código en bloques separados por archivo, con la ruta de cada archivo como encabezado.
Al final, una sección breve "Cómo probarlo".
````

> **Al usarlo:** reemplazá `[pegá acá el tipo Producto…]` por los tipos de
> [01-arquitecto.md](01-arquitecto.md) §3, y `[las convenciones…]` por §1 y §5
> del mismo archivo.

---

## Respuesta

**La decisión de fondo: el carrusel no lleva JavaScript.** `overflow-x-auto` +
`scroll-snap` de CSS resuelven scroll con dedo, con trackpad, con rueda y con
teclado. Un carrusel con `useState` y flechas propias manda un bundle al cliente,
rompe el scroll nativo del touch y hay que reimplementarle la accesibilidad a
mano. Toda la sección queda como Server Component: **cero `"use client"`**.

### `lib/format.ts`

```ts
/** "Pepino, manzana verde y espinaca" — para la card del carrusel. */
export function formatLista(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}
```

### `components/producto/ProductCard.tsx`

```tsx
import Image from "next/image";
import Link from "next/link";
import { formatLista } from "@/lib/format";
import { tieneIngredientes, type Producto } from "@/types/producto";

interface ProductCardProps {
  producto: Producto;
  /** true en la primera card visible: precarga su foto y mejora el LCP. */
  prioridad?: boolean;
}

export function ProductCard({ producto, prioridad = false }: ProductCardProps) {
  const [imagen] = producto.imagenes;

  const descripcion = tieneIngredientes(producto)
    ? formatLista(producto.ingredientes.map((i) => i.nombre))
    : producto.tagline;

  return (
    <article
      className="group relative flex h-56 w-[85vw] max-w-[340px] flex-none
                 snap-start overflow-hidden rounded-lg border border-border
                 bg-white transition-shadow focus-within:ring-2
                 focus-within:ring-foreground hover:shadow-lg sm:w-[340px]"
    >
      {/* Mitad izquierda: foto a alto completo sobre el color real del jugo.
          El color viene como token CSS del dato, así que va inline: Tailwind
          no puede generar clases a partir de un valor dinámico. */}
      <div
        className="relative w-[45%] flex-none"
        style={{ backgroundColor: `var(${producto.colorToken})` }}
      >
        {imagen ? (
          <Image
            src={imagen.src}
            alt={imagen.alt}
            fill
            sizes="(max-width: 640px) 40vw, 155px"
            className="object-cover mix-blend-multiply"
            priority={prioridad}
          />
        ) : null}
      </div>

      {/* Mitad derecha: centrada verticalmente */}
      <div className="flex flex-1 flex-col justify-center gap-2 p-5">
        <h3 className="font-display text-lg leading-tight">{producto.nombre}</h3>

        <p className="line-clamp-3 text-sm leading-relaxed text-muted">
          {descripcion}
        </p>

        {/* Stretched link: el <a> cubre la card entera con ::after, así todo el
            bloque es clickable pero existe un solo elemento focusable. */}
        <Link
          href={`/productos/${producto.slug}`}
          className="mt-1 self-start text-sm font-medium underline
                     underline-offset-4 after:absolute after:inset-0
                     after:content-[''] focus:outline-none"
        >
          Comprar <span aria-hidden="true">→</span>
          <span className="sr-only"> {producto.nombre}</span>
        </Link>
      </div>
    </article>
  );
}
```

### `components/home/ProductosSection.tsx`

```tsx
import Link from "next/link";
import { ProductCard } from "@/components/producto/ProductCard";
import { getProductosDestacados } from "@/lib/catalogo/queries";

export async function ProductosSection() {
  const productos = await getProductosDestacados();

  if (productos.length === 0) return null;

  return (
    <section
      id="productos"
      aria-labelledby="productos-titulo"
      className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8"
    >
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 id="productos-titulo" className="font-display text-2xl sm:text-3xl">
          Productos
        </h2>
        <Link
          href="/productos"
          className="text-sm underline underline-offset-4 hover:no-underline"
        >
          Ver todos <span aria-hidden="true">→</span>
        </Link>
      </div>

      {/* tabIndex=0 + role=group: hace el carrusel scrolleable con flechas del
          teclado para quien no usa mouse. Sin esto, el overflow solo se navega
          tabulando card por card. */}
      <div
        role="group"
        aria-labelledby="productos-titulo"
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto
                   pb-4 focus:outline-none focus-visible:ring-2
                   focus-visible:ring-foreground
                   [scrollbar-width:thin]"
      >
        {productos.map((producto, i) => (
          <ProductCard
            key={producto.slug}
            producto={producto}
            prioridad={i === 0}
          />
        ))}
      </div>
    </section>
  );
}
```

### `app/page.tsx` (montaje)

```tsx
import { ProductosSection } from "@/components/home/ProductosSection";

export default function Home() {
  return (
    <main>
      {/* <Hero /> */}
      {/* <Pilares /> */}
      <ProductosSection />
      {/* <Beneficios /> */}
      {/* <SobreNosotros /> */}
    </main>
  );
}
```

### Decisiones que conviene que revises

| Decisión | Por qué | Alternativa |
|---|---|---|
| Sin JS en el carrusel | Scroll nativo, 0 kB al cliente, accesible de fábrica | Flechas con `useState` si querés control preciso; cuesta un componente cliente |
| `mix-blend-multiply` en la foto | Funde la foto con el color del jugo detrás; funciona con PNG de fondo claro | Sacalo si las fotos vienen recortadas con transparencia |
| Card a `85vw` en mobile | Se asoma la siguiente card: señal visual de que hay más para scrollear | Ancho fijo si preferís |
| Stretched link | Card entera clickable, un solo tab stop | `<Link>` envolviendo todo, si nunca vas a meter otro link adentro |
| Descripción = ingredientes | Es lo que pide el wireframe | `producto.tagline` si preferís copy a lista |

### Cómo probarlo

1. `npm run dev` → http://localhost:3000
2. **Layout:** la card se parte 45% foto / 55% texto, la foto llega a los dos
   bordes verticales y el texto queda centrado.
3. **Color:** cada card muestra su color detrás de la foto. Si están todas
   grises, falta el token en el `@theme` de `globals.css` o `colorToken` no
   coincide con el nombre de la variable.
4. **Scroll:** en mobile (DevTools ~375px) el carrusel se arrastra con el dedo y
   cada card frena en su lugar por el snap.
5. **Teclado:** Tab hasta el carrusel → el borde de foco lo rodea → flechas ←/→
   lo scrollean. Tab de nuevo entra a los "Comprar" uno por uno.
6. **Servidor:** `curl -s localhost:3000 | grep "Jugo"` tiene que devolver los
   nombres. Si aparecen, el HTML sale renderizado del servidor y el SEO está bien.
7. **Sin JS:** desactivá JavaScript en el navegador. La sección tiene que seguir
   funcionando entera, scroll incluido.
