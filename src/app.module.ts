import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { SapService } from './sap/sap.service';
import { SapModule } from './sap/sap.module';
import { getInvoiceSeries } from './helpers/series-mapping';
import { SapInvoiceService } from './sap-invoice/sap-invoice.service';
import { SapInvoiceController } from './sap-invoice/sap-invoice.controller';
import { SapInvoiceModule } from './sap-invoice/sap-invoice.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule,
    SapModule,
    SapInvoiceModule,
  ],
  providers: [SapService, SapInvoiceService],
  exports: [SapService],
  controllers: [SapInvoiceController],
})
export class AppModule {}
