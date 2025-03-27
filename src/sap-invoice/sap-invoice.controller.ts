import { Controller, Post } from '@nestjs/common';
import { SapInvoiceService } from './sap-invoice.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('facturación')
@Controller('sap-invoices')
export class SapInvoiceController {
  constructor(private readonly sapInvoiceService: SapInvoiceService) {}

  @Post('auto-transfer')
  @ApiOperation({
    summary: 'Iniciar transferencia automática de notas a facturas',
    description:
      'Inicia el proceso de transferencia automática de notas de entrega a facturas en SAP. Este endpoint ejecuta el proceso completo de facturación que incluye:',
  })
  @ApiResponse({
    status: 200,
    description: 'Proceso de facturación iniciado correctamente',
    content: {
      'application/json': {
        example: {
          message: 'Proceso de facturación iniciado correctamente',
          timestamp: '2024-03-26T20:50:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
    content: {
      'application/json': {
        example: {
          statusCode: 500,
          message: 'Error interno del servidor',
          error: 'Internal Server Error',
        },
      },
    },
  })
  async autoTransferInvoices() {
    return this.sapInvoiceService.autoTransferInvoices();
  }
}
