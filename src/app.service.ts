import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from './common/config/app-config.service';
import { DbService } from './common/db.service';

@Injectable()
export class AppService {
  constructor(
    private readonly config: AppConfigService,
    private readonly db: DbService,
  ) {}

  getAppInfo() {
    return {
      name: this.config.app.name,
      environment: this.config.nodeEnv,
      database: 'postgresql',
      transport: 'nestjs-rest',
      runtime: {
        host: this.config.app.host,
        port: this.config.app.port,
        corsOrigins: this.config.corsOrigins,
      },
      storage: this.config.databaseRuntime,
    };
  }

  async getHealth() {
    const db = await this.db.getHealth();

    return {
      status: db.status === 'ok' ? 'ok' : 'degraded',
      environment: this.config.nodeEnv,
      database: db,
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    const db = await this.db.getHealth();
    const payload = {
      status: db.status === 'ok' ? 'ready' : 'not-ready',
      environment: this.config.nodeEnv,
      database: db,
      timestamp: new Date().toISOString(),
    };

    if (db.status !== 'ok') {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }
}
