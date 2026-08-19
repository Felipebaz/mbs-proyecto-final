# Recetario

Los gramos de cada cosa por botella. **Todo vacío a propósito** — hay que medirlo,
no estimarlo. Un número inventado acá contamina el costo de todo lo demás.

Se separa a propósito de los precios de insumos: la receta cambia una vez al año,
los precios cambian todas las semanas.

```
costo por botella = receta (este archivo) × precios de hoy (planilla aparte)
```

Ver [costos.md](./costos.md) para qué hacer con estos números.

---

## Cómo medir el rendimiento

Una tarde de trabajo, una sola vez por receta. Después sirve para siempre.

Por cada ingrediente, por separado:

1. **Pesar crudo**, como viene del proveedor → `g_bruto`
2. Lavar, pelar, descartar lo que no va
3. **Pesar limpio**, listo para la prensa → `g_neto`
4. Prensar
5. **Medir el jugo** en probeta, no a ojo → `ml_jugo`
6. **Pesar la pulpa** que queda → `g_pulpa`

```
merma        = (g_bruto − g_neto) / g_bruto        cuánto tirás antes de prensar
rendimiento  = ml_jugo / g_neto                    el número que importa
```

Medí con cantidades grandes (1 kg o más). Con 100 g el error de la balanza se
come el resultado.

**La pulpa también anotala.** Es tu número de compost — "X kg de pulpa vuelven a
la tierra por mes" es dato operativo y argumento de marca al mismo tiempo.

---

## Tabla de rendimientos

Se completa una vez. Después alimenta todas las recetas.

| Ingrediente | Merma % | Rendimiento (ml/g) | Medido el | Notas |
|---|---|---|---|---|
| Manzana verde | | | | |
| Manzana | | | | |
| Naranja | | | | |
| Limón | | | | |
| Zanahoria | | | | |
| Remolacha | | | | |
| Pepino | | | | |
| Apio | | | | |
| Espinaca | | | | |
| Kale | | | | |
| Brócoli | | | | |
| Menta | | | | |
| Jengibre | | | | |
| Cúrcuma | | | | |
| Pimienta negra | | | | |

Ojo con los dos extremos: hoja verde (espinaca, kale) y raíz picante (jengibre,
cúrcuma) rinden mucho menos que fruta o pepino. Ahí es donde se va la plata sin
que se note.

---

## Recetas

Gramos **netos** — ya lavado y pelado, listo para prensar.

### Jugo Verde

| Ingrediente | g / 330 ml | g / 910 ml |
|---|---|---|
| Pepino | | |
| Manzana verde | | |
| Espinaca | | |
| Apio | | |
| Limón | | |
| Kale | | |
| Brócoli | | |
| Jengibre | | |
| **Total** | | |

> La espinaca es el ingrediente de mayor carga de oxalato del catálogo
> (~970 mg/100 g). Anotar los gramos importa para el aviso del pack.
> Ver [beneficios-evidencia.md](./beneficios-evidencia.md).

### Jugo Naranja

| Ingrediente | g / 330 ml | g / 910 ml |
|---|---|---|
| Naranja | | |
| Zanahoria | | |
| Limón | | |
| Cúrcuma | | |
| Jengibre | | |
| Menta | | |
| **Total** | | |

### Jugo Rojo

| Ingrediente | g / 330 ml | g / 910 ml |
|---|---|---|
| Pepino | | |
| **Remolacha** | | |
| Manzana verde | | |
| Limón | | |
| Apio | | |
| Jengibre | | |
| Cúrcuma | | |
| **Total** | | |

### Jugo ABC

| Ingrediente | g / 330 ml | g / 910 ml |
|---|---|---|
| Manzana | | |
| **Remolacha** | | |
| Zanahoria | | |
| Limón | | |
| **Total** | | |

### Shot de Jengibre y Cúrcuma

| Ingrediente | g / 330 ml |
|---|---|
| Jengibre | |
| Cúrcuma | |
| Limón | |
| Naranja | |
| Pimienta negra | |
| **Total** | |

> Dosis definida: **55 ml**, 6 dosis por botella.
> El costo que importa comunicar es **por dosis**, no por botella.

---

## Lo que se desbloquea al completar esto

**1. Costo real por botella**
Sin rendimiento no hay costo. Comprás kilos y vendés mililitros: sin el puente
entre las dos unidades, cualquier número de margen es inventado.

**2. El claim de nitratos de remolacha** ← pendiente desde hace rato

La dosis efectiva en los ensayos es ~400 mg de nitrato. La remolacha fresca
aporta del orden de 250 mg por 100 g.

```
nitrato por botella ≈ (g de remolacha / 100) × 250 mg
```

| Gramos de remolacha en 330 ml | Nitrato aprox. | ¿Se sostiene el claim? |
|---|---|---|
| 50 g | ~125 mg | No |
| 100 g | ~250 mg | Justo, flojo |
| **160 g** | **~400 mg** | **Sí, dosis de ensayo** |

Aplica al **Rojo** y al **ABC**. Si ninguno llega, hay dos caminos: subir la
remolacha, o no hacer el claim. No hay tercero.

**3. Compras**
"Necesito 40 botellas para la semana" → cuántos kilos de cada cosa pedir.
Se calcula solo: `g por botella × botellas ÷ (1 − merma)`.

**4. Estandarización**
Dos tandas del mismo jugo tienen que saber igual. Sin receta escrita en gramos,
eso depende de quién esté prensando ese día.
