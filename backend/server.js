const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Cấu hình kết nối MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456', // Mật khẩu bạn đã cung cấp
    database: 'crud_db'
});

// Kết nối và tạo bảng tự động
db.connect((err) => {
    if (err) {
        console.error('Lỗi kết nối MySQL. Vui lòng đảm bảo bạn đã cài và bật MySQL Server:', err.message);
        return;
    }
    console.log('Đã kết nối tới MySQL database.');

    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT false
    )`;
    db.query(createTableQuery, (err) => {
        if (err) console.error("Lỗi tạo bảng: ", err.message);
    });
});

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
