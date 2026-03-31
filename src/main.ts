import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AppConfigService } from './common/config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);

  // Allow larger JSON payloads (e.g. data:image/...;base64,... for product images)
  // Default Express/Nest body limits can reject large strings before Zod validation.
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Frontend expects APIs under `/fe/*`.
  // Without this prefix, Nest exposes routes as `/<controller>` (e.g. `/products`),
  // while the UI calls `/fe/products`.
  app.setGlobalPrefix('fe');

  app.enableShutdownHooks();
  app.enableCors({
    origin: config.corsOrigins.length ? config.corsOrigins : true,
    credentials: true,
  });

  await app.listen(config.app.port, config.app.host);
}
bootstrap();
