import net from 'net';
import { WebSocketServer } from 'ws';

// C++アプリとの接続を保持する変数
let cppSocket = null;

// 1. TCPサーバー (C++アプリ用: Port 4000)
const tcpServer = net.createServer((socket) => {
    console.log('C++ App connected');
    cppSocket = socket;

    socket.on('close', () => {
        console.log('C++ App disconnected');
        cppSocket = null;
    });

    socket.on('error', (err) => {
        console.error('TCP Error:', err);
    });
});

tcpServer.listen(4000, () => {
    console.log('TCP Server running on port 4000');
});

// 2. WebSocketサーバー (ブラウザ ptz.js用: Port 8080)
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
    console.log('Browser connected');

    ws.on('message', (message) => {
        // ブラウザから受け取ったデータ
        const msgStr = message.toString();
        console.log('Received from Browser:', msgStr);

        // C++アプリがつながっていれば転送
        if (cppSocket) {
            cppSocket.write(msgStr);
        }
    });
});