const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Cấu hình kết nối MySQL bằng Pool để tránh bị disconnect do timeout
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'crud_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Hàm khởi tạo DB có cơ chế tự động thử lại (retry)
const initDb = () => {
    db.getConnection((err, connection) => {
        if (err) {
            console.error('Lỗi kết nối MySQL, thử lại sau 3 giây...', err.message);
            setTimeout(initDb, 3000); // Thử lại sau 3 giây nếu DB chưa sẵn sàng
            return;
        }
        console.log('Đã kết nối tới MySQL database.');

        const createTableQuery = `
        CREATE TABLE IF NOT EXISTS tasks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            completed BOOLEAN NOT NULL DEFAULT false
        )`;
        connection.query(createTableQuery, (err) => {
            if (err) console.error("Lỗi tạo bảng: ", err.message);
            else console.log("Bảng tasks đã được đảm bảo tạo thành công.");
            connection.release();
        });
    });
};

// Gọi hàm khởi tạo
initDb();

// Create
app.post('/tasks', (req, res) => {
    const { title } = req.body;
    db.query('INSERT INTO tasks (title) VALUES (?)', [title], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: results.insertId, title, completed: 0 });
    });
});

// Read
app.get('/tasks', (req, res) => {
    db.query('SELECT * FROM tasks', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        const tasks = results.map(row => ({
            ...row,
            completed: !!row.completed
        }));
        res.json(tasks);
    });
});

// Update
app.put('/tasks/:id', (req, res) => {
    const { title, completed } = req.body;
    const isCompleted = completed ? 1 : 0;
    db.query('UPDATE tasks SET title = ?, completed = ? WHERE id = ?',
        [title, isCompleted, req.params.id],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: results.affectedRows });
        }
    );
});

// Delete
app.delete('/tasks/:id', (req, res) => {
    db.query('DELETE FROM tasks WHERE id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: results.affectedRows });
    });
});

app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
});
