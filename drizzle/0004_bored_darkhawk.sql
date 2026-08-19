CREATE TABLE `telegram_login_codes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`codeHash` varchar(64) NOT NULL,
	`pollTokenHash` varchar(64) NOT NULL,
	`ownerOpenId` varchar(64),
	`telegramId` bigint,
	`telegramName` varchar(512),
	`telegramUsername` varchar(128),
	`confirmedAt` timestamp,
	`consumedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `telegram_login_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `telegram_login_codes_code_hash_unique` UNIQUE(`codeHash`),
	CONSTRAINT `telegram_login_codes_poll_token_hash_unique` UNIQUE(`pollTokenHash`)
);
--> statement-breakpoint
CREATE INDEX `telegram_login_codes_expires_idx` ON `telegram_login_codes` (`expiresAt`);