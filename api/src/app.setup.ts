import { INestApplication, ValidationPipe } from '@nestjs/common';

/** HTTP settings shared by main.ts and the e2e tests, so tests hit the real setup. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true, // apply DTO defaults and @Type conversions (dates, numbers)
    }),
  );
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim()),
  });
}
