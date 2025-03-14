/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import { firstValueFrom } from 'rxjs';
import { getInvoiceSeries } from '../helpers/series-mapping';

@Injectable()
export class SapInvoiceService {
  private readonly logger = new Logger(SapInvoiceService.name);
  private readonly sapHost: string;
  private readonly sapUser: string;
  private readonly sapPassword: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.sapHost = this.configService.get<string>('SAP_HOST') || '';
    this.sapUser = this.configService.get<string>('SAP_USER') || '';
    this.sapPassword = this.configService.get<string>('SAP_PASSWORD') || '';
  }

  async autoTransferInvoices() {
    const companies = ['SBO_Alianza', 'SBO_FGE', 'SBO_MANUFACTURING'];
    let totalFacturas = 0;
    const errores: string[] = [];

    for (const company of companies) {
      const companyName = company.replace(/^SBO_/, '');
      this.logger.log(`Procesando empresa: ${companyName}`);

      const sessionId = await this.loginToSap(company);
      if (!sessionId) {
        const errorMsg = `No se pudo iniciar sesión para ${company}`;
        this.logger.warn(errorMsg);
        errores.push(errorMsg);
        continue;
      }

      try {
        const deliveryNotes = await this.fetchDeliveryNotes(sessionId, company);
        this.logger.log(`Notas encontradas: ${deliveryNotes.length}`);

        for (const deliveryNote of deliveryNotes) {
          const invoiceSeries =
            getInvoiceSeries(company, deliveryNote.Series) ||
            deliveryNote.Series;

          const invoiceData = {
            CardCode: deliveryNote.CardCode,
            DocDate: new Date().toISOString().split('T')[0],
            Comments: deliveryNote.Comments || '',
            Series: invoiceSeries,
            DocCurrency: deliveryNote.DocCurrency,
            DocumentLines: deliveryNote.DocumentLines.map((line: any) => ({
              ItemCode: line.ItemCode,
              Quantity: line.Quantity,
              Price: line.Price,
              WarehouseCode: line.WarehouseCode || '01',
              BaseEntry: deliveryNote.DocEntry,
              BaseType: 15,
              BaseLine: line.LineNum,
            })),
          };

          const invoiceResponse = await this.createInvoice(
            sessionId,
            invoiceData,
          );
          if (invoiceResponse) {
            totalFacturas++;
            this.logger.log(
              `Factura creada para ${company} - CardCode: ${deliveryNote.CardCode} - DocEntry: ${invoiceResponse.DocEntry}`,
            );
          } else {
            const errorMsg = `Error al crear la factura para ${company}`;
            this.logger.error(errorMsg);
            errores.push(errorMsg);
          }
        }
      } catch (error) {
        const errorMsg = `Error en ${company}: ${error.message}`;
        this.logger.error(errorMsg);
        errores.push(errorMsg);
      } finally {
        await this.logoutFromSap(sessionId);
      }
    }

    this.logger.log(`Total de facturas creadas: ${totalFacturas}`);
    if (errores.length > 0) {
      this.logger.error(`Errores detectados: ${errores.join(', ')}`);
    }

    return { totalFacturas, errores };
  }

  private async loginToSap(company: string): Promise<string | null> {
    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.sapHost}/b1s/v1/Login`,
          {
            CompanyDB: company,
            UserName: this.sapUser,
            Password: this.sapPassword,
          },
          { httpsAgent: agent },
        ),
      );

      const companyName = company.replace(/^SBO_/, '');
      this.logger.log(`Sesión iniciada con éxito para ${companyName}`);

      return response.data?.SessionId ?? null;
    } catch (error) {
      this.logger.error(
        `Error al iniciar sesión en SAP para ${company}: ${error.message}`,
      );
      return null;
    }
  }

  private readonly allowedCardCodes = {
    SBO_Alianza: [
      'Alianza Público en General',
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

  private async fetchDeliveryNotes(
    sessionId: string,
    company: string,
  ): Promise<any[]> {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const allowedCodes = this.allowedCardCodes[company] || [];
    const cardCodeFilter = allowedCodes
      .map((code) => `CardCode eq '${code}'`)
      .join(' or ');

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.sapHost}/b1s/v1/DeliveryNotes?$filter=(DocumentStatus eq 'bost_Open' and U_Auto_Auditoria eq 'N') and (${cardCodeFilter})&$top=10`,
          {
            httpsAgent: agent,
            headers: { Cookie: `B1SESSION=${sessionId}` },
          },
        ),
      );

      return response.data?.value || [];
    } catch (error) {
      this.logger.error(`Error al obtener notas de entrega: ${error.message}`);
      return [];
    }
  }

  private async createInvoice(
    sessionId: string,
    invoiceData: any,
  ): Promise<any> {
    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.sapHost}/b1s/v1/Invoices`, invoiceData, {
          httpsAgent: agent,
          headers: { Cookie: `B1SESSION=${sessionId}` },
        }),
      );

      this.logger.log(
        `Factura creada con éxito: DocEntry ${response.data.DocEntry}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error creando factura: ${JSON.stringify(error.response?.data?.error) || error.message}`,
      );
      return null;
    }
  }

  private async logoutFromSap(sessionId: string) {
    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.sapHost}/b1s/v1/Logout`,
          {},
          {
            httpsAgent: agent,
            headers: { Cookie: `B1SESSION=${sessionId}` },
          },
        ),
      );
      this.logger.log(`Sesión cerrada con éxito.`);
    } catch (error) {
      this.logger.error(`Error al cerrar sesión: ${error.message}`);
    }
  }
}
