/* eslint-disable no-unused-vars */
// src/pages/admin/AdminChat.jsx
import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../auth/AuthContext';
import ChatList from '../../components/chat/ChatList';
import ChatWindow from '../../components/chat/ChatWindow';
import { Search, X } from 'lucide-react';
import '../../styles/Chat.css';

const AdminChat = () => {
    const { socket, dbUser, unreadCounts, handleSetActiveChat, markChatRead } = useSocket();
    const { userRole } = useAuth();
    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    
    // Search states
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);

    // Fetch existing chats + all available students
    useEffect(() => {
        const fetchData = async () => {
            try {
                // Existing chats
                const chatsRes = await api.get('/api/chats');
                const existing = chatsRes.data.map(c => ({
                    id: c.chat_id,
                    recipientName: c.recipient_name,
                    recipientId: c.recipient_id,
                    lastMessage: c.last_message || 'No messages yet',
                    unread: c.unread_count,
                    exists: true
                }));

                // All students
                const studentsRes = await api.get('/api/chats/available-students'); // reuse same endpoint
                const allStudents = studentsRes.data;

                // Merge: chats + students without chat yet
                const merged = [...existing];
                allStudents.forEach(student => {
                    if (!existing.some(c => c.recipientId === student.user_id)) {
                        merged.push({
                            id: `new_${student.user_id}`,
                            recipientName: student.full_name,
                            recipientId: student.user_id,
                            lastMessage: 'Start a conversation',
                            unread: 0,
                            exists: false
                        });
                    }
                });

                setChats(merged);
            } catch (err) {
                console.error("Admin chat init error:", err);
            }
        };

        fetchData();
    }, [unreadCounts]);

    // Refresh list on new notification (same as instructor)
    useEffect(() => {
        if (!socket) return;
        const refresh = async () => { /* same logic as in InstructorChat */ };
        socket.on('new_notification', refresh);
        return () => socket.off('new_notification', refresh);
    }, [socket]);

    // Receive message (same as instructor)
    useEffect(() => {
        if (!socket) return;
        const onReceive = (msg) => {
            if (activeChat?.id === msg.chat_id) {
                setMessages(prev => [...prev, {
                    ...msg,
                    isMyMessage: msg.sender_id === dbUser?.id
                }]);
                api.put('/api/chats/read', { chatId: msg.chat_id });
            }
        };
        socket.on('receive_message', onReceive);
        return () => socket.off('receive_message', onReceive);
    }, [socket, activeChat, dbUser]);

    // Select chat & create if new (same logic)
    const handleSelectChat = async (chat) => {
        handleSetActiveChat(chat.id);
        markChatRead(chat.id);

        let chatId = chat.id;

        // If new chat, create it first
        if (!chat.exists) {
            try {
                const res = await api.post('/api/chats', { recipientId: chat.recipientId });
                chatId = res.data.chat_id;
                chat.id = chatId;
                chat.exists = true;
            } catch (err) {
                console.error("Create chat error:", err);
                return;
            }
        }

        setActiveChat(chat);
        socket.emit('join_chat', chatId);

        setLoadingMessages(true);
        try {
            const res = await api.get(`/api/chats/messages/${chatId}`);
            const uiMessages = res.data.map(m => ({
                ...m,
                isMyMessage: m.sender_id === dbUser?.id
            }));
            setMessages(uiMessages);
            await api.put('/api/chats/read', { chatId: chatId });
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingMessages(false);
        }
    };

    // Send message (same logic)
    const handleSendMessage = async (text, file) => {
  console.log('[SEND DEBUG] handleSendMessage called', { text, file, activeChat });

  if (!socket) {
    console.error('[SEND DEBUG] socket is null or undefined!');
    alert('Chat connection not ready. Please refresh.');
    return;
  }

  if (!activeChat?.id) {
    console.error('[SEND DEBUG] No active chat selected');
    return;
  }

  console.log('[SEND DEBUG] Emitting send_message with chatId:', activeChat.id);

  // Handle file upload
  let attachmentFileId = null;
  let attachmentName = null;
  let attachmentType = null;
  let attachmentUrl = null;

  if (file) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/chats/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      attachmentFileId = res.data.file_id;
      attachmentName = file.name;
      attachmentType = file.type;
      attachmentUrl = URL.createObjectURL(file);
    } catch (err) {
      console.error("Upload failed:", err);
      alert('Failed to upload file');
      return;
    }
  }

  // Optimistic UI
  setMessages(prev => [...prev, {
    message_id: Date.now(),
    text,
    isMyMessage: true,
    created_at: new Date().toISOString(),
    attachment_file_id: attachmentFileId,
    attachment_name: attachmentName,
    attachment_type: attachmentType,
    attachment_url: attachmentUrl
  }]);

  socket.emit('send_message', {
    chatId: activeChat.id,
    text,
    senderId: dbUser?.id,
    senderUid: dbUser?.firebase_uid,
    senderName: dbUser?.fullName,
    recipientId: activeChat.recipientId,
    attachment_file_id: attachmentFileId,
    attachment_type: attachmentType,
    attachment_name: attachmentName,
  });

  console.log('[SEND DEBUG] emit("send_message") was called');
};

    // Search messages handler
    const handleSearchMessages = async (query) => {
        setSearchQuery(query);
        if (!query.trim()) {
            setSearchResults([]);
            setShowSearchResults(false);
            return;
        }

        setSearchLoading(true);
        setShowSearchResults(true);
        try {
            const res = await api.get("/api/chats/search", { params: { query } });
            setSearchResults(res.data || []);
        } catch (err) {
            console.error("Search error:", err);
            setSearchResults([]);
        } finally {
            setSearchLoading(false);
        }
    };

    // Open chat from search result
    const handleSelectSearchResult = async (result) => {
        try {
            let chat;
            if (result.type === "dm") {
                // Find or create chat
                let existingChat = chats.find((c) => c.id === result.chat_id);
                if (!existingChat) {
                    existingChat = {
                        id: result.chat_id,
                        recipientName: result.other_user_name,
                        recipientId: result.sender_id === dbUser?.id ? result.receiver_id : result.sender_id,
                        exists: true,
                    };
                }
                chat = existingChat;
            } else {
                // This shouldn't happen for admin, but handle it
                return;
            }

            // Close search
            setShowSearchResults(false);
            setSearchQuery("");
            setSearchResults([]);

            // Handle select chat
            await handleSelectChat(chat);
        } catch (err) {
            console.error("Error selecting search result:", err);
        }
    };

    return (
        <div className="admin-chat-page p-4">
            <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">
                        Messages
                    </h2>
                    <p className="text-slate-500 text-sm font-medium">
                        Connect with students
                    </p>
                </div>
                
                <div className="flex flex-col gap-3 items-end">
                    {/* Search Bar */}
                    <div className="relative w-64">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search messages..."
                                value={searchQuery}
                                onChange={(e) => handleSearchMessages(e.target.value)}
                                className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => {
                                        setSearchQuery("");
                                        setSearchResults([]);
                                        setShowSearchResults(false);
                                    }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                        
                        {/* Search Results Dropdown */}
                        {showSearchResults && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                                {searchLoading ? (
                                    <div className="p-4 text-center text-slate-500">
                                        <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-indigo-500 border-t-transparent"></div>
                                    </div>
                                ) : searchResults.length === 0 ? (
                                    <div className="p-4 text-center text-slate-500 text-sm">
                                        No messages found
                                    </div>
                                ) : (
                                    searchResults.map((result) => (
                                        <button
                                            key={result.message_id}
                                            onClick={() => handleSelectSearchResult(result)}
                                            className="w-full px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 text-left transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-semibold text-slate-800 text-sm truncate">
                                                            {result.other_user_name}
                                                        </span>
                                                        <span className="text-xs text-slate-400 whitespace-nowrap">
                                                            {result.display_time}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-slate-600 line-clamp-2">
                                                        {result.message_text}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1">
                                                {result.display_date}
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="chat-container">
                <ChatList
                    chats={chats}
                    activeChat={activeChat}
                    onSelectChat={handleSelectChat}
                    unreadCounts={unreadCounts}
                />
                <ChatWindow
                    activeChat={activeChat}
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    loadingMessages={loadingMessages}
                />
            </div>
        </div>
    );
};

export default AdminChat;