class DocumentLine {
  ItemCode: string;
  Quantity: number;
  Price: number;
  WarehouseCode: string;
  BaseEntry: number;
  BaseType: number;
  BaseLine: number;
}

export class SapInvoice {
  id: number;
  CardCode: string;
  DocDate: string;
  Comments?: string;
  Series: number;
  DocCurrency: string;
  DocumentLines: DocumentLine[];
}
