import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class InvoiceSchedulerService {
  private readonly logger = new Logger(InvoiceSchedulerService.name);
  private readonly port: number;
  private lastExecutionTime: Date | null = null;

  constructor(private readonly configService: ConfigService) {
    this.port = this.configService.get<number>('PORT') ?? 3000;
  }

  // 🔹 Run every 72 hours (3 days) at 7:00 AM (GMT-6 Mexico City)
  @Cron('0 7 */3 * *', {
    timeZone: 'America/Mexico_City',
  })
  // 🔹 Run from Monday to Friday between 6:40 AM and 8:40 AM (GMT-6 Mexico City)
  @Cron('*/10 40-59,0-40 6-8 * * 1-5', {
    timeZone: 'America/Mexico_City',
  })
  async handleAutomaticBilling() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // Only execute if within the time window (6:40 AM - 8:40 AM)
    if (
      (hour === 6 && minute >= 40) ||
      hour === 7 ||
      (hour === 8 && minute <= 40)
    ) {
      // Check if 72 hours have passed since last execution
      const shouldExecute72HourCycle =
        !this.lastExecutionTime ||
        now.getTime() - this.lastExecutionTime.getTime() >= 72 * 60 * 60 * 1000;

      if (shouldExecute72HourCycle) {
        this.logger.log(
          'Starting automatic billing process for 72-hour cycle...',
        );
        await this.executeInvoiceTransfer();
        this.lastExecutionTime = now;
      } else {
        this.logger.log('Skipping execution - 72 hours have not elapsed yet');
      }
    }
  }

  private async executeInvoiceTransfer() {
    this.logger.log('Executing auto-transfer-invoices...');
    try {
      const response = await axios.post(
        `http://localhost:${this.port}/sap/auto-transfer-invoices`,
      );
      this.logger.log(`Server response: ${JSON.stringify(response.data)}`);
    } catch (error) {
      this.logger.error(`Error executing cron: ${error.message}`);
    }
  }

  // Test method to simulate different billing scenarios
  testBillingSchedule(testDate: Date) {
    const hour = testDate.getHours();
    const minute = testDate.getMinutes();

    // Test next day billing window
    if (
      (hour === 6 && minute >= 40) ||
      hour === 7 ||
      (hour === 8 && minute <= 30)
    ) {
      this.logger.log('Test: Next day billing window is active');
      return 'next-day-billing';
    }

    // Test end of month billing window
    const tomorrow = new Date(testDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isLastDayOfMonth = testDate.getMonth() !== tomorrow.getMonth();

    if (
      isLastDayOfMonth &&
      ((hour === 19 && minute >= 0) ||
        (hour >= 20 && hour <= 22) ||
        (hour === 23 && minute <= 30))
    ) {
      this.logger.log('Test: End of month billing window is active');
      return 'end-of-month-billing';
    }

    return 'no-billing-window-active';
  }
}
