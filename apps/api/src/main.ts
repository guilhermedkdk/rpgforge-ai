import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './app-setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a proxy the client IP only exists in X-Forwarded-For, and rate limiting counts anonymous
  // traffic by IP. Opt-in: with no proxy in front, trusting that header lets anyone forge it.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  configureApp(app);

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:4000',
    credentials: true,
  });

  const port = process.env.PORT || 4001;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}`);
}
bootstrap();
