import { Module } from '@nestjs/common';
import { SapController } from './sap.controller';
import { SapService } from './sap.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule], // 👈 Asegúrate de importar HttpModule
  controllers: [SapController],
  providers: [SapService],
  exports: [SapService],
})
export class SapModule {}
