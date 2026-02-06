const cds = require("@sap/cds");

module.exports = (srv) => {
  const { Members, MemberMemberships, Payments, Checkins } = srv.entities;

  // KPI
  srv.on("READ", "DashboardKPI", async (req) => {
    const db = cds.tx(req);

    const [{ CNT: totalMembers } = { CNT: 0 }] =
      await db.run(cds.ql.SELECT`count(1) as CNT`.from(Members));

    const [{ CNT: activeMembers } = { CNT: 0 }] =
      await db.run(cds.ql.SELECT`count(1) as CNT`.from(MemberMemberships).where({ status: "ACTIVE" }));

    const [{ CNT: expiredMembers } = { CNT: 0 }] =
      await db.run(cds.ql.SELECT`count(1) as CNT`.from(MemberMemberships).where({ status: "EXPIRED" }));

    const now = new Date();

    // Month revenue (ay başından itibaren)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [{ SUM: monthRevenue } = { SUM: 0 }] =
      await db.run(
        cds.ql.SELECT`sum(amount) as SUM`
          .from(Payments)
          .where({ status: "PAID" })
          .and(`paidAt >=`, monthStart)
      );

    // Today checkins (günün başından)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ CNT: todayCheckins } = { CNT: 0 }] =
      await db.run(
        cds.ql.SELECT`count(1) as CNT`
          .from(Checkins)
          .where(`checkedAt >=`, last24h)
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

  // Membership dağılımı (plan adına göre)
  srv.on("READ", "MembershipDist", async (req) => {
    const db = cds.tx(req);

   // CAP'in her sürümünde en stabil yöntem: string expression kullanmak
  const rows = await db.run(
    cds.ql.SELECT
      .from(MemberMemberships)
      .columns([
        "plan.name as planName",
        "count(1) as count"
      ])
      .groupBy("plan.name")
      .orderBy("count desc")
  );

    return (rows || []).filter(r => r.planName);
  });

  // Alerts (minimum MVP)
  srv.on("READ", "Alerts", async (req) => {
const cds = require("@sap/cds");

module.exports = (srv) => {
  const { MemberMemberships } = srv.entities;

  srv.on("READ", "Alerts", async (req) => {
    const db = cds.tx(req);

    // 1) Süresi 7 gün içinde dolacak (CQL ile stabil)
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

    // 2) Süresi dolmuş
    const [{ CNT: expired } = { CNT: 0 }] = await db.run(
      cds.ql.SELECT`count(1) as CNT`
        .from(MemberMemberships)
        .where({ status: "EXPIRED" })
    );

    // 3) Son 30 günde hiç check-in yok (HANA SQL ile doğru)
    // ⚠️ Bu tabloların isimleri sende farklı olabilir:
    // - GYM_MEMBERS
    // - GYM_CHECKINS
    //
    // Eğer 500 alırsan, tek sebep tablo adı -> doğru adı yazıp düzelteceğiz.
    const sqlInactive30 = `
      SELECT COUNT(1) AS "CNT"
      FROM "GYM_MEMBERS" m
      WHERE NOT EXISTS (
        SELECT 1
        FROM "GYM_CHECKINS" c
        WHERE c."member_ID" = m."ID"
          AND c."checkedAt" >= ADD_DAYS(CURRENT_UTCTIMESTAMP, -30)
      )
    `;

    let inactive30 = 0;
    try {
      const r = await db.run(sqlInactive30);
      inactive30 = (r && r[0] && r[0].CNT) ? r[0].CNT : 0;
    } catch (e) {
      // Tablo adı farklıysa burada patlar; dashboard’u tamamen kırmayalım
      inactive30 = 0;
      console.warn("INACTIVE_30 SQL failed (table name mismatch likely):", e.message);
    }

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
      {
        code: "INACTIVE_30",
        title: "30 gündür gelmeyen üyeler",
        desc: "Geri kazanım fırsatı",
        count: inactive30,
        state: inactive30 > 0 ? "Warning" : "Information"
      }
    ];
  });
};
  });

  // Today check-ins listesi
  srv.on("READ", "TodayCheckins", async (req) => {
    const db = cds.tx(req);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1) Bugünkü son check-in'ler (üye ID + ad + saat)
  const checkins = await db.run(
    cds.ql.SELECT
      .from(Checkins)
      .columns([
        "ID as checkinID",
  "checkedAt",
  "member_ID as memberID",
  "member.firstname as firstName",
  "member.lastname as lastName"
      ])
      .where(`checkedAt >=`, last24h)
      .orderBy("checkedAt desc")
      .limit(20)
  );

  const a = checkins || [];
  if (!a.length) return [];

  // 2) Bu check-in'lerde geçen üyeleri topla
  const memberIDs = [...new Set(a.map(x => x.memberID).filter(Boolean))];
  if (!memberIDs.length) {
    return a.map(r => _mapCheckinRow(r, null));
  }

  // 3) Üyelerin ACTIVE üyeliklerini + plan adını tek seferde çek
  //    (Bir üyede birden fazla ACTIVE olabilir; en güncel endDate'i seçeriz)
  const memberships = await db.run(
    cds.ql.SELECT
      .from(MemberMemberships)
      .columns([
        { ref: ["member", "ID"], as: "memberID" },
        { ref: ["plan", "name"], as: "planName" },
        "endDate",
        "status"
      ])
      .where({ status: "ACTIVE" })
      .and({ member_ID: { in: memberIDs } })
  );

  // 4) memberID -> en uygun ACTIVE membership (max endDate)
  const bestByMember = new Map();
  for (const m of memberships || []) {
    const prev = bestByMember.get(m.memberID);
    if (!prev) {
      bestByMember.set(m.memberID, m);
      continue;
    }
    // endDate büyük olanı seç
    const prevEnd = prev.endDate ? new Date(prev.endDate) : new Date(0);
    const currEnd = m.endDate ? new Date(m.endDate) : new Date(0);
    if (currEnd > prevEnd) bestByMember.set(m.memberID, m);
  }

  // 5) UI formatına çevir
  return a.map(r => _mapCheckinRow(r, bestByMember.get(r.memberID)));

  function _mapCheckinRow(r, mm) {
    const t = new Date(r.checkedAt);
    const hh = String(t.getHours()).padStart(2, "0");
    const mmn = String(t.getMinutes()).padStart(2, "0");

    const hasActive = !!mm;
    return {
      checkinID: r.checkinID,
      memberName: `${r.firstname || ""} ${r.lastname || ""}`.trim(),
      time: `${hh}:${mmn}`,
      membership: hasActive ? (mm.planName || "") : "",
      statusText: hasActive ? "Aktif" : "Pasif",
      statusState: hasActive ? "Success" : "Error"
    };
  }
});

  // Trend (şimdilik sabit; sonra HANA SQL ile gerçek yapacağız)
  srv.on("READ", "MembersTrend", async (req) => {
  const db = cds.tx(req);

  // TABLO ADI: CAP/HANA’da farklı olabilir.
  // En güvenlisi: persistence name varsa onu kullan.
  const membersTable =
    (srv.entities.Members && srv.entities.Members["@cds.persistence.name"]) || "GYM_MEMBERS";

  const sql = `
    SELECT
      TO_VARCHAR(createdAt, 'YYYY-MM') AS "monthKey",
      TO_VARCHAR(createdAt, 'MON YYYY') AS "monthLabel",
      COUNT(1) AS "newMembers"
    FROM "${membersTable}"
    WHERE createdAt >= ADD_MONTHS(CURRENT_UTCTIMESTAMP, -5)
    GROUP BY
      TO_VARCHAR(createdAt, 'YYYY-MM'),
      TO_VARCHAR(createdAt, 'MON YYYY')
    ORDER BY "monthKey"
  `;

  return await db.run(sql);
});
};
