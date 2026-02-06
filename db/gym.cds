namespace gym;

using { cuid,managed } from '@sap/cds/common';

entity Members: cuid, managed{
    firstname : String(60);
    lastname  : String(60);
    phone     : String(30);
    email     : String(50);
    status    : String(10); //ACTIVE | PASSIVE
}

entity MembershipPlans: cuid , managed{
    name         : String(60);
    durationDays : Integer;
    price        : Decimal(12,2);
    isActive     : Boolean default true;
}

entity MemberMemberships : cuid, managed {
  member    : Association to Members;
  plan      : Association to MembershipPlans;
  startDate : Date;
  endDate   : Date;
  status    : String(10); // ACTIVE | EXPIRED | FROZEN
}

entity Payments : cuid, managed {
  member     : Association to Members;
  membership : Association to MemberMemberships;
  amount     : Decimal(12,2);
  paidAt     : Timestamp;
  method     : String(20);
  status     : String(10);
}

entity Checkins : cuid, managed {
  member    : Association to Members;
  checkedAt : Timestamp;
  source    : String(20);
}