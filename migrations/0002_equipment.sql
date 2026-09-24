ALTER TABLE "skicoach"."notes" ADD COLUMN "equipment" varchar(16) DEFAULT 'ski' NOT NULL;--> statement-breakpoint
ALTER TABLE "skicoach"."skiers" ADD COLUMN "equipment" varchar(16) DEFAULT 'ski' NOT NULL;--> statement-breakpoint
ALTER TABLE "skicoach"."summaries" ADD COLUMN "equipment" varchar(16) DEFAULT 'ski' NOT NULL;