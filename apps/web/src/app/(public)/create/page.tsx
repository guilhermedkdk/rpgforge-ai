'use client';

import { Sparkles, Pen, Flame } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function CreatePage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Page Title */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <Flame className="h-12 w-12 text-primary" aria-hidden="true" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Forjar Nova Ficha</h1>
          <p className="mt-2 text-muted-foreground">Escolha como deseja criar seu personagem</p>
        </div>

        {/* Creation Options */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* AI Creation */}
          <Card className="cursor-pointer transition-[box-shadow] hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10">
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20">
                <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <CardTitle className="font-serif text-xl">Criar com IA</CardTitle>
              <CardDescription>
                Descreva seu conceito e deixe a inteligência artificial forjar seu personagem com
                base em suas ideias.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="mb-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  Geração automática de atributos
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  Sugestões de backstory e personalidade
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  Otimização para seu sistema de RPG
                </li>
              </ul>
              <Button className="w-full" disabled>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                Em breve
              </Button>
            </CardContent>
          </Card>

          {/* Manual Creation */}
          <Card className="cursor-pointer transition-[box-shadow] hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10">
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-icon-bg">
                <Pen className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              </div>
              <CardTitle className="font-serif text-xl">Criar Manualmente</CardTitle>
              <CardDescription>
                Controle total sobre cada detalhe do seu personagem. Preencha cada campo do seu
                jeito.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="mb-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                    aria-hidden="true"
                  />
                  Liberdade criativa completa
                </li>
                <li className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                    aria-hidden="true"
                  />
                  Formulário guiado passo a passo
                </li>
                <li className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                    aria-hidden="true"
                  />
                  Validação de regras em tempo real
                </li>
              </ul>
              <Button variant="outline" className="w-full bg-transparent" disabled>
                <Pen className="mr-2 h-4 w-4" aria-hidden="true" />
                Em breve
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
