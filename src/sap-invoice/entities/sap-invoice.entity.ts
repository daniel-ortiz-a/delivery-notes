export class SapInvoice {
  id: number;
  CardCode: string;
  DocDate: string;
  Comments?: string;
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
