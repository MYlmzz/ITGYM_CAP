const cds = require("@sap/cds");
const { SELECT, INSERT } = cds.ql;

async function getPricingByCode(db, code) {
  const p = await db.run(
    SELECT.one.from("gym.PricingPlans")
      .columns(["code", "basePrice", "studentDiscountPct", "currency", "durationMonths"])
      .where({ code, isActive: true })
  );
  if (!p) throw new Error(`PricingPlans not found for code=${code}`);
  return p;
}

function calcAmount(pricing, isStudent) {
  let amount = Number(pricing.basePrice || 0);
  if (isStudent) {
    const pct = Number(pricing.studentDiscountPct ?? 10);
    amount = amount * (1 - pct / 100);
  }
  return Math.round(amount * 100) / 100;
}

module.exports = (srv) => {
  const { Members, MemberMemberships, MembershipPlans, Payments, Checkins } = srv.entities;

  // -----------------------------
  // Dashboard KPI
  // -----------------------------
  srv.on("READ", "DashboardKPI", async (req) => {
    const db = cds.tx(req);

    const [{ CNT: totalMembers } = { CNT: 0 }] =
      await db.run(cds.ql.SELECT`count(1) as CNT`.from(Members));

    const [{ CNT: activeMembers } = { CNT: 0 }] =
      await db.run(cds.ql.SELECT`count(1) as CNT`.from(MemberMemberships).where({ status: "ACTIVE" }));

    const [{ CNT: expiredMembers } = { CNT: 0 }] =
      await db.run(cds.ql.SELECT`count(1) as CNT`.from(MemberMemberships).where({ status: "EXPIRED" }));

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

    const [{ SUM: monthRevenue } = { SUM: 0 }] = await db.run(
      cds.ql.SELECT`coalesce(sum(amount), 0) as SUM`
        .from(Payments)
        .where({ status: "PAID" })
        .and`paidAt >= ${monthStart} and paidAt < ${nextMonthStart}`
    );

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

    const [{ CNT: todayCheckins } = { CNT: 0 }] = await db.run(
      cds.ql.SELECT`count(1) as CNT`.from(Checkins).where`checkedAt >= ${todayStart} and checkedAt < ${tomorrowStart}`
    );

    return [{
      ID: "1",
      totalMembers,
      activeMembers,
      expiredMembers,
      monthRevenue: monthRevenue || 0,
      todayCheckins
    }];
  });

  // -----------------------------
  // RegisterMember Action (plan_ID seçilerek)
  // -----------------------------
  srv.on("RegisterMember", async (req) => {
    const db = cds.tx(req);

    const {
      firstname, lastname, phone, email,
      isStudent = false,
      plan_ID,
      paidAt
    } = req.data.data || {};

    if (!firstname || !lastname) req.error(400, "firstname/lastname required");
    if (!plan_ID) req.error(400, "plan_ID required");

    // plan -> code (MONTHLY/QUARTERLY/YEARLY) + durationDays
    const plan = await db.run(
      SELECT.one.from(MembershipPlans).columns(["ID", "code", "durationDays"]).where({ ID: plan_ID, isActive: true })
    );
    if (!plan) req.error(400, "Membership plan not found or inactive");
    if (!plan.code) req.error(400, "MembershipPlans.code is missing. Fill code to match PricingPlans.code");

    const pricing = await getPricingByCode(db, plan.code);
    const amount = calcAmount(pricing, isStudent);

    // member create
    const memberID = cds.utils.uuid();
    await db.run(
      INSERT.into(Members).entries({
        ID: memberID,
        firstname,
        lastname,
        phone: phone || "",
        email: email || "",
        status: "ACTIVE",
        isStudent
      })
    );

    // membership create: durationDays (öncelik), yoksa pricing.durationMonths
    const start = new Date();
    const startYMD = start.toISOString().slice(0, 10);

    const end = new Date(start);
    const days = parseInt(plan.durationDays, 10);
    if (Number.isFinite(days) && days > 0) {
      end.setDate(end.getDate() + days);
    } else {
      const months = Number(pricing.durationMonths || 1);
      end.setMonth(end.getMonth() + months);
    }
    const endYMD = end.toISOString().slice(0, 10);

    const membershipID = cds.utils.uuid();
    await db.run(
      INSERT.into(MemberMemberships).entries({
        ID: membershipID,
        member_ID: memberID,
        plan_ID,
        startDate: startYMD,
        endDate: endYMD,
        status: "ACTIVE"
      })
    );

    // payment create
    await db.run(
      INSERT.into(Payments).entries({
        ID: cds.utils.uuid(),
        member_ID: memberID,
        membership_ID: membershipID,
        amount,
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        method: "CASH",
        status: "PAID",
        currency: pricing.currency || "TRY"
      })
    );

    return await db.run(SELECT.one.from(Members).where({ ID: memberID }));
  });

  // -----------------------------
  // Payment CREATE → amount otomatik hesaplansın
  // -----------------------------
  srv.before("CREATE", "Payments", async (req) => {
    const db = cds.tx(req);

    if (req.data.amount) return;

    const membership_ID = req.data.membership_ID;
    if (!membership_ID) req.error(400, "membership_ID is required");

    // membership -> plan_ID + member_ID
    const mm = await db.run(
      SELECT.one.from(MemberMemberships).columns(["plan_ID", "member_ID"]).where({ ID: membership_ID })
    );
    if (!mm) req.error(400, "Membership not found");
    if (!mm.plan_ID) req.error(400, "Membership has no plan_ID");

    // plan -> code
    const plan = await db.run(
      SELECT.one.from(MembershipPlans).columns(["code"]).where({ ID: mm.plan_ID })
    );
    if (!plan?.code) req.error(400, "MembershipPlans.code is missing");

    // member -> isStudent
    const m = await db.run(
      SELECT.one.from(Members).columns(["isStudent"]).where({ ID: mm.member_ID })
    );

    const pricing = await getPricingByCode(db, plan.code);
    const amount = calcAmount(pricing, !!m?.isStudent);

    req.data.amount = amount;
    req.data.status = req.data.status || "PAID";
    req.data.method = req.data.method || "CASH";
    req.data.paidAt = req.data.paidAt || new Date().toISOString();
    req.data.currency = req.data.currency || pricing.currency || "TRY";
  });

  // -----------------------------
  // Membership dağılımı
  // -----------------------------
  srv.on("READ", "MembershipDist", async (req) => {
    const db = cds.tx(req);

    const rows = await db.run(
      cds.ql.SELECT.from(MemberMemberships)
        .columns(["plan.name as planName", "count(1) as count"])
        .groupBy("plan.name")
        .orderBy("count desc")
    );

    return (rows || []).filter(r => r.planName);
  });

  // -----------------------------
  // Alerts
  // -----------------------------
  srv.on("READ", "Alerts", async (req) => {
    const db = cds.tx(req);

    const now = new Date();
    const nowYMD = now.toISOString().substring(0, 10);
    const in7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const in7YMD = in7.toISOString().substring(0, 10);

    const [{ CNT: expSoon } = { CNT: 0 }] = await db.run(
      cds.ql.SELECT`count(1) as CNT`
        .from(MemberMemberships)
        .where({ status: "ACTIVE" })
        .and(`endDate >=`, nowYMD)
        .and(`endDate <=`, in7YMD)
    );

    const [{ CNT: expired } = { CNT: 0 }] = await db.run(
      cds.ql.SELECT`count(1) as CNT`.from(MemberMemberships).where({ status: "EXPIRED" })
    );

    return [
      { code: "EXP_SOON", title: "Süresi 7 gün içinde dolacak üyeler", desc: "Üyelik bitişi yaklaşanlar", count: expSoon, state: expSoon > 0 ? "Warning" : "Information" },
      { code: "EXPIRED", title: "Süresi dolmuş üyelikler", desc: "Yenileme / tahsilat aksiyonu", count: expired, state: expired > 0 ? "Error" : "Information" }
    ];
  });
};
