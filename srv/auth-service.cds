using { my.auth as db } from '../db/schema';

service AuthService {
  entity Users as projection on db.Users;

  action login(
    email    : String,
    password : String
  ) returns Boolean;
}
