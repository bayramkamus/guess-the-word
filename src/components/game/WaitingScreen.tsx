import type { RoundInfo } from "@/lib/api/client";
import { Countdown } from "@/components/game/Countdown";

type WaitingScreenProps = {
  round?: RoundInfo;
  guess?: string | null;
  participantCount?: number;
};

/// Tahmin gönderildikten sonraki bekleme ekranı. Sunucu turu tam bu sırada
/// sonuçlandırıyorsa `round` alanı gelmeyebilir; bu durumda kısa bir
/// "sonuçlandırılıyor" mesajı gösterilir.
export function WaitingScreen({ round, guess, participantCount }: WaitingScreenProps) {
  if (!round) {
    return (
      <div className="card">
        <div className="spinner" />
        <p className="card-subtext center-text">Tur sonuçlandırılıyor…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="meta-row">
        <span className="badge">
          Tur {round.number}/{round.total}
        </span>
        {typeof participantCount === "number" ? (
          <span className="badge">{participantCount} kişi oyunda</span>
        ) : null}
      </div>
      <Countdown endsAt={round.endsAt} />
      <p className="card-subtext center-text">Tahminin gönderildi:</p>
      <div className="submitted-word">{guess}</div>
      <p className="hint-text center-text">
        Aynı kelimeyi yazanlarla bir sonraki tura geçeceksin.
      </p>
    </div>
  );
}
