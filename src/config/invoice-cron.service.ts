import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SapInvoiceService } from '../sap-invoice/sap-invoice.service';

/**
 * Servicio que maneja las tareas programadas para la facturación automática
 * Este servicio ejecuta diferentes tareas cron para procesar notas de entrega
 * según diferentes horarios y criterios:
 * - Días hábiles: Lunes a Viernes de 18:40 a 23:30 cada 10 minutos
 * - Sábados: De 12:00 a 13:00 cada 10 minutos
 * - Público general: Cada 72 horas
 * - Fin de mes: Días 28-31 de cada mes de 18:40 a 23:30 cada 10 minutos
 */
@Injectable()
export class InvoiceCronService {
  private readonly logger = new Logger(InvoiceCronService.name);

  constructor(private readonly sapInvoiceService: SapInvoiceService) {
    this.startCountdown();
  }

  // Lunes a Viernes de 18:40 a 23:30 cada 10 minutos
  @Cron('0 40-50,0-30 18-23 * * 1-5', { timeZone: 'America/Mexico_City' })
  async facturaDiasHabiles() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Solo ejecutar en los minutos 40 y 50 de cada hora
    if (currentMinute !== 40 && currentMinute !== 50) return;

    // No ejecutar después de las 23:30
    if (currentHour === 23 && currentMinute > 30) return;

    this.logger.log('Ejecutando cron de facturación para días hábiles');
    await this.sapInvoiceService.autoTransferInvoices();
  }

  // Sábados de 12:00 a 13:00 cada 10 minutos
  @Cron('0 0,10,20,30,40,50 12-13 * * 6', { timeZone: 'America/Mexico_City' })
  async facturaSabados() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Solo ejecutar en los minutos 0, 10, 20, 30, 40, 50
    if (![0, 10, 20, 30, 40, 50].includes(currentMinute)) return;

    // No ejecutar después de las 13:00
    if (currentHour === 13 && currentMinute > 0) return;

    this.logger.log('Ejecutando cron de facturación para sábados');
    await this.sapInvoiceService.autoTransferInvoices();
  }

  // Público general - cada 72 horas
  @Cron('0 0 */72 * * *', { timeZone: 'America/Mexico_City' })
  async facturaPublicoGeneral() {
    this.logger.log('Ejecutando cron de facturación para público en general');
    await this.sapInvoiceService.autoTransferInvoices();
  }

  // Fin de mes - días 28-31 de cada mes
  @Cron('0 40-50,0-30 18-23 28-31 * *', { timeZone: 'America/Mexico_City' })
  async facturaFinDeMes() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDate();

    // Solo ejecutar en los minutos 40 y 50 de cada hora
    if (currentMinute !== 40 && currentMinute !== 50) return;

    // No ejecutar después de las 23:30
    if (currentHour === 23 && currentMinute > 30) return;

    // Verificar si es el último día del mes
    const lastDayOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    if (currentDay !== lastDayOfMonth && currentDay !== lastDayOfMonth - 1)
      return;

    this.logger.log('Ejecutando cron de facturación de fin de mes');
    await this.sapInvoiceService.autoTransferInvoices();
  }

  /**
   * Maneja la transferencia automática de albaranes a facturas
   * Este método se ejecuta cada 30 minutos como respaldo
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleAutoTransfer() {
    this.logger.log(
      'Iniciando transferencia automática de albaranes a facturas...',
    );
    try {
      await this.sapInvoiceService.autoTransferInvoices();
      this.logger.log('Transferencia automática completada exitosamente');
    } catch (error) {
      this.logger.error('Error durante la transferencia automática:', error);
    }
  }

  private startCountdown() {
    setInterval(() => {
      const now = new Date();
      const nextExecution = this.getNextExecutionTime(now);
      const timeRemaining = nextExecution.getTime() - now.getTime();

      if (timeRemaining > 0) {
        const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
          (timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
        );
        const minutes = Math.floor(
          (timeRemaining % (1000 * 60 * 60)) / (1000 * 60),
        );
        const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

        process.stdout.write(
          `\rSiguiente ejecución en: ${days}d ${hours}h ${minutes}m ${seconds}s   `,
        );
      }
    }, 1000);
  }

  private getNextExecutionTime(now: Date): Date {
    const next = new Date(now);
    next.setSeconds(0);
    next.setMilliseconds(0);

    const currentHour = next.getHours();
    const currentMinute = next.getMinutes();
    const currentDay = next.getDay();

    // Si es domingo, saltar al lunes 18:40
    if (currentDay === 0) {
      next.setHours(18, 40, 0);
      next.setDate(next.getDate() + 1); // Saltar al lunes
      return next;
    }

    // Si es sábado después de las 13:00, saltar al lunes 18:40
    if (
      currentDay === 6 &&
      (currentHour > 13 || (currentHour === 13 && currentMinute > 0))
    ) {
      next.setHours(18, 40, 0);
      next.setDate(next.getDate() + 2); // Saltar al lunes
      return next;
    }

    // Si es día entre semana después de las 23:30, saltar al siguiente día 18:40
    if (
      currentDay >= 1 &&
      currentDay <= 5 &&
      currentHour >= 23 &&
      currentMinute > 30
    ) {
      next.setHours(18, 40, 0);
      next.setDate(next.getDate() + 1);
      return next;
    }

    // Si estamos en horario de trabajo
    if (
      (currentHour >= 18 && currentHour < 23) ||
      (currentHour === 23 && currentMinute <= 30)
    ) {
      // Calcular el siguiente intervalo de 10 minutos
      const nextMinute = currentMinute + 10 - (currentMinute % 10);
      if (nextMinute === 60) {
        next.setHours(currentHour + 1, 0, 0);
      } else {
        next.setMinutes(nextMinute);
      }
      return next;
    }

    // Si estamos fuera de horario, saltar al siguiente horario de inicio
    if (currentDay === 6) {
      // Si es sábado y antes de las 12:00, saltar a las 12:00
      if (currentHour < 12) {
        next.setHours(12, 0, 0);
      }
    } else {
      // Si es día entre semana, saltar a las 18:40
      next.setHours(18, 40, 0);
      if (currentHour >= 18 || (currentHour === 18 && currentMinute >= 40)) {
        next.setDate(next.getDate() + 1);
      }
    }

    return next;
  }
}
