/* eslint-disable @typescript-eslint/no-unused-vars */
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { InvoiceCronService } from './invoice-cron.service';
import { SapInvoiceService } from '../sap-invoice/sap-invoice.service';
import { SapInvoiceModule } from '../sap-invoice/sap-invoice.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    HttpModule,
    ConfigModule,
    SapInvoiceModule,
  ],
  providers: [InvoiceCronService],
  exports: [InvoiceCronService],
})
export class InvoiceCronModule {}
