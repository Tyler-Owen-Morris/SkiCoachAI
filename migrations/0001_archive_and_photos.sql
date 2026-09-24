CREATE TABLE "skicoach"."skier_photos" (
	"skier_id" varchar(64) PRIMARY KEY NOT NULL,
	"coach_id" varchar(64) NOT NULL,
	"photo" text,
	"thumb" text,
	"client_updated_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skicoach"."skiers" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skicoach"."skiers" ADD COLUMN "photo_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skicoach"."skier_photos" ADD CONSTRAINT "skier_photos_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "skicoach"."coaches"("id") ON DELETE no action ON UPDATE no action;