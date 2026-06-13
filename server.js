const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = new Server(server,{
    cors:{
        origin:"*"
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/api/status",(req,res)=>{
    res.json({
        status:"online"
    });
});

io.on("connection",(socket)=>{

    console.log("User Connected");

    socket.on("join-chat",(room)=>{
        socket.join(room);
    });

    socket.on("send-message",(data)=>{
        io.to(data.room).emit("new-message",data);
    });

    socket.on("disconnect",()=>{
        console.log("User Disconnected");
    });

});

const PORT = process.env.PORT || 10000;

server.listen(PORT,()=>{
    console.log(`Server Running ${PORT}`);
});