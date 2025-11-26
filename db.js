
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "barapp.db");
const db = new sqlite3.Database(dbPath);

function init() {
  db.serialize(() => {
    db.run(`PRAGMA foreign_keys = ON;`);

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS inventory (
        product_id INTEGER PRIMARY KEY,
        stock INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at TEXT,
        total REAL DEFAULT 0,
        FOREIGN KEY (table_id) REFERENCES tables(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        qty INTEGER NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        delta INTEGER NOT NULL,
        new_stock INTEGER NOT NULL,
        user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Seed initial data
    db.run(
      "INSERT OR IGNORE INTO users (id, username, password, role) VALUES (1, 'admin', 'admin', 'admin');"
    );
    db.run(
      "INSERT OR IGNORE INTO users (id, username, password, role) VALUES (2, 'mesero', 'mesero', 'mesero');"
    );

    // Seed tables 1..8
    for (let i = 1; i <= 8; i++) {
      db.run(
        "INSERT OR IGNORE INTO tables (id, name) VALUES (?, ?);",
        [i, `Mesa ${i}`]
      );
    }

    // Seed products base
    const defaultProducts = [
      { id: 1, name: "Cerveza Corona", price: 45 },
      { id: 2, name: "Michelada", price: 80 },
      { id: 3, name: "Mojito", price: 95 },
      { id: 4, name: "Cuba Libre", price: 90 },
      { id: 5, name: "Whisky", price: 130 },
      { id: 6, name: "Papas con Chedar", price: 75 }
    ];
    defaultProducts.forEach((p) => {
      db.run(
        "INSERT OR IGNORE INTO products (id, name, price) VALUES (?, ?, ?);",
        [p.id, p.name, p.price]
      );
      db.run(
        "INSERT OR IGNORE INTO inventory (product_id, stock) VALUES (?, ?);",
        [p.id, 20]
      );
    });
  });
}

module.exports = {
  db,
  init,
};
