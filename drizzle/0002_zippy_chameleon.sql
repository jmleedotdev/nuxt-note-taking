CREATE TABLE "appearance_preferences" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"font" text DEFAULT 'inter' NOT NULL,
	CONSTRAINT "appearance_theme" CHECK ("appearance_preferences"."theme" IN ('light', 'dark', 'system')),
	CONSTRAINT "appearance_font" CHECK ("appearance_preferences"."font" IN ('inter', 'noto-serif', 'source-code-pro'))
);
--> statement-breakpoint
ALTER TABLE "appearance_preferences" ADD CONSTRAINT "appearance_preferences_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;