import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SapInvoiceService } from './sap-invoice.service';
import { SapInvoiceController } from './sap-invoice.controller';

@Module({
  imports: [HttpModule],
  controllers: [SapInvoiceController],
  providers: [SapInvoiceService],
  exports: [SapInvoiceService],
})
export class SapInvoiceModule {}
