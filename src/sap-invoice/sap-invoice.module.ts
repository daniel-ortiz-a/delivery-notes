import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SapInvoiceService } from './sap-invoice.service';
import { SapInvoiceController } from './sap-invoice.controller';
import { ReportModule } from '../reports/report.module';

@Module({
  imports: [HttpModule, ReportModule],
  controllers: [SapInvoiceController],
  providers: [SapInvoiceService],
  exports: [SapInvoiceService],
})
export class SapInvoiceModule {}
