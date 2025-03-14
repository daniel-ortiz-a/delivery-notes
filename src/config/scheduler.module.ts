import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { InvoiceSchedulerService } from './scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [InvoiceSchedulerService],
  exports: [InvoiceSchedulerService],
})
export class SchedulerModule {}
