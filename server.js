
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { db, init } = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;

init();

app.use(cors());
app.use(bodyParser.json());

// --- Helpers ---
function handleError(res, err) {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
}

// --- Auth simple (sin tokens, para proyecto escolar) ---
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Faltan credenciales" });
  }
  db.get(
    "SELECT id, username, role FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, row) => {
      if (err) return handleError(res, err);
      if (!row) {
        return res.status(401).json({ error: "Credenciales incorrectas" });
      }
      res.json(row);
    }
  );
});

// --- Productos ---
app.get("/api/products", (req, res) => {
  db.all("SELECT * FROM products ORDER BY id;", [], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
});

app.post("/api/products", (req, res) => {
  const { name, price } = req.body || {};
  if (!name || price == null) {
    return res.status(400).json({ error: "Falta nombre o precio" });
  }
  db.run(
    "INSERT INTO products (name, price) VALUES (?, ?);",
    [name, price],
    function (err) {
      if (err) return handleError(res, err);
      const id = this.lastID;
      db.run(
        "INSERT INTO inventory (product_id, stock) VALUES (?, 0);",
        [id],
        (err2) => {
          if (err2) return handleError(res, err2);
          db.get(
            "SELECT * FROM products WHERE id = ?;",
            [id],
            (err3, row) => {
              if (err3) return handleError(res, err3);
              res.status(201).json(row);
            }
          );
        }
      );
    }
  );
});

app.put("/api/products/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, price } = req.body || {};
  if (!name || price == null) {
    return res.status(400).json({ error: "Falta nombre o precio" });
  }
  db.run(
    "UPDATE products SET name = ?, price = ? WHERE id = ?;",
    [name, price, id],
    function (err) {
      if (err) return handleError(res, err);
      db.get("SELECT * FROM products WHERE id = ?;", [id], (err2, row) => {
        if (err2) return handleError(res, err2);
        res.json(row);
      });
    }
  );
});

app.delete("/api/products/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);

  if (!id) {
    return res.status(400).json({ error: "ID inválido" });
  }

  // 1) Verificar si el producto aparece en ventas (order_items)
  db.get(
    "SELECT COUNT(*) AS cnt FROM order_items WHERE product_id = ?;",
    [id],
    (err, row) => {
      if (err) return handleError(res, err);

      const usadosVentas = row && row.cnt ? row.cnt : 0;

      // 2) Verificar si aparece en movimientos de inventario
      db.get(
        "SELECT COUNT(*) AS cnt FROM inventory_movements WHERE product_id = ?;",
        [id],
        (err2, row2) => {
          if (err2) return handleError(res, err2);

          const usadosMovs = row2 && row2.cnt ? row2.cnt : 0;

          if (usadosVentas > 0 || usadosMovs > 0) {
            // No borramos para no romper historial
            return res.status(400).json({
              error:
                "No se puede eliminar este producto porque ya ha sido utilizado " +
                "en ventas o movimientos de inventario. " +
                "Puedes dejar de usarlo en el menú, pero se conservará para el historial."
            });
          }

          // 3) Si no está usado en ningún lado, lo eliminamos
          //    (primero inventario por limpieza, aunque hay ON DELETE CASCADE)
          db.run(
            "DELETE FROM inventory WHERE product_id = ?;",
            [id],
            function (err3) {
              if (err3) return handleError(res, err3);

              db.run(
                "DELETE FROM products WHERE id = ?;",
                [id],
                function (err4) {
                  if (err4) return handleError(res, err4);
                  res.json({ success: true });
                }
              );
            }
          );
        }
      );
    }
  );
});



