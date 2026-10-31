ALTER TABLE "users" ADD COLUMN "password_change_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_organization_id_uq" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "member_establishments" ADD CONSTRAINT "member_establishments_establishment_fk" FOREIGN KEY ("organization_id","establishment_id") REFERENCES "public"."establishments"("organization_id","id") ON DELETE cascade ON UPDATE no action;
