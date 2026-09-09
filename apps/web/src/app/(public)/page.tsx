'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Compass } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { HeroVideo } from '@/components/marketing/hero-video';
import { PublicSheetCard } from '@/components/sheets/public-sheet-card';
import { publicSheetsApi } from '@/lib/api/public-sheets';
import { packsApi } from '@/lib/api/packs';

/** Enough to fill two rows on a wide screen without turning the landing page into the explore page. */
const SHOWCASE_COUNT = 6;

const STEPS = [
  {
    title: 'Você conta quem ele é',
    body: 'Do jeito que você contaria para a mesa. Sem formulário, sem escolher classe antes de saber quem é o personagem.',
    // Names no class on purpose, which is the whole point of the step above it. It also cannot
    // promise something the installed pack does not have: D&D SRD 5.2 ships 12 classes and 9
    // species, and an example that asks for an artificer would advertise a refusal.
    example:
      'Uma anã que perdeu a forja da família num incêndio e agora caça quem ateou fogo nela.',
  },
  {
    title: 'A IA pergunta o que falta',
    body: 'Três a cinco perguntas curtas para fechar o que a sua descrição deixou em aberto: nível, estilo de combate, o que ela carrega.',
    example: 'Ela luta de perto ou prefere resolver de longe?',
  },
  {
    title: 'A ficha nasce pronta',
    body: 'Com cada escolha justificada, ligada à regra do sistema que a originou. Daí em diante é sua: edite, publique, exporte em PDF.',
    example: 'Pontos de vida, CA, perícias e testes de resistência já calculados.',
  },
];

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/sheets');
    }
  }, [user, isLoading, router]);

  // The landing page is for signed-out visitors; showing published sheets here is the same open
  // feed /explore reads, so it costs nothing extra and it is real content instead of a mockup.
  const { data: packs } = useQuery({ queryKey: ['packs'], queryFn: packsApi.getAll });
  const { data: showcase } = useQuery({
    queryKey: ['public-sheets', 'landing'],
    queryFn: () => publicSheetsApi.list({ limit: SHOWCASE_COUNT, offset: 0 }),
    enabled: !isLoading && !user,
  });

  const packById = new Map((packs ?? []).map((pack) => [pack.id, pack]));
  const sheets = showcase?.items ?? [];

  // Redirect guard, not a data-loading gate: avoids a flash of the marketing page before /sheets.
  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1 content-reveal">
        <section className="mx-auto w-full max-w-5xl px-4 pt-16 pb-14 text-center md:pt-24">
          <h1 className="font-serif text-4xl font-bold leading-tight text-foreground md:text-6xl">
            Descreva o personagem.
            <br />
            <span className="text-primary">Receba a ficha pronta.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Você conta a história. A IA escolhe classe, magias e equipamento sem sair das regras, e
            o RPGForge faz as contas: pontos de vida, classe de armadura, perícias, testes de
            resistência.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/create">
                Criar minha ficha
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/explore">
                <Compass className="mr-1 h-4 w-4" aria-hidden="true" />
                Ver o que a comunidade forjou
              </Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 pb-16">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/50">
            <HeroVideo />
          </div>
        </section>

        <section className="border-y border-border bg-card/40">
          <div className="mx-auto w-full max-w-5xl px-4 py-16">
            <h2 className="text-center font-serif text-2xl font-bold text-foreground md:text-3xl">
              Três passos, e a mesa não espera
            </h2>

            {/* Subgrid so the three cards share ROWS, not just columns: number, title, body and
                example each line up across all of them, and every example box comes out the same
                height without a hardcoded one that the next copy edit would silently break. */}
            <ol className="mt-10 grid gap-8 md:grid-cols-3 md:grid-rows-[auto_auto_1fr_auto] md:gap-y-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="grid gap-3 md:row-span-4 md:grid-rows-subgrid">
                  <span
                    className="font-serif text-3xl font-bold text-primary/40"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <h3 className="font-serif text-lg font-semibold text-foreground">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  {/* The example is the point: it shows the real texture of the flow, which a
                      feature description never does. */}
                  <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm italic leading-relaxed text-foreground/80">
                    {step.example}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {sheets.length > 0 ? (
          <section className="mx-auto w-full max-w-7xl px-4 py-16">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl font-bold text-foreground md:text-3xl">
                  Fichas publicadas agora
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Personagens de verdade, forjados por quem usa o RPGForge.
                </p>
              </div>
              <Button variant="ghost" asChild>
                <Link href="/explore">
                  Ver todas
                  <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sheets.map((sheet) => {
                const pack = packById.get(sheet.packId);
                return (
                  <PublicSheetCard
                    key={sheet.id}
                    sheet={sheet}
                    packName={pack?.name ?? null}
                    packSlug={pack?.slug ?? null}
                  />
                );
              })}
            </div>
          </section>
        ) : null}
      </main>

      <SiteFooter />
    </div>
  );
}
