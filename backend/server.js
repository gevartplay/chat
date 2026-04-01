require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Создаем папку uploads, если нет
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Настройка Multer (безопасность: лимит 10MB)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ 
    storage, 
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// База данных MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.log('❌ DB Error', err));

// --- ROUTES ---

// Авторизация
app.post('/api/login', async (req, res) => {
    const { username } = req.body;
    let user = await User.findOne({ username });
    if (!user) user = await User.create({ username });
    res.json(user);
});

// Получить историю
app.get('/api/messages', async (req, res) => {
    const msgs = await Message.find().sort({ timestamp: 1 }).limit(100);
    res.json(msgs);
});

// Загрузка файла
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file');
    res.json({ 
        fileUrl: `http://localhost:${process.env.PORT}/uploads/${req.file.filename}`, 
        fileName: req.file.originalname 
    });
});

// --- CRON / АВТОУДАЛЕНИЕ ---
// Проверка каждую минуту. Удаляет файлы старше 10 минут
setInterval(async () => {
    try {
        const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
        const oldMessages = await Message.find({ fileUrl: { $ne: null }, timestamp: { $lt: tenMinsAgo } });
        
        for (const msg of oldMessages) {
            const fileName = msg.fileUrl.split('/').pop();
            const filePath = path.join(__dirname, 'uploads', fileName);
            
            // Удаляем файл с сервера
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            
            // Удаляем ссылки из БД (но оставляем текст)
            msg.fileUrl = null;
            msg.fileName = '[Файл удалён сервером]';
            msg.fileType = null;
            await msg.save();
        }
    } catch (err) { console.error("Auto-delete error", err); }
}, 60 * 1000);

// --- SOCKET.IO ---
let onlineUsers = new Set();

io.on('connection', (socket) => {
    socket.on('userJoin', (username) => {
        socket.username = username;
        onlineUsers.add(username);
        io.emit('onlineUsers', Array.from(onlineUsers));
    });

    socket.on('sendMessage', async (data) => {
        const msg = await Message.create(data);
        io.emit('receiveMessage', msg);
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            onlineUsers.delete(socket.username);
            io.emit('onlineUsers', Array.from(onlineUsers));
        }
    });
});

server.listen(process.env.PORT, () => console.log(`🚀 Server running on port ${process.env.PORT}`));