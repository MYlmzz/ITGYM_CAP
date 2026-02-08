sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
  "use strict";

  return Controller.extend("loginscreen.controller.Home", {

    onInit: function () {
      // View binding’leri bozulmasın diye boş modelleri hazırla
      this.getView().setModel(new JSONModel({
        totalMembers: 0,
        activeMembers: 0,
        expiredMembers: 0,
        monthRevenue: 0,
        todayCheckins: 0
      }), "kpi");

      this.getView().setModel(new JSONModel({ data: [] }), "membersTrend");
      this.getView().setModel(new JSONModel({ data: [] }), "membershipDist");
      this.getView().setModel(new JSONModel({ items: [] }), "alerts");
      this.getView().setModel(new JSONModel({ items: [] }), "checkins");

      // İlk yükleme
      this._loadDashboard();
    },

    onRefresh: function () {
      this._loadDashboard(true);
    },

    _loadDashboard: async function (bShowToast) {
      try {
        const oAdmin = this.getOwnerComponent().getModel("admin");

        const aResults = await Promise.allSettled([
          this._readAll(oAdmin, "/DashboardKPI"),
          this._readAll(oAdmin, "/MembersTrend"),
          this._readAll(oAdmin, "/MembershipDist"),
          this._readAll(oAdmin, "/Alerts"),
          this._readAll(oAdmin, "/TodayCheckins")
        ]);

        const [rKpi, rTrend, rDist, rAlerts, rCheckins] = aResults;

        const aKpi = rKpi.status === "fulfilled" ? rKpi.value : [];
        const aTrend = rTrend.status === "fulfilled" ? rTrend.value : [];
        const aDist = rDist.status === "fulfilled" ? rDist.value : [];
        const aAlerts = rAlerts.status === "fulfilled" ? rAlerts.value : [];
        const aCheckins = rCheckins.status === "fulfilled" ? rCheckins.value : [];

        // KPI tek satır
        const oKpi = aKpi[0] || {};
        this.getView().getModel("kpi").setData({
          totalMembers: oKpi.totalMembers || 0,
          activeMembers: oKpi.activeMembers || 0,
          expiredMembers: oKpi.expiredMembers || 0,
          monthRevenue: oKpi.monthRevenue || 0,
          todayCheckins: oKpi.todayCheckins || 0
        });

        // Trend (VizFrame view’ında month/newMembers alanları varsa)
        // Senin view’da {month}/{newMembers} diyorsan burada map yap:
        this.getView().getModel("membersTrend").setData({
          data: (aTrend || []).map(x => ({
            month: x.monthLabel || x.monthKey,
            newMembers: x.newMembers || 0
          }))
        });

        // Dağılım
        this.getView().getModel("membershipDist").setData({
          data: (aDist || []).map(x => ({
            type: x.planName,
            count: x.count || 0
          }))
        });

        // Alerts
        const a = (aAlerts || []).map(x => ({
          title: x.title,
          desc: x.desc,
          count: String(x.count || 0),
          state: x.state || "Information"
        }));

        this.getView().getModel("alerts").setData({
          items: a.length ? a : [{
            title: "Her şey yolunda",
            desc: "Şu anda aksiyon gerektiren bir durum yok",
            count: "",
            state: "Success"
          }]
        });

        // Today Checkins
        const c = (aCheckins || []).map(x => ({
          memberName: x.memberName,
          time: x.time,
          membership: x.membership || "",
          statusText: x.statusText || "",
          statusState: x.statusState || "None"
        }));

        this.getView().getModel("checkins").setData({
          items: c.length ? c : [{
            memberName: "Kayıt yok",
            time: "",
            membership: "",
            statusText: "Son 24 saatte check-in bulunamadı",
            statusState: "Information"
          }]
        });

        if (bShowToast) MessageToast.show("Dashboard güncellendi");
      } catch (e) {
        // UI5 OData hataları bazen iç içe gelir
        console.error("Dashboard load error:", e);

        const sMsg =
          e?.message ||
          e?.toString?.() ||
          "Bilinmeyen hata";

        MessageToast.show("Dashboard yüklenemedi: " + (e?.message || e));
      }
    },

    _readAll: async function (oODataV4Model, sPath) {
      // OData V4: bindList + requestContexts ile data çekilir
      const oListBinding = oODataV4Model.bindList(sPath);
      const aContexts = await oListBinding.requestContexts(0, 1000);
      return aContexts.map(c => c.getObject());
    },

    onLogout: function () {
      const oAuthModel = this.getOwnerComponent().getModel("auth");
      oAuthModel.setProperty("/isLoggedIn", false);
      localStorage.removeItem("isLoggedIn");
      sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteLogin", {}, true);
    },

    onCreateMember: function () {
      console.log("Yeni Üye tıklandı");
      sap.m.MessageToast.show("Yeni Üye tıklandı");
      const oRouter = sap.ui.core.UIComponent.getRouterFor(this);
      oRouter.navTo("RouteMemberCreate");
    },

    onAlertPress: function (oEvent) {
      MessageToast.show(oEvent.getSource().getTitle());
    },

    onKpiPress: function (oEvent) {
      // Hangi tile tıklandı?
      const oSource = oEvent.getSource();
      const sHeader = oSource.getHeader?.() || "";

      if (sHeader === "Toplam Üye") {
        // Members List sayfasına git
        const oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        oRouter.navTo("RouteMembersList");
      } else {
        MessageToast.show(sHeader + " tıklandı");
      }
    },
    onTotalMembersPress: function () {
      sap.m.URLHelper.redirect("/memberslist/index.html", false);
    },
    onPressActiveMembers: function () {
      sap.m.URLHelper.redirect("/memberslist/index.html#/ActiveMembers", false);
    },
    onPressPassiveMembers: function () {
      sap.m.URLHelper.redirect("/memberslist/index.html#/PassiveMembers", false);
    }
  });
});
