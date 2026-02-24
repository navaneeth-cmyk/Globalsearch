import "dotenv/config";
import express from "express";
import cors from "cors";
import pool from "./db/postgres.js";
import { initializeSocket } from "./services/socket.js";

import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";
import coursesRoutes from "./routes/courses.routes.js";
import moduleRoutes from "./routes/module.routes.js";
import assignmentsRoutes from "./routes/assignments.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import studentCoursesRoutes from "./routes/studentCourses.routes.js";
import examRoutes from "./routes/exam.routes.js";
import studentExamRoutes from "./routes/studentExam.routes.js";

import uploadRoutes from "./routes/upload.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import groupsRoutes from "./routes/group.routes.js";
import practiceRoutes from "./routes/practice.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import http from "http";
import { Server } from "socket.io";
import { initChatTables, serveFile } from "./controllers/chat.controller.js";
import botRoutes from "./routes/bot.routes.js";
import reviewroutes from "./routes/reviews.routes.js";
import certificateRoutes from "./routes/certificate.routes.js";
import contestRoutes from "./routes/contest.routes.js";
import contestQuestionRoutes from "./routes/contestQuestion.routes.js";
import contestAdvancedRoutes from "./routes/contestAdvanced.routes.js";
import mocktestRoutes from "./routes/mocktest.routes.js";
import { router as admingroupsRoutes } from "./routes/admingroups.routes.js";

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const baseUrl = process.env.BACKEND_URL;
const allowedOrigins = ["http://localhost:5173", process.env.FRONTEND_URL];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});
global.io = io;

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api", moduleRoutes);
app.use("/api/assignments", assignmentsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/groups", groupsRoutes);
app.use("/api/student", studentCoursesRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/exam", examRoutes);
app.use("/api/student/exams", studentExamRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/practice", practiceRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/bot", botRoutes);
app.use("/api/reviews", reviewroutes);
app.use("/api/certificate", certificateRoutes);
app.use("/api/contests", contestRoutes);
app.use("/api/contests", contestQuestionRoutes);
app.use("/api/contests", contestAdvancedRoutes);
app.use("/api/mocktest", mocktestRoutes);
app.use("/api/admingroups", admingroupsRoutes);

app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

app.get("/api/chats/media/:id", serveFile);

const userSockets = new Map();

io.on("connection", (socket) => {
  console.log(`Socket Connected: ${socket.id}`);

  socket.on("join_user", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined room user_${userId}`);
  });

  socket.on("join_chat", (chatId) => {
    socket.join(`chat_${chatId}`);
    console.log(`Socket ${socket.id} joined chat_${chatId}`);
  });

  socket.on("join_group", (groupId) => {
    socket.join(`group_${groupId}`);
    console.log(`Socket ${socket.id} joined group_${groupId}`);
  });

  // ✅ FIXED: single clean send_message handler with callback
  socket.on("send_message", async (data, callback) => {
    const {
      chatId,
      groupId,
      text,
      senderId,
      senderUid,
      senderName,
      recipientId,
      attachment_file_id,
      attachment_type,
      attachment_name,
      reply_to_message_id,
    } = data;

    try {
      // ─── GROUP MESSAGES ───────────────────────────────────────────
      if (groupId) {
        const groupCheck = await pool.query(
          "SELECT 1 FROM admin_groups WHERE group_id = $1",
          [groupId]
        );
        const isAdminGroup = groupCheck.rows.length > 0;

        let result;

        if (isAdminGroup) {
          // Admin group → admin_group_messages table
          result = await pool.query(
            `INSERT INTO admin_group_messages (
                group_id, sender_id, text,
                attachment_file_id, attachment_type, attachment_name
             ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [
              groupId,
              senderId,
              text || "",
              attachment_file_id || null,
              attachment_type || null,
              attachment_name || null,
            ]
          );
        } else {
          // ✅ College group → messages table (where frontend reads from!)
          result = await pool.query(
            `INSERT INTO messages (
                group_id, sender_id, text,
                attachment_file_id, attachment_type, attachment_name,
                reply_to_message_id
             ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
              groupId,
              senderId,
              text || "",
              attachment_file_id || null,
              attachment_type || null,
              attachment_name || null,
              reply_to_message_id || null,
            ]
          );
        }

        const savedMsg = result.rows[0];
        console.log(`✅ ${isAdminGroup ? "Admin" : "College"} group message saved:`, savedMsg);

        const payload = {
          ...savedMsg,
          text: savedMsg.text ?? savedMsg.message ?? text ?? "",
          sender_uid: senderUid,
          sender_name: senderName,
          attachment_url: savedMsg.attachment_file_id
            ? `${baseUrl}/api/chats/media/${savedMsg.attachment_file_id}`
            : null,
        };

        // ✅ Send to all OTHER members in the room
        socket.broadcast.to(`group_${groupId}`).emit("receive_message", payload);

        // ✅ Confirm back to sender so temp message gets replaced with real one
        if (callback) callback(payload);

        // Notify all group members except sender
        const memberTable = isAdminGroup ? "admin_group_members" : "clg_group_members";
        const membersResult = await pool.query(
          `SELECT user_id FROM ${memberTable} WHERE group_id = $1 AND user_id != $2`,
          [groupId, senderId]
        );

        membersResult.rows.forEach((member) => {
          io.to(`user_${member.user_id}`).emit("new_notification", {
            group_id: groupId,
            sender_id: senderId,
            sender_name: senderName,
            text: text || "Sent an attachment",
            created_at: savedMsg.created_at,
          });
        });

        const groupTable = isAdminGroup ? "admin_groups" : "college_groups";
        await pool.query(
          `UPDATE ${groupTable} SET updated_at = NOW() WHERE group_id = $1`,
          [groupId]
        );

        console.log(`✅ ${isAdminGroup ? "Admin" : "College"} group message handling complete`);

      // ─── DM MESSAGES ─────────────────────────────────────────────
      } else if (chatId && recipientId) {
        const result = await pool.query(
          `INSERT INTO messages (
              chat_id, sender_id, receiver_id, text,
              attachment_file_id, attachment_type, attachment_name,
              reply_to_message_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            chatId,
            senderId,
            recipientId,
            text || "",
            attachment_file_id || null,
            attachment_type || null,
            attachment_name || null,
            reply_to_message_id || null,
          ]
        );
        const savedMsg = result.rows[0];
        console.log("✅ DM message saved to database:", savedMsg);

        const payload = {
          ...savedMsg,
          sender_uid: senderUid,
          sender_name: senderName,
          attachment_url: savedMsg.attachment_file_id
            ? `${baseUrl}/api/chats/media/${savedMsg.attachment_file_id}`
            : null,
        };

        // ✅ Send to recipient
        socket.broadcast.to(`chat_${chatId}`).emit("receive_message", payload);

        // ✅ Confirm back to sender so temp message gets replaced with real one
        if (callback) callback(payload);

        io.to(`user_${recipientId}`).emit("new_notification", {
          chat_id: chatId,
          sender_id: senderId,
          sender_name: senderName,
          text: text || "Sent an attachment",
          created_at: savedMsg.created_at,
        });

        await pool.query(
          "UPDATE chats SET updated_at = NOW() WHERE chat_id = $1",
          [chatId]
        );
        console.log("✅ DM message handling complete");
      }
    } catch (err) {
      console.error("❌ Socket Message Error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket Disconnected");
  });
});

app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

pool
  .query("SELECT NOW()")
  .then(async () => {
    console.log("✅ Database connected successfully");
    await initChatTables();
    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err.message);
    console.error("Please check your database credentials in .env");
    process.exit(1);
  });

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
});