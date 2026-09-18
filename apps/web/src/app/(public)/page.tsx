import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { HeroVideo } from '@/components/marketing/hero-video';
import { LandingShowcase } from '@/components/marketing/landing-showcase';

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

/**
 * The signed-out landing page, rendered on the server.
 *
 * The pitch owes nothing to the session, so nothing here waits for it; the showcase owns its own
 * data as an island.
 *
 * A signed-in visitor never sees this page at all: the session rides in an httpOnly cookie on this
 * origin (the API answers through the `/api/*` rewrite), so the redirect happens on the server
 * before a byte of HTML is sent. Cookie presence is a routing hint, not proof; an expired token
 * lands on `/sheets`, which does its own check.
 */
export default async function Home() {
  const cookieStore = await cookies();
  if (cookieStore.has('refreshToken')) {
    redirect('/sheets');
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 pt-16 pb-14 text-center md:pt-24">
          <h1 className="font-serif text-4xl font-bold leading-tight text-foreground md:text-6xl">
            Descreva o personagem.
            <br />
            <span className="text-primary-ink">Receba a ficha pronta.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Você conta a história. A IA escolhe classe, magias e equipamento sem sair das regras, e
            o RPGForge faz as contas: pontos de vida, classe de armadura, perícias, testes de
            resistência.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/create">Criar minha ficha</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/explore">Ver o que a comunidade forjou</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 pb-16">
          <div className="video-bezel overflow-hidden rounded-xl border border-border p-2 shadow-2xl shadow-black/50 sm:p-3">
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
                  {/* The sequence is the information here, so the marker is earned; the die face is
                      what makes it this product's marker and not a numbered list's. */}
                  <span
                    className="die-face die-face-on-band h-14 w-14 justify-self-start"
                    aria-hidden="true"
                  >
                    <span className="font-serif text-2xl font-bold text-primary-ink">
                      {index + 1}
                    </span>
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

        <LandingShowcase />

        {/* Unconditional on purpose: the showcase above it is not, so without this the page can end
            on a link that sends the visitor away, or on nothing to click at all. */}
        <section className="border-t border-border bg-card/40">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 text-center">
            <h2 className="font-serif text-2xl font-bold text-foreground md:text-3xl">
              Seu próximo personagem está a uma frase de distância
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Conte quem ele é. O RPGForge escolhe dentro das regras, faz as contas e entrega a
              ficha pronta para editar.
            </p>
            <div className="mt-7 flex justify-center">
              <Button size="lg" asChild>
                <Link href="/create">Criar minha ficha</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
