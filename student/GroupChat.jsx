// src/pages/student/GroupChat.jsx
{/*import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/axios';
import { ArrowLeft, Users, Loader2, AlertCircle } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import ChatWindow from '../../components/chat/ChatWindow';
import '../../styles/Chat.css';

const GroupChat = () => {
  const { groupId } = useParams();
  const { socket, dbUser } = useSocket();

  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]); 

  // Fetch group details + messages
  useEffect(() => {
    const fetchGroupAndMessages = async () => {
      if (!groupId || !dbUser?.id) return;

      try {
        setLoading(true);
        setError(null);

        // 1. Fetch group info
        const groupRes = await api.get(`/api/admingroups/${groupId}`);
        setGroup(groupRes.data);

        // 2. Fetch messages
        const msgRes = await api.get(`/api/admingroups/${groupId}/messages`);
        setMessages(
          msgRes.data.map(msg => ({
            ...msg,
            isMyMessage: msg.sender_id === dbUser.id,
            senderName: msg.sender_name || 'Unknown',
          }))
        );
      } catch (err) {
        console.error('Failed to load group chat:', err);
        const msg = err.response?.data?.message || err.message || 'Failed to load group';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchGroupAndMessages();
  }, [groupId, dbUser?.id]);

  // Real-time: Join group room + listen for new messages
  useEffect(() => {
    if (!socket || !groupId) return;
    console.log('[Student] Joining group room:', groupId);
    socket.emit('join_group', groupId);

    const handleNewMessage = (newMsg) => {
      setMessages(prev => [...prev, {
        ...newMsg,
        isMyMessage: newMsg.sender_id === dbUser?.id,
        senderName: newMsg.sender_name || 'Unknown',
      }]);
    };

    socket.on('group_message', handleNewMessage);

    return () => {
      socket.emit('leave_group', groupId);
      socket.off('group_message', handleNewMessage);
    };
  }, [socket, groupId, dbUser?.id]);

  // Send message handler
  const handleSendMessage = async (text, file = null) => {
  if (!text.trim() && !file) return;

  // Handle file upload
  let attachmentFileId = null;
  let attachmentName = null;
  let attachmentType = null;
  let attachmentUrl = null;

  if (file) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/api/chats/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
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

  const payload = {
    groupId,
    text: text.trim(),
    senderId: dbUser.id,
    senderUid: dbUser.firebase_uid,
    senderName: dbUser.full_name || 'You',
    attachment_file_id: attachmentFileId,
    attachment_name: attachmentName,
    attachment_type: attachmentType,
  };

  // Optimistic UI
  setMessages(prev => [...prev, {
    ...payload,
    message_id: `temp-${Date.now()}`,
    created_at: new Date().toISOString(),
    sender_id: dbUser.id,
    sender_name: payload.senderName,
    isMyMessage: true,
    attachment_url: attachmentUrl,
  }]);

  // Emit to backend
  if (socket) {
    console.log('[Student Socket] Emitting send_message with groupId', payload);
    socket.emit('send_message', payload);
  } else {
    console.warn('[Student Socket] Socket not ready');
  }
};

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading group chat...</p>
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-semibold text-gray-800 mb-3">
          {error || 'Group not found'}
        </h2>
        <p className="text-gray-600 mb-8 max-w-md">
          This group may have been deleted or you no longer have access.
        </p>
        <Link
          to="/student/groups"
          className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
        >
          Back to My Groups
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            to="/student/groups" 
            className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{group.name}</h2>
            <p className="text-sm text-gray-600 flex items-center gap-2">
              <Users size={14} />
              {group.member_count || '...'} members
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ChatWindow
          activeChat={{
            id: groupId,
            type: 'group',
            name: group.name,
            recipientName: group.name,
            member_count: group.member_count || 0,
            groupType: 'admin',
            // Add more props if ChatWindow uses them (description, avatar, etc.)
          }}
          messages={messages}
          onSendMessage={handleSendMessage}
          loadingMessages={false}
        />
      </div>

      <div ref={messagesEndRef} />
    </div>
  );
};

export default GroupChat*/}

