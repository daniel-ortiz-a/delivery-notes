import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { SapService } from './sap/sap.service';
import { SapModule } from './sap/sap.module';
import { SapInvoiceService } from './sap-invoice/sap-invoice.service';
import { SapInvoiceController } from './sap-invoice/sap-invoice.controller';
import { SapInvoiceModule } from './sap-invoice/sap-invoice.module';
import { SchedulerModule } from './config/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule,
    SapModule,
    SapInvoiceModule,
    SchedulerModule,
  ],
  providers: [SapService, SapInvoiceService],
  exports: [SapService],
  controllers: [SapInvoiceController],
})
export class AppModule {}
