-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(30) NOT NULL,
    `clientToken` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_clientToken_key`(`clientToken`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GameSession` (
    `id` VARCHAR(191) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `joinClosesAt` DATETIME(3) NOT NULL,
    `status` ENUM('WAITING', 'ACTIVE', 'FINISHED', 'CANCELLED') NOT NULL DEFAULT 'WAITING',
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GameSession_status_startsAt_idx`(`status`, `startsAt`),
    UNIQUE INDEX `GameSession_startsAt_key`(`startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SessionParticipant` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `nicknameSnapshot` VARCHAR(30) NOT NULL,
    `status` ENUM('ACTIVE', 'ELIMINATED', 'FINALIST', 'LEFT') NOT NULL DEFAULT 'ACTIVE',
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `eliminatedRound` INTEGER NULL,
    `finalRound` INTEGER NULL,

    INDEX `SessionParticipant_sessionId_status_idx`(`sessionId`, `status`),
    UNIQUE INDEX `SessionParticipant_sessionId_userId_key`(`sessionId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Round` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `roundNumber` INTEGER NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `status` ENUM('WAITING', 'ACTIVE', 'PROCESSING', 'FINISHED') NOT NULL DEFAULT 'WAITING',

    INDEX `Round_sessionId_status_idx`(`sessionId`, `status`),
    UNIQUE INDEX `Round_sessionId_roundNumber_key`(`sessionId`, `roundNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Guess` (
    `id` VARCHAR(191) NOT NULL,
    `roundId` VARCHAR(191) NOT NULL,
    `sessionParticipantId` VARCHAR(191) NOT NULL,
    `originalWord` VARCHAR(100) NOT NULL,
    `normalizedWord` VARCHAR(100) NOT NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Guess_roundId_normalizedWord_idx`(`roundId`, `normalizedWord`),
    UNIQUE INDEX `Guess_roundId_sessionParticipantId_key`(`roundId`, `sessionParticipantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Conversation` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `finalRound` INTEGER NOT NULL,
    `normalizedWord` VARCHAR(100) NOT NULL,
    `status` ENUM('ACTIVE', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closesAt` DATETIME(3) NULL,

    UNIQUE INDEX `Conversation_sessionId_finalRound_normalizedWord_key`(`sessionId`, `finalRound`, `normalizedWord`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConversationMember` (
    `conversationId` VARCHAR(191) NOT NULL,
    `sessionParticipantId` VARCHAR(191) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`conversationId`, `sessionParticipantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `senderParticipantId` VARCHAR(191) NOT NULL,
    `body` VARCHAR(1000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `Message_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SessionParticipant` ADD CONSTRAINT `SessionParticipant_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `GameSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SessionParticipant` ADD CONSTRAINT `SessionParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Round` ADD CONSTRAINT `Round_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `GameSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Guess` ADD CONSTRAINT `Guess_roundId_fkey` FOREIGN KEY (`roundId`) REFERENCES `Round`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Guess` ADD CONSTRAINT `Guess_sessionParticipantId_fkey` FOREIGN KEY (`sessionParticipantId`) REFERENCES `SessionParticipant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `GameSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationMember` ADD CONSTRAINT `ConversationMember_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConversationMember` ADD CONSTRAINT `ConversationMember_sessionParticipantId_fkey` FOREIGN KEY (`sessionParticipantId`) REFERENCES `SessionParticipant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_conversationId_senderParticipantId_fkey` FOREIGN KEY (`conversationId`, `senderParticipantId`) REFERENCES `ConversationMember`(`conversationId`, `sessionParticipantId`) ON DELETE RESTRICT ON UPDATE CASCADE;
