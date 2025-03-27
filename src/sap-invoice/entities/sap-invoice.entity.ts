import { ApiProperty } from '@nestjs/swagger';

class DocumentLine {
  @ApiProperty({
    description: 'Código del artículo en SAP',
    example: 'ART001',
  })
  ItemCode: string;

  @ApiProperty({
    description: 'Cantidad del artículo',
    example: 2,
  })
  Quantity: number;

  @ApiProperty({
    description: 'Precio unitario del artículo',
    example: 500.0,
  })
  Price: number;

  @ApiProperty({
    description: 'Código del almacén',
    example: '01',
  })
  WarehouseCode: string;

  @ApiProperty({
    description: 'Número de entrada base (DocEntry de la nota de entrega)',
    example: 12345,
  })
  BaseEntry: number;

  @ApiProperty({
    description: 'Tipo de documento base (15 para notas de entrega)',
    example: 15,
  })
  BaseType: number;

  @ApiProperty({
    description: 'Número de línea base',
    example: 0,
  })
  BaseLine: number;
}

export class SapInvoice {
  @ApiProperty({
    description: 'Identificador único de la factura',
    example: 12345,
  })
  id: number;

  @ApiProperty({
    description: 'Código del cliente en SAP',
    example: '04166',
  })
  CardCode: string;

  @ApiProperty({
    description: 'Fecha del documento en formato YYYY-MM-DD',
    example: '2024-03-26',
  })
  DocDate: string;

  @ApiProperty({
    description: 'Comentarios opcionales del documento',
    example: 'Factura generada automáticamente',
    required: false,
  })
  Comments?: string;

  @ApiProperty({
    description: 'Serie del documento en SAP',
    example: 1,
  })
  Series: number;

  @ApiProperty({
    description: 'Moneda del documento',
    example: 'USD',
  })
  DocCurrency: string;

  @ApiProperty({
    description: 'Líneas del documento',
    type: [DocumentLine],
  })
  DocumentLines: DocumentLine[];
}
