sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, MessageToast, MessageBox) {
  "use strict";

  return Controller.extend("loginscreen.controller.Login", {

    onLogin: async function () {
      const oView = this.getView();
      const email = oView.byId("email").getValue().trim();
      const password = oView.byId("password").getValue().trim();

      try {
        const response = await fetch("/odata/v4/auth/login", {   // ✅ auth küçük harf
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          MessageBox.error(`Login servisi hata döndü: ${response.status}\n${text}`);
          return;
        }

        const data = await response.json();
        console.log("Login Response:", data);
        console.log("EMAIL:", `"${email}"`);         // ✅ frontend değişkeni
        console.log("PASSWORD:", `"${password}"`);   // ✅ frontend değişkeni

        const ok = (data === true) || (data?.value === true);
        
        if (ok) {
          MessageToast.show("Giriş başarılı 🎉");
          const oRouter = sap.ui.core.UIComponent.getRouterFor(this);
          oRouter.navTo("RouteHome", {}, true); 
        } else {
          MessageBox.error("Hatalı email veya şifre");
        }

      } catch (e) {
        console.error("onLogin error:", e);
        MessageBox.error("Beklenmeyen bir hata oluştu");
      }
    }

  });
});
