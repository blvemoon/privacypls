import { SHIELD_D, SHIELD_CUT, RING_D, RING_WIDTH, MARK_FIT, HOLDING_RADIUS } from '../../lib/logo.js';

// The crescent shield logo as an inline SVG.
// - The mark uses the current text color (set `color` with a CSS class).
// - `holding` draws the holding shape (the rounded square behind the logo);
//   its color comes from the `.logo-holding` CSS class or the `holdingClass` prop.
// - `id` must be unique on the page, because the crescent is cut out with an SVG mask.
export default function Logo({ id, size = 24, holding = false, holdingClass = '', className = '', title }) {
  const maskId = `logo-cut-${id}`;
  return (
    <svg
      className={`logo ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {holding ? <rect className={`logo-holding ${holdingClass}`.trim()} width="32" height="32" rx={HOLDING_RADIUS} /> : null}
      <g transform={MARK_FIT}>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="-4" y="-4" width="40" height="40">
          <rect x="-4" y="-4" width="40" height="40" fill="white" />
          <path d={SHIELD_D} transform={SHIELD_CUT} fill="black" />
        </mask>
        <path d={SHIELD_D} fill="currentColor" mask={`url(#${maskId})`} />
        <path d={RING_D} fill="none" stroke="currentColor" strokeWidth={RING_WIDTH} strokeLinejoin="miter" />
      </g>
    </svg>
  );
}
