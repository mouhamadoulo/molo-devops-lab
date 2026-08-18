INSERT INTO products (
    name, description, category, price, stock_quantity, available, created_at, updated_at
) VALUES
    ('MacBook Air 15', 'Ordinateur portable léger pour le développement.', 'LAPTOP', 1499.00, 8, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Pixel Pro', 'Smartphone Android haut de gamme.', 'SMARTPHONE', 1099.00, 15, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Tablette créative', 'Tablette adaptée au dessin et à la prise de notes.', 'TABLET', 749.90, 6, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Dock USB-C', 'Station d''accueil multiport.', 'ACCESSORY', 89.90, 20, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Casque studio', 'Casque fermé de monitoring.', 'AUDIO', 159.00, 0, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Mini PC de laboratoire', 'Machine compacte pour les ateliers DevOps.', 'OTHER', 599.00, 4, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
