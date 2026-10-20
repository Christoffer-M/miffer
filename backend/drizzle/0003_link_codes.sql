CREATE TABLE "link_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "households" DROP CONSTRAINT "households_linkCode_unique";--> statement-breakpoint
ALTER TABLE "link_codes" ADD CONSTRAINT "link_codes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Added by hand: keep codes that still work, so a deploy doesn't break a link someone was just sent.
INSERT INTO "link_codes" ("code", "household_id", "expires_at")
SELECT "link_code", "id", "link_code_expires_at" FROM "households"
WHERE "link_code" IS NOT NULL AND "link_code_expires_at" > now();--> statement-breakpoint
ALTER TABLE "households" DROP COLUMN "link_code";--> statement-breakpoint
ALTER TABLE "households" DROP COLUMN "link_code_expires_at";