'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * "AI" in Cinzel Bold, as OUTLINES rather than a `<text>` element.
 *
 * A logo cannot depend on a webfont loading: the favicon and the exported PNG render with no CSS
 * context at all, and a missing Cinzel would silently fall back to some other serif. The outlines
 * were extracted from the Cinzel variable font instanced at wght=700, drawn at font-size 13, and
 * translated so the INK box centres on (16,16) — measured, not eyeballed, because Cinzel's cap
 * height is 0.72em and centring on the baseline leaves a visible gap above the letters.
 */
const AI_OUTLINE =
  'M12.88 13.83L13.67 11.32L17.91 20.60L15.59 20.60L12.88 13.83M9.97 19.73L10.88 19.73Q10.78 19.99 10.84 20.17Q10.91 20.36 11.06 20.45Q11.22 20.55 11.37 20.55L11.49 20.55L11.49 20.68L8.71 20.68L8.71 20.55Q8.71 20.55 8.77 20.55Q8.83 20.55 8.83 20.55Q9.12 20.55 9.44 20.36Q9.76 20.17 9.97 19.73M13.56 11.32L13.67 11.32L13.73 12.91L10.50 20.64L9.55 20.64L12.92 13.02Q12.96 12.95 13.06 12.73Q13.15 12.52 13.27 12.24Q13.38 11.97 13.47 11.72Q13.56 11.46 13.56 11.32M11.22 17.59L15.04 17.59L15.04 18.13L11.22 18.13L11.22 17.59M15.23 19.73L17.51 19.73Q17.73 20.17 18.04 20.36Q18.35 20.55 18.65 20.55Q18.65 20.55 18.71 20.55Q18.76 20.55 18.76 20.55L18.76 20.68L14.62 20.68L14.62 20.55L14.74 20.55Q15 20.55 15.20 20.34Q15.39 20.12 15.23 19.73M20.34 11.58L22.29 11.58L22.29 20.68L20.34 20.68L20.34 11.58M20.34 19.73L20.38 19.73L20.38 20.68L19.34 20.68L19.34 20.55Q19.34 20.55 19.42 20.55Q19.51 20.55 19.51 20.55Q19.85 20.55 20.09 20.31Q20.33 20.07 20.34 19.73M20.38 11.58L20.38 12.53L20.34 12.53Q20.33 12.19 20.09 11.95Q19.85 11.71 19.51 11.71Q19.51 11.71 19.42 11.71Q19.34 11.71 19.34 11.71L19.34 11.58L20.38 11.58M22.25 20.68L22.25 19.73L22.29 19.73Q22.30 20.07 22.54 20.31Q22.78 20.55 23.12 20.55Q23.12 20.55 23.20 20.55Q23.28 20.55 23.29 20.55L23.29 20.68L22.25 20.68M22.29 12.53L22.25 12.53L22.25 11.58L23.29 11.58L23.29 11.71Q23.28 11.71 23.20 11.71Q23.12 11.71 23.12 11.71Q22.78 11.71 22.54 11.95Q22.30 12.19 22.29 12.53';

/** The d20 silhouette: a pointy-top hexagon, circumradius 13.4 about (16,16). */
const SILHOUETTE = 'M16 2.6L27.6 9.3L27.6 22.7L16 29.4L4.4 22.7L4.4 9.3Z';

/**
 * The nine edges that turn the silhouette into a die.
 *
 * They run from the central face's corners (radius 9.6) outward to the hexagon, which is why none
 * of them crosses the middle: the letters get the centre to themselves.
 */
const FACETS =
  'M16 6.4L16 2.6M24.31 20.8L27.6 22.7M7.69 20.8L4.4 22.7M16 6.4L27.6 9.3M24.31 20.8L27.6 9.3M24.31 20.8L16 29.4M7.69 20.8L16 29.4M7.69 20.8L4.4 9.3M16 6.4L4.4 9.3';

/**
 * Thick enough to survive the header.
 *
 * Measured, not guessed: at 1.5 the facets are legible at 28px but thin, and at 2.2 they read
 * cleanly there while looking heavy at 512. 1.8 holds at both ends.
 */
const FACET_STROKE = 1.8;

interface RPGForgeMarkProps {
  className?: string;
  /**
   * The "AI" cut-out. Off where the die is an illustration rather than the brand signing something,
   * which leaves the central face solid — the facets already stop short of it.
   */
  lettering?: boolean;
}

/**
 * The RPGForge mark: a d20 with AI cut out of it.
 *
 * One solid shape with holes punched through, so it works on any background without a second file,
 * and it paints with `currentColor`. One drawing at every size: the facets are what make it read as
 * a die rather than a hexagon, and they hold down to the favicon.
 */
export const RPGForgeMark = ({ className, lettering = true }: RPGForgeMarkProps) => {
  const maskId = useId();

  return (
    <svg viewBox="0 0 32 32" className={cn('shrink-0', className)} aria-hidden="true">
      <mask id={maskId}>
        <path d={SILHOUETTE} fill="white" />
        <path
          d={FACETS}
          fill="none"
          stroke="black"
          strokeWidth={FACET_STROKE}
          strokeLinejoin="round"
        />
        {lettering ? <path d={AI_OUTLINE} fill="black" /> : null}
      </mask>
      <rect width="32" height="32" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
};
