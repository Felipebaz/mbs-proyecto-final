CREATE TABLE "token_correo" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"usado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_correo_tipo" CHECK ("token_correo"."tipo" in ('verificacion', 'reset'))
);
--> statement-breakpoint
ALTER TABLE "token_correo" ADD CONSTRAINT "token_correo_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_correo_usuario_idx" ON "token_correo" USING btree ("usuario_id","tipo");--> statement-breakpoint
CREATE INDEX "token_correo_expira_idx" ON "token_correo" USING btree ("expira_en");