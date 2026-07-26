CREATE TABLE `wa_pending_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`phone_e164` text NOT NULL,
	`action_type` text NOT NULL,
	`payload` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wa_pending_phone_idx` ON `wa_pending_confirmations` (`phone_e164`);