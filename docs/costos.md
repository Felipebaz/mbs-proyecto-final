# Costos y precios

Qué medir para saber si los precios están bien. **Los números van vacíos a
propósito** — se completan midiendo, no estimando.

Precios de venta vigentes (con IVA):

| | Precio | Envase | Góndola |
|---|---|---|---|
| Jugo 330 ml | $250 | $20 | **$270** |
| Jugo 910 ml | $500 | $30 | **$530** |
| Shot 330 ml | $350 | $20 | **$370** |
| Pack 5 botellas | $1.100 | $100 | **$1.200** |
| Pack 4 botellas | $880 | $80 | **$960** |

---

## 1. El descuento del pack no sale de la materia prima

La objeción es correcta: **no comprás más barato por comprar más.** Un pack de 5
no te baja el precio del kilo de remolacha.

Pero el descuento no se paga con materia prima. Se paga con esto:

| Concepto | 5 ventas sueltas | 1 pack de 5 | Ahorro |
|---|---|---|---|
| Viajes de reparto | 5 | 1 | |
| Comisiones de pago | 5 transacciones | 1 | |
| Armado de pedido | 5 veces | 1 | |
| Previsión de producción | ninguna | sabés qué producir | |
| Momento de cobro | 5 veces, disperso | adelantado | |

### Planilla para decidir el descuento

Completá con tus números reales:

```
A. Costo de un reparto (combustible + tu hora)            $ ______
B. Comisión por transacción (% + fijo)                    $ ______  + ____%
C. Minutos de armado por pedido × tu costo/hora           $ ______

Ahorro del pack de 5 = 4×A + (5×B − 1×B) + 4×C           = $ ______

Descuento actual del pack de 5                            = $   150
```

**Si el ahorro supera $150, el descuento está pago.** Si no, hay que bajarlo o
sacarlo — y con la estructura actual eso son dos números (`precio: 110000` y
`precio: 88000` en `lib/catalogo/productos.ts`).

**Caso sin reparto:** si vendés solo con retiro en local, `A = 0` y la cuenta se
cae. Ahí el descuento del pack es regalo, salvo que lo justifiques por recompra.

> El descuento nunca toca el envase. El vidrio es costo, no margen.

---

## 2. El número que falta: rendimiento

**Comprás kilos. Vendés mililitros.** Sin el puente entre las dos unidades no hay
costo posible, y cualquier margen que calcules es ficción.

Se mide una vez por ingrediente. Protocolo y tablas en
[recetas.md](./recetas.md).

```
costo materia prima por botella = Σ (gramos del ingrediente × $/kg ÷ 1000)
                                  ajustado por merma
```

---

## 3. Qué registrar

### Por receta — estable, cambia una vez al año
- Gramos de cada ingrediente por botella → [recetas.md](./recetas.md)
- Rendimiento medido (ml de jugo por gramo neto)
- Merma antes de prensar

### Por insumo — volátil, cambia todas las semanas
- Precio por kg, por proveedor
- Estacionalidad (la remolacha de invierno no vale lo mismo que la de verano)
- Envase: botella + tapa + etiqueta, por unidad

> **Esto va en una planilla, no en el código.** Cambian demasiado seguido; ponerlos
> en el repo obliga a hacer deploy para actualizar el precio de una remolacha.

### Por lote de producción
- Botellas producidas
- Horas de trabajo
- **Botellas descartadas por vencimiento** ← la que duele y nadie anota
- Kg de pulpa a compost

### Costos que no son producto
- Refrigeración (corre 24/7, produzcas o no)
- Reparto: combustible + tiempo, o costo de courier
- Comisión de medios de pago
- Alquiler / espacio
- Etiquetas e impresión

---

## 4. Métricas

| Métrica | Cómo se calcula | Referencia | Tu número |
|---|---|---|---|
| **Food cost** | costo insumos ÷ precio de venta | 20-25% en bebidas | |
| **Margen bruto** | (precio − costo variable) ÷ precio | | |
| **Margen por SKU** | uno por uno, no el promedio | | |
| **Punto de equilibrio** | costos fijos ÷ margen unitario | botellas/mes | |
| **Merma por vencimiento** | descartadas ÷ producidas | | |
| **Ticket promedio** | | el pack existe para subirlo | |
| **Tasa de recompra** | | acá se define si el negocio existe | |

### El margen por SKU es el que importa

El promedio esconde al que pierde plata. Un producto puede estar subsidiando a
otro durante meses sin que nadie se entere.

**Sospecha concreta:** el **shot** puede ser el de peor margen del catálogo, aunque
sea el más caro por ml. El jengibre y la cúrcuma son de los peores rendimientos
que hay — 330 ml de jugo de raíz se comen muchísimos kilos. Es la primera receta
que mediría.

---

## 5. Dos cosas de Uruguay que muerden

**Los precios de arriba incluyen IVA.** Para comparar contra costos hay que
trabajar con precios **netos**. Comparar precio con IVA contra costo sin IVA
infla el margen y es el error de costeo más común que existe.

```
precio neto = precio con IVA ÷ (1 + tasa)
```

**IVA de frutas y verduras.** Si comprás insumos exentos o a tasa mínima pero
vendés a tasa básica, no tenés crédito fiscal para descontar y el margen real es
menor de lo que parece. **Confirmá la tasa que te corresponde con tu contador
antes de fijar precios finales** — cambia todos los números de este archivo.

---

## 6. Sobre el envase

Hoy el envase se cobra aparte y **no vuelve**: $20 en los jugos de 330 y el shot,
$30 en el de 910.

En un pack de 5 son **$100 de vidrio** en un ticket de $1.200 — 8%. El cliente lo
lee como recargo, y tu competencia directa no lo cobra por separado.

La alternativa es el **depósito retornable**: "traé las 5 botellas y el próximo
pack te sale $100 menos". Te cuesta exactamente el vidrio que recuperás, genera
recompra, y es la marca de cero residuo funcionando de verdad en vez de ser un
párrafo en la landing.

Para decidirlo hacen falta tres números:

```
Costo de una botella nueva                          $ ______
Costo de lavar y sanitizar una retornada            $ ______
% de botellas que estimás que vuelven                 ______%
```

Si lavar sale menos que comprar nueva, el sistema se paga solo. Si el retorno es
muy bajo, no.

---

## 7. Orden para atacarlo

1. **Medir rendimiento** de una receta — la del shot primero, es la sospechosa
2. **Completar el recetario** en gramos
3. **Planilla de precios de insumos**, actualizada al comprar
4. **Costo y margen por SKU** — recién acá sabés si $250 está bien
5. **Costo de reparto y comisiones** — recién acá sabés si el descuento del pack
   se sostiene
6. **Decidir el envase**: retornable o no

Hasta el paso 4, cualquier discusión sobre precios es opinión. Después es cuenta.
