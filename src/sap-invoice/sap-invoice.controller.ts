import { Controller, Post, Get, Query } from '@nestjs/common';
import { SapInvoiceService } from './sap-invoice.service';
import { DeliveryNoteErrorDto } from './dto/delivery-note-error.dto';

@Controller('sap-invoices')
export class SapInvoiceController {
  constructor(private readonly sapInvoiceService: SapInvoiceService) {}

  @Post('auto-transfer')
  async autoTransferInvoices() {
    return this.sapInvoiceService.autoTransferInvoices();
  }

  @Get('delivery-notes-with-errors')
  async getDeliveryNotesWithErrors(
    @Query('docEntry') docEntry?: string,
    @Query('cardCode') cardCode?: string,
  ): Promise<DeliveryNoteErrorDto[]> {
    return this.sapInvoiceService.getDeliveryNotesWithErrors(
      docEntry,
      cardCode,
    );
  }
}
