/**
 * Corastate wordmark, served from /public/brand. Two SVGs ship: one for
 * light surfaces (PDS warm ink) and one for dark (PDS warm near-white).
 *
 * The dark-mode swap rides on the `.dark` class via Tailwind's `dark:`
 * variant — we render both `img` tags and use display utilities to flip
 * which one is visible. This avoids the FOUC of a JS-controlled swap.
 */

interface WordmarkProps {
  className?: string;
}

export function Wordmark({ className }: WordmarkProps): JSX.Element {
  return (
    <span className={className} role="img" aria-label="Corastate">
      <img
        src="/brand/wordmark-light.svg"
        alt=""
        className="block h-full w-auto dark:hidden"
        draggable={false}
      />
      <img
        src="/brand/wordmark-dark.svg"
        alt=""
        className="hidden h-full w-auto dark:block"
        draggable={false}
      />
    </span>
  );
}
