# Prompts del proyecto

Biblioteca de prompts para el sitio de jugos orgánicos. Cada archivo tiene el
prompt tal cual se usa y la respuesta correspondiente.

| # | Rol | Cuándo | Estado |
|---|-----|--------|--------|
| [01](01-arquitecto.md) | El Arquitecto — Planificación | Antes de escribir código | ✅ Respondido |
| [02](02-constructor.md) | El Constructor — Generación de código | Una sección por vez | ✅ Respondido (sección Productos) |
| [03](03-detective.md) | El Detective — Debugging | Cuando algo se rompe | 📋 Plantilla |
| [04](04-critico.md) | El Crítico — Code review | Antes de cerrar cada feature | 📋 Plantilla + checklist |
| [05](05-optimizador.md) | El Optimizador — Refactoring | Con el maquetado completo | 📋 Plantilla + qué medir |
| [06](06-escudo.md) | El Escudo — Testing | Lógica de negocio, no maquetado | 📋 Plantilla + setup |
| [07](07-narrador.md) | El Narrador — Documentación | Al cerrar la v1 | 📋 Plantilla + esqueleto |

**Plantilla** = el prompt tiene placeholders (`[pegá el código]`) que dependen de
código que todavía no existe. En esos archivos la respuesta cubre lo que sí se
puede resolver hoy: setup, criterios y qué hace falta para completarlo.

## Contexto base del proyecto

Sitio público de una marca uruguaya de jugos orgánicos prensados en frío.
Stack: Next.js (App Router) + TypeScript + Tailwind.

Productos: Jugo Verde, Jugo Naranja y Jugo Rojo (cada uno en 330ml y 910ml como
variante del mismo producto) + Shot de Cúrcuma y Jengibre (categoría aparte, un
solo tamaño). A futuro se suma una línea de geles energéticos como tercera
categoría.

Rutas: `/` (landing), `/productos` (catálogo con filtro por categoría),
`/productos/[slug]` (ficha con selector de tamaño), `/carrito`.

## Orden sugerido

1. **Arquitecto** → estructura, tipos y modelo de datos
2. **Constructor** → una sección de la landing por vez
3. **Detective** → cuando algo se rompa (va a pasar)
4. **Crítico** → antes de dar por cerrada cada sección
5. **Optimizador** → cuando el maquetado esté completo
6. **Escudo** → tests de la lógica del carrito y precios
7. **Narrador** → al cerrar la v1, antes de arrancar con los geles

El **#2 (Constructor)** es donde se va el 80% del tiempo. El truco es pedir una
pieza por vez con detalle de diseño explícito, en vez de "hacé la landing".
