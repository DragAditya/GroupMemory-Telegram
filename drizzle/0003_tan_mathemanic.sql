CREATE TABLE `user_group_access` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`groupId` bigint NOT NULL,
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	`lastVerifiedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_group_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_group_access_user_group_unique` UNIQUE(`userId`,`groupId`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `telegramId` bigint;--> statement-breakpoint
ALTER TABLE `users` ADD `telegramUsername` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_telegram_id_unique` UNIQUE(`telegramId`);--> statement-breakpoint
ALTER TABLE `user_group_access` ADD CONSTRAINT `user_group_access_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_group_access` ADD CONSTRAINT `user_group_access_groupId_telegram_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `telegram_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `user_group_access_user_verified_idx` ON `user_group_access` (`userId`,`lastVerifiedAt`);--> statement-breakpoint
CREATE INDEX `user_group_access_group_idx` ON `user_group_access` (`groupId`);