// src/pages/student/GroupChat.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/axios';
import { ArrowLeft, Users, Loader2, AlertCircle } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import ChatWindow from '../../components/chat/ChatWindow';
import '../../styles/Chat.css';

const GroupChat = () => {
  const { groupId } = useParams();
  const { socket, dbUser } = useSocket();

  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch group + messages
  useEffect(() => {
    const fetchGroupAndMessages = async () => {
      if (!groupId || !dbUser?.id) return;

      try {
        setLoading(true);
        setError(null);

        const groupRes = await api.get(`/api/admingroups/${groupId}`);
        setGroup(groupRes.data);

        const msgRes = await api.get(`/api/admingroups/${groupId}/messages`);
        setMessages(
          msgRes.data.map(msg => ({
            ...msg,
            isMyMessage: msg.sender_id === dbUser.id,
            senderName: msg.sender_name || 'Unknown',
          }))
        );
      } catch (err) {
        console.error(err);
        setError('Failed to load group chat');
      } finally {
        setLoading(false);
      }
    };

    fetchGroupAndMessages();
  }, [groupId, dbUser?.id]);

  // Socket join + listen
  useEffect(() => {
    if (!socket || !groupId) return;

    socket.emit('join_group', groupId);

    const handleNewMessage = (msg) => {
      setMessages(prev => [
        ...prev,
        {
          ...msg,
          isMyMessage: msg.sender_id === dbUser?.id,
          senderName: msg.sender_name || 'Unknown',
        },
      ]);
    };

    socket.on('group_message', handleNewMessage);

    return () => {
      socket.emit('leave_group', groupId);
      socket.off('group_message', handleNewMessage);
    };
  }, [socket, groupId, dbUser?.id]);

  // Send message
  const handleSendMessage = async (text, file = null) => {
    if (!text.trim() && !file) return;

    let attachmentFileId = null;
    let attachmentName = null;
    let attachmentType = null;
    let attachmentUrl = null;

    if (file) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/api/chats/upload', formData);
        attachmentFileId = res.data.file_id;
        attachmentName = file.name;
        attachmentType = file.type;
        attachmentUrl = URL.createObjectURL(file);
      } catch {
        alert('File upload failed');
        return;
      }
    }

    const payload = {
      groupId,
      text: text.trim(),
      senderId: dbUser.id,
      senderUid: dbUser.firebase_uid,
      senderName: dbUser.full_name || 'You',
      attachment_file_id: attachmentFileId,
      attachment_name: attachmentName,
      attachment_type: attachmentType,
    };

    // Optimistic UI
    setMessages(prev => [
      ...prev,
      {
        ...payload,
        message_id: `temp-${Date.now()}`,
        created_at: new Date().toISOString(),
        sender_id: dbUser.id,
        sender_name: payload.senderName,
        isMyMessage: true,
        attachment_url: attachmentUrl,
      },
    ]);

    socket?.emit('send_message', payload);
  };

  // ── STATES ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="chat-container no-chat-selected">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="chat-container no-chat-selected">
        <AlertCircle size={40} />
        <p>{error || 'Group not found'}</p>
        <Link to="/student/groups">Back to groups</Link>
      </div>
    );
  }

  // ── MAIN UI ─────────────────────────────────────────────

  return (
    <div className="student-chat-page p-4 bg-slate-50/20 min-h-screen">
      {/* Back Button */}
      <div className="mb-4">
        <Link 
          to="/student/groups" 
          className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-lg hover:bg-gray-50 transition-colors text-gray-700 shadow-sm border border-gray-200"
        >
          <ArrowLeft size={18} />
          <span className="font-medium">Back to Groups</span>
        </Link>
      </div>

      {/* Chat Container - matches StudentChat.jsx structure */}
      <div className="chat-container">
        <ChatWindow
          activeChat={{
            id: groupId,
            type: 'group',
            name: group.name,
            recipientName: group.name,
            member_count: group.member_count || 0,
          }}
          messages={messages}
          onSendMessage={handleSendMessage}
          loadingMessages={false}
        />
      </div>

      <div ref={messagesEndRef} />
    </div>
  );
};

export default GroupChat;
