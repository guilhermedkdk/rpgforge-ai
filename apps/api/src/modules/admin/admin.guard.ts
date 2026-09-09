import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Admin-only routes. Runs AFTER `JwtAuthGuard`, so it reads the user the strategy already resolved
 * instead of parsing the token again; `validateUser` selects `role`, so this costs no extra query.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    if (request.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Esta área é restrita a administradores');
    }
    return true;
  }
}
