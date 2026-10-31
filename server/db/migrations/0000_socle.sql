CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"module" text NOT NULL,
	"name" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "categories_tenant_id_uq" UNIQUE("establishment_id","id"),
	CONSTRAINT "categories_module_check" CHECK ("categories"."module" IN ('tapsy', 'tableo')),
	CONSTRAINT "categories_name_check" CHECK (jsonb_typeof("categories"."name") = 'object' AND "categories"."name" <> '{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"label" text NOT NULL,
	"qr_token" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "dining_tables_qrToken_unique" UNIQUE("qr_token"),
	CONSTRAINT "dining_tables_tenant_id_uq" UNIQUE("establishment_id","id"),
	CONSTRAINT "dining_tables_label_uq" UNIQUE("establishment_id","label")
);
--> statement-breakpoint
CREATE TABLE "establishment_games" (
	"establishment_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "establishment_games_establishment_id_game_id_pk" PRIMARY KEY("establishment_id","game_id"),
	CONSTRAINT "establishment_games_id_check" CHECK ("establishment_games"."game_id" ~ '^[a-z][a-z0-9-]{1,31}$')
);
--> statement-breakpoint
CREATE TABLE "establishment_modules" (
	"establishment_id" uuid NOT NULL,
	"module" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "establishment_modules_establishment_id_module_pk" PRIMARY KEY("establishment_id","module"),
	CONSTRAINT "establishment_modules_module_check" CHECK ("establishment_modules"."module" IN ('tapsy', 'tableo')),
	CONSTRAINT "establishment_modules_status_check" CHECK ("establishment_modules"."status" IN ('active', 'paused'))
);
--> statement-breakpoint
CREATE TABLE "establishments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"default_locale" text DEFAULT 'fr' NOT NULL,
	"locales" text[] DEFAULT '{fr}'::text[] NOT NULL,
	"brand_color" text,
	"forced_theme" text,
	"games_open_until" timestamp with time zone,
	"menu_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "establishments_slug_unique" UNIQUE("slug"),
	CONSTRAINT "establishments_slug_check" CHECK ("establishments"."slug" ~ '^[a-z0-9-]{3,48}$'),
	CONSTRAINT "establishments_locales_check" CHECK ("establishments"."locales" <@ ARRAY['fr', 'en']::text[] AND "establishments"."default_locale" = ANY("establishments"."locales")),
	CONSTRAINT "establishments_brand_color_check" CHECK ("establishments"."brand_color" IS NULL OR "establishments"."brand_color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "establishments_theme_check" CHECK ("establishments"."forced_theme" IS NULL OR "establishments"."forced_theme" IN ('light', 'dark'))
);
--> statement-breakpoint
CREATE TABLE "formula_step_items" (
	"establishment_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"supplement_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "formula_step_items_step_id_product_id_pk" PRIMARY KEY("step_id","product_id"),
	CONSTRAINT "formula_step_items_supplement_check" CHECK ("formula_step_items"."supplement_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "formula_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"formula_id" uuid NOT NULL,
	"label" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"min_choices" smallint DEFAULT 1 NOT NULL,
	"max_choices" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "formula_steps_tenant_id_uq" UNIQUE("establishment_id","id"),
	CONSTRAINT "formula_steps_choices_check" CHECK ("formula_steps"."min_choices" >= 0 AND "formula_steps"."max_choices" >= GREATEST("formula_steps"."min_choices", 1))
);
--> statement-breakpoint
CREATE TABLE "formulas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"price_cents" integer NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "formulas_tenant_id_uq" UNIQUE("establishment_id","id"),
	CONSTRAINT "formulas_price_check" CHECK ("formulas"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "game_content_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid,
	"game_id" text NOT NULL,
	"name" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"content_version" smallint DEFAULT 1 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_content_packs_id_check" CHECK ("game_content_packs"."game_id" ~ '^[a-z][a-z0-9-]{1,31}$')
);
--> statement-breakpoint
CREATE TABLE "game_hall_of_fame" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"period" text NOT NULL,
	"period_start" date NOT NULL,
	"pseudo" text NOT NULL,
	"score" integer NOT NULL,
	"achieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_hall_of_fame_period_uq" UNIQUE("establishment_id","game_id","period","period_start"),
	CONSTRAINT "game_hall_of_fame_period_check" CHECK ("game_hall_of_fame"."period" IN ('week', 'month')),
	CONSTRAINT "game_hall_of_fame_pseudo_check" CHECK (char_length("game_hall_of_fame"."pseudo") BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"game_version" smallint NOT NULL,
	"room_kind" text NOT NULL,
	"table_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"player_count" smallint NOT NULL,
	"end_reason" text,
	CONSTRAINT "game_sessions_room_check" CHECK (("game_sessions"."room_kind" = 'table') = ("game_sessions"."table_id" IS NOT NULL)),
	CONSTRAINT "game_sessions_players_check" CHECK ("game_sessions"."player_count" >= 1),
	CONSTRAINT "game_sessions_end_check" CHECK ("game_sessions"."end_reason" IS NULL OR "game_sessions"."end_reason" IN ('finished', 'abandoned', 'server_restart'))
);
--> statement-breakpoint
CREATE TABLE "happy_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"label" jsonb,
	"weekdays" smallint[] NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "happy_hours_weekdays_check" CHECK (cardinality("happy_hours"."weekdays") > 0 AND "happy_hours"."weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]),
	CONSTRAINT "happy_hours_range_check" CHECK ("happy_hours"."starts_at" <> "happy_hours"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "member_establishments" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"establishment_id" uuid NOT NULL,
	CONSTRAINT "member_establishments_organization_id_user_id_establishment_id_pk" PRIMARY KEY("organization_id","user_id","establishment_id")
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "organization_members_role_check" CHECK ("organization_members"."role" IN ('owner', 'manager', 'staff'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"price_cents" integer NOT NULL,
	"happy_hour_price_cents" integer,
	"abv" numeric(4, 1),
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"may_contain" text[] DEFAULT '{}'::text[] NOT NULL,
	"diets" text[] DEFAULT '{}'::text[] NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"image_key" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"board_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_tenant_id_uq" UNIQUE("establishment_id","id"),
	CONSTRAINT "products_kind_check" CHECK ("products"."kind" IN ('drink', 'dish')),
	CONSTRAINT "products_name_check" CHECK (jsonb_typeof("products"."name") = 'object' AND "products"."name" <> '{}'::jsonb),
	CONSTRAINT "products_price_check" CHECK ("products"."price_cents" >= 0 AND ("products"."happy_hour_price_cents" IS NULL OR "products"."happy_hour_price_cents" BETWEEN 0 AND "products"."price_cents")),
	CONSTRAINT "products_abv_check" CHECK ("products"."abv" IS NULL OR ("products"."kind" = 'drink' AND "products"."abv" BETWEEN 0 AND 100)),
	CONSTRAINT "products_allergens_check" CHECK ("products"."allergens" <@ ARRAY['gluten', 'crustaces', 'oeufs', 'poissons', 'arachides', 'soja', 'lait', 'fruits_a_coque', 'celeri', 'moutarde', 'sesame', 'sulfites', 'lupin', 'mollusques']::text[] AND "products"."may_contain" <@ ARRAY['gluten', 'crustaces', 'oeufs', 'poissons', 'arachides', 'soja', 'lait', 'fruits_a_coque', 'celeri', 'moutarde', 'sesame', 'sulfites', 'lupin', 'mollusques']::text[]),
	CONSTRAINT "products_diets_check" CHECK ("products"."diets" <@ ARRAY['vegetarien', 'vegan']::text[])
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "establishment_games" ADD CONSTRAINT "establishment_games_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "establishment_modules" ADD CONSTRAINT "establishment_modules_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formula_step_items" ADD CONSTRAINT "formula_step_items_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formula_step_items" ADD CONSTRAINT "formula_step_items_step_fk" FOREIGN KEY ("establishment_id","step_id") REFERENCES "public"."formula_steps"("establishment_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formula_step_items" ADD CONSTRAINT "formula_step_items_product_fk" FOREIGN KEY ("establishment_id","product_id") REFERENCES "public"."products"("establishment_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formula_steps" ADD CONSTRAINT "formula_steps_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formula_steps" ADD CONSTRAINT "formula_steps_formula_fk" FOREIGN KEY ("establishment_id","formula_id") REFERENCES "public"."formulas"("establishment_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_content_packs" ADD CONSTRAINT "game_content_packs_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_hall_of_fame" ADD CONSTRAINT "game_hall_of_fame_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_table_fk" FOREIGN KEY ("establishment_id","table_id") REFERENCES "public"."dining_tables"("establishment_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "happy_hours" ADD CONSTRAINT "happy_hours_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_establishments" ADD CONSTRAINT "member_establishments_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_establishments" ADD CONSTRAINT "member_establishments_member_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_members"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_establishment_id_establishments_id_fk" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_fk" FOREIGN KEY ("establishment_id","category_id") REFERENCES "public"."categories"("establishment_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_menu_idx" ON "categories" USING btree ("establishment_id","module","position");--> statement-breakpoint
CREATE INDEX "establishments_organization_idx" ON "establishments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "game_content_packs_lookup_idx" ON "game_content_packs" USING btree ("game_id","establishment_id");--> statement-breakpoint
CREATE INDEX "game_sessions_establishment_idx" ON "game_sessions" USING btree ("establishment_id","started_at");--> statement-breakpoint
CREATE INDEX "happy_hours_establishment_idx" ON "happy_hours" USING btree ("establishment_id");--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "products_menu_idx" ON "products" USING btree ("establishment_id","category_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));