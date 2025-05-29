import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SapInvoiceModule } from './sap-invoice/sap-invoice.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    SapInvoiceModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
