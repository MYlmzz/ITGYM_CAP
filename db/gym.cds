namespace gym;

using { cuid,managed } from '@sap/cds/common';

entity Members: cuid, managed{
    firstname : String(60);
    lastname  : String(60);
    phone     : String(30);
    email     : String(50);
    status    : String(10); //ACTIVE | PASSIVE
    isStudent : Boolean default false;
}

entity MembershipPlans: cuid , managed{
    code         : String(20);
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

entity Trainers : cuid, managed {
  firstname : String(40);
  lastname  : String(40);
  phone     : String(40);
  email     : String(40);
  specialty : String(40);
  isActive  : Boolean default true;

}

entity PTSessions : cuid, managed {
  trainer    : Association to Trainers;
  member     : Association to Members;
  startAt    : Timestamp;
  endAt      : Timestamp;
  location   : String(80);
  status     : String(20);  // PLANNED | DONE | CANCELLED
  title      : String(120);
  notes      : String(255);
}