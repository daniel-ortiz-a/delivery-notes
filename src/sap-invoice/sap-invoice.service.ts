import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import { firstValueFrom } from 'rxjs';
import { getInvoiceSeries } from '../helpers/series-mapping';
import { CreateSapInvoiceDto } from './dto/create-sap-invoice.dto';
import { DeliveryNoteErrorDto } from './dto/delivery-note-error.dto';

interface SapLoginResponse {
  SessionId: string;
}

interface SapErrorResponse {
  code?: number;
  message?: {
    value: string;
  };
  details?: any;
  error?: any;
}

interface AxiosErrorResponse {
  response?: {
    status?: number;
    data?: SapErrorResponse;
  };
  code?: string;
  message?: string;
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
  Rate?: number;
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
  ) {
    this.sapHost = this.configService.get<string>('SAP_SL_URL') ?? '';
    this.sapUser = this.configService.get<string>('SAP_USERNAME') ?? '';
    this.sapPassword = this.configService.get<string>('SAP_PASSWORD') ?? '';
  }

  async autoTransferInvoices(): Promise<void> {
    this.logger.log('Iniciando Facturación 24');

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
          this.logger.error(
            `❌ Nota ${note.DocEntry} de público general pendiente de 72 horas - Horas transcurridas: ${Math.round(hoursDiff)}, Horas restantes: ${Math.round(72 - hoursDiff)}`,
          );
        }

        return hoursDiff >= 72;
      }

      // Verificar si la nota tiene fecha válida
      if (!note.DocDate) {
        this.logger.error(
          `❌ Nota ${note.DocEntry} sin fecha de documento - CardCode: ${note.CardCode}`,
        );
        return false;
      }

      // Verificar si la nota tiene líneas
      if (!note.DocumentLines || note.DocumentLines.length === 0) {
        this.logger.error(
          `❌ Nota ${note.DocEntry} sin líneas de documento - CardCode: ${note.CardCode}`,
        );
        return false;
      }

      // Verificar si la nota tiene moneda válida
      if (!note.DocCurrency) {
        this.logger.error(
          `❌ Nota ${note.DocEntry} sin moneda definida - CardCode: ${note.CardCode}`,
        );
        return false;
      }

      // Verificar tipos de cambio solo para Alianza y Manufacturing
      if (company === 'SBO_Alianza' || company === 'SBO_MANUFACTURING') {
        const tiposDeCambio = new Set(
          note.DocumentLines.map((line) => line.Rate),
        );
        if (tiposDeCambio.size > 1) {
          this.logger.error(
            `❌ Nota ${note.DocEntry} con múltiples tipos de cambio - CardCode: ${note.CardCode}, Tipos de cambio encontrados: ${Array.from(tiposDeCambio).join(', ')}`,
          );
          return false;
        }
      }

      return true; // Si no es público general y cumple todas las validaciones, incluir la nota
    });
  }

  private async fetchDeliveryNotes(
    sessionId: string,
    company: string,
  ): Promise<SapDeliveryNote[]> {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const startOfYear = new Date(today.getFullYear(), 0, 1)
      .toISOString()
      .split('T')[0];
    const filter = `DocumentStatus eq 'bost_Open' and U_Auto_Auditoria eq 'N' and DocDate lt '${todayStr}' and DocDate ge '${startOfYear}'`;

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
          this.logger.error(
            `❌ Nota ${note.DocEntry} no está en estado abierto - Estado: ${note.DocumentStatus}, Fecha: ${note.DocDate}`,
          );
        }

        if (note.U_Auto_Auditoria === 'Y') {
          this.logger.error(
            `❌ Nota ${note.DocEntry} ya ha sido auditada - Fecha: ${note.DocDate}`,
          );
        }

        const noteDate = new Date(note.DocDate || '');
        if (noteDate >= today) {
          this.logger.error(
            `❌ Nota ${note.DocEntry} con fecha futura o actual - Fecha: ${note.DocDate}`,
          );
        }
      });

      return notes;
    } catch (error) {
      this.logger.error(
        `❌ Error obteniendo notas de entrega en ${company}: ${this.getErrorMessage(error)}`,
      );
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
      this.logger.error(
        `❌ Error al crear factura para DocEntry ${docEntry} en ${company}: ${errorMessage}`,
      );
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
              return '❌ La nota ya fue facturada anteriormente';
            }
            if (message?.value?.includes('exceeds the quantity')) {
              return '❌ La cantidad de la factura excede la cantidad disponible en la nota de entrega';
            }
            break;
          case -5003:
            return '❌ Error de validación en los datos de la factura';
          case -5004:
            return '❌ Error en el formato de los datos enviados';
          case -5005:
            return '❌ Error de permisos o autorización en SAP';
          case -5006:
            return '❌ Error de conexión con la base de datos de SAP';
          case -5007:
            return '❌ Error en la validación de la serie de facturación';
          case -5008:
            return '❌ Error en la validación del cliente (CardCode)';
          case -5009:
            return '❌ Error en la validación de los artículos';
          case -5010:
            return '❌ Error en la validación de cantidades o precios';
          default:
            if (message?.value) {
              return `❌ Error SAP ${code}: ${message.value}`;
            }
        }

        // Si hay un mensaje de error de SAP, mostrarlo
        if (message?.value) {
          return `❌ Error SAP ${code}: ${message.value}`;
        }

        // Si hay un error en la respuesta de SAP, mostrarlo
        if (axiosError.response?.data?.error) {
          return `❌ Error SAP: ${JSON.stringify(axiosError.response.data.error)}`;
        }

        return `❌ Error ${code}: ${message?.value || 'No hay mensaje de error específico'}`;
      }

      // Si hay un error HTTP, mostrarlo
      if (axiosError.response?.status) {
        return `❌ Error HTTP ${axiosError.response.status}: ${JSON.stringify(axiosError.response.data || 'No data')}`;
      }

      // Si hay un error de red
      if (axiosError.code === 'ECONNREFUSED') {
        return '❌ Error de conexión: No se pudo conectar con SAP';
      }

      return `❌ Error desconocido: ${JSON.stringify(axiosError)}`;
    }

    if (error instanceof Error) {
      return `❌ ${error.message}`;
    }

    return '❌ Error desconocido';
  }

  async getDeliveryNotesWithErrors(
    docEntry?: string,
    cardCode?: string,
  ): Promise<DeliveryNoteErrorDto[]> {
    const companies = this.getCompanies();
    const errors: DeliveryNoteErrorDto[] = [];

    // Si se proporciona docEntry o cardCode, solo buscamos en las empresas hasta encontrar la nota
    if (docEntry || cardCode) {
      for (const company of companies) {
        const sessionId = await this.loginToSap(company);
        if (!sessionId) {
          this.logger.error(`No se pudo iniciar sesión en SAP para ${company}`);
          continue;
        }

        try {
          const deliveryNotes = await this.fetchDeliveryNotes(
            sessionId,
            company,
          );

          // Filtrar notas según los parámetros de búsqueda
          const filteredNotes = deliveryNotes.filter((note) => {
            if (docEntry && note.DocEntry.toString() !== docEntry) {
              return false;
            }
            if (cardCode && note.CardCode !== cardCode) {
              return false;
            }
            return true;
          });

          if (filteredNotes.length > 0) {
            for (const note of filteredNotes) {
              // Verificar si la nota ya fue facturada
              const isAlreadyInvoiced = await this.checkIfAlreadyInvoiced(
                sessionId,
                note.DocEntry,
              );
              if (isAlreadyInvoiced) {
                errors.push({
                  docEntry: note.DocEntry,
                  cardCode: note.CardCode,
                  docDate: note.DocDate || '',
                  error: 'La nota ya fue facturada anteriormente',
                  company,
                  sePuedeFacturar: false,
                });
                continue;
              }

              // Verificar si es público general y no han pasado 72 horas
              const publicoGeneralCodes =
                this.publicoGeneralCardCodes[company] ?? [];
              const isPublicoGeneral = publicoGeneralCodes.includes(
                note.CardCode,
              );

              if (isPublicoGeneral) {
                const noteDate = new Date(note.DocDate || '');
                const today = new Date();
                const hoursDiff =
                  (today.getTime() - noteDate.getTime()) / (1000 * 60 * 60);

                if (hoursDiff < 72) {
                  errors.push({
                    docEntry: note.DocEntry,
                    cardCode: note.CardCode,
                    docDate: note.DocDate || '',
                    error: `Pendiente de 72 horas - Horas transcurridas: ${Math.round(hoursDiff)}, Horas restantes: ${Math.round(72 - hoursDiff)}`,
                    company,
                    sePuedeFacturar: false,
                  });
                  continue;
                }
              }

              // Verificar otros criterios
              if (!note.DocDate) {
                errors.push({
                  docEntry: note.DocEntry,
                  cardCode: note.CardCode,
                  docDate: '',
                  error: 'Sin fecha de documento',
                  company,
                  sePuedeFacturar: false,
                });
                continue;
              }

              if (!note.DocumentLines || note.DocumentLines.length === 0) {
                errors.push({
                  docEntry: note.DocEntry,
                  cardCode: note.CardCode,
                  docDate: note.DocDate || '',
                  error: 'Sin líneas de documento',
                  company,
                  sePuedeFacturar: false,
                });
                continue;
              }

              if (!note.DocCurrency) {
                errors.push({
                  docEntry: note.DocEntry,
                  cardCode: note.CardCode,
                  docDate: note.DocDate || '',
                  error: 'Sin moneda definida',
                  company,
                  sePuedeFacturar: false,
                });
                continue;
              }

              // Verificar tipos de cambio solo para Alianza y Manufacturing
              if (
                company === 'SBO_Alianza' ||
                company === 'SBO_MANUFACTURING'
              ) {
                const tiposDeCambio = new Set(
                  note.DocumentLines.map((line) => line.Rate),
                );
                if (tiposDeCambio.size > 1) {
                  errors.push({
                    docEntry: note.DocEntry,
                    cardCode: note.CardCode,
                    docDate: note.DocDate || '',
                    error: `Múltiples tipos de cambio encontrados: ${Array.from(tiposDeCambio).join(', ')}`,
                    company,
                    sePuedeFacturar: false,
                  });
                  continue;
                }
              }

              // Si llegamos aquí, la nota se puede facturar
              errors.push({
                docEntry: note.DocEntry,
                cardCode: note.CardCode,
                docDate: note.DocDate || '',
                error:
                  'La nota cumple con todos los criterios para ser facturada',
                company,
                sePuedeFacturar: true,
              });
            }
            // Si encontramos la nota, no necesitamos seguir buscando en otras empresas
            break;
          }
        } catch (error) {
          this.logger.error(
            `Error obteniendo notas con errores en ${company}: ${this.getErrorMessage(error)}`,
          );
        } finally {
          await this.logoutFromSap(sessionId);
        }
      }

      // Si no encontramos la nota en ninguna empresa
      if (errors.length === 0) {
        const mensaje = docEntry
          ? `No se encontró la nota con DocEntry ${docEntry}`
          : `No se encontraron notas para el cliente con CardCode ${cardCode}`;

        errors.push({
          docEntry: docEntry ? parseInt(docEntry) : 0,
          cardCode: cardCode || '',
          docDate: '',
          error: mensaje,
          company: '',
          sePuedeFacturar: false,
        });
      }

      return errors;
    }

    // Si no se proporciona docEntry ni cardCode, buscamos todas las notas con errores
    for (const company of companies) {
      const sessionId = await this.loginToSap(company);
      if (!sessionId) {
        this.logger.error(`No se pudo iniciar sesión en SAP para ${company}`);
        continue;
      }

      try {
        const deliveryNotes = await this.fetchDeliveryNotes(sessionId, company);

        for (const note of deliveryNotes) {
          // Verificar si la nota ya fue facturada
          const isAlreadyInvoiced = await this.checkIfAlreadyInvoiced(
            sessionId,
            note.DocEntry,
          );
          if (isAlreadyInvoiced) {
            errors.push({
              docEntry: note.DocEntry,
              cardCode: note.CardCode,
              docDate: note.DocDate || '',
              error: 'La nota ya fue facturada anteriormente',
              company,
              sePuedeFacturar: false,
            });
            continue;
          }

          // Verificar si es público general y no han pasado 72 horas
          const publicoGeneralCodes =
            this.publicoGeneralCardCodes[company] ?? [];
          const isPublicoGeneral = publicoGeneralCodes.includes(note.CardCode);

          if (isPublicoGeneral) {
            const noteDate = new Date(note.DocDate || '');
            const today = new Date();
            const hoursDiff =
              (today.getTime() - noteDate.getTime()) / (1000 * 60 * 60);

            if (hoursDiff < 72) {
              errors.push({
                docEntry: note.DocEntry,
                cardCode: note.CardCode,
                docDate: note.DocDate || '',
                error: `Pendiente de 72 horas - Horas transcurridas: ${Math.round(hoursDiff)}, Horas restantes: ${Math.round(72 - hoursDiff)}`,
                company,
                sePuedeFacturar: false,
              });
              continue;
            }
          }

          // Verificar otros criterios
          if (!note.DocDate) {
            errors.push({
              docEntry: note.DocEntry,
              cardCode: note.CardCode,
              docDate: '',
              error: 'Sin fecha de documento',
              company,
              sePuedeFacturar: false,
            });
            continue;
          }

          if (!note.DocumentLines || note.DocumentLines.length === 0) {
            errors.push({
              docEntry: note.DocEntry,
              cardCode: note.CardCode,
              docDate: note.DocDate || '',
              error: 'Sin líneas de documento',
              company,
              sePuedeFacturar: false,
            });
            continue;
          }

          if (!note.DocCurrency) {
            errors.push({
              docEntry: note.DocEntry,
              cardCode: note.CardCode,
              docDate: note.DocDate || '',
              error: 'Sin moneda definida',
              company,
              sePuedeFacturar: false,
            });
            continue;
          }

          // Verificar tipos de cambio solo para Alianza y Manufacturing
          if (company === 'SBO_Alianza' || company === 'SBO_MANUFACTURING') {
            const tiposDeCambio = new Set(
              note.DocumentLines.map((line) => line.Rate),
            );
            if (tiposDeCambio.size > 1) {
              errors.push({
                docEntry: note.DocEntry,
                cardCode: note.CardCode,
                docDate: note.DocDate || '',
                error: `Múltiples tipos de cambio encontrados: ${Array.from(tiposDeCambio).join(', ')}`,
                company,
                sePuedeFacturar: false,
              });
              continue;
            }
          }

          // Si llegamos aquí, la nota se puede facturar
          errors.push({
            docEntry: note.DocEntry,
            cardCode: note.CardCode,
            docDate: note.DocDate || '',
            error: 'La nota cumple con todos los criterios para ser facturada',
            company,
            sePuedeFacturar: true,
          });
        }
      } catch (error) {
        this.logger.error(
          `Error obteniendo notas con errores en ${company}: ${this.getErrorMessage(error)}`,
        );
      } finally {
        await this.logoutFromSap(sessionId);
      }
    }

    return errors;
  }
}
