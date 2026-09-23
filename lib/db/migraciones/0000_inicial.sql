CREATE TABLE "carrito" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"cookie_id" text,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carrito_usuario_id_unique" UNIQUE("usuario_id"),
	CONSTRAINT "carrito_cookie_id_unique" UNIQUE("cookie_id"),
	CONSTRAINT "carrito_un_solo_dueno" CHECK (("carrito"."usuario_id" is null) != ("carrito"."cookie_id" is null))
);
--> statement-breakpoint
CREATE TABLE "carrito_linea" (
	"carrito_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"configuracion" jsonb,
	"huella" text DEFAULT '' NOT NULL,
	"cantidad" smallint NOT NULL,
	CONSTRAINT "carrito_linea_carrito_id_sku_huella_pk" PRIMARY KEY("carrito_id","sku","huella"),
	CONSTRAINT "carrito_linea_cantidad" CHECK ("carrito_linea"."cantidad" between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "cuenta_oauth" (
	"proveedor" text NOT NULL,
	"proveedor_usuario_id" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuenta_oauth_proveedor_proveedor_usuario_id_pk" PRIMARY KEY("proveedor","proveedor_usuario_id")
);
--> statement-breakpoint
CREATE TABLE "sesion" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verificado" boolean DEFAULT false NOT NULL,
	"nombre" text,
	"password_hash" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_email_unique" UNIQUE("email"),
	CONSTRAINT "usuario_email_minusculas" CHECK ("usuario"."email" = lower("usuario"."email"))
);
--> statement-breakpoint
ALTER TABLE "carrito" ADD CONSTRAINT "carrito_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrito_linea" ADD CONSTRAINT "carrito_linea_carrito_id_carrito_id_fk" FOREIGN KEY ("carrito_id") REFERENCES "public"."carrito"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuenta_oauth" ADD CONSTRAINT "cuenta_oauth_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "carrito_actualizado_idx" ON "carrito" USING btree ("actualizado_en");--> statement-breakpoint
CREATE INDEX "cuenta_oauth_usuario_idx" ON "cuenta_oauth" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sesion_usuario_idx" ON "sesion" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sesion_expira_idx" ON "sesion" USING btree ("expira_en");