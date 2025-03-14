import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigAppModule } from './config/config.module';
import { SapModule } from './sap/sap.module';
import { SapInvoiceModule } from './sap-invoice/sap-invoice.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigAppModule,
    SapModule,
    SapInvoiceModule,
  ],
})
export class AppModule {}
