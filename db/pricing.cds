namespace gym;

type PlanType: String(20) enum {
    MONTHLY;
    QUARTERLY; //3 AYLIK
    YEARLY;
    STUDENT; //indirim var
}

entity PricingPlans {
  key code          : PlanType;
      name          : String(60);
      durationMonths: Integer;        // 1, 3, 12
      basePrice     : Decimal(12,2);  // TL
      studentDiscountPct : Decimal(5,2) default 10; // %10 (genel)
      currency      : String(3) default 'TRY';
      isActive      : Boolean default true;
      updatedAt     : Timestamp @cds.on.update;
      updatedBy     : String(120) @cds.on.update;
}