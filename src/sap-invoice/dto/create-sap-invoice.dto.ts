export class CreateSapInvoiceDto {
  CardCode: string;
  DocDate: string;
  Comments?: string;
  DocTotal?: number;
  Series: number;
  DocCurrency: string;
  DocumentLines: {
    ItemCode: string;
    Quantity: number;
    Price: number;
    WarehouseCode: string;
    BaseEntry: number;
    BaseType: number;
    BaseLine: number;
  }[];
}
