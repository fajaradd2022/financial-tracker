CREATE TABLE `cash_wallet_entries` (
	`id` text PRIMARY KEY NOT NULL,
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
CREATE INDEX `cash_entries_occurred_at_idx` ON `cash_wallet_entries` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_kind_unique` ON `categories` (`name`,`kind`);--> statement-breakpoint
CREATE TABLE `ingestion_config` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`inbox_email` text NOT NULL,
	`poll_interval_minutes` integer DEFAULT 12 NOT NULL,
	`backfill_enabled` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_polled_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `own_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`bank` text NOT NULL,
	`account_number_or_identifier` text NOT NULL,
	`label` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `own_accounts_number_idx` ON `own_accounts` (`account_number_or_identifier`);--> statement-breakpoint
CREATE UNIQUE INDEX `own_accounts_bank_number_unique` ON `own_accounts` (`bank`,`account_number_or_identifier`);--> statement-breakpoint
CREATE TABLE `source_health` (
	`source` text PRIMARY KEY NOT NULL,
	`email_supported` integer,
	`last_seen_at` text,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
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
CREATE UNIQUE INDEX `transactions_gmail_message_id_unique` ON `transactions` (`gmail_message_id`);--> statement-breakpoint
CREATE INDEX `transactions_occurred_at_idx` ON `transactions` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_needs_review_idx` ON `transactions` (`needs_review`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE TABLE `whatsapp_numbers` (
	`id` text PRIMARY KEY NOT NULL,
	`phone_e164` text NOT NULL,
	`label` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_numbers_phone_e164_unique` ON `whatsapp_numbers` (`phone_e164`);