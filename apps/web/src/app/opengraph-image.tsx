import { ImageResponse } from 'next/og';

export const alt = 'RPGForge AI: descreva o personagem e receba a ficha de D&D SRD 5.2 pronta.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The palette is the product's own: --background, --foreground, --muted-foreground and the amber
// fill. Written as literals because ImageResponse renders outside the page, with no tokens to read.
const BG = '#0a0a0a';
const FG = '#fafafa';
const MUTED = '#a1a1a1';
const AMBER = '#eb8656';
const LINE = '#262626';

const OpengraphImage = () =>
  new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BG,
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* The die face, the one silhouette this product owns. */}
          <svg width="56" height="56" viewBox="0 0 100 100" aria-hidden="true">
            <polygon
              points="50,2 96,26 96,74 50,98 4,74 4,26"
              fill="none"
              stroke={AMBER}
              strokeWidth="5"
            />
          </svg>
          <span style={{ color: FG, fontSize: 34, fontWeight: 700, letterSpacing: '0.04em' }}>
            RPGFORGE AI
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: FG, fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>
            Descreva o personagem.
          </span>
          <span style={{ color: AMBER, fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>
            Receba a ficha pronta.
          </span>
          <span style={{ color: MUTED, fontSize: 30, lineHeight: 1.45, marginTop: 28 }}>
            A IA escolhe dentro das regras. O motor faz as contas.
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            borderTop: `1px solid ${LINE}`,
            paddingTop: 26,
          }}
        >
          <span style={{ color: MUTED, fontSize: 24 }}>D&D SRD 5.2</span>
          <span style={{ color: LINE, fontSize: 24 }}>·</span>
          <span style={{ color: MUTED, fontSize: 24 }}>conteúdo aberto CC BY 4.0</span>
        </div>
      </div>
    ),
    size
  );

export default OpengraphImage;
