import type { ProfileAvatarId } from '@rpgforce-ai/shared';
import type { ReactElement } from 'react';

/**
 * The profile avatar gallery, vendored as inline SVG.
 *
 * Generated once with DiceBear (https://www.dicebear.com) and committed; never called at runtime.
 * Style "Critters", CC0 1.0, chosen over the CC BY set because it adds no obligation to /legal.
 *
 * Ids are re-prefixed per avatar: DiceBear hash-suffixes everything except one `clipPath`, which a
 * dozen of these on one page would otherwise share.
 *
 * Seeds, in id order: grifo, quimera, basilisco, hidra, fenix, golem, harpia, minotauro, sereia,
 * troll, wyvern, centauro.
 */
const AVATAR_SVGS: Record<ProfileAvatarId, (className: string) => ReactElement> = {
  'critters-01': (className) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="auto"
      className={className}
    >
      <defs>
        <g id="critters-01-top-bobble-6696d2b8">
          <g opacity=".15" transform="translate(-23 -6.5)">
            <path fill="#1e293b" d="M46 24h8v26h-8z" />
            <circle cx="50" cy="19" r="8.5" fill="#1e293b" />
          </g>
          <path fill="#fdba74" d="M20 14h8v26h-8z" />
          <circle cx="24" cy="9" r="8.5" fill="#fdba74" />
        </g>
        <clipPath id="critters-01-dbcrb-chimney">
          <path d="M28 106V30q0-8 8-8h28q8 0 8 8v76Z" />
        </clipPath>
        <g id="critters-01-body-chimney-6696d2b8">
          <g className="dbcr-t">
            <use transform="translate(26 2)" href="#critters-01-top-bobble-6696d2b8" />
          </g>
          <path d="M31 109.5v-76q0-8 8-8h28q8 0 8 8v76Z" fill="#1e293b" opacity=".15" />
          <path d="M28 106V30q0-8 8-8h28q8 0 8 8v76Z" fill="#bef264" />
          <g clipPath="url(#critters-01-dbcrb-chimney)">
            <path
              d="M28 106V30q0-8 8-8h28q8 0 8 8v76Zm3.5 4.5v-76q0-8 8-8h28q8 0 8 8v76Z"
              fill="#ffffff"
              opacity=".16"
              fillRule="evenodd"
            />
            <path
              d="M28 106V30q0-8 8-8h28q8 0 8 8v76Zm-3.5-4.5v-76q0-8 8-8h28q8 0 8 8v76Z"
              fill="#1e293b"
              opacity=".1"
              fillRule="evenodd"
            />
          </g>
        </g>
        <g id="critters-01-eyes-dots-6696d2b8">
          <g className="dbcr-eb">
            <circle cx="10" cy="13" r="4" fill="#1e293b" />
          </g>
          <g className="dbcr-eb">
            <circle cx="36" cy="13" r="4" fill="#1e293b" />
          </g>
        </g>
        <g id="critters-01-mouth-sad-6696d2b8">
          <path
            d="M8 10q6-5 12 0"
            stroke="#1e293b"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g id="critters-01-animation-none-6696d2b8"></g>
        <clipPath id="critters-01-clip-6696d2b8">
          <rect width="100" height="100" rx="0" ry="0" />
        </clipPath>
      </defs>
      <g clipPath="url(#critters-01-clip-6696d2b8)">
        <rect width="100" height="100" fill="#b45309" />
        <g className="dbcr-c">
          <use href="#critters-01-body-chimney-6696d2b8" />
          <use transform="translate(27 36)" href="#critters-01-eyes-dots-6696d2b8" />
          <use transform="translate(36 60)" href="#critters-01-mouth-sad-6696d2b8" />
        </g>
        <use href="#critters-01-animation-none-6696d2b8" />
      </g>
    </svg>
  ),
  'critters-02': (className) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="auto"
      className={className}
    >
      <defs>
        <clipPath id="critters-02-dbcrb-wedge">
          <path d="M20 106v-6l10-70q1-6 8-6h24q7 0 8 6l10 70v6Z" />
        </clipPath>
        <g id="critters-02-body-wedge-12d507cd">
          <path d="M23 109.5v-6l10-70q1-6 8-6h24q7 0 8 6l10 70v6Z" fill="#1e293b" opacity=".15" />
          <path d="M20 106v-6l10-70q1-6 8-6h24q7 0 8 6l10 70v6Z" fill="#c4b5fd" />
          <g clipPath="url(#critters-02-dbcrb-wedge)">
            <path
              d="M20 106v-6l10-70q1-6 8-6h24q7 0 8 6l10 70v6Zm3.5 4.5v-6l10-70q1-6 8-6h24q7 0 8 6l10 70v6Z"
              fill="#ffffff"
              opacity=".16"
              fillRule="evenodd"
            />
            <path
              d="M20 106v-6l10-70q1-6 8-6h24q7 0 8 6l10 70v6Zm-3.5-4.5v-6l10-70q1-6 8-6h24q7 0 8 6l10 70v6Z"
              fill="#1e293b"
              opacity=".1"
              fillRule="evenodd"
            />
          </g>
        </g>
        <g id="critters-02-eyes-angry-12d507cd">
          <g className="dbcr-eb">
            <circle cx="10" cy="13" r="7" fill="#ffffff" />
            <circle cx="10" cy="13" r="3" fill="#1e293b" />
            <path
              d="m3 4 14 5"
              stroke="#1e293b"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <g className="dbcr-eb">
            <circle cx="36" cy="13" r="7" fill="#ffffff" />
            <circle cx="36" cy="13" r="3" fill="#1e293b" />
            <path
              d="M43 4 29 9"
              stroke="#1e293b"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
        <g id="critters-02-mouth-grin-12d507cd">
          <path d="M2 3a12 12 0 0 0 24 0Z" fill="#1e293b" />
          <path d="M8.5 9a5.5 5.5 0 0 0 11 0Z" fill="#fb7185" />
        </g>
        <g id="critters-02-animation-none-12d507cd"></g>
        <clipPath id="critters-02-clip-12d507cd">
          <rect width="100" height="100" rx="0" ry="0" />
        </clipPath>
      </defs>
      <g clipPath="url(#critters-02-clip-12d507cd)">
        <rect width="100" height="100" fill="#be123c" />
        <g className="dbcr-c">
          <use href="#critters-02-body-wedge-12d507cd" />
          <use transform="translate(27 36)" href="#critters-02-eyes-angry-12d507cd" />
          <use transform="translate(36 60)" href="#critters-02-mouth-grin-12d507cd" />
        </g>
        <use href="#critters-02-animation-none-12d507cd" />
      </g>
    </svg>
  ),
  'critters-03': (className) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="auto"
      className={className}
    >
      <defs>
        <clipPath id="critters-03-dbcrb-tower">
          <path d="M28 106V38a22 22 0 0 1 44 0v68Z" />
        </clipPath>
        <g id="critters-03-body-tower-93e3d6fe">
          <path d="M31 109.5v-68a22 22 0 0 1 44 0v68Z" fill="#1e293b" opacity=".15" />
          <path d="M28 106V38a22 22 0 0 1 44 0v68Z" fill="#e2e8f0" />
          <g clipPath="url(#critters-03-dbcrb-tower)">
            <path
              d="M28 106V38a22 22 0 0 1 44 0v68Zm3.5 4.5v-68a22 22 0 0 1 44 0v68Z"
              fill="#ffffff"
              opacity=".16"
              fillRule="evenodd"
            />
            <path
              d="M28 106V38a22 22 0 0 1 44 0v68Zm-3.5-4.5v-68a22 22 0 0 1 44 0v68Z"
              fill="#1e293b"
              opacity=".1"
              fillRule="evenodd"
            />
          </g>
        </g>
        <g id="critters-03-eyes-sleepy-93e3d6fe">
          <g className="dbcr-eb">
            <path d="M3 13a7 7 0 0 0 14 0Z" fill="#ffffff" />
            <path d="M7 13a3 3 0 0 0 6 0Z" fill="#1e293b" />
            <path
              d="M2 13h16"
              stroke="#1e293b"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <g className="dbcr-eb">
            <path d="M29 13a7 7 0 0 0 14 0Z" fill="#ffffff" />
            <path d="M33 13a3 3 0 0 0 6 0Z" fill="#1e293b" />
            <path
              d="M28 13h16"
              stroke="#1e293b"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
        <g id="critters-03-mouth-ooh-93e3d6fe">
          <circle cx="14" cy="8" r="4.5" fill="#1e293b" />
        </g>
        <g id="critters-03-animation-none-93e3d6fe"></g>
        <clipPath id="critters-03-clip-93e3d6fe">
          <rect width="100" height="100" rx="0" ry="0" />
        </clipPath>
      </defs>
      <g clipPath="url(#critters-03-clip-93e3d6fe)">
        <rect width="100" height="100" fill="#6d28d9" />
        <g className="dbcr-c">
          <use href="#critters-03-body-tower-93e3d6fe" />
          <use transform="translate(27 36)" href="#critters-03-eyes-sleepy-93e3d6fe" />
          <use transform="translate(36 60)" href="#critters-03-mouth-ooh-93e3d6fe" />
        </g>
        <use href="#critters-03-animation-none-93e3d6fe" />
      </g>
    </svg>
  ),
  'critters-04': (className) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="auto"
      className={className}
    >
      <defs>
        <g id="critters-04-top-hornsIn-86303bf7">
          <g opacity=".15" transform="translate(-23 -6.5)">
            <path
              d="M36 50c0-18 0-30 8-38-2 10 0 20 0 38Zm28 0c0-18 0-30-8-38 2 10 0 20 0 38Z"
              fill="#1e293b"
            />
          </g>
          <path
            d="M10 40c0-18 0-30 8-38-2 10 0 20 0 38Zm28 0c0-18 0-30-8-38 2 10 0 20 0 38Z"
            fill="#c4b5fd"
          />
        </g>
        <clipPath id="critters-04-dbcrb-tower">
          <path d="M28 106V38a22 22 0 0 1 44 0v68Z" />
        </clipPath>
        <g id="critters-04-body-tower-86303bf7">
          <g className="dbcr-t">
            <use transform="translate(26 2)" href="#critters-04-top-hornsIn-86303bf7" />
          </g>
          <path d="M31 109.5v-68a22 22 0 0 1 44 0v68Z" fill="#1e293b" opacity=".15" />
          <path d="M28 106V38a22 22 0 0 1 44 0v68Z" fill="#fca5a5" />
          <g clipPath="url(#critters-04-dbcrb-tower)">
            <path
              d="M28 106V38a22 22 0 0 1 44 0v68Zm3.5 4.5v-68a22 22 0 0 1 44 0v68Z"
              fill="#ffffff"
              opacity=".16"
              fillRule="evenodd"
            />
            <path
              d="M28 106V38a22 22 0 0 1 44 0v68Zm-3.5-4.5v-68a22 22 0 0 1 44 0v68Z"
              fill="#1e293b"
              opacity=".1"
              fillRule="evenodd"
            />
          </g>
        </g>
        <g id="critters-04-eyes-bigPupils-86303bf7">
          <g className="dbcr-eb">
            <circle cx="10" cy="13" r="7" fill="#ffffff" />
            <circle cx="10" cy="13" r="5" fill="#1e293b" />
          </g>
          <g className="dbcr-eb">
            <circle cx="36" cy="13" r="7" fill="#ffffff" />
            <circle cx="36" cy="13" r="5" fill="#1e293b" />
          </g>
        </g>
        <g id="critters-04-mouth-line-86303bf7">
          <path
            d="M6 7h16"
            stroke="#1e293b"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g id="critters-04-animation-none-86303bf7"></g>
        <clipPath id="critters-04-clip-86303bf7">
          <rect width="100" height="100" rx="0" ry="0" />
        </clipPath>
      </defs>
      <g clipPath="url(#critters-04-clip-86303bf7)">
        <rect width="100" height="100" fill="#c2410c" />
        <g className="dbcr-c">
          <use href="#critters-04-body-tower-86303bf7" />
          <use transform="translate(27 36)" href="#critters-04-eyes-bigPupils-86303bf7" />
          <use transform="translate(36 60)" href="#critters-04-mouth-line-86303bf7" />
        </g>
        <use href="#critters-04-animation-none-86303bf7" />
      </g>
    </svg>
  ),
  'critters-05': (className) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="auto"
      className={className}
    >
      <defs>
        <g id="critters-05-top-crown-e5fedf83">
          <g opacity=".15" transform="translate(-23 -6.5)">
            <path d="M38 50V32l5-8 4 6 3-8 3 8 4-6 5 8v18Z" fill="#1e293b" />
          </g>
          <path d="M12 40V22l5-8 4 6 3-8 3 8 4-6 5 8v18Z" fill="#f0abfc" />
        </g>
        <clipPath id="critters-05-dbcrb-tilt">
          <path d="M22 106V64c0-30 10-44 24-42 22 2 32 18 32 78v6Z" />
        </clipPath>
        <g id="critters-05-body-tilt-e5fedf83">
          <g className="dbcr-t">
            <use transform="translate(26 2)" href="#critters-05-top-crown-e5fedf83" />
          </g>
          <path
            d="M25 109.5v-42c0-30 10-44 24-42 22 2 32 18 32 78v6Z"
            fill="#1e293b"
            opacity=".15"
          />
          <path d="M22 106V64c0-30 10-44 24-42 22 2 32 18 32 78v6Z" fill="#c4b5fd" />
          <g clipPath="url(#critters-05-dbcrb-tilt)">
            <path
              d="M22 106V64c0-30 10-44 24-42 22 2 32 18 32 78v6Zm3.5 4.5v-42c0-30 10-44 24-42 22 2 32 18 32 78v6Z"
              fill="#ffffff"
              opacity=".16"
              fillRule="evenodd"
            />
            <path
              d="M22 106V64c0-30 10-44 24-42 22 2 32 18 32 78v6Zm-3.5-4.5v-42c0-30 10-44 24-42 22 2 32 18 32 78v6Z"
              fill="#1e293b"
              opacity=".1"
              fillRule="evenodd"
            />
          </g>
        </g>
        <g id="critters-05-pattern-speckles-e5fedf83">
          <circle cx="2" cy="5" r="1.8" fill="#ffffff" opacity=".3" />
          <circle cx="10" cy="13" r="1.8" fill="#ffffff" opacity=".3" />
          <circle cx="18" cy="4" r="1.8" fill="#ffffff" opacity=".3" />
          <circle cx="24" cy="15" r="1.8" fill="#ffffff" opacity=".3" />
          <circle cx="30" cy="7" r="1.8" fill="#ffffff" opacity=".3" />
        </g>
        <g id="critters-05-eyes-happy-e5fedf83">
          <g className="dbcr-eb">
            <path
              d="M3 16q7-10 14 0"
              stroke="#1e293b"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <g className="dbcr-eb">
            <path
              d="M29 16q7-10 14 0"
              stroke="#1e293b"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
        <g id="critters-05-mouth-sad-e5fedf83">
          <path
            d="M8 10q6-5 12 0"
            stroke="#1e293b"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g id="critters-05-animation-none-e5fedf83"></g>
        <clipPath id="critters-05-clip-e5fedf83">
          <rect width="100" height="100" rx="0" ry="0" />
        </clipPath>
      </defs>
      <g clipPath="url(#critters-05-clip-e5fedf83)">
        <rect width="100" height="100" fill="#be123c" />
        <g className="dbcr-c">
          <use href="#critters-05-body-tilt-e5fedf83" />
          <use transform="translate(34 75)" href="#critters-05-pattern-speckles-e5fedf83" />
          <use transform="translate(27 36)" href="#critters-05-eyes-happy-e5fedf83" />
          <use transform="translate(36 60)" href="#critters-05-mouth-sad-e5fedf83" />
        </g>
        <use href="#critters-05-animation-none-e5fedf83" />
      </g>
    </svg>
  ),
  'critters-06': (className) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="auto"
      className={className}
    >
      <defs>
        <g id="critters-06-top-earsDroop-88ec3d53">
          <g opacity=".15" transform="translate(-23 -6.5)">
            <ellipse
              cx="36"
              cy="32"
              rx="5.5"
              ry="16"
              transform="rotate(-16 36 32)"
              fill="#1e293b"
            />
            <ellipse cx="64" cy="32" rx="5.5" ry="16" transform="rotate(16 64 32)" fill="#1e293b" />
          </g>
          <ellipse
            cx="36"
            cy="32"
            rx="5.5"
            ry="16"
            transform="rotate(-16 -12.577 119.5)"
            fill="#7dd3fc"
          />
          <ellipse
            cx="64"
            cy="32"
            rx="5.5"
            ry="16"
            transform="rotate(16 86.577 -65.5)"
            fill="#7dd3fc"
          />
        </g>
        <clipPath id="critters-06-dbcrb-round">
          <path d="M10 106V70c0-26 16-40 40-40s40 14 40 40v36Z" />
        </clipPath>
        <g id="critters-06-body-round-88ec3d53">
          <g className="dbcr-t">
            <use transform="translate(26 8)" href="#critters-06-top-earsDroop-88ec3d53" />
          </g>
          <path d="M13 109.5v-36c0-26 16-40 40-40s40 14 40 40v36Z" fill="#1e293b" opacity=".15" />
          <path d="M10 106V70c0-26 16-40 40-40s40 14 40 40v36Z" fill="#a5b4fc" />
          <g clipPath="url(#critters-06-dbcrb-round)">
            <path
              d="M10 106V70c0-26 16-40 40-40s40 14 40 40v36Zm3.5 4.5v-36c0-26 16-40 40-40s40 14 40 40v36Z"
              fill="#ffffff"
              opacity=".16"
              fillRule="evenodd"
            />
            <path
              d="M10 106V70c0-26 16-40 40-40s40 14 40 40v36Zm-3.5-4.5v-36c0-26 16-40 40-40s40 14 40 40v36Z"
              fill="#1e293b"
              opacity=".1"
              fillRule="evenodd"
            />
          </g>
        </g>
        <g id="critters-06-eyes-wide-88ec3d53">
          <g className="dbcr-eb">
            <ellipse cx="10" cy="13" rx="6.5" ry="8.5" fill="#ffffff" />
            <circle cx="10" cy="13" r="2.8" fill="#1e293b" />
          </g>
          <g className="dbcr-eb">
            <ellipse cx="36" cy="13" rx="6.5" ry="8.5" fill="#ffffff" />
            <circle cx="36" cy="13" r="2.8" fill="#1e293b" />
          </g>
        </g>
        <g id="critters-06-mouth-line-88ec3d53">
          <path
            d="M6 7h16"
            stroke="#1e293b"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g id="critters-06-animation-none-88ec3d53"></g>
        <clipPath id="critters-06-clip-88ec3d53">
          <rect width="100" height="100" rx="0" ry="0" />
        </clipPath>
      </defs>
      <g clipPath="url(#critters-06-clip-88ec3d53)">
        <rect width="100" height="100" fill="#047857" />
        <g className="dbcr-c">
          <use href="#critters-06-body-round-88ec3d53" />
          <use transform="translate(27 36)" href="#critters-06-eyes-wide-88ec3d53" />
          <use transform="translate(36 60)" href="#critters-06-mouth-line-88ec3d53" />
        </g>
        <use href="#critters-06-animation-none-88ec3d53" />
      </g>
    </svg>
  ),
  'critters-07': (className) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="auto"
      className={className}
    >
      <defs>
        <g id="critters-07-top-antenna-c28734fa">
          <g opacity=".15" transform="translate(-23 -6.5)">
            <path
              d="M50 50V23"
              stroke="#1e293b"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="50" cy="16" r="5.5" fill="#1e293b" />
          </g>
          <path
            d="M24 40V13"
            stroke="#5eead4"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="6" r="5.5" fill="#5eead4" />
        </g>
        <clipPath id="critters-07-dbcrb-squat">
          <path d="M8 106V70c0-24 16-36 42-36s42 12 42 36v36Z" />
        </clipPath>
        <g id="critters-07-body-squat-c28734fa">
          <g className="dbcr-t">
            <use transform="translate(26 10)" href="#critters-07-top-antenna-c28734fa" />
          </g>
          <path d="M11 109.5v-36c0-24 16-36 42-36s42 12 42 36v36Z" fill="#1e293b" opacity=".15" />
          <path d="M8 106V70c0-24 16-36 42-36s42 12 42 36v36Z" fill="#a5b4fc" />
          <g clipPath="url(#critters-07-dbcrb-squat)">
            <path
              d="M8 106V70c0-24 16-36 42-36s42 12 42 36v36Zm3.5 4.5v-36c0-24 16-36 42-36s42 12 42 36v36Z"
              fill="#ffffff"
              opacity=".16"
              fillRule="evenodd"
            />
            <path
              d="M8 106V70c0-24 16-36 42-36s42 12 42 36v36Zm-3.5-4.5v-36c0-24 16-36 42-36s42 12 42 36v36Z"
              fill="#1e293b"
              opacity=".1"
              fillRule="evenodd"
            />
          </g>
        </g>
        <g id="critters-07-pattern-dotRow-c28734fa">
          <circle cx="6" cy="10" r="2.5" fill="#ffffff" opacity=".25" />
          <circle cx="16" cy="10" r="2.5" fill="#ffffff" opacity=".25" />
          <circle cx="26" cy="10" r="2.5" fill="#ffffff" opacity=".25" />
        </g>
        <g id="critters-07-eyes-closedLine-c28734fa">
          <g className="dbcr-eb">
            <path
              d="M3 12q7 6 14 0"
              stroke="#1e293b"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <g className="dbcr-eb">
            <path
              d="M29 12q7 6 14 0"
              stroke="#1e293b"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
        <g id="critters-07-mouth-ooh-c28734fa">
          <circle cx="14" cy="8" r="4.5" fill="#1e293b" />
        </g>
        <g id="critters-07-animation-none-c28734fa"></g>
        <clipPath id="critters-07-clip-c28734fa">
          <rect width="100" height="100" rx="0" ry="0" />
        </clipPath>
      </defs>
      <g clipPath="url(#critters-07-clip-c28734fa)">
        <rect width="100" height="100" fill="#4338ca" />
        <g className="dbcr-c">
          <use href="#critters-07-body-squat-c28734fa" />
          <use transform="translate(34 75)" href="#critters-07-pattern-dotRow-c28734fa" />
          <use transform="translate(27 36)" href="#critters-07-eyes-closedLine-c28734fa" />
          <use transform="translate(36 60)" href="#critters-07-mouth-ooh-c28734fa" />
        </g>
        <use href="#critters-07-animation-none-c28734fa" />
      </g>
    </svg>
  ),
  'critters-08': (className) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="auto"
      className={className}
    >
      <defs>
        <clipPath id="critters-08-dbcrb-blob">
          <path d="M14 106V64c0-12 4-24 12-28 6-3 6-10 14-12 6-2 8 3 12 2s3-4 10-3c8 1 6 9 12 13 8 5 12 16 12 28v42Z" />
        </clipPath>
        <g id="critters-08-body-blob-b0215ab5">
          <path
            d="M17 109.5v-42c0-12 4-24 12-28 6-3 6-10 14-12 6-2 8 3 12 2s3-4 10-3c8 1 6 9 12 13 8 5 12 16 12 28v42Z"
            fill="#1e293b"
            opacity=".15"
          />
          <path
            d="M14 106V64c0-12 4-24 12-28 6-3 6-10 14-12 6-2 8 3 12 2s3-4 10-3c8 1 6 9 12 13 8 5 12 16 12 28v42Z"
            fill="#f0abfc"
          />
          <g clipPath="url(#critters-08-dbcrb-blob)">
            <path
              d="M14 106V64c0-12 4-24 12-28 6-3 6-10 14-12 6-2 8 3 12 2s3-4 10-3c8 1 6 9 12 13 8 5 12 16 12 28v42Zm3.5 4.5v-42c0-12 4-24 12-28 6-3 6-10 14-12 6-2 8 3 12 2s3-4 10-3c8 1 6 9 12 13 8 5 12 16 12 28v42Z"
              fill="#ffffff"
              opacity=".16"
              fillRule="evenodd"
            />
            <path
              d="M14 106V64c0-12 4-24 12-28 6-3 6-10 14-12 6-2 8 3 12 2s3-4 10-3c8 1 6 9 12 13 8 5 12 16 12 28v42Zm-3.5-4.5v-42c0-12 4-24 12-28 6-3 6-10 14-12 6-2 8 3 12 2s3-4 10-3c8 1 6 9 12 13 8 5 12 16 12 28v42Z"
              fill="#1e293b"
              opacity=".1"
              fillRule="evenodd"
            />
          </g>
        </g>
        <g id="critters-08-cheeks-blushBig-b0215ab5">
          <ellipse cx="5" cy="5" rx="4.5" ry="3" fill="#ffffff" opacity=".3" />
          <ellipse cx="39" cy="5" rx="4.5" ry="3" fill="#ffffff" opacity=".3" />
        </g>
        <g id="critters-08-eyes-happy-b0215ab5">
          <g className="dbcr-eb">
            <path
              d="M3 16q7-10 14 0"
              stroke="#1e293b"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <g className="dbcr-eb">
            <path
              d="M29 16q7-10 14 0"
              stroke="#1e293b"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
        <g id="critters-08-mouth-dot-b0215ab5">
          <circle cx="14" cy="7.5" r="2.5" fill="#1e293b" />
        </g>
        <g id="critters-08-animation-none-b0215ab5"></g>
        <clipPath id="critters-08-clip-b0215ab5">
          <rect width="100" height="100" rx="0" ry="0" />
        </clipPath>
      </defs>
      <g clipPath="url(#critters-08-clip-b0215ab5)">
        <rect width="100" height="100" fill="#6d28d9" />
        <g className="dbcr-c">
          <use href="#critters-08-body-blob-b0215ab5" />
          <use transform="translate(28 53)" href="#critters-08-cheeks-blushBig-b0215ab5" />
          <use transform="translate(27 36)" href="#critters-08-eyes-happy-b0215ab5" />
          <use transform="translate(36 60)" href="#critters-08-mouth-dot-b0215ab5" />
        </g>
        <use href="#critters-08-animation-none-b0215ab5" />
      </g>
    </svg>
  ),
  'critters-09': (className) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="auto"
      className={className}
    >
      <defs>
        <g id="critters-09-top-sprout-4835fc8a">
          <g opacity=".15" transform="translate(-23 -6.5)">
            <path
              d="M50 50V26"
              stroke="#1e293b"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M50 27c-7 0-12-5-12-12 7 0 12 5 12 12m0 0c7 0 12-5 12-12-7 0-12 5-12 12"
              fill="#1e293b"
            />
          </g>
          <path
            d="M24 40V16"
            stroke="#a5b4fc"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M24 17c-7 0-12-5-12-12 7 0 12 5 12 12m0 0c7 0 12-5 12-12-7 0-12 5-12 12"
            fill="#a5b4fc"
          />
        </g>
        <clipPath id="critters-09-dbcrb-peak">
          <path d="M18 106V62c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Z" />
        </clipPath>
        <g id="critters-09-body-peak-4835fc8a">
          <g className="dbcr-t">
            <use transform="translate(26 4)" href="#critters-09-top-sprout-4835fc8a" />
          </g>
          <path
            d="M21 109.5v-44c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Z"
            fill="#1e293b"
            opacity=".15"
          />
          <path d="M18 106V62c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Z" fill="#e2e8f0" />
          <g clipPath="url(#critters-09-dbcrb-peak)">
            <path
              d="M18 106V62c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Zm3.5 4.5v-44c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Z"
              fill="#ffffff"
              opacity=".16"
              fillRule="evenodd"
            />
            <path
              d="M18 106V62c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Zm-3.5-4.5v-44c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Z"
              fill="#1e293b"
              opacity=".1"
              fillRule="evenodd"
            />
          </g>
        </g>
        <g id="critters-09-pattern-dotRow-4835fc8a">
          <circle cx="6" cy="10" r="2.5" fill="#ffffff" opacity=".25" />
          <circle cx="16" cy="10" r="2.5" fill="#ffffff" opacity=".25" />
          <circle cx="26" cy="10" r="2.5" fill="#ffffff" opacity=".25" />
        </g>
        <g id="critters-09-eyes-sideeye-4835fc8a">
          <g className="dbcr-eb">
            <circle cx="10" cy="13" r="7" fill="#ffffff" />
            <circle cx="13.5" cy="13" r="3" fill="#1e293b" />
          </g>
          <g className="dbcr-eb">
            <circle cx="36" cy="13" r="7" fill="#ffffff" />
            <circle cx="39.5" cy="13" r="3" fill="#1e293b" />
          </g>
        </g>
        <g id="critters-09-mouth-blep-4835fc8a">
          <path
            d="M7 6h14"
            stroke="#1e293b"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 6a4 4 0 0 0 8 0Z" fill="#fb7185" />
        </g>
        <g id="critters-09-animation-none-4835fc8a"></g>
        <clipPath id="critters-09-clip-4835fc8a">
          <rect width="100" height="100" rx="0" ry="0" />
        </clipPath>
      </defs>
      <g clipPath="url(#critters-09-clip-4835fc8a)">
        <rect width="100" height="100" fill="#b45309" />
        <g className="dbcr-c">
          <use href="#critters-09-body-peak-4835fc8a" />
          <use transform="translate(34 75)" href="#critters-09-pattern-dotRow-4835fc8a" />
          <use transform="translate(27 36)" href="#critters-09-eyes-sideeye-4835fc8a" />
          <use transform="translate(36 60)" href="#critters-09-mouth-blep-4835fc8a" />
        </g>
        <use href="#critters-09-animation-none-4835fc8a" />
      </g>
    </svg>
  ),
  'critters-10': (className) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="auto"
      className={className}
    >
      <defs>
        <clipPath id="critters-10-dbcrb-wedgeInv">
          <path d="M26 106v-6l-8-64q-1-8 6-8h52q7 0 8 8l-10 64v6Z" />
        </clipPath>
        <g id="critters-10-body-wedgeInv-f6ea4820">
          <path d="M29 109.5v-6l-8-64q-1-8 6-8h52q7 0 8 8l-10 64v6Z" fill="#1e293b" opacity=".15" />
          <path d="M26 106v-6l-8-64q-1-8 6-8h52q7 0 8 8l-10 64v6Z" fill="#f0abfc" />
          <g clipPath="url(#critters-10-dbcrb-wedgeInv)">
            <path
              d="M26 106v-6l-8-64q-1-8 6-8h52q7 0 8 8l-10 64v6Zm3.5 4.5v-6l-8-64q-1-8 6-8h52q7 0 8 8l-10 64v6Z"
              fill="#ffffff"
              opacity=".16"
              fillRule="evenodd"
            />
            <path
              d="M26 106v-6l-8-64q-1-8 6-8h52q7 0 8 8l-10 64v6Zm-3.5-4.5v-6l-8-64q-1-8 6-8h52q7 0 8 8l-10 64v6Z"
              fill="#1e293b"
              opacity=".1"
              fillRule="evenodd"
            />
          </g>
        </g>
        <g id="critters-10-pattern-bar-f6ea4820">
          <rect x="2" y="3" width="28" height="8" rx="4" fill="#ffffff" opacity=".18" />
        </g>
        <g id="critters-10-cheeks-blushBig-f6ea4820">
          <ellipse cx="5" cy="5" rx="4.5" ry="3" fill="#ffffff" opacity=".3" />
          <ellipse cx="39" cy="5" rx="4.5" ry="3" fill="#ffffff" opacity=".3" />
        </g>
        <g id="critters-10-eyes-close-f6ea4820">
          <g className="dbcr-eb">
            <circle cx="17" cy="13" r="3" fill="#1e293b" />
          </g>
          <g className="dbcr-eb">
            <circle cx="29" cy="13" r="3" fill="#1e293b" />
          </g>
        </g>
        <g id="critters-10-mouth-ooh-f6ea4820">
          <circle cx="14" cy="8" r="4.5" fill="#1e293b" />
        </g>
        <g id="critters-10-animation-none-f6ea4820"></g>
        <clipPath id="critters-10-clip-f6ea4820">
          <rect width="100" height="100" rx="0" ry="0" />
        </clipPath>
      </defs>
      <g clipPath="url(#critters-10-clip-f6ea4820)">
        <rect width="100" height="100" fill="#b45309" />
        <g className="dbcr-c">
          <use href="#critters-10-body-wedgeInv-f6ea4820" />
          <use transform="translate(34 75)" href="#critters-10-pattern-bar-f6ea4820" />
          <use transform="translate(28 53)" href="#critters-10-cheeks-blushBig-f6ea4820" />
          <use transform="translate(27 36)" href="#critters-10-eyes-close-f6ea4820" />
          <use transform="translate(36 60)" href="#critters-10-mouth-ooh-f6ea4820" />
        </g>
        <use href="#critters-10-animation-none-f6ea4820" />
      </g>
    </svg>
  ),
  'critters-11': (className) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="auto"
      className={className}
    >
      <defs>
        <g id="critters-11-top-earsDroop-20a65cc8">
          <g opacity=".15" transform="translate(-23 -6.5)">
            <ellipse
              cx="36"
              cy="32"
              rx="5.5"
              ry="16"
              transform="rotate(-16 36 32)"
              fill="#1e293b"
            />
            <ellipse cx="64" cy="32" rx="5.5" ry="16" transform="rotate(16 64 32)" fill="#1e293b" />
          </g>
          <ellipse
            cx="36"
            cy="32"
            rx="5.5"
            ry="16"
            transform="rotate(-16 -12.577 119.5)"
            fill="#c4b5fd"
          />
          <ellipse
            cx="64"
            cy="32"
            rx="5.5"
            ry="16"
            transform="rotate(16 86.577 -65.5)"
            fill="#c4b5fd"
          />
        </g>
        <clipPath id="critters-11-dbcrb-block">
          <path d="M12 106V36q0-8 8-8h60q8 0 8 8v70Z" />
        </clipPath>
        <g id="critters-11-body-block-20a65cc8">
          <g className="dbcr-t">
            <use transform="translate(26 5.5)" href="#critters-11-top-earsDroop-20a65cc8" />
          </g>
          <path d="M15 109.5v-70q0-8 8-8h60q8 0 8 8v70Z" fill="#1e293b" opacity=".15" />
          <path d="M12 106V36q0-8 8-8h60q8 0 8 8v70Z" fill="#fcd34d" />
          <g clipPath="url(#critters-11-dbcrb-block)">
            <path
              d="M12 106V36q0-8 8-8h60q8 0 8 8v70Zm3.5 4.5v-70q0-8 8-8h60q8 0 8 8v70Z"
              fill="#ffffff"
              opacity=".16"
              fillRule="evenodd"
            />
            <path
              d="M12 106V36q0-8 8-8h60q8 0 8 8v70Zm-3.5-4.5v-70q0-8 8-8h60q8 0 8 8v70Z"
              fill="#1e293b"
              opacity=".1"
              fillRule="evenodd"
            />
          </g>
        </g>
        <g id="critters-11-pattern-bar-20a65cc8">
          <rect x="2" y="3" width="28" height="8" rx="4" fill="#ffffff" opacity=".18" />
        </g>
        <g id="critters-11-cheeks-blush-20a65cc8">
          <circle cx="4" cy="5" r="3.5" fill="#ffffff" opacity=".3" />
          <circle cx="40" cy="5" r="3.5" fill="#ffffff" opacity=".3" />
        </g>
        <g id="critters-11-eyes-round-20a65cc8">
          <g className="dbcr-eb">
            <circle cx="10" cy="13" r="7" fill="#ffffff" />
            <circle cx="10" cy="13" r="3" fill="#1e293b" />
          </g>
          <g className="dbcr-eb">
            <circle cx="36" cy="13" r="7" fill="#ffffff" />
            <circle cx="36" cy="13" r="3" fill="#1e293b" />
          </g>
        </g>
        <g id="critters-11-mouth-dot-20a65cc8">
          <circle cx="14" cy="7.5" r="2.5" fill="#1e293b" />
        </g>
        <g id="critters-11-animation-none-20a65cc8"></g>
        <clipPath id="critters-11-clip-20a65cc8">
          <rect width="100" height="100" rx="0" ry="0" />
        </clipPath>
      </defs>
      <g clipPath="url(#critters-11-clip-20a65cc8)">
        <rect width="100" height="100" fill="#b45309" />
        <g className="dbcr-c">
          <use href="#critters-11-body-block-20a65cc8" />
          <use transform="translate(34 75)" href="#critters-11-pattern-bar-20a65cc8" />
          <use transform="translate(28 53)" href="#critters-11-cheeks-blush-20a65cc8" />
          <use transform="translate(27 36)" href="#critters-11-eyes-round-20a65cc8" />
          <use transform="translate(36 60)" href="#critters-11-mouth-dot-20a65cc8" />
        </g>
        <use href="#critters-11-animation-none-20a65cc8" />
      </g>
    </svg>
  ),
  'critters-12': (className) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="auto"
      className={className}
    >
      <defs>
        <g id="critters-12-top-fin-e2aec94a">
          <g opacity=".15" transform="translate(-23 -6.5)">
            <path d="M40 50c0-22 4-35 10-37 6 2 10 15 10 37Z" fill="#1e293b" />
          </g>
          <path d="M14 40c0-22 4-35 10-37 6 2 10 15 10 37Z" fill="#f0abfc" />
        </g>
        <clipPath id="critters-12-dbcrb-peak">
          <path d="M18 106V62c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Z" />
        </clipPath>
        <g id="critters-12-body-peak-e2aec94a">
          <g className="dbcr-t">
            <use transform="translate(26 4)" href="#critters-12-top-fin-e2aec94a" />
          </g>
          <path
            d="M21 109.5v-44c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Z"
            fill="#1e293b"
            opacity=".15"
          />
          <path d="M18 106V62c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Z" fill="#a5b4fc" />
          <g clipPath="url(#critters-12-dbcrb-peak)">
            <path
              d="M18 106V62c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Zm3.5 4.5v-44c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Z"
              fill="#ffffff"
              opacity=".16"
              fillRule="evenodd"
            />
            <path
              d="M18 106V62c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Zm-3.5-4.5v-44c0-20 18-26 26-36q6-7 12 0c8 10 26 16 26 36v44Z"
              fill="#1e293b"
              opacity=".1"
              fillRule="evenodd"
            />
          </g>
        </g>
        <g id="critters-12-eyes-uneven-e2aec94a">
          <g className="dbcr-eb">
            <circle cx="10" cy="12" r="8" fill="#ffffff" />
            <circle cx="10" cy="12" r="3.5" fill="#1e293b" />
          </g>
          <g className="dbcr-eb">
            <circle cx="36" cy="14" r="5.5" fill="#ffffff" />
            <circle cx="36" cy="14" r="2.2" fill="#1e293b" />
          </g>
        </g>
        <g id="critters-12-mouth-blep-e2aec94a">
          <path
            d="M7 6h14"
            stroke="#1e293b"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 6a4 4 0 0 0 8 0Z" fill="#fb7185" />
        </g>
        <g id="critters-12-animation-none-e2aec94a"></g>
        <clipPath id="critters-12-clip-e2aec94a">
          <rect width="100" height="100" rx="0" ry="0" />
        </clipPath>
      </defs>
      <g clipPath="url(#critters-12-clip-e2aec94a)">
        <rect width="100" height="100" fill="#0f766e" />
        <g className="dbcr-c">
          <use href="#critters-12-body-peak-e2aec94a" />
          <use transform="translate(27 36)" href="#critters-12-eyes-uneven-e2aec94a" />
          <use transform="translate(36 60)" href="#critters-12-mouth-blep-e2aec94a" />
        </g>
        <use href="#critters-12-animation-none-e2aec94a" />
      </g>
    </svg>
  ),
};

/**
 * One avatar at whatever size the caller asks for. Unknown ids render nothing, never a broken box.
 *
 * The default is `size-full`, not `h-full w-full`, and that is not a style preference: the app's
 * `Button` sizes any svg inside it to 16px unless the class contains `size-`
 * (`[&_svg:not([class*='size-'])]:size-4`), which is what shrank the avatar in the header's menu
 * button while the same component rendered correctly on the profile page.
 */
export const profileAvatarSvg = (
  id: ProfileAvatarId,
  className = 'size-full'
): ReactElement | null => AVATAR_SVGS[id]?.(className) ?? null;
