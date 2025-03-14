import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';

@Injectable()
export class InvoiceSchedulerService {
  private readonly logger = new Logger(InvoiceSchedulerService.name);

  // 🔹 Lunes a viernes: Ejecuta desde 18:40 hasta 23:30, cada 10 minutos
  @Cron('40,50 18 * * 1-5')
  @Cron('00,10,20,30 19-22 * * 1-5')
  @Cron('00,10,20,30 23 * * 1-5')

  // * CRON EXPRESSIONS
  // @Cron(CronExpression.EVERY_10_HOURS)
  async handleWeekdayCron() {
    await this.executeInvoiceTransfer();
  }

  // 🔹 Sábados: Ejecuta desde 08:30 hasta 14:00, cada 10 minutos
  @Cron('30,40,50 08 * * 6')
  @Cron('00,10,20,30,40,50 09-13 * * 6')
  @Cron('00 14 * * 6')
  async handleSaturdayCron() {
    await this.executeInvoiceTransfer();
  }

  private async executeInvoiceTransfer() {
    this.logger.log('Ejecutando auto-transfer-invoices...');
    try {
      const response = await axios.post(
        'http://localhost:4000/sap/auto-transfer-invoices',
      );
      this.logger.log(
        `Respuesta del servidor: ${JSON.stringify(response.data)}`,
      );

      // Esperar 10 minutos antes del próximo envío
      await new Promise((resolve) => setTimeout(resolve, 10 * 60 * 1000));

      this.logger.log('Ejecutando segundo envío después de 10 minutos...');
      const secondResponse = await axios.post(
        'http://localhost:4000/sap/auto-transfer-invoices',
      );
      this.logger.log(
        `Respuesta del segundo envío: ${JSON.stringify(secondResponse.data)}`,
      );
    } catch (error) {
      this.logger.error(`Error ejecutando el cron: ${error.message}`);
    }
  }
}
