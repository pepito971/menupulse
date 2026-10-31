CREATE TABLE "game_vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"code" text NOT NULL,
	"reward" jsonb NOT NULL,
	"product_id" uuid,
	"table_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	CONSTRAINT "game_vouchers_code_uq" UNIQUE("establishment_id","code"),
	CONSTRAINT "game_vouchers_code_check" CHECK ("game_vouchers"."code" ~ '^[A-HJ-NP-Z2-9]{6}$'),
	CONSTRAINT "game_vouchers_expiry_check" CHECK ("game_vouchers"."expires_at" > "game_vouchers"."created_at")
);
--> statement-breakpoint
ALTER TABLE "game_vouchers" ADD CONSTRAINT "game_vouchers_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_vouchers_daily_idx" ON "game_vouchers" USING btree ("establishment_id","game_id","created_at");