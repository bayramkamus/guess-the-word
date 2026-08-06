-- Katılım penceresi modeline geçiş.
-- Oyunlar sabit saat dilimlerinde başlamaz; ilk oyuncu geldiğinde açılır ve
-- birinci tur aynı zamanda katılım penceresi olarak çalışır.

-- DropIndex
-- Oyunlar sabit başlangıç zamanlarına bağlı olmadığı için bu kısıt geçersiz kaldı.
DROP INDEX `GameSession_startsAt_key` ON `GameSession`;

-- DropIndex
-- Sıralama anahtarı createdAt oldu.
DROP INDEX `GameSession_status_startsAt_idx` ON `GameSession`;

-- AlterTable
ALTER TABLE `GameSession`
    ADD COLUMN `lobbyKey` VARCHAR(4) NULL;

-- CreateIndex
-- Benzersiz indeks birden çok NULL'a izin verdiği için aynı anda yalnızca
-- bir satır 'OPEN' değerini taşıyabilir; bu da katılıma açık tek oturumu
-- garanti eder.
CREATE UNIQUE INDEX `GameSession_lobbyKey_key` ON `GameSession`(`lobbyKey`);

-- CreateIndex
CREATE INDEX `GameSession_status_createdAt_idx` ON `GameSession`(`status`, `createdAt`);
