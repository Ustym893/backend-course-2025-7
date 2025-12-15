CREATE TABLE IF NOT EXISTS items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_name VARCHAR(255) NOT NULL,
    description TEXT,
    photo VARCHAR(255)
);