CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"for_device" uuid,
	"created_by" uuid,
	"remind_at" timestamp with time zone,
	"repeat" text,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"notified" boolean DEFAULT false NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_for_device_devices_id_fk" FOREIGN KEY ("for_device") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_created_by_devices_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_household_id_index" ON "reminders" USING btree ("household_id");