import { ApiProperty } from '@nestjs/swagger';

export class SapError {
  @ApiProperty({
    description: 'Fecha y hora del error',
    example: '2024-03-26T20:50:00.000Z',
  })
  timestamp: Date;

  @ApiProperty({
    description: 'Nombre de la empresa donde ocurrió el error',
    example: 'SBO_Alianza',
  })
  company: string;

  @ApiProperty({
    description: 'Número de entrada del documento en SAP',
    example: 12345,
    required: false,
  })
  docEntry?: number;

  @ApiProperty({
    description: 'Código de error de SAP',
    example: -5002,
  })
  errorCode: number;

  @ApiProperty({
    description: 'Mensaje de error traducido',
    example: 'La nota ya fue facturada anteriormente',
  })
  errorMessage: string;

  @ApiProperty({
    description: 'Mensaje de error original de SAP',
    example: 'Document has already been closed',
    required: false,
  })
  sapErrorMessage?: string;

  @ApiProperty({
    description: 'Detalles adicionales del error',
    example: 'DocEntry: 12345, CardCode: 04166, Fecha: 2024-03-26',
    required: false,
  })
  details?: string;
}

export class CompanyStats {
  @ApiProperty({
    description: 'Total de documentos procesados',
    example: 5,
  })
  totalProcessed: number;

  @ApiProperty({
    description: 'Total de errores encontrados',
    example: 1,
  })
  totalErrors: number;

  @ApiProperty({
    description: 'Lista de errores encontrados',
    type: [SapError],
  })
  errors: SapError[];
}

export class ReportData {
  @ApiProperty({
    description: 'Fecha y hora de inicio del reporte',
    example: '2024-03-26T20:50:00.000Z',
  })
  startTime: Date;

  @ApiProperty({
    description: 'Fecha y hora de fin del reporte',
    example: '2024-03-26T20:50:03.000Z',
  })
  endTime: Date;

  @ApiProperty({
    description: 'Total de documentos procesados',
    example: 10,
  })
  totalProcessed: number;

  @ApiProperty({
    description: 'Total de errores encontrados',
    example: 2,
  })
  totalErrors: number;

  @ApiProperty({
    description: 'Lista de errores encontrados',
    type: [SapError],
  })
  errors: SapError[];

  @ApiProperty({
    description: 'Estadísticas por empresa',
    example: {
      SBO_Alianza: {
        totalProcessed: 5,
        totalErrors: 1,
        errors: [
          {
            timestamp: '2024-03-26T20:50:00.000Z',
            company: 'SBO_Alianza',
            docEntry: 12345,
            errorCode: -5002,
            errorMessage: 'La nota ya fue facturada anteriormente',
            sapErrorMessage: 'Document has already been closed',
            details: 'DocEntry: 12345, CardCode: 04166, Fecha: 2024-03-26',
          },
        ],
      },
    },
  })
  companyStats: {
    [key: string]: CompanyStats;
  };
}
