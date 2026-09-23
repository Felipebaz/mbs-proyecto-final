CREATE TABLE "evento_pago" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text,
	"tipo" text,
	"id_pago_mp" text,
	"firma_valida" boolean NOT NULL,
	"motivo_rechazo" text,
	"procesado_en" timestamp with time zone,
	"recibido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pago" (
	"id_pago_mp" text PRIMARY KEY NOT NULL,
	"pedido_id" uuid NOT NULL,
	"estado" text NOT NULL,
	"detalle_estado" text,
	"monto" integer NOT NULL,
	"moneda" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referencia" text NOT NULL,
	"usuario_id" uuid,
	"origen" text DEFAULT 'web' NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"total" integer NOT NULL,
	"moneda" text DEFAULT 'UYU' NOT NULL,
	"nombre_entrega" text NOT NULL,
	"telefono" text NOT NULL,
	"direccion" text NOT NULL,
	"notas" text,
	"botellas_devueltas" smallint DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"pagado_en" timestamp with time zone,
	CONSTRAINT "pedido_referencia_unique" UNIQUE("referencia"),
	CONSTRAINT "pedido_total_no_negativo" CHECK ("pedido"."total" >= 0),
	CONSTRAINT "pedido_estado" CHECK ("pedido"."estado" in ('pendiente','pagado','rechazado','cancelado','reembolsado','entregado')),
	CONSTRAINT "pedido_origen" CHECK ("pedido"."origen" in ('web','manual'))
);
--> statement-breakpoint
CREATE TABLE "pedido_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"descripcion" text NOT NULL,
	"cantidad" smallint NOT NULL,
	"precio_unitario" integer NOT NULL,
	"envase_unitario" integer NOT NULL,
	"botellas" smallint NOT NULL,
	"configuracion" jsonb,
	CONSTRAINT "pedido_item_cantidad" CHECK ("pedido_item"."cantidad" between 1 and 50),
	CONSTRAINT "pedido_item_precio" CHECK ("pedido_item"."precio_unitario" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pago" ADD CONSTRAINT "pago_pedido_id_pedido_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedido"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_item" ADD CONSTRAINT "pedido_item_pedido_id_pedido_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedido"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evento_pago_recibido_idx" ON "evento_pago" USING btree ("recibido_en");--> statement-breakpoint
CREATE INDEX "pago_pedido_idx" ON "pago" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "pedido_usuario_idx" ON "pedido" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "pedido_estado_idx" ON "pedido" USING btree ("estado","creado_en");--> statement-breakpoint
CREATE INDEX "pedido_item_pedido_idx" ON "pedido_item" USING btree ("pedido_id");