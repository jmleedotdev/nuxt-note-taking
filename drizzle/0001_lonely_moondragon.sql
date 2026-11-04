CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"last_edited" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "notes_positive_version" CHECK ("notes"."version" > 0),
	CONSTRAINT "notes_title_length" CHECK (char_length(btrim("notes"."title")) BETWEEN 1 AND 200),
	CONSTRAINT "notes_content_length" CHECK (char_length("notes"."content") <= 100000),
	CONSTRAINT "notes_tag_count" CHECK (cardinality("notes"."tags") <= 20)
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_owner_order_idx" ON "notes" USING btree ("owner_id","is_archived","last_edited","id");
--> statement-breakpoint
-- Identity and ownership survive every later note mutation unchanged.
CREATE FUNCTION protect_note_identity() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Note identity and ownership are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER notes_immutable_identity BEFORE UPDATE ON notes
FOR EACH ROW EXECUTE FUNCTION protect_note_identity();