import { Controller, Post } from '@nestjs/common';
import { SapInvoiceService } from './sap-invoice.service';

@Controller('sap-invoices')
export class SapInvoiceController {
  constructor(private readonly sapInvoiceService: SapInvoiceService) {}

  @Post('auto-transfer')
  async autoTransferInvoices() {
    return this.sapInvoiceService.autoTransferInvoices();
  }
}
