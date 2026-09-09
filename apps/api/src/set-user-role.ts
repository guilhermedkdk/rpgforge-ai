/**
 * Changes a user's role. ADMIN skips every rate limit, which keeps the owner's account usable.
 *
 *   pnpm --filter @rpgforce-ai/api run user:role -- voce@exemplo.com ADMIN|USER
 *   pnpm --filter @rpgforce-ai/api run user:role -- --list
 */
import { NestFactory } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AppModule } from './app.module';
import { PrismaService } from './shared/prisma.service';

const ROLES = Object.values(UserRole) as UserRole[];

const usage = () => {
  console.log('Uso:');
  console.log('  node dist/set-user-role.js <email> <USER|ADMIN>');
  console.log('  node dist/set-user-role.js --list');
};

const run = async () => {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);

  const finish = async (code: number) => {
    await app.close();
    process.exit(code);
  };

  if (args[0] === '--list') {
    const admins = await prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { email: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (admins.length === 0) {
      console.log('Nenhuma conta ADMIN. Toda conta está sujeita ao rate limit.');
      return finish(0);
    }

    console.log(`Contas ADMIN (${admins.length}), isentas de rate limit:`);
    for (const admin of admins) console.log(`  ${admin.email}`);
    return finish(0);
  }

  const [email, role] = args;

  if (!email || !role) {
    usage();
    return finish(1);
  }

  if (!ROLES.includes(role as UserRole)) {
    console.error(`Role inválida: "${role}". Use uma de: ${ROLES.join(' | ')}`);
    return finish(1);
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });

  if (!user) {
    console.error(`Nenhum usuário com o email "${email}".`);
    return finish(1);
  }

  if (user.role === role) {
    console.log(`"${email}" já é ${role}. Nada a fazer.`);
    return finish(0);
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: role as UserRole } });

  console.log(`"${email}": ${user.role} → ${role}`);
  console.log(
    role === UserRole.ADMIN
      ? 'Essa conta passa a ignorar todos os limites de requisição.'
      : 'Essa conta volta a respeitar os limites de requisição.'
  );
  // The role travels inside the access token, so a session already open only picks it up on the
  // next refresh.
  console.log('Vale a partir do próximo refresh do token (até 15 min) ou de um novo login.');

  return finish(0);
};

run().catch((err) => {
  console.error('Falha ao alterar a role:', err);
  process.exit(1);
});
