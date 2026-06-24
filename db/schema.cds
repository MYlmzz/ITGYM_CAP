namespace my.auth;

entity Users {
  key ID            : UUID;
      email         : String(100);
      password      : String(30);     // hash
      name          : String(100);
      role          : String(30); 
      isActive      : Boolean default true;
      lastLogin     : Timestamp; 
      createdAt     : Timestamp;
}

