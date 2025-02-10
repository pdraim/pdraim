CREATE TABLE `chat_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`type` text DEFAULT 'direct' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_room_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`content` text NOT NULL,
	`type` text DEFAULT 'chat' NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`chat_room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`nickname` text NOT NULL,
	`status` text DEFAULT 'offline',
	`avatar_url` text,
	`created_at` integer NOT NULL,
	`last_seen` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE VIEW `chat_room_view` AS select "id", "name", "type", "created_at" from "chat_rooms";--> statement-breakpoint
CREATE VIEW `message_view` AS select "messages"."id", "messages"."content", "messages"."type", "messages"."timestamp", "users"."nickname", "chat_rooms"."name" from "messages" left join "users" on "messages"."sender_id" = "users"."id" left join "chat_rooms" on "messages"."chat_room_id" = "chat_rooms"."id";--> statement-breakpoint
CREATE VIEW `user_view` AS select "id", "nickname", "status", "avatar_url", "last_seen" from "users";