import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('API de Facturación SAP')
    .setDescription('API para la automatización de facturación en SAP B1')
    .setVersion('1.0')
    .addTag('facturación', 'Operaciones relacionadas con la facturación')
    .addTag('reportes', 'Operaciones relacionadas con reportes')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.APP_PORT || 3000);
  Logger.log(`Server running on port ${process.env.APP_PORT || 3000}`);
  Logger.log(
    `Swagger documentation available at http://localhost:${process.env.APP_PORT || 3000}/api`,
  );
}
bootstrap();
