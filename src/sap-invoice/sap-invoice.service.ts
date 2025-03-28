import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import { firstValueFrom } from 'rxjs';
import { getInvoiceSeries } from '../helpers/series-mapping';
import { CreateSapInvoiceDto } from './dto/create-sap-invoice.dto';
import { ReportService } from '../reports/report.service';

interface SapLoginResponse {
  SessionId: string;
}

interface SapErrorResponse {
  code?: number;
  message?: {
    lang?: string;
    value?: string;
  };
}

interface AxiosErrorResponse {
  response?: {
    status?: number;
    data?: SapErrorResponse;
  };
}

interface SapDeliveryNote {
  CardCode: string;
  DocDate?: string;
  Comments?: string;
  Series: number;
  DocCurrency: string;
  DocEntry: number;
  DocumentLines: SapDeliveryNoteLine[];
  DocumentStatus: string;
  U_Auto_Auditoria: string;
}

interface SapDeliveryNoteLine {
  ItemCode: string;
  Quantity: number;
  Price: number;
  WarehouseCode?: string;
  LineNum: number;
}

interface SapInvoiceResponse {
  DocEntry: number;
}

interface FacturaStats {
  totalEncontradas: number;
  yaFacturadas: number;
  noCumplenCriterios: number;
  errores: number;
  exitosas: number;
}

type PublicoGeneralCardCodes = {
  [key: string]: string[];
};

@Injectable()
export class SapInvoiceService {
  private readonly logger = new Logger(SapInvoiceService.name);
  private readonly sapHost: string;
  private readonly sapUser: string;
  private readonly sapPassword: string;
  private readonly httpsAgent = new https.Agent({ rejectUnauthorized: false });

