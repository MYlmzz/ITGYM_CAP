const cds = require("@sap/cds");
const { SELECT, UPDATE } = require("@sap/cds/lib/ql/cds-ql");

module.exports = (srv) => {
  srv.on("login", async (req) => {
    const email = req.data.email?.trim();
    const password = req.data.password?.trim();

    if (!email || !password) {
      return false;
    }

    const { Users } = cds.entities("my.auth");
    const tx = cds.tx(req);
    const user = await tx.run(SELECT.one.from(Users).columns("ID", "email", "name", "role", "password", "isActive").where`email = ${email}`);

     if (!user) {
      return false;
     }

     if (!user.isActive) {
      return false;
     }

       const ok = password === user.password;

    if (!ok) {
      return false;
    }

    await tx.run(
      UPDATE(Users).set({ lastLogin: new Date() })
      .where`ID = ${user.ID}`
    );

    return true
  });
};
