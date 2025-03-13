import { Controller, Post } from '@nestjs/common';
import { SapInvoiceService } from './sap-invoice.service';

@Controller('sap')
export class SapInvoiceController {
  constructor(private readonly sapInvoiceService: SapInvoiceService) {}

  @Post('auto-transfer-invoices')
  async autoTransferInvoices() {
    return this.sapInvoiceService.autoTransferInvoices();
  }
}
