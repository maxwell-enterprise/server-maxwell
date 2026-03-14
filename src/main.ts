import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './common/config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);

  app.enableShutdownHooks();
  app.enableCors({
    origin: config.corsOrigins.length ? config.corsOrigins : true,
    credentials: true,
  });

  await app.listen(config.app.port, config.app.host);
}
bootstrap();
