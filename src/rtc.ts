import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({port: 8080})

interface User {
    socket: WebSocket,
    room: string,
    userName: string,
    joinedAt: Date,
    id: string
}

interface Room{
    id: string,
    users: User[],
    createdAt: Date,
    messageCount: number
}

let totalConnection = 0;
let allUsers: User[] = [];
let activeRoom: Map<string, Room> = new Map();

const generateUserId = ():string => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

const findUserBySocket = (socket:WebSocket): User | undefined => {
    return allUsers.find(user=> user.socket === socket)
}

const getOrCreateRoom = (roomId: string): Room | undefined => {

    if(!activeRoom.has(roomId)){ //! Here user will enter the "roomId", then  our if statment will check if this room id exists. and if room id not exist it will create the room. 
        activeRoom.set(roomId,{
            id: roomId,
            users: [],
            createdAt: new Date(),
            messageCount: 0
        })
        console.log(`Room created ${roomId}`);
    }
    return activeRoom.get(roomId)  //! If room id exist it will return the room id

}


function broadcastToRoom(roomId: string, message: any, excludeSocket?: WebSocket) {
    const room = activeRoom.get(roomId);
    if (!room) return;

    room.users.forEach(user => {
        // Skip the sender if excludeSocket is provided
        if (excludeSocket && user.socket === excludeSocket) return;
        
        // Only send if the socket is still open
        if (user.socket.readyState === WebSocket.OPEN) {
            user.socket.send(JSON.stringify(message));
        }
    });
}

const sendSystemMessage = (roomId: string, message: string, excludedSocket?: WebSocket) => {
    broadcastToRoom(roomId,{
        type: "system",
        message: message,
        timeStamp: Date.now().toString()
    }, excludedSocket)

}

const cleanUpUser = (socket:WebSocket) => {
    const user = findUserBySocket(socket)
    if(!user) return

//!Remove user form global list
    allUsers = allUsers.filter(u => u.socket !== socket)

//!Remove user form room list
    const room = activeRoom.get(user.room)
    if(room){
        room.users = room.users.filter(u => u.socket !== socket)
    }

    //!Notify user about a person DC
sendSystemMessage(user.room, `${user.userName} left the room`);

//! Delete room is no one is there

if(room?.users.length === 0){
    activeRoom.delete(user.room)
    console.log(`Removed empty room ${user.room}`)
}else{
    console.log(`${user.room} now has ${room?.users.length} users`);
}
console.log(`User ${user.userName} (${user.id}) disconnected. Total connections: ${allUsers.length}`);

}

//!websocket connection setup

//? Hoisting is a JavaScript mechanism where variable and function declarations are moved (hoisted) to the top of   their scope at compile time — before the code is executed.

wss.on("connection", (socket)=>{
    totalConnection++;
    const connectionId = generateUserId();
    console.log(`New connection established ID: ${connectionId} Total connection: ${totalConnection}`);
    

    socket.on("message", (rawMessage)=>{
        try {
            const parsedMessage = JSON.parse(rawMessage.toString())
            console.log(`Received message type: ${parsedMessage.type}`);

            switch(parsedMessage.type){
                case "join":
                    handleJoinRoom(socket, parsedMessage.payload, connectionId)
                    break;

                case "chat":
                    handleChatMessage(socket, parsedMessage.payload);
                    break;
                
                default:
                    console.log(`Unknown message type ${parsedMessage.type}`);
                    socket.send(JSON.stringify({
                        type: "error",
                        message: "Invalid message type"
                    }))
            }
        } catch (error) {
            console.log("PFailed to parse message or handle logic: ", error);
        }
    });


    socket.on('close', ()=>{
        cleanUpUser(socket)
    });

    socket.on('error', (error) => {
        console.error("WebSocket error:", error);
        cleanUpUser(socket);
    });
})

function handleJoinRoom(socket:WebSocket, payload:any, connectionId:string){
    const { roomId, userName } = payload

    if(!roomId || !userName){
        socket.send(JSON.stringify({
            type:"error",
            message: "Required both roomId and userName"
        }))
        return;
    }

    const existingUser = findUserBySocket(socket);
    if(existingUser){
        console.log(`User ${existingUser.userName} is switching rooms`);
        cleanUpUser(socket)
    }

    //!creating user object

    const newUser:User = {
        socket: socket, 
        room: roomId,
        userName: userName,
        joinedAt: new Date(),
        id: connectionId
    }

    allUsers.push(newUser)

    //*Get of create the room 
    const room = getOrCreateRoom(roomId);


    //*check for duplicate userName in a single room;

    const duplicateUser = room?.users.find(user=> user.userName === userName)

    if(duplicateUser){
        let count = 1;
        let newUserName = userName;

        while(room?.users.find(user => user.userName === newUserName)){
            count++;
            newUserName = `${newUserName} ${count}`
        }
        newUser.userName = newUserName

        socket.send(JSON.stringify({
            type: "system",
            message: `Username was changed to "${newUserName}" to avoid conflicts`
        }));
    }
    room?.users.push(newUser)

    console.log(`${newUser.userName} joined room "${roomId}". Room now has ${room?.users.length} users.`);

    // Send welcome message to the user
    socket.send(JSON.stringify({
        type: "system",
        message: `Welcome to room ${roomId}. ${room?.users.length} total users including you.`
    }));


     sendSystemMessage(roomId, `${newUser.userName} joined the room`, socket);

    // Send current room info to the new user
    const otherUsers = room?.users.filter(u => u.socket !== socket).map(u => u.userName);
    //@ts-ignore
    if (otherUsers.length > 0) {
        socket.send(JSON.stringify({
            type: "system",
            //@ts-ignore
            message: `Other users in room: ${otherUsers.join(", ")}`
        }));
    }
}

function handleChatMessage(socket:WebSocket, payload:any){
    const { message, sender }  = payload
    const user = findUserBySocket(socket)
        if (!user) {
        socket.send(JSON.stringify({
            type: "error",
            message: "You must join a room first"
        }));
        return;
    }

    if(!message || message.trim() === ""){
          socket.send(JSON.stringify({
            type: "error",
            message: "Message cannot be empty"
        }));
        return;
    }

    const room = activeRoom.get(user.room);
    if(room){
        room.messageCount++;
    }
    console.log(`${user.userName} in room "${user.room}": ${message}`);

    //!broadcast message to all user in room

    const chatMessage = {
        type: "chat",
        sender: user.userName,
        message: message.trim(),
        timeStamp: new Date().toISOString(),
        roomId: user.room
    };
    broadcastToRoom(user.room, chatMessage)
}

//?cleanup of inactive user

setInterval(()=>{
 let cleanedUp = 0;
 
 allUsers.forEach(user=> {
    if(user.socket.readyState !== WebSocket.OPEN){
        cleanUpUser(user.socket);
        cleanedUp++
    }
 });
 
    if (cleanedUp > 0) {
        console.log(`Cleaned up ${cleanedUp} inactive connections`);
    }

}, 30000);

// Log server statistics
setInterval(() => {
    console.log(`=== Server Statistics ===`);
    console.log(`Active connections: ${allUsers.length}`);
    console.log(`Active rooms: ${activeRoom.size}`);
    
    activeRoom.forEach((room, roomId) => {
        console.log(`  Room "${roomId}": ${room.users.length} users, ${room.messageCount} messages`);
    });
    console.log(`========================`);
}, 300000); // Log every 5 minutes

console.log("Enhanced Chat Server started on port 8080");
