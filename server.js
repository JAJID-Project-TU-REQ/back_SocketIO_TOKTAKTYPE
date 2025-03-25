const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // อนุญาตทุกโดเมน
});

const rooms = {}; // { roomId: { players: [] } }
const MAX_PLAYERS = 5; // จำกัดผู้เล่นต่อห้อง

// ฟังก์ชันสุ่มรหัสห้อง ไม่ให้ซ้ำ
function generateRoomCode() {
  let roomId;
  do {
    roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
  } while (rooms[roomId]); 
  return roomId;
}

io.on("connection", (socket) => {
  console.log("🔗 New client connected:", socket.id);

  // สร้างห้องใหม่
  socket.on("createRoom", () => {
    const roomId = generateRoomCode();
    rooms[roomId] = { players: [] };
    socket.emit("roomCreated", roomId); // ส่งรหัสห้องให้ client
  });

  // เข้าร่วมห้อง
  socket.on("joinRoom", ({ roomId, playerName }) => {
    if (!rooms[roomId]) {
      socket.emit("error", "ห้องนี้ไม่มีอยู่");
      return;
    }

    // เช็คว่าห้องเต็มหรือยัง
    if (rooms[roomId].players.length >= MAX_PLAYERS) {
      socket.emit("roomFull", "ห้องนี้เต็มแล้ว");
      return;
    }

    // เช็คว่าผู้เล่น reconnect หรือไม่
    let player = rooms[roomId].players.find(p => p.name === playerName);
    if (player) {
      player.id = socket.id; // อัปเดต socket.id ใหม่
    } else {
      rooms[roomId].players.push({ id: socket.id, name: playerName, wpm: 0 });
    }

    socket.join(roomId);
    io.to(roomId).emit("playerList", rooms[roomId].players);
  });

  // อัปเดต WPM ของผู้เล่น
  socket.on("updateWpm", ({ roomId, playerId, wpm }) => {
    const room = rooms[roomId];
    if (room) {
      const player = room.players.find((p) => p.id === playerId);
      if (player) {
        player.wpm = wpm;
        io.to(roomId).emit("playerList", room.players);
      }
    }
  });

  // เริ่มเกม
  socket.on("startGame", (roomId) => {
    io.to(roomId).emit("gameStarted");
  });

  // ผู้เล่นออกจากห้อง
  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(
        (player) => player.id !== socket.id
      );

      io.to(roomId).emit("playerList", rooms[roomId].players);

      if (rooms[roomId].players.length === 0) {
        delete rooms[roomId]; // ลบห้องถ้าไม่มีคนอยู่
      }
    }
  });
});

// เปิดเซิร์ฟเวอร์
server.listen(3001, () => {
  console.log("🚀 Server is running on port 3001");
});