// --- Inventario ---
app.get("/api/inventory", (req, res) => {
  const sql = `
    SELECT p.id, p.name, p.price, IFNULL(i.stock, 0) AS stock
    FROM products p
    LEFT JOIN inventory i ON i.product_id = p.id
    ORDER BY p.id;
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
});

app.post("/api/inventory/move", (req, res) => {
  const { product_id, delta, user_id } = req.body || {};
  if (!product_id || !delta) {
    return res.status(400).json({ error: "Faltan datos" });
  }
  db.get(
    "SELECT stock FROM inventory WHERE product_id = ?;",
    [product_id],
    (err, row) => {
      if (err) return handleError(res, err);
      const current = row ? row.stock : 0;
      const newStock = Math.max(0, current + parseInt(delta, 10));

      db.run(
        "INSERT OR IGNORE INTO inventory (product_id, stock) VALUES (?, ?);",
        [product_id, current],
        (err2) => {
          if (err2) return handleError(res, err2);
          db.run(
            "UPDATE inventory SET stock = ? WHERE product_id = ?;",
            [newStock, product_id],
            function (err3) {
              if (err3) return handleError(res, err3);
              db.run(
                "INSERT INTO inventory_movements (product_id, delta, new_stock, user_id) VALUES (?, ?, ?, ?);",
                [product_id, delta, newStock, user_id || null],
                (err4) => {
                  if (err4) return handleError(res, err4);
                  res.json({ product_id, stock: newStock });
                }
              );
            }
          );
        }
      );
    }
  );
});

app.get("/api/inventory/movements", (req, res) => {
  const sql = `
    SELECT m.id,
           m.created_at,
           p.name AS product_name,
           m.delta,
           m.new_stock,
           u.username AS user
    FROM inventory_movements m
    LEFT JOIN products p ON p.id = m.product_id
    LEFT JOIN users u ON u.id = m.user_id
    ORDER BY m.id DESC;
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
});

