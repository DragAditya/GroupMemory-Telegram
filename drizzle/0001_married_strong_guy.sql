CREATE TABLE `group_messages` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`groupId` bigint NOT NULL,
	`telegramMessageId` int NOT NULL,
	`senderTelegramUserId` bigint NOT NULL,
	`senderName` varchar(512) NOT NULL,
	`senderUsername` varchar(128),
	`textContent` text NOT NULL,
	`sentAt` timestamp NOT NULL,
	`editedAt` timestamp,
	`replyToMessageId` int,
	`links` json NOT NULL,
	`media` json NOT NULL,
	`mentions` json NOT NULL,
	`topicThreadId` int,
	`originalMessageLink` varchar(1024) NOT NULL,
	`embedding` VECTOR(768) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `group_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_messages_group_telegram_message_unique` UNIQUE(`groupId`,`telegramMessageId`)
);
--> statement-breakpoint
CREATE TABLE `system_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobKey` varchar(64) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`lastRunAt` timestamp,
	`lastRunDeletedCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_jobs_jobKey_unique` UNIQUE(`jobKey`)
);
--> statement-breakpoint
CREATE TABLE `telegram_groups` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`telegramChatId` bigint NOT NULL,
	`chatType` varchar(24) NOT NULL,
	`title` text,
	`username` varchar(128),
	`memoryEnabled` boolean NOT NULL DEFAULT true,
	`retentionDays` int NOT NULL DEFAULT 30,
	`lastActivityAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `telegram_groups_chat_id_unique` UNIQUE(`telegramChatId`)
);
--> statement-breakpoint
ALTER TABLE `group_messages` ADD CONSTRAINT `group_messages_groupId_telegram_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `telegram_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `group_messages_group_sent_at_idx` ON `group_messages` (`groupId`,`sentAt`);--> statement-breakpoint
CREATE INDEX `group_messages_sender_sent_at_idx` ON `group_messages` (`senderTelegramUserId`,`sentAt`);