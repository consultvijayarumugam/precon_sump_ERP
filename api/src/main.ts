import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Precon ERP API')
    .setDescription('Phase 1: auth + permission-tag RBAC. Phase 2: CRM core.')
    .setVersion('0.2.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  // 0.0.0.0 = every network interface, so other devices on the same Wi-Fi can
  // reach it during local testing. Set HOST=127.0.0.1 to keep it on this machine only.
  await app.listen(process.env.PORT ?? 4000, process.env.HOST ?? '0.0.0.0');
}
await bootstrap();