// --- Mesas / Órdenes ---
app.get("/api/tables", (req, res) => {
  const sql = `
    SELECT t.id,
           t.name,
           EXISTS (
             SELECT 1 FROM orders o
             WHERE o.table_id = t.id AND o.status = 'open'
           ) AS occupied
    FROM tables t
    ORDER BY t.id;
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
});

// Obtener pedido actual de una mesa
app.get("/api/tables/:id/order", (req, res) => {
  const tableId = parseInt(req.params.id, 10);
  const sqlOrder = `
    SELECT * FROM orders
    WHERE table_id = ? AND status = 'open'
    ORDER BY id DESC
    LIMIT 1;
  `;
  db.get(sqlOrder, [tableId], (err, order) => {
    if (err) return handleError(res, err);
    if (!order) {
      return res.json({ order: null, items: [] });
    }
    const sqlItems = `
      SELECT oi.id,
             oi.qty,
             oi.price,
             p.name,
             p.id AS product_id
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?;
    `;
    db.all(sqlItems, [order.id], (err2, items) => {
      if (err2) return handleError(res, err2);
      res.json({ order, items });
    });
  });
});

// Agregar items a la orden de una mesa (crea orden si no existe)
app.post("/api/tables/:id/order/items", (req, res) => {
  const tableId = parseInt(req.params.id, 10);
  const { items, user_id } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "No hay items para agregar" });
  }

  db.serialize(() => {
    db.get(
      "SELECT * FROM orders WHERE table_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1;",
      [tableId],
      (err, order) => {
        if (err) return handleError(res, err);

        const ensureOrder = (cb) => {
          if (order) return cb(order);
          db.run(
            "INSERT INTO orders (table_id, status, user_id) VALUES (?, 'open', ?);",
            [tableId, user_id || null],
            function (err2) {
              if (err2) return handleError(res, err2);
              db.get(
                "SELECT * FROM orders WHERE id = ?;",
                [this.lastID],
                (err3, row) => {
                  if (err3) return handleError(res, err3);
                  cb(row);
                }
              );
            }
          );
        };

        ensureOrder((ord) => {
          let remaining = items.length;
          if (remaining === 0) return res.json({ order: ord });

          items.forEach((it) => {
            const productId = it.product_id;
            const qty = parseInt(it.qty || 1, 10);

            db.get(
              "SELECT stock FROM inventory WHERE product_id = ?;",
              [productId],
              (err4, invRow) => {
                if (err4) return handleError(res, err4);
                const current = invRow ? invRow.stock : 0;
                if (current < qty) {
                  return res
                    .status(400)
                    .json({ error: "Sin stock suficiente para producto " + productId });
                }
                const newStock = current - qty;
                db.run(
                  "UPDATE inventory SET stock = ? WHERE product_id = ?;",
                  [newStock, productId],
                  (err5) => {
                    if (err5) return handleError(res, err5);
                    db.run(
                      "INSERT INTO order_items (order_id, product_id, qty, price) VALUES (?, ?, ?, (SELECT price FROM products WHERE id = ?));",
                      [ord.id, productId, qty, productId],
                      (err6) => {
                        if (err6) return handleError(res, err6);
                        db.run(
                          "INSERT INTO inventory_movements (product_id, delta, new_stock, user_id) VALUES (?, ?, ?, ?);",
                          [productId, -qty, newStock, user_id || null],
                          (err7) => {
                            if (err7) return handleError(res, err7);
                            remaining -= 1;
                            if (remaining === 0) {
                              res.json({ order: ord });
                            }
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          });
        });
      }
    );
  });
});

// Cambiar cantidad / eliminar item no se implementa en detalle para mantener simple,
// pero se puede añadir similar a la lógica de arriba

// Cerrar cuenta de una mesa
app.post("/api/tables/:id/close", (req, res) => {
  const tableId = parseInt(req.params.id, 10);
  db.get(
    "SELECT * FROM orders WHERE table_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1;",
    [tableId],
    (err, order) => {
      if (err) return handleError(res, err);
      if (!order) {
        return res.status(400).json({ error: "No hay pedido abierto para esta mesa" });
      }
      const sqlItems = `
        SELECT qty, price
        FROM order_items
        WHERE order_id = ?;
      `;
      db.all(sqlItems, [order.id], (err2, items) => {
        if (err2) return handleError(res, err2);
        const total = items.reduce(
          (sum, it) => sum + it.qty * it.price,
          0
        );
        db.run(
          "UPDATE orders SET status = 'closed', closed_at = datetime('now'), total = ? WHERE id = ?;",
          [total, order.id],
          function (err3) {
            if (err3) return handleError(res, err3);
            res.json({ success: true, order_id: order.id, total });
          }
        );
      });
    }
  );
});

// --- Reportes ---
app.get("/api/reports/mesas", (req, res) => {
  const sql = `
    SELECT table_id AS mesa, SUM(total) AS total
    FROM orders
    WHERE status = 'closed'
    GROUP BY table_id
    ORDER BY table_id;
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
});

app.get("/api/reports/productos", (req, res) => {
  const sql = `
    SELECT p.name AS producto,
           SUM(oi.qty) AS cantidad,
           SUM(oi.qty * oi.price) AS ingresos
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'closed'
    GROUP BY p.id
    ORDER BY ingresos DESC;
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
});

app.get("/api/reports/usuarios", (req, res) => {
  const sql = `
    SELECT IFNULL(u.username, 'desconocido') AS usuario,
           SUM(o.total) AS total
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    WHERE o.status = 'closed'
    GROUP BY usuario
    ORDER BY total DESC;
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
});

app.get("/api/reports/detalle", (req, res) => {
  const sql = `
    SELECT
      o.created_at AS fecha,
      o.table_id AS mesa,
      IFNULL(u.username, 'desconocido') AS usuario,
      p.name AS producto,
      oi.qty AS cantidad,
      (oi.qty * oi.price) AS total
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN users u ON u.id = o.user_id
    WHERE o.status = 'closed'
    ORDER BY o.created_at DESC, o.id DESC;
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return handleError(res, err);
    res.json(rows);
  });
});

app.get("/", (req, res) => {
  res.send("BarApp backend funcionando 👍");
});

app.listen(PORT, () => {
  console.log("Servidor BarApp escuchando en puerto", PORT);
});
