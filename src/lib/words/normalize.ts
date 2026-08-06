/// Türkçe karakterleri ASCII karşılıklarına indirger.
const FOLD: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/// Bir kelime tahminini eşleştirmede kullanılacak standart biçime çevirir.
/// Sonuç yalnızca [a-z] karakterlerinden oluşur; böylece veritabanı
/// collation'ından bağımsız olarak deterministik şekilde gruplanabilir.
export function normalizeWord(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[\u200B-\u200F\uFEFF]/g, "")
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (char) => FOLD[char] ?? char);
}

///ham girdi için üst sınır.
///devasa bir string üzerinde çalışmasını baştan engeller
const MAX_RAW_LENGTH = 200;

///normalize edilmiş kelime için alt ve üst sınır.
const MIN_LENGTH = 2;
const MAX_LENGTH = 40;

export type GuessRejectionReason =
  | "EMPTY"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "MULTIPLE_WORDS"
  | "INVALID_CHARACTERS";
export type GuessValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: GuessRejectionReason };

export function validateGuess(input: string): GuessValidationResult {
  if (input.length > MAX_RAW_LENGTH) {
    return { ok: false, reason: "TOO_LONG" };
  }
  const normalized = normalizeWord(input);
  if (normalized.length === 0) {
    return { ok: false, reason: "EMPTY" };
  }
  if (/\s/.test(normalized)) {
    return { ok: false, reason: "MULTIPLE_WORDS" };
  }
  if (!/^[a-z]+$/.test(normalized)) {
    return { ok: false, reason: "INVALID_CHARACTERS" };
  }
  if (normalized.length < MIN_LENGTH) {
    return { ok: false, reason: "TOO_SHORT" };
  }
  if (normalized.length > MAX_LENGTH) {
    return { ok: false, reason: "TOO_LONG" };
  }
  return { ok: true, normalized };
}

export const GUESS_REJECTION_MESSAGES: Record<GuessRejectionReason, string> = {
  EMPTY: "Bir kelime yazmalısın.",
  TOO_SHORT: `Kelime en az ${MIN_LENGTH} harf olmalı.`,
  TOO_LONG: `Kelime en fazla ${MAX_LENGTH} harf olabilir.`,
  MULTIPLE_WORDS: "Yalnızca tek kelime yazabilirsin.",
  INVALID_CHARACTERS: "Kelime yalnızca harflerden oluşmalı.",
};
