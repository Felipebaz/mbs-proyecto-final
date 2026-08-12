# 06 · El Escudo — Testing

**Cuándo:** para la lógica de negocio, no para el maquetado.
**Estado:** 📋 Plantilla — falta instalar Vitest y escribir la lógica a testear

Prioridad de testeo: cálculo de precio por variante de tamaño, lógica del carrito
(agregar, quitar, actualizar cantidades, subtotal) y resolución de slug a producto.

## Prompt

````
Actuá como un ingeniero de QA senior especializado en testing automatizado con
Vitest y React Testing Library.

Escribí una suite de tests completa para:

## Código a testear
```
[pegá la lógica del carrito o el cálculo de precios]
```

## Qué hace
[descripción breve]

## Dependencias externas
[qué necesita mocking]

## Cubrí estas 4 categorías
1. Happy path (mínimo 2): agregar un jugo 330ml, cambiar a 910ml y que el precio
   se recalcule
2. Edge cases (mínimo 3): cantidad 0, cantidad negativa, producto sin variantes
   (un shot), slug inexistente
3. Gestión de errores (mínimo 2): falla controlada cuando el producto no existe
4. Integraciones: mock de la capa de datos

Nombres descriptivos por test, agrupados en describe blocks. Al final, lista
resumen de escenarios cubiertos.
````

---

## Respuesta

### Setup (todavía no está en el proyecto)

`package.json` hoy solo tiene `dev`, `build`, `start` y `lint`. Hace falta:

```bash
npm i -D vitest @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./") },
  },
});
```

```ts
// vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

```jsonc
// package.json → scripts
"test": "vitest",
"test:run": "vitest run"
```

> **No verificado**: es el setup estándar de Vitest + React, pero no lo instalé
> ni lo corrí en este proyecto. La combinación Next 16 / React 19 puede pedir
> algún ajuste. Confirmalo con un test trivial antes de escribir la suite.

### Qué testear y qué no

| Testear | Por qué |
|---|---|
| `lib/carrito/calculos.ts` | Funciones puras que manejan plata. Entra un valor, sale otro. Máximo retorno por línea de test. |
| `lib/catalogo/queries.ts` | Resolución de slug, filtro por categoría, validación de `?categoria=`. Rápido y protege las rutas. |
| Reducer del carrito | Agregar duplicado, bajar a 0, cambiar de variante. Es donde de verdad se esconden los bugs. |

| **No** testear | Por qué |
|---|---|
| Que la card renderice el nombre | Test que se rompe cada vez que tocás el diseño y nunca atrapa un bug real |
| Clases de Tailwind | Testea el framework, no tu código |
| Que el carrusel scrollee | Es CSS nativo. Si eso falla, falla el navegador |

La regla: **testeá la lógica que maneja plata y datos, no el maquetado.** El
maquetado se verifica mirándolo; el cálculo de un subtotal, no.

### Los escenarios que la suite tiene que cubrir

**Happy path**
- Agregar un jugo 330ml → el carrito tiene 1 línea con el precio de esa variante
- Cambiar la misma línea a 910ml → el subtotal se recalcula con el precio nuevo
- Agregar dos productos distintos → el subtotal es la suma de ambos

**Edge cases**
- Cantidad 0 → la línea se elimina, no queda en 0
- Cantidad negativa → se rechaza; el estado no cambia
- Agregar dos veces el mismo producto y la misma variante → **una** línea con
  cantidad 2, no dos líneas
- Mismo producto en **distinta** variante → **dos** líneas separadas
- Un shot (una sola variante) → funciona igual que un jugo, sin rama especial
- Slug inexistente → `getProductoBySlug` devuelve `null`, no lanza

**Gestión de errores**
- Línea de carrito apuntando a un slug que ya no existe en el catálogo → se
  descarta al hidratar, sin romper la página
- Línea apuntando a una variante que ya no existe (el producto sí) → mismo trato
- Subtotal por debajo del mínimo de la zona → `faltaParaMinimo` da el número
  correcto, no negativo

**Integraciones**
- Mock del catálogo con `vi.mock("@/lib/catalogo/queries")`, con un fixture chico
  y fijo. Nunca importes los productos reales en un test: el día que cambies un
  precio se te caen veinte tests que no tienen nada que ver.

### El test que más vale del proyecto

El de aritmética de plata. Los precios están en centésimos justamente para que
`29000 + 18000 = 47000` sea exacto. Si en algún lado se cuela un `/ 100` antes de
sumar, aparecen errores de un peso que nadie nota hasta que un cliente reclama.
Un test que sume tres líneas y compare contra el entero exacto lo atrapa.
