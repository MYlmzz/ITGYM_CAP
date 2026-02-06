namespace my.auth;

entity Users {
  key ID        : UUID;
      email     : String(100);
      password  : String;      // hash
      name      : String(100);
      createdAt : Timestamp;
}
