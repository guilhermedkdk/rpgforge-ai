import { BackLink } from '@/components/ui/back-link';
import { RegisterForm } from '@/components/auth/register-form';

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <BackLink href="/">Voltar para home</BackLink>
        <RegisterForm />
      </div>
    </div>
  );
}
