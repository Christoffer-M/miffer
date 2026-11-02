ALTER TABLE "watch" ADD COLUMN "season" integer;--> statement-breakpoint
ALTER TABLE "watch" ADD COLUMN "episode" integer;--> statement-breakpoint
ALTER TABLE "watch" ADD COLUMN "progress_at" timestamp with time zone;