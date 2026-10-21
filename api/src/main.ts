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

  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
