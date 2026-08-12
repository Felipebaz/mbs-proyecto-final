# 03 · El Detective — Debugging

**Cuándo:** cuando algo se rompa.
**Estado:** 📋 Plantilla — necesita un bug real

El campo que más valor aporta es **"qué ya intenté"**: sin eso te van a sugerir
lo obvio que ya descartaste.

## Prompt

````
Actuá como un debugger experto. Analizá este problema de forma metódica.

## El problema
- Qué debería pasar: [ej: "al elegir 910ml en la ficha, el precio se actualiza"]
- Qué pasa en realidad: [ej: "el precio queda en el de 330ml"]
- Mensaje de error: [pegalo exacto, o "no hay error visible"]
- Cuándo ocurre: [siempre / solo a veces / solo en build de producción]

## Código relevante
```
[pegá el componente]
```

## Contexto adicional
- Stack: Next.js App Router, React 19, TypeScript, Tailwind
- Qué ya intenté: [listalo — esto evita que te sugiera lo obvio que ya descartaste]

## Cómo quiero que respondas
1. Hipótesis inicial: 3 causas posibles ordenadas por probabilidad
2. Análisis línea por línea
3. Causa raíz y por qué provoca este comportamiento
4. Solución con el código corregido
5. Prevención: qué patrón evita este tipo de error a futuro
````

---

## Respuesta

No hay bug para analizar todavía: el prompt está listo para cuando aparezca.
Mientras tanto, los cuatro que este stack produce con más frecuencia,
pre-diagnosticados. **Antes de pedir ayuda, chequealos** — probablemente sea uno
de estos.

### Antes de mandar el prompt, junta esto

1. **El error exacto**, copiado, no parafraseado. Nota importante: los errores de
   React vienen **minificados en producción y completos en dev**. Reproducilo en
   `npm run dev` antes de reportar.
2. **Dónde aparece**: terminal (servidor) o consola del navegador (cliente). No
   es el mismo bug según dónde salga.
3. **Si pasa también en build**: `npm run build && npm start`. Un montón de bugs
   de este stack **solo** aparecen en producción, porque en dev todo se
   re-renderiza todo el tiempo y tapa el problema.

### Bug 1 · "Hooks can only be called inside a Client Component"

**Síntoma:** `useState is not a function` o `You're importing a component that
needs useState. This React hook only works in a Client Component.`

**Causa:** en App Router **todo es Server Component por defecto**. Un
`useState`, `useEffect`, `onClick` o `onChange` sin `"use client"` arriba del
archivo rompe.

**Dónde te va a pasar en este proyecto:** `SizeSelector`, `AddToCartButton`,
`QuantityStepper`, `CartIndicator`, el `CartProvider`.

**Fix:** `"use client"` en la **primera línea** del archivo, antes de los imports.

**Prevención:** poné el `"use client"` lo más abajo posible en el árbol. Si lo
ponés en `app/layout.tsx` para "que ande", convertís el sitio entero en cliente y
te fundís el SEO, que es el requisito principal del proyecto.

### Bug 2 · El precio no cambia al elegir 910ml

**Éste es el ejemplo del prompt.** Tres causas, por probabilidad:

1. **La ficha es Server Component y el selector no está aislado.** Si el precio
   se renderiza en el servidor y el selector es cliente, el click cambia el
   estado del selector pero el precio ya se pintó del lado del servidor y no se
   entera. *Fix:* el estado de la variante seleccionada y el precio tienen que
   vivir en el **mismo** componente cliente. La ficha (servidor) le pasa el
   producto entero como prop; el bloque cliente maneja variante + precio juntos.

2. **El estado se inicializa una sola vez y no se actualiza.**
   `useState(producto.variantes[0])` con el producto llegando como prop: si
   navegás de un producto a otro, React reusa el componente y el estado se queda
   con la variante del producto anterior. *Fix:* `key={producto.slug}` en el
   componente, para forzar el remonte.

3. **Se compara mal la variante.** Comparás objetos (`variante === v`) en vez de
   IDs (`varianteId === v.id`). Dos objetos con el mismo contenido no son
   iguales en JS. *Fix:* guardá el `id` en el estado, no el objeto.

**Prevención:** guardá siempre **el ID** en el estado y derivá el objeto:
`const variante = producto.variantes.find(v => v.id === varianteId)`. Una sola
fuente de verdad.

### Bug 3 · Error de hidratación en el carrito

**Síntoma:** `Hydration failed because the server rendered HTML didn't match the
client` o el contador del carrito parpadea de 0 al número real.

**Causa:** el servidor no tiene acceso a `localStorage`, así que renderiza el
carrito vacío. El cliente monta, lee el storage y pinta otra cosa. React compara,
no coinciden, error.

**Fix:** no leas storage durante el render. Leelo en `useEffect` y no muestres
nada hasta que hidrataste:

```tsx
const [montado, setMontado] = useState(false);
useEffect(() => setMontado(true), []);
if (!montado) return null; // o un placeholder de tamaño fijo
```

**Prevención:** cualquier cosa que dependa de `localStorage`, `window`,
`Date.now()` o `Math.random()` es, por definición, distinta en servidor y
cliente. Va en `useEffect`, siempre.

### Bug 4 · Variable de entorno `undefined` en el cliente

**Síntoma:** `process.env.MI_VARIABLE` es `undefined` en el navegador, pero
funciona en el servidor.

**Causa:** Next solo expone al bundle del cliente las variables que arrancan con
`NEXT_PUBLIC_`. Es una protección, no un bug.

**Fix:** renombrala a `NEXT_PUBLIC_MI_VARIABLE` **y reiniciá el dev server** —
las env vars se leen al arrancar, no en caliente.

**Prevención:** el prefijo `NEXT_PUBLIC_` significa "esto se publica en el
JavaScript que descarga cualquiera". Nunca se lo pongas a un token, una API key
privada ni un secreto. Si algo secreto necesita ir al cliente, el diseño está mal
y va detrás de un Route Handler.

### Específico de Next 16 (te va a pasar al menos una vez)

`params` y `searchParams` ahora son **Promises**:

```tsx
// ❌ params.slug es undefined — no rompe, simplemente no anda
export default function Page({ params }) {
  const producto = getProducto(params.slug);
}

// ✅
export default async function Page(props: PageProps<'/productos/[slug]'>) {
  const { slug } = await props.params;
}
```

Es traicionero porque **no tira error**: te da `undefined` y seguís de largo
buscando el problema en otro lado.
