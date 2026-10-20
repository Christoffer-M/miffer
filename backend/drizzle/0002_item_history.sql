CREATE TABLE "item_history" (
	"household_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"last_added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_history_household_id_key_pk" PRIMARY KEY("household_id","key")
);
--> statement-breakpoint
ALTER TABLE "item_history" ADD CONSTRAINT "item_history_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Start each household's history from what's on its list now.
INSERT INTO "item_history" ("household_id", "key", "name", "count")
SELECT "household_id", lower("name"), min("name"), count(*)::integer FROM "items" GROUP BY "household_id", lower("name");
