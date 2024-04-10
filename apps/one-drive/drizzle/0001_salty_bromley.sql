CREATE TABLE IF NOT EXISTS "share-point" (
	"organisation_id" uuid NOT NULL,
	"site_id" text NOT NULL,
	"drive_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"subscription_expiration_date" text NOT NULL,
	"delta" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unic_drive" UNIQUE("organisation_id","drive_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share-point" ADD CONSTRAINT "share-point_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
