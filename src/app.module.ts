import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SapInvoiceModule } from './sap-invoice/sap-invoice.module';
import { InvoiceCronModule } from './config/invoice-cron.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    SapInvoiceModule,
    InvoiceCronModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
