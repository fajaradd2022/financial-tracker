CREATE TABLE `cash_wallet_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entry_type` text NOT NULL,
	`amount` integer NOT NULL,
	`transaction_id` text,
	`category_id` text,
	`note` text,
	`occurred_at` text NOT NULL,
	`origin` text DEFAULT 'manual_web' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `cash_entries_user_occurred_at_idx` ON `cash_wallet_entries` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`system_key` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `categories_user_idx` ON `categories` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_name_kind_unique` ON `categories` (`user_id`,`name`,`kind`);--> statement-breakpoint
CREATE TABLE `ingestion_config` (
	`user_id` text PRIMARY KEY NOT NULL,
	`inbox_email` text DEFAULT '' NOT NULL,
	`poll_interval_minutes` integer DEFAULT 12 NOT NULL,
	`backfill_enabled` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`last_polled_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `own_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bank` text NOT NULL,
	`account_number_or_identifier` text NOT NULL,
	`label` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `own_accounts_user_number_idx` ON `own_accounts` (`user_id`,`account_number_or_identifier`);--> statement-breakpoint
CREATE UNIQUE INDEX `own_accounts_user_bank_number_unique` ON `own_accounts` (`user_id`,`bank`,`account_number_or_identifier`);--> statement-breakpoint
CREATE TABLE `source_health` (
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`email_supported` integer,
	`last_seen_at` text,
	`note` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`user_id`, `source`)
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`direction` text NOT NULL,
	`amount` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`counterparty_name` text,
	`counterparty_account_number` text,
	`raw_transaction_type` text,
	`origin` text DEFAULT 'email' NOT NULL,
	`gmail_message_id` text,
	`raw_email_snippet` text,
	`llm_raw_response` text,
	`extraction_confidence` text DEFAULT 'high' NOT NULL,
	`category_id` text,
	`is_internal_transfer` integer DEFAULT false NOT NULL,
	`internal_transfer_match_type` text,
	`needs_review` integer DEFAULT false NOT NULL,
	`review_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transactions_user_occurred_at_idx` ON `transactions` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_user_needs_review_idx` ON `transactions` (`user_id`,`needs_review`);--> statement-breakpoint
CREATE INDEX `transactions_user_category_idx` ON `transactions` (`user_id`,`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_user_gmail_message_unique` ON `transactions` (`user_id`,`gmail_message_id`);--> statement-breakpoint
CREATE TABLE `whatsapp_numbers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`phone_e164` text NOT NULL,
	`label` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_numbers_phone_e164_unique` ON `whatsapp_numbers` (`phone_e164`);--> statement-breakpoint
CREATE INDEX `whatsapp_numbers_user_idx` ON `whatsapp_numbers` (`user_id`);