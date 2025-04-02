const dgram = require('dgram');
const server = dgram.createSocket('udp4');

const PORT = 41232; // Changed port to avoid conflict
const HOST = '0.0.0.0';

server.on('listening', () => {
    const address = server.address();
    console.log(`UDP Server listening on ${address.address}:${address.port}`);
})

server.on('message', (msg, rinfo) => {
    // msg: คือข้อมูลที่ได้รับมาในรูปแบบ Buffer
    // rinfo: คือข้อมูลเกี่ยวกับผู้ส่ง (remote info) เช่น IP Address และ Port
    console.log(`ได้รับข้อมูล ${msg.length} bytes จาก ${rinfo.address}:${rinfo.port}`);
  
    // --- สิ่งที่คุณทำได้กับ 'msg' (Buffer) ---
  
    // 1. แปลงเป็นข้อความ (ถ้าข้อมูลที่ส่งมาเป็น Text)
    try {
      const messageText = msg.toString('utf8'); // หรือ encoding อื่นๆ ที่เหมาะสม
      console.log(`ข้อความที่ได้รับ: "${messageText}"`);
  
      // ทำอย่างอื่นกับข้อความนี้ เช่น เก็บลงฐานข้อมูล, ประมวลผลต่อ ฯลฯ
  
      // ตัวอย่าง: ส่งข้อความตอบกลับไปยัง Client
      const responseMessage = Buffer.from(`เซิร์ฟเวอร์ได้รับข้อความของคุณแล้ว: "${messageText}"`);
      server.send(responseMessage, rinfo.port, rinfo.address, (err) => {
          if (err) {
              console.error('เกิดข้อผิดพลาดในการส่งข้อความตอบกลับ:', err);
          } else {
              console.log(`ส่งข้อความตอบกลับไปยัง ${rinfo.address}:${rinfo.port}`);
          }
      });
  
    } catch (e) {
        console.error('ไม่สามารถแปลงข้อมูลเป็น UTF-8 string ได้:', e);
        // อาจจะลองแปลงเป็น Hex string เพื่อดูข้อมูลดิบ
        console.log('ข้อมูลดิบ (Hex):', msg.toString('hex'));
    }
  
    // 2. ประมวลผลข้อมูลแบบ Binary (ถ้าไม่ใช่ Text)
    //    - อ่านค่าตัวเลข: msg.readInt8(offset), msg.readUInt16BE(offset), ...
    //    - ดูขนาด: msg.length
    //    - เข้าถึง Byte: msg[index]
    //    - ตัดข้อมูล: msg.slice(start, end)
    //    ตัวอย่าง: สมมติ 4 ไบต์แรกเป็น message ID (UInt32 Big Endian)
    //    if (msg.length >= 4) {
    //        const messageId = msg.readUInt32BE(0);
    //        const payload = msg.slice(4);
    //        console.log(`Message ID: ${messageId}`);
    //        console.log('Payload (Hex):', payload.toString('hex'));
    //    }
  
  });

server.bind(PORT, HOST);