ALTER TABLE "usuario" ADD COLUMN "rol" text DEFAULT 'cliente' NOT NULL;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_rol" CHECK ("usuario"."rol" in ('cliente', 'admin'));