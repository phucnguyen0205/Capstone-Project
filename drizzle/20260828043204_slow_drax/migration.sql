CREATE TABLE `conversation_participants` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	CONSTRAINT `fk_conversation_participants_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_conversation_participants_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY,
	`content` text NOT NULL,
	`media_url` text,
	`media_type` text,
	`sender_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_messages_sender_id_users_id_fk` FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_messages_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `read_receipts` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`message_id` text NOT NULL,
	`read_at` integer NOT NULL,
	CONSTRAINT `fk_read_receipts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_read_receipts_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL UNIQUE,
	`username` text NOT NULL UNIQUE,
	`password` text NOT NULL,
	`name` text,
	`avatar` text,
	`bio` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
