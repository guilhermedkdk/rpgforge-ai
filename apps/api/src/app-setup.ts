import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/**
 * Everything a request passes through before it reaches a controller.
 *
 * Shared with the integration tests on purpose: auth is carried in cookies, so a suite without
 * `cookieParser` would prove nothing about the real server, and a rule that lives only inside
 * `bootstrap` is a rule no test can reach.
 */
export const configureApp = (app: INestApplication): void => {
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
};
