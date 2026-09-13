import { BackLink } from '@/components/ui/back-link';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <BackLink href="/auth/login">Voltar para o login</BackLink>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
