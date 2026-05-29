import React, { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import toast from "react-hot-toast";

const SocketContext = createContext(null);

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const socketURL = import.meta.env.VITE_API_URL || "http://localhost:5000";
    const newSocket = io(socketURL);

    setSocket(newSocket);

    // Global Event Listeners for Toasts
    newSocket.on("task_created", (data) => {
      toast.success(`New task created: ${data.task.title}`);
    });

    newSocket.on("task_updated", (data) => {
      toast(`Task moved to ${data.transition}`, {
        icon: 'ℹ️',
      });
    });

    newSocket.on("task_escalated", (data) => {
      toast.error(`Task Escalated: ${data.task.title}`, {
        duration: 5000,
      });
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};
