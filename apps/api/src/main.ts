import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import helmet from "@fastify/helmet";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );

  const config = app.get(ConfigService);

  await app.register(helmet);

  app.enableCors({
    origin: config
      .get<string>("CORS_ORIGINS", "http://localhost:3000")
      .split(",")
      .map((o) => o.trim()),
    credentials: true,
  });

  const port = config.get<number>("API_PORT", 4000);
  const host = config.get<string>("API_HOST", "0.0.0.0");

  await app.listen(port, host);
  Logger.log(`API слушает http://${host}:${port}`, "Bootstrap");
}

void bootstrap();
