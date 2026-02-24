/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from "react";
import api from "../../api/axios";
import { useSocket } from "../../context/SocketContext";
import { useAuth } from "../../auth/AuthContext";
import ChatList from "../../components/chat/ChatList";
import ChatWindow from "../../components/chat/ChatWindow";
import { Users, Search, X } from "lucide-react";
import "../../styles/Chat.css";

const StudentChat = () => {
  const { socket, dbUser, unreadCounts, handleSetActiveChat, markChatRead } =
    useSocket();
  const { userRole } = useAuth();
  const [chats, setChats] = useState([]);
  const [groups, setGroups] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [activeTab, setActiveTab] = useState("dm");
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");

  // Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Fetch Data
  const fetchData = async () => {
    try {
      if (activeTab === "dm") {
        const chatsRes = await api.get("/api/chats");
        console.log("📥 Fetched chats:", chatsRes.data);
        const existingChats = chatsRes.data.map((c) => ({
          id: c.chat_id,
          name: c.recipient_name,
          recipientId: c.recipient_id,
          lastMessage: c.last_message || "No messages yet",
          unread: c.unread_count,
          exists: true,
          type: "dm",
        }));

        console.log("📥 Fetching available instructors...");
        const instructorsRes = await api.get("/api/chats/available-instructors");
        console.log("📥 Available instructors response:", instructorsRes.data);
        const allInstructors = instructorsRes.data || [];
        console.log(`📥 Found ${allInstructors.length} instructors`);

        const mergedChats = [...existingChats];
        allInstructors.forEach((instructor) => {
          const alreadyExists = existingChats.some(
            (c) => c.recipientId === instructor.user_id,
          );
          if (!alreadyExists) {
            mergedChats.push({
              id: `new_${instructor.user_id}`,
              name: instructor.full_name,
              recipientId: instructor.user_id,
              lastMessage: "Start a conversation",
              unread: 0,
              exists: false,
              type: "dm",
            });
          }
        });
        setChats(mergedChats);
      } else if (activeTab === "groups") {
        console.log("📥 Fetching my groups...");
        const groupsRes = await api.get("/api/chats/groups/my");
        console.log("📥 Fetched groups raw:", groupsRes.data);
        const groupsData = Array.isArray(groupsRes.data) ? groupsRes.data : [];
        console.log("📥 Groups array:", groupsData);
        setGroups(
          groupsData.map((g) => ({
            id: g.group_id,
            name: g.name,
            description: g.description,
            meeting_link: g.meeting_link,
            creator_id: g.creator_id,
            created_at: g.created_at,
            member_count: g.member_count,
            lastMessage: g.last_message || "No messages yet",
            unread: 0,
            exists: true,
            type: "group",
            groupType: "student",
          })),
        );
      } else if (activeTab === "discover") {
        console.log("📥 Fetching available groups...");
        const discoverRes = await api.get("/api/chats/groups/available");
        console.log("📥 Fetched available groups:", discoverRes.data);
        setAvailableGroups(discoverRes.data);
      }
    } catch (err) {
      console.error("❌ Fetch Student Chat Error:", {
        status: err.response?.status,
        message: err.response?.data?.message,
        error: err.message,
        fullError: err,
      });
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  useEffect(() => {
    // unreadCounts update - UI only
  }, [unreadCounts]);

  // Handle Message Receive
  useEffect(() => {
    if (!socket) return;
    const handleReceive = (msg) => {
      if (
        activeChat &&
        (msg.chat_id === activeChat.id || msg.group_id === activeChat.id)
      ) {
        setMessages((prev) => [
          ...prev,
          {
            ...msg,
            isMyMessage: msg.sender_id === dbUser?.id,
          },
        ]);
        if (msg.chat_id) api.put("/api/chats/read", { chatId: msg.chat_id });
      }
    };
    socket.on("receive_message", handleReceive);
    return () => socket.off("receive_message", handleReceive);
  }, [socket, activeChat, dbUser]);

  // Handle Edit/Delete Messages
  useEffect(() => {
    if (!socket) return;

    const handleEdit = (msg) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === msg.message_id
            ? { ...m, ...msg, isMyMessage: m.isMyMessage }
            : m,
        ),
      );
    };

    const handleDelete = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === messageId
            ? {
                ...m,
                is_deleted: true,
                text: "This message was deleted",
                attachment_file_id: null,
                attachment_url: null,
              }
            : m,
        ),
      );
    };

    socket.on("edit_message", handleEdit);
    socket.on("delete_message", handleDelete);

    return () => {
      socket.off("edit_message", handleEdit);
      socket.off("delete_message", handleDelete);
    };
  }, [socket]);

  // Select Chat
  const handleSelectChat = async (chat) => {
    let chatId = chat.id;

    if (chat.type === "dm") {
      handleSetActiveChat(chat.id);
      markChatRead(chat.id);
      if (!chat.exists) {
        try {
          const res = await api.post("/api/chats", {
            recipientId: chat.recipientId,
          });
          chatId = res.data.chat_id;
          chat.id = chatId;
          chat.exists = true;
        } catch (err) {
          console.error("Create chat error:", err);
          return;
        }
      }
      socket.emit("join_chat", chatId);
    } else {
      socket.emit(
        chat.groupType === "admin" ? "join_admin_group" : "join_group",
        chatId,
      );
    }
    setActiveChat(chat);
    setLoadingMessages(true);
    try {
      const url =
        chat.type === "dm"
          ? `/api/chats/messages/${chatId}`
          : chat.groupType === "admin"
            ? `/api/admingroups/${chatId}/messages`
            : `/api/chats/groups/${chatId}/messages`;
      const res = await api.get(url);
      setMessages(
        res.data.map((m) => ({
          ...m,
          isMyMessage: m.sender_id === dbUser?.id,
        })),
      );
      if (chat.type === "dm")
        await api.put("/api/chats/read", { chatId: chatId });
    } finally {
      setLoadingMessages(false);
    }
  };

  // Listen for meeting link and group updates
  useEffect(() => {
    if (!socket) return;

    const handleMeetingUpdate = (data) => {
      const { groupId, meetingLink } = data;
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId || g.group_id === groupId
            ? { ...g, meeting_link: meetingLink }
            : g,
        ),
      );
      setActiveChat((prev) => {
        if (prev?.id === groupId || prev?.group_id === groupId) {
          return { ...prev, meeting_link: meetingLink };
        }
        return prev;
      });
    };

    const handleGroupUpdate = (updatedGroup) => {
      const groupId = updatedGroup.group_id;
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId || g.group_id === groupId
            ? { ...g, ...updatedGroup }
            : g,
        ),
      );
      setActiveChat((prev) => {
        if (prev?.id === groupId || prev?.group_id === groupId) {
          return { ...prev, ...updatedGroup };
        }
        return prev;
      });
    };

    const handleRemovedFromGroup = ({ groupId }) => {
      setGroups((prev) =>
        prev.filter((g) => g.id !== groupId && g.group_id !== groupId),
      );
      setActiveChat((prev) =>
        prev?.id === groupId || prev?.group_id === groupId ? null : prev,
      );
      alert("You have been removed from the group.");
    };

    const handleReactionUpdated = ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => (m.message_id === messageId ? { ...m, reactions } : m)),
      );
    };

    const handleGroupDeleted = ({ groupId }) => {
      setGroups((prev) =>
        prev.filter((g) => g.id !== groupId && g.group_id !== groupId),
      );
      setActiveChat((prev) =>
        prev?.id === groupId || prev?.group_id === groupId ? null : prev,
      );
    };

    socket.on("meeting_link_updated", handleMeetingUpdate);
    socket.on("group_updated", handleGroupUpdate);
    socket.on("group_deleted", handleGroupDeleted);
    socket.on("removed_from_group", handleRemovedFromGroup);
    socket.on("message_reaction_updated", handleReactionUpdated);

    return () => {
      socket.off("meeting_link_updated", handleMeetingUpdate);
      socket.off("group_updated", handleGroupUpdate);
      socket.off("group_deleted", handleGroupDeleted);
      socket.off("removed_from_group", handleRemovedFromGroup);
      socket.off("message_reaction_updated", handleReactionUpdated);
    };
  }, [socket]);

  const handleSendMessage = async (text, file, replyToId = null) => {
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
        return;
      }
    }

    const tempId = Date.now();
    const parentMsg = replyToId
      ? messages.find((m) => m.message_id === replyToId)
      : null;

    setMessages((prev) => [
      ...prev,
      {
        message_id: tempId,
        text,
        isMyMessage: true,
        created_at: new Date().toISOString(),
        attachment_file_id: attachmentFileId,
        attachment_name: attachmentName,
        attachment_type: attachmentType,
        attachment_url: attachmentUrl,
        reply_to_message_id: replyToId,
        parent_message_text: parentMsg?.text,
        parent_message_sender_name: parentMsg?.sender_name,
      },
    ]);

    const payload = {
      text,
      senderId: dbUser.id,
      senderUid: dbUser.firebase_uid,
      senderName: dbUser.displayName || dbUser.fullName || "Student",
      attachment_file_id: attachmentFileId,
      attachment_name: attachmentName,
      attachment_type: attachmentType,
      reply_to_message_id: replyToId,
    };

    if (activeChat.type === "dm") {
      payload.chatId = activeChat.id;
      payload.recipientId = activeChat.recipientId;
    } else {
      payload.groupId = activeChat.id;
      payload.groupType = activeChat.groupType || "student";
    }

    socket.emit("send_message", payload, (serverMsg) => {
      if (serverMsg) {
        setMessages((prev) =>
          prev.map((m) =>
            m.message_id === tempId ? { ...serverMsg, isMyMessage: true } : m,
          ),
        );
      }
    });
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      console.log("📝 Creating group:", { name: newGroupName, description: newGroupDesc });
      const res = await api.post("/api/chats/groups", {
        name: newGroupName,
        description: newGroupDesc,
      });
      console.log("✅ Group created:", res.data);
      setShowCreateGroup(false);
      setNewGroupName("");
      setNewGroupDesc("");
      setActiveTab("groups");
      fetchData();
    } catch (err) {
      console.error("❌ Create group error:", {
        status: err.response?.status,
        message: err.response?.data?.message,
        fullError: err.message,
        response: err.response?.data,
      });
      alert(err.response?.data?.message || err.message || "Failed to create group");
    }
  };

  const handleJoinGroup = async (groupId) => {
    try {
      await api.post(`/api/chats/groups/${groupId}/join`);
      setActiveTab("groups");
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to join group");
    }
  };

  const handleEditMessage = async (messageId, newText) => {
    try {
      await api.put(`/api/chats/messages/${messageId}`, { text: newText });
    } catch (err) {
      console.error("Edit failed", err);
      alert("Failed to edit message");
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      if (!window.confirm("Are you sure you want to delete this message?")) return;
      await api.delete(`/api/chats/messages/${messageId}`);
    } catch (err) {
      console.error("Delete failed", err);
      alert("Failed to delete message");
    }
  };

  const handleLeaveGroup = (groupId) => {
    setGroups((prev) =>
      prev.filter((g) => g.id !== groupId && g.group_id !== groupId),
    );
    if (activeChat?.id === groupId || activeChat?.group_id === groupId) {
      setActiveChat(null);
    }
  };

  const handleDeleteGroup = (groupId) => {
    setGroups((prev) =>
      prev.filter((g) => g.id !== groupId && g.group_id !== groupId),
    );
    if (activeChat?.id === groupId || activeChat?.group_id === groupId) {
      setActiveChat(null);
    }
  };

  const handleReact = async (messageId, emoji) => {
    try {
      const res = await api.post(`/api/chats/messages/${messageId}/react`, { emoji });
      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === messageId ? { ...m, reactions: res.data.reactions } : m,
        ),
      );
    } catch (err) {
      alert("Failed to react");
    }
  };

  const handleRemoveReaction = async (messageId) => {
    try {
      const res = await api.delete(`/api/chats/messages/${messageId}/react`);
      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === messageId ? { ...m, reactions: res.data.reactions } : m,
        ),
      );
    } catch (err) {
      alert("Failed to remove reaction");
    }
  };

  // ✅ FIXED: Single API call - backend already searches both DMs and groups
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
      const results = Array.isArray(res.data) ? res.data : [];
      setSearchResults(results);
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
        let existingChat = chats.find((c) => c.id === result.chat_id);
        if (!existingChat) {
          existingChat = {
            id: result.chat_id,
            name: result.other_user_name,
            recipientId:
              result.sender_id === dbUser?.id
                ? result.receiver_id
                : result.sender_id,
            exists: true,
            type: "dm",
          };
        }
        chat = existingChat;
        setActiveTab("dm");
      } else {
        let existingGroup = groups.find((g) => g.id === result.group_id);
        if (!existingGroup) {
          existingGroup = {
            id: result.group_id,
            name: result.group_name,
            type: "group",
            groupType: "student",
          };
        }
        chat = existingGroup;
        setActiveTab("groups");
      }

      setShowSearchResults(false);
      setSearchQuery("");
      setSearchResults([]);

      await handleSelectChat(chat);
    } catch (err) {
      console.error("Error selecting search result:", err);
    }
  };

  return (
    <div className="student-chat-page p-6 bg-slate-50/20 min-h-full">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8 gap-8">
        <div className="flex-1">
          <h2 className="text-4xl font-extrabold text-slate-800 tracking-tight mb-2">
            Messages & Groups
          </h2>
          <p className="text-slate-500 text-base font-medium">
            Connect with instructors and {dbUser?.college || "college"} peers
          </p>
        </div>
        <div className="flex flex-col gap-4 items-start lg:items-end w-full lg:w-auto">
          {/* Search Bar */}
          <div className="relative w-full lg:w-72">
            <div className="relative">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => handleSearchMessages(e.target.value)}
                className="w-full pl-12 pr-10 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
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
                  searchResults.map((result, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectSearchResult(result)}
                      className="w-full px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 text-left transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {/* ✅ Group name or DM user name as title */}
                            <span className="font-semibold text-slate-800 text-sm truncate">
                              {result.type === "group"
                                ? result.group_name
                                : result.other_user_name}
                            </span>
                            <span className="text-xs text-slate-400 whitespace-nowrap">
                              {result.display_time ||
                                new Date(result.created_at).toLocaleTimeString(
                                  "en-US",
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                            </span>
                          </div>
                          {/* ✅ Show sender name - for groups show sender, for DMs show "You" or sender */}
                          {result.type === "group" && (
                            <p className="text-xs text-indigo-500 font-medium mb-0.5">
                              {result.sender_name}
                            </p>
                          )}
                          {result.type === "dm" && result.sender_name && (
                            <p className="text-xs text-slate-400 font-medium mb-0.5">
                              {result.sender_id === dbUser?.id ? "You" : result.sender_name}
                            </p>
                      )}
                          <p className="text-sm text-slate-600 line-clamp-2">
                            {result.message_text || result.text}
                          </p>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {result.display_date ||
                          new Date(result.created_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Tab Buttons */}
          <div className="flex bg-white shadow-sm border border-slate-200 p-1.5 rounded-[20px] gap-1 w-full lg:w-auto">
            <button
              className={`flex-1 lg:flex-none px-6 py-2.5 rounded-[14px] text-sm font-bold transition-all whitespace-nowrap ${activeTab === "dm" ? "bg-primary-900 text-white shadow-lg shadow-blue-900/20" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setActiveTab("dm")}
            >
              Direct Messages
            </button>
            <button
              className={`flex-1 lg:flex-none px-6 py-2.5 rounded-[14px] text-sm font-bold transition-all whitespace-nowrap ${activeTab === "groups" ? "bg-primary-900 text-white shadow-lg shadow-blue-900/20" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setActiveTab("groups")}
            >
              Study Groups
            </button>
            <button
              className={`flex-1 lg:flex-none px-6 py-2.5 rounded-[14px] text-sm font-bold transition-all whitespace-nowrap ${activeTab === "discover" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setActiveTab("discover")}
            >
              Explore Groups
            </button>
          </div>
        </div>
      </div>

      <div className="chat-container">
        {activeTab === "discover" ? (
          <div className="discover-groups p-8 bg-white border border-slate-200 w-full h-full overflow-y-auto rounded-lg shadow-sm flex flex-col">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 bg-indigo-600/10 text-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Users size={28} />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-extrabold text-slate-800">
                  Explore Peer Groups
                </h3>
                <p className="text-slate-500 font-medium text-sm mt-1">
                  Available Study Groups for{" "}
                  <span className="text-indigo-600 font-bold">
                    {dbUser?.college || "your college"}
                  </span>{" "}
                  students.
                </p>
              </div>
            </div>

            {!dbUser?.college && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 p-6 rounded-2xl mb-8 flex items-center gap-4">
                <span className="text-4xl">🎓</span>
                <div>
                  <h4 className="font-bold text-lg">
                    College Information Required
                  </h4>
                  <p className="text-sm opacity-90 font-medium">
                    Please set your college name in{" "}
                    <strong>Profile Settings</strong> to discover and join peer
                    groups.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1">
              {availableGroups.map((group) => (
                <div
                  key={group.group_id}
                  className="group-card-premium bg-slate-50 border border-slate-100 p-6 rounded-2xl flex flex-col items-center text-center hover:bg-white hover:shadow-lg hover:border-indigo-200 transition-all group h-full"
                >
                  <div className="w-20 h-20 bg-white shadow text-indigo-600 rounded-xl flex items-center justify-center text-3xl font-black mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all transform group-hover:scale-110">
                    {group.name[0]}
                  </div>
                  <h4 className="text-lg font-extrabold text-slate-800 mb-2 line-clamp-2">
                    {group.name}
                  </h4>
                  <p className="text-slate-500 text-sm font-medium mb-6 line-clamp-3 leading-relaxed flex-1">
                    {group.description ||
                      "Interactive study group for same-college students."}
                  </p>
                  <button
                    onClick={() => handleJoinGroup(group.group_id)}
                    className="w-full py-3 bg-indigo-600 text-white border-2 border-indigo-600 rounded-xl font-bold hover:bg-white hover:text-indigo-600 transition-all shadow-sm"
                  >
                    Join Group
                  </button>
                </div>
              ))}
            </div>
            {availableGroups.length === 0 && dbUser?.college && (
              <div className="text-center py-16 bg-slate-50/50 rounded-lg border border-slate-200 mx-auto max-w-md">
                <p className="text-slate-400 font-bold text-base mb-2">
                  No groups found yet
                </p>
                <p className="text-slate-400 text-sm">
                  Be the first to create a group for {dbUser.college}!
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col h-full bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
              {activeTab === "groups" && (
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="m-4 py-3 bg-indigo-600/10 text-indigo-600 rounded-xl font-bold hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2 border border-indigo-200 shadow-sm"
                >
                  <span className="text-lg">+</span> Create New Group
                </button>
              )}
              <ChatList
                chats={activeTab === "dm" ? chats : groups}
                activeChat={activeChat}
                onSelectChat={handleSelectChat}
                unreadCounts={unreadCounts}
              />
            </div>
            <ChatWindow
              socket={socket}
              activeChat={activeChat}
              messages={messages}
              onSendMessage={handleSendMessage}
              loadingMessages={loadingMessages}
              onUpdateMeetingLink={async (link) => {
                try {
                  if (link) {
                    await api.put(
                      `/api/chats/groups/${activeChat.id}/meeting`,
                      { meetingLink: link },
                    );
                  } else {
                    await api.delete(
                      `/api/chats/groups/${activeChat.id}/meeting`,
                    );
                  }
                  setActiveChat((prev) => ({ ...prev, meeting_link: link }));
                  setGroups((prev) =>
                    prev.map((g) =>
                      g.id === activeChat.id ? { ...g, meeting_link: link } : g,
                    ),
                  );
                  socket.emit("update_meeting_link", {
                    groupId: activeChat.id,
                    meetingLink: link,
                  });
                } catch (err) {
                  alert("Failed to update meeting status");
                }
              }}
              isCreator={activeChat?.creator_id === dbUser?.id}
              isAdmin={userRole === "admin" || userRole === "instructor"}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              currentUser={dbUser}
              onLeaveGroup={handleLeaveGroup}
              onDeleteGroup={handleDeleteGroup}
              onReact={handleReact}
              onRemoveReaction={handleRemoveReaction}
            />
          </>
        )}
      </div>

      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in">
            <h3 className="text-2xl font-bold mb-6 text-slate-800">
              Create Study Group
            </h3>
            {!dbUser?.college && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 p-4 rounded-lg mb-6 text-sm font-medium">
                ⚠️ You must set your college in Profile Settings before creating
                a group.
              </div>
            )}
            <form onSubmit={handleCreateGroup} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">
                  Group Name
                </label>
                <input
                  required
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Stanford AI Ethics"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">
                  Description
                </label>
                <textarea
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                  rows="3"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="What's this group about?"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!dbUser?.college}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentChat;