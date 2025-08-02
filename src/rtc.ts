import { WebSocketServer, WebSocket } from "ws";

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


const broadcastToRoom = (roomId: string, message: any, excludedSocket?: WebSocket) => {
    const room = activeRoom.get(roomId)
    if(!room) return

    room.users.forEach(user => {
        if(excludedSocket && user.socket === excludedSocket ) return  //! will not sent the same messsage to me which i sent in a room

        if(user.socket.readyState === WebSocket.OPEN){
            user.socket.send(JSON.stringify(message))
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