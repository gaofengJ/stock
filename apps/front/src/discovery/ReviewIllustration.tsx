import ImgFengye from '@/assets/imgs/fengye.png';

/** Decorative brand illustration; all chart marks are illustrative. */
export default function ReviewIllustration() {
  return (
    <div className="review-illustration" aria-hidden="true">
      <img className="review-illustration-leaf" src={ImgFengye.src} alt="" width="32" height="32" />
      <img className="review-illustration-bull" src="/avatars/bull-gold-bow.svg" alt="" width="100" height="100" />
      <svg viewBox="0 0 440 240" fill="none" focusable="false">
        <rect className="review-illustration-shadow" x="28" y="35" width="392" height="195" rx="22" />
        <rect className="review-illustration-board" x="16" y="22" width="392" height="195" rx="22" />
        <path className="review-illustration-grid" d="M46 78H378M46 118H378M46 158H378" />
        <path className="review-illustration-line" d="m48 96 54-22 49 14 60-38 54 18 54-26 55 15" />
        {[68, 126, 184, 242, 300, 358].map((x, i) => (
          <g key={x} className={i % 2 ? 'review-candle-green' : 'review-candle-red'}>
            <path d={`M${x} ${125 + (i % 3) * 8}v54`} />
            <rect x={x - 13} y={136 + (i % 3) * 8} width="26" height="30" rx="5" />
          </g>
        ))}
        <path className="review-illustration-note" d="M48 192h72m16 0h40m78 0h124" />
      </svg>
    </div>
  );
}
