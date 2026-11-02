CREATE TABLE "watch" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"tmdb_id" integer,
	"year" integer,
	"poster_path" text,
	"added_by" uuid,
	"watched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch" ADD CONSTRAINT "watch_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch" ADD CONSTRAINT "watch_added_by_devices_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "watch_household_id_kind_tmdb_id_index" ON "watch" USING btree ("household_id","kind","tmdb_id");