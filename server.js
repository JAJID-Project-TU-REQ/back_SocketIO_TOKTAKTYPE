const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ['GET', 'POST']
  }, // อนุญาตทุกโดเมน
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

  // ส่ง playerId (UUID) ให้ผู้เล่น
  const playerId = uuidv4();
  socket.emit("playerId", playerId);

  // -------------------------------------------------------------------------------------------------------------------
  // ฟังก์ชันหน้าแรก
  // -------------------------------------------------------------------------------------------------------------------

  // สร้างห้องใหม่
  socket.on("createRoom", (playerId) => {
    const roomId = generateRoomCode();
    rooms[roomId] = {
      hostId: playerId,       // คนสร้างห้อง = host
      status: "waiting",      // เริ่มจากรอ
      players: []
    };
    console.log("📦 Room created:", roomId);
    socket.emit("roomCreated", roomId);
  });

  // เข้าร่วมห้อง
  socket.on("joinRoom", ({ roomId, playerName, playerId }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("error", "ห้องนี้ไม่มีอยู่");
      return;
    }

    if (room.status !== "waiting") {
      socket.emit("error", "เกมเริ่มไปแล้ว");
      return;
    }

    if (room.players.length >= MAX_PLAYERS) {
      socket.emit("roomFull", "ห้องนี้เต็มแล้ว");
      return;
    }

    // 🔒 กันชื่อซ้ำในห้องเดียวกัน
    const duplicateName = room.players.find(p => p.name === playerName && p.id !== playerId);
    if (duplicateName) {
      socket.emit("error", "ชื่อซ้ำในห้อง");
      return;
    }

    // 🔁 ถ้า reconnect
    let player = room.players.find(p => p.id === playerId);
    if (player) {
      player.socketId = socket.id;
    } else {
      room.players.push({ id: playerId, socketId: socket.id, name: playerName, wpm: 0 });
    }

    socket.join(roomId);
    console.log("🔑 Player joined room:", roomId, playerName);
    io.to(roomId).emit("playerList", room.players);
    if (roomId) {
      io.to(roomId).emit("roomInfo", {
        roomId: roomId,
        hostId: room.hostId,
        status: room.status,
        players: room.players
      });
    } else {
      io.to(roomId).emit("error", "ห้องนี้ไม่มีอยู่");
    }
  });

  // player กดออกจากห้องเอง
  socket.on("leaveRoom", ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.players = room.players.filter(player => player.id !== playerId);
    io.to(roomId).emit("playerList", room.players);

    // ถ้า host ออก → ย้าย host ไปให้คนแรกในลิสต์
    if (room.hostId === playerId && room.players.length > 0) {
      room.hostId = room.players[0].id;
    }

    // ถ้าไม่มีคนเหลือในห้อง → ลบห้อง
    if (room.players.length === 0) {
      delete rooms[roomId];
    }
  });

  // -------------------------------------------------------------------------------------------------------------------
  // ฟังก์ชันหน้า Lobby
  // -------------------------------------------------------------------------------------------------------------------

  // ร้องขอรายชื่อผู้เล่นในห้อง
  socket.on("requestPlayerList", (roomId, callback) => {
    if (rooms[roomId].players) {
      callback(rooms[roomId].players);
    }
  });

  // ร้องขอข้อมูลห้อง (hostId, status, players)
  socket.on("requestRoomInfo", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      socket.emit("roomInfo", {
        roomId: roomId,
        hostId: room.hostId,
        status: room.status,
        players: room.players
      });
    } else {
      socket.emit("error", "ห้องนี้ไม่มีอยู่");
    }
  });

  socket.on("getRoomIdByPlayerId", (playerId, callback) => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const player = room.players.find((p) => p.id === playerId);
      if (player) {
        callback(roomId); // ส่ง roomId กลับไปยัง client
        return;
      }
    }
    callback(null); // ถ้าไม่พบ roomId ให้ส่งค่า null กลับไป
  });

  socket.on("getGameStatus", (roomId, callback) => {
    const room = rooms[roomId];
    if (room) {
      callback(room.status); // ส่งสถานะเกมกลับไปยัง client
    } else {
      callback(null); // ถ้าไม่พบห้อง ให้ส่งค่า null กลับไป
    }
  });

  // player หลุดออกจากห้อง (ปิด tab, หลุด)
  socket.on("disconnect", () => {
    console.log('discon:', socket.id)
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerWasHost = room.hostId && room.players.find(p => p.socketId === socket.id)?.id === room.hostId;

      // ลบผู้เล่นออก
      room.players = room.players.filter(player => player.socketId !== socket.id);

      // ถ้า host หาย และยังมีคนในห้อง
      if (playerWasHost && room.players.length > 0) {
        room.hostId = room.players[0].id; // มอบ host ให้คนแรกที่เหลืออยู่
        io.to(roomId).emit("hostChanged", room.hostId); // แจ้ง front ฝั่งอื่นให้รู้
      }

      // ส่ง playerList ใหม่
      io.to(roomId).emit("playerList", room.players);

      if (room.players.length === 0) {
        delete rooms[roomId];
      }
    }
  });

  socket.on("getStartTimestamp", (roomId, callback) => {
    const room = rooms[roomId];
    if (room) {
      callback(room.startTimestamp); // ส่ง startTimestamp กลับไปยัง client
    } else {
      callback(null); // ถ้าไม่พบห้อง ให้ส่งค่า null กลับไป
    }
  });

  // เริ่มเกม
  socket.on("startGame", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      if (room.status === "waiting") {
        room.status = "playing"; // อัปเดตสถานะห้องเป็น playing

        const startTimestamp = Date.now();
        room.startTimestamp = startTimestamp;

        io.to(roomId).emit("gameStarted", {
          status: room.status,
          startTimestamp: startTimestamp,
        }); // ส่งสถานะใหม่ไปยังผู้เล่นในห้อง
        console.log(`🎮 Game started in room: ${roomId}`);
      } else {
        socket.emit("error", "เกมเริ่มไปแล้วหรือสถานะไม่ถูกต้อง");
      }
    } else {
      socket.emit("error", "ห้องนี้ไม่มีอยู่");
    }
  });

  // -------------------------------------------------------------------------------------------------------------------
  // ฟังก์ชันหน้า Type
  // -------------------------------------------------------------------------------------------------------------------

  // อัปเดต WPM ของผู้เล่น
  socket.on("updateWpm", ({ roomId, playerId, wpm }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("error", "ไม่พบห้องที่ระบุ");
      return;
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      socket.emit("error", "ไม่พบผู้เล่นในห้องนี้");
      return;
    }

    player.wpm = wpm;
    io.to(roomId).emit("playerList", room.players);
  });

});

// เปิดเซิร์ฟเวอร์
server.listen(3001, () => {
  console.log("🚀 Server is running on port 3001");
});
