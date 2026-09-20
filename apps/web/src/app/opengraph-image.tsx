import { ImageResponse } from 'next/og';

export const alt = 'RPGForge AI: descreva o personagem e receba a ficha pronta.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The dark palette as literals: ImageResponse renders outside the page, with no tokens to read.
const BG = '#0a0a0a';
const FG = '#fafafa';
const MUTED = '#a1a1a1';
const AMBER = '#eb8656';

// The brand mark's geometry, copied from components/brand/rpgforge-mark.tsx. A client component
// cannot be rendered here, and the drawing must not drift from the header's.
const SILHOUETTE = 'M16 2.6L27.6 9.3L27.6 22.7L16 29.4L4.4 22.7L4.4 9.3Z';
const FACETS =
  'M16 6.4L16 2.6M24.31 20.8L27.6 22.7M7.69 20.8L4.4 22.7M16 6.4L27.6 9.3M24.31 20.8L27.6 9.3M24.31 20.8L16 29.4M7.69 20.8L16 29.4M7.69 20.8L4.4 9.3M16 6.4L4.4 9.3';
const AI_OUTLINE =
  'M12.88 13.83L13.67 11.32L17.91 20.60L15.59 20.60L12.88 13.83M9.97 19.73L10.88 19.73Q10.78 19.99 10.84 20.17Q10.91 20.36 11.06 20.45Q11.22 20.55 11.37 20.55L11.49 20.55L11.49 20.68L8.71 20.68L8.71 20.55Q8.71 20.55 8.77 20.55Q8.83 20.55 8.83 20.55Q9.12 20.55 9.44 20.36Q9.76 20.17 9.97 19.73M13.56 11.32L13.67 11.32L13.73 12.91L10.50 20.64L9.55 20.64L12.92 13.02Q12.96 12.95 13.06 12.73Q13.15 12.52 13.27 12.24Q13.38 11.97 13.47 11.72Q13.56 11.46 13.56 11.32M11.22 17.59L15.04 17.59L15.04 18.13L11.22 18.13L11.22 17.59M15.23 19.73L17.51 19.73Q17.73 20.17 18.04 20.36Q18.35 20.55 18.65 20.55Q18.65 20.55 18.71 20.55Q18.76 20.55 18.76 20.55L18.76 20.68L14.62 20.68L14.62 20.55L14.74 20.55Q15 20.55 15.20 20.34Q15.39 20.12 15.23 19.73M20.34 11.58L22.29 11.58L22.29 20.68L20.34 20.68L20.34 11.58M20.34 19.73L20.38 19.73L20.38 20.68L19.34 20.68L19.34 20.55Q19.34 20.55 19.42 20.55Q19.51 20.55 19.51 20.55Q19.85 20.55 20.09 20.31Q20.33 20.07 20.34 19.73M20.38 11.58L20.38 12.53L20.34 12.53Q20.33 12.19 20.09 11.95Q19.85 11.71 19.51 11.71Q19.51 11.71 19.42 11.71Q19.34 11.71 19.34 11.71L19.34 11.58L20.38 11.58M22.25 20.68L22.25 19.73L22.29 19.73Q22.30 20.07 22.54 20.31Q22.78 20.55 23.12 20.55Q23.12 20.55 23.20 20.55Q23.28 20.55 23.29 20.55L23.29 20.68L22.25 20.68M22.29 12.53L22.25 12.53L22.25 11.58L23.29 11.58L23.29 11.71Q23.28 11.71 23.20 11.71Q23.12 11.71 23.12 11.71Q22.78 11.71 22.54 11.95Q22.30 12.19 22.29 12.53';
const FACET_STROKE = 1.8;

const WORDMARK = 'RPGForge';
const HEADLINE_A = 'Descreva o personagem.';
const HEADLINE_B = 'Receba a ficha pronta.';
const SUBLINE =
  'Você conta a história. A IA escolhe classe, magias e equipamento sem sair das regras, e o RPGForge faz as contas.';

// The same Google Fonts the page loads through next/font, fetched at build time like next/font
// does. `text` subsets the file to the glyphs drawn here, and a non-browser client is served TTF,
// which is what the renderer accepts.
const loadGoogleFont = async (
  family: string,
  weight: number,
  text: string
): Promise<ArrayBuffer> => {
  const params = new URLSearchParams({ family: `${family}:wght@${weight}`, text });
  const css = await fetch(`https://fonts.googleapis.com/css2?${params}`).then((res) => res.text());
  const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
  if (!url) throw new Error(`Google Fonts returned no TTF for ${family} ${weight}`);
  return fetch(url).then((res) => res.arrayBuffer());
};

// The mark as the header draws it: one solid shape with the facets and the "AI" punched through.
const Mark = ({ px }: { px: number }) => (
  <svg width={px} height={px} viewBox="0 0 32 32" aria-hidden="true">
    <mask id="mark">
      <path d={SILHOUETTE} fill="white" />
      <path
        d={FACETS}
        fill="none"
        stroke="black"
        strokeWidth={FACET_STROKE}
        strokeLinejoin="round"
      />
      <path d={AI_OUTLINE} fill="black" />
    </mask>
    <rect width="32" height="32" fill={AMBER} mask="url(#mark)" />
  </svg>
);

// The die as a wireframe, so it can sit behind the copy without competing with it.
const DieOutline = ({ px }: { px: number }) => (
  <svg width={px} height={px} viewBox="0 0 32 32" aria-hidden="true">
    <path
      d={`${SILHOUETTE}${FACETS}`}
      fill="none"
      stroke={AMBER}
      strokeWidth={0.5}
      strokeLinejoin="round"
    />
  </svg>
);

const OpengraphImage = async () => {
  const [cinzel, inter] = await Promise.all([
    loadGoogleFont('Cinzel', 700, `${WORDMARK}${HEADLINE_A}${HEADLINE_B}`),
    loadGoogleFont('Inter', 400, SUBLINE),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: BG,
        backgroundImage:
          'radial-gradient(circle at 92% 50%, rgba(235, 134, 86, 0.16) 0%, transparent 50%)',
        padding: '64px 80px',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: -220,
          top: 90,
          display: 'flex',
          opacity: 0.22,
        }}
      >
        <DieOutline px={560} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            fontFamily: 'Cinzel',
            color: FG,
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
        >
          {WORDMARK}
        </span>
        <Mark px={62} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 900 }}>
        <span
          style={{
            fontFamily: 'Cinzel',
            color: FG,
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          {HEADLINE_A}
        </span>
        <span
          style={{
            fontFamily: 'Cinzel',
            color: AMBER,
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          {HEADLINE_B}
        </span>
        <span
          style={{
            fontFamily: 'Inter',
            color: MUTED,
            fontSize: 26,
            lineHeight: 1.5,
            marginTop: 30,
            maxWidth: 880,
          }}
        >
          {SUBLINE}
        </span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Cinzel', data: cinzel, weight: 700, style: 'normal' },
        { name: 'Inter', data: inter, weight: 400, style: 'normal' },
      ],
    }
  );
};

export default OpengraphImage;
