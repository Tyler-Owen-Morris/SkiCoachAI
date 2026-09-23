CREATE SCHEMA IF NOT EXISTS "skicoach";
--> statement-breakpoint
CREATE TABLE "skicoach"."coaches" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"auth_mode" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skicoach"."notes" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"coach_id" varchar(64) NOT NULL,
	"skier_id" varchar(64),
	"content" text NOT NULL,
	"device_transcript" text,
	"cloud_transcript" text,
	"transcript_source" varchar(16) NOT NULL,
	"assignment_status" varchar(16) NOT NULL,
	"user_edited" boolean DEFAULT false NOT NULL,
	"has_audio" boolean DEFAULT false NOT NULL,
	"audio_duration_ms" integer,
	"recorded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"client_updated_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skicoach"."skiers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"coach_id" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"level" varchar(32) NOT NULL,
	"age" integer,
	"initial_notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"client_updated_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skicoach"."summaries" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"coach_id" varchar(64) NOT NULL,
	"skier_id" varchar(64) NOT NULL,
	"status" varchar(16) NOT NULL,
	"content" text,
	"error" text,
	"note_count" integer,
	"requested_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skicoach"."notes" ADD CONSTRAINT "notes_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "skicoach"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skicoach"."skiers" ADD CONSTRAINT "skiers_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "skicoach"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skicoach"."summaries" ADD CONSTRAINT "summaries_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "skicoach"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_coach_updated_idx" ON "skicoach"."notes" USING btree ("coach_id","updated_at");--> statement-breakpoint
CREATE INDEX "notes_skier_idx" ON "skicoach"."notes" USING btree ("skier_id");--> statement-breakpoint
CREATE INDEX "skiers_coach_updated_idx" ON "skicoach"."skiers" USING btree ("coach_id","updated_at");--> statement-breakpoint
CREATE INDEX "summaries_coach_updated_idx" ON "skicoach"."summaries" USING btree ("coach_id","updated_at");