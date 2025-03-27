import { ApiProperty } from '@nestjs/swagger';

/**
 * Documentación del servicio de facturación SAP
 * Este servicio maneja la creación automática de facturas a partir de notas de entrega
 * según diferentes criterios y horarios establecidos.
 */

/**
 * @ApiProperty()
 * Clase que representa una línea de nota de entrega
 */
export class SapDeliveryNoteLineDto {
  @ApiProperty({ description: 'Código del artículo' })
  ItemCode: string;

  @ApiProperty({ description: 'Cantidad' })
  Quantity: number;

  @ApiProperty({ description: 'Precio' })
  Price: number;

  @ApiProperty({ description: 'Código del almacén', required: false })
  WarehouseCode?: string;

  @ApiProperty({ description: 'Número de línea' })
  LineNum: number;
}

/**
 * @ApiProperty()
 * Clase que representa una nota de entrega de SAP
 */
export class SapDeliveryNoteDto {
  @ApiProperty({ description: 'Código del cliente' })
  CardCode: string;

  @ApiProperty({ description: 'Fecha del documento', required: false })
  DocDate?: string;

  @ApiProperty({ description: 'Comentarios adicionales', required: false })
  Comments?: string;

  @ApiProperty({ description: 'Número de serie del documento' })
  Series: number;

  @ApiProperty({ description: 'Moneda del documento' })
  DocCurrency: string;

  @ApiProperty({ description: 'Número de entrada del documento' })
  DocEntry: number;

  @ApiProperty({ description: 'Total del documento', required: false })
  DocTotal?: number;

  @ApiProperty({
    description: 'Líneas del documento',
    type: [SapDeliveryNoteLineDto],
  })
  DocumentLines: SapDeliveryNoteLineDto[];
}

/**
 * @ApiProperty()
 * Clase que representa una respuesta de factura de SAP
 */
export class SapInvoiceResponseDto {
  @ApiProperty({ description: 'Número de entrada del documento' })
  DocEntry: number;
}

/**
 * @ApiProperty()
 * Clase que representa las estadísticas de facturación
 */
export class FacturaStatsDto {
  @ApiProperty({ description: 'Total de notas encontradas' })
  totalEncontradas: number;

  @ApiProperty({ description: 'Notas ya facturadas' })
  yaFacturadas: number;

  @ApiProperty({ description: 'Notas que no cumplen criterios' })
  noCumplenCriterios: number;

  @ApiProperty({ description: 'Total de errores' })
  errores: number;

  @ApiProperty({ description: 'Facturas exitosas' })
  exitosas: number;
}

/**
 * Documentación del servicio de facturación SAP
 *
 * Este servicio maneja la creación automática de facturas a partir de notas de entrega
 * según diferentes criterios y horarios establecidos:
 *
 * 1. Días hábiles (Lunes a Viernes):
 *    - Horario: 18:40 a 23:30
 *    - Frecuencia: Cada 10 minutos
 *
 * 2. Sábados:
 *    - Horario: 12:00 a 13:00
 *    - Frecuencia: Cada 10 minutos
 *
 * 3. Público general:
 *    - Frecuencia: Cada 72 horas
 *
 * 4. Fin de mes:
 *    - Días: 28-31 de cada mes
 *    - Horario: 18:40 a 23:30
 *    - Frecuencia: Cada 10 minutos
 *
 * El servicio realiza las siguientes funciones:
 * - Filtrado de notas según criterios específicos por empresa
 * - Verificación de notas ya facturadas
 * - Creación automática de facturas
 * - Manejo de errores y reportes
 * - Estadísticas de facturación por empresa
 *
 * @example
 * ```typescript
 * // Ejemplo de uso del servicio
 * const sapInvoiceService = new SapInvoiceService(
 *   httpService,
 *   configService,
 *   reportService
 * );
 *
 * // Iniciar el proceso de facturación
 * await sapInvoiceService.autoTransferInvoices();
 * ```
 */
