-- Development seed data. name_key values match nameKey() in apps/api/src/common/normalize.ts.
INSERT INTO users (display_name) VALUES ('demo-user'), ('second-user');

INSERT INTO categories (name, name_key, slug) VALUES
  ('Restaurants', 'restaurants', 'restaurants'),
  ('Travel destinations', 'travel destinations', 'travel-destinations'),
  ('Automobiles', 'automobiles', 'automobiles'),
  ('Companies', 'companies', 'companies'),
  ('Government services', 'government services', 'government-services'),
  ('NGOs', 'ngos', 'ngos');
