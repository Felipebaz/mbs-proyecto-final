CREATE TABLE "ingrediente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"unidad" text NOT NULL,
	"proveedor" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingrediente_nombre_unique" UNIQUE("nombre"),
	CONSTRAINT "ingrediente_unidad" CHECK ("ingrediente"."unidad" in ('g','ml','unidad'))
);
--> statement-breakpoint
CREATE TABLE "precio_ingrediente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingrediente_id" uuid NOT NULL,
	"precio_por_unidad" integer NOT NULL,
	"nota" text,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"registrado_por" uuid,
	CONSTRAINT "precio_ingrediente_no_negativo" CHECK ("precio_ingrediente"."precio_por_unidad" >= 0)
);
--> statement-breakpoint
CREATE TABLE "receta" (
	"sku" text NOT NULL,
	"ingrediente_id" uuid NOT NULL,
	"cantidad" integer NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receta_sku_ingrediente_id_pk" PRIMARY KEY("sku","ingrediente_id"),
	CONSTRAINT "receta_cantidad_positiva" CHECK ("receta"."cantidad" > 0)
);
--> statement-breakpoint
ALTER TABLE "precio_ingrediente" ADD CONSTRAINT "precio_ingrediente_ingrediente_id_ingrediente_id_fk" FOREIGN KEY ("ingrediente_id") REFERENCES "public"."ingrediente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta" ADD CONSTRAINT "receta_ingrediente_id_ingrediente_id_fk" FOREIGN KEY ("ingrediente_id") REFERENCES "public"."ingrediente"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "precio_ingrediente_idx" ON "precio_ingrediente" USING btree ("ingrediente_id","desde");