  // Definición de CardCodes para público general con tipo específico
  private readonly publicoGeneralCardCodes: PublicoGeneralCardCodes = {
    SBO_Alianza: [
      '04166',
      '06379',
      '06456',
      '06519',
      '06520',
      '06521',
      '06522',
    ],
    SBO_FGE: ['MOSTR2'],
    SBO_MANUFACTURING: ['C-0182'],
  };

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly reportService: ReportService,
  ) {
    this.sapHost = this.configService.get<string>('SAP_SL_URL') ?? '';
    this.sapUser = this.configService.get<string>('SAP_USERNAME') ?? '';
    this.sapPassword = this.configService.get<string>('SAP_PASSWORD') ?? '';
  }

  async autoTransferInvoices(): Promise<void> {
    this.logger.log('Iniciando Facturación 24');
    this.reportService.startNewReport();

    const companies = this.getCompanies();
    const statsPorEmpresa: Record<string, FacturaStats> = {};

    for (const company of companies) {
      statsPorEmpresa[company] = {
        totalEncontradas: 0,
        yaFacturadas: 0,
        noCumplenCriterios: 0,
        errores: 0,
        exitosas: 0,
      };

      const sessionId = await this.loginToSap(company);
      if (!sessionId) {
        this.logger.error(`No se pudo iniciar sesión en SAP para ${company}`);
        continue;
      }

      try {
        const deliveryNotes = await this.fetchDeliveryNotes(sessionId, company);
        statsPorEmpresa[company].totalEncontradas = deliveryNotes.length;
        this.logger.log(
          `${company}: ${deliveryNotes.length} notas detectadas.`,
        );

        if (deliveryNotes.length === 0) continue;

        // Filtrar notas según el tipo de facturación
        const filteredNotes = this.filterDeliveryNotes(deliveryNotes, company);
        statsPorEmpresa[company].noCumplenCriterios =
          deliveryNotes.length - filteredNotes.length;
        this.logger.log(
          `${company}: ${filteredNotes.length} notas filtradas para facturación.`,
        );

        if (filteredNotes.length === 0) continue;

        this.logger.log(`Iniciando facturación en ${company}.`);

        for (const deliveryNote of filteredNotes.slice(0, 10)) {
          this.reportService.incrementProcessed(company);

          // Verificar si la nota ya fue facturada
          const isAlreadyInvoiced = await this.checkIfAlreadyInvoiced(
            sessionId,
            deliveryNote.DocEntry,
          );
          if (isAlreadyInvoiced) {
            this.logger.log(
              `Nota ${deliveryNote.DocEntry} ya fue facturada anteriormente en ${company}`,
            );
            statsPorEmpresa[company].yaFacturadas++;
            this.reportService.addError({
              timestamp: new Date(),
              company,
              docEntry: deliveryNote.DocEntry,
              errorCode: -5002,
              errorMessage: 'La nota ya fue facturada anteriormente',
              details: `DocEntry: ${deliveryNote.DocEntry}, Fecha: ${deliveryNote.DocDate}`,
            });
            continue;
          }

          const invoiceData = this.buildInvoiceData(company, deliveryNote);
          const response = await this.createInvoice(
            sessionId,
            invoiceData,
            company,
            deliveryNote.DocEntry,
          );

          if (response) {
            this.logger.log(
              `Factura creada en ${company} - DocEntry: ${response.DocEntry}, Fecha: ${deliveryNote.DocDate}`,
            );
            statsPorEmpresa[company].exitosas++;

            // Registrar la factura exitosa
            this.reportService.addSuccess({
              timestamp: new Date(),
              company,
              docEntry: response.DocEntry,
              docDate:
                deliveryNote.DocDate ?? new Date().toISOString().split('T')[0],
              cardCode: deliveryNote.CardCode,
              totalLines: deliveryNote.DocumentLines.length,
            });
          } else {
            this.logger.error(
              `Error al facturar DocEntry ${deliveryNote.DocEntry} en ${company}`,
            );
            statsPorEmpresa[company].errores++;
          }
        }
      } catch (error) {
        const errorMessage = this.getErrorMessage(error);
        this.logger.error(`Error en ${company}: ${errorMessage}`);
        statsPorEmpresa[company].errores++;

        // Registrar el error en el reporte
        const axiosError = error as AxiosErrorResponse;
        this.reportService.addError({
          timestamp: new Date(),
          company,
          errorCode: axiosError.response?.data?.code ?? -1,
          errorMessage,
          details: JSON.stringify(error),
        });
      } finally {
        await this.logoutFromSap(sessionId);
      }
    }

    // Mostrar resumen detallado
    this.logger.log('\nResumen detallado de facturación:');
    this.logger.log('--------------------------------');

    let totalExitosas = 0;
    for (const company of companies) {
      const stats = statsPorEmpresa[company];
      totalExitosas += stats.exitosas;

      this.logger.log(`\n${company}:`);
      this.logger.log(`  - Total notas encontradas: ${stats.totalEncontradas}`);
      this.logger.log(`  - Ya facturadas: ${stats.yaFacturadas}`);
      this.logger.log(`  - No cumplen criterios: ${stats.noCumplenCriterios}`);
      this.logger.log(`  - Errores: ${stats.errores}`);
      this.logger.log(`  - Facturas creadas exitosamente: ${stats.exitosas}`);
    }

    this.logger.log('\n--------------------------------');
    this.logger.log(`Total de facturas creadas exitosamente: ${totalExitosas}`);

    // Generar reporte al finalizar
    try {
      const reportPath = await this.reportService.generateReport();
      this.logger.log(`Reporte de errores generado en: ${reportPath}`);
    } catch (error) {
      this.logger.error(`Error al generar el reporte: ${error}`);
    }
  }

  private filterDeliveryNotes(
    deliveryNotes: SapDeliveryNote[],
    company: string,
  ): SapDeliveryNote[] {
    // Asegurarnos de que company existe en publicoGeneralCardCodes
    const publicoGeneralCodes = this.publicoGeneralCardCodes[company] ?? [];

    return deliveryNotes.filter((note) => {
      // Verificar si el CardCode está en la lista de público general
      const isPublicoGeneral = publicoGeneralCodes.includes(note.CardCode);

      if (isPublicoGeneral) {
        // Para público general, verificar que hayan pasado 72 horas
        const noteDate = new Date(note.DocDate || '');
        const today = new Date();
        const hoursDiff =
          (today.getTime() - noteDate.getTime()) / (1000 * 60 * 60);

        if (hoursDiff < 72) {
          // Registrar en el reporte que la nota no se facturó por no cumplir las 72 horas
          this.reportService.addError({
            timestamp: new Date(),
            company,
            docEntry: note.DocEntry,
            errorCode: -5001,
            errorMessage: 'Nota de público general pendiente de 72 horas',
            details: `DocEntry: ${note.DocEntry}, Fecha: ${note.DocDate}, Horas transcurridas: ${Math.round(hoursDiff)}, Horas restantes: ${Math.round(72 - hoursDiff)}`,
          });
        }

        return hoursDiff >= 72;
      }

      // Verificar si la nota tiene fecha válida
      if (!note.DocDate) {
        this.reportService.addError({
          timestamp: new Date(),
          company,
          docEntry: note.DocEntry,
          errorCode: -5002,
          errorMessage: 'Nota sin fecha de documento',
          details: `DocEntry: ${note.DocEntry}, CardCode: ${note.CardCode}`,
        });
        return false;
      }

      // Verificar si la nota tiene líneas
      if (!note.DocumentLines || note.DocumentLines.length === 0) {
        this.reportService.addError({
          timestamp: new Date(),
          company,
          docEntry: note.DocEntry,
          errorCode: -5003,
          errorMessage: 'Nota sin líneas de documento',
          details: `DocEntry: ${note.DocEntry}, CardCode: ${note.CardCode}`,
        });
        return false;
      }

      // Verificar si la nota tiene moneda válida
      if (!note.DocCurrency) {
        this.reportService.addError({
          timestamp: new Date(),
          company,
          docEntry: note.DocEntry,
          errorCode: -5004,
          errorMessage: 'Nota sin moneda definida',
          details: `DocEntry: ${note.DocEntry}, CardCode: ${note.CardCode}`,
        });
        return false;
      }

      return true; // Si no es público general y cumple todas las validaciones, incluir la nota
    });
  }

  private async fetchDeliveryNotes(
    sessionId: string,
    company: string,
  ): Promise<SapDeliveryNote[]> {
    const todayStr = new Date().toISOString().split('T')[0];
    const filter = `DocumentStatus eq 'bost_Open' and U_Auto_Auditoria eq 'N' and DocDate lt '${todayStr}'`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<{ value: SapDeliveryNote[] }>(
          `${this.sapHost}/DeliveryNotes?$filter=${filter}&$top=10`,
          {
            headers: { Cookie: `B1SESSION=${sessionId}` },
            httpsAgent: this.httpsAgent,
          },
        ),
      );

      const notes = response.data?.value || [];

      // Registrar notas que no cumplen con los criterios
      notes.forEach((note) => {
        if (note.DocumentStatus !== 'bost_Open') {
          this.reportService.addError({
            timestamp: new Date(),
            company,
            docEntry: note.DocEntry,
            errorCode: -5005,
            errorMessage: 'Nota no está en estado abierto',
            details: `DocEntry: ${note.DocEntry}, Estado: ${note.DocumentStatus}, Fecha: ${note.DocDate}`,
          });
        }

        if (note.U_Auto_Auditoria === 'Y') {
          this.reportService.addError({
            timestamp: new Date(),
            company,
            docEntry: note.DocEntry,
            errorCode: -5006,
            errorMessage: 'Nota ya ha sido auditada',
            details: `DocEntry: ${note.DocEntry}, Fecha: ${note.DocDate}`,
          });
        }

        const noteDate = new Date(note.DocDate || '');
        const today = new Date();
        if (noteDate >= today) {
          this.reportService.addError({
            timestamp: new Date(),
            company,
            docEntry: note.DocEntry,
            errorCode: -5007,
            errorMessage: 'Nota con fecha futura o actual',
            details: `DocEntry: ${note.DocEntry}, Fecha: ${note.DocDate}`,
          });
        }
      });

      return notes;
    } catch (error) {
      this.logger.error(
        `Error obteniendo notas de entrega en ${company}: ${this.getErrorMessage(error)}`,
      );
      // Registrar error de conexión
      this.reportService.addError({
        timestamp: new Date(),
        company,
        errorCode: -5008,
        errorMessage: 'Error al obtener notas de entrega',
        details: this.getErrorMessage(error),
      });
      return [];
    }
  }

  private async createInvoice(
    sessionId: string,
    invoiceData: CreateSapInvoiceDto,
    company: string,
    docEntry: number,
  ): Promise<SapInvoiceResponse | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<SapInvoiceResponse>(
          `${this.sapHost}/Invoices`,
          invoiceData,
          {
            headers: { Cookie: `B1SESSION=${sessionId}` },
            httpsAgent: this.httpsAgent,
          },
        ),
      );
      return response.data;
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`Error al crear factura: ${errorMessage}`);

      // Registrar el error en el reporte
      this.reportService.addError({
        timestamp: new Date(),
        company,
        docEntry,
        errorCode: -5009,
        errorMessage: 'Error al crear factura en SAP',
        details: `DocEntry: ${docEntry}, Error: ${errorMessage}`,
      });

      return null;
    }
  }

  private getCompanies(): string[] {
    return [
      this.configService.get<string>('SAP_DB_AE'),
      this.configService.get<string>('SAP_DB_FG'),
      this.configService.get<string>('SAP_DB_FGM'),
    ].filter((company): company is string => !!company);
  }

  private buildInvoiceData(
    company: string,
    deliveryNote: SapDeliveryNote,
  ): CreateSapInvoiceDto {
    return {
      CardCode: deliveryNote.CardCode,
      DocDate: deliveryNote.DocDate ?? new Date().toISOString().split('T')[0],
      Comments: deliveryNote.Comments ?? '',
      Series:
        getInvoiceSeries(company, deliveryNote.Series) || deliveryNote.Series,
      DocCurrency: deliveryNote.DocCurrency,
      DocumentLines: deliveryNote.DocumentLines.map((line) => ({
        ItemCode: line.ItemCode,
        Quantity: line.Quantity,
        Price: line.Price,
        WarehouseCode: line.WarehouseCode ?? '01',
        BaseEntry: deliveryNote.DocEntry,
        BaseType: 15,
        BaseLine: line.LineNum,
      })),
    };
  }

  private async loginToSap(company: string): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<SapLoginResponse>(
          `${this.sapHost}/Login`,
          {
            CompanyDB: company,
            UserName: this.sapUser,
            Password: this.sapPassword,
          },
          { httpsAgent: this.httpsAgent },
        ),
      );
      return response.data.SessionId ?? null;
    } catch {
      return null;
    }
  }

  private async logoutFromSap(sessionId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.sapHost}/Logout`,
          {},
          {
            headers: { Cookie: `B1SESSION=${sessionId}` },
            httpsAgent: this.httpsAgent,
          },
        ),
      );
    } catch (error) {
      this.logger.error('Error en logoutFromSap:', error);
    }
  }

  private async checkIfAlreadyInvoiced(
    sessionId: string,
    docEntry: number,
  ): Promise<boolean> {
    try {
      const filter = `BaseEntry eq ${docEntry} and BaseType eq 15`;
      const response = await firstValueFrom(
        this.httpService.get<{ value: SapInvoiceResponse[] }>(
          `${this.sapHost}/Invoices?$filter=${filter}&$top=1`,
          {
            headers: { Cookie: `B1SESSION=${sessionId}` },
            httpsAgent: this.httpsAgent,
          },
        ),
      );
      return response.data?.value?.length > 0;
    } catch (error) {
      this.logger.error(
        `Error verificando si la nota ${docEntry} ya fue facturada: ${this.getErrorMessage(error)}`,
      );
      return false;
    }
  }

  private getErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null) {
      const axiosError = error as AxiosErrorResponse;

      if (axiosError.response?.data) {
        const { code, message } = axiosError.response.data;

        // Mapeo de códigos de error específicos de SAP
        switch (code) {
          case -5002:
            if (message?.value?.includes('already been closed')) {
              return 'La nota ya fue facturada anteriormente';
            }
            if (message?.value?.includes('exceeds the quantity')) {
              return 'La cantidad de la factura excede la cantidad disponible en la nota de entrega';
            }
            break;
          case -5003:
            return 'Error de validación en los datos de la factura';
          case -5004:
            return 'Error en el formato de los datos enviados';
          case -5005:
            return 'Error de permisos o autorización en SAP';
          case -5006:
            return 'Error de conexión con la base de datos de SAP';
          case -5007:
            return 'Error en la validación de la serie de facturación';
          case -5008:
            return 'Error en la validación del cliente (CardCode)';
          case -5009:
            return 'Error en la validación de los artículos';
          case -5010:
            return 'Error en la validación de cantidades o precios';
          default:
            if (message?.value) {
              return `Error ${code}: ${message.value}`;
            }
        }

        return `Error ${code}: ${message?.value || 'No hay mensaje de error específico'}`;
      }

      return `HTTP ${axiosError.response?.status ?? 'unknown'}: ${JSON.stringify(axiosError.response?.data ?? 'No data')}`;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Error desconocido';
  }
}
