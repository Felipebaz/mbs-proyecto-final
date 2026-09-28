ALTER TABLE "pedido" DROP CONSTRAINT "pedido_estado";--> statement-breakpoint
-- 'pagado' pasa a llamarse 'recibido'. Va entre el DROP y el ADD: con la
-- restricción vieja 'recibido' no entra, con la nueva 'pagado' no pasa.
UPDATE "pedido" SET "estado" = 'recibido' WHERE "estado" = 'pagado';--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_estado" CHECK ("pedido"."estado" in ('pendiente','recibido','aceptado','rechazado','cancelado','reembolsado','entregado'));
