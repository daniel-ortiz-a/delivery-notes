import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SapInvoiceModule } from './sap-invoice/sap-invoice.module';
import { SchedulerService } from './config/scheduler.service';
import { SchedulerModule } from './config/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    SapInvoiceModule,
    SchedulerModule,
  ],
  controllers: [],
  providers: [SchedulerService],
})
export class AppModule {}
