CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"usuario_email" text,
	"accion" text NOT NULL,
	"objetivo" text,
	"detalle" jsonb,
	"ip" text,
	"user_agent" text,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auditoria_accion" CHECK ("auditoria"."accion" in ('precio_cambiado','pedido_estado_cambiado','datos_exportados','rol_cambiado','2fa_activado','2fa_desactivado','login_admin'))
);
--> statement-breakpoint
CREATE TABLE "codigo_respaldo" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"usado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sesion" ADD COLUMN "factor2_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "totp_secreto" text;--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "totp_activado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "codigo_respaldo" ADD CONSTRAINT "codigo_respaldo_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_ocurrido_idx" ON "auditoria" USING btree ("ocurrido_en");--> statement-breakpoint
CREATE INDEX "auditoria_usuario_idx" ON "auditoria" USING btree ("usuario_id","ocurrido_en");--> statement-breakpoint
CREATE INDEX "auditoria_accion_idx" ON "auditoria" USING btree ("accion","ocurrido_en");--> statement-breakpoint
CREATE INDEX "codigo_respaldo_usuario_idx" ON "codigo_respaldo" USING btree ("usuario_id");--> statement-breakpoint
-- La bitácora es sólo-inserción, y eso se hace cumplir en la base.
--
-- Sin esto, quien tenga las credenciales de la aplicación puede reescribir o
-- borrar el rastro de lo que hizo —que es exactamente lo que haría alguien que
-- no quiere que se vea—, y la bitácora deja de servir como evidencia.
--
-- Por esto mismo `auditoria.usuario_id` NO tiene foreign key: un
-- `on delete set null` dispararía un UPDATE interno sobre esta tabla y el
-- trigger lo rechazaría, dejando imposible borrar cualquier usuario.
--
-- Un superusuario puede desactivar el trigger; la idea no es frenar a alguien
-- con acceso total a Postgres, sino que nadie lo altere por error ni desde la
-- aplicación.
CREATE OR REPLACE FUNCTION auditoria_solo_insercion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'auditoria es solo-insercion: no se permite %', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER auditoria_sin_update
  BEFORE UPDATE ON "auditoria"
  FOR EACH ROW EXECUTE FUNCTION auditoria_solo_insercion();
--> statement-breakpoint
CREATE TRIGGER auditoria_sin_delete
  BEFORE DELETE ON "auditoria"
  FOR EACH ROW EXECUTE FUNCTION auditoria_solo_insercion();
