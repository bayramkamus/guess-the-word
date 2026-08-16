import { describe, expect, it } from "vitest";

import {
  GUESS_REJECTION_MESSAGES,
  normalizeWord,
  validateGuess,
} from "./normalize";

describe("normalizeWord", () => {
  it("kucuk harfe cevirir", () => {
    expect(normalizeWord("ELMA")).toBe("elma");
  });

  it("basta ve sonda bosluklari kirpar", () => {
    expect(normalizeWord("  elma  ")).toBe("elma");
  });

  it("Turkce noktali/noktasiz I/i harflerini dogru cozer", () => {
    // Turkce locale'de "I".toLocaleLowerCase("tr") -> "i" (noktasiz i degil).
    expect(normalizeWord("İSTANBUL")).toBe("istanbul");
    expect(normalizeWord("Irmak")).toBe("irmak");
  });

  it("Turkce ozel karakterleri ASCII'ye indirger", () => {
    expect(normalizeWord("çğıöşü")).toBe("cgiosu");
    expect(normalizeWord("ÇĞIÖŞÜ")).toBe("cgiosu");
  });

  it("genisletilmis Latin aksanli karakterleri indirger", () => {
    expect(normalizeWord("âîû")).toBe("aiu");
  });

  it("gorunmez genislik sifir karakterlerini temizler", () => {
    expect(normalizeWord("el​ma")).toBe("elma");
    expect(normalizeWord("﻿elma")).toBe("elma");
  });

  it("'  ELMA  ' ve 'elma' ayni normalize sonucu uretir", () => {
    expect(normalizeWord("  ELMA  ")).toBe(normalizeWord("elma"));
  });
});

describe("validateGuess", () => {
  it("gecerli tek kelimeyi kabul eder", () => {
    const result = validateGuess("Elma");
    expect(result).toEqual({ ok: true, normalized: "elma" });
  });

  it("bos veya yalnizca boslukdan olusan girdiyi reddeder", () => {
    expect(validateGuess("")).toEqual({ ok: false, reason: "EMPTY" });
    expect(validateGuess("   ")).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("tek harfli kelimeyi reddeder (TOO_SHORT)", () => {
    expect(validateGuess("a")).toEqual({ ok: false, reason: "TOO_SHORT" });
  });

  it("40 karakteri asan normalize kelimeyi reddeder (TOO_LONG)", () => {
    const longWord = "a".repeat(41);
    expect(validateGuess(longWord)).toEqual({ ok: false, reason: "TOO_LONG" });
  });

  it("200 ham karakteri asan girdiyi normalize etmeden reddeder (TOO_LONG)", () => {
    const raw = "a".repeat(201);
    expect(validateGuess(raw)).toEqual({ ok: false, reason: "TOO_LONG" });
  });

  it("birden fazla kelimeyi reddeder (MULTIPLE_WORDS)", () => {
    expect(validateGuess("elma armut")).toEqual({
      ok: false,
      reason: "MULTIPLE_WORDS",
    });
  });

  it("rakam veya noktalama iceren girdiyi reddeder (INVALID_CHARACTERS)", () => {
    expect(validateGuess("elma1")).toEqual({
      ok: false,
      reason: "INVALID_CHARACTERS",
    });
    expect(validateGuess("elma!")).toEqual({
      ok: false,
      reason: "INVALID_CHARACTERS",
    });
  });

  it("Turkce karakterli kelimeleri kabul eder", () => {
    expect(validateGuess("çilek")).toEqual({ ok: true, normalized: "cilek" });
  });

  it("her red nedeni icin bir kullanici mesaji tanimlidir", () => {
    for (const reason of [
      "EMPTY",
      "TOO_SHORT",
      "TOO_LONG",
      "MULTIPLE_WORDS",
      "INVALID_CHARACTERS",
    ] as const) {
      expect(GUESS_REJECTION_MESSAGES[reason]).toBeTruthy();
    }
  });
});
