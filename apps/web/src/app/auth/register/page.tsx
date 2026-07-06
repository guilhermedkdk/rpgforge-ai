import { BackLink } from '@/components/ui/back-link';
import { RegisterForm } from '@/components/auth/register-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <BackLink href="/">Voltar para home</BackLink>
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-3xl">Criar conta</CardTitle>
            <CardDescription className="text-center">Crie sua conta para começar</CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
