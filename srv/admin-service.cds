using { gym as db } from '../db/gym';
using { gym as pricing } from '../db/pricing';
using { gym as inv } from '../db/inventory';

service AdminService @(path:'/odata/v4/admin') {

  // CRUD ekranları için (şimdilik kalsın)
  @cds.redirection.target
  entity Members           as projection on db.Members;
  entity MembershipPlans   as projection on db.MembershipPlans;
  entity MemberMemberships as projection on db.MemberMemberships;
  entity Payments          as projection on db.Payments;
  entity Checkins          as projection on db.Checkins;
  entity ActiveMembers     as projection on Members where status = 'ACTIVE';
  entity PassiveMembers    as projection on Members where status = 'PASSIVE';
  entity PricingPlans      as projection on pricing.PricingPlans;
  extend service AdminService {
    // Ürün yönetimi ekranı için
    entity Products as projection on inv.Products;

    // Dashboard'da stok uyarısı göstermek için Alert entity'sini güncelleyebiliriz
}
  // Dashboard read-only (hesaplanmış)
  @readonly entity DashboardKPI {
    key ID           : String(1);
    totalMembers     : Integer;
    activeMembers    : Integer;
    expiredMembers   : Integer;
    monthRevenue     : Decimal(12,2);
    todayCheckins    : Integer;
  }

  @readonly entity MembersTrend {
    key monthKey     : String(7);   // 2026-01
    monthLabel       : String(20);  // Oca 2026
    newMembers       : Integer;
  }

  @readonly entity MembershipDist {
    key planName     : String(60);
    count            : Integer;
  }

  @readonly entity Alerts {
    key code         : String(20);
    title            : String(120);
    desc             : String(200);
    count            : Integer;
    state            : String(20);  // Information | Warning | Error
  }

  @readonly entity TodayCheckins {
    key checkinID    : UUID;
    memberName       : String(120);
    time             : String(5);
    membership       : String(60);
    statusText       : String(20);
    statusState      : String(20);
  }

  type RegisterMemberInput {
  firstname   : String(60);
  lastname    : String(60);
  phone       : String(30);
  email       : String(120);
  isStudent   : Boolean;
  plan_ID     : UUID;         // sen UI'da plan_ID seçiyorsun, bunu kullanacağız
  paidAt      : Timestamp;    // opsiyonel
}; 

action RegisterMember(data : RegisterMemberInput) returns Members;
}
