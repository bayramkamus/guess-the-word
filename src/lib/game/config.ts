/// Oyunun temposunu belirleyen parametreler.
/// README'deki "Oyun parametreleri" tablosunun kod karşılığıdır;
/// biri değişirse diğeri de güncellenmelidir.

/// Bir turun eşleşme üretebilmesi için gereken en az tahmin sayısı.
/// Bunun altında kalan turlar finalist üretmeden sonlanır.
export const MIN_PLAYERS = 2;

/// Bir turda tahmin göndermek için tanınan süre.
/// İlk tur aynı zamanda katılım penceresidir; ayrı bir lobi aşaması yoktur.
export const ROUND_SECONDS = 60;

/// İlk turun bitimine bu kadar saniye kala katılım kapanır.
/// Geç gelen oyuncunun kelimesini yazmak için en az bu kadar süresi olur;
/// bu eşikten sonra gelenler yeni açılan oturuma yönlendirilir.
export const JOIN_CUTOFF_SECONDS = 15;

/// Oyunun kaç tur sürdüğü. Son turda hayatta kalanlar finalist olur.
export const TOTAL_ROUNDS = 3;

/// Katılıma açık oturumu işaretleyen sabit. GameSession.lobbyKey yalnızca bu
/// değeri veya null'ı alabilir; benzersiz indeks bu sayede aynı anda tek bir
/// oturumun katılıma açık kalmasını garanti eder.
export const LOBBY_KEY_OPEN = "OPEN";
