import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { exec } from 'child_process';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  exec('curl ifconfig.me', (error, stdout, stderr) => {
    if (error) {
      Logger.error(`Error al obtener la IP: ${stderr}`);
    } else {
      Logger.log(`IP pública del servidor: ${stdout.trim()}`);
    }
  });

  await app.listen(process.env.APP_PORT || 3000);
}
bootstrap();
