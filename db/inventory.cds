namespace gym;
using { cuid, managed } from '@sap/cds/common';

entity Products : cuid, managed {
    name          : String(100);
    category      : String(50); // Supplement, Beverage, Accessory
    stockQuantity : Integer;
    minStockLevel : Integer;   // Kritik stok seviyesi uyarısı için
    price         : Decimal(12,2);
    currency      : String(3) default 'TRY';
}