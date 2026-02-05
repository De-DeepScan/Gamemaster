import { io } from "socket.io-client";

// GameMaster
// export const API_URL = "http://192.168.10.1:3000"; // ESD MAC
// export const API_URL = "http://192.168.1.46:3000"; // THOMAS HOME
export const API_URL = "http://10.14.73.40:3000"; // THOMAS ESD

export const socket = io(API_URL);
