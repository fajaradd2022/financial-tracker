CREATE TABLE `collaboration_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`collaboration_id` text NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'pending_match' NOT NULL,
	`sender_transaction_id` text,
	`recipient_transaction_id` text,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`collaboration_id`) REFERENCES `collaborations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recipient_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collab_entries_to_user_idx` ON `collaboration_entries` (`to_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `collab_entries_from_user_idx` ON `collaboration_entries` (`from_user_id`);--> statement-breakpoint
CREATE INDEX `collab_entries_collab_idx` ON `collaboration_entries` (`collaboration_id`);--> statement-breakpoint
CREATE TABLE `collaborations` (
	`id` text PRIMARY KEY NOT NULL,
	`requester_user_id` text NOT NULL,
	`addressee_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`responded_at` text
);
--> statement-breakpoint
CREATE INDEX `collaborations_requester_idx` ON `collaborations` (`requester_user_id`);--> statement-breakpoint
CREATE INDEX `collaborations_addressee_idx` ON `collaborations` (`addressee_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collaborations_pair_unique` ON `collaborations` (`requester_user_id`,`addressee_user_id`);--> statement-breakpoint
CREATE TABLE `user_directory` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_directory_email_unique` ON `user_directory` (`email`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `funded_by_collaboration_id` text;--> statement-breakpoint
CREATE INDEX `transactions_funded_by_idx` ON `transactions` (`funded_by_collaboration_id`);