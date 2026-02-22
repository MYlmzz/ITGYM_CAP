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
  // [GÜNCELLEME 1] Products entity'sini buraya ekledik
  const { Members, MemberMemberships, MembershipPlans, Payments, Checkins, Products, Trainers, PTSessions } = srv.entities;

  // ========================================
  // PT SESSIONS VALIDATIONS
  // ========================================
  srv.before(['CREATE', 'UPDATE'], 'PTSessions', async (req) => {
    const db = cds.tx(req);
    const { startAt, endAt, status, trainer_ID, member_ID, title } = req.data;

    // 1. Validate timestamps
    if (!startAt || !endAt) {
      return req.error(400, 'startAt and endAt are required');
    }
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (end <= start) {
      return req.error(400, 'endAt must be after startAt');
    }

    // 2. Validate status
    const validStatuses = ['PLANNED', 'DONE', 'CANCELLED'];
    if (status && !validStatuses.includes(status)) {
      return req.error(400, `status must be one of: ${validStatuses.join(', ')}`);
    }

    // 3. Validate trainer_ID exists
    if (!trainer_ID) {
      return req.error(400, 'trainer_ID is required');
    }
    const trainer = await db.run(SELECT.one.from(Trainers).where({ ID: trainer_ID }));
    if (!trainer) {
      return req.error(400, 'Trainer not found');
    }

    // 4. Validate member (if present) or title (if no member)
    if (!member_ID && !title) {
      return req.error(400, 'Either member or title must be provided');
    }
    if (member_ID) {
      const member = await db.run(SELECT.one.from(Members).where({ ID: member_ID }));
      if (!member) {
        return req.error(400, 'Member not found');
      }
    }

    // 5. Check for overlaps (excluding current record on UPDATE)
    let overlapQuery = SELECT.from(PTSessions)
      .columns(['ID', 'startAt', 'endAt'])
      .where({
        trainer_ID,
        and: [
          { startAt: { '<': endAt } },
          { endAt: { '>': startAt } }
        ]
      });

    // On UPDATE, exclude the current session ID
    if (req.context.query.UPDATE) {
      const sessionID = req.context.query.UPDATE.data.ID || req.data.ID;
      if (sessionID) {
        overlapQuery = overlapQuery.where`ID <> ${sessionID}`;
      }
    }

    const overlaps = await db.run(overlapQuery);
    if (overlaps && overlaps.length > 0) {
      return req.error(400, 'Trainer has overlapping PT session in this time range.');
    }
  });
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

    // [GÜNCELLEME 2] Kritik Stok Kontrolü
    const [{ CNT: lowStockCount } = { CNT: 0 }] = await db.run(
      cds.ql.SELECT`count(1) as CNT`
        .from(Products)
        .where`stockQuantity <= minStockLevel`
    );

    return [
      { 
        code: "EXP_SOON", 
        title: "Süresi 7 gün içinde dolacak üyeler", 
        desc: "Üyelik bitişi yaklaşanlar", 
        count: expSoon, 
        state: expSoon > 0 ? "Warning" : "Information" 
      },
      { 
        code: "EXPIRED", 
        title: "Süresi dolmuş üyelikler", 
        desc: "Yenileme / tahsilat aksiyonu", 
        count: expired, 
        state: expired > 0 ? "Error" : "Information" 
      },
      // Yeni eklenen Stok Uyarısı
      { 
        code: "LOW_STOCK", 
        title: "Kritik Stok Uyarısı", 
        desc: "Stok seviyesi sınırın altında olan ürünler", 
        count: lowStockCount, 
        state: lowStockCount > 0 ? "Error" : "Information" 
      }
    ];
  });
  // ========================================
  // DAILY PT SCHEDULE FUNCTION (YENİ)
  // ========================================
  srv.on("getDailyPTSchedule", async (req) => {
    const db = cds.tx(req);
    const dayParam = req.data.day; // Expected format: YYYY-MM-DD or Date object

    // Parse the day parameter
    let dayDate;
    if (typeof dayParam === 'string') {
      dayDate = new Date(dayParam);
    } else {
      dayDate = new Date(dayParam);
    }

    // Compute day boundaries (local time)
    const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate() + 1, 0, 0, 0, 0);

    // Query PTSessions with expanded trainer and member
    const sessions = await db.run(
      SELECT.from(PTSessions)
        .columns(['ID', 'startAt', 'endAt', 'title', 'status', 'location', 'trainer_ID', 'member_ID'])
        .where({
          and: [
            { startAt: { '<': dayEnd } },
            { endAt: { '>': dayStart } }
          ]
        })
    );

    // Expand trainer and member data
    const result = [];
    for (const session of sessions || []) {
      const trainer = await db.run(SELECT.one.from(Trainers).where({ ID: session.trainer_ID }));
      const member = session.member_ID 
        ? await db.run(SELECT.one.from(Members).where({ ID: session.member_ID }))
        : null;

      result.push({
        sessionID: session.ID,
        trainerID: session.trainer_ID,
        trainerName: trainer ? `${trainer.firstName} ${trainer.lastName}` : 'Unknown',
        memberID: session.member_ID || null,
        memberName: member ? `${member.firstname} ${member.lastname}` : 'No Member (Block Time)',
        startAt: session.startAt,
        endAt: session.endAt,
        title: session.title,
        status: session.status,
        location: session.location
      });
    }

    return result;
  });
};