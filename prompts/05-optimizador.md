# 05 · El Optimizador — Refactoring

**Cuándo:** cuando una sección funcione pero esté fea, o cuando el sitio cargue lento.
**Estado:** 📋 Plantilla — necesita código real y una medición previa

## Prompt

````
Actuá como un ingeniero de rendimiento y clean code especializado en Next.js
App Router + TypeScript.

## Código actual
```
[pegá el código]
```

## Qué hace
[breve]

## Qué me preocupa
[elegí: "carga lento" / "es difícil de leer" / "no sé si escala cuando agregue los
geles" / "hay mucha duplicación entre las cards de producto"]

## Entrega
- Código refactorizado completo
- Tabla: Qué cambié | Por qué | Impacto esperado
- No cambiar el comportamiento externo ni el resultado visual
- Si movés lógica de cliente a servidor, explicá qué se gana en bundle size

Mostrame el antes y después de cada bloque modificado.
````

---

## Respuesta

### Regla previa: medí antes de tocar

Un refactor de rendimiento sin número de partida es una opinión. Antes de mandar
este prompt, sacá la medición:

```bash
npm run build
```

El output de build te da, por ruta: si es **estática (○)** o **dinámica (ƒ)**, el
peso del JS de esa ruta, y el **First Load JS** compartido. Anotá esos números —
son el antes.

Después, Lighthouse en `/productos/[slug]` (modo incógnito, para que las
extensiones no ensucien).

Con eso, el prompt mejora muchísimo: cambiás *"carga lento"* por *"la ficha de
producto manda 180 kB de JS y el LCP es 3.2s"*. Eso es diagnosticable; lo otro no.

### Lo que se va a encontrar en este proyecto, por orden de impacto

**1 · `"use client"` de más.** El más caro y el más común. Un `"use client"` en un
componente alto del árbol arrastra al bundle todo lo que ese componente importa,
aunque los hijos no necesiten interactividad. Síntoma en el build: una ruta que
debería ser estática aparece con más JS del esperado.

El arreglo casi siempre es el mismo: partir el componente en dos. La cáscara
queda en servidor, y solo el pedacito con estado se marca como cliente. En la
ficha, eso significa que el bloque cliente es únicamente `selector de tamaño +
precio + botón agregar` — el resto (nombre, descripción, ingredientes, foto)
queda en servidor.

**2 · Imágenes sin optimizar.** Suele ser el LCP entero. Chequeá: `next/image` en
todos lados, `sizes` correcto cuando usás `fill`, `priority` **solo** en el hero
(ponerlo en todas es peor que no ponerlo en ninguna), y que las fotos originales
no sean de 4000px de ancho para mostrarse a 340.

**3 · Duplicación entre cards.** Cuando entren los geles vas a tener card de
jugo, de shot y de gel. Antes de copiar y pegar: la card es **una sola** que
recibe `Producto` y usa los type guards (`esJugo`, `esShot`, `esGel`) para
decidir qué bloque muestra. Tres componentes casi iguales es la deuda que después
no se paga.

**4 · Formateo de precio repetido.** Si aparece `precio / 100` fuera de
`lib/format.ts`, ya está duplicado. Toda la plata se formatea en un solo lugar.

### El chequeo de "¿escala cuando agregue los geles?"

Buscá en el código cualquier lugar donde las categorías estén escritas a mano:

```bash
grep -rn '"jugos"\|"shots"' app components lib --include="*.tsx" --include="*.ts"
```

Cada resultado fuera de `types/producto.ts` y `lib/catalogo/` es un lugar que vas
a tener que tocar el día del lanzamiento de geles. El objetivo es que esa lista
sea corta y esté concentrada.

El otro chequeo: un `switch (producto.categoria)` **sin** caso `default` hace que
TypeScript te marque el error al agregar `Gel`. Con `default`, se traga el caso
nuevo en silencio y te enterás en producción. Preferí que rompa en compilación.

### Restricción que no se negocia

**El resultado visual no cambia.** Un refactor que además retoca el diseño es
imposible de revisar: cuando algo se ve raro, no sabés si es el refactor o el
cambio de diseño. Una cosa por vez.
