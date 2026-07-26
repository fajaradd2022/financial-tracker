CREATE TABLE `gmail_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`refresh_token_encrypted` text NOT NULL,
	`inbox_email` text NOT NULL,
	`connected_at` text NOT NULL,
	`last_error_at` text,
	`last_error` text
);
