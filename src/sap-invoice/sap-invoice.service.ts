import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import { firstValueFrom } from 'rxjs';
import { getInvoiceSeries } from '../helpers/series-mapping'

@Injectable()
export class SapInvoiceService {
  private readonly logger = new Logger(SapInvoiceService.name);
  private readonly sapHost: string;
  private readonly sapUser: string;
  private readonly sapPassword: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.sapHost = this.configService.get<string>('SAP_HOST') || '';
    this.sapUser = this.configService.get<string>('SAP_USER') || '';
    this.sapPassword = this.configService.get<string>('SAP_PASSWORD') || '';
  }

  async autoTransferInvoices() {
    const companies = ['SBO_Alianza', 'SBO_FGE', 'SBO_MANUFACTURING'];

    for (const company of companies) {
      this.logger.log(`Iniciando transferencia de facturas para la empresa: ${company}`);
      const sessionId = await this.loginToSap(company);
      if (!sessionId) {
        this.logger.warn(`No se pudo iniciar sesión para ${company}`);
        continue;
      }

      try {
        this.logger.log(`Sesión iniciada para ${company}. Obteniendo notas de entrega...`);
        const deliveryNotes = await this.fetchDeliveryNotes(sessionId);
        this.logger.log(`Notas de entrega encontradas para ${company}: ${JSON.stringify(deliveryNotes)}`);

        for (const deliveryNote of deliveryNotes) {
          const invoiceSeries = getInvoiceSeries(company, deliveryNote.Series) || deliveryNote.Series;

          const invoiceData = {
            CardCode: deliveryNote.CardCode,
            DocDate: new Date().toISOString().slice(0, 10),
            Comments: deliveryNote.Comments || '',
            Series: invoiceSeries,
            DocCurrency: deliveryNote.DocCurrency,
            DocumentLines: deliveryNote.DocumentLines.map(line => ({
              ItemCode: line.ItemCode,
              Quantity: line.Quantity,
              Price: line.Price,
              WarehouseCode: line.WarehouseCode || '01',
              BaseEntry: deliveryNote.DocEntry,
              BaseType: 15,
              BaseLine: line.LineNum,
            })),
          };

          this.logger.log(`Enviando datos de factura para ${company}: ${JSON.stringify(invoiceData)}`);
          const invoiceResponse = await this.createInvoice(sessionId, invoiceData);

          if (invoiceResponse) {
            this.logger.log(`Factura creada para ${company} - CardCode: ${deliveryNote.CardCode}`);
          } else {
            this.logger.error(`Error al crear la factura para ${company}`);
          }
        }
      } catch (error) {
        this.logger.error(`Error procesando facturas para ${company}: ${error.message}`);
      } finally {
        this.logger.log(`Cerrando sesión para ${company}`);
        await this.logoutFromSap(sessionId);
      }
    }
  }

  private async loginToSap(company: string): Promise<string | null> {
    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
      const response = await firstValueFrom(this.httpService.post(
        `${this.sapHost}/b1s/v1/Login`,
        {
          CompanyDB: company,
          UserName: this.sapUser,
          Password: this.sapPassword,
        },
        { httpsAgent: agent }
      ));

      this.logger.log(`Sesión iniciada con éxito para ${company}`);
      return response.data?.SessionId ?? null;
    } catch (error) {
      this.logger.error(`Error al iniciar sesión en SAP para ${company}: ${error.message}`);
      return null;
    }
  }

  private async fetchDeliveryNotes(sessionId: string): Promise<any[]> {
    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.sapHost}/b1s/v1/DeliveryNotes?$filter=DocumentStatus eq 'bost_Open' and U_Auto_Auditoria eq 'N'&$top=1`, {
          httpsAgent: agent,
          headers: { Cookie: `B1SESSION=${sessionId}` },
        })
      );

      this.logger.log(`Notas de entrega obtenidas: ${JSON.stringify(response.data?.value || [])}`);
      return response.data?.value || [];
    } catch (error) {
      this.logger.error(`Error al obtener notas de entrega: ${error.message}`);
      return [];
    }
  }

  private async createInvoice(sessionId: string, invoiceData: any): Promise<boolean> {
    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
      const response = await firstValueFrom(this.httpService.post(
        `${this.sapHost}/b1s/v1/Invoices`,
        invoiceData,
        {
          httpsAgent: agent,
          headers: { Cookie: `B1SESSION=${sessionId}` },
        }
      ));

      this.logger.log(`Factura creada con éxito: ${response.status}`);
      return response.status === 201;
    } catch (error) {
      this.logger.error(`Error creando factura: ${error.message}`);
      return false;
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
          }
        )
      );
      this.logger.log(`Sesión cerrada con éxito.`);
    } catch (error) {
      this.logger.error(`Error al cerrar sesión: ${error.message}`);
    }
  }
}
