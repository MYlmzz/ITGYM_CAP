const cds = require("@sap/cds");

module.exports = (srv) => {
  srv.on("login", async (req) => {
    const email = req.data.email?.trim();
    const password = req.data.password?.trim();

    const { Users } = cds.entities("my.auth");
    const tx = cds.tx(req);

    // 1) DB’de gerçekten kayıt var mı?
    const sample = await tx.run(SELECT.from(Users).columns("email","password").limit(10));
    console.log("SAMPLE USERS:", sample);

    // 2) Girilen değerleri “uzunluk” ile gör (boşluk yakalar)
    console.log("INPUT:", JSON.stringify(email), email?.length, JSON.stringify(password), password?.length);

    // 3) Email ile kullanıcı var mı?
    const byEmail = await tx.run(SELECT.one.from(Users).columns("email","password").where`email = ${email}`);
    console.log("BY EMAIL:", byEmail);

    // 4) Email+password eşleşiyor mu?
    const user = await tx.run(
      SELECT.one.from(Users).columns("ID","email").where`email = ${email} and password = ${password}`
    );
    console.log("FOUND USER:", user);

    return !!user;
  });
};
