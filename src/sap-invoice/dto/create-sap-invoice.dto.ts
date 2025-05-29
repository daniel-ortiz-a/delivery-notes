class DocumentLineDto {
  ItemCode: string;
  Quantity: number;
  Price: number;
  WarehouseCode: string;
  BaseEntry: number;
  BaseType: number;
  BaseLine: number;
}

export class CreateSapInvoiceDto {
  CardCode: string;
  DocDate: string;
  Comments?: string;
  DocTotal?: number;
  Series: number;
  DocCurrency: string;
  DocumentLines: DocumentLineDto[];
}
