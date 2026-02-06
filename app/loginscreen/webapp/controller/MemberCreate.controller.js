sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
  "use strict";

  return Controller.extend("loginscreen.controller.MemberCreate", {

    onInit: function () {
      // Yeni üye modeli
      this.getView().setModel(new JSONModel({
        firstname: "",
        lastname: "",
        phone: "",
        email: "",
        status: "ACTIVE",

        startMembership: true,
        membershipMonths: 1,
        plan_ID: ""        // ⬅️ seçilen planın UUID'si buraya gelecek
      }), "member");
    },

    onSave: async function () {
      const oData = this.getView().getModel("member").getData();

      if (!oData.firstname || !oData.lastname) {
        sap.m.MessageBox.warning("Ad ve Soyad zorunludur.");
        return;
      }

      const oAdmin = this.getOwnerComponent().getModel("admin");

      try {
        this.getView().setBusy(true);

        // 1) Members tablosuna INSERT (HANA)
        const oMembersBinding = oAdmin.bindList("/Members");
        const oCreatedCtx = oMembersBinding.create({
          firstname: oData.firstname,
          lastname: oData.lastname,
          phone: oData.phone || "",
          email: oData.email || "",
          status: oData.status || "ACTIVE"
        });

        await oCreatedCtx.created(); // create tamamlanana kadar bekle
        const oCreatedMember = oCreatedCtx.getObject();
        const sMemberId = oCreatedMember.ID; // HANA’da oluşan ID

        // 2) Checkbox seçiliyse MemberMemberships tablosuna INSERT (HANA)
        if (oData.startMembership) {
          const iMonths = parseInt(oData.membershipMonths, 10) || 1;

          const dStart = new Date();
          const dEnd = new Date(dStart);
          dEnd.setMonth(dEnd.getMonth() + iMonths);

          const toYMD = (d) => d.toISOString().slice(0, 10);

          const oMmBinding = oAdmin.bindList("/MemberMemberships");
          const oMmCtx = oMmBinding.create({
            member_ID: sMemberId,     // association fk
            // plan_ID: "<UUID>"       // plan seçimini OData’dan gerçek bağlayınca eklenecek
            startDate: toYMD(dStart),
            endDate: toYMD(dEnd),
            status: "ACTIVE"
          });

          await oMmCtx.created();
        }

        sap.m.MessageToast.show("Kayıt başarılı. HANA'ya yazıldı.");
        sap.ui.core.UIComponent.getRouterFor(this).navTo("RouteHome", {}, true);

      } catch (e) {
        console.error(e);
        sap.m.MessageBox.error("Kayıt hatası: " + (e?.message || e));
      } finally {
        this.getView().setBusy(false);
      }
    },

    onNavBack: function () {
      sap.ui.core.UIComponent
        .getRouterFor(this)
        .navTo("RouteHome", {}, true);
    }
  });
});
