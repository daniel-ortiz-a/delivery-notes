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
  DocTotal?: number;
  DocumentLines: SapDeliveryNoteLine[];
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
        let page = 1;
        let deliveryNotes: SapDeliveryNote[] = [];
        let totalNotes = 0;

        do {
          this.logger.log(
            `Procesando lote ${page} de 10 en la empresa: ${company}`,
          );
          deliveryNotes = await this.fetchDeliveryNotes(sessionId, company);
          totalNotes += deliveryNotes.length;

          if (deliveryNotes.length === 0) {
            this.logger.log(
              `No hay más notas de entrega abiertas en ${company} con U_Auto_Auditoria = 'N'.`,
            );
            break;
          }

          statsPorEmpresa[company].totalEncontradas = totalNotes;

          // Filtrar notas según el tipo de facturación
          const filteredNotes = this.filterDeliveryNotes(
            deliveryNotes,
            company,
          );
          statsPorEmpresa[company].noCumplenCriterios +=
            deliveryNotes.length - filteredNotes.length;

          if (filteredNotes.length === 0) {
            page++;
            continue;
          }

          this.logger.log(
            `${company}: ${filteredNotes.length} notas filtradas para facturación en el lote ${page}.`,
          );

          for (const deliveryNote of filteredNotes) {
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
                sapErrorMessage: 'Document has already been closed',
                details: `DocEntry: ${deliveryNote.DocEntry}, CardCode: ${deliveryNote.CardCode}, Fecha: ${deliveryNote.DocDate}`,
              });
              continue;
            }

            const invoiceData = this.buildInvoiceData(company, deliveryNote);
            const result = await this.createInvoice(sessionId, invoiceData);

            if (result.success) {
              this.logger.log(
                `Factura creada en ${company} - DocEntry: ${result.success.DocEntry}, Fecha: ${deliveryNote.DocDate}`,
              );
              statsPorEmpresa[company].exitosas++;

              // Registrar la factura exitosa
              this.reportService.addSuccess({
                timestamp: new Date(),
                company,
                docEntry: result.success.DocEntry,
                docDate:
                  deliveryNote.DocDate ??
                  new Date().toISOString().split('T')[0],
                cardCode: deliveryNote.CardCode,
                totalLines: deliveryNote.DocumentLines.length,
              });
            } else {
              this.logger.error(
                `Error al facturar DocEntry ${deliveryNote.DocEntry} en ${company}`,
              );
              statsPorEmpresa[company].errores++;
              const errorInfo = this.getErrorMessage(result.error);
              this.reportService.addError({
                timestamp: new Date(),
                company,
                docEntry: deliveryNote.DocEntry,
                errorCode: -5000,
                errorMessage: errorInfo.message,
                sapErrorMessage: errorInfo.sapMessage,
                details: `DocEntry: ${deliveryNote.DocEntry}, CardCode: ${deliveryNote.CardCode}, Fecha: ${deliveryNote.DocDate}`,
              });
            }
          }

          page++;
        } while (deliveryNotes.length === 10);
      } catch (error: unknown) {
        const errorInfo = this.getErrorMessage(error);
        this.logger.error(`Error en ${company}: ${errorInfo.message}`);
        statsPorEmpresa[company].errores++;

        // Registrar el error en el reporte
        const axiosError = error as AxiosErrorResponse;
        this.reportService.addError({
          timestamp: new Date(),
          company,
          errorCode: axiosError.response?.data?.code ?? -1,
          errorMessage: errorInfo.message,
          sapErrorMessage: errorInfo.sapMessage,
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
          // Registrar la nota que no cumple con el criterio de 72 horas
          this.reportService.addError({
            timestamp: new Date(),
            company,
            docEntry: note.DocEntry,
            errorCode: -5001,
            errorMessage: 'Nota no cumple con el criterio de 72 horas',
            details: `DocEntry: ${note.DocEntry}, CardCode: ${note.CardCode}, Fecha Nota: ${note.DocDate}, Horas transcurridas: ${Math.round(hoursDiff)}`,
          });
          return false;
        }
      }

      return true; // Si no es público general, incluir la nota
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
      return response.data?.value || [];
    } catch (error) {
      this.logger.error(
        `Error obteniendo notas de entrega en ${company}: ${this.getErrorMessage(error).message}`,
      );
      return [];
    }
  }

  private async createInvoice(
    sessionId: string,
    invoiceData: CreateSapInvoiceDto,
  ): Promise<{ success: SapInvoiceResponse | null; error?: unknown }> {
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
      return { success: response.data };
    } catch (error) {
      this.logger.error(
        `Error al crear factura: ${this.getErrorMessage(error).message}`,
      );
      return { success: null, error };
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
      DocDate: new Date().toISOString().split('T')[0],
      Comments: deliveryNote.Comments ?? '',
      DocTotal: deliveryNote.DocTotal ?? 0,
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
        `Error verificando si la nota ${docEntry} ya fue facturada: ${this.getErrorMessage(error).message}`,
      );
      return false;
    }
  }

  private getErrorMessage(error: unknown): {
    message: string;
    sapMessage?: string;
  } {
    if (typeof error === 'object' && error !== null) {
      const axiosError = error as AxiosErrorResponse;

      if (axiosError.response?.data) {
        const { code, message } = axiosError.response.data;
        const sapMessage = message?.value;

        // Mapeo de códigos de error específicos de SAP
        switch (code) {
          case -5002:
            if (sapMessage?.includes('already been closed')) {
              return {
                message: 'La nota ya fue facturada anteriormente',
                sapMessage,
              };
            }
            if (sapMessage?.includes('exceeds the quantity')) {
              return {
                message:
                  'La cantidad de la factura excede la cantidad disponible en la nota de entrega',
                sapMessage,
              };
            }
            break;
          case -5003:
            return {
              message: 'Error de validación en los datos de la factura',
              sapMessage,
            };
          case -5004:
            return {
              message: 'Error en el formato de los datos enviados',
              sapMessage,
            };
          case -5005:
            return {
              message: 'Error de permisos o autorización en SAP',
              sapMessage,
            };
          case -5006:
            return {
              message: 'Error de conexión con la base de datos de SAP',
              sapMessage,
            };
          case -5007:
            return {
              message: 'Error en la validación de la serie de facturación',
              sapMessage,
            };
          case -5008:
            return {
              message: 'Error en la validación del cliente (CardCode)',
              sapMessage,
            };
          case -5009:
            return {
              message: 'Error en la validación de los artículos',
              sapMessage,
            };
          case -5010:
            return {
              message: 'Error en la validación de cantidades o precios',
              sapMessage,
            };
          default:
            if (sapMessage) {
              return { message: `Error ${code}: ${sapMessage}`, sapMessage };
            }
        }

        return {
          message: `Error ${code}: ${sapMessage || 'No hay mensaje de error específico'}`,
          sapMessage,
        };
      }

      return {
        message: `HTTP ${axiosError.response?.status ?? 'unknown'}: ${JSON.stringify(axiosError.response?.data ?? 'No data')}`,
      };
    }

    if (error instanceof Error) {
      return { message: error.message };
    }

    return { message: 'Error desconocido' };
  }
}
