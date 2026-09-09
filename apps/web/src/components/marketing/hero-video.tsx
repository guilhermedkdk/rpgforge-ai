'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Two reasons to stay a still image, folded into one query.
 *
 * Under 768px the app UI inside the recording is unreadable, so 1.5 MB of mobile data buys nothing;
 * and a visitor who asked for reduced motion should never get a loop they did not start.
 */
const AUTOPLAY_QUERY = '(min-width: 768px) and (prefers-reduced-motion: no-preference)';

/**
 * The landing page screencast: one real generation, muted and looping.
 *
 * `preload="none"` is deliberate. The file is only fetched once the effect decides it may play, so
 * the first paint never waits on it and whoever does not get autoplay does not download it at all.
 * Those visitors keep the poster and get native controls, which is how they can still opt in.
 */
export const HeroVideo = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [autoplays, setAutoplays] = useState<boolean>(false);

  useEffect(() => {
    const media = window.matchMedia(AUTOPLAY_QUERY);

    const apply = (allowed: boolean): void => {
      setAutoplays(allowed);

      const video = videoRef.current;
      if (!video) return;

      if (!allowed) {
        video.pause();
        return;
      }

      // Autoplay is only allowed while the element is muted, and React does not always land the
      // attribute before the first play attempt.
      video.muted = true;
      // A refusal (data saver, background tab) leaves the poster up, which is the fallback anyway.
      video.play().catch(() => undefined);
    };

    apply(media.matches);

    const handleChange = (event: MediaQueryListEvent): void => apply(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return (
    <video
      ref={videoRef}
      className="block w-full"
      width={1440}
      height={836}
      poster="/video/geracao-poster.webp"
      preload="none"
      muted
      loop
      playsInline
      controls={!autoplays}
      aria-label="Gravação de tela: uma frase em português vira uma ficha de D&D SRD 5.2 pronta, salva e publicada."
    >
      <source src="/video/geracao.webm" type="video/webm" />
      <source src="/video/geracao.mp4" type="video/mp4" />
    </video>
  );
};
