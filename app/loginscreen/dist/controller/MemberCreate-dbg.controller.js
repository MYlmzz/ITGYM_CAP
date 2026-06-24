sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
  "use strict";

  return Controller.extend("loginscreen.controller.MemberCreate", {

    onInit: function () {
      this.getView().setModel(new JSONModel({
        firstname: "",
        lastname: "",
        phone: "",
        email: "",
        status: "ACTIVE",

        startMembership: true,
        plan_ID: "" // seçilen planın UUID'si
      }), "member");
    },

    onSave: async function () {
      const oData = this.getView().getModel("member").getData();

      if (!oData.firstname || !oData.lastname) {
        MessageBox.warning("Ad ve Soyad zorunludur.");
        return;
      }

      const oAdmin = this.getOwnerComponent().getModel("admin");

      try {
        this.getView().setBusy(true);

        // 1) Member create
        const oMembersBinding = oAdmin.bindList("/Members");
        const oCreatedMemberCtx = oMembersBinding.create({
          firstname: oData.firstname,
          lastname: oData.lastname,
          phone: oData.phone || "",
          email: oData.email || "",
          status: oData.status || "ACTIVE"
        });

        await oCreatedMemberCtx.created();
        const sMemberId = oCreatedMemberCtx.getObject().ID;

        // Üyelik isteniyorsa plan zorunlu
        if (oData.startMembership) {
          if (!oData.plan_ID) {
            MessageBox.warning("Üyelik paketi seçiniz.");
            return;
          }

          const toYMD = (d) => d.toISOString().slice(0, 10);

          // 2) Planı oku (durationDays)
          // OData V4 key formatı: Entity(<key>) burada UUID string key çalışıyor
          const oPlanCtx = oAdmin.bindContext(`/MembershipPlans(${oData.plan_ID})`);
          const oPlan = await oPlanCtx.requestObject();
          const durationDays = parseInt(oPlan?.durationDays, 10) || 30;

          // 3) Membership create (plan_ID ile)
          const dStart = new Date();
          const dEnd = new Date(dStart);
          dEnd.setDate(dEnd.getDate() + durationDays);

          const oMmBinding = oAdmin.bindList("/MemberMemberships");
          const oMmCtx = oMmBinding.create({
            member_ID: sMemberId,
            plan_ID: oData.plan_ID,
            startDate: toYMD(dStart),
            endDate: toYMD(dEnd),
            status: "ACTIVE"
          });

          await oMmCtx.created();
          const sMembershipId = oMmCtx.getObject().ID;

          // 4) Payment create (amount göndermiyoruz -> backend hesaplayacak)
          const oPayBinding = oAdmin.bindList("/Payments");
          const oPayCtx = oPayBinding.create({
            member_ID: sMemberId,
            membership_ID: sMembershipId,
            method: "CASH",
            status: "PAID",
            paidAt: new Date().toISOString()
          });

          await oPayCtx.created();
        }

        MessageToast.show("Kayıt başarılı. HANA'ya yazıldı.");
        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteHome", {}, true);

      } catch (e) {
        console.error(e);
        MessageBox.error("Kayıt hatası: " + (e?.message || e));
      } finally {
        this.getView().setBusy(false);
      }
    },

    onNavBack: function () {
      sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteHome", {}, true);
    }
  });
});
