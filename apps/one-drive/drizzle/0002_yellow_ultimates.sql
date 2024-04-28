ALTER TABLE "share-point" DROP CONSTRAINT "share-point_organisation_id_organisations_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share-point" ADD CONSTRAINT "share-point_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
