import { Module } from '@nestjs/common';
import { InvoiceCronModule } from './invoice-cron.module';

@Module({
  imports: [InvoiceCronModule],
})
export class SchedulerModule {}
