import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const appServiceMock = {
    getAppInfo: jest.fn(() => ({
      name: 'backend-maxwell',
      environment: 'test',
      database: 'postgresql',
      transport: 'nestjs-rest',
      runtime: {
        host: '0.0.0.0',
        port: 3001,
        corsOrigins: ['http://localhost:3000'],
      },
      storage: {
        engine: 'postgresql',
        connectionMode: 'discrete',
        host: '127.0.0.1',
        port: 5432,
        database: 'maxwell_local',
        ssl: false,
        poolMax: 10,
        applicationName: 'maxwell-backend',
      },
    })),
    getHealth: jest.fn(async () => ({
      status: 'ok',
      environment: 'test',
      database: {
        engine: 'postgresql',
        connectionMode: 'discrete',
        host: '127.0.0.1',
        port: 5432,
        database: 'maxwell_local',
        ssl: false,
        poolMax: 10,
        applicationName: 'maxwell-backend',
        status: 'ok',
        latencyMs: 1,
      },
      timestamp: '2026-03-13T00:00:00.000Z',
    })),
    getReadiness: jest.fn(async () => ({
      status: 'ready',
      environment: 'test',
      database: {
        engine: 'postgresql',
        connectionMode: 'discrete',
        host: '127.0.0.1',
        port: 5432,
        database: 'maxwell_local',
        ssl: false,
        poolMax: 10,
        applicationName: 'maxwell-backend',
        status: 'ok',
        latencyMs: 1,
      },
      timestamp: '2026-03-13T00:00:00.000Z',
    })),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: appServiceMock,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return app info', () => {
      expect(appController.getInfo()).toEqual({
        name: 'backend-maxwell',
        environment: 'test',
        database: 'postgresql',
        transport: 'nestjs-rest',
        runtime: {
          host: '0.0.0.0',
          port: 3001,
          corsOrigins: ['http://localhost:3000'],
        },
        storage: {
          engine: 'postgresql',
          connectionMode: 'discrete',
          host: '127.0.0.1',
          port: 5432,
          database: 'maxwell_local',
          ssl: false,
          poolMax: 10,
          applicationName: 'maxwell-backend',
        },
      });
    });
  });

  describe('readiness', () => {
    it('should return readiness information', async () => {
      await expect(appController.getReadiness()).resolves.toEqual({
        status: 'ready',
        environment: 'test',
        database: {
          engine: 'postgresql',
          connectionMode: 'discrete',
          host: '127.0.0.1',
          port: 5432,
          database: 'maxwell_local',
          ssl: false,
          poolMax: 10,
          applicationName: 'maxwell-backend',
          status: 'ok',
          latencyMs: 1,
        },
        timestamp: '2026-03-13T00:00:00.000Z',
      });
    });
  });
});
