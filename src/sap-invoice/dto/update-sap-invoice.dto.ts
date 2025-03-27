import { PartialType } from '@nestjs/mapped-types';
import { CreateSapInvoiceDto } from './create-sap-invoice.dto';

export class UpdateSapInvoiceDto extends PartialType(CreateSapInvoiceDto) {